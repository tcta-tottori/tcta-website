// 会員ポータル（登録・ログイン・マイページ・年度登録・大会エントリー・支払・クラブ管理）。
import { Hono } from 'hono';
import { html } from 'hono/html';
import { clientIp, type Ctx, form, type Vars } from '../app';
import type { Env } from '../env';
import { audit } from '../lib/audit';
import { blindIndex, decrypt, encrypt, normalizeEmail, randomToken, sha256Hex } from '../lib/crypto';
import { all, nowIso, one, run } from '../lib/db';
import { currentFiscalYear, fiscalYear, fmtDate, fmtDateTime, inRenewalWindow, todayJst, yen } from '../lib/fiscal';
import { sendMail } from '../lib/mail';
import { rateLimit } from '../lib/ratelimit';
import { createCheckoutUrl } from '../lib/stripe';
import { createSession, destroySession, flash, readSession } from '../lib/session';
import { ulid } from '../lib/ulid';
import { createMember, decryptContact, findMemberByEmail, findSameNameMembers, getMember, hasApprovedRegistration, searchMembers, updateMember } from '../services/members';
import { createPayment, getPayment } from '../services/payments';
import { type Association, type Club, type Entry, type Member, METHOD_LABEL, type Payment, type PaymentMethod, type Registration, SEX_LABEL, type Tournament, type TournamentEvent, CATEGORY_LABEL } from '../types';
import { badge, page } from '../views/layout';

export const portal = new Hono<{ Bindings: Env; Variables: Vars }>();

const requireMember = async (c: Ctx, next: () => Promise<void>) => {
  if (!c.get('member')) {
    flash(c, 'ログインしてください', 'err');
    return c.redirect('/login');
  }
  await next();
};

// ---------- トップ ----------
portal.get('/', async (c) => {
  const m = c.get('member');
  const open = await all<Tournament & { association_name: string }>(c.env.DB, `SELECT t.*, a.name AS association_name FROM tournaments t JOIN associations a ON a.id = t.association_id WHERE t.status = 'open' ORDER BY t.entry_end LIMIT 5`);
  const body = html`
    <h2>受付中の大会</h2>
    ${open.length === 0
      ? html`<p class="mute">いまは受付中の大会がありません。<a href="/dev">デモ</a>からデモデータを入れると表示されます。</p>`
      : html`<div class="tlist">${open.map((t) => html`<a class="tcard-s" href="/tournaments/${t.id}">
          <span class="tcard-s__assoc">${t.association_name}</span>
          <span class="tcard-s__title">${t.name}</span>
          <span class="tcard-s__meta"><span class="tcard-s__date">${fmtDate(t.held_on)}</span><span>${t.venue ?? ''}</span><span>締切 ${fmtDate(t.entry_end)}</span></span>
          <span class="tcard-s__go">大会の詳細 <span class="aw">→</span></span>
        </a>`)}</div>`}
    <div class="actions">${m ? html`<a class="btn btn--primary" href="/me">マイページへ <span class="aw">→</span></a>` : html`<a class="btn btn--primary" href="/login">メールアドレスで登録 / ログイン <span class="aw">→</span></a>`}<a class="btn" href="/tournaments">大会一覧 <span class="aw">→</span></a></div>
    <h2>エントリーまでの流れ</h2>
    <div class="steps">
      <div class="step"><p class="step__title">メールで本人確認</p><p class="step__text">メールアドレスを入れると届くリンクを開くだけ。パスワードはありません。</p></div>
      <div class="step"><p class="step__title">会員情報を 1 回だけ入力</p><p class="step__text">氏名・ふりがな・クラブ・連絡先。県協会・市協会で共通の会員番号が発番されます。</p></div>
      <div class="step"><p class="step__title">年度登録 → 大会エントリー</p><p class="step__text">登録する協会を選んで登録料を支払い、事務局の承認後に大会へ。入金が確認でき次第エントリーが確定します。</p></div>
    </div>`;
  return c.html(page(c, { title: '会員ポータル', body, member: m, lead: '県協会・鳥取市・倉吉市・米子市で共通の会員マスターを持ち、Web エントリーと入金確認を一本化します。1 回登録すれば、どの協会のどの大会にもエントリーできます。' }));
});

// ---------- マジックリンク ----------
portal.get('/login', (c) => {
  const turnstile = c.env.TURNSTILE_SITE_KEY ? html`<div class="cf-turnstile" data-sitekey="${c.env.TURNSTILE_SITE_KEY}"></div>` : '';
  const body = html`
    <div class="card">
      <p>メールアドレスにログイン用のリンクを送ります（15 分有効・1 回限り）。はじめての方も同じ入口です。</p>
      <form method="post" action="/login">
        <label for="email">メールアドレス</label>
        <input id="email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
        ${turnstile}
        <div class="actions"><button class="primary">リンクを送る</button></div>
      </form>
    </div>`;
  return c.html(page(c, { title: 'ログイン / 会員登録', body }));
});

portal.post('/login', async (c) => {
  const f = await form(c);
  const email = normalizeEmail(f.email ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    flash(c, 'メールアドレスの形式が正しくありません', 'err');
    return c.redirect('/login');
  }
  const ip = clientIp(c) ?? 'unknown';
  if (!(await rateLimit(c.env.DB, `login:${ip}`, 3, 15 * 60))) {
    flash(c, '送信回数が多すぎます。15 分ほどおいてからお試しください', 'err');
    return c.redirect('/login');
  }
  if (c.env.TURNSTILE_SECRET_KEY) {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: c.env.TURNSTILE_SECRET_KEY, response: f['cf-turnstile-response'] ?? '', remoteip: ip }) });
    const j = (await res.json()) as { success: boolean };
    if (!j.success) { flash(c, 'ボット確認に失敗しました', 'err'); return c.redirect('/login'); }
  }
  const token = randomToken(32);
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await run(c.env.DB, 'INSERT INTO magic_links (token_hash, email_hash, email_enc, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', await sha256Hex(token), await blindIndex(c.env, email), await encrypt(c.env, email), expires, nowIso());
  const known = await findMemberByEmail(c.env, email);
  await sendMail(c.env, {
    to: email,
    subject: `【${c.env.APP_NAME}】${known ? 'ログイン' : '会員登録'}のリンク`,
    text: `${known ? `${known.name} 様\n\n` : ''}次のリンクを開いてください（15 分有効・1 回限り）。\n${c.env.BASE_URL}/auth/${token}\n\n心当たりがない場合はこのメールを破棄してください。`,
  });
  await audit(c.env, { actorType: 'member', actor: `email:${(await blindIndex(c.env, email)).slice(0, 12)}`, action: 'auth.magic_link_sent', ip });
  const body = html`<div class="card"><p><b>${email}</b> にリンクを送りました。メールを開いてリンクを押してください。</p><p class="mute">届かない場合は迷惑メールフォルダを確認してください。</p></div>`;
  return c.html(page(c, { title: 'メールを送りました', body }));
});

portal.get('/auth/:token', async (c) => {
  const h = await sha256Hex(c.req.param('token'));
  const link = await one<{ email_hash: string; email_enc: string; expires_at: string; used_at: string | null }>(c.env.DB, 'SELECT * FROM magic_links WHERE token_hash = ?', h);
  if (!link || link.used_at || link.expires_at < nowIso()) {
    flash(c, 'リンクが無効か期限切れです。もう一度送ってください', 'err');
    return c.redirect('/login');
  }
  await run(c.env.DB, 'UPDATE magic_links SET used_at = ? WHERE token_hash = ?', nowIso(), h);
  const email = (await decrypt(c.env, link.email_enc))!;
  const m = await findMemberByEmail(c.env, email);
  if (m) {
    await createSession(c, 'member', m.id);
    await audit(c.env, { actorType: 'member', actor: m.id, action: 'auth.login', ip: clientIp(c) });
    flash(c, `${m.name} さん、ログインしました`);
    return c.redirect('/me');
  }
  await createSession(c, 'signup', link.email_enc);
  return c.redirect('/signup');
});

portal.post('/logout', async (c) => {
  await destroySession(c, 'member');
  return c.redirect('/');
});

// ---------- 会員登録（初回） ----------
async function lookups(env: Env) {
  return { clubs: await all<Club>(env.DB, 'SELECT * FROM clubs ORDER BY name'), assocs: await all<Association>(env.DB, 'SELECT * FROM associations ORDER BY id') };
}

function profileFields(clubs: Club[], assocs: Association[], v: Partial<{ name: string; kana: string; sex: string | null; birth_year: number | null; phone: string | null; postal: string | null; address: string | null; club_id: string | null; home: string | null }>, withHome: boolean) {
  return html`
    <label>氏名 <input type="text" name="name" required value="${v.name ?? ''}"></label>
    <label>ふりがな <input type="text" name="kana" required value="${v.kana ?? ''}" placeholder="やまだたろう"></label>
    <label>性別 <select name="sex"><option value="">—</option>${Object.entries(SEX_LABEL).map(([k, l]) => html`<option value="${k}" ${v.sex === k ? 'selected' : ''}>${l}</option>`)}</select></label>
    <label>生年（年齢区分の判定にだけ使います） <input type="number" name="birth_year" min="1900" max="2030" value="${v.birth_year ?? ''}"></label>
    <label>所属クラブ <select name="club_id">${clubs.map((cl) => html`<option value="${cl.id}" ${v.club_id === cl.id ? 'selected' : ''}>${cl.name}</option>`)}</select></label>
    ${withHome ? html`<label>主な登録先の協会（会員番号の接頭辞になります） <select name="home">${assocs.map((a) => html`<option value="${a.id}" ${v.home === a.id ? 'selected' : ''}>${a.name}</option>`)}</select></label>` : ''}
    <label>電話番号 <input type="tel" name="phone" value="${v.phone ?? ''}"></label>
    <label>郵便番号 <input type="text" name="postal" value="${v.postal ?? ''}"></label>
    <label>住所 <input type="text" name="address" value="${v.address ?? ''}"></label>`;
}

portal.get('/signup', async (c) => {
  const emailEnc = await readSession(c, 'signup');
  if (!emailEnc) return c.redirect('/login');
  const email = await decrypt(c.env, emailEnc);
  const { clubs, assocs } = await lookups(c.env);
  const body = html`
    <div class="card">
      <p>メール <b>${email}</b> の本人確認ができました。以下を 1 回だけ入力してください。入力した内容はどの協会の年度登録・大会エントリーでも共通で使われます。</p>
      <form method="post" action="/signup">
        ${profileFields(clubs, assocs, {}, true)}
        <label class="check"><input type="checkbox" name="consent" required> 会員情報共同利用規程に同意する（県・市協会が共同利用し、閲覧できる人を最小にします）</label>
        <div class="actions"><button class="primary">登録する</button></div>
      </form>
    </div>`;
  return c.html(page(c, { title: '会員登録', body }));
});

portal.post('/signup', async (c) => {
  const emailEnc = await readSession(c, 'signup');
  if (!emailEnc) return c.redirect('/login');
  const email = (await decrypt(c.env, emailEnc))!;
  const f = await form(c);
  if (!f.name?.trim() || !f.kana?.trim()) { flash(c, '氏名とふりがなは必須です', 'err'); return c.redirect('/signup'); }
  const ip = clientIp(c);
  if (await findMemberByEmail(c.env, email)) { flash(c, 'このメールは登録済みです', 'err'); return c.redirect('/login'); }

  // 名寄せ: 氏名＋ふりがなが一致する「仮会員」（ペア指定・ショップ代行・取込みで作られた本人未確認のレコード）があれば紐づける
  const same = await findSameNameMembers(c.env, f.name, f.kana);
  const provisional = same.filter((m) => m.status === 'provisional' && !m.email_hash);
  let member: Member;
  if (provisional.length === 1) {
    member = provisional[0];
    await updateMember(c.env, member.id, { email, phone: f.phone || null, postal: f.postal || null, address: f.address || null, sex: f.sex || null, birthYear: f.birth_year ? Number(f.birth_year) : null, clubId: f.club_id || null, status: 'active' });
    await run(c.env.DB, 'UPDATE members SET consented_at = ?, home_association_id = COALESCE(home_association_id, ?) WHERE id = ?', nowIso(), f.home || null, member.id);
    if (!member.member_no && f.home) {
      const assoc = await one<Association>(c.env.DB, 'SELECT * FROM associations WHERE id = ?', f.home);
      if (assoc) {
        const { issueMemberNo } = await import('../services/members');
        await run(c.env.DB, 'UPDATE members SET member_no = ? WHERE id = ?', await issueMemberNo(c.env, assoc), member.id);
      }
    }
    await audit(c.env, { actorType: 'member', actor: member.id, action: 'member.claim_provisional', target: `member:${member.id}`, ip });
    member = (await getMember(c.env, member.id))!;
  } else {
    member = await createMember(c.env, { name: f.name, kana: f.kana, sex: f.sex || null, birthYear: f.birth_year ? Number(f.birth_year) : null, email, phone: f.phone || null, postal: f.postal || null, address: f.address || null, clubId: f.club_id || null, homeAssociationId: f.home || null, status: 'active', consented: true });
    await audit(c.env, { actorType: 'member', actor: member.id, action: 'member.create', target: `member:${member.id}`, after: { source: 'web' }, ip });
    // 同姓同名の既存会員がいるときは自動結合せず、事務局が確認する候補にする
    for (const s of same) {
      await run(c.env.DB, `INSERT INTO merge_candidates (id, keep_member_id, dup_member_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)`, ulid(), s.id, member.id, '会員登録時に氏名・ふりがなが一致', nowIso());
    }
  }
  await destroySession(c, 'signup');
  await createSession(c, 'member', member.id);
  flash(c, `登録しました。会員番号は ${member.member_no ?? '（承認後に発番）'} です`);
  return c.redirect('/me');
});

// ---------- マイページ ----------
portal.get('/me', requireMember, async (c) => {
  const m = c.get('member')!;
  const contact = await decryptContact(c.env, m);
  const club = m.club_id ? await one<Club>(c.env.DB, 'SELECT * FROM clubs WHERE id = ?', m.club_id) : null;
  const regs = await all<Registration & { association_name: string; pay_status: string | null; method: string | null }>(c.env.DB, `SELECT r.*, a.name AS association_name, p.status AS pay_status, p.method FROM registrations r JOIN associations a ON a.id = r.association_id LEFT JOIN payments p ON p.id = r.payment_id WHERE r.member_id = ? ORDER BY r.fiscal_year DESC, a.id`, m.id);
  const entries = await all<Entry & { t_name: string; held_on: string; partner_name: string | null; pay_status: string | null }>(c.env.DB, `SELECT e.*, t.name AS t_name, t.held_on, m2.name AS partner_name, p.status AS pay_status FROM entries e JOIN tournaments t ON t.id = e.tournament_id LEFT JOIN members m2 ON m2.id = e.partner_member_id LEFT JOIN payments p ON p.id = e.payment_id WHERE e.member_id = ? OR e.partner_member_id = ? ORDER BY t.held_on DESC`, m.id, m.id);
  const pending = await all<Payment>(c.env.DB, `SELECT * FROM payments WHERE payer_member_id = ? AND status = 'pending' ORDER BY created_at DESC`, m.id);
  const fy = currentFiscalYear(4);
  const renew = inRenewalWindow(4);
  const body = html`
    ${pending.length ? html`<div class="flash err">お支払いが未完了のものがあります: ${pending.map((p) => html`<a href="/pay/${p.id}">${p.kind === 'entry' ? '大会参加費' : '年度登録料'} ${yen(p.amount)}</a> `)}</div>` : ''}
    <div class="card">
      <h2>会員情報</h2>
      <dl class="kv">
        <dt>会員番号</dt><dd><b>${m.member_no ?? '—'}</b></dd>
        <dt>氏名</dt><dd>${m.name}（${m.kana}）</dd>
        <dt>クラブ</dt><dd>${club?.name ?? '—'}</dd>
        <dt>メール</dt><dd>${contact.email ?? '—'}</dd>
        <dt>電話</dt><dd>${contact.phone ?? '—'}</dd>
        <dt>住所</dt><dd>${contact.postal ? `〒${contact.postal} ` : ''}${contact.address ?? '—'}</dd>
      </dl>
      <div class="actions"><a class="btn btn--outline" href="/me/profile">会員情報を変更</a></div>
    </div>
    <h2>年度登録</h2>
    <div class="tbl"><table><tr><th>年度</th><th>協会</th><th>区分</th><th>登録料</th><th>支払</th><th>状態</th></tr>
      ${regs.length === 0 ? html`<tr><td colspan="6">まだ年度登録がありません。</td></tr>` : regs.map((r) => html`<tr><td>${r.fiscal_year}年度</td><td>${r.association_name}</td><td>${CATEGORY_LABEL[r.category] ?? r.category}</td><td>${yen(r.fee)}</td><td>${r.pay_status ? badge(r.pay_status) : '—'}</td><td>${badge(r.status)}</td></tr>`)}
    </table></div>
    <div class="actions">
      <a class="btn primary" href="/registrations/new">${fy}年度の登録を申請</a>
      ${renew ? html`<a class="btn btn--outline" href="/registrations/new?fy=${fy + 1}">${fy + 1}年度の継続登録</a>` : ''}
    </div>
    <h2>大会エントリー</h2>
    <div class="tbl"><table><tr><th>大会</th><th>開催日</th><th>種目</th><th>ペア</th><th>支払</th><th>状態</th></tr>
      ${entries.length === 0 ? html`<tr><td colspan="6">まだエントリーがありません。<a href="/tournaments">大会を見る</a></td></tr>` : entries.map((e) => html`<tr><td>${e.t_name}</td><td>${fmtDate(e.held_on)}</td><td>${e.event_code}${e.class ? ' ' + e.class : ''}</td><td>${e.member_id === m.id ? e.partner_name ?? '—' : '（代表: 別の会員）'}</td><td>${e.pay_status ? badge(e.pay_status) : '—'}</td><td>${badge(e.status)}${e.status === 'pending_payment' && e.payment_id && e.member_id === m.id ? html` <a class="btn small" href="/pay/${e.payment_id}">支払う</a>` : ''}</td></tr>`)}
    </table></div>
    <div class="actions"><a class="btn" href="/tournaments">受付中の大会</a></div>
    <h2>退会</h2>
    <form method="post" action="/me/withdraw" class="card"><p class="mute">退会すると年度登録・エントリーは無効になります。住所・電話・メールは 2 年後に削除され、氏名と大会成績の履歴だけが残ります。</p><label class="check"><input type="checkbox" name="sure" required> 退会する</label><div><button class="btn--outline">退会を申請</button></div></form>`;
  return c.html(page(c, { title: 'マイページ', body, member: m }));
});

portal.get('/me/profile', requireMember, async (c) => {
  const m = c.get('member')!;
  const contact = await decryptContact(c.env, m);
  const { clubs, assocs } = await lookups(c.env);
  const body = html`<div class="card"><form method="post" action="/me/profile">
    ${profileFields(clubs, assocs, { name: m.name, kana: m.kana, sex: m.sex, birth_year: m.birth_year, phone: contact.phone, postal: contact.postal, address: contact.address, club_id: m.club_id }, false)}
    <label>メールアドレス <input type="email" name="email" required value="${contact.email ?? ''}"></label>
    <div class="actions"><button class="primary">保存</button><a class="btn btn--outline" href="/me">戻る</a></div></form></div>`;
  return c.html(page(c, { title: '会員情報の変更', body, member: m }));
});

portal.post('/me/profile', requireMember, async (c) => {
  const m = c.get('member')!;
  const f = await form(c);
  const email = normalizeEmail(f.email ?? '');
  const other = email ? await findMemberByEmail(c.env, email) : null;
  if (other && other.id !== m.id) { flash(c, 'そのメールアドレスは別の会員が使っています', 'err'); return c.redirect('/me/profile'); }
  const before = { name: m.name, kana: m.kana, club_id: m.club_id };
  await updateMember(c.env, m.id, { name: f.name, kana: f.kana, sex: f.sex || null, birthYear: f.birth_year ? Number(f.birth_year) : null, email, phone: f.phone || null, postal: f.postal || null, address: f.address || null, clubId: f.club_id || null });
  await audit(c.env, { actorType: 'member', actor: m.id, action: 'member.update', target: `member:${m.id}`, before, after: { name: f.name, kana: f.kana, club_id: f.club_id, contact_changed: true }, ip: clientIp(c) });
  flash(c, '会員情報を更新しました。全協会に反映されます');
  return c.redirect('/me');
});

portal.post('/me/withdraw', requireMember, async (c) => {
  const m = c.get('member')!;
  await run(c.env.DB, `UPDATE members SET status = 'withdrawn', withdrawn_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), m.id);
  await audit(c.env, { actorType: 'member', actor: m.id, action: 'member.withdraw', target: `member:${m.id}`, ip: clientIp(c) });
  await destroySession(c, 'member');
  flash(c, '退会を受け付けました');
  return c.redirect('/');
});

// ---------- 年度登録 ----------
portal.get('/registrations/new', requireMember, async (c) => {
  const m = c.get('member')!;
  const { assocs } = await lookups(c.env);
  const fy = Number(c.req.query('fy') ?? currentFiscalYear(4));
  const existing = await all<Registration>(c.env.DB, 'SELECT * FROM registrations WHERE member_id = ? AND fiscal_year = ?', m.id, fy);
  const prev = await all<Registration>(c.env.DB, 'SELECT * FROM registrations WHERE member_id = ? AND fiscal_year = ? AND status = \'approved\'', m.id, fy - 1);
  const body = html`
    <div class="card">
      ${prev.length ? html`<p class="ok">前年度（${fy - 1}年度）は ${prev.map((r) => assocs.find((a) => a.id === r.association_id)?.name).join('・')} に登録していました。同じ内容があらかじめ選ばれています。</p>` : ''}
      <form method="post" action="/registrations/new">
        <input type="hidden" name="fy" value="${fy}">
        <label>登録する協会（複数可。県と市を同時に選べます）</label>
        <div class="radio-list">
          ${assocs.map((a) => {
            const done = existing.find((r) => r.association_id === a.id);
            const checked = !done && (prev.some((r) => r.association_id === a.id) || (prev.length === 0 && a.id === m.home_association_id));
            return html`<label><input type="checkbox" name="assoc" value="${a.id}" ${done ? 'disabled' : ''} ${checked ? 'checked' : ''}> ${a.name}（${yen(a.annual_fee)}）${done ? html` ${badge(done.status)}` : ''}</label>`;
          })}
        </div>
        <label>登録区分 <select name="category">${Object.entries(CATEGORY_LABEL).map(([k, l]) => html`<option value="${k}" ${k === (prev[0]?.category ?? 'general') ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label>支払方法</label>
        <div class="radio-list">
          <label><input type="radio" name="method" value="stripe" checked> ${METHOD_LABEL.stripe}（自動で入金確認）</label>
          <label><input type="radio" name="method" value="bank"> ${METHOD_LABEL.bank}（事務局が確認）</label>
          <label><input type="radio" name="method" value="paypay"> ${METHOD_LABEL.paypay}（事務局が確認）</label>
        </div>
        <div class="actions"><button class="primary">申請して支払いへ</button><a class="btn btn--outline" href="/me">戻る</a></div>
      </form>
    </div>`;
  return c.html(page(c, { title: `${fy}年度の登録`, body, member: m }));
});

portal.post('/registrations/new', requireMember, async (c) => {
  const m = c.get('member')!;
  const f = await form(c);
  const fy = Number(f.fy);
  const ids = f.all('assoc');
  if (!ids.length) { flash(c, '協会を 1 つ以上選んでください', 'err'); return c.redirect(`/registrations/new?fy=${fy}`); }
  const method = (['stripe', 'bank', 'paypay'].includes(f.method) ? f.method : 'bank') as PaymentMethod;
  const assocs = await all<Association>(c.env.DB, `SELECT * FROM associations WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  // 支払先は協会ごと（他協会の資金を預からない）。協会ごとに支払を分ける。
  let firstPayment: string | null = null;
  for (const a of assocs) {
    const dup = await one(c.env.DB, 'SELECT 1 AS ok FROM registrations WHERE member_id = ? AND association_id = ? AND fiscal_year = ?', m.id, a.id, fy);
    if (dup) continue;
    const p = await createPayment(c.env, { kind: 'registration', associationId: a.id, payerMemberId: m.id, amount: a.annual_fee, method, note: `${fy}年度 年度登録料（${a.name}）` });
    firstPayment ??= p.id;
    const id = ulid();
    await run(c.env.DB, `INSERT INTO registrations (id, member_id, association_id, fiscal_year, category, fee, payment_id, status, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'web', ?)`, id, m.id, a.id, fy, f.category || 'general', a.annual_fee, p.id, nowIso());
    await audit(c.env, { actorType: 'member', actor: m.id, action: 'registration.create', target: `registration:${id}`, after: { association: a.id, fiscal_year: fy, method }, ip: clientIp(c) });
  }
  if (!firstPayment) { flash(c, 'すでに申請済みです', 'err'); return c.redirect('/me'); }
  if (assocs.length > 1) flash(c, `${assocs.length} 協会分の支払を作りました。協会ごとにお支払いください（マイページの未払い一覧）`);
  return c.redirect(`/pay/${firstPayment}`);
});

// ---------- 大会 ----------
portal.get('/tournaments', async (c) => {
  const rows = await all<Tournament & { association_name: string }>(c.env.DB, `SELECT t.*, a.name AS association_name FROM tournaments t JOIN associations a ON a.id = t.association_id WHERE t.status IN ('open','closed') ORDER BY t.held_on`);
  const body = html`<div class="tbl"><table><tr><th>大会</th><th>主催</th><th>開催日</th><th>会場</th><th>受付期間</th><th>状態</th></tr>
    ${rows.map((t) => html`<tr><td><a href="/tournaments/${t.id}">${t.name}</a></td><td>${t.association_name}</td><td>${fmtDate(t.held_on)}</td><td>${t.venue ?? ''}</td><td>${fmtDate(t.entry_start)}〜${fmtDate(t.entry_end)}</td><td>${badge(t.status)}</td></tr>`)}
  </table></div>`;
  return c.html(page(c, { title: '大会一覧', body, member: c.get('member') }));
});

async function loadTournament(env: Env, id: string) {
  const t = await one<Tournament & { association_name: string; fy_start: number }>(env.DB, `SELECT t.*, a.name AS association_name, a.fiscal_year_start_month AS fy_start FROM tournaments t JOIN associations a ON a.id = t.association_id WHERE t.id = ?`, id);
  if (!t) return null;
  return { t, events: JSON.parse(t.events_json) as TournamentEvent[], methods: JSON.parse(t.payment_methods_json) as PaymentMethod[] };
}

portal.get('/tournaments/:id', async (c) => {
  const m = c.get('member');
  const x = await loadTournament(c.env, c.req.param('id'));
  if (!x) return c.notFound();
  const { t, events, methods } = x;
  const today = todayJst();
  const acceptingNow = t.status === 'open' && t.entry_start <= today && today <= t.entry_end;
  let eligible: boolean | null = null;
  if (m && t.requires_registration) eligible = await hasApprovedRegistration(c.env, m.id, t.association_id, fiscalYear(t.held_on, t.fy_start));
  const body = html`
    <div class="card">
      <dl class="kv"><dt>主催</dt><dd>${t.association_name}</dd><dt>開催日</dt><dd>${fmtDate(t.held_on)}</dd><dt>会場</dt><dd>${t.venue ?? '—'}</dd><dt>受付期間</dt><dd>${fmtDate(t.entry_start)}〜${fmtDate(t.entry_end)}</dd><dt>参加資格</dt><dd>${t.eligibility ?? '—'}</dd><dt>支払方法</dt><dd>${methods.map((k) => METHOD_LABEL[k]).join(' / ')}</dd><dt>状態</dt><dd>${badge(t.status)}</dd></dl>
    </div>
    <h2>種目</h2>
    <div class="tbl"><table><tr><th>種目</th><th>クラス</th><th>参加費</th></tr>${events.map((e) => html`<tr><td>${e.name}</td><td>${e.classes.join(' / ') || '—'}</td><td>${yen(e.fee)}</td></tr>`)}</table></div>
    <div class="actions">
      ${!acceptingNow ? html`<span class="mute">受付期間外です</span>` : !m ? html`<a class="btn primary" href="/login">ログインしてエントリー</a>` : eligible === false ? html`<span class="warn">${t.association_name}の${fiscalYear(t.held_on, t.fy_start)}年度登録（承認済み）が必要です。</span><a class="btn" href="/registrations/new">年度登録へ</a>` : html`<a class="btn primary" href="/tournaments/${t.id}/entry">エントリーする</a>`}
    </div>`;
  return c.html(page(c, { title: t.name, body, member: m }));
});

portal.get('/tournaments/:id/entry', requireMember, async (c) => {
  const m = c.get('member')!;
  const x = await loadTournament(c.env, c.req.param('id') ?? '');
  if (!x) return c.notFound();
  const { t, events, methods } = x;
  const q = c.req.query('q') ?? '';
  const results = q ? (await searchMembers(c.env, q)).filter((r) => r.id !== m.id) : [];
  const body = html`
    <form method="get" action="/tournaments/${t.id}/entry" class="card">
      <h2>ペアを探す（ダブルスのとき）</h2>
      <p class="mute">会員番号か氏名・ふりがなで検索します。住所・電話は表示されません。未登録のペアは下で「仮会員」として氏名だけ登録できます。</p>
      <input type="text" name="q" value="${q}" placeholder="T-26-0001 / 佐藤 / さとう"> <button class="small">検索</button>
      ${q ? html`<p class="mute">${results.length} 件</p>` : ''}
    </form>
    <form method="post" action="/tournaments/${t.id}/entry" class="card">
      <label>種目</label>
      <div class="radio-list">${events.map((e, i) => html`<label><input type="radio" name="event" value="${e.code}" ${i === 0 ? 'checked' : ''} required> ${e.name}（${yen(e.fee)}・${e.teamSize === 2 ? 'ペア' : '個人'}）</label>`)}</div>
      <label>クラス <select name="class"><option value="">（クラス無し）</option>${[...new Set(events.flatMap((e) => e.classes))].map((cl) => html`<option value="${cl}">${cl}</option>`)}</select></label>
      <label>ペア（ダブルスのみ）</label>
      <div class="radio-list">
        <label><input type="radio" name="partner" value="" checked> 無し（シングルス）</label>
        ${results.map((r) => html`<label><input type="radio" name="partner" value="${r.id}"> ${r.name}（${r.kana}）${r.member_no ? ' ' + r.member_no : ''} / ${r.club_name ?? '—'} ${r.status === 'provisional' ? badge('provisional') : ''}</label>`)}
        <label><input type="radio" name="partner" value="new"> 未登録のペアを氏名で登録（仮会員）</label>
      </div>
      <div class="indent"><input type="text" name="new_name" placeholder="氏名"> <input type="text" name="new_kana" placeholder="ふりがな"> <input type="text" name="new_club" placeholder="クラブ名"></div>
      <label>支払方法</label>
      <div class="radio-list">${methods.map((k, i) => html`<label><input type="radio" name="method" value="${k}" ${i === 0 ? 'checked' : ''}> ${METHOD_LABEL[k]}${k === 'stripe' ? '（自動で確定）' : k === 'cash' ? '（ショップで現金を渡すと確定）' : '（事務局が確認して確定）'}</label>`)}</div>
      <div class="actions"><button class="primary">エントリーして支払いへ</button><a class="btn btn--outline" href="/tournaments/${t.id}">戻る</a></div>
    </form>`;
  return c.html(page(c, { title: `エントリー: ${t.name}`, body, member: m }));
});

export interface EntryInput { tournamentId: string; memberId: string; eventCode: string; klass: string | null; partnerId: string | null; newPartner?: { name: string; kana: string; club: string } | null; method: PaymentMethod; source: 'web' | 'shop' | 'club'; createdBy: string }

/** エントリー作成の共通処理（Web・ショップ代行・クラブ一括が同じ経路に合流する）。 */
export async function createEntry(env: Env, i: EntryInput, ip: string | null): Promise<{ ok: true; entryId: string; paymentId: string } | { ok: false; error: string }> {
  const x = await loadTournament(env, i.tournamentId);
  if (!x) return { ok: false, error: '大会がありません' };
  const { t, events, methods } = x;
  const today = todayJst();
  if (i.source === 'web' && !(t.status === 'open' && t.entry_start <= today && today <= t.entry_end)) return { ok: false, error: '受付期間外です' };
  if (t.status !== 'open') return { ok: false, error: '受付中の大会ではありません' };
  const ev = events.find((e) => e.code === i.eventCode);
  if (!ev) return { ok: false, error: '種目が正しくありません' };
  if (ev.classes.length && (!i.klass || !ev.classes.includes(i.klass))) return { ok: false, error: 'クラスを選んでください' };
  if (!methods.includes(i.method)) return { ok: false, error: 'この大会で使えない支払方法です' };
  const member = await getMember(env, i.memberId);
  if (!member) return { ok: false, error: '会員がありません' };
  if (t.requires_registration && !(await hasApprovedRegistration(env, member.id, t.association_id, fiscalYear(t.held_on, t.fy_start)))) return { ok: false, error: `${t.association_name}の当年度登録（承認済み）が必要です` };
  let partnerId: string | null = null;
  if (ev.teamSize === 2) {
    if (i.newPartner) {
      if (!i.newPartner.name || !i.newPartner.kana) return { ok: false, error: 'ペアの氏名とふりがなを入れてください' };
      let clubId: string | null = null;
      if (i.newPartner.club) {
        const cl = await one<Club>(env.DB, 'SELECT * FROM clubs WHERE name = ?', i.newPartner.club.trim());
        if (cl) clubId = cl.id;
        else { clubId = `club-${ulid().toLowerCase()}`; await run(env.DB, 'INSERT INTO clubs (id, name, created_at) VALUES (?, ?, ?)', clubId, i.newPartner.club.trim(), nowIso()); }
      }
      const p = await createMember(env, { name: i.newPartner.name, kana: i.newPartner.kana, clubId, homeAssociationId: null, status: 'provisional' });
      await audit(env, { actorType: i.source === 'web' ? 'member' : i.source === 'shop' ? 'shop' : 'member', actor: i.createdBy, action: 'member.create_provisional', target: `member:${p.id}`, after: { reason: 'ペア指定' }, ip });
      partnerId = p.id;
    } else if (i.partnerId) {
      const p = await getMember(env, i.partnerId);
      if (!p || p.status === 'withdrawn') return { ok: false, error: 'ペアの会員が見つかりません' };
      if (p.id === member.id) return { ok: false, error: '自分自身をペアにはできません' };
      partnerId = p.id;
    } else return { ok: false, error: 'ダブルスはペアを選んでください' };
  }
  const dup = await one(env.DB, `SELECT 1 AS ok FROM entries WHERE tournament_id = ? AND event_code = ? AND status <> 'cancelled' AND (member_id = ? OR partner_member_id = ?)`, t.id, ev.code, member.id, member.id);
  if (dup) return { ok: false, error: 'この種目にはすでにエントリーしています' };
  if (t.capacity) {
    const n = await one<{ n: number }>(env.DB, `SELECT COUNT(*) AS n FROM entries WHERE tournament_id = ? AND status <> 'cancelled'`, t.id);
    if ((n?.n ?? 0) >= t.capacity) return { ok: false, error: '定員に達しています' };
  }
  const payment = await createPayment(env, { kind: 'entry', associationId: t.association_id, payerMemberId: member.id, amount: ev.fee, method: i.method, note: `${t.name} ${ev.name}${i.klass ? ' ' + i.klass : ''}` });
  const id = ulid();
  await run(env.DB, `INSERT INTO entries (id, tournament_id, event_code, class, member_id, partner_member_id, source, payment_id, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)`, id, t.id, ev.code, i.klass || null, member.id, partnerId, i.source, payment.id, i.createdBy, nowIso());
  await audit(env, { actorType: i.source === 'shop' ? 'shop' : 'member', actor: i.createdBy, action: 'entry.create', target: `entry:${id}`, after: { tournament: t.id, event: ev.code, class: i.klass, partner: partnerId, method: i.method, source: i.source }, ip });
  // ペアにも通知（なりすまし対策: 指定されたペアに知らせ、異議があれば事務局へ）
  if (partnerId) {
    const p = await getMember(env, partnerId);
    const email = p ? await decrypt(env, p.email_enc) : null;
    if (email) await sendMail(env, { to: email, subject: `【${env.APP_NAME}】${member.name} さんがあなたをペアにエントリーしました`, text: `${p!.name} 様\n\n${t.name}（${ev.name}）に ${member.name} さんがあなたをペアとしてエントリーしました。\n心当たりがない場合は事務局までご連絡ください。\n${env.BASE_URL}/me` });
  }
  return { ok: true, entryId: id, paymentId: payment.id };
}

portal.post('/tournaments/:id/entry', requireMember, async (c) => {
  const m = c.get('member')!;
  const f = await form(c);
  const r = await createEntry(c.env, {
    tournamentId: c.req.param('id') ?? '', memberId: m.id, eventCode: f.event, klass: f.class || null,
    partnerId: f.partner && f.partner !== 'new' ? f.partner : null,
    newPartner: f.partner === 'new' ? { name: f.new_name?.trim() ?? '', kana: f.new_kana?.trim() ?? '', club: f.new_club?.trim() ?? '' } : null,
    method: f.method as PaymentMethod, source: 'web', createdBy: m.id,
  }, clientIp(c));
  if (!r.ok) { flash(c, r.error, 'err'); return c.redirect(`/tournaments/${c.req.param('id')}/entry`); }
  return c.redirect(`/pay/${r.paymentId}`);
});

// ---------- 支払 ----------
portal.get('/pay/:id', requireMember, async (c) => {
  const m = c.get('member')!;
  const p = await getPayment(c.env, c.req.param('id') ?? '');
  if (!p || p.payer_member_id !== m.id) return c.notFound();
  const a = (await one<Association>(c.env.DB, 'SELECT * FROM associations WHERE id = ?', p.association_id))!;
  let how;
  if (p.status === 'paid') how = html`<p class="ok"><b>入金を確認済みです。</b>領収書番号 ${p.receipt_no}（${fmtDateTime(p.paid_at)}）</p>`;
  else if (p.status !== 'pending') how = html`<p class="mute">この支払は ${badge(p.status)} です。</p>`;
  else if (p.method === 'stripe') how = html`<p>カード・コンビニ・銀行振込（Stripe）で支払うと、入金が自動で確定し領収書もメールで届きます。</p><form method="post" action="/pay/${p.id}/stripe"><button class="primary">Stripe で支払う</button></form>`;
  else if (p.method === 'bank') how = html`<p>次の口座にお振込みください。振込手数料はご負担ください。事務局が通帳を確認して確定します（数日かかることがあります）。</p><pre>${a.bank_info ?? '（振込先は協会が設定します）'}\n振込名義: ${m.member_no ?? ''} ${m.name}</pre>`;
  else if (p.method === 'paypay') how = html`<p>協会の PayPay に送金してください。送金メッセージに会員番号を入れてください。事務局が確認して確定します。</p><pre>${a.paypay_info ?? '（送金先は協会が設定します）'}\nメッセージ: ${m.member_no ?? ''} ${m.name}</pre>`;
  else how = html`<p>テニスショップの窓口で現金をお渡しください。ショップが「現金受領」を記録すると確定します。</p>`;
  const body = html`<div class="card">
    <dl class="kv"><dt>内容</dt><dd>${p.note ?? (p.kind === 'entry' ? '大会参加費' : '年度登録料')}</dd><dt>支払先</dt><dd>${a.name}</dd><dt>金額</dt><dd><b>${yen(p.amount)}</b></dd><dt>方法</dt><dd>${METHOD_LABEL[p.method]}</dd><dt>状態</dt><dd>${badge(p.status)}</dd></dl>
    ${how}
    <div class="actions"><a class="btn btn--outline" href="/me">マイページへ</a></div></div>`;
  return c.html(page(c, { title: 'お支払い', body, member: m }));
});

portal.post('/pay/:id/stripe', requireMember, async (c) => {
  const m = c.get('member')!;
  const p = await getPayment(c.env, c.req.param('id') ?? '');
  if (!p || p.payer_member_id !== m.id || p.status !== 'pending' || p.method !== 'stripe') return c.notFound();
  const email = await decrypt(c.env, m.email_enc);
  const { url, sessionId } = await createCheckoutUrl(c.env, { paymentId: p.id, amount: p.amount, description: p.note ?? '参加費', successUrl: `${c.env.BASE_URL}/pay/${p.id}`, cancelUrl: `${c.env.BASE_URL}/pay/${p.id}`, customerEmail: email });
  await run(c.env.DB, 'UPDATE payments SET external_id = ? WHERE id = ?', sessionId, p.id);
  return c.redirect(url);
});

// ---------- クラブ管理（クラブ連絡担当） ----------
portal.get('/club', requireMember, async (c) => {
  const m = c.get('member')!;
  if (!m.club_manager || !m.club_id) return c.notFound();
  const club = (await one<Club>(c.env.DB, 'SELECT * FROM clubs WHERE id = ?', m.club_id))!;
  const assocs = await all<Association>(c.env.DB, 'SELECT * FROM associations ORDER BY id');
  const fy = currentFiscalYear(4);
  const rows = await all<Member & { regs: string | null }>(c.env.DB, `SELECT m.*, (SELECT GROUP_CONCAT(a.code || ':' || r.status) FROM registrations r JOIN associations a ON a.id = r.association_id WHERE r.member_id = m.id AND r.fiscal_year = ?) AS regs FROM members m WHERE m.club_id = ? AND m.merged_into IS NULL AND m.status <> 'withdrawn' ORDER BY m.kana`, fy, m.club_id);
  const body = html`
    <p class="mute">クラブ連絡担当は自クラブ会員の氏名と登録状態だけを見られます（住所・電話は表示されません）。所属会員の年度登録をまとめて申請し、登録料を一括で支払えます。</p>
    <form method="post" action="/club/register">
      <div class="tbl"><table><tr><th></th><th>会員番号</th><th>氏名</th><th>状態</th><th>${fy}年度の登録</th></tr>
        ${rows.map((r) => html`<tr><td><input type="checkbox" name="member" value="${r.id}"></td><td>${r.member_no ?? '—'}</td><td>${r.name}（${r.kana}）</td><td>${badge(r.status)}</td><td>${r.regs ?? '—'}</td></tr>`)}
      </table></div>
      <label>登録する協会 <select name="assoc">${assocs.map((a) => html`<option value="${a.id}">${a.name}（${yen(a.annual_fee)}/人）</option>`)}</select></label>
      <div class="actions"><button class="primary">選んだ会員をまとめて${fy}年度登録（振込で一括支払）</button></div>
    </form>
    <h2>会員を追加（代理登録）</h2>
    <form method="post" action="/club/members" class="card"><p class="mute">本人がログインできない会員を氏名だけで仮登録します。本人が同じ氏名・ふりがなでメール登録すると自動で紐づきます。</p>
      <input type="text" name="name" placeholder="氏名" required> <input type="text" name="kana" placeholder="ふりがな" required> <button>追加</button></form>`;
  return c.html(page(c, { title: `クラブ管理: ${club.name}`, body, member: m }));
});

portal.post('/club/members', requireMember, async (c) => {
  const m = c.get('member')!;
  if (!m.club_manager || !m.club_id) return c.notFound();
  const f = await form(c);
  const p = await createMember(c.env, { name: f.name, kana: f.kana, clubId: m.club_id, homeAssociationId: m.home_association_id, status: 'provisional' });
  await audit(c.env, { actorType: 'member', actor: m.id, action: 'member.create_provisional', target: `member:${p.id}`, after: { reason: 'クラブ代理登録' }, ip: clientIp(c) });
  flash(c, `${p.name} さんを仮会員として追加しました`);
  return c.redirect('/club');
});

portal.post('/club/register', requireMember, async (c) => {
  const m = c.get('member')!;
  if (!m.club_manager || !m.club_id) return c.notFound();
  const f = await form(c);
  const ids = f.all('member');
  const a = await one<Association>(c.env.DB, 'SELECT * FROM associations WHERE id = ?', f.assoc);
  if (!ids.length || !a) { flash(c, '会員を選んでください', 'err'); return c.redirect('/club'); }
  const fy = currentFiscalYear(a.fiscal_year_start_month);
  let n = 0;
  const payment = await createPayment(c.env, { kind: 'registration', associationId: a.id, payerMemberId: m.id, amount: 0, method: 'bank', note: `${fy}年度 年度登録料 クラブ一括（${a.name}）` });
  for (const id of ids) {
    const mm = await one<Member>(c.env.DB, 'SELECT * FROM members WHERE id = ? AND club_id = ?', id, m.club_id);
    if (!mm) continue;
    const dup = await one(c.env.DB, 'SELECT 1 AS ok FROM registrations WHERE member_id = ? AND association_id = ? AND fiscal_year = ?', mm.id, a.id, fy);
    if (dup) continue;
    await run(c.env.DB, `INSERT INTO registrations (id, member_id, association_id, fiscal_year, category, fee, payment_id, status, source, created_at) VALUES (?, ?, ?, ?, 'general', ?, ?, 'pending', 'club', ?)`, ulid(), mm.id, a.id, fy, a.annual_fee, payment.id, nowIso());
    n++;
  }
  if (n === 0) { await run(c.env.DB, 'DELETE FROM payments WHERE id = ?', payment.id); flash(c, '新たに申請できる会員がありませんでした', 'err'); return c.redirect('/club'); }
  await run(c.env.DB, 'UPDATE payments SET amount = ? WHERE id = ?', a.annual_fee * n, payment.id);
  await audit(c.env, { actorType: 'member', actor: m.id, action: 'registration.bulk_create', target: `payment:${payment.id}`, after: { association: a.id, fiscal_year: fy, count: n }, ip: clientIp(c) });
  flash(c, `${n} 名分の年度登録を申請しました`);
  return c.redirect(`/pay/${payment.id}`);
});
