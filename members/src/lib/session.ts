// セッション（会員・登録途中・事務局）。Cookie には ID だけを置き、中身は D1 に持つ。
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Ctx } from '../app';
import { isProd } from '../env';
import { nowIso, one, run } from './db';
import { randomToken } from './crypto';

export type SessionKind = 'member' | 'signup' | 'admin';
const COOKIE: Record<SessionKind, string> = { member: 'tm_session', signup: 'tm_signup', admin: 'tm_admin' };
const TTL: Record<SessionKind, number> = { member: 30 * 24 * 3600, signup: 3600, admin: 12 * 3600 };

interface Session { id: string; kind: SessionKind; subject: string; expires_at: string }

export async function createSession(c: Ctx, kind: SessionKind, subject: string): Promise<void> {
  const id = randomToken(32);
  const expires = new Date(Date.now() + TTL[kind] * 1000).toISOString();
  await run(c.env.DB, 'INSERT INTO sessions (id, kind, subject, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', id, kind, subject, expires, nowIso());
  setCookie(c, COOKIE[kind], id, { httpOnly: true, secure: isProd(c.env) || c.req.url.startsWith('https:'), sameSite: 'Lax', path: '/', maxAge: TTL[kind] });
}

export async function readSession(c: Ctx, kind: SessionKind): Promise<string | null> {
  const id = getCookie(c, COOKIE[kind]);
  if (!id) return null;
  const s = await one<Session>(c.env.DB, 'SELECT * FROM sessions WHERE id = ? AND kind = ?', id, kind);
  if (!s) return null;
  if (s.expires_at < nowIso()) {
    await run(c.env.DB, 'DELETE FROM sessions WHERE id = ?', id);
    return null;
  }
  return s.subject;
}

export async function destroySession(c: Ctx, kind: SessionKind): Promise<void> {
  const id = getCookie(c, COOKIE[kind]);
  if (id) await run(c.env.DB, 'DELETE FROM sessions WHERE id = ?', id);
  deleteCookie(c, COOKIE[kind], { path: '/' });
}

/** 一度だけ出すメッセージ（操作の結果）。 */
export function flash(c: Ctx, msg: string, kind: 'ok' | 'err' = 'ok'): void {
  setCookie(c, 'tm_flash', `${kind}:${msg}`, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 60 });
}
export function takeFlash(c: Ctx): { kind: 'ok' | 'err'; msg: string } | null {
  const v = getCookie(c, 'tm_flash');
  if (!v) return null;
  deleteCookie(c, 'tm_flash', { path: '/' });
  const i = v.indexOf(':');
  return { kind: v.slice(0, i) as 'ok' | 'err', msg: v.slice(i + 1) };
}
