// 支払の作成と消込。Stripe の Webhook も事務局の手動消込も markPaid に合流し、
// 紐づくエントリーを「確定」にして完了通知を送る（設計書 §5 図 2）。
import type { Env } from '../env';
import { audit, type ActorType } from '../lib/audit';
import { all, nextSeq, nowIso, one, run } from '../lib/db';
import { decrypt } from '../lib/crypto';
import { sendMail } from '../lib/mail';
import { ulid } from '../lib/ulid';
import type { Entry, Member, Payment, PaymentMethod, Registration, Tournament } from '../types';
import { fmtDate, yen } from '../lib/fiscal';

export async function createPayment(env: Env, p: { kind: 'registration' | 'entry'; associationId: string; payerMemberId: string | null; amount: number; method: PaymentMethod; note?: string }): Promise<Payment> {
  const id = ulid();
  await run(
    env.DB,
    `INSERT INTO payments (id, kind, association_id, payer_member_id, amount, method, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    id, p.kind, p.associationId, p.payerMemberId, p.amount, p.method, p.note ?? null, nowIso(),
  );
  return (await one<Payment>(env.DB, 'SELECT * FROM payments WHERE id = ?', id))!;
}

export async function getPayment(env: Env, id: string): Promise<Payment | null> {
  return one<Payment>(env.DB, 'SELECT * FROM payments WHERE id = ?', id);
}

/** 入金を確定し、紐づくエントリーを確定、通知を送る。二重に呼ばれても一度しか処理しない。 */
export async function markPaid(env: Env, paymentId: string, by: { actorType: ActorType; actor: string; externalId?: string | null; note?: string | null; ip?: string | null }): Promise<Payment | null> {
  const p = await getPayment(env, paymentId);
  if (!p) return null;
  if (p.status === 'paid') return p;
  const now = nowIso();
  const receiptNo = `R-${now.slice(2, 4)}-${String(await nextSeq(env.DB, `receipt:${now.slice(0, 4)}`)).padStart(5, '0')}`;
  await run(
    env.DB,
    `UPDATE payments SET status = 'paid', paid_at = ?, confirmed_by = ?, external_id = COALESCE(?, external_id), receipt_no = ?, note = COALESCE(?, note) WHERE id = ? AND status = 'pending'`,
    now, by.actor, by.externalId ?? null, receiptNo, by.note ?? null, paymentId,
  );
  await audit(env, { actorType: by.actorType, actor: by.actor, action: 'payment.paid', target: `payment:${paymentId}`, before: { status: p.status }, after: { status: 'paid', method: p.method, amount: p.amount, receipt_no: receiptNo, external_id: by.externalId ?? p.external_id }, ip: by.ip });

  // エントリーを確定
  const entries = await all<Entry>(env.DB, `SELECT * FROM entries WHERE payment_id = ? AND status = 'pending_payment'`, paymentId);
  for (const e of entries) {
    await run(env.DB, `UPDATE entries SET status = 'confirmed', confirmed_at = ? WHERE id = ?`, now, e.id);
    await audit(env, { actorType: by.actorType, actor: by.actor, action: 'entry.confirm', target: `entry:${e.id}`, before: { status: e.status }, after: { status: 'confirmed' }, ip: by.ip });
    await notifyEntryConfirmed(env, e, receiptNo);
  }
  // 年度登録は入金後に事務局の承認（設計書: 登録料を支払→事務局が承認→当年度有効）
  const regs = await all<Registration>(env.DB, `SELECT * FROM registrations WHERE payment_id = ?`, paymentId);
  if (regs.length) {
    const member = await one<Member>(env.DB, 'SELECT * FROM members WHERE id = ?', regs[0].member_id);
    const email = member ? await decrypt(env, member.email_enc) : null;
    if (email) {
      await sendMail(env, {
        to: email,
        subject: `【${env.APP_NAME}】年度登録料の入金を確認しました`,
        text: `${member!.name} 様\n\n年度登録料 ${yen(p.amount)} の入金を確認しました（領収書番号 ${receiptNo}）。\n事務局の承認が済むと当年度の登録が有効になります。承認後にあらためてお知らせします。\n\n${env.BASE_URL}/me`,
      });
    }
  }
  return getPayment(env, paymentId);
}

async function notifyEntryConfirmed(env: Env, e: Entry, receiptNo: string) {
  const t = await one<Tournament>(env.DB, 'SELECT * FROM tournaments WHERE id = ?', e.tournament_id);
  if (!t) return;
  const ids = [e.member_id, e.partner_member_id].filter(Boolean) as string[];
  const ev = (JSON.parse(t.events_json) as { code: string; name: string }[]).find((x) => x.code === e.event_code);
  for (const id of ids) {
    const m = await one<Member>(env.DB, 'SELECT * FROM members WHERE id = ?', id);
    const email = m ? await decrypt(env, m.email_enc) : null;
    if (!email) continue;
    await sendMail(env, {
      to: email,
      subject: `【${env.APP_NAME}】エントリー確定: ${t.name}`,
      text: `${m!.name} 様\n\n${t.name}（${fmtDate(t.held_on)}）\n種目: ${ev?.name ?? e.event_code}${e.class ? ' ' + e.class + 'クラス' : ''}\n\n参加費の入金を確認し、エントリーが確定しました。領収書番号 ${receiptNo}\nマイページ: ${env.BASE_URL}/me`,
    });
  }
}

export async function cancelEntry(env: Env, entryId: string, reason: string, by: { actorType: ActorType; actor: string; ip?: string | null }): Promise<void> {
  const e = await one<Entry>(env.DB, 'SELECT * FROM entries WHERE id = ?', entryId);
  if (!e || e.status === 'cancelled') return;
  const now = nowIso();
  await run(env.DB, `UPDATE entries SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?`, now, reason, entryId);
  if (e.payment_id) {
    const p = await getPayment(env, e.payment_id);
    if (p?.status === 'pending') await run(env.DB, `UPDATE payments SET status = 'cancelled' WHERE id = ?`, p.id);
    // 入金済みは「返金記録」だけ残す（Stripe 分は Stripe 側で返金する。設計書 §5）
    if (p?.status === 'paid') await run(env.DB, `UPDATE payments SET status = 'refunded', note = COALESCE(note || ' / ', '') || ? WHERE id = ?`, `返金: ${reason}`, p.id);
  }
  await audit(env, { actorType: by.actorType, actor: by.actor, action: 'entry.cancel', target: `entry:${entryId}`, before: { status: e.status }, after: { status: 'cancelled', reason }, ip: by.ip });
}
