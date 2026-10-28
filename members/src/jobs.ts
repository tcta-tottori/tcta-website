// 定期実行（Cron Triggers）。締切リマインド・締切処理・継続登録リマインド・登録のない会員の連絡先削除・日次バックアップ。
// 手元では `wrangler dev --test-scheduled` のうえで GET /__scheduled を叩くと動く。
import type { Env } from './env';
import { audit } from './lib/audit';
import { decrypt } from './lib/crypto';
import { all, nowIso, one, run } from './lib/db';
import { addDays, currentFiscalYear, fmtDate, inRenewalWindow, todayJst } from './lib/fiscal';
import { sendMail } from './lib/mail';
import { cancelEntry } from './services/payments';
import { purgeInactiveContacts } from './services/retention';
import type { Association, Entry, Member, Tournament } from './types';

export async function runJobs(env: Env): Promise<Record<string, number>> {
  const r: Record<string, number> = {};
  r.reminders = await remindUnpaidEntries(env);
  r.closed = await closeTournaments(env);
  r.renewal = await remindRenewal(env);
  r.purged = await purgeInactiveContacts(env);
  r.backup = await backup(env);
  await audit(env, { actorType: 'system', actor: 'cron', action: 'jobs.run', after: r });
  return r;
}

/** 締切 3 日前〜当日の「支払待ち」に 1 回だけ督促。 */
async function remindUnpaidEntries(env: Env): Promise<number> {
  const today = todayJst();
  const limit = addDays(today, 3);
  const rows = await all<Entry & { t_name: string; entry_end: string }>(
    env.DB,
    `SELECT e.*, t.name AS t_name, t.entry_end FROM entries e JOIN tournaments t ON t.id = e.tournament_id
      WHERE e.status = 'pending_payment' AND t.status = 'open' AND t.entry_end BETWEEN ? AND ?`,
    today, limit,
  );
  let n = 0;
  for (const e of rows) {
    const key = `unpaid:${e.id}`;
    if (await one(env.DB, 'SELECT 1 AS ok FROM reminders_sent WHERE key = ?', key)) continue;
    const m = await one<Member>(env.DB, 'SELECT * FROM members WHERE id = ?', e.member_id);
    const email = m ? await decrypt(env, m.email_enc) : null;
    if (email) {
      await sendMail(env, { to: email, subject: `【${env.APP_NAME}】お支払いが未完了です: ${e.t_name}`, text: `${m!.name} 様\n\n${e.t_name} のエントリーは参加費の入金が確認できていません。締切は ${fmtDate(e.entry_end)} です。\n${env.BASE_URL}/pay/${e.payment_id}` });
      n++;
    }
    await run(env.DB, 'INSERT OR REPLACE INTO reminders_sent (key, at) VALUES (?, ?)', key, nowIso());
  }
  return n;
}

/** 締切を過ぎた大会を「締切」にし、支払待ちは大会設定に従って自動キャンセルか事務局判断（保留）。 */
async function closeTournaments(env: Env): Promise<number> {
  const today = todayJst();
  const ts = await all<Tournament>(env.DB, `SELECT * FROM tournaments WHERE status = 'open' AND entry_end < ?`, today);
  for (const t of ts) {
    await run(env.DB, `UPDATE tournaments SET status = 'closed' WHERE id = ?`, t.id);
    await audit(env, { actorType: 'system', actor: 'cron', action: 'tournament.close', target: `tournament:${t.id}` });
    if (t.unpaid_policy === 'cancel') {
      const pend = await all<Entry>(env.DB, `SELECT * FROM entries WHERE tournament_id = ? AND status = 'pending_payment'`, t.id);
      for (const e of pend) await cancelEntry(env, e.id, '締切時に未入金のため自動キャンセル', { actorType: 'system', actor: 'cron' });
    }
  }
  return ts.length;
}

/** 年度切替の 2 か月前から、今年度登録済みで次年度未登録の会員に月 1 回リマインド。 */
async function remindRenewal(env: Env): Promise<number> {
  let n = 0;
  const assocs = await all<Association>(env.DB, 'SELECT * FROM associations');
  const month = todayJst().slice(0, 7);
  for (const a of assocs) {
    if (!inRenewalWindow(a.fiscal_year_start_month)) continue;
    const fy = currentFiscalYear(a.fiscal_year_start_month);
    const rows = await all<Member>(
      env.DB,
      `SELECT m.* FROM members m JOIN registrations r ON r.member_id = m.id AND r.association_id = ? AND r.fiscal_year = ? AND r.status = 'approved'
        WHERE m.status = 'active' AND NOT EXISTS (SELECT 1 FROM registrations r2 WHERE r2.member_id = m.id AND r2.association_id = ? AND r2.fiscal_year = ?)`,
      a.id, fy, a.id, fy + 1,
    );
    for (const m of rows) {
      const key = `renewal:${a.id}:${fy + 1}:${m.id}:${month}`;
      if (await one(env.DB, 'SELECT 1 AS ok FROM reminders_sent WHERE key = ?', key)) continue;
      const email = await decrypt(env, m.email_enc);
      if (email) {
        await sendMail(env, { to: email, subject: `【${env.APP_NAME}】${fy + 1}年度の継続登録のご案内（${a.name}）`, text: `${m.name} 様\n\n${a.name}の${fy + 1}年度登録の受付が始まっています。マイページの「継続登録」から前年の内容を確認するだけで完了します。\n${env.BASE_URL}/registrations/new` });
        n++;
      }
      await run(env.DB, 'INSERT OR REPLACE INTO reminders_sent (key, at) VALUES (?, ?)', key, nowIso());
    }
  }
  return n;
}

/** 日次バックアップ（R2 が結ばれているときだけ）。暗号化列は暗号文のまま出るので、ダンプが漏れても連絡先は読めない。 */
async function backup(env: Env): Promise<number> {
  if (!env.BACKUP) return 0;
  const tables = ['associations', 'clubs', 'members', 'registrations', 'tournaments', 'entries', 'payments', 'admins', 'audit_log', 'merge_candidates'];
  const dump: Record<string, unknown[]> = {};
  for (const t of tables) dump[t] = await all(env.DB, `SELECT * FROM ${t}`);
  const key = `backup/${todayJst()}.json`;
  await env.BACKUP.put(key, JSON.stringify(dump), { httpMetadata: { contentType: 'application/json' } });
  // 90 日より古いものは消す
  const list = await env.BACKUP.list({ prefix: 'backup/' });
  const cutoff = addDays(todayJst(), -90);
  for (const o of list.objects) if (o.key < `backup/${cutoff}`) await env.BACKUP.delete(o.key);
  return 1;
}
