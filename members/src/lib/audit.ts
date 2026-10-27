// 監査ログ。個人情報の閲覧・出力・更新・削除と、支払・承認などの業務操作を「誰が・いつ・何を」で残す。
// テーブルにはトリガーで UPDATE/DELETE を禁止してある（管理者本人も削除不可）。
import type { Env } from '../env';
import { nowIso, run } from './db';
import { ulid } from './ulid';

export type ActorType = 'member' | 'admin' | 'shop' | 'system' | 'api';

export interface AuditEvent {
  actorType: ActorType;
  actor: string;
  action: string;
  target?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export async function audit(env: Env, ev: AuditEvent): Promise<void> {
  await run(
    env.DB,
    `INSERT INTO audit_log (id, at, actor_type, actor, action, target, before_json, after_json, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ulid(),
    nowIso(),
    ev.actorType,
    ev.actor,
    ev.action,
    ev.target ?? null,
    ev.before === undefined ? null : JSON.stringify(ev.before),
    ev.after === undefined ? null : JSON.stringify(ev.after),
    ev.ip ?? null,
  );
}
