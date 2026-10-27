// 共通レイアウト。スクリプトは一切使わない（CSP で script-src 'none'。設計書 §7.3）。
import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { Ctx } from '../app';
import { isProd } from '../env';
import { takeFlash } from '../lib/session';
import { STATUS_LABEL, type Admin, type Member, ROLE_LABEL } from '../types';

export type H = HtmlEscapedString | Promise<HtmlEscapedString>;

export interface LayoutOpts {
  title: string;
  body: H;
  member?: Member | null;
  admin?: Admin | null;
  wide?: boolean;
}

export function page(c: Ctx, o: LayoutOpts): H {
  const env = c.env;
  const f = takeFlash(c);
  const dev = !isProd(env);
  const nav = o.admin
    ? adminNav(o.admin)
    : o.member
      ? html`<a href="/me">マイページ</a><a href="/tournaments">大会</a>${o.member.club_manager ? html`<a href="/club">クラブ管理</a>` : ''}<form method="post" action="/logout" class="inline"><button class="link">ログアウト</button></form>`
      : html`<a href="/tournaments">大会</a><a href="/login">ログイン / 会員登録</a>`;
  return html`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${o.title} | ${env.APP_NAME}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="${o.admin ? '/admin' : '/'}"><span class="dot"></span>${env.APP_NAME}${o.admin ? html` <small>事務局</small>` : ''}</a>
    <nav>${nav}</nav>
  </div>
</header>
${dev ? html`<div class="devbar wrap">開発モード（サンプル）: メールは <a href="/dev/mailbox">送信箱</a> に届きます。Stripe は <a href="/dev">シミュレータ</a>。事務局は <a href="/admin/login">管理者を選んでログイン</a>。</div>` : ''}
<main class="wrap ${o.wide ? 'wide' : ''}">
  ${f ? html`<div class="flash ${f.kind}">${f.msg}</div>` : ''}
  <h1>${o.title}</h1>
  ${o.body}
</main>
<footer class="wrap foot">テニス協会 会員登録・大会エントリー一元管理システム（Phase 1 動作確認用サンプル）</footer>
</body>
</html>`;
}

function adminNav(a: Admin) {
  const items: [string, string][] = [];
  if (a.role === 'shop') {
    items.push(['/shop', '代行入力'], ['/shop/today', '本日の入力']);
  } else {
    items.push(['/admin', 'ダッシュボード']);
    if (a.role !== 'sysadmin') items.push(['/admin/members', '会員']);
    if (a.role === 'assoc_admin') items.push(['/admin/registrations', '年度登録'], ['/admin/payments', '消込'], ['/admin/merges', '名寄せ'], ['/admin/import', '取込み']);
    if (a.role === 'tournament') items.push(['/admin/payments', '消込']);
    items.push(['/admin/tournaments', '大会']);
    if (a.role === 'sysadmin' || a.role === 'assoc_admin') items.push(['/admin/audit', '監査ログ']);
    if (a.role === 'sysadmin') items.push(['/admin/admins', '管理者'], ['/admin/associations', '協会']);
  }
  return html`${items.map(([href, label]) => html`<a href="${href}">${label}</a>`)}<span class="who">${a.name}（${ROLE_LABEL[a.role]}）</span><form method="post" action="/admin/logout" class="inline"><button class="link">ログアウト</button></form>`;
}

export const badge = (status: string) => html`<span class="badge s-${status}">${STATUS_LABEL[status] ?? status}</span>`;
export const esc = (s: unknown) => html`${s == null ? '' : String(s)}`;
export { html, raw };
