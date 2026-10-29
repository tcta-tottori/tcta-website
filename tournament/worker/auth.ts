// 役員ログイン（Cloudflare Access）。
//
// しくみ:
//   1. Cloudflare Access の「自己ホスト型アプリケーション」で /auth だけを守る（役員のメールアドレスだけを許可）。
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
import type { Env } from './index';

export interface Officer { email: string; via: 'access' | 'dev' }

export type AuthMode = 'access' | 'dev' | 'unconfigured';

const COOKIE = '__Host-tcta_officer';
const DEV_COOKIE = 'tcta_dev_officer';

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
  if (mode === 'dev') {
    const email = cookie(request, DEV_COOKIE);
    return email && /^[^@\s]+@[^@\s]+$/.test(email) ? { email, via: 'dev' } : null;
  }
  if (mode !== 'access') return null;
  const jwt = cookie(request, COOKIE) ?? request.headers.get('Cf-Access-Jwt-Assertion') ?? undefined;
  const email = await verifyAccessJwt(env, jwt);
  if (!email || !allowed(env, email)) return null;
  return { email, via: 'access' };
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
    // Access 側のログインも切る（次に /auth/login を開いたときにコードを聞き直す）
    headers.set('Location', mode === 'access' ? '/cdn-cgi/access/logout' : '/');
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === '/auth/login') {
    if (mode === 'dev') return devLogin(request, url, back);
    if (mode === 'unconfigured') {
      return page('役員ログインが未設定です', `<p>この URL の Worker に Cloudflare Access の設定（ACCESS_TEAM_DOMAIN・ACCESS_AUD）が入っていません。</p>
        <p>設定が入るまで、運営の操作（運営端末としての同期・音声コール）はすべて止めてあります。観戦ページは使えます。</p>
        <p>設定の手順は tournament/README.md の「役員ログイン」にあります。</p>`, 503);
    }
    // ここに来るのは Access のログインを通ったリクエストだけ（/auth は Access が守っている）
    const jwt = request.headers.get('Cf-Access-Jwt-Assertion') ?? cookie(request, 'CF_Authorization') ?? undefined;
    const email = await verifyAccessJwt(env, jwt);
    if (!jwt || !email) {
      return page('ログインを確認できませんでした', `<p>Cloudflare Access の証明を確認できませんでした。/auth が Access で守られているか、ACCESS_AUD が /auth のアプリケーションのものか確かめてください。</p>`, 401);
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
  const body = { authenticated: !!officer, email: officer?.email ?? null, mode };
  return new Response(JSON.stringify(body), {
    status: officer ? 200 : 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
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
a{color:#D8232A}label{display:block;margin:16px 0}input{display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #C9C9C9;font:inherit;box-sizing:border-box}
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
