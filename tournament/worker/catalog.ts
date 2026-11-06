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
  /** リーグ戦の専用コート（コート名。1〜2面）。端末に入れるとそのリーグのコートに固定する */
  leagueCourts?: string[];
}
interface TournamentBody {
  name: string; date?: string; venue?: string; reserveDate?: string; reserveVenue?: string; category?: string;
  status?: Status; note?: string; source?: string;
  settings?: { courtNames?: string[]; startTime?: string };
  draw?: { events: DrawEvent[]; earliestStartTime?: string; suggestedCourtCount?: number } | null;
}

// 全角の英数字・記号を半角に、半角カナを全角カナに（src/lib/halfwidth.ts と同じ。直すときは両方そろえる）。
// 大会（選手名・所属・種目名）と辞書は、どこから入れても（画面・AI・スクリプト）ここで半角にそろえて保存する
const FW = /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF03\uFF06\uFF0B\uFF0C\uFF0D\uFF0E\uFF0F\uFF1A\uFF20\uFF3F]/g;
function hw(s: string, space = false): string {
  let out = (s ?? '').replace(FW, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\uFF61-\uFF9F]+/g, (m) => m.normalize('NFKC'));
  if (space) out = out.replace(/\u3000/g, ' ').replace(/ {2,}/g, ' ').trim();
  return out;
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
      const eventName = hw(str(e?.eventName));
      if (!eventName) return `draw.events[${i}].eventName が要ります`;
      const type = e.type === 'Doubles' ? 'Doubles' : 'Singles';
      const drawSize = Number(e.drawSize);
      if (!Number.isInteger(drawSize) || drawSize < 1 || drawSize > 256) return `draw.events[${i}].drawSize が不正です`;
      if (!Array.isArray(e.players)) return `draw.events[${i}].players が配列ではありません`;
      const players: DrawPlayer[] = [];
      const seen = new Set<number>();
      for (const p of e.players as Record<string, unknown>[]) {
        const position = Number(p?.position);
        const pname = hw(str(p?.name, 60));
        if (!pname) continue; // BYE は書かない
        if (!Number.isInteger(position) || position < 1 || position > drawSize) return `draw.events[${i}] の ${pname} の position が 1〜${drawSize} ではありません`;
        if (seen.has(position)) return `draw.events[${i}] の position ${position} が重複しています`;
        seen.add(position);
        players.push({
          position, name: pname, affiliation: hw(str(p.affiliation, 60), true),
          ...(Number(p.seed) > 0 ? { seed: Number(p.seed) } : {}),
          ...(type === 'Doubles' && str(p.partnerName, 60) ? { partnerName: hw(str(p.partnerName, 60)), partnerAffiliation: hw(str(p.partnerAffiliation, 60), true) } : {}),
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
        ...(e.isRoundRobin === true && Array.isArray(e.leagueCourts) && e.leagueCourts.length > 0
          ? { leagueCourts: (e.leagueCourts as unknown[]).map((c) => hw(str(c, 20))).filter(Boolean).slice(0, 2) } : {}),
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
      // 前からある行も半角にそろえる（全角と半角で 2 行あった所属は 1 行になる）
      const players = new Map<string, DictPlayer>(mode === 'replace' && Array.isArray(body.players) ? [] : cur.players.map((p) => {
        const n = { ...p, name: hw(p.name), ...(p.affiliation ? { affiliation: hw(p.affiliation, true) } : {}) };
        return [keyOf(n.name), n];
      }));
      const affs = new Map<string, DictAff>();
      if (!(mode === 'replace' && Array.isArray(body.affiliations))) for (const a of cur.affiliations) { const n = hw(a.name, true); if (!affs.has(n)) affs.set(n, { name: n, furigana: a.furigana }); }
      let np = 0, na = 0;
      for (const p of (Array.isArray(body.players) ? body.players : []) as Record<string, unknown>[]) {
        const name = hw(str(p?.name, 60)), furigana = str(p?.furigana, 80);
        if (!name || !furigana) continue;
        const aff = hw(str(p.affiliation, 60), true);
        players.set(keyOf(name), { name, furigana, ...(aff ? { affiliation: aff } : {}), ...(str(p.note, 200) ? { note: str(p.note, 200) } : {}) });
        np++;
      }
      for (const a of (Array.isArray(body.affiliations) ? body.affiliations : []) as Record<string, unknown>[]) {
        const name = hw(str(a?.name, 60), true), furigana = str(a?.furigana, 80);
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
  // 試合結果の受け箱（/api/catalog/<id>/results）。手描きのドロー表の写真から Claude が読み取った結果などを置き、
  // 運営中の端末が取りに来て反映する（src/features/catalog/resultInbox.ts）
  const rm = rest.match(/^([^/]+)\/results$/);
  if (rm) return handleResults(request, db, decodeURIComponent(rm[1]), who);
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

// ---------------------------------------------------------------------------
// 試合結果の受け箱
//   GET    … { version, events: [{ event, matches: [{ winner, loser, score, note }] }] }
//   PUT    … 本文 { events: [...], mode?: 'merge' | 'replace', source? }。merge は同じ組み合わせ（2 人）の結果を上書きし、ほかは残す
//   DELETE … 空にする
// 名前は全角の英数字を半角にし、空白の違いは同じ人として扱う。スコアは勝った人から見た形（例 8-3、6-1 RET）
// ---------------------------------------------------------------------------
interface ResultMatch { winner: string; loser: string; score: string; note?: string }
interface ResultEvent { event: string; matches: ResultMatch[] }
interface ResultDoc { version: string; updatedBy: string; source?: string; events: ResultEvent[] }

async function handleResults(request: Request, db: D1Database, id: string, who: string): Promise<Response> {
  if (!ID_RE.test(id)) return json({ error: 'id が不正です' }, 400);
  const key = `results:${id}`;
  const read = async (): Promise<ResultDoc> => {
    const r = await db.prepare('SELECT v FROM catalog_meta WHERE k = ?').bind(key).first<{ v: string }>();
    return r ? (JSON.parse(r.v) as ResultDoc) : { version: '', updatedBy: '', events: [] };
  };
  if (request.method === 'GET') return json(await read());
  if (request.method === 'DELETE') {
    await db.prepare('DELETE FROM catalog_meta WHERE k = ?').bind(key).run();
    return json({ ok: true });
  }
  if (request.method !== 'PUT') return json({ error: 'GET・PUT・DELETE で呼んでください' }, 405);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.events)) return json({ error: '本文は { events: [{ event, matches: [{ winner, loser, score }] }] } の形で送ってください' }, 400);
  const cur = body.mode === 'replace' ? { version: '', updatedBy: '', events: [] as ResultEvent[] } : await read();
  const pairKey = (a: string, b: string) => [keyOf(a), keyOf(b)].sort().join('|');
  const byEvent = new Map<string, Map<string, ResultMatch>>();
  for (const e of cur.events) byEvent.set(keyOf(e.event), new Map(e.matches.map((m) => [pairKey(m.winner, m.loser), m])));
  const names = new Map<string, string>(cur.events.map((e) => [keyOf(e.event), e.event]));
  let n = 0;
  for (const e of body.events as Record<string, unknown>[]) {
    const ev = hw(str(e?.event, 80));
    if (!ev || !Array.isArray(e.matches)) continue;
    const k = keyOf(ev);
    names.set(k, names.get(k) ?? ev);
    const m = byEvent.get(k) ?? new Map<string, ResultMatch>();
    for (const x of e.matches as Record<string, unknown>[]) {
      const winner = hw(str(x?.winner, 60)), loser = hw(str(x?.loser, 60));
      if (!winner || !loser) continue;
      const score = hw(str(x.score, 40));
      const note = hw(str(x.note, 40));
      m.set(pairKey(winner, loser), { winner, loser, score, ...(note ? { note } : {}) });
      n++;
    }
    byEvent.set(k, m);
  }
  const doc: ResultDoc = {
    version: new Date().toISOString(), updatedBy: who, ...(str(body.source, 80) ? { source: str(body.source, 80) } : {}),
    events: [...byEvent.entries()].map(([k, m]) => ({ event: names.get(k) ?? k, matches: [...m.values()] })),
  };
  await db.prepare('INSERT INTO catalog_meta (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at')
    .bind(key, JSON.stringify(doc), doc.version).run();
  return json({ ok: true, received: n, total: doc.events.reduce((a, e) => a + e.matches.length, 0), version: doc.version });
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
        eventStartTime: 'その種目の最初の試合の時刻 HH:MM（リーグ戦など）',
        leagueCourts: 'リーグ戦の専用コート（settings.courtNames のコート名。1〜2面。例 ["2","3"]）。リーグは1リーグ＝1種目（例 男子B級ダブルス Aリーグ）。試合順は 4チーム ①-② ③-④ ①-③ ②-④ ②-③ ①-④、3チーム ①-② ②-③ ①-③',
      }],
    },
  },
  player: { name: '氏名', furigana: 'ひらがな（姓と名の間に空白）', affiliation: '所属（任意）', note: '確認メモ（任意。読みに自信がないときなど）' },
  affiliation: { name: '所属名（表記ゆれは別の行に）', furigana: 'ひらがな' },
};
