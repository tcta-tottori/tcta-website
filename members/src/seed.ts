// デモデータ（開発モードの /dev から投入）。暗号化が要るので SQL ではなく Worker 内で作る。
import type { Env } from './env';
import { audit } from './lib/audit';
import { all, nowIso, one, run } from './lib/db';
import { addDays, currentFiscalYear, todayJst } from './lib/fiscal';
import { ulid } from './lib/ulid';
import { createMember, findMemberByEmail } from './services/members';
import { createPayment, markPaid } from './services/payments';

const TABLES = ['deletion_requests', 'mail_outbox', 'reminders_sent', 'sequences', 'merge_candidates', 'rate_limits', 'api_tokens', 'sessions', 'magic_links', 'entries', 'registrations', 'payments', 'tournaments', 'admins', 'members', 'clubs', 'associations'];

export async function resetAll(env: Env): Promise<void> {
  for (const t of TABLES) await run(env.DB, `DELETE FROM ${t}`);
  // audit_log は削除不可のトリガーがあるので残る（サンプルでも「消せない」ことを確かめられる）
}

/**
 * デモデータを入れる。すでにデータがあるときは「足りないものだけ補う」（試しに入れた会員登録・年度登録・エントリーは消さない）。
 * 何も無いときだけ、デモ用のエントリーや名寄せ候補も作る。すべて消して最初からにするのは resetAll のあと。
 */
export async function seedDemo(env: Env): Promise<{ fresh: boolean; added: number }> {
  const fresh = !(await one(env.DB, 'SELECT 1 AS ok FROM associations LIMIT 1'));
  let added = 0;
  const now = nowIso();
  const today = todayJst();
  const assocs = [
    { id: 'tottori-pref', code: 'P', name: '鳥取県テニス協会', fee: 2000, order: 1 },
    { id: 'tottori-city', code: 'T', name: '鳥取市テニス協会', fee: 3000, order: 2 },
    { id: 'kurayoshi-city', code: 'K', name: '倉吉市テニス協会', fee: 2000, order: 3 },
    { id: 'yonago-city', code: 'Y', name: '米子市テニス協会', fee: 2500, order: 4 },
    { id: 'sakaiminato-city', code: 'S', name: '境港市テニス協会', fee: 2000, order: 5 },
  ];
  for (const a of assocs) {
    await run(env.DB, `INSERT OR IGNORE INTO associations (id, code, name, annual_fee, fiscal_year_start_month, reg_note, bank_info, paypay_info, stripe_account, created_at, sort_order) VALUES (?, ?, ?, ?, 4, ?, ?, ?, ?, ?, ?)`,
      a.id, a.code, a.name, a.fee, '年度登録は 4 月 1 日〜翌年 3 月 31 日が有効期間です。', `○○銀行 ○○支店 普通 1234567 ${a.name}`, `PayPay ID: ${a.code.toLowerCase()}-tennis`, `acct_demo_${a.code}`, now, a.order);
  }
  const clubs = [
    ['club-tottori-lc', '鳥取ローンテニスクラブ', '鳥取市'], ['club-koyama', '湖山テニスクラブ', '鳥取市'], ['club-tottori-univ', '鳥取大学テニス部', '鳥取市'],
    ['club-kurayoshi', '倉吉テニスクラブ', '倉吉市'], ['club-yonago', '米子ローンテニスクラブ', '米子市'], ['club-sakaiminato', '境港テニスクラブ', '境港市'],
  ];
  for (const [id, name, area] of clubs) await run(env.DB, `INSERT OR IGNORE INTO clubs (id, name, area, created_at) VALUES (?, ?, ?, ?)`, id, name, area, now);

  const fy = currentFiscalYear(4);
  const demo = [
    { fn: '山田', gn: '太郎', fk: 'やまだ', gk: 'たろう', sex: 'male', birth: 1985, email: 'yamada@example.com', phone: '090-0000-0001', postal: '680-0001', address: '鳥取市栄町1-1', club: 'club-tottori-lc', home: 'tottori-city', reg: ['tottori-city', 'tottori-pref'], manager: true },
    { fn: '佐藤', gn: '花子', fk: 'さとう', gk: 'はなこ', sex: 'female', birth: 1990, email: 'sato@example.com', phone: '090-0000-0002', postal: '680-0002', address: '鳥取市本町2-2', club: 'club-tottori-lc', home: 'tottori-city', reg: ['tottori-city'] },
    { fn: '鈴木', gn: '一郎', fk: 'すずき', gk: 'いちろう', sex: 'male', birth: 1972, email: 'suzuki@example.com', phone: '090-0000-0003', postal: '680-0003', address: '鳥取市湖山町3-3', club: 'club-koyama', home: 'tottori-city', reg: ['tottori-city'] },
    { fn: '田中', gn: '美咲', fk: 'たなか', gk: 'みさき', sex: 'female', birth: 2004, email: 'tanaka@example.com', phone: '090-0000-0004', postal: '680-0004', address: '鳥取市湖山町南4-4', club: 'club-tottori-univ', home: 'tottori-city', reg: [], pendingReg: 'tottori-city' },
    { fn: '高橋', gn: '健', fk: 'たかはし', gk: 'けん', sex: 'male', birth: 1995, email: 'takahashi@example.com', phone: '090-0000-0005', postal: '682-0001', address: '倉吉市駄経寺町5-5', club: 'club-kurayoshi', home: 'kurayoshi-city', reg: ['kurayoshi-city', 'tottori-pref'] },
    { fn: '伊藤', gn: '由美', fk: 'いとう', gk: 'ゆみ', sex: 'female', birth: 1988, email: 'ito@example.com', phone: '090-0000-0006', postal: '683-0001', address: '米子市加茂町6-6', club: 'club-yonago', home: 'yonago-city', reg: ['yonago-city'] },
    { fn: '松本', gn: '浩二', fk: 'まつもと', gk: 'こうじ', sex: 'male', birth: 1980, email: 'matsumoto@example.com', phone: '090-0000-0010', postal: '684-0004', address: '境港市大正町10-10', club: 'club-sakaiminato', home: 'sakaiminato-city', reg: ['sakaiminato-city', 'tottori-pref'] },
    { fn: '渡辺', gn: '翔', fk: 'わたなべ', gk: 'しょう', sex: 'male', birth: 1999, email: null, phone: null, postal: null, address: null, club: 'club-koyama', home: 'tottori-city', reg: [], status: 'provisional' as const },
    { fn: '山田', gn: '太郎', fk: 'やまだ', gk: 'たろう', sex: null, birth: null, email: null, phone: null, postal: null, address: null, club: null, home: 'tottori-city', reg: [], status: 'provisional' as const, dupOf: 0 },
  ];
  const ids: string[] = [];
  for (const d of demo) {
    // すでにいる会員（同じメール、または同じ氏名の仮会員）は作り直さない
    const existing = d.email
      ? await findMemberByEmail(env, d.email)
      : d.dupOf !== undefined
        ? await one<{ id: string }>(env.DB, `SELECT id FROM members WHERE family_name = ? AND given_name = ? AND status = 'provisional' AND email_hash IS NULL ORDER BY created_at DESC LIMIT 1`, d.fn, d.gn)
        : await one<{ id: string }>(env.DB, `SELECT id FROM members WHERE family_name = ? AND given_name = ? ORDER BY created_at LIMIT 1`, d.fn, d.gn);
    if (existing && !(d.dupOf !== undefined && existing.id === ids[d.dupOf])) { ids.push(existing.id); continue; }
    if (!fresh && d.dupOf !== undefined) { ids.push(''); continue; } // 名寄せ候補のデモは最初の 1 回だけ
    added++;
    const m = await createMember(env, { familyName: d.fn, givenName: d.gn, familyKana: d.fk, givenKana: d.gk, sex: d.sex, birthYear: d.birth, birthMonth: d.birth ? 4 : null, email: d.email, phone: d.phone, postal: d.postal, address: d.address, clubId: d.club, homeAssociationId: d.home, status: d.status ?? 'active', consented: Boolean(d.email) });
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

  // 何年も年度登録のない会員（連絡先の自動削除の確認用）。最後の登録は 4 年度前
  if (!(await findMemberByEmail(env, 'kobayashi@example.com'))) {
  added++;
  const old = await createMember(env, { familyName: '小林', givenName: '昭', familyKana: 'こばやし', givenKana: 'あきら', sex: 'male', birthYear: 1950, birthMonth: 8, email: 'kobayashi@example.com', phone: '090-0000-0009', postal: '680-0009', address: '鳥取市古町9-9', clubId: 'club-koyama', homeAssociationId: 'tottori-city', status: 'active', consented: true });
  await run(env.DB, `UPDATE members SET created_at = ? WHERE id = ?`, `${fy - 6}-05-01T00:00:00.000Z`, old.id);
  await run(env.DB, `INSERT INTO registrations (id, member_id, association_id, fiscal_year, category, fee, status, source, approved_by, approved_at, created_at) VALUES (?, ?, 'tottori-city', ?, 'senior', 3000, 'approved', 'import', 'seed', ?, ?)`, ulid(), old.id, fy - 4, now, now);
  }

  const events = JSON.stringify([
    { code: 'MD', name: '男子ダブルス', classes: ['A', 'B'], fee: 3000, teamSize: 2 },
    { code: 'WD', name: '女子ダブルス', classes: ['A', 'B'], fee: 3000, teamSize: 2 },
    { code: 'MS', name: '男子シングルス', classes: [], fee: 2000, teamSize: 1 },
  ]);
  // 参加資格の組み合わせを一通り（設計の検討用）。rule は「いずれかの行を満たす。行の中はすべて必要」
  const tournaments = [
    { id: 'T-DEMO-OPEN', assoc: 'tottori-city', name: `鳥取市秋季ダブルス大会（Phase 1 試行）`, held: addDays(today, 30), venue: '鳥取市営コート', start: addDays(today, -7), end: addDays(today, 14), status: 'open', methods: ['stripe', 'bank', 'paypay', 'cash'], policy: 'hold', rule: [['tottori-city']], note: '鳥取市登録が必要です（県登録だけでは出場できません）' },
    { id: 'T-DEMO-PREF', assoc: 'tottori-pref', name: `鳥取県選手権（県主催）`, held: addDays(today, 45), venue: '県立コート', start: addDays(today, -3), end: addDays(today, 21), status: 'open', methods: ['stripe', 'bank'], policy: 'cancel', rule: [['tottori-pref']], note: '県登録が必要です' },
    { id: 'T-DEMO-OPEN2', assoc: 'tottori-city', name: `鳥取市オープンシングルス（市 または 県登録）`, held: addDays(today, 40), venue: '鳥取市営コート', start: addDays(today, -5), end: addDays(today, 18), status: 'open', methods: ['stripe', 'bank', 'cash'], policy: 'hold', rule: [['tottori-city'], ['tottori-pref']], note: '鳥取市登録か県登録のどちらかがあれば出場できます' },
    { id: 'T-DEMO-BOTH', assoc: 'tottori-city', name: `県選手権 鳥取市予選（県＋市登録）`, held: addDays(today, 35), venue: '鳥取市営コート', start: addDays(today, -5), end: addDays(today, 16), status: 'open', methods: ['stripe', 'bank'], policy: 'hold', rule: [['tottori-pref', 'tottori-city']], note: '県登録と鳥取市登録の両方が必要です' },
    { id: 'T-DEMO-YONAGO', assoc: 'yonago-city', name: `米子市ダブルス選手権`, held: addDays(today, 50), venue: '米子市営コート', start: addDays(today, -2), end: addDays(today, 25), status: 'open', methods: ['stripe', 'bank'], policy: 'hold', rule: [['yonago-city']], note: '米子市登録が必要です' },
    { id: 'T-DEMO-SAKAI', assoc: 'sakaiminato-city', name: `境港市民テニス大会`, held: addDays(today, 55), venue: '境港市営コート', start: addDays(today, -1), end: addDays(today, 28), status: 'open', methods: ['bank', 'cash'], policy: 'hold', rule: [['sakaiminato-city']], note: '境港市登録が必要です' },
    { id: 'T-DEMO-ANYONE', assoc: 'tottori-city', name: `鳥取市ふれあいテニス大会（どなたでも）`, held: addDays(today, 28), venue: '鳥取市営コート', start: addDays(today, -7), end: addDays(today, 12), status: 'open', methods: ['stripe', 'bank', 'cash'], policy: 'hold', rule: [], note: '年度登録のない方も参加できます', partner: 'none' },
    { id: 'T-DEMO-CLOSED', assoc: 'tottori-city', name: `鳥取市春季シングルス大会（締切済み）`, held: addDays(today, -60), venue: '鳥取市営コート', start: addDays(today, -120), end: addDays(today, -80), status: 'closed', methods: ['bank', 'cash'], policy: 'hold', rule: [['tottori-city']], note: null },
  ];
  for (const t of tournaments) {
    await run(env.DB, `INSERT OR IGNORE INTO tournaments (id, association_id, name, held_on, venue, entry_start, entry_end, eligibility, requires_registration, eligibility_json, partner_rule, events_json, payment_methods_json, unpaid_policy, capacity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 64, ?, ?)`,
      t.id, t.assoc, t.name, t.held, t.venue, t.start, t.end, t.note, t.rule.length ? 1 : 0, JSON.stringify(t.rule), t.partner ?? 'same', events, JSON.stringify(t.methods), t.policy, t.status, now);
  }
  // デモのエントリー（確定 1 件・支払待ち 1 件）は、何も無いところから入れたときだけ
  if (fresh) {
  const pe = await createPayment(env, { kind: 'entry', associationId: 'tottori-city', payerMemberId: ids[2], amount: 3000, method: 'stripe' });
  await run(env.DB, `INSERT INTO entries (id, tournament_id, event_code, class, member_id, partner_member_id, source, payment_id, status, created_at) VALUES (?, 'T-DEMO-OPEN', 'MD', 'B', ?, ?, 'web', ?, 'pending_payment', ?)`, ulid(), ids[2], ids[6], pe.id, now);
  await markPaid(env, pe.id, { actorType: 'system', actor: 'stripe:webhook', externalId: 'cs_demo_seed' });
  const pe2 = await createPayment(env, { kind: 'entry', associationId: 'tottori-city', payerMemberId: ids[1], amount: 3000, method: 'bank' });
  await run(env.DB, `INSERT INTO entries (id, tournament_id, event_code, class, member_id, partner_member_id, source, payment_id, status, created_at) VALUES (?, 'T-DEMO-OPEN', 'WD', 'A', ?, ?, 'web', ?, 'pending_payment', ?)`, ulid(), ids[1], ids[3], pe2.id, now);

  }

  const admins = [
    ['sysadmin@example.com', '広報局長（システム管理者）', null, 'sysadmin', '[]'],
    ['tottori-admin@example.com', '鳥取市 事務局', 'tottori-city', 'assoc_admin', '[]'],
    ['pref-admin@example.com', '県協会 事務局', 'tottori-pref', 'assoc_admin', '[]'],
    ['sakaiminato-admin@example.com', '境港市 事務局', 'sakaiminato-city', 'assoc_admin', '[]'],
    ['unei@example.com', '大会運営（秋季ダブルス担当）', 'tottori-city', 'tournament', JSON.stringify(['T-DEMO-OPEN'])],
    ['viewer@example.com', '鳥取市 閲覧のみ', 'tottori-city', 'viewer', '[]'],
    ['shop@example.com', 'テニスショップ', 'tottori-city', 'shop', '[]'],
  ];
  for (const [email, name, assoc, role, tids] of admins) await run(env.DB, `INSERT OR IGNORE INTO admins (id, email, name, association_id, role, tournament_ids_json, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`, ulid(), email, name, assoc, role, tids, now);

  await audit(env, { actorType: 'system', actor: 'seed', action: fresh ? 'seed.demo' : 'seed.top_up', after: { added_members: added, tournaments: tournaments.length } });
  return { fresh, added };
}

export async function counts(env: Env): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ['associations', 'clubs', 'members', 'registrations', 'tournaments', 'entries', 'payments', 'admins', 'audit_log', 'mail_outbox']) {
    const rows = await all<{ n: number }>(env.DB, `SELECT COUNT(*) AS n FROM ${t}`);
    out[t] = rows[0]?.n ?? 0;
  }
  return out;
}
