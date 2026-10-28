// 連絡先の保存期間（最小保有）。
// 年度登録は毎年の更新制なので「退会」という手続きは置かず、最後に登録（またはエントリー）した年度から
// 一定の年度数が過ぎたら住所・電話・メールを消す。氏名・ふりがな・所属と大会成績の履歴は残す。
// 年度数は協会で決める事柄なので、設定（CONTACT_RETENTION_YEARS）で変えられる。既定は 2 年度。
import type { Env } from '../env';
import { audit, type ActorType } from '../lib/audit';
import { all, nowIso, run } from '../lib/db';
import { currentFiscalYear, fiscalYear } from '../lib/fiscal';

export const retentionYears = (env: Env) => {
  const n = Number(env.CONTACT_RETENTION_YEARS);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 2;
};

/** 連絡先を消して、ログイン中のセッションも切る。氏名と成績の履歴は残る */
export async function purgeContacts(env: Env, memberId: string, by: { actorType: ActorType; actor: string; reason: string; ip?: string | null }): Promise<void> {
  const now = nowIso();
  await run(env.DB, `UPDATE members SET email_hash = NULL, email_enc = NULL, phone_enc = NULL, postal_enc = NULL, address_enc = NULL, contacts_purged_at = ?, updated_at = ? WHERE id = ?`, now, now, memberId);
  await run(env.DB, `DELETE FROM sessions WHERE kind = 'member' AND subject = ?`, memberId);
  await audit(env, { actorType: by.actorType, actor: by.actor, action: 'member.purge_contacts', target: `member:${memberId}`, after: { reason: by.reason }, ip: by.ip });
}

/**
 * 最後に活動した年度（承認済みの年度登録・キャンセルでないエントリー・会員登録した年度のうち最も新しいもの）の
 * 翌年度から数えて N 年度が終わった会員の連絡先を消す。例: N=2、最後の登録が 2024 年度 → 2025・2026 年度に登録がなければ 2027 年度に削除。
 */
export async function purgeInactiveContacts(env: Env): Promise<number> {
  const n = retentionYears(env);
  const cy = currentFiscalYear(4);
  const rows = await all<{ id: string; created_at: string; last_reg: number | null; last_entry: string | null }>(
    env.DB,
    `SELECT m.id, m.created_at,
            (SELECT MAX(r.fiscal_year) FROM registrations r WHERE r.member_id = m.id AND r.status = 'approved') AS last_reg,
            (SELECT MAX(e.created_at) FROM entries e WHERE (e.member_id = m.id OR e.partner_member_id = m.id) AND e.status <> 'cancelled') AS last_entry
       FROM members m
      WHERE m.contacts_purged_at IS NULL AND m.merged_into IS NULL
        AND (m.email_enc IS NOT NULL OR m.phone_enc IS NOT NULL OR m.address_enc IS NOT NULL OR m.postal_enc IS NOT NULL)`,
  );
  let purged = 0;
  for (const r of rows) {
    const last = Math.max(r.last_reg ?? 0, r.last_entry ? fiscalYear(r.last_entry) : 0, fiscalYear(r.created_at));
    if (cy > last + n) {
      await purgeContacts(env, r.id, { actorType: 'system', actor: 'cron', reason: `${last}年度を最後に ${n} 年度登録がないため` });
      purged++;
    }
  }
  return purged;
}
