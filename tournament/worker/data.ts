// 大会データの置き場（Cloudflare D1）。GitHub Pages 版が Google ドライブのフォルダに置いていた Excel・バックアップを、ここに置く。
//
//   GET    /api/data/files?kind=<種類>          … その種類のファイルの一覧（新しい順）
//   GET    /api/data/files/<id>                 … ファイルの中身
//   PUT    /api/data/files?kind=<種類>&name=<名前> … ファイルを置く（同じ種類・同じ名前があれば上書き）。中身はそのまま本文で送る
//   DELETE /api/data/files/<id>                 … ファイルを消す
//
// 種類（kind）は Google ドライブのフォルダと 1 対 1:
//   tournament（大会一覧。大会日程表とドロー Excel）・schedule（時間割）・furigana（ふりがな一覧）・
//   affiliation（所属一覧）・backup（バックアップ JSON）・result（大会結果）
//
// 使える人:
//   ・役員（運営画面から。Cookie の証明を毎回確かめる。書き込みはこのサイトの画面からだけ）
//   ・外からデータを送る仕組み（Authorization: Bearer <送信用の鍵>）。鍵そのものは置かず、SHA-256 だけを
//     Worker の秘密 DATA_PUSH_TOKEN_SHA256 に入れる（scripts/data.mjs が入れる）
//
// D1 の 1 行は 2 MB までなので、中身は 1 MB ずつに分けて data_chunks に入れる。表は最初に使うときに作る。
import type { Env } from './index';
import { officerOf, sameOrigin } from './auth';

export const KINDS = ['tournament', 'schedule', 'furigana', 'affiliation', 'backup', 'result'] as const;
type Kind = (typeof KINDS)[number];

const CHUNK = 1024 * 1024;
/** 1 ファイルの上限。大会の Excel・バックアップには十分 */
const MAX_SIZE = 25 * 1024 * 1024;

let schemaReady: Promise<void> | null = null;

function ensureSchema(db: D1Database): Promise<void> {
  schemaReady ??= db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS data_files (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        UNIQUE (kind, name)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS data_chunks (
        file_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        body BLOB NOT NULL,
        PRIMARY KEY (file_id, seq)
      )`),
    ])
    .then(() => undefined)
    .catch((err) => {
      schemaReady = null;
      throw err;
    });
  return schemaReady;
}

interface FileRow { id: string; kind: string; name: string; mime: string; size: number; updated_at: string; updated_by: string }

function toListItem(r: FileRow) {
  return { id: r.id, name: r.name, size: String(r.size), modifiedTime: r.updated_at, mimeType: r.mime, updatedBy: r.updated_by };
}

/** 誰が呼んだか。役員なら email、送信用の鍵なら 'push'。どちらでもなければ null */
async function caller(request: Request, env: Env, url: URL, write: boolean): Promise<string | null> {
  const auth = request.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    const want = (env.DATA_PUSH_TOKEN_SHA256 ?? '').trim().toLowerCase();
    if (!want) return null;
    const got = await sha256Hex(auth.slice(7).trim());
    return timingSafeEqual(got, want) ? 'push' : null;
  }
  if (write && !sameOrigin(request, url)) return null;
  const officer = await officerOf(request, env, url);
  return officer?.email ?? null;
}

export async function handleData(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.DATA) return json({ error: 'データベース（DATA）が設定されていません' }, 503);
  const write = request.method !== 'GET' && request.method !== 'HEAD';
  const who = await caller(request, env, url, write);
  if (!who) return json({ error: '役員ログインが必要です' }, 401);
  await ensureSchema(env.DATA);

  const rest = url.pathname.replace(/^\/api\/data\/files\/?/, '');
  const id = rest ? decodeURIComponent(rest) : '';

  if (!id && request.method === 'GET') {
    const kind = url.searchParams.get('kind') ?? '';
    if (kind && !isKind(kind)) return json({ error: 'kind が不正です' }, 400);
    const stmt = kind
      ? env.DATA.prepare('SELECT * FROM data_files WHERE kind = ? ORDER BY updated_at DESC, name').bind(kind)
      : env.DATA.prepare('SELECT * FROM data_files ORDER BY kind, updated_at DESC, name');
    const { results } = await stmt.all<FileRow>();
    return json({ files: results.map((r) => ({ ...toListItem(r), kind: r.kind })) });
  }

  if (!id && request.method === 'PUT') {
    const kind = url.searchParams.get('kind') ?? '';
    const name = (url.searchParams.get('name') ?? '').trim();
    if (!isKind(kind)) return json({ error: 'kind が不正です' }, 400);
    if (!name || name.length > 200 || /[\\/]/.test(name) || [...name].some((c) => c.charCodeAt(0) < 0x20)) return json({ error: 'name が不正です' }, 400);
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength === 0) return json({ error: '中身が空です' }, 400);
    if (body.byteLength > MAX_SIZE) return json({ error: `1 ファイル ${MAX_SIZE / 1024 / 1024} MB までです` }, 413);
    const mime = (request.headers.get('Content-Type') ?? '').split(';')[0].trim() || guessMime(name);
    const file = await putFile(env.DATA, kind, name, mime, body, who);
    return json({ file: toListItem(file) });
  }

  if (id && request.method === 'GET') {
    const file = await env.DATA.prepare('SELECT * FROM data_files WHERE id = ?').bind(id).first<FileRow>();
    if (!file) return json({ error: 'ファイルがありません' }, 404);
    const { results } = await env.DATA.prepare('SELECT body FROM data_chunks WHERE file_id = ? ORDER BY seq').bind(id).all<{ body: ArrayBuffer }>();
    const out = new Uint8Array(file.size);
    let at = 0;
    for (const c of results) {
      const part = new Uint8Array(c.body);
      out.set(part, at);
      at += part.byteLength;
    }
    return new Response(out, {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (id && request.method === 'DELETE') {
    await env.DATA.batch([
      env.DATA.prepare('DELETE FROM data_chunks WHERE file_id = ?').bind(id),
      env.DATA.prepare('DELETE FROM data_files WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}

async function putFile(db: D1Database, kind: Kind, name: string, mime: string, body: Uint8Array, who: string): Promise<FileRow> {
  const existing = await db.prepare('SELECT id FROM data_files WHERE kind = ? AND name = ?').bind(kind, name).first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [db.prepare('DELETE FROM data_chunks WHERE file_id = ?').bind(id)];
  for (let seq = 0, at = 0; at < body.byteLength; seq++, at += CHUNK) {
    stmts.push(db.prepare('INSERT INTO data_chunks (file_id, seq, body) VALUES (?, ?, ?)').bind(id, seq, body.slice(at, at + CHUNK)));
  }
  stmts.push(
    db
      .prepare(`INSERT INTO data_files (id, kind, name, mime, size, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET mime = excluded.mime, size = excluded.size, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(id, kind, name, mime, body.byteLength, now, who),
  );
  // batch は 1 つのトランザクションで走る（途中で失敗すれば何も変わらない）
  await db.batch(stmts);
  return { id, kind, name, mime, size: body.byteLength, updated_at: now, updated_by: who };
}

function isKind(k: string): k is Kind {
  return (KINDS as readonly string[]).includes(k);
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
