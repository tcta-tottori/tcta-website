// Hono アプリの型。c.var.member / c.var.admin は認証ミドルウェアが入れる。
import type { Hono, Context } from 'hono';
import type { Env } from './env';
import type { Admin, Member } from './types';

export type Vars = { member: Member | null; admin: Admin | null };
export type App = Hono<{ Bindings: Env; Variables: Vars }>;
export type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

export const clientIp = (c: Ctx) => c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? null;

/** フォームの値を文字列の辞書にそろえる（同じ名前が複数ある項目は配列）。 */
export async function form(c: Ctx): Promise<Record<string, string> & { all: (k: string) => string[] }> {
  const body = await c.req.parseBody({ all: true });
  const out: Record<string, string> = {};
  const arrays: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(body)) {
    const vals = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string');
    arrays[k] = vals;
    out[k] = vals[vals.length - 1] ?? '';
  }
  return Object.assign(out, { all: (k: string) => arrays[k] ?? [] });
}
