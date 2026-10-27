// デモデータ（開発モードの /dev から投入）。暗号化が要るので SQL ではなく Worker 内で作る。
import type { Env } from './env';
import { audit } from './lib/audit';
import { all, nowIso, run } from './lib/db';
import { addDays, currentFiscalYear, todayJst } from './lib/fiscal';
import { ulid } from './lib/ulid';
import { createMember } from './services/members';
import { createPayment, markPaid } from './services/payments';

const TABLES = ['mail_outbox', 'reminders_sent', 'sequences', 'merge_candidates', 'rate_limits', 'api_tokens', 'sessions', 'magic_links', 'entries', 'registrations', 'payments', 'tournaments', 'admins', 'members', 'clubs', 'associations'];

export async function resetAll(env: Env): Promise<void> {
  for (const t of TABLES) await run(env.DB, `DELETE FROM ${t}`);
  // audit_log は削除不可のトリガーがあるので残る（サンプルでも「消せない」ことを確かめられる）
}

export async function seedDemo(env: Env): Promise<void> {
  const now = nowIso();
  const today = todayJst();
  const assocs = [
    { id: 'tottori-pref', code: 'P', name: '鳥取県テニス協会', fee: 2000 },
    { id: 'tottori-city', code: 'T', name: '鳥取市テニス協会', fee: 3000 },
    { id: 'kurayoshi-city', code: 'K', name: '倉吉市テニス協会', fee: 2000 },
    { id: 'yonago-city', code: 'Y', name: '米子市テニス協会', fee: 2500 },
  ];
  for (const a of assocs) {
    await run(env.DB, `INSERT INTO associations (id, code, name, annual_fee, fiscal_year_start_month, reg_note, bank_info, paypay_info, stripe_account, created_at) VALUES (?, ?, ?, ?, 4, ?, ?, ?, ?, ?)`,
      a.id, a.code, a.name, a.fee, '年度登録は 4 月 1 日〜翌年 3 月 31 日が有効期間です。', `○○銀行 ○○支店 普通 1234567 ${a.name}`, `PayPay ID: ${a.code.toLowerCase()}-tennis`, `acct_demo_${a.code}`, now);
  }
  const clubs = [
    ['club-tottori-lc', '鳥取ローンテニスクラブ', '鳥取市'], ['club-koyama', '湖山テニスクラブ', '鳥取市'], ['club-tottori-univ', '鳥取大学テニス部', '鳥取市'],
    ['club-kurayoshi', '倉吉テニスクラブ', '倉吉市'], ['club-yonago', '米子ローンテニスクラブ', '米子市'], ['club-free', 'クラブ無所属', null],
  ];
  for (const [id, name, area] of clubs) await run(env.DB, `INSERT INTO clubs (id, name, area, created_at) VALUES (?, ?, ?, ?)`, id, name, area, now);

  const fy = currentFiscalYear(4);
  const demo = [
    { name: '山田 太郎', kana: 'やまだたろう', sex: 'male', birth: 1985, email: 'yamada@example.com', phone: '090-0000-0001', postal: '680-0001', address: '鳥取市栄町1-1', club: 'club-tottori-lc', home: 'tottori-city', reg: ['tottori-city', 'tottori-pref'], manager: true },
    { name: '佐藤 花子', kana: 'さとうはなこ', sex: 'female', birth: 1990, email: 'sato@example.com', phone: '090-0000-0002', postal: '680-0002', address: '鳥取市本町2-2', club: 'club-tottori-lc', home: 'tottori-city', reg: ['tottori-city'] },
    { name: '鈴木 一郎', kana: 'すずきいちろう', sex: 'male', birth: 1972, email: 'suzuki@example.com', phone: '090-0000-0003', postal: '680-0003', address: '鳥取市湖山町3-3', club: 'club-koyama', home: 'tottori-city', reg: ['tottori-city'] },
    { name: '田中 美咲', kana: 'たなかみさき', sex: 'female', birth: 2004, email: 'tanaka@example.com', phone: '090-0000-0004', postal: '680-0004', address: '鳥取市湖山町南4-4', club: 'club-tottori-univ', home: 'tottori-city', reg: [], pendingReg: 'tottori-city' },
    { name: '高橋 健', kana: 'たかはしけん', sex: 'male', birth: 1995, email: 'takahashi@example.com', phone: '090-0000-0005', postal: '682-0001', address: '倉吉市駄経寺町5-5', club: 'club-kurayoshi', home: 'kurayoshi-city', reg: ['kurayoshi-city', 'tottori-pref'] },
    { name: '伊藤 由美', kana: 'いとうゆみ', sex: 'female', birth: 1988, email: 'ito@example.com', phone: '090-0000-0006', postal: '683-0001', address: '米子市加茂町6-6', club: 'club-yonago', home: 'yonago-city', reg: ['yonago-city'] },
    { name: '渡辺 翔', kana: 'わたなべしょう', sex: 'male', birth: 1999, email: null, phone: null, postal: null, address: null, club: 'club-koyama', home: 'tottori-city', reg: [], status: 'provisional' as const },
    { name: '山田 太郎', kana: 'やまだたろう', sex: null, birth: null, email: null, phone: null, postal: null, address: null, club: 'club-free', home: 'tottori-city', reg: [], status: 'provisional' as const, dupOf: 0 },
  ];
  const ids: string[] = [];
  for (const d of demo) {
    const m = await createMember(env, { name: d.name, kana: d.kana, sex: d.sex, birthYear: d.birth, email: d.email, phone: d.phone, postal: d.postal, address: d.address, clubId: d.club, homeAssociationId: d.home, status: d.status ?? 'active', consented: Boolean(d.email) });
    ids.push(m.id);
    if (d.manager) await run(env.DB, 'UPDATE members SET club_manager = 1 WHERE id = ?', m.id);
    for (const aid of d.reg) {
      const a = assocs.find((x) => x.id === aid)!;
      const p = await createPayment(env, { kind: 'registration', associationId: aid, payerMemberId: m.id, amount: a.fee, method: 'bank' });
      await markPaid(env, p.id, { actorType: 'admin', actor: 'seed', note: 'デモデータ' });
      await run(env.DB, `INSERT INTO registrations (id, member_id, association_id, fiscal_year, category, fee, payment_id, status, source, approved_by, approved_at, created_at) VALUES (?, ?, ?, ?, 'general', ?, ?, 'approved', 'import', 'seed', ?, ?)`, ulid(), m.id, aid, fy, a.fee, p.id, now, now);
    }
    if (d.pendingReg) {
      const a = assocs.find((x) => x.id === d.pendingReg)!;
      const p = await createPayment(env, { kind: 'registration', associationId: a.id, payerMemberId: m.id, amount: a.fee, method: 'bank' });
      await run(env.DB, `INSERT INTO registrations (id, member_id, association_id, fiscal_year, category, fee, payment_id, status, source, created_at) VALUES (?, ?, ?, ?, 'student', ?, ?, 'pending', 'web', ?)`, ulid(), m.id, a.id, fy, a.fee, p.id, now);
    }
    if (d.dupOf !== undefined) {
      await run(env.DB, `INSERT INTO merge_candidates (id, keep_member_id, dup_member_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)`, ulid(), ids[d.dupOf], m.id, '氏名・ふりがなが一致（Excel 取込み）', now);
    }
  }

  const events = JSON.stringify([
    { code: 'MD', name: '男子ダブルス', classes: ['A', 'B'], fee: 3000, teamSize: 2 },
    { code: 'WD', name: '女子ダブルス', classes: ['A', 'B'], fee: 3000, teamSize: 2 },
    { code: 'MS', name: '男子シングルス', classes: [], fee: 2000, teamSize: 1 },
  ]);
  const tournaments = [
    { id: 'T-DEMO-OPEN', assoc: 'tottori-city', name: `鳥取市秋季ダブルス大会（Phase 1 試行）`, held: addDays(today, 30), venue: '鳥取市営コート', start: addDays(today, -7), end: addDays(today, 14), status: 'open', methods: ['stripe', 'bank', 'paypay', 'cash'], policy: 'hold' },
    { id: 'T-DEMO-PREF', assoc: 'tottori-pref', name: `鳥取県選手権（県主催）`, held: addDays(today, 45), venue: '県立コート', start: addDays(today, -3), end: addDays(today, 21), status: 'open', methods: ['stripe', 'bank'], policy: 'cancel' },
    { id: 'T-DEMO-CLOSED', assoc: 'tottori-city', name: `鳥取市春季シングルス大会（締切済み）`, held: addDays(today, -60), venue: '鳥取市営コート', start: addDays(today, -120), end: addDays(today, -80), status: 'closed', methods: ['bank', 'cash'], policy: 'hold' },
  ];
  for (const t of tournaments) {
    await run(env.DB, `INSERT INTO tournaments (id, association_id, name, held_on, venue, entry_start, entry_end, eligibility, requires_registration, events_json, payment_methods_json, unpaid_policy, capacity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 64, ?, ?)`,
      t.id, t.assoc, t.name, t.held, t.venue, t.start, t.end, '主催協会の当年度登録者', events, JSON.stringify(t.methods), t.policy, t.status, now);
  }
  // 既存のエントリー（確定 1 件・支払待ち 1 件）
  const pe = await createPayment(env, { kind: 'entry', associationId: 'tottori-city', payerMemberId: ids[2], amount: 3000, method: 'stripe' });
  await run(env.DB, `INSERT INTO entries (id, tournament_id, event_code, class, member_id, partner_member_id, source, payment_id, status, created_at) VALUES (?, 'T-DEMO-OPEN', 'MD', 'B', ?, ?, 'web', ?, 'pending_payment', ?)`, ulid(), ids[2], ids[6], pe.id, now);
  await markPaid(env, pe.id, { actorType: 'system', actor: 'stripe:webhook', externalId: 'cs_demo_seed' });
  const pe2 = await createPayment(env, { kind: 'entry', associationId: 'tottori-city', payerMemberId: ids[1], amount: 3000, method: 'bank' });
  await run(env.DB, `INSERT INTO entries (id, tournament_id, event_code, class, member_id, partner_member_id, source, payment_id, status, created_at) VALUES (?, 'T-DEMO-OPEN', 'WD', 'A', ?, ?, 'web', ?, 'pending_payment', ?)`, ulid(), ids[1], ids[3], pe2.id, now);

  const admins = [
    ['sysadmin@example.com', '広報局長（システム管理者）', null, 'sysadmin', '[]'],
    ['tottori-admin@example.com', '鳥取市 事務局', 'tottori-city', 'assoc_admin', '[]'],
    ['pref-admin@example.com', '県協会 事務局', 'tottori-pref', 'assoc_admin', '[]'],
    ['unei@example.com', '大会運営（秋季ダブルス担当）', 'tottori-city', 'tournament', JSON.stringify(['T-DEMO-OPEN'])],
    ['viewer@example.com', '鳥取市 閲覧のみ', 'tottori-city', 'viewer', '[]'],
    ['shop@example.com', 'テニスショップ', 'tottori-city', 'shop', '[]'],
  ];
  for (const [email, name, assoc, role, tids] of admins) await run(env.DB, `INSERT INTO admins (id, email, name, association_id, role, tournament_ids_json, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`, ulid(), email, name, assoc, role, tids, now);

  await audit(env, { actorType: 'system', actor: 'seed', action: 'seed.demo', after: { members: ids.length, tournaments: tournaments.length } });
}

export async function counts(env: Env): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ['associations', 'clubs', 'members', 'registrations', 'tournaments', 'entries', 'payments', 'admins', 'audit_log', 'mail_outbox']) {
    const rows = await all<{ n: number }>(env.DB, `SELECT COUNT(*) AS n FROM ${t}`);
    out[t] = rows[0]?.n ?? 0;
  }
  return out;
}
