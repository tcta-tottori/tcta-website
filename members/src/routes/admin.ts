// 事務局の管理画面。Cloudflare Access（本番）か開発モードの選択ログインで入り、ロールごとに見える範囲を分ける。
import { Hono } from 'hono';
import { html } from 'hono/html';
import { clientIp, type Ctx, form, type Vars } from '../app';
import { type Env, isProd } from '../env';
import { accessEnabled, verifyAccessJwt } from '../lib/access';
import { audit } from '../lib/audit';
import { decrypt, randomToken, sha256Hex } from '../lib/crypto';
import { all, nowIso, one, run } from '../lib/db';
import { currentFiscalYear, fmtDate, fmtDateTime, jstDayRange, todayJst, yen } from '../lib/fiscal';
import { sendMail } from '../lib/mail';
import { createSession, destroySession, flash, readSession } from '../lib/session';
import { ulid } from '../lib/ulid';
import { createMember, decryptContact, findSameNameMembers, normalizeKana, updateMember } from '../services/members';
import { cancelEntry, getPayment, markPaid } from '../services/payments';
import { canApproveRegistration, canConfirmPayment, canCreateTournament, canEditMembers, canExportMembers, canImport, canManageAdmins, canViewPii, canViewTournament, memberScope, ownsTournament } from '../services/permissions';
import { type Admin, type Association, CATEGORY_LABEL, type Club, type Entry, METHOD_LABEL, type Member, type Payment, type Registration, ROLE_LABEL, type Tournament, type TournamentEvent, STATUS_LABEL } from '../types';
import { badge, page } from '../views/layout';

export const admin = new Hono<{ Bindings: Env; Variables: Vars }>();
type C = Ctx;

// ---------- 認証 ----------
export async function resolveAdmin(c: C): Promise<Admin | null> {
  let email: string | null = null;
  if (accessEnabled(c.env)) email = await verifyAccessJwt(c.env, c.req.header('Cf-Access-Jwt-Assertion'));
  else if (!isProd(c.env)) {
    const id = await readSession(c, 'admin');
    if (id) return one<Admin>(c.env.DB, 'SELECT * FROM admins WHERE id = ? AND active = 1', id);
  }
  if (!email) return null;
  return one<Admin>(c.env.DB, 'SELECT * FROM admins WHERE email = ? AND active = 1', email.toLowerCase());
}

admin.get('/login', async (c) => {
  if (isProd(c.env) || accessEnabled(c.env)) return c.notFound();
  const admins = await all<Admin & { association_name: string | null }>(c.env.DB, 'SELECT a.*, s.name AS association_name FROM admins a LEFT JOIN associations s ON s.id = a.association_id WHERE a.active = 1 ORDER BY a.role, a.email');
  const body = html`<div class="card"><p class="mute">本番では Cloudflare Access（Google または メール OTP ＋ 2 段階認証）がこの画面の代わりになり、Access のグループ＝協会で閲覧範囲が決まります。開発モードでは管理者を選ぶだけで入れます。</p>
    <form method="post" action="/admin/login"><div class="radio-list">${admins.map((a) => html`<label><input type="radio" name="id" value="${a.id}" required> ${a.name} — ${ROLE_LABEL[a.role]}${a.association_name ? `（${a.association_name}）` : ''} <span class="mute">${a.email}</span></label>`)}</div>
    ${admins.length === 0 ? html`<p class="warn">管理者がいません。<a href="/dev">デモデータ</a>を入れてください。</p>` : ''}
    <div class="actions"><button class="primary">この管理者でログイン</button></div></form></div>`;
  return c.html(page(c, { title: '事務局ログイン（開発モード）', body }));
});
admin.post('/login', async (c) => {
  if (isProd(c.env) || accessEnabled(c.env)) return c.notFound();
  const f = await form(c);
  const a = await one<Admin>(c.env.DB, 'SELECT * FROM admins WHERE id = ? AND active = 1', f.id);
  if (!a) return c.redirect('/admin/login');
  await createSession(c, 'admin', a.id);
  await audit(c.env, { actorType: 'admin', actor: a.email, action: 'admin.login', after: { mode: 'dev' }, ip: clientIp(c) });
  return c.redirect(a.role === 'shop' ? '/shop' : '/admin');
});
admin.post('/logout', async (c) => {
  await destroySession(c, 'admin');
  return c.redirect('/');
});

admin.use('*', async (c, next) => {
  if (c.req.path === '/admin/login' || c.req.path === '/admin/logout') return next();
  const a = c.get('admin');
  if (!a) {
    if (accessEnabled(c.env) || isProd(c.env)) return c.text('Cloudflare Access の認証が必要です（admins に登録されたメールでログインしてください）', 401);
    return c.redirect('/admin/login');
  }
  if (a.role === 'shop') return c.redirect('/shop');
  await next();
});

const A = (c: C) => c.get('admin')!;
const actor = (c: C) => ({ actorType: 'admin' as const, actor: A(c).email, ip: clientIp(c) });

// ---------- ダッシュボード ----------
admin.get('/', async (c) => {
  const a = A(c);
  const scope = a.association_id;
  const fy = currentFiscalYear(4);
  const n = async (sql: string, ...p: unknown[]) => (await one<{ n: number }>(c.env.DB, sql, ...p))?.n ?? 0;
  const stats: [string, number][] = [];
  if (a.role === 'assoc_admin') {
    stats.push(['年度登録 承認待ち', await n(`SELECT COUNT(*) AS n FROM registrations r JOIN payments p ON p.id = r.payment_id WHERE r.association_id = ? AND r.status = 'pending' AND p.status = 'paid'`, scope)]);
    stats.push(['消込待ち（振込・PayPay・現金）', await n(`SELECT COUNT(*) AS n FROM payments WHERE association_id = ? AND status = 'pending' AND method <> 'stripe'`, scope)]);
    stats.push(['名寄せ候補', await n(`SELECT COUNT(*) AS n FROM merge_candidates WHERE status = 'open'`)]);
  }
  if (scope) stats.push([`${fy}年度 登録者`, await n(`SELECT COUNT(*) AS n FROM registrations WHERE association_id = ? AND fiscal_year = ? AND status = 'approved'`, scope, fy)]);
  stats.push(['受付中の大会', await n(`SELECT COUNT(*) AS n FROM tournaments WHERE status = 'open'${scope ? ' AND association_id = ?' : ''}`, ...(scope ? [scope] : []))]);
  stats.push(['本日のエントリー', await n(`SELECT COUNT(*) AS n FROM entries WHERE created_at >= ? AND created_at < ?`, ...jstDayRange(todayJst()))]);
  const body = html`<div class="grid">${stats.map(([l, v]) => html`<div class="stat"><b>${v}</b><span>${l}</span></div>`)}</div>
    <div class="card"><h2>このロールでできること</h2>${roleHelp(a)}</div>`;
  return c.html(page(c, { title: 'ダッシュボード', body, admin: a }));
});

function roleHelp(a: Admin) {
  const rows: Record<string, string> = {
    assoc_admin: '自協会の登録者の氏名・住所・電話の閲覧と編集、年度登録の承認、振込・PayPay・現金の消込、名簿 CSV の出力（目的を記録）、大会の作成、Excel 名簿の取込みと名寄せ。他協会のデータは見えません。',
    tournament: '担当大会のエントリー一覧（氏名・クラブ・クラス）の閲覧、担当大会分の消込、ドロー用 JSON・CSV の出力。住所・電話・メールは見えません。',
    viewer: '自協会の登録者の氏名・クラブと大会のエントリー一覧の閲覧のみ。',
    sysadmin: '協会・管理者・大会の設定と監査ログの確認。会員の個人情報は見えません（設定専用）。',
    shop: '代行入力画面のみ。',
  };
  return html`<p>${rows[a.role]}</p>`;
}

// ---------- 会員 ----------
admin.get('/members', async (c) => {
  const a = A(c);
  const scope = memberScope(a);
  if (!scope) return c.text('このロールでは名簿を見られません', 403);
  const q = c.req.query('q')?.trim() ?? '';
  const fy = currentFiscalYear(4);
  const rows = await all<Member & { club_name: string | null; reg_status: string | null }>(
    c.env.DB,
    `SELECT m.*, c.name AS club_name, (SELECT r.status FROM registrations r WHERE r.member_id = m.id AND r.association_id = ? AND r.fiscal_year = ? LIMIT 1) AS reg_status
       FROM members m LEFT JOIN clubs c ON c.id = m.club_id
      WHERE m.merged_into IS NULL AND (m.home_association_id = ? OR EXISTS (SELECT 1 FROM registrations r WHERE r.member_id = m.id AND r.association_id = ?))
        AND (? = '' OR m.name LIKE ? OR m.kana LIKE ? OR m.member_no = ?)
      ORDER BY m.kana LIMIT 300`,
    scope, fy, scope, scope, q, `%${q}%`, `%${normalizeKana(q)}%`, q,
  );
  const body = html`<form method="get" action="/admin/members"><input type="text" name="q" value="${q}" placeholder="氏名・ふりがな・会員番号"> <button class="small">検索</button></form>
    <div class="tbl"><table><tr><th>会員番号</th><th>氏名</th><th>ふりがな</th><th>クラブ</th><th>状態</th><th>${fy}年度</th><th></th></tr>
    ${rows.map((m) => html`<tr><td>${m.member_no ?? '—'}</td><td>${m.name}</td><td>${m.kana}</td><td>${m.club_name ?? '—'}</td><td>${badge(m.status)}</td><td>${m.reg_status ? badge(m.reg_status) : '—'}</td><td><a href="/admin/members/${m.id}">詳細</a></td></tr>`)}
    </table></div>
    ${canExportMembers(a) ? html`<form method="post" action="/admin/members/export.csv" class="card"><h3>名簿 CSV 出力</h3><p class="mute">出力は監査ログに「誰が・いつ・何の目的で」記録されます。Excel・USB・メール添付での名簿授受は禁止です。</p><label>目的 <input type="text" name="purpose" required placeholder="例: 県協会への登録者数報告"></label><button>CSV をダウンロード</button></form>` : ''}`;
  return c.html(page(c, { title: '会員一覧', body, admin: a, wide: true }));
});

admin.post('/members/export.csv', async (c) => {
  const a = A(c);
  if (!canExportMembers(a)) return c.text('forbidden', 403);
  const f = await form(c);
  const fy = currentFiscalYear(4);
  const rows = await all<Member & { club_name: string | null; category: string }>(c.env.DB, `SELECT m.*, c.name AS club_name, r.category FROM registrations r JOIN members m ON m.id = r.member_id LEFT JOIN clubs c ON c.id = m.club_id WHERE r.association_id = ? AND r.fiscal_year = ? AND r.status = 'approved' ORDER BY m.kana`, a.association_id, fy);
  const lines = ['会員番号,氏名,ふりがな,性別,生年,クラブ,区分,メール,電話,郵便番号,住所'];
  for (const m of rows) {
    const ct = await decryptContact(c.env, m);
    lines.push([m.member_no, m.name, m.kana, m.sex, m.birth_year, m.club_name, CATEGORY_LABEL[m.category], ct.email, ct.phone, ct.postal, ct.address].map(csv).join(','));
  }
  await audit(c.env, { ...actor(c), action: 'members.export_csv', target: `association:${a.association_id}`, after: { purpose: f.purpose, count: rows.length, fiscal_year: fy } });
  return c.body('﻿' + lines.join('\r\n'), 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="members-${fy}.csv"` });
});
const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

admin.get('/members/:id', async (c) => {
  const a = A(c);
  if (!memberScope(a)) return c.text('forbidden', 403);
  const m = await one<Member>(c.env.DB, 'SELECT * FROM members WHERE id = ?', c.req.param('id'));
  if (!m) return c.notFound();
  const club = m.club_id ? await one<Club>(c.env.DB, 'SELECT * FROM clubs WHERE id = ?', m.club_id) : null;
  const regs = await all<Registration & { association_name: string }>(c.env.DB, 'SELECT r.*, a.name AS association_name FROM registrations r JOIN associations a ON a.id = r.association_id WHERE r.member_id = ? ORDER BY r.fiscal_year DESC', m.id);
  const entries = await all<Entry & { t_name: string }>(c.env.DB, 'SELECT e.*, t.name AS t_name FROM entries e JOIN tournaments t ON t.id = e.tournament_id WHERE e.member_id = ? OR e.partner_member_id = ? ORDER BY e.created_at DESC', m.id, m.id);
  let pii = html`<p class="mute">このロールでは住所・電話・メールを閲覧できません。</p>`;
  if (canViewPii(a)) {
    const ct = await decryptContact(c.env, m);
    await audit(c.env, { ...actor(c), action: 'member.view_pii', target: `member:${m.id}` });
    pii = html`<dl class="kv"><dt>メール</dt><dd>${ct.email ?? '—'}</dd><dt>電話</dt><dd>${ct.phone ?? '—'}</dd><dt>住所</dt><dd>${ct.postal ? `〒${ct.postal} ` : ''}${ct.address ?? '—'}</dd></dl><p class="mute">この閲覧は監査ログに記録されました。</p>
      ${canEditMembers(a) ? html`<details><summary>連絡先・所属を編集</summary><form method="post" action="/admin/members/${m.id}">
        <label>氏名 <input type="text" name="name" value="${m.name}" required></label><label>ふりがな <input type="text" name="kana" value="${m.kana}" required></label>
        <label>クラブ <select name="club_id">${(await all<Club>(c.env.DB, 'SELECT * FROM clubs ORDER BY name')).map((cl) => html`<option value="${cl.id}" ${cl.id === m.club_id ? 'selected' : ''}>${cl.name}</option>`)}</select></label>
        <label>メール <input type="email" name="email" value="${ct.email ?? ''}"></label><label>電話 <input type="tel" name="phone" value="${ct.phone ?? ''}"></label><label>郵便番号 <input type="text" name="postal" value="${ct.postal ?? ''}"></label><label>住所 <input type="text" name="address" value="${ct.address ?? ''}"></label>
        <label>状態 <select name="status">${['active', 'provisional', 'withdrawn'].map((s) => html`<option value="${s}" ${s === m.status ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`)}</select></label>
        <div class="actions"><button class="primary">保存</button></div></form></details>` : ''}`;
  }
  const body = html`<div class="card"><dl class="kv"><dt>会員番号</dt><dd><b>${m.member_no ?? '—'}</b></dd><dt>氏名</dt><dd>${m.name}（${m.kana}）</dd><dt>クラブ</dt><dd>${club?.name ?? '—'}</dd><dt>状態</dt><dd>${badge(m.status)}</dd><dt>生年</dt><dd>${m.birth_year ?? '—'}</dd><dt>登録日</dt><dd>${fmtDateTime(m.created_at)}</dd></dl></div>
    <div class="card"><h2>連絡先</h2>${pii}</div>
    <h2>年度登録</h2><div class="tbl"><table><tr><th>年度</th><th>協会</th><th>区分</th><th>状態</th><th>承認</th></tr>${regs.map((r) => html`<tr><td>${r.fiscal_year}</td><td>${r.association_name}</td><td>${CATEGORY_LABEL[r.category]}</td><td>${badge(r.status)}</td><td>${r.approved_by ?? ''} ${fmtDateTime(r.approved_at)}</td></tr>`)}</table></div>
    <h2>エントリー</h2><div class="tbl"><table><tr><th>大会</th><th>種目</th><th>状態</th><th>受付</th></tr>${entries.map((e) => html`<tr><td>${e.t_name}</td><td>${e.event_code}${e.class ? ' ' + e.class : ''}</td><td>${badge(e.status)}</td><td>${e.source} ${fmtDateTime(e.created_at)}</td></tr>`)}</table></div>`;
  return c.html(page(c, { title: `会員: ${m.name}`, body, admin: a }));
});

admin.post('/members/:id', async (c) => {
  const a = A(c);
  if (!canEditMembers(a)) return c.text('forbidden', 403);
  const m = await one<Member>(c.env.DB, 'SELECT * FROM members WHERE id = ?', c.req.param('id'));
  if (!m) return c.notFound();
  const f = await form(c);
  await updateMember(c.env, m.id, { name: f.name, kana: f.kana, clubId: f.club_id || null, email: f.email || null, phone: f.phone || null, postal: f.postal || null, address: f.address || null, status: f.status });
  if (f.status === 'withdrawn' && m.status !== 'withdrawn') await run(c.env.DB, 'UPDATE members SET withdrawn_at = ? WHERE id = ?', nowIso(), m.id);
  await audit(c.env, { ...actor(c), action: 'member.update', target: `member:${m.id}`, before: { name: m.name, kana: m.kana, club_id: m.club_id, status: m.status }, after: { name: f.name, kana: f.kana, club_id: f.club_id, status: f.status, contact_changed: true } });
  flash(c, '会員情報を更新しました');
  return c.redirect(`/admin/members/${m.id}`);
});

// ---------- 年度登録の承認 ----------
admin.get('/registrations', async (c) => {
  const a = A(c);
  if (!canApproveRegistration(a)) return c.text('forbidden', 403);
  const status = c.req.query('status') ?? 'pending';
  const rows = await all<Registration & { name: string; kana: string; member_no: string | null; club_name: string | null; pay_status: string; method: string; payment_amount: number }>(
    c.env.DB,
    `SELECT r.*, m.name, m.kana, m.member_no, c.name AS club_name, p.status AS pay_status, p.method, p.amount AS payment_amount
       FROM registrations r JOIN members m ON m.id = r.member_id LEFT JOIN clubs c ON c.id = m.club_id LEFT JOIN payments p ON p.id = r.payment_id
      WHERE r.association_id = ? AND r.status = ? ORDER BY r.created_at DESC LIMIT 300`,
    a.association_id, status,
  );
  const body = html`<p>${['pending', 'approved', 'rejected'].map((s) => html`<a class="btn small ${s === status ? '' : 'btn--outline'}" href="/admin/registrations?status=${s}">${STATUS_LABEL[s]}</a> `)}</p>
    <div class="tbl"><table><tr><th>申請日</th><th>年度</th><th>会員番号</th><th>氏名</th><th>クラブ</th><th>区分</th><th>登録料</th><th>支払</th><th>経路</th><th></th></tr>
    ${rows.map((r) => html`<tr><td>${fmtDate(r.created_at)}</td><td>${r.fiscal_year}</td><td>${r.member_no ?? '—'}</td><td><a href="/admin/members/${r.member_id}">${r.name}</a></td><td>${r.club_name ?? '—'}</td><td>${CATEGORY_LABEL[r.category]}</td><td>${yen(r.fee)}</td><td>${badge(r.pay_status)} <span class="mute">${METHOD_LABEL[r.method]?.split('（')[0]}</span></td><td>${r.source}</td>
      <td>${r.status === 'pending' ? html`${r.pay_status === 'pending' ? html`<form method="post" action="/admin/payments/${r.payment_id}/confirm" class="inline"><input type="hidden" name="back" value="/admin/registrations"><button class="small">入金確認</button></form> ` : ''}${r.pay_status === 'paid' ? html`<form method="post" action="/admin/registrations/${r.id}/approve" class="inline"><button class="small primary">承認</button></form> ` : ''}<form method="post" action="/admin/registrations/${r.id}/reject" class="inline"><button class="small btn--outline">却下</button></form>` : ''}</td></tr>`)}
    ${rows.length === 0 ? html`<tr><td colspan="10">該当なし</td></tr>` : ''}
    </table></div>`;
  return c.html(page(c, { title: '年度登録の承認', body, admin: a, wide: true }));
});

admin.post('/registrations/:id/:act', async (c) => {
  const a = A(c);
  if (!canApproveRegistration(a)) return c.text('forbidden', 403);
  const r = await one<Registration>(c.env.DB, 'SELECT * FROM registrations WHERE id = ? AND association_id = ?', c.req.param('id'), a.association_id);
  if (!r) return c.notFound();
  const act = c.req.param('act');
  if (act === 'approve') {
    const p = r.payment_id ? await getPayment(c.env, r.payment_id) : null;
    if (p && p.status !== 'paid') { flash(c, '入金が確認できていません', 'err'); return c.redirect('/admin/registrations'); }
    await run(c.env.DB, `UPDATE registrations SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`, a.email, nowIso(), r.id);
    await run(c.env.DB, `UPDATE members SET status = 'active', updated_at = ? WHERE id = ? AND status = 'provisional' AND email_hash IS NOT NULL`, nowIso(), r.member_id);
    await audit(c.env, { ...actor(c), action: 'registration.approve', target: `registration:${r.id}`, before: { status: r.status }, after: { status: 'approved' } });
    const m = await one<Member>(c.env.DB, 'SELECT * FROM members WHERE id = ?', r.member_id);
    const email = m ? await decrypt(c.env, m.email_enc) : null;
    const assoc = await one<Association>(c.env.DB, 'SELECT * FROM associations WHERE id = ?', r.association_id);
    if (email) await sendMail(c.env, { to: email, subject: `【${c.env.APP_NAME}】${r.fiscal_year}年度の登録が承認されました（${assoc?.name}）`, text: `${m!.name} 様\n\n${assoc?.name}の${r.fiscal_year}年度登録を承認しました。会員番号 ${m!.member_no ?? ''}\n当年度の大会にエントリーできます。\n${c.env.BASE_URL}/tournaments` });
    flash(c, '承認しました');
  } else if (act === 'reject') {
    await run(c.env.DB, `UPDATE registrations SET status = 'rejected', approved_by = ?, approved_at = ? WHERE id = ?`, a.email, nowIso(), r.id);
    await audit(c.env, { ...actor(c), action: 'registration.reject', target: `registration:${r.id}`, before: { status: r.status }, after: { status: 'rejected' } });
    flash(c, '却下しました');
  }
  return c.redirect('/admin/registrations');
});

// ---------- 消込 ----------
admin.get('/payments', async (c) => {
  const a = A(c);
  const rows = await all<Payment & { payer_name: string | null; member_no: string | null; t_id: string | null; t_name: string | null }>(
    c.env.DB,
    `SELECT p.*, m.name AS payer_name, m.member_no, t.id AS t_id, t.name AS t_name
       FROM payments p LEFT JOIN members m ON m.id = p.payer_member_id
       LEFT JOIN entries e ON e.payment_id = p.id LEFT JOIN tournaments t ON t.id = e.tournament_id
      WHERE p.status = 'pending' AND p.method <> 'stripe' ${a.role === 'assoc_admin' ? 'AND p.association_id = ?' : ''}
      GROUP BY p.id ORDER BY p.created_at`,
    ...(a.role === 'assoc_admin' ? [a.association_id] : []),
  );
  const visible: typeof rows = [];
  for (const p of rows) {
    const t = p.t_id ? await one<Tournament>(c.env.DB, 'SELECT * FROM tournaments WHERE id = ?', p.t_id) : null;
    if (canConfirmPayment(a, p, t)) visible.push(p);
  }
  const body = html`<p class="mute">Stripe 分は Webhook で自動消込されるのでここには出ません。振込・PayPay・現金を通帳や受領と突き合わせて確認します。</p>
    <div class="tbl"><table><tr><th>作成日</th><th>内容</th><th>支払者</th><th>金額</th><th>方法</th><th>メモ</th><th></th></tr>
    ${visible.map((p) => html`<tr><td>${fmtDate(p.created_at)}</td><td class="wrap-text">${p.note ?? p.kind}</td><td>${p.member_no ?? ''} ${p.payer_name ?? '—'}</td><td>${yen(p.amount)}</td><td>${METHOD_LABEL[p.method]?.split('（')[0]}</td>
      <td><form method="post" action="/admin/payments/${p.id}/confirm" class="inline"><input type="text" name="note" placeholder="通帳の日付・名義など" style="max-width:220px"> <button class="small primary">入金確認</button></form></td>
      <td><form method="post" action="/admin/payments/${p.id}/cancel" class="inline"><button class="small btn--outline">取消</button></form></td></tr>`)}
    ${visible.length === 0 ? html`<tr><td colspan="7">消込待ちはありません</td></tr>` : ''}
    </table></div>`;
  return c.html(page(c, { title: '入金の消込', body, admin: a, wide: true }));
});

admin.post('/payments/:id/confirm', async (c) => {
  const a = A(c);
  const p = await getPayment(c.env, c.req.param('id'));
  if (!p) return c.notFound();
  const e = await one<Entry>(c.env.DB, 'SELECT * FROM entries WHERE payment_id = ?', p.id);
  const t = e ? await one<Tournament>(c.env.DB, 'SELECT * FROM tournaments WHERE id = ?', e.tournament_id) : null;
  if (!canConfirmPayment(a, p, t)) return c.text('forbidden', 403);
  const f = await form(c);
  await markPaid(c.env, p.id, { ...actor(c), note: f.note || null });
  flash(c, `入金を確認しました（${yen(p.amount)}）`);
  return c.redirect(f.back || '/admin/payments');
});
admin.post('/payments/:id/cancel', async (c) => {
  const a = A(c);
  const p = await getPayment(c.env, c.req.param('id'));
  if (!p || p.status !== 'pending') return c.notFound();
  if (!canConfirmPayment(a, p, null) && a.role !== 'assoc_admin') return c.text('forbidden', 403);
  await run(c.env.DB, `UPDATE payments SET status = 'cancelled' WHERE id = ?`, p.id);
  const es = await all<Entry>(c.env.DB, 'SELECT * FROM entries WHERE payment_id = ?', p.id);
  for (const e of es) await cancelEntry(c.env, e.id, '事務局が支払を取消', actor(c));
  await run(c.env.DB, `UPDATE registrations SET status = 'rejected', approved_by = ?, approved_at = ? WHERE payment_id = ? AND status = 'pending'`, a.email, nowIso(), p.id);
  await audit(c.env, { ...actor(c), action: 'payment.cancel', target: `payment:${p.id}` });
  flash(c, '支払を取り消しました');
  return c.redirect('/admin/payments');
});

// ---------- 大会 ----------
const EVENT_HELP = '1 行 1 種目: コード,種目名,クラス（| 区切り、無ければ空）,参加費,人数（1 or 2）\n例: MD,男子ダブルス,A|B,3000,2';
function parseEvents(text: string): TournamentEvent[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [code, name, classes, fee, size] = l.split(',').map((s) => s.trim());
    return { code, name, classes: classes ? classes.split('|').filter(Boolean) : [], fee: Number(fee) || 0, teamSize: Number(size) === 2 ? 2 : 1 };
  });
}
function eventsText(t?: Tournament | null): string {
  if (!t) return 'MD,男子ダブルス,A|B,3000,2\nWD,女子ダブルス,A|B,3000,2\nMS,男子シングルス,,2000,1';
  return (JSON.parse(t.events_json) as TournamentEvent[]).map((e) => [e.code, e.name, e.classes.join('|'), e.fee, e.teamSize].join(',')).join('\n');
}

admin.get('/tournaments', async (c) => {
  const a = A(c);
  const rows = (await all<Tournament & { association_name: string; n_confirmed: number; n_pending: number }>(c.env.DB, `SELECT t.*, a.name AS association_name,
      (SELECT COUNT(*) FROM entries e WHERE e.tournament_id = t.id AND e.status = 'confirmed') AS n_confirmed,
      (SELECT COUNT(*) FROM entries e WHERE e.tournament_id = t.id AND e.status = 'pending_payment') AS n_pending
      FROM tournaments t JOIN associations a ON a.id = t.association_id ORDER BY t.held_on DESC`)).filter((t) => canViewTournament(a, t));
  const body = html`${canCreateTournament(a) ? html`<p><a class="btn primary" href="/admin/tournaments/new">大会を作る</a></p>` : ''}
    <div class="tbl"><table><tr><th>大会</th><th>主催</th><th>開催日</th><th>受付</th><th>確定</th><th>支払待ち</th><th>状態</th></tr>
    ${rows.map((t) => html`<tr><td><a href="/admin/tournaments/${t.id}">${t.name}</a></td><td>${t.association_name}</td><td>${fmtDate(t.held_on)}</td><td>${fmtDate(t.entry_start)}〜${fmtDate(t.entry_end)}</td><td>${t.n_confirmed}</td><td>${t.n_pending}</td><td>${badge(t.status)}</td></tr>`)}</table></div>`;
  return c.html(page(c, { title: '大会', body, admin: a, wide: true }));
});

function tournamentForm(t: Tournament | null, assocs: Association[], a: Admin) {
  const methods = t ? (JSON.parse(t.payment_methods_json) as string[]) : ['stripe', 'bank'];
  return html`<form method="post" action="${t ? `/admin/tournaments/${t.id}` : '/admin/tournaments'}" class="card">
    <label>主催協会 <select name="association_id">${assocs.filter((s) => a.role === 'sysadmin' || s.id === a.association_id).map((s) => html`<option value="${s.id}" ${t?.association_id === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>
    <label>大会名 <input type="text" name="name" required value="${t?.name ?? ''}"></label>
    <label>開催日 <input type="date" name="held_on" required value="${t?.held_on ?? ''}"></label>
    <label>会場 <input type="text" name="venue" value="${t?.venue ?? ''}"></label>
    <label>受付開始 <input type="date" name="entry_start" required value="${t?.entry_start ?? todayJst()}"></label>
    <label>受付締切 <input type="date" name="entry_end" required value="${t?.entry_end ?? ''}"></label>
    <label>参加資格（表示用） <input type="text" name="eligibility" value="${t?.eligibility ?? '主催協会の当年度登録者'}"></label>
    <label class="check"><input type="checkbox" name="requires_registration" ${!t || t.requires_registration ? 'checked' : ''}> 主催協会の当年度登録（承認済み）を必須にする</label>
    <label>種目 <textarea name="events">${eventsText(t)}</textarea></label><p class="mute">${EVENT_HELP}</p>
    <label>使える支払方法</label>${Object.entries(METHOD_LABEL).map(([k, l]) => html`<label class="check"><input type="checkbox" name="methods" value="${k}" ${methods.includes(k) ? 'checked' : ''}> ${l}</label>`)}
    <label>締切時に支払待ちのエントリーを <select name="unpaid_policy"><option value="hold" ${t?.unpaid_policy !== 'cancel' ? 'selected' : ''}>保留して事務局が判断</option><option value="cancel" ${t?.unpaid_policy === 'cancel' ? 'selected' : ''}>自動キャンセル</option></select></label>
    <label>定員（組） <input type="number" name="capacity" value="${t?.capacity ?? ''}"></label>
    <label>状態 <select name="status">${['draft', 'open', 'closed'].map((s) => html`<option value="${s}" ${(t?.status ?? 'draft') === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`)}</select></label>
    <div class="actions"><button class="primary">保存</button><a class="btn btn--outline" href="/admin/tournaments">戻る</a></div></form>`;
}

admin.get('/tournaments/new', async (c) => {
  const a = A(c);
  if (!canCreateTournament(a)) return c.text('forbidden', 403);
  const assocs = await all<Association>(c.env.DB, 'SELECT * FROM associations ORDER BY id');
  return c.html(page(c, { title: '大会を作る', body: tournamentForm(null, assocs, a), admin: a }));
});

async function saveTournament(c: C, existing: Tournament | null) {
  const a = A(c);
  const f = await form(c);
  const assocId = a.role === 'sysadmin' ? f.association_id : a.association_id!;
  const events = parseEvents(f.events ?? '');
  if (!events.length || events.some((e) => !e.code || !e.name)) { flash(c, '種目の書式が正しくありません', 'err'); return c.redirect(existing ? `/admin/tournaments/${existing.id}/edit` : '/admin/tournaments/new'); }
  const methods = f.all('methods').filter((m) => m in METHOD_LABEL);
  const id = existing?.id ?? `T-${ulid().slice(-8)}`;
  const vals = [assocId, f.name.trim(), f.held_on, f.venue || null, f.entry_start, f.entry_end, f.eligibility || null, f.requires_registration ? 1 : 0, JSON.stringify(events), JSON.stringify(methods.length ? methods : ['bank']), f.unpaid_policy === 'cancel' ? 'cancel' : 'hold', f.capacity ? Number(f.capacity) : null, ['draft', 'open', 'closed'].includes(f.status) ? f.status : 'draft'];
  if (existing) await run(c.env.DB, `UPDATE tournaments SET association_id = ?, name = ?, held_on = ?, venue = ?, entry_start = ?, entry_end = ?, eligibility = ?, requires_registration = ?, events_json = ?, payment_methods_json = ?, unpaid_policy = ?, capacity = ?, status = ? WHERE id = ?`, ...vals, id);
  else await run(c.env.DB, `INSERT INTO tournaments (id, association_id, name, held_on, venue, entry_start, entry_end, eligibility, requires_registration, events_json, payment_methods_json, unpaid_policy, capacity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, ...vals, nowIso());
  await audit(c.env, { ...actor(c), action: existing ? 'tournament.update' : 'tournament.create', target: `tournament:${id}`, after: { name: f.name, status: f.status } });
  flash(c, '大会を保存しました');
  return c.redirect(`/admin/tournaments/${id}`);
}
admin.post('/tournaments', async (c) => (canCreateTournament(A(c)) ? saveTournament(c, null) : c.text('forbidden', 403)));

async function loadOwned(c: C): Promise<Tournament | null> {
  const t = await one<Tournament>(c.env.DB, 'SELECT * FROM tournaments WHERE id = ?', c.req.param('id'));
  return t && canViewTournament(A(c), t) ? t : null;
}

admin.get('/tournaments/:id/edit', async (c) => {
  const t = await loadOwned(c);
  if (!t || !canCreateTournament(A(c))) return c.notFound();
  const assocs = await all<Association>(c.env.DB, 'SELECT * FROM associations ORDER BY id');
  return c.html(page(c, { title: `大会を編集: ${t.name}`, body: tournamentForm(t, assocs, A(c)), admin: A(c) }));
});
admin.post('/tournaments/:id', async (c) => {
  const t = await loadOwned(c);
  if (!t || !canCreateTournament(A(c))) return c.notFound();
  return saveTournament(c, t);
});

async function entryRows(env: Env, tId: string) {
  return all<Entry & { p1: string; p1_no: string | null; p1_club: string | null; p2: string | null; p2_club: string | null; p2_status: string | null; pay_status: string | null; method: string | null; amount: number | null; receipt_no: string | null }>(
    env.DB,
    `SELECT e.*, m1.name AS p1, m1.member_no AS p1_no, c1.name AS p1_club, m2.name AS p2, c2.name AS p2_club, m2.status AS p2_status, p.status AS pay_status, p.method, p.amount, p.receipt_no
       FROM entries e JOIN members m1 ON m1.id = e.member_id LEFT JOIN clubs c1 ON c1.id = m1.club_id
       LEFT JOIN members m2 ON m2.id = e.partner_member_id LEFT JOIN clubs c2 ON c2.id = m2.club_id
       LEFT JOIN payments p ON p.id = e.payment_id
      WHERE e.tournament_id = ? ORDER BY e.event_code, e.class, e.created_at`,
    tId,
  );
}

admin.get('/tournaments/:id', async (c) => {
  const a = A(c);
  const t = await loadOwned(c);
  if (!t) return c.notFound();
  const rows = await entryRows(c.env, t.id);
  const events = JSON.parse(t.events_json) as TournamentEvent[];
  const evName = (code: string) => events.find((e) => e.code === code)?.name ?? code;
  const tokens = await all<{ label: string | null; expires_at: string; created_at: string; last_used_at: string | null }>(c.env.DB, 'SELECT label, expires_at, created_at, last_used_at FROM api_tokens WHERE tournament_id = ? ORDER BY created_at DESC', t.id);
  const owns = ownsTournament(a, t);
  const body = html`<div class="card"><dl class="kv"><dt>開催日</dt><dd>${fmtDate(t.held_on)} ${t.venue ?? ''}</dd><dt>受付</dt><dd>${fmtDate(t.entry_start)}〜${fmtDate(t.entry_end)}</dd><dt>状態</dt><dd>${badge(t.status)}</dd><dt>支払方法</dt><dd>${(JSON.parse(t.payment_methods_json) as string[]).map((k) => METHOD_LABEL[k]?.split('（')[0]).join(' / ')}</dd><dt>締切時の支払待ち</dt><dd>${t.unpaid_policy === 'cancel' ? '自動キャンセル' : '保留（事務局判断）'}</dd></dl>
    <div class="actions">${canCreateTournament(a) ? html`<a class="btn btn--outline" href="/admin/tournaments/${t.id}/edit">編集</a>` : ''}${owns ? html`<a class="btn btn--outline" href="/admin/tournaments/${t.id}/entries.csv">ドロー会議用 CSV</a>${t.status === 'open' ? html`<form method="post" action="/admin/tournaments/${t.id}/close" class="inline"><button class="btn--outline">受付を締め切る</button></form>` : ''}` : ''}</div></div>
    <h2>エントリー（${rows.filter((r) => r.status === 'confirmed').length} 組確定 / ${rows.filter((r) => r.status === 'pending_payment').length} 組支払待ち）</h2>
    <div class="tbl"><table><tr><th>種目</th><th>クラス</th><th>代表</th><th>ペア</th><th>経路</th><th>支払</th><th>状態</th><th></th></tr>
    ${rows.map((r) => html`<tr><td>${evName(r.event_code)}</td><td>${r.class ?? '—'}</td><td>${r.p1_no ?? ''} ${r.p1}<br><span class="mute">${r.p1_club ?? ''}</span></td><td>${r.p2 ? html`${r.p2}${r.p2_status === 'provisional' ? html` ${badge('provisional')}` : ''}<br><span class="mute">${r.p2_club ?? ''}</span>` : '—'}</td><td>${r.source}</td><td>${r.pay_status ? badge(r.pay_status) : '—'} <span class="mute">${METHOD_LABEL[r.method ?? '']?.split('（')[0] ?? ''}</span></td><td>${badge(r.status)}</td>
      <td>${owns && r.status !== 'cancelled' ? html`${r.pay_status === 'pending' && r.method !== 'stripe' ? html`<form method="post" action="/admin/payments/${r.payment_id}/confirm" class="inline"><input type="hidden" name="back" value="/admin/tournaments/${t.id}"><button class="small">入金確認</button></form> ` : ''}<form method="post" action="/admin/entries/${r.id}/cancel" class="inline"><input type="hidden" name="back" value="/admin/tournaments/${t.id}"><button class="small btn--outline">キャンセル</button></form>` : ''}</td></tr>`)}
    ${rows.length === 0 ? html`<tr><td colspan="8">エントリーはまだありません</td></tr>` : ''}
    </table></div>
    ${owns ? html`<h2>大会運営アプリ向け API（読み取り専用トークン）</h2>
    <div class="card"><p class="mute">GitHub Pages の大会運営・ドロー・ライブスコアアプリは、このトークンで確定エントリーを JSON で取得します（氏名・クラブ・クラスのみ。個人情報の列は API に存在しません）。トークンは大会単位・有効期限付きで、発行時に 1 度だけ表示します。</p>
      <form method="post" action="/admin/tournaments/${t.id}/tokens"><input type="text" name="label" placeholder="用途（例: ドローアプリ）"> <select name="days"><option value="30">30 日</option><option value="90">90 日</option></select> <button class="small">トークンを発行</button></form>
      <div class="tbl"><table><tr><th>用途</th><th>有効期限</th><th>発行</th><th>最終利用</th></tr>${tokens.map((k) => html`<tr><td>${k.label ?? '—'}</td><td>${fmtDate(k.expires_at)}</td><td>${fmtDateTime(k.created_at)}</td><td>${fmtDateTime(k.last_used_at)}</td></tr>`)}</table></div>
      <p class="mute">URL: <code>${c.env.BASE_URL}/api/v1/tournaments/${t.id}/entries.json?token=…</code>（または Authorization: Bearer）</p></div>` : ''}`;
  return c.html(page(c, { title: t.name, body, admin: a, wide: true }));
});

admin.post('/tournaments/:id/tokens', async (c) => {
  const t = await loadOwned(c);
  if (!t || !ownsTournament(A(c), t)) return c.notFound();
  const f = await form(c);
  const token = randomToken(32);
  const days = Number(f.days) === 90 ? 90 : 30;
  await run(c.env.DB, 'INSERT INTO api_tokens (token_hash, tournament_id, label, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', await sha256Hex(token), t.id, f.label || null, new Date(Date.now() + days * 86400000).toISOString(), A(c).email, nowIso());
  await audit(c.env, { ...actor(c), action: 'api_token.issue', target: `tournament:${t.id}`, after: { label: f.label, days } });
  const body = html`<div class="card"><p>このトークンは今回だけ表示されます。運営アプリの設定に貼り付けてください。</p><pre>${token}</pre><pre>${c.env.BASE_URL}/api/v1/tournaments/${t.id}/entries.json?token=${token}</pre><a class="btn" href="/admin/tournaments/${t.id}">大会へ戻る</a></div>`;
  return c.html(page(c, { title: 'トークンを発行しました', body, admin: A(c) }));
});

admin.post('/tournaments/:id/close', async (c) => {
  const t = await loadOwned(c);
  if (!t || !ownsTournament(A(c), t)) return c.notFound();
  await run(c.env.DB, `UPDATE tournaments SET status = 'closed' WHERE id = ?`, t.id);
  await audit(c.env, { ...actor(c), action: 'tournament.close', target: `tournament:${t.id}` });
  if (t.unpaid_policy === 'cancel') {
    const pend = await all<Entry>(c.env.DB, `SELECT * FROM entries WHERE tournament_id = ? AND status = 'pending_payment'`, t.id);
    for (const e of pend) await cancelEntry(c.env, e.id, '締切時に未入金のためキャンセル', actor(c));
  }
  flash(c, '受付を締め切りました');
  return c.redirect(`/admin/tournaments/${t.id}`);
});

admin.get('/tournaments/:id/entries.csv', async (c) => {
  const t = await loadOwned(c);
  if (!t || !ownsTournament(A(c), t)) return c.notFound();
  const rows = await entryRows(c.env, t.id);
  const events = JSON.parse(t.events_json) as TournamentEvent[];
  const lines = ['種目,クラス,代表 会員番号,代表 氏名,代表 クラブ,ペア 氏名,ペア クラブ,状態,支払,領収書番号,受付経路'];
  for (const r of rows) lines.push([events.find((e) => e.code === r.event_code)?.name ?? r.event_code, r.class, r.p1_no, r.p1, r.p1_club, r.p2, r.p2_club, STATUS_LABEL[r.status], r.pay_status ? STATUS_LABEL[r.pay_status] : '', r.receipt_no, r.source].map(csv).join(','));
  await audit(c.env, { ...actor(c), action: 'entries.export_csv', target: `tournament:${t.id}`, after: { count: rows.length } });
  return c.body('﻿' + lines.join('\r\n'), 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="entries-${t.id}.csv"` });
});

admin.post('/entries/:id/cancel', async (c) => {
  const e = await one<Entry>(c.env.DB, 'SELECT * FROM entries WHERE id = ?', c.req.param('id'));
  const t = e ? await one<Tournament>(c.env.DB, 'SELECT * FROM tournaments WHERE id = ?', e.tournament_id) : null;
  if (!e || !t || !ownsTournament(A(c), t)) return c.notFound();
  const f = await form(c);
  await cancelEntry(c.env, e.id, '事務局によるキャンセル', actor(c));
  flash(c, 'エントリーをキャンセルしました（入金済みは返金記録を残しました）');
  return c.redirect(f.back || `/admin/tournaments/${t.id}`);
});

// ---------- Excel 名簿の取込みと名寄せ ----------
admin.get('/import', async (c) => {
  const a = A(c);
  if (!canImport(a)) return c.text('forbidden', 403);
  const body = html`<div class="card"><p>既存のふりがな名簿・Excel を CSV（UTF-8）で貼り付けます。1 行 1 名、列は <code>氏名,ふりがな,性別(男/女),生年,クラブ名,メール,電話,郵便番号,住所</code>。氏名・ふりがなが既存と一致する行は自動で結合せず「名寄せ候補」に入ります。</p>
    <form method="post" action="/admin/import"><textarea name="csv" placeholder="山田 太郎,やまだたろう,男,1985,鳥取ローンテニスクラブ,yamada@example.com,090-0000-0001,680-0001,鳥取市栄町1-1"></textarea>
    <label class="check"><input type="checkbox" name="register" checked> 取り込んだ会員を当年度の登録済み（承認）にする</label>
    <div class="actions"><button class="primary">取り込む</button></div></form></div>`;
  return c.html(page(c, { title: 'Excel 名簿の取込み', body, admin: a }));
});

admin.post('/import', async (c) => {
  const a = A(c);
  if (!canImport(a)) return c.text('forbidden', 403);
  const f = await form(c);
  const assoc = (await one<Association>(c.env.DB, 'SELECT * FROM associations WHERE id = ?', a.association_id))!;
  const fy = currentFiscalYear(assoc.fiscal_year_start_month);
  let created = 0, candidates = 0, skipped = 0;
  for (const line of (f.csv ?? '').split(/\r?\n/)) {
    const cols = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2 || !cols[0] || !cols[1]) { if (line.trim()) skipped++; continue; }
    const [name, kana, sex, birth, clubName, email, phone, postal, address] = cols;
    let clubId: string | null = null;
    if (clubName) {
      const cl = await one<Club>(c.env.DB, 'SELECT * FROM clubs WHERE name = ?', clubName);
      if (cl) clubId = cl.id; else { clubId = `club-${ulid().toLowerCase()}`; await run(c.env.DB, 'INSERT INTO clubs (id, name, created_at) VALUES (?, ?, ?)', clubId, clubName, nowIso()); }
    }
    const m = await createMember(c.env, { name, kana, sex: sex === '男' ? 'male' : sex === '女' ? 'female' : null, birthYear: birth ? Number(birth) : null, email: email || null, phone: phone || null, postal: postal || null, address: address || null, clubId, homeAssociationId: assoc.id, status: email ? 'active' : 'provisional' });
    created++;
    if (f.register) {
      await run(c.env.DB, `INSERT INTO registrations (id, member_id, association_id, fiscal_year, category, fee, status, source, approved_by, approved_at, created_at) VALUES (?, ?, ?, ?, 'general', ?, 'approved', 'import', ?, ?, ?)`, ulid(), m.id, assoc.id, fy, assoc.annual_fee, a.email, nowIso(), nowIso());
    }
    for (const s of await findSameNameMembers(c.env, name, kana, m.id)) {
      await run(c.env.DB, `INSERT INTO merge_candidates (id, keep_member_id, dup_member_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)`, ulid(), s.id, m.id, 'Excel 取込みで氏名・ふりがなが一致', nowIso());
      candidates++;
    }
  }
  await audit(c.env, { ...actor(c), action: 'members.import', target: `association:${assoc.id}`, after: { created, candidates, skipped } });
  flash(c, `${created} 名を取り込みました（名寄せ候補 ${candidates} 件、読めない行 ${skipped}）`);
  return c.redirect(candidates ? '/admin/merges' : '/admin/members');
});

admin.get('/merges', async (c) => {
  const a = A(c);
  if (!canImport(a)) return c.text('forbidden', 403);
  const rows = await all<{ id: string; status: string; reason: string | null; created_at: string; decided_by: string | null; k_id: string; k_no: string | null; k_name: string; k_kana: string; k_club: string | null; k_status: string; d_id: string; d_no: string | null; d_name: string; d_kana: string; d_club: string | null; d_status: string }>(
    c.env.DB,
    `SELECT mc.id, mc.status, mc.reason, mc.created_at, mc.decided_by,
            k.id AS k_id, k.member_no AS k_no, k.name AS k_name, k.kana AS k_kana, kc.name AS k_club, k.status AS k_status,
            d.id AS d_id, d.member_no AS d_no, d.name AS d_name, d.kana AS d_kana, dc.name AS d_club, d.status AS d_status
       FROM merge_candidates mc JOIN members k ON k.id = mc.keep_member_id LEFT JOIN clubs kc ON kc.id = k.club_id
       JOIN members d ON d.id = mc.dup_member_id LEFT JOIN clubs dc ON dc.id = d.club_id
      ORDER BY mc.status = 'open' DESC, mc.created_at DESC LIMIT 200`,
  );
  const body = html`<p class="mute">同姓同名・旧姓などで別人のデータが結合されないよう、自動結合はせず事務局が確定します。結合は監査ログに残り、取り消せます。</p>
    <div class="tbl"><table><tr><th>理由</th><th>残す会員</th><th>重複の候補</th><th>状態</th><th></th></tr>
    ${rows.map((r) => html`<tr><td class="wrap-text">${r.reason}</td><td><a href="/admin/members/${r.k_id}">${r.k_no ?? ''} ${r.k_name}</a>（${r.k_kana}）<br><span class="mute">${r.k_club ?? '—'} ${badge(r.k_status)}</span></td><td><a href="/admin/members/${r.d_id}">${r.d_no ?? ''} ${r.d_name}</a>（${r.d_kana}）<br><span class="mute">${r.d_club ?? '—'} ${badge(r.d_status)}</span></td><td>${r.status === 'open' ? '未確認' : r.status === 'merged' ? `結合済み（${r.decided_by}）` : '別人'}</td>
      <td>${r.status === 'open' ? html`<form method="post" action="/admin/merges/${r.id}/merge" class="inline"><button class="small primary">同一人物として結合</button></form> <form method="post" action="/admin/merges/${r.id}/dismiss" class="inline"><button class="small btn--outline">別人</button></form>` : r.status === 'merged' ? html`<form method="post" action="/admin/merges/${r.id}/undo" class="inline"><button class="small btn--outline">結合を取り消す</button></form>` : ''}</td></tr>`)}
    ${rows.length === 0 ? html`<tr><td colspan="5">候補はありません</td></tr>` : ''}</table></div>`;
  return c.html(page(c, { title: '名寄せ', body, admin: a, wide: true }));
});

admin.post('/merges/:id/:act', async (c) => {
  const a = A(c);
  if (!canImport(a)) return c.text('forbidden', 403);
  const mc = await one<{ id: string; keep_member_id: string; dup_member_id: string; status: string }>(c.env.DB, 'SELECT * FROM merge_candidates WHERE id = ?', c.req.param('id'));
  if (!mc) return c.notFound();
  const act = c.req.param('act');
  const now = nowIso();
  if (act === 'merge' && mc.status === 'open') {
    const keep = (await one<Member>(c.env.DB, 'SELECT * FROM members WHERE id = ?', mc.keep_member_id))!;
    const dup = (await one<Member>(c.env.DB, 'SELECT * FROM members WHERE id = ?', mc.dup_member_id))!;
    // 重複側にしか無い項目（メール・連絡先・クラブ）は残す側へ補完し、関係データを付け替える
    await run(c.env.DB, `UPDATE members SET email_hash = COALESCE(email_hash, ?), email_enc = COALESCE(email_enc, ?), phone_enc = COALESCE(phone_enc, ?), postal_enc = COALESCE(postal_enc, ?), address_enc = COALESCE(address_enc, ?), club_id = COALESCE(club_id, ?), sex = COALESCE(sex, ?), birth_year = COALESCE(birth_year, ?), status = CASE WHEN status = 'provisional' AND ? = 'active' THEN 'active' ELSE status END, updated_at = ? WHERE id = ?`,
      dup.email_hash, dup.email_enc, dup.phone_enc, dup.postal_enc, dup.address_enc, dup.club_id, dup.sex, dup.birth_year, dup.status, now, keep.id);
    await run(c.env.DB, `UPDATE members SET email_hash = NULL, merged_into = ?, updated_at = ? WHERE id = ?`, keep.id, now, dup.id);
    await run(c.env.DB, `UPDATE OR IGNORE registrations SET member_id = ? WHERE member_id = ?`, keep.id, dup.id);
    await run(c.env.DB, `UPDATE entries SET member_id = ? WHERE member_id = ?`, keep.id, dup.id);
    await run(c.env.DB, `UPDATE entries SET partner_member_id = ? WHERE partner_member_id = ?`, keep.id, dup.id);
    await run(c.env.DB, `UPDATE payments SET payer_member_id = ? WHERE payer_member_id = ?`, keep.id, dup.id);
    await run(c.env.DB, `UPDATE merge_candidates SET status = 'merged', decided_by = ?, decided_at = ? WHERE id = ?`, a.email, now, mc.id);
    await audit(c.env, { ...actor(c), action: 'member.merge', target: `member:${keep.id}`, before: { dup: dup.id, dup_email_hash: dup.email_hash, dup_status: dup.status }, after: { merged_into: keep.id } });
    flash(c, '結合しました（取り消せます）');
  } else if (act === 'dismiss' && mc.status === 'open') {
    await run(c.env.DB, `UPDATE merge_candidates SET status = 'dismissed', decided_by = ?, decided_at = ? WHERE id = ?`, a.email, now, mc.id);
    await audit(c.env, { ...actor(c), action: 'member.merge_dismiss', target: `member:${mc.keep_member_id}`, after: { dup: mc.dup_member_id } });
    flash(c, '別人として記録しました');
  } else if (act === 'undo' && mc.status === 'merged') {
    // 付け替えた関係データは監査ログの範囲で戻せないため、ここでは会員レコードの結合だけを解く
    const log = await one<{ before_json: string }>(c.env.DB, `SELECT before_json FROM audit_log WHERE action = 'member.merge' AND target = ? AND before_json LIKE ? ORDER BY at DESC LIMIT 1`, `member:${mc.keep_member_id}`, `%${mc.dup_member_id}%`);
    const before = log ? (JSON.parse(log.before_json) as { dup_email_hash: string | null; dup_status: string }) : null;
    await run(c.env.DB, `UPDATE members SET merged_into = NULL, email_hash = CASE WHEN ? IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members x WHERE x.email_hash = ?) THEN ? ELSE email_hash END, status = ?, updated_at = ? WHERE id = ?`, before?.dup_email_hash ?? null, before?.dup_email_hash ?? null, before?.dup_email_hash ?? null, before?.dup_status ?? 'provisional', now, mc.dup_member_id);
    await run(c.env.DB, `UPDATE merge_candidates SET status = 'open', decided_by = ?, decided_at = ? WHERE id = ?`, a.email, now, mc.id);
    await audit(c.env, { ...actor(c), action: 'member.merge_undo', target: `member:${mc.keep_member_id}`, after: { dup: mc.dup_member_id } });
    flash(c, '結合を取り消しました。年度登録・エントリーの付け替えは会員詳細から確認してください');
  }
  return c.redirect('/admin/merges');
});

// ---------- 監査ログ ----------
admin.get('/audit', async (c) => {
  const a = A(c);
  if (a.role !== 'sysadmin' && a.role !== 'assoc_admin') return c.text('forbidden', 403);
  const q = c.req.query('q')?.trim() ?? '';
  const rows = await all<{ at: string; actor_type: string; actor: string; action: string; target: string | null; before_json: string | null; after_json: string | null; ip: string | null }>(c.env.DB, `SELECT * FROM audit_log WHERE (? = '' OR action LIKE ? OR actor LIKE ? OR target LIKE ?) ORDER BY at DESC LIMIT 300`, q, `%${q}%`, `%${q}%`, `%${q}%`);
  const body = html`<p class="mute">閲覧・出力・更新・削除をすべて記録します。テーブルにはトリガーで UPDATE / DELETE を禁止してあり、管理者本人も消せません。</p>
    <form method="get" action="/admin/audit"><input type="text" name="q" value="${q}" placeholder="操作・実行者・対象で絞る"> <button class="small">絞る</button></form>
    <div class="tbl"><table><tr><th>日時</th><th>実行者</th><th>操作</th><th>対象</th><th>内容</th><th>IP</th></tr>
    ${rows.map((r) => html`<tr><td>${fmtDateTime(r.at)}</td><td>${r.actor_type}:${r.actor}</td><td>${r.action}</td><td>${r.target ?? ''}</td><td class="wrap-text"><span class="mute">${r.before_json ? `前: ${r.before_json} ` : ''}</span>${r.after_json ?? ''}</td><td>${r.ip ?? ''}</td></tr>`)}</table></div>`;
  return c.html(page(c, { title: '監査ログ', body, admin: a, wide: true }));
});

// ---------- 管理者・協会（システム管理者） ----------
admin.get('/admins', async (c) => {
  const a = A(c);
  if (!canManageAdmins(a)) return c.text('forbidden', 403);
  const rows = await all<Admin & { association_name: string | null }>(c.env.DB, 'SELECT a.*, s.name AS association_name FROM admins a LEFT JOIN associations s ON s.id = a.association_id ORDER BY a.association_id, a.role');
  const assocs = await all<Association>(c.env.DB, 'SELECT * FROM associations ORDER BY id');
  const tournaments = await all<Tournament>(c.env.DB, 'SELECT * FROM tournaments ORDER BY held_on DESC');
  const body = html`<p class="mute">本番では Cloudflare Access のグループにも同じメールを入れます（Access を通った人のメールがこの表に無ければ入れません）。年 1 回の権限棚卸しはこの表で行います。</p>
    <div class="tbl"><table><tr><th>氏名</th><th>メール</th><th>協会</th><th>ロール</th><th>担当大会</th><th>有効</th><th></th></tr>
    ${rows.map((r) => html`<tr><td>${r.name}</td><td>${r.email}</td><td>${r.association_name ?? '—'}</td><td>${ROLE_LABEL[r.role]}</td><td>${(JSON.parse(r.tournament_ids_json) as string[]).join(', ')}</td><td>${r.active ? '有効' : '停止'}</td><td><form method="post" action="/admin/admins/${r.id}/toggle" class="inline"><button class="small btn--outline">${r.active ? '停止' : '再開'}</button></form></td></tr>`)}</table></div>
    <form method="post" action="/admin/admins" class="card"><h3>管理者を追加</h3>
      <label>氏名 <input type="text" name="name" required></label><label>メール <input type="email" name="email" required></label>
      <label>協会 <select name="association_id"><option value="">—（システム管理者）</option>${assocs.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></label>
      <label>ロール <select name="role">${Object.entries(ROLE_LABEL).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label>担当大会（大会運営ロール）</label>${tournaments.map((t) => html`<label class="check"><input type="checkbox" name="tournament" value="${t.id}"> ${t.name}</label>`)}
      <div class="actions"><button class="primary">追加</button></div></form>`;
  return c.html(page(c, { title: '管理者', body, admin: a, wide: true }));
});
admin.post('/admins', async (c) => {
  const a = A(c);
  if (!canManageAdmins(a)) return c.text('forbidden', 403);
  const f = await form(c);
  if (!(f.role in ROLE_LABEL)) return c.redirect('/admin/admins');
  await run(c.env.DB, 'INSERT INTO admins (id, email, name, association_id, role, tournament_ids_json, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)', ulid(), f.email.trim().toLowerCase(), f.name.trim(), f.association_id || null, f.role, JSON.stringify(f.all('tournament')), nowIso());
  await audit(c.env, { ...actor(c), action: 'admin.create', target: `admin:${f.email}`, after: { role: f.role, association: f.association_id } });
  flash(c, '管理者を追加しました');
  return c.redirect('/admin/admins');
});
admin.post('/admins/:id/toggle', async (c) => {
  const a = A(c);
  if (!canManageAdmins(a)) return c.text('forbidden', 403);
  const t = await one<Admin>(c.env.DB, 'SELECT * FROM admins WHERE id = ?', c.req.param('id'));
  if (!t) return c.notFound();
  await run(c.env.DB, 'UPDATE admins SET active = ? WHERE id = ?', t.active ? 0 : 1, t.id);
  await run(c.env.DB, `DELETE FROM sessions WHERE kind = 'admin' AND subject = ?`, t.id);
  await audit(c.env, { ...actor(c), action: t.active ? 'admin.disable' : 'admin.enable', target: `admin:${t.email}` });
  return c.redirect('/admin/admins');
});

admin.get('/associations', async (c) => {
  const a = A(c);
  if (a.role !== 'sysadmin' && a.role !== 'assoc_admin') return c.text('forbidden', 403);
  const rows = (await all<Association>(c.env.DB, 'SELECT * FROM associations ORDER BY id')).filter((s) => a.role === 'sysadmin' || s.id === a.association_id);
  const body = html`${rows.map((s) => html`<form method="post" action="/admin/associations/${s.id}" class="card"><h3>${s.name}（コード ${s.code}）</h3>
    <label>年会費 <input type="number" name="annual_fee" value="${s.annual_fee}"></label><label>年度の切替月 <input type="number" name="fiscal_year_start_month" min="1" max="12" value="${s.fiscal_year_start_month}"></label>
    <label>振込先 <input type="text" name="bank_info" value="${s.bank_info ?? ''}"></label><label>PayPay <input type="text" name="paypay_info" value="${s.paypay_info ?? ''}"></label><label>案内 <input type="text" name="reg_note" value="${s.reg_note ?? ''}"></label>
    <div class="actions"><button class="small">保存</button></div></form>`)}`;
  return c.html(page(c, { title: '協会の設定', body, admin: a }));
});
admin.post('/associations/:id', async (c) => {
  const a = A(c);
  if (a.role !== 'sysadmin' && !(a.role === 'assoc_admin' && a.association_id === c.req.param('id'))) return c.text('forbidden', 403);
  const f = await form(c);
  await run(c.env.DB, 'UPDATE associations SET annual_fee = ?, fiscal_year_start_month = ?, bank_info = ?, paypay_info = ?, reg_note = ? WHERE id = ?', Number(f.annual_fee) || 0, Math.min(12, Math.max(1, Number(f.fiscal_year_start_month) || 4)), f.bank_info || null, f.paypay_info || null, f.reg_note || null, c.req.param('id'));
  await audit(c.env, { ...actor(c), action: 'association.update', target: `association:${c.req.param('id')}`, after: { annual_fee: f.annual_fee } });
  flash(c, '保存しました');
  return c.redirect('/admin/associations');
});
