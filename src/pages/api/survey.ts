// ホームページについてのアンケートの受付（POST /api/survey。survey.html のフォームを main.js の initSurvey が送る）。
//
// 1. 受付期間（src/data/survey.js の opensAt〜closesAt）の外なら断る（closed）。
// 2. 入力を確かめる（選択肢は決まったものだけ・必須・長さ）。ボット避けに、見えない欄（website）に何か入っていたら
//    受け付けたふりをして捨てる。他のサイトからの送信（Origin が違う）は断る。同じ送信元からの連投は 10 分に 5 件まで。
// 3. D1 の survey_responses に保存する（アンケートの番号 survey_id ごと）。読み出しは /api/survey-results（鍵が要る）。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { SURVEY, ROLES, DEVICES, RATINGS, PAGES, KINDS, LIMITS, surveyOpen } from '../../data/survey.js';

export const prerender = false;

type Env = { DB: D1Database };

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function ensureSurveyTable(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    role TEXT, device TEXT, rating INTEGER,
    pages TEXT NOT NULL DEFAULT '[]', kinds TEXT NOT NULL DEFAULT '[]',
    body TEXT NOT NULL, place TEXT, name TEXT,
    ip TEXT, ua TEXT
  )`).run();
}

export const POST: APIRoute = async ({ request, url }) => {
  const e = env as unknown as Env;

  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json(403, { ok: false, error: 'forbidden' });
  if (!surveyOpen()) return json(403, { ok: false, error: 'closed' });

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json(400, { ok: false, error: 'bad_request' });
  }
  const str = (k: string) => String(input[k] ?? '').trim();
  const list = (k: string, allowed: string[]) =>
    [...new Set((Array.isArray(input[k]) ? input[k] as unknown[] : []).map((v) => String(v)).filter((v) => allowed.includes(v)))];

  // ボット避けの見えない欄に何か入っていたら、受け付けたふりをして捨てる
  if (str('website')) return json(200, { ok: true });

  const f = {
    role: str('role'),
    device: str('device'),
    rating: Number(str('rating')),
    pages: list('pages', PAGES),
    kinds: list('kinds', KINDS),
    body: str('body'),
    place: str('place'),
    name: str('name'),
  };
  const bad: string[] = [];
  if (f.role && !ROLES.includes(f.role)) bad.push('role');
  if (f.device && !DEVICES.includes(f.device)) bad.push('device');
  if (!RATINGS.some((r) => r.value === f.rating)) bad.push('rating');
  if (!f.kinds.length) bad.push('kinds');
  if (!f.body) bad.push('body');
  if (f.body.length > LIMITS.body) bad.push('body');
  if (f.place.length > LIMITS.place) bad.push('place');
  if (f.name.length > LIMITS.name) bad.push('name');
  if (bad.length) return json(400, { ok: false, error: 'invalid', fields: [...new Set(bad)] });

  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 300);
  const now = new Date().toISOString();

  try {
    await ensureSurveyTable(e.DB);
    if (ip) {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const row = await e.DB.prepare('SELECT COUNT(*) AS n FROM survey_responses WHERE ip = ? AND created_at > ?').bind(ip, since).first<{ n: number }>();
      if ((row?.n ?? 0) >= 5) return json(429, { ok: false, error: 'too_many' });
    }
    const r = await e.DB.prepare(
      'INSERT INTO survey_responses (survey_id, created_at, role, device, rating, pages, kinds, body, place, name, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(SURVEY.id, now, f.role, f.device, f.rating, JSON.stringify(f.pages), JSON.stringify(f.kinds), f.body, f.place, f.name, ip, ua).run();
    return json(200, { ok: true, id: Number(r.meta?.last_row_id ?? 0) || null });
  } catch (err) {
    console.error('survey: save failed', err);
    return json(500, { ok: false, error: 'save_failed' });
  }
};

export const ALL: APIRoute = () => json(405, { ok: false, error: 'method_not_allowed' });
