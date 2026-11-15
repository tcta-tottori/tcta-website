// 役員ログイン（Cloudflare Access）。
//
// しくみ:
//   1. Cloudflare Access の「自己ホスト型アプリケーション」でログインの入口 /auth/login だけを守る（役員のメールアドレスだけを許可）。
//      ログインはメールに届く 6 桁のコード（One-time PIN）か Google。パスワードは持たない
//   2. 役員が /auth/login を開くと、Access がログインを求め、通ったリクエストに署名付きの証明（JWT）を付けて Worker に渡す
//   3. Worker は証明を検証し、自分の Cookie（__Host-tcta_officer）に移してから元の画面へ戻す
//   4. 運営端末としての中継の接続（/ws?role=operator）・音声コール（/api/gemini-tts）・/api/me は、
//      その Cookie の証明を毎回検証する（署名・発行元・宛先・期限）。証明の期限は Access のセッションの長さ（既定 24 時間）
//   観戦ページ（/view）・観戦端末としての接続（/ws?role=viewer）・アプリのファイルは、これまでどおり誰でも開ける
//
// 設定（どれか欠けていれば「未設定」として運営の操作をすべて断る。閉じる側に倒す）:
//   ACCESS_TEAM_DOMAIN … Zero Trust のチーム名（例 tcta。tcta.cloudflareaccess.com でもよい）
//   ACCESS_AUD         … /auth のアプリケーションの Application Audience (AUD) Tag
//   OFFICER_EMAILS     … 任意。カンマ区切りのメールアドレス。入れると、Access を通っても ここに無い人は断る（二重の鍵）
//
// 手元の確認だけは AUTH_MODE=dev（.dev.vars）で、/auth/login に名前を入れるだけの画面を出す。
// dev は localhost / 127.0.0.1 のときしか効かない。
//
// もう 1 つの入り方：24 時間だけ使えるパスワード（worker/passAuth.ts）。メールでログインした役員が発行し、
// ログインの画面（アプリの関門・/auth/signin）でパスワードと名前を入れる（POST /auth/password）。
// パスワードの入口は Access で守らない（/auth/login だけが Access の守り）。
import type { Env } from './index';
import { endSession, issuePass, loginWithPass, passStatus, revokePass, sessionOf } from './passAuth';

export interface Officer { email: string; via: 'access' | 'dev' | 'password' }

export type AuthMode = 'access' | 'dev' | 'unconfigured';

const COOKIE = '__Host-tcta_officer';
const DEV_COOKIE = 'tcta_dev_officer';
/** パスワードでログインした証。手元（http://localhost）では __Host- の Cookie を使えないので名前を変える */
const passCookieName = (mode: AuthMode) => (mode === 'dev' ? 'tcta_dev_pass' : '__Host-tcta_pass');
const passCookieAttrs = (mode: AuthMode) => (mode === 'dev' ? 'Path=/; HttpOnly; SameSite=Lax' : 'Path=/; Secure; HttpOnly; SameSite=Lax');

export function authMode(env: Env, url: URL): AuthMode {
  if (env.AUTH_MODE === 'dev' && isLocal(url)) return 'dev';
  if (teamOrigin(env) && env.ACCESS_AUD) return 'access';
  return 'unconfigured';
}

function isLocal(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

function teamOrigin(env: Env): string | null {
  const raw = (env.ACCESS_TEAM_DOMAIN ?? '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//, '');
  if (!/^[a-z0-9-]+(\.cloudflareaccess\.com)?$/i.test(host)) return null;
  return `https://${host.includes('.') ? host : `${host}.cloudflareaccess.com`}`;
}

/** リクエストを送ってきたのが役員か。違えば null */
export async function officerOf(request: Request, env: Env, url: URL): Promise<Officer | null> {
  const mode = authMode(env, url);
  if (mode === 'unconfigured') return null;
  if (mode === 'dev') {
    const email = cookie(request, DEV_COOKIE);
    if (email && /^[^@\s]+@[^@\s]+$/.test(email)) return { email, via: 'dev' };
  } else {
    const jwt = cookie(request, COOKIE) ?? request.headers.get('Cf-Access-Jwt-Assertion') ?? undefined;
    const email = await verifyAccessJwt(env, jwt);
    if (email && allowed(env, email)) return { email, via: 'access' };
  }
  // 24 時間パスワードでログインした人
  const token = cookie(request, passCookieName(mode));
  if (token && env.DATA) {
    const s = await sessionOf(env.DATA, token).catch(() => null);
    if (s) return { email: `${s.name}（パスワード）`, via: 'password' };
  }
  return null;
}

function allowed(env: Env, email: string): boolean {
  const list = (env.OFFICER_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length === 0 || list.includes(email.toLowerCase());
}

/** 同じサイトの画面から来たか（他のサイトから役員の Cookie を使わせない） */
export function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin');
  if (origin) return origin === url.origin;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

// ---------------------------------------------------------------------------
// /auth/login・/auth/logout・/api/me
// ---------------------------------------------------------------------------

export async function handleAuth(request: Request, env: Env, url: URL): Promise<Response> {
  const mode = authMode(env, url);
  const back = safeReturn(url.searchParams.get('return'));

  if (url.pathname === '/auth/logout') {
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
    headers.append('Set-Cookie', `${DEV_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    // パスワードでのログインも終える（証を消す）
    if (mode !== 'unconfigured') {
      const token = cookie(request, passCookieName(mode));
      if (token && env.DATA) await endSession(env.DATA, token).catch(() => {});
      headers.append('Set-Cookie', `${passCookieName(mode)}=; ${passCookieAttrs(mode)}; Max-Age=0`);
    }
    // Access 側のログインも切る（次に /auth/login を開いたときにコードを聞き直す）
    headers.set('Location', mode === 'access' ? '/cdn-cgi/access/logout' : '/');
    return new Response(null, { status: 302, headers });
  }

  // ログインの入り方を選ぶ画面（メールのコード／24 時間パスワード）。期限切れの帯などから開く
  if (url.pathname === '/auth/signin') {
    if (mode === 'unconfigured') return page('役員ログインが未設定です', '<p>役員ログインの設定が入っていません。</p>', 503);
    return page('役員ログイン', `<p>登録したメールアドレスでログインするか、役員から受け取った 24 時間パスワードでログインしてください。</p>
      <p><a class="btn" href="/auth/login?return=${encodeURIComponent(back)}">メールの確認コードでログイン →</a></p>
      <h2>24 時間パスワードでログイン</h2>
      ${passForm(back)}`, 200);
  }

  // 24 時間パスワードでログインする（アプリの関門・/auth/signin のフォームから）
  if (url.pathname === '/auth/password') {
    if (request.method !== 'POST') return Response.redirect(new URL(`/auth/signin?return=${encodeURIComponent(back)}`, url).toString(), 302);
    if (mode === 'unconfigured' || !env.DATA) return page('役員ログインが未設定です', '<p>役員ログインの設定が入っていません。</p>', 503);
    if (!sameOrigin(request, url)) return page('この画面からはログインできません', '<p>大会運営システムの画面からログインしてください。</p>', 403);
    const form = await request.formData().catch(() => null);
    const password = String(form?.get('password') ?? '').slice(0, 40);
    const name = String(form?.get('name') ?? '').replace(/[\s\u3000]+/g, ' ').trim().slice(0, 20);
    const retry = `<p><a href="/auth/signin?return=${encodeURIComponent(back)}">入れ直す</a></p>`;
    if (!password || !name) return page('パスワードと名前を入れてください', retry, 400);
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
    const r = await loginWithPass(env.DATA, password, name, ip);
    if (!r.ok) {
      const msg = r.reason === 'busy' ? '<p>間違いが続いたため、しばらく受け付けません。15 分ほどたってから入れ直してください。</p>'
        : r.reason === 'none' ? '<p>いま使えるパスワードがありません（発行から 24 時間たった・取り消された）。役員に新しいパスワードを発行してもらってください。</p>'
        : '<p>パスワードが違います。役員から受け取ったパスワード（例 ABCD-2345）を入れ直してください。</p>';
      return page('ログインできませんでした', msg + retry, r.reason === 'busy' ? 429 : 401);
    }
    const maxAge = Math.max(60, Math.floor((r.expiresAt - Date.now()) / 1000));
    return new Response(null, {
      status: 303,
      headers: { Location: back, 'Set-Cookie': `${passCookieName(mode)}=${r.token}; ${passCookieAttrs(mode)}; Max-Age=${maxAge}`, 'Cache-Control': 'no-store' },
    });
  }

  if (url.pathname === '/auth/login') {
    if (mode === 'dev') return devLogin(request, url, back);
    if (mode === 'unconfigured') {
      return page('役員ログインが未設定です', `<p>この URL の Worker に Cloudflare Access の設定（ACCESS_TEAM_DOMAIN・ACCESS_AUD）が入っていません。</p>
        <p>設定が入るまで、運営の操作（運営端末としての同期・音声コール）はすべて止めてあります。観戦ページは使えます。</p>
        <p>設定の手順は tournament/README.md の「役員ログイン」にあります。</p>`, 503);
    }
    // ここに来るのは Access のログインを通ったリクエストだけ（/auth/login は Access が守っている）
    const jwt = request.headers.get('Cf-Access-Jwt-Assertion') ?? cookie(request, 'CF_Authorization') ?? undefined;
    const email = await verifyAccessJwt(env, jwt);
    if (!jwt || !email) {
      return page('ログインを確認できませんでした', `<p>Cloudflare Access の証明を確認できませんでした。/auth/login が Access で守られているか、ACCESS_AUD がそのアプリケーションのものか確かめてください。</p>`, 401);
    }
    if (!allowed(env, email)) {
      return page('この画面は役員だけが使えます', `<p>${escapeHtml(email)} は役員の一覧（OFFICER_EMAILS）に入っていません。</p>`, 403);
    }
    const maxAge = Math.max(60, (payloadOf(jwt)?.exp ?? 0) - Math.floor(Date.now() / 1000));
    return new Response(null, {
      status: 302,
      headers: {
        Location: back,
        'Set-Cookie': `${COOKIE}=${jwt}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response('not found', { status: 404 });
}

export async function handleMe(request: Request, env: Env, url: URL): Promise<Response> {
  const mode = authMode(env, url);
  const officer = await officerOf(request, env, url);
  const body = { authenticated: !!officer, email: officer?.email ?? null, via: officer?.via ?? null, mode };
  return new Response(JSON.stringify(body), {
    status: officer ? 200 : 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * /api/auth/pass … 24 時間パスワード
 *   GET    今の状態（使えるパスワードがあるか・期限・発行した人・ログイン中の端末の数）。役員なら誰でも
 *   POST   発行する（前のパスワードは使えなくなる）。メールでログインした役員だけ。発行したパスワードはこの応答にだけ入る
 *   DELETE 取り消す。メールでログインした役員だけ
 */
export async function handlePassApi(request: Request, env: Env, url: URL): Promise<Response> {
  const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
  if (!env.DATA) return res({ error: 'データベース（DATA）が設定されていません' }, 503);
  const officer = await officerOf(request, env, url);
  if (!officer) return res({ error: '役員ログインが必要です' }, 401);
  if (request.method === 'GET') return res({ ...(await passStatus(env.DATA)), canIssue: officer.via !== 'password' });
  if (!sameOrigin(request, url)) return res({ error: 'この画面からは操作できません' }, 403);
  if (officer.via === 'password') return res({ error: 'パスワードの発行・取り消しは、メールでログインした役員だけができます' }, 403);
  if (request.method === 'POST') return res(await issuePass(env.DATA, officer.email));
  if (request.method === 'DELETE') { await revokePass(env.DATA); return res({ ok: true }); }
  return res({ error: 'GET・POST・DELETE で呼んでください' }, 405);
}

/** パスワードの入力欄（/auth/signin） */
function passForm(back: string): string {
  return `<form method="post" action="/auth/password?return=${encodeURIComponent(back)}">
      <label>パスワード <input name="password" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345" required></label>
      <label>お名前（だれが操作したかの記録に使います） <input name="name" maxlength="20" placeholder="例 山田" required></label>
      <button type="submit">パスワードでログイン</button>
    </form>`;
}

/** 戻り先はこのサイトの中だけ（/ で始まり // で始まらないもの） */
function safeReturn(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.startsWith('/auth')) return '/data';
  return raw;
}

async function devLogin(request: Request, url: URL, back: string): Promise<Response> {
  if (request.method === 'POST') {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return page('メールアドレスの形が違います', '<p><a href="/auth/login">戻る</a></p>', 400);
    return new Response(null, {
      status: 302,
      headers: { Location: back, 'Set-Cookie': `${DEV_COOKIE}=${email}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`, 'Cache-Control': 'no-store' },
    });
  }
  return page('役員ログイン（手元の確認用）', `<p>手元の確認用のログインです（AUTH_MODE=dev）。本番では Cloudflare Access のメールのコードに置き換わります。</p>
    <form method="post" action="/auth/login?return=${encodeURIComponent(back)}">
      <label>メールアドレス <input name="email" type="email" value="officer@example.com" required></label>
      <button type="submit">ログイン</button>
    </form>`, 200);
}

function page(title: string, body: string, status: number): Response {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}｜大会運営システム</title>
<style>body{margin:0;font:400 15px/1.9 "Noto Sans JP","Hiragino Sans",sans-serif;color:#3D3D3D;background:#F8F8F8}
main{max-width:640px;margin:64px auto;padding:32px;background:#fff;border:1px solid #E5E5E5}
h1{margin:0 0 16px;font-size:22px;color:#1A1A1A;display:flex;gap:12px;align-items:center}
h1:before{content:"";width:14px;height:14px;background:#D8232A}
a{color:#D8232A}h2{margin:32px 0 0;font-size:17px;color:#1A1A1A}a.btn{display:inline-block;padding:12px 20px;border:1px solid #1A1A1A;color:#1A1A1A;text-decoration:none;font-weight:700}label{display:block;margin:16px 0}input{display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #C9C9C9;font:inherit;box-sizing:border-box}
button{padding:12px 28px;border:0;background:#D8232A;color:#fff;font:700 15px/1 inherit;cursor:pointer}</style></head>
<body><main><h1>${escapeHtml(title)}</h1>${body}<p><a href="/view">観戦ページへ</a></p></main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function cookie(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// ---------------------------------------------------------------------------
// Access の証明（JWT）の検証。署名（チームの公開鍵）・発行元・宛先・期限を確かめる
// ---------------------------------------------------------------------------

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
interface Payload { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string }
const certCache = new Map<string, { at: number; keys: Jwk[] }>();

function b64urlToBytes(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function payloadOf(jwt: string): Payload | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(jwt.split('.')[1]))) as Payload;
  } catch {
    return null;
  }
}

async function certs(origin: string, refresh = false): Promise<Jwk[]> {
  const url = `${origin}/cdn-cgi/access/certs`;
  const cached = certCache.get(url);
  if (!refresh && cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.keys;
  const res = await fetch(url);
  if (!res.ok) return cached?.keys ?? [];
  const body = (await res.json()) as { keys: Jwk[] };
  certCache.set(url, { at: Date.now(), keys: body.keys });
  return body.keys;
}

export async function verifyAccessJwt(env: Env, jwt: string | undefined): Promise<string | null> {
  const origin = teamOrigin(env);
  if (!jwt || !origin || !env.ACCESS_AUD) return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  } catch {
    return null;
  }
  const payload = payloadOf(jwt);
  if (!payload || header.alg !== 'RS256' || !header.kid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  if (payload.iss !== origin) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;

  let jwk = (await certs(origin)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await certs(origin, true)).find((k) => k.kid === header.kid); // 鍵の入れ替え直後
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;
  return typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
}
