// お問い合わせフォームの送信先（POST /api/contact。contact.html のフォームを main.js の initForm が送る）。
//
// 1. 入力を確かめる（必須・長さ・メールアドレスの形）。ボット避けに、見えない欄（website）に何か入っていたら
//    受け付けたふりをして捨てる。他のサイトからの送信（Origin が違う）は断る。同じ送信元からの連投は 10 分に 5 件まで。
// 2. 届いた内容を D1 の contact_messages に必ず保存する（メールが送れなくても失われないように）。
// 3. Resend（メール送信サービス）で協会のアドレス（CONTACT_TO）へ送る。返信先（Reply-To）は送った人のアドレス。
//    鍵（RESEND_API_KEY）は Cloudflare の Worker の「シークレット」に入れる（docs/contact.md）。
//    鍵が無い・送信に失敗したときも、保存できていれば受け付けたことにする（mailed: false。保存分は後から読める）。
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

type Env = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
};

const LIMITS = { name: 60, kana: 60, email: 200, type: 40, event: 100, body: 5000 };
const TYPES = ['大会について', '協会登録について', '水曜テニス教室について', 'コートについて', 'その他'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function ensureTable(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    name TEXT NOT NULL, kana TEXT, email TEXT NOT NULL, type TEXT NOT NULL, event TEXT, body TEXT NOT NULL,
    ip TEXT, ua TEXT, mailed INTEGER NOT NULL DEFAULT 0, mail_error TEXT
  )`).run();
}

export const POST: APIRoute = async ({ request, url }) => {
  const e = env as unknown as Env;

  // 他のサイトからの送信は断る
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json(403, { ok: false, error: 'forbidden' });

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json(400, { ok: false, error: 'bad_request' });
  }
  const str = (k: string) => String(input[k] ?? '').trim();

  // ボット避けの見えない欄に何か入っていたら、受け付けたふりをして捨てる
  if (str('website')) return json(200, { ok: true });

  const f = { name: str('name'), kana: str('kana'), email: str('email'), type: str('type'), event: str('event'), body: str('body') };
  const bad: string[] = [];
  if (!f.name) bad.push('name');
  if (!EMAIL_RE.test(f.email)) bad.push('email');
  if (!TYPES.includes(f.type)) bad.push('type');
  if (!f.body) bad.push('body');
  if (input.agree !== true && input.agree !== 'on') bad.push('agree');
  for (const [k, max] of Object.entries(LIMITS)) if (f[k as keyof typeof f].length > max) bad.push(k);
  if (bad.length) return json(400, { ok: false, error: 'invalid', fields: bad });

  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 300);
  const now = new Date().toISOString();

  // 保存（ここが失敗したら受け付けられないので、エラーを返す）
  let id: number | null = null;
  try {
    await ensureTable(e.DB);
    if (ip) {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const row = await e.DB.prepare('SELECT COUNT(*) AS n FROM contact_messages WHERE ip = ? AND created_at > ?').bind(ip, since).first<{ n: number }>();
      if ((row?.n ?? 0) >= 5) return json(429, { ok: false, error: 'too_many' });
    }
    const r = await e.DB.prepare(
      'INSERT INTO contact_messages (created_at, name, kana, email, type, event, body, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(now, f.name, f.kana, f.email, f.type, f.event, f.body, ip, ua).run();
    id = Number(r.meta?.last_row_id ?? 0) || null;
  } catch (err) {
    console.error('contact: save failed', err);
    return json(500, { ok: false, error: 'save_failed' });
  }

  // メールで送る
  let mailed = false;
  let mailError = '';
  if (e.RESEND_API_KEY) {
    const jst = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(now));
    const text = [
      'ホームページのお問い合わせフォームから届きました。',
      'このメールに返信すると、お問い合わせの方に届きます。',
      '',
      `受付日時：${jst}${id ? `（受付番号 ${id}）` : ''}`,
      `お名前：${f.name}${f.kana ? `（${f.kana}）` : ''}`,
      `メールアドレス：${f.email}`,
      `お問い合わせ種別：${f.type}`,
      `該当する大会：${f.event || '—'}`,
      '',
      '― お問い合わせ内容 ―',
      f.body,
    ].join('\n');
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: e.CONTACT_FROM || '鳥取市テニス協会 ホームページ <onboarding@resend.dev>',
          to: [e.CONTACT_TO || 't.c.t.a.r7@gmail.com'],
          reply_to: f.email,
          subject: `【お問い合わせ】${f.type}｜${f.name} 様`,
          text,
        }),
      });
      mailed = res.ok;
      if (!res.ok) mailError = `${res.status} ${(await res.text()).slice(0, 300)}`;
    } catch (err) {
      mailError = String(err).slice(0, 300);
    }
    if (mailError) console.error('contact: mail failed', mailError);
  } else {
    mailError = 'RESEND_API_KEY is not set';
  }
  if (id) {
    try {
      await e.DB.prepare('UPDATE contact_messages SET mailed = ?, mail_error = ? WHERE id = ?').bind(mailed ? 1 : 0, mailError || null, id).run();
    } catch { /* 記録の更新だけなので無視 */ }
  }

  return json(200, { ok: true, mailed });
};

export const ALL: APIRoute = () => json(405, { ok: false, error: 'method_not_allowed' });
