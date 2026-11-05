// 大会運営のデータベース（Cloudflare D1）。ファイルではなく、画面と AI がそのまま読み書きできる形（JSON）で持つ。
//
//   GET    /api/catalog          … 運営できる大会の一覧（軽い要約）と辞書の件数・版。ログインした画面が最初に読む
//   GET    /api/catalog/<id>     … 大会 1 件の全部（種目・ドロー・時刻・シード）。「この大会で運営する」で読む
//   PUT    /api/catalog/<id>     … 大会を置く（同じ id は上書き）。本文は GET と同じ形（schema は /api/schema）
//   DELETE /api/catalog/<id>
//   GET    /api/dict             … 選手のふりがな・所属のふりがな（全部）。ログインした画面が自動で取り込む
//   PUT    /api/dict             … 辞書を置く。{ mode: 'merge' | 'replace', players?: [...], affiliations?: [...] }
//   GET    /api/schema           … 上の形の説明（AI・スクリプト向け。ログイン不要）
//
// 使えるのは役員（書き込みはこのサイトの画面からだけ）と、外から送る仕組みの送信用の鍵（worker/data.ts と同じ）。
import type { Env } from './index';
import { caller } from './data';

const STATUSES = ['planned', 'ready', 'done'] as const;
type Status = (typeof STATUSES)[number];

let schemaReady: Promise<void> | null = null;
function ensureSchema(db: D1Database): Promise<void> {
  schemaReady ??= db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS catalog_tournaments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        date TEXT NOT NULL DEFAULT '',
        venue TEXT NOT NULL DEFAULT '',
        reserve_date TEXT NOT NULL DEFAULT '',
        reserve_venue TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '{}',
        draw TEXT,
        settings TEXT NOT NULL DEFAULT '{}',
        source TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )`),
      // 辞書は 1 つの JSON 文書（k = 'dict'）。D1 の 1 回あたりの問い合わせ数の上限（Free は 50）に収めるため、1 行で読み書きする
      db.prepare(`CREATE TABLE IF NOT EXISTS catalog_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT '')`),
    ])
    .then(() => undefined)
    .catch((err) => {
      schemaReady = null;
      throw err;
    });
  return schemaReady;
}

// ---------------------------------------------------------------------------
// 形（GET と PUT で同じ）
// ---------------------------------------------------------------------------

interface DrawPlayer { position: number; name: string; affiliation: string; seed?: number; partnerName?: string; partnerAffiliation?: string }
interface RoundRule { roundLabel: string; ruleText: string; games: number; matchFormat?: string; heatRuleText?: string; heatGames?: number; heatMatchFormat?: string }
interface DrawEvent {
  eventName: string; type: 'Singles' | 'Doubles'; drawSize: number; isRoundRobin?: boolean; matchFormat?: string;
  players: DrawPlayer[]; roundGameRules?: RoundRule[]; matchTimes?: Record<string, string>; roundMatchTimes?: Record<string, string>; eventStartTime?: string;
}
interface TournamentBody {
  name: string; date?: string; venue?: string; reserveDate?: string; reserveVenue?: string; category?: string;
  status?: Status; note?: string; source?: string;
  settings?: { courtNames?: string[]; startTime?: string };
  draw?: { events: DrawEvent[]; earliestStartTime?: string; suggestedCourtCount?: number } | null;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^\d{2}:\d{2}$/;

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** 本文を確かめて整える。だめなら理由の文 */
function validateTournament(b: unknown): TournamentBody | string {
  if (!b || typeof b !== 'object') return '本文が JSON のオブジェクトではありません';
  const o = b as Record<string, unknown>;
  const name = str(o.name);
  if (!name) return 'name（大会名）が要ります';
  const date = str(o.date, 10);
  if (date && !DATE_RE.test(date)) return 'date は YYYY-MM-DD で書いてください';
  const reserveDate = str(o.reserveDate, 10);
  if (reserveDate && !DATE_RE.test(reserveDate)) return 'reserveDate は YYYY-MM-DD で書いてください';
  const out: TournamentBody = {
    name, date, venue: str(o.venue), reserveDate, reserveVenue: str(o.reserveVenue), category: str(o.category),
    note: str(o.note, 1000), source: str(o.source),
  };
  const s = o.settings as Record<string, unknown> | undefined;
  if (s && typeof s === 'object') {
    const courtNames = Array.isArray(s.courtNames) ? s.courtNames.map((c) => str(c, 20)).filter(Boolean).slice(0, 64) : undefined;
    const startTime = str(s.startTime, 5);
    if (startTime && !HM_RE.test(startTime)) return 'settings.startTime は HH:MM で書いてください';
    out.settings = { ...(courtNames?.length ? { courtNames } : {}), ...(startTime ? { startTime } : {}) };
  }
  const d = o.draw as Record<string, unknown> | null | undefined;
  if (d) {
    if (!Array.isArray(d.events)) return 'draw.events が配列ではありません';
    const events: DrawEvent[] = [];
    for (const [i, e] of (d.events as Record<string, unknown>[]).entries()) {
      const eventName = str(e?.eventName);
      if (!eventName) return `draw.events[${i}].eventName が要ります`;
      const type = e.type === 'Doubles' ? 'Doubles' : 'Singles';
      const drawSize = Number(e.drawSize);
      if (!Number.isInteger(drawSize) || drawSize < 1 || drawSize > 256) return `draw.events[${i}].drawSize が不正です`;
      if (!Array.isArray(e.players)) return `draw.events[${i}].players が配列ではありません`;
      const players: DrawPlayer[] = [];
      const seen = new Set<number>();
      for (const p of e.players as Record<string, unknown>[]) {
        const position = Number(p?.position);
        const pname = str(p?.name, 60);
        if (!pname) continue; // BYE は書かない
        if (!Number.isInteger(position) || position < 1 || position > drawSize) return `draw.events[${i}] の ${pname} の position が 1〜${drawSize} ではありません`;
        if (seen.has(position)) return `draw.events[${i}] の position ${position} が重複しています`;
        seen.add(position);
        players.push({
          position, name: pname, affiliation: str(p.affiliation, 60),
          ...(Number(p.seed) > 0 ? { seed: Number(p.seed) } : {}),
          ...(type === 'Doubles' && str(p.partnerName, 60) ? { partnerName: str(p.partnerName, 60), partnerAffiliation: str(p.partnerAffiliation, 60) } : {}),
        });
      }
      if (players.length === 0) return `draw.events[${i}]（${eventName}）に選手がいません`;
      const times = (v: unknown) => {
        const r: Record<string, string> = {};
        if (v && typeof v === 'object') for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (typeof t === 'string' && HM_RE.test(t)) r[k] = t;
        return r;
      };
      events.push({
        eventName, type, drawSize, isRoundRobin: e.isRoundRobin === true, matchFormat: str(e.matchFormat),
        players: players.sort((a, b) => a.position - b.position),
        roundGameRules: Array.isArray(e.roundGameRules) ? (e.roundGameRules as RoundRule[]).slice(0, 10) : [],
        matchTimes: times(e.matchTimes), roundMatchTimes: times(e.roundMatchTimes),
        ...(str(e.eventStartTime, 5) && HM_RE.test(str(e.eventStartTime, 5)) ? { eventStartTime: str(e.eventStartTime, 5) } : {}),
      });
    }
    out.draw = {
      events,
      ...(HM_RE.test(str(d.earliestStartTime, 5)) ? { earliestStartTime: str(d.earliestStartTime, 5) } : {}),
      ...(Number(d.suggestedCourtCount) > 0 ? { suggestedCourtCount: Number(d.suggestedCourtCount) } : {}),
    };
  } else {
    out.draw = null;
  }
  const status = str(o.status) as Status;
  out.status = (STATUSES as readonly string[]).includes(status) ? status : out.draw ? 'ready' : 'planned';
  if (out.status === 'ready' && !out.draw) return 'status が ready（運営できる）なら draw（ドロー）が要ります';
  return out;
}

function summaryOf(t: TournamentBody) {
  const events = (t.draw?.events ?? []).map((e) => ({
    name: e.eventName, type: e.type, drawSize: e.drawSize, players: e.players.length, isRoundRobin: !!e.isRoundRobin,
  }));
  return { events, players: events.reduce((s, e) => s + e.players, 0) };
}

interface Row {
  id: string; name: string; date: string; venue: string; reserve_date: string; reserve_venue: string; category: string;
  status: string; summary: string; draw: string | null; settings: string; source: string; note: string; updated_at: string; updated_by: string;
}

function toItem(r: Row, withDraw: boolean) {
  const summary = JSON.parse(r.summary || '{}');
  return {
    id: r.id, name: r.name, date: r.date, venue: r.venue, reserveDate: r.reserve_date, reserveVenue: r.reserve_venue,
    category: r.category, status: r.status, note: r.note, source: r.source,
    settings: JSON.parse(r.settings || '{}'), events: summary.events ?? [], players: summary.players ?? 0,
    updatedAt: r.updated_at, updatedBy: r.updated_by,
    ...(withDraw ? { draw: r.draw ? JSON.parse(r.draw) : null } : {}),
  };
}

interface DictPlayer { name: string; furigana: string; affiliation?: string; note?: string }
interface DictAff { name: string; furigana: string }
interface DictDoc { version: string; players: DictPlayer[]; affiliations: DictAff[] }

async function readDict(db: D1Database): Promise<DictDoc> {
  const r = await db.prepare(`SELECT v FROM catalog_meta WHERE k = 'dict'`).first<{ v: string }>();
  if (!r) return { version: '', players: [], affiliations: [] };
  return JSON.parse(r.v) as DictDoc;
}

const keyOf = (name: string) => name.replace(/[\s\u3000]+/g, '');

// ---------------------------------------------------------------------------

export async function handleCatalog(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === '/api/schema') return json(SCHEMA);
  if (!env.DATA) return json({ error: 'データベース（DATA）が設定されていません' }, 503);
  const write = request.method !== 'GET' && request.method !== 'HEAD';
  const who = await caller(request, env, url, write);
  if (!who) return json({ error: '役員ログインが必要です' }, 401);
  await ensureSchema(env.DATA);
  const db = env.DATA;

  if (url.pathname === '/api/dict') {
    if (request.method === 'GET') return json(await readDict(db));
    if (request.method === 'PUT') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return json({ error: '本文が JSON ではありません' }, 400);
      const mode = body.mode === 'replace' ? 'replace' : 'merge';
      const cur = await readDict(db);
      const players = new Map<string, DictPlayer>(mode === 'replace' && Array.isArray(body.players) ? [] : cur.players.map((p) => [keyOf(p.name), p]));
      const affs = new Map<string, DictAff>(mode === 'replace' && Array.isArray(body.affiliations) ? [] : cur.affiliations.map((a) => [a.name, a]));
      let np = 0, na = 0;
      for (const p of (Array.isArray(body.players) ? body.players : []) as Record<string, unknown>[]) {
        const name = str(p?.name, 60), furigana = str(p?.furigana, 80);
        if (!name || !furigana) continue;
        players.set(keyOf(name), { name, furigana, ...(str(p.affiliation, 60) ? { affiliation: str(p.affiliation, 60) } : {}), ...(str(p.note, 200) ? { note: str(p.note, 200) } : {}) });
        np++;
      }
      for (const a of (Array.isArray(body.affiliations) ? body.affiliations : []) as Record<string, unknown>[]) {
        const name = str(a?.name, 60), furigana = str(a?.furigana, 80);
        if (!name || !furigana) continue;
        affs.set(name, { name, furigana });
        na++;
      }
      for (const n of (Array.isArray(body.removePlayers) ? body.removePlayers : [])) players.delete(keyOf(String(n)));
      const byKana = (a: { furigana: string }, b: { furigana: string }) => a.furigana.localeCompare(b.furigana, 'ja');
      const doc: DictDoc = { version: new Date().toISOString(), players: [...players.values()].sort(byKana), affiliations: [...affs.values()].sort(byKana) };
      await db.prepare(`INSERT INTO catalog_meta (k, v, updated_at) VALUES ('dict', ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`)
        .bind(JSON.stringify(doc), doc.version).run();
      return json({ ok: true, mode, changed: { players: np, affiliations: na }, total: { players: doc.players.length, affiliations: doc.affiliations.length }, version: doc.version });
    }
    return json({ error: 'GET か PUT で呼んでください' }, 405);
  }

  const rest = url.pathname.replace(/^\/api\/catalog\/?/, '');
  const id = rest ? decodeURIComponent(rest) : '';

  if (!id) {
    if (request.method !== 'GET') return json({ error: 'GET で呼んでください' }, 405);
    const [{ results }, dict] = await Promise.all([
      db.prepare(`SELECT id, name, date, venue, reserve_date, reserve_venue, category, status, summary, NULL AS draw, settings, source, note, updated_at, updated_by
        FROM catalog_tournaments ORDER BY date, name`).all<Row>(),
      readDict(db),
    ]);
    return json({ tournaments: results.map((r) => toItem(r, false)), dict: { players: dict.players.length, affiliations: dict.affiliations.length, version: dict.version } });
  }

  if (!ID_RE.test(id)) return json({ error: 'id は英小文字・数字・ハイフンで書いてください（例 r8-kensen-singles）' }, 400);

  if (request.method === 'GET') {
    const r = await db.prepare('SELECT * FROM catalog_tournaments WHERE id = ?').bind(id).first<Row>();
    return r ? json(toItem(r, true)) : json({ error: 'その大会はありません' }, 404);
  }
  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    const t = validateTournament(body);
    if (typeof t === 'string') return json({ error: t }, 400);
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO catalog_tournaments (id, name, date, venue, reserve_date, reserve_venue, category, status, summary, draw, settings, source, note, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, date = excluded.date, venue = excluded.venue, reserve_date = excluded.reserve_date,
        reserve_venue = excluded.reserve_venue, category = excluded.category, status = excluded.status, summary = excluded.summary, draw = excluded.draw,
        settings = excluded.settings, source = excluded.source, note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(id, t.name, t.date ?? '', t.venue ?? '', t.reserveDate ?? '', t.reserveVenue ?? '', t.category ?? '', t.status!, JSON.stringify(summaryOf(t)),
        t.draw ? JSON.stringify(t.draw) : null, JSON.stringify(t.settings ?? {}), t.source ?? '', t.note ?? '', now, who)
      .run();
    const r = await db.prepare('SELECT * FROM catalog_tournaments WHERE id = ?').bind(id).first<Row>();
    return json(toItem(r!, false));
  }
  if (request.method === 'DELETE') {
    await db.prepare('DELETE FROM catalog_tournaments WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** AI・スクリプト向けの説明（GET /api/schema） */
const SCHEMA = {
  about: '鳥取市テニス協会 大会運営システムのデータベース。大会（ドロー込み）と、選手・所属のふりがな辞書を JSON で読み書きする。',
  auth: '役員ログインの Cookie（このサイトの画面から）か、Authorization: Bearer <送信用の鍵>（tournament/scripts/data.mjs token で作る）',
  endpoints: {
    'GET /api/catalog': '大会の一覧（draw を除いた要約）と辞書の件数',
    'GET /api/catalog/{id}': '大会 1 件（draw を含む）',
    'PUT /api/catalog/{id}': '大会を置く（上書き）。本文は tournament の形',
    'DELETE /api/catalog/{id}': '大会を消す',
    'GET /api/dict': '辞書（players・affiliations）',
    'PUT /api/dict': '{ mode: "merge" | "replace", players?: player[], affiliations?: affiliation[], removePlayers?: string[] }',
  },
  id: '英小文字・数字・ハイフン。例 r8-kensen-singles（令和8年度 県選シングルス）',
  tournament: {
    name: '大会名（正式名。大会日程表と同じ）', date: 'YYYY-MM-DD', venue: '会場', reserveDate: 'YYYY-MM-DD（予備日）', reserveVenue: '予備日の会場',
    category: '試合種目の文言（例 男女シングルス）', status: 'planned（日程だけ・ドロー未登録）| ready（運営できる）| done（終わった）',
    note: 'メモ（確認事項など）', source: 'どこから作ったか（例 サイトのドロー画像から）',
    settings: { courtNames: '使うコート名の配列（例 ["1","2",…,"16"]）', startTime: '最初の試合の時刻 HH:MM' },
    draw: {
      events: [{
        eventName: '種目名（例 一般男子シングルス）', type: 'Singles | Doubles', drawSize: 'ドローの枠数（2 の累乗。リーグは人数）', isRoundRobin: 'リーグ戦なら true',
        matchFormat: '試合形式の文言', players: [{ position: '枠番号 1〜drawSize（BYE の枠は書かない）', name: '氏名（姓と名の間に空白）', affiliation: '所属', seed: 'シード番号（任意）', partnerName: 'ダブルスの相方', partnerAffiliation: '相方の所属' }],
        roundGameRules: [{ roundLabel: '全回戦 | 1・2回戦 | 準決勝・決勝 …', ruleText: '8ゲームマッチ（8-8タイブレーク）', games: 8, matchFormat: '3セットのときだけ twoSetsSuper10' }],
        matchTimes: '1回戦の開始時刻 { 上側の枠番号: "HH:MM" }', roundMatchTimes: '2回戦以降の開始時刻 { "R{回戦}-{その回戦の何試合目}": "HH:MM" }（左山の上から数える）',
      }],
    },
  },
  player: { name: '氏名', furigana: 'ひらがな（姓と名の間に空白）', affiliation: '所属（任意）', note: '確認メモ（任意。読みに自信がないときなど）' },
  affiliation: { name: '所属名（表記ゆれは別の行に）', furigana: 'ひらがな' },
};
