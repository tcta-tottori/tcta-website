// テニスショップの代行入力画面。紙の受付を「ショップが代わりに入力する」形に変え、現金は受領記録で確定する。
// ショップは個人情報を閲覧・出力できず、入力した本人分だけ当日中は取り消せる。
import { Hono } from 'hono';
import { html } from 'hono/html';
import { clientIp, form, type Vars } from '../app';
import type { Env } from '../env';
import { audit } from '../lib/audit';
import { all, nowIso, one, run } from '../lib/db';
import { currentFiscalYear, fmtDateTime, jstDayRange, todayJst, yen } from '../lib/fiscal';
import { flash } from '../lib/session';
import { ulid } from '../lib/ulid';
import { createMember, namesFromForm, resolveClub, searchMembers } from '../services/members';
import { clubDatalist, clubLabel, nameInputs } from '../views/forms';
import { securityNote } from '../views/security';
import { createPayment, cancelEntry, markPaid } from '../services/payments';
import { type Association, type Club, type Entry, type PaymentMethod, type Tournament } from '../types';
import { badge, page } from '../views/layout';
import { createEntry } from './portal';

export const shop = new Hono<{ Bindings: Env; Variables: Vars }>();

shop.use('*', async (c, next) => {
  const a = c.get('admin');
  if (!a) return c.redirect('/admin/login');
  if (a.role !== 'shop') return c.redirect('/admin');
  await next();
});

shop.get('/', async (c) => {
  const a = c.get('admin')!;
  const q = c.req.query('q') ?? '';
  const pq = c.req.query('pq') ?? '';
  const results = q ? await searchMembers(c.env, q) : [];
  const partners = pq ? await searchMembers(c.env, pq) : [];
  const ts = await all<Tournament>(c.env.DB, `SELECT * FROM tournaments WHERE status = 'open' ORDER BY held_on`);
  const assocs = await all<Association>(c.env.DB, 'SELECT * FROM associations ORDER BY id');
  const clubs = await all<Club>(c.env.DB, 'SELECT * FROM clubs ORDER BY name');
  const body = html`
    ${clubDatalist(clubs)}
    <form method="get" action="/shop" class="card"><h2>1. 会員を探す</h2>
      <p class="mute">会員番号か氏名で検索します（住所・電話は表示されません）。見つからないときは下の「新しい会員」で氏名だけ登録できます。</p>
      <label>申込者 <input type="text" name="q" value="${q}" placeholder="T-26-0001 / 山田"></label>
      <label>ペア <input type="text" name="pq" value="${pq}" placeholder="佐藤"></label>
      <button class="small">検索</button></form>
    <form method="post" action="/shop/entry" class="card"><h2>2. 大会エントリーを代行入力</h2>
      <label>申込者</label><div class="radio-list">${results.map((r) => html`<label><input type="radio" name="member" value="${r.id}" required> ${r.member_no ?? ''} ${r.name}（${r.kana}）/ ${clubLabel(r.club_name)} ${badge(r.status)}</label>`)}
        <label><input type="radio" name="member" value="new" required> 新しい会員（氏名のみ・仮会員）</label></div>
      <div class="indent">${nameInputs('new')} <input type="text" name="new_club" list="clubs-list" placeholder="所属（空ならフリー）"></div>
      <label>大会 <select name="tournament">${ts.map((t) => html`<option value="${t.id}">${t.name}（締切 ${t.entry_end}）</option>`)}</select></label>
      <label>種目コード <input type="text" name="event" placeholder="MD / WD / MS" required></label>
      <label>クラス <input type="text" name="class" placeholder="A / B（無ければ空）"></label>
      <label>ペア</label><div class="radio-list"><label><input type="radio" name="partner" value="" checked> 無し</label>${partners.map((r) => html`<label><input type="radio" name="partner" value="${r.id}"> ${r.member_no ?? ''} ${r.name}（${r.kana}）/ ${clubLabel(r.club_name)}</label>`)}
        <label><input type="radio" name="partner" value="new"> 未登録のペアを氏名で登録（仮会員）</label></div>
      <div class="indent">${nameInputs('p')} <input type="text" name="p_club" list="clubs-list" placeholder="所属（空ならフリー）"></div>
      <label class="check"><input type="checkbox" name="cash_received" checked> 現金を受領した（チェックするとその場で確定・領収書番号が出ます）</label>
      <div class="actions"><button class="primary">エントリーを登録</button></div></form>
    <form method="post" action="/shop/registration" class="card"><h2>3. 年度登録を代行入力（現金）</h2>
      <p class="mute">上の検索結果から申込者を選び、協会を選びます。登録料は現金受領で入金済みになり、事務局の承認で有効になります。</p>
      <label>申込者</label><div class="radio-list">${results.map((r) => html`<label><input type="radio" name="member" value="${r.id}" required> ${r.member_no ?? ''} ${r.name}（${r.kana}）</label>`)}</div>
      <label>協会 <select name="assoc">${assocs.map((s) => html`<option value="${s.id}">${s.name}（${yen(s.annual_fee)}）</option>`)}</select></label>
      <div class="actions"><button class="primary">年度登録を受け付ける</button></div></form>
    ${securityNote('shop')}`;
  return c.html(page(c, { title: `代行入力（${a.name}）`, body, admin: a, wide: true }));
});

shop.post('/entry', async (c) => {
  const a = c.get('admin')!;
  const f = await form(c);
  let memberId = f.member;
  if (memberId === 'new') {
    const names = namesFromForm(f, 'new');
    if (typeof names === 'string') { flash(c, `新しい会員の${names}`, 'err'); return c.redirect('/shop'); }
    const m = await createMember(c.env, { ...names, clubId: await resolveClub(c.env, '__other__', f.new_club), homeAssociationId: a.association_id, status: 'provisional' });
    await audit(c.env, { actorType: 'shop', actor: a.email, action: 'member.create_provisional', target: `member:${m.id}`, after: { reason: 'ショップ代行入力' }, ip: clientIp(c) });
    memberId = m.id;
  }
  const t = await one<Tournament>(c.env.DB, 'SELECT * FROM tournaments WHERE id = ?', f.tournament);
  if (!t) return c.redirect('/shop');
  const methods = JSON.parse(t.payment_methods_json) as PaymentMethod[];
  const method: PaymentMethod = methods.includes('cash') ? 'cash' : methods[0];
  const r = await createEntry(c.env, {
    tournamentId: t.id, memberId, eventCode: f.event.trim().toUpperCase(), klass: f.class?.trim() || null,
    partnerId: f.partner && f.partner !== 'new' ? f.partner : null,
    newPartner: f.partner === 'new' ? { familyName: f.p_family ?? '', givenName: f.p_given ?? '', familyKana: f.p_family_kana ?? '', givenKana: f.p_given_kana ?? '', club: f.p_club?.trim() ?? '' } : null,
    method, source: 'shop', createdBy: a.email,
  }, clientIp(c));
  if (!r.ok) { flash(c, r.error, 'err'); return c.redirect('/shop'); }
  if (f.cash_received && method === 'cash') {
    const p = await markPaid(c.env, r.paymentId, { actorType: 'shop', actor: a.email, note: 'ショップで現金受領', ip: clientIp(c) });
    flash(c, `エントリーを確定しました。領収書番号 ${p?.receipt_no}（${yen(p?.amount)}）`);
  } else flash(c, `エントリーを受け付けました（支払待ち・${method}）`);
  return c.redirect('/shop/today');
});

shop.post('/registration', async (c) => {
  const a = c.get('admin')!;
  const f = await form(c);
  const assoc = await one<Association>(c.env.DB, 'SELECT * FROM associations WHERE id = ?', f.assoc);
  if (!assoc || !f.member || f.member === 'new') { flash(c, '申込者と協会を選んでください', 'err'); return c.redirect('/shop'); }
  const fy = currentFiscalYear(assoc.fiscal_year_start_month);
  const dup = await one(c.env.DB, 'SELECT 1 AS ok FROM registrations WHERE member_id = ? AND association_id = ? AND fiscal_year = ?', f.member, assoc.id, fy);
  if (dup) { flash(c, 'すでに当年度の登録があります', 'err'); return c.redirect('/shop'); }
  const p = await createPayment(c.env, { kind: 'registration', associationId: assoc.id, payerMemberId: f.member, amount: assoc.annual_fee, method: 'cash', note: `${fy}年度 年度登録料（${assoc.name}）ショップ受付` });
  const id = ulid();
  await run(c.env.DB, `INSERT INTO registrations (id, member_id, association_id, fiscal_year, category, fee, payment_id, status, source, created_at) VALUES (?, ?, ?, ?, 'general', ?, ?, 'pending', 'shop', ?)`, id, f.member, assoc.id, fy, assoc.annual_fee, p.id, nowIso());
  await audit(c.env, { actorType: 'shop', actor: a.email, action: 'registration.create', target: `registration:${id}`, after: { association: assoc.id, fiscal_year: fy, source: 'shop' }, ip: clientIp(c) });
  const paid = await markPaid(c.env, p.id, { actorType: 'shop', actor: a.email, note: 'ショップで現金受領', ip: clientIp(c) });
  flash(c, `年度登録を受け付けました。領収書番号 ${paid?.receipt_no}。事務局の承認後に有効になります`);
  return c.redirect('/shop/today');
});

shop.get('/today', async (c) => {
  const a = c.get('admin')!;
  const [from, to] = jstDayRange(todayJst());
  const rows = await all<Entry & { t_name: string; p1: string; p2: string | null; receipt_no: string | null; amount: number }>(c.env.DB, `SELECT e.*, t.name AS t_name, m1.name AS p1, m2.name AS p2, p.receipt_no, p.amount FROM entries e JOIN tournaments t ON t.id = e.tournament_id JOIN members m1 ON m1.id = e.member_id LEFT JOIN members m2 ON m2.id = e.partner_member_id LEFT JOIN payments p ON p.id = e.payment_id WHERE e.source = 'shop' AND e.created_by = ? AND e.created_at >= ? AND e.created_at < ? ORDER BY e.created_at DESC`, a.email, from, to);
  const body = html`<p class="mute">本日このショップで入力した分だけが出ます。入力ミスは当日中に取り消せます（翌日以降は事務局へ）。</p>
    <div class="tbl"><table><tr><th>時刻</th><th>大会</th><th>種目</th><th>申込者</th><th>ペア</th><th>金額</th><th>領収書</th><th>状態</th><th></th></tr>
    ${rows.map((r) => html`<tr><td>${fmtDateTime(r.created_at)}</td><td>${r.t_name}</td><td>${r.event_code}${r.class ? ' ' + r.class : ''}</td><td>${r.p1}</td><td>${r.p2 ?? '—'}</td><td>${yen(r.amount)}</td><td>${r.receipt_no ?? '—'}</td><td>${badge(r.status)}</td><td>${r.status !== 'cancelled' ? html`<form method="post" action="/shop/entries/${r.id}/cancel" class="inline"><button class="small btn--outline">取り消す</button></form>` : ''}</td></tr>`)}
    ${rows.length === 0 ? html`<tr><td colspan="9">本日の入力はまだありません</td></tr>` : ''}</table></div>`;
  return c.html(page(c, { title: '本日の入力', body, admin: a, wide: true }));
});

shop.post('/entries/:id/cancel', async (c) => {
  const a = c.get('admin')!;
  const [from, to] = jstDayRange(todayJst());
  const e = await one<Entry>(c.env.DB, `SELECT * FROM entries WHERE id = ? AND source = 'shop' AND created_by = ? AND created_at >= ? AND created_at < ?`, c.req.param('id'), a.email, from, to);
  if (!e) { flash(c, '当日のご自身の入力だけ取り消せます', 'err'); return c.redirect('/shop/today'); }
  await cancelEntry(c.env, e.id, 'ショップが当日中に取消', { actorType: 'shop', actor: a.email, ip: clientIp(c) });
  flash(c, '取り消しました');
  return c.redirect('/shop/today');
});
