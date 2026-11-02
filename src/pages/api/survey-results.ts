// アンケートの回答の読み出し（GET /api/survey-results）。協会の担当者と Claude Code が集計に使う。
//
// ■ 鍵（合言葉）
//   鍵そのものはリポジトリにも Cloudflare にも置かない。wrangler.jsonc の vars.SURVEY_KEY_SHA256 に
//   「鍵の SHA-256（16進）」だけを置き、送られてきた鍵を同じように変換して一致したら読ませる
//   （リポジトリは公開なので、元に戻せない形だけを置く）。
//   鍵は  Authorization: Bearer <鍵>  で送る。表計算ソフトで開くときなどは ?key=<鍵> でもよい。
//
// ■ 返すもの
//   ?survey=<番号>（無ければ今のアンケート src/data/survey.js の id）
//   既定は JSON：{ survey, count, rating: { avg, dist }, byRole, byDevice, byPage, byKind, responses: [...] }
//   ?format=csv で CSV（Excel でそのまま開けるよう UTF-8 の BOM 付き）
//   送信元の IP・端末の情報（ua）は返さない。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { SURVEY, ROLES, DEVICES, RATINGS, PAGES, KINDS } from '../../data/survey.js';
import { ensureSurveyTable } from './survey';

export const prerender = false;

type Env = { DB: D1Database; SURVEY_KEY_SHA256?: string };
type Row = { id: number; created_at: string; role: string; device: string; rating: number; pages: string; kinds: string; body: string; place: string; name: string };

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const sha256 = async (text: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** 日本時間の「2026-11-02 10:15」 */
const jst = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const parse = (s: string) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };

/** 選択肢ごとの件数（選択肢の順。選ばれなかったものも 0 で出す） */
const tally = (values: string[], options: string[]) => {
  const out: Record<string, number> = Object.fromEntries(options.map((o) => [o, 0]));
  for (const v of values) if (v) out[v] = (out[v] ?? 0) + 1;
  return out;
};

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = async ({ request, url }) => {
  const e = env as unknown as Env;
  const expected = String(e.SURVEY_KEY_SHA256 ?? '').toLowerCase();
  const auth = request.headers.get('authorization') ?? '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (url.searchParams.get('key') ?? '').trim();
  if (!expected || !key || (await sha256(key)) !== expected) return json(401, { ok: false, error: 'unauthorized' });

  const surveyId = url.searchParams.get('survey') || SURVEY.id;
  await ensureSurveyTable(e.DB);
  const { results } = await e.DB.prepare(
    'SELECT id, created_at, role, device, rating, pages, kinds, body, place, name FROM survey_responses WHERE survey_id = ? ORDER BY id',
  ).bind(surveyId).all<Row>();

  const responses = (results ?? []).map((r) => ({
    id: r.id,
    at: jst(r.created_at),
    role: r.role || '',
    device: r.device || '',
    rating: r.rating,
    pages: parse(r.pages),
    kinds: parse(r.kinds),
    body: r.body,
    place: r.place || '',
    name: r.name || '',
  }));

  if (url.searchParams.get('format') === 'csv') {
    const head = ['番号', '日時', '立場', '端末', '使いやすさ(1-5)', 'ページ', 'ご意見の種類', 'ご意見', '修正が必要な場所', 'お名前'];
    const lines = [head, ...responses.map((r) => [r.id, r.at, r.role, r.device, r.rating, r.pages.join('／'), r.kinds.join('／'), r.body, r.place, r.name])]
      .map((row) => row.map(csvCell).join(','));
    return new Response('﻿' + lines.join('\r\n') + '\r\n', {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="survey-${surveyId}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }

  const ratings = responses.map((r) => r.rating).filter((n) => n >= 1 && n <= 5);
  return json(200, {
    ok: true,
    survey: { id: surveyId, title: SURVEY.title, period: SURVEY.periodLabel, closesAt: SURVEY.closesAt },
    count: responses.length,
    rating: {
      avg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : null,
      dist: Object.fromEntries(RATINGS.map((r) => [`${r.value} ${r.label}`, ratings.filter((n) => n === r.value).length])),
    },
    byRole: tally(responses.map((r) => r.role), ROLES),
    byDevice: tally(responses.map((r) => r.device), DEVICES),
    byPage: tally(responses.flatMap((r) => r.pages), PAGES),
    byKind: tally(responses.flatMap((r) => r.kinds), KINDS),
    responses,
  });
};
