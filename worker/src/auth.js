// ログインとセッション。
//
// ・編集者は EDITORS（秘密情報）に「名前 → パスワードのハッシュ」で登録する。
//   ハッシュは scripts/hash-password.mjs で作る（PBKDF2-SHA256・10万回・個別ソルト）。
//   Cloudflare Workers の WebCrypto は PBKDF2 の回数が 10万回までしか使えない（超えると例外）。
// ・ログインに成功したら、名前と期限を SESSION_SECRET で署名した Cookie を返す。
//   HttpOnly / Secure / SameSite=Strict なので、他サイトからの読み出しも持ち出しもできない。
// ・権限の確認は保存・公開の API 側（requireEditor）で毎回行う。画面側の判定は信用しない。

const enc = new TextEncoder();
const SESSION_DAYS = 30;
const COOKIE = 'tcta_session';
const MAX_ITERATIONS = 100000;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function pbkdf2(password, salt, iterations = MAX_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

/** 'pbkdf2$<iterations>$<salt>$<hash>' の形にする */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = MAX_ITERATIONS;
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(hash)}`;
}

async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  // 10万回を超えるハッシュは Workers では確かめられない。登録し直してもらう
  if (!(Number(iter) <= MAX_ITERATIONS)) throw new Error('EDITORS のハッシュが古い形式です。scripts/register-editors.mjs で登録し直してください');
  const got = new Uint8Array(await pbkdf2(password, unb64url(salt), Number(iter)));
  const want = unb64url(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

function editors(env) {
  try { return JSON.parse(env.EDITORS || '{}'); } catch { return {}; }
}

async function hmac(env, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/** 名前とパスワードを確かめ、合っていれば Set-Cookie の値を返す。違えば null。 */
export async function login(env, name, password, secure = true) {
  const stored = editors(env)[name];
  if (!stored || !password) return null;
  if (!(await verifyPassword(password, stored))) return null;
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = b64url(enc.encode(JSON.stringify({ name, exp })));
  const token = `${payload}.${await hmac(env, payload)}`;
  // 手元の検証（http://localhost）では Secure を付けない。本番は常に https。
  return `${COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict`;
}

export const logoutCookie = (secure = true) => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict`;

/** Cookie から編集者名を取り出す。無効なら null。 */
export async function currentEditor(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return null;
  if ((await hmac(env, payload)) !== sig) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(unb64url(payload))); } catch { return null; }
  if (!data.name || data.exp < Date.now()) return null;
  if (!editors(env)[data.name]) return null; // 登録を外した人はその場で無効
  return data.name;
}
