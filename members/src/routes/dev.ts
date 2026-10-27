// 開発モード専用（APP_ENV=production では 404）。送信箱・Stripe シミュレータ・デモデータの投入とリセット。
import { Hono } from 'hono';
import { html } from 'hono/html';
import type { Env } from '../env';
import { all, run } from '../lib/db';
import { fmtDateTime, yen } from '../lib/fiscal';
import { signStripePayload } from '../lib/stripe';
import { counts, resetAll, seedDemo } from '../seed';
import { getPayment } from '../services/payments';
import { page } from '../views/layout';
import { handleStripeWebhook } from './api';
import type { Vars } from '../app';
import { flash } from '../lib/session';

export const dev = new Hono<{ Bindings: Env; Variables: Vars }>();

dev.get('/', async (c) => {
  const n = await counts(c.env);
  const body = html`
    <div class="card">
      <h2>デモデータ</h2>
      <p class="mute">協会 4・クラブ 6・会員 8（仮会員 2 名、名寄せ候補 1 組）・大会 3・管理者 6 を入れます。何度でもやり直せます。</p>
      <div class="tbl"><table><tr>${Object.keys(n).map((k) => html`<th>${k}</th>`)}</tr><tr>${Object.values(n).map((v) => html`<td>${v}</td>`)}</tr></table></div>
      <div class="actions">
        <form method="post" action="/dev/seed"><button class="primary">デモデータを投入（既存を消して入れ直す）</button></form>
        <form method="post" action="/dev/reset"><button class="btn--outline">すべて消す（監査ログは消えない）</button></form>
      </div>
    </div>
    <div class="card">
      <h2>動作確認の手順</h2>
      <div class="steps">
        <div class="step"><p class="step__title">会員登録</p><p class="step__text"><a href="/login">ログイン / 会員登録</a> で任意のメールを入れ、<a href="/dev/mailbox">送信箱</a> のリンクを開く</p></div>
        <div class="step"><p class="step__title">年度登録</p><p class="step__text">プロフィールを入れて会員になる → マイページから年度登録（振込）</p></div>
        <div class="step"><p class="step__title">事務局で承認</p><p class="step__text"><a href="/admin/login">事務局（鳥取市 事務局）</a>でログインし、消込 → 年度登録を承認</p></div>
        <div class="step"><p class="step__title">大会エントリー</p><p class="step__text">会員で <a href="/tournaments">大会</a> にエントリー（ペアは会員番号・氏名で検索）→ Stripe で支払（シミュレータ）</p></div>
        <div class="step"><p class="step__title">運営アプリ連携</p><p class="step__text">事務局の大会画面でトークンを発行し、<code>/api/v1/tournaments/T-DEMO-OPEN/entries.json?token=…</code> を開く</p></div>
        <div class="step"><p class="step__title">定期実行と監査</p><p class="step__text"><a href="/__scheduled?cron=0+0+*+*+*">定期実行</a> を手で動かし、<a href="/admin/audit">監査ログ</a> を見る</p></div>
      </div>
      <p class="mute">デモ会員のメール: yamada@example.com（クラブ管理）/ sato@example.com / suzuki@example.com / tanaka@example.com（年度登録 承認待ち）</p>
    </div>`;
  return c.html(page(c, { title: '開発モード', body }));
});

dev.post('/seed', async (c) => {
  await resetAll(c.env);
  await seedDemo(c.env);
  flash(c, 'デモデータを投入しました');
  return c.redirect('/dev');
});
dev.post('/reset', async (c) => {
  await resetAll(c.env);
  flash(c, 'データを消しました');
  return c.redirect('/dev');
});

dev.get('/mailbox', async (c) => {
  const rows = await all<{ id: string; to_addr: string; subject: string; body: string; created_at: string }>(c.env.DB, 'SELECT * FROM mail_outbox ORDER BY created_at DESC LIMIT 50');
  const body = html`
    <p class="mute">Email Sending の代わりに貯めた通知メール。本文の URL はそのまま開けます。</p>
    <form method="post" action="/dev/mailbox/clear"><button class="btn--outline small">空にする</button></form>
    ${rows.length === 0 ? html`<p>まだありません。</p>` : rows.map((m) => html`<div class="card"><div class="mute">${fmtDateTime(m.created_at)} → ${m.to_addr}</div><h3>${m.subject}</h3><pre>${linkify(m.body)}</pre></div>`)}`;
  return c.html(page(c, { title: '送信箱（開発モード）', body }));
});
dev.get('/mailbox.json', async (c) => {
  const rows = await all(c.env.DB, 'SELECT * FROM mail_outbox ORDER BY created_at DESC LIMIT 50');
  return c.json(rows);
});
dev.post('/mailbox/clear', async (c) => {
  await run(c.env.DB, 'DELETE FROM mail_outbox');
  return c.redirect('/dev/mailbox');
});

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((p) => (/^https?:\/\//.test(p) ? html`<a href="${p}">${p}</a>` : html`${p}`));
}

/** Stripe Checkout の代わり。「支払う」で本物と同じ形の Webhook（署名付き）を内部で処理する。 */
dev.get('/stripe/:id', async (c) => {
  const p = await getPayment(c.env, c.req.param('id'));
  if (!p) return c.notFound();
  const body = html`
    <div class="card">
      <p class="mute">Stripe Checkout のシミュレータです。STRIPE_SECRET_KEY を設定すると本物の決済ページに置き換わります。</p>
      <dl class="kv"><dt>支払 ID</dt><dd>${p.id}</dd><dt>金額</dt><dd>${yen(p.amount)}</dd><dt>状態</dt><dd>${p.status}</dd></dl>
      <div class="actions">
        <form method="post" action="/dev/stripe/${p.id}/pay"><button class="primary">カードで支払う（成功）</button></form>
        <form method="post" action="/dev/stripe/${p.id}/pay"><input type="hidden" name="tamper" value="1"><button class="btn--outline">金額を改ざんした Webhook を送る（拒否される）</button></form>
        <form method="post" action="/dev/stripe/${p.id}/pay"><input type="hidden" name="badsig" value="1"><button class="btn--outline">署名の無い Webhook を送る（拒否される）</button></form>
        <a class="btn btn--outline" href="/pay/${p.id}">戻る</a>
      </div>
    </div>`;
  return c.html(page(c, { title: 'Stripe 決済（シミュレータ）', body, member: c.get('member') }));
});
dev.post('/stripe/:id/pay', async (c) => {
  const p = await getPayment(c.env, c.req.param('id'));
  if (!p) return c.notFound();
  const f = await c.req.parseBody();
  const event = {
    id: `evt_sim_${Date.now()}`, type: 'checkout.session.completed',
    data: { object: { id: `cs_sim_${p.id}`, object: 'checkout.session', amount_total: f['tamper'] ? p.amount - 1000 : p.amount, currency: 'jpy', payment_status: 'paid', client_reference_id: p.id, metadata: { payment_id: p.id } } },
  };
  const raw = JSON.stringify(event);
  const sig = f['badsig'] ? 't=1,v1=deadbeef' : await signStripePayload(c.env, raw);
  const r = await handleStripeWebhook(c.env, raw, sig, '127.0.0.1');
  if (r.status === 200) {
    flash(c, 'Stripe の Webhook で入金を自動確定しました');
    return c.redirect(`/pay/${p.id}`);
  }
  flash(c, `Webhook は拒否されました: ${JSON.stringify(r.body)}（監査ログに記録）`, 'err');
  return c.redirect(`/dev/stripe/${p.id}`);
});
