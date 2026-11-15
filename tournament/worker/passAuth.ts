// 24 時間だけ使えるパスワードでの役員ログイン（メールのコード＝Cloudflare Access のほかの入り方）。
//
// しくみ:
//   1. メールでログインした役員が、設定の画面で「パスワードを発行」を押す（POST /api/auth/pass）。
//      パスワードは「ABCD-2345」の形（紛らわしい文字は使わない）。発行した画面に 1 度だけ出す
//   2. パスワードはデータベース（D1）に そのままでは置かず、PBKDF2 のハッシュだけを置く。期限は発行から 24 時間
//   3. ログインの画面でパスワードと名前を入れる（POST /auth/password）と、ログインの証（ランダムな合言葉）を Cookie に入れる。
//      証もハッシュだけを置き、期限はパスワードの期限と同じ（24 時間たてば、その間にログインした端末もすべて切れる）
//   4. 新しく発行すると前のパスワードは使えなくなり、前のパスワードでログインしていた端末も切れる。「取り消す」でもすぐ切れる
//   5. パスワードの発行・取り消しは、メールでログインした役員だけ（パスワードでログインした人はできない）
//   間違いが続くときは断る（同じ接続元から 15 分に 10 回、全体で 15 分に 100 回まで）
import type { Env } from './index';

export const PASS_TTL_MS = 24 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0/O・1/I/L は使わない
const ITER = 100_000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

export interface PassSession { name: string; expiresAt: number }
export interface PassStatus { active: boolean; expiresAt: number | null; createdAt: number | null; createdBy: string | null; sessions: number }

let ready: Promise<void> | null = null;
function ensure(db: D1Database): Promise<void> {
  ready ??= db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_pass (
      id TEXT PRIMARY KEY, hash TEXT NOT NULL, salt TEXT NOT NULL,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_session (
      token_hash TEXT PRIMARY KEY, pass_id TEXT NOT NULL, name TEXT NOT NULL,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_fail (ip TEXT NOT NULL, at INTEGER NOT NULL)`),
  ]).then(() => undefined).catch((e) => { ready = null; throw e; });
  return ready;
}

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256));
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** 入力の揺れをならす（小文字・空白・ハイフン・全角を許す） */
export function normalizePass(s: string): string {
  return s.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function newPassword(): string {
  // 31 文字から 8 文字（偏りが出ないよう、248 以上の値は捨てる）
  const out: string[] = [];
  while (out.length < 8) {
    for (const v of randomBytes(16)) {
      if (v < 248 && out.length < 8) out.push(ALPHABET[v % ALPHABET.length]);
    }
  }
  return `${out.slice(0, 4).join('')}-${out.slice(4).join('')}`;
}

/** パスワードを発行する（前のパスワードと、それでログインしていた端末は切れる） */
export async function issuePass(db: D1Database, by: string): Promise<{ password: string; expiresAt: number }> {
  await ensure(db);
  const password = newPassword();
  const salt = hex(randomBytes(16));
  const hash = await pbkdf2(normalizePass(password), salt);
  const now = Date.now();
  const expiresAt = now + PASS_TTL_MS;
  await db.batch([
    db.prepare('DELETE FROM auth_session'),
    db.prepare('DELETE FROM auth_pass'),
    db.prepare('INSERT INTO auth_pass (id, hash, salt, expires_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), hash, salt, expiresAt, now, by),
  ]);
  return { password, expiresAt };
}

/** パスワードを取り消す（それでログインしていた端末もすぐ切れる） */
export async function revokePass(db: D1Database): Promise<void> {
  await ensure(db);
  await db.batch([db.prepare('DELETE FROM auth_session'), db.prepare('DELETE FROM auth_pass')]);
}

export async function passStatus(db: D1Database): Promise<PassStatus> {
  await ensure(db);
  const now = Date.now();
  const p = await db.prepare('SELECT id, expires_at, created_at, created_by FROM auth_pass WHERE expires_at > ? LIMIT 1').bind(now)
    .first<{ id: string; expires_at: number; created_at: number; created_by: string }>();
  if (!p) return { active: false, expiresAt: null, createdAt: null, createdBy: null, sessions: 0 };
  const s = await db.prepare('SELECT COUNT(*) AS n FROM auth_session WHERE pass_id = ? AND expires_at > ?').bind(p.id, now).first<{ n: number }>();
  return { active: true, expiresAt: p.expires_at, createdAt: p.created_at, createdBy: p.created_by, sessions: s?.n ?? 0 };
}

export type LoginResult = { ok: true; token: string; expiresAt: number } | { ok: false; reason: 'busy' | 'wrong' | 'none' };

/** パスワードでログインする。合っていれば、Cookie に入れる証（token）を返す */
export async function loginWithPass(db: D1Database, input: string, name: string, ip: string): Promise<LoginResult> {
  await ensure(db);
  const now = Date.now();
  // 間違いが続いていないか
  await db.prepare('DELETE FROM auth_fail WHERE at < ?').bind(now - FAIL_WINDOW_MS).run();
  const mine = await db.prepare('SELECT COUNT(*) AS n FROM auth_fail WHERE ip = ?').bind(ip).first<{ n: number }>();
  const all = await db.prepare('SELECT COUNT(*) AS n FROM auth_fail').first<{ n: number }>();
  if ((mine?.n ?? 0) >= 10 || (all?.n ?? 0) >= 100) return { ok: false, reason: 'busy' };

  const p = await db.prepare('SELECT id, hash, salt, expires_at FROM auth_pass WHERE expires_at > ? LIMIT 1').bind(now)
    .first<{ id: string; hash: string; salt: string; expires_at: number }>();
  const got = p ? await pbkdf2(normalizePass(input), p.salt) : '';
  if (!p || !timingSafeEqual(got, p.hash)) {
    await db.prepare('INSERT INTO auth_fail (ip, at) VALUES (?, ?)').bind(ip, now).run();
    return { ok: false, reason: p ? 'wrong' : 'none' };
  }
  const token = b64url(randomBytes(32));
  await db.batch([
    db.prepare('DELETE FROM auth_session WHERE expires_at < ?').bind(now),
    db.prepare('INSERT INTO auth_session (token_hash, pass_id, name, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256(token), p.id, name, p.expires_at, now),
  ]);
  return { ok: true, token, expiresAt: p.expires_at };
}

/** Cookie の証から、パスワードでログインした人を引く。期限切れ・取り消し済みなら null */
export async function sessionOf(db: D1Database, token: string | null): Promise<PassSession | null> {
  if (!token || token.length > 100) return null;
  await ensure(db);
  const now = Date.now();
  const r = await db.prepare(`SELECT s.name, s.expires_at FROM auth_session s JOIN auth_pass p ON p.id = s.pass_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND p.expires_at > ?`).bind(await sha256(token), now, now)
    .first<{ name: string; expires_at: number }>();
  return r ? { name: r.name, expiresAt: r.expires_at } : null;
}

export async function endSession(db: D1Database, token: string | null): Promise<void> {
  if (!token) return;
  await ensure(db);
  await db.prepare('DELETE FROM auth_session WHERE token_hash = ?').bind(await sha256(token)).run();
}

export function hasDb(env: Env): env is Env & { DATA: D1Database } {
  return !!env.DATA;
}
