// 共通レイアウト。公式サイト本体（src/layouts/Base.astro）と同じ骨組み・同じ CSS/JS を使い、見た目と動きをそろえる。
//   ・追従ヘッダー（下へ読むと引っ込み、上へ戻すと出る）、右上の赤いブロック、ハンバーガーの札配りメニュー
//   ・ページ見出しのスラッシュ塗り替え、背景の大きな英字、スクロールで現れるブロック、押したときの波紋
//   ・漂う四角のフッター
// 本体の style.css / main.js は scripts/sync-assets.mjs が複製する。ポータル固有の上書きは public/members.css。
import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { Ctx } from '../app';
import { type Env, isDemo, isProd } from '../env';
import { all } from '../lib/db';
import { takeFlash } from '../lib/session';
import { STATUS_LABEL, type Admin, type Member, ROLE_LABEL } from '../types';

export type H = HtmlEscapedString | Promise<HtmlEscapedString>;

export interface LayoutOpts {
  title: string;
  body: H;
  member?: Member | null;
  admin?: Admin | null;
  /** 背景の大きな英字と見出し上の英語ラベル（省略すると URL から決める） */
  en?: string;
  /** 見出しの下のリード文 */
  lead?: H | string;
  wide?: boolean;
}

interface NavItem { href: string; label: string; en?: boolean; external?: boolean }

const EN_BY_PATH: [RegExp, string][] = [
  [/^\/admin\/tournaments/, 'TOURNAMENTS'], [/^\/admin\/members/, 'MEMBERS'], [/^\/admin\/registrations/, 'REGISTRATION'],
  [/^\/admin\/payments/, 'PAYMENTS'], [/^\/admin\/associations|^\/admin\/admins/, 'SETTINGS'], [/^\/admin\/audit/, 'AUDIT LOG'], [/^\/admin\/merges|^\/admin\/import/, 'IMPORT'], [/^\/admin\/deletions|^\/me\/deletion/, 'DELETION'],
  [/^\/admin/, 'ADMIN'], [/^\/shop/, 'SHOP'], [/^\/tournaments/, 'TOURNAMENTS'], [/^\/me/, 'MY PAGE'],
  [/^\/login|^\/signup|^\/auth/, 'LOGIN'], [/^\/registrations/, 'REGISTRATION'], [/^\/pay/, 'PAYMENT'],
  [/^\/club/, 'CLUB'], [/^\/dev/, 'DEMO'], [/^\/security/, 'SECURITY'], [/^\/privacy/, 'PRIVACY'], [/^\/$/, 'MEMBERS'],
];

export function page(c: Ctx, o: LayoutOpts): H {
  const env = c.env;
  const f = takeFlash(c);
  const dev = !isProd(env);
  const path = new URL(c.req.url).pathname;
  const en = o.en ?? EN_BY_PATH.find(([re]) => re.test(path))?.[1] ?? 'MEMBERS';
  const siteUrl = env.SITE_URL || 'https://tcta-site.tcta-admin-worker.workers.dev/';
  const nonce = (c.get as (k: string) => string | undefined)('secureHeadersNonce') ?? '';

  // ナビの項目（会員側・事務局側）
  const items: NavItem[] = o.admin ? adminItems(o.admin) : memberItems(o.member ?? null, siteUrl);
  const groups = o.admin ? adminGroups(o.admin) : [];
  const act = o.admin ? activeTab(groups, path) : { group: null, href: null };
  const isActive = (it: NavItem) => {
    if (it.external) return false;
    if (o.admin && act.group) return it.href === act.group.tabs[0].href;
    return it.href === '/' ? path === '/' : path.startsWith(it.href);
  };
  // まとまりの中に画面が 2 つ以上あれば、ページ上部にタブを出す（本体サイトの .tabs と同じ見た目）
  const subTabs = act.group && act.group.tabs.length > 1
    ? html`<nav class="tabs admin-tabs" aria-label="${act.group.label}の画面">${act.group.tabs.map((t) => html`<a class="tab ${t.href === act.href ? 'is-active' : ''}" href="${t.href}" ${t.href === act.href ? raw('aria-current="page"') : ''}>${t.label}</a>`)}</nav>`
    : '';
  const homeHref = o.admin ? (o.admin.role === 'shop' ? '/shop' : '/admin') : '/';
  // 右上の赤いブロック（本体の「お問い合わせ」の位置）: ログイン／ログアウト
  const contact = o.admin
    ? html`<form method="post" action="/admin/logout" class="header-contact-form"><button class="header-contact">ログアウト</button></form>`
    : o.member
      ? html`<form method="post" action="/logout" class="header-contact-form"><button class="header-contact">ログアウト</button></form>`
      : html`<a class="header-contact" href="/login">ログイン</a>`;
  const mobileBtn = o.admin
    ? html`<form method="post" action="/admin/logout" class="mobile-nav__item" style="--i:${items.length}"><button class="btn btn--primary">ログアウト <span class="aw">→</span></button></form>`
    : o.member
      ? html`<form method="post" action="/logout" class="mobile-nav__item" style="--i:${items.length}"><button class="btn btn--primary">ログアウト <span class="aw">→</span></button></form>`
      : html`<a class="btn btn--primary mobile-nav__item" href="/login" style="--i:${items.length}">ログイン / 会員登録 <span class="aw">→</span></a>`;

  return html`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${o.title}｜${env.APP_NAME}</title>
<link rel="icon" href="/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/img/favicon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Jost:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="stylesheet" href="/members.css">
<script nonce="${nonce}">
  /* メニューから別のページへ移るときの切り替え（本体の Base.astro と同じ。style.css の @view-transition） */
  (function () {
    var KEY = 'tcta-mn-vt';
    var has = function () { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
    window.addEventListener('pageswap', function (e) { if (e.viewTransition && !has()) e.viewTransition.skipTransition(); });
    window.addEventListener('pagereveal', function (e) {
      if (!e.viewTransition) return;
      if (has()) { try { sessionStorage.removeItem(KEY); } catch (x) {} if (e.viewTransition.types) e.viewTransition.types.add('menu'); }
      else e.viewTransition.skipTransition();
    });
  })();
</script>
</head>
<body class="${o.admin ? 'is-admin' : ''}">
<a class="skip-link" href="#main">本文へスキップ</a>

<header class="site-header">
  <div class="container site-header__inner">
    <a class="site-header__logo" href="${homeHref}" aria-label="${env.APP_NAME} ホーム">
      ${brand(env, false)}
      ${o.admin || isDemo(env) ? html`<span class="site-header__tag">${o.admin ? '事務局' : ''}${isDemo(env) ? html`<em>DEMO</em>` : ''}</span>` : ''}
    </a>
    <nav class="nav ${o.admin ? 'nav--admin' : ''}" aria-label="グローバルナビゲーション">
      ${items.map((it) => html`<a class="nav__link ${it.en ? 'nav__link--en' : ''} ${isActive(it) ? 'is-active' : ''}" href="${it.href}" ${it.external ? raw('target="_blank" rel="noopener"') : ''}>${it.label}</a>`)}
    </nav>
    ${contact}
    <button class="hamburger" type="button" aria-expanded="false" aria-controls="mobile-nav">
      <span></span><span></span><span></span>
      <span class="visually-hidden">メニューを開く</span>
    </button>
  </div>
</header>

${dev ? html`<div class="demo-bar" role="region" aria-label="デモ環境の案内"><div class="container demo-bar__inner"><span class="demo-bar__label">${isDemo(env) ? 'DEMO' : 'DEV'}</span><span>架空のデータで動く確認用のサンプルです。実際のメールは送らず、ログインリンクは画面と <a href="/dev/mailbox">送信箱</a> に出ます。<a href="/dev">はじめに読む</a>／事務局は <a href="/admin/login">管理者を選んでログイン</a>${o.admin ? html`（${o.admin.name}・${ROLE_LABEL[o.admin.role]}）` : ''}</span></div></div>` : ''}

<div class="mobile-nav" id="mobile-nav" aria-hidden="true">
  <nav aria-label="モバイルナビゲーション" style="--n:${items.length + 1}">
    <span class="mobile-nav__band" aria-hidden="true"></span>
    ${items.map((it, i) => html`<a class="mobile-nav__link mobile-nav__item ${isActive(it) ? 'is-active' : ''}" href="${it.href}" style="--i:${i}" ${it.external ? raw('target="_blank" rel="noopener"') : ''}>${it.label} <span class="ar">→</span></a>`)}
    ${mobileBtn}
  </nav>
</div>

<main id="main">
  <section class="page-head">
    <span class="ghost" aria-hidden="true">${en}</span>
    <div class="container">
      <nav class="breadcrumb" aria-label="パンくず">
        <a href="${homeHref}">${o.admin ? '事務局' : '会員ポータル'}</a><span class="breadcrumb__sep" aria-hidden="true">›</span><span aria-current="page">${o.title}</span>
      </nav>
      <div class="page-title-row fu">
        <span class="sec-head__mark" aria-hidden="true"></span>
        <div>
          <p class="page-title__en">${en}</p>
          <h1 class="page-title">${o.title}</h1>
        </div>
      </div>
      ${o.lead ? html`<p class="page-lead fu" style="animation-delay:.15s">${o.lead}</p>` : ''}
    </div>
  </section>

  <section class="section section--portal">
    <div class="container">
      ${subTabs}
      ${f ? html`<div class="flash flash--${f.kind} fu" role="status">${f.msg}</div>` : ''}
      <div class="portal-body ${o.wide ? 'portal-body--wide' : ''}">
        ${o.body}
      </div>
    </div>
  </section>

  ${!o.admin ? cta(o.member ?? null) : ''}
</main>

${footer(c, siteUrl, o.admin ?? null)}

<script src="/members.js" defer></script>
<script src="/assets/js/main.js" defer></script>
</body>
</html>`;
}

function memberItems(m: Member | null, siteUrl: string): NavItem[] {
  const items: NavItem[] = [{ href: '/', label: 'HOME', en: true }, { href: '/tournaments', label: '大会情報' }];
  if (m) {
    items.push({ href: '/me', label: 'マイページ' });
    if (m.club_manager) items.push({ href: '/club', label: 'クラブ管理' });
  } else {
    items.push({ href: '/login', label: '会員登録' });
  }
  items.push({ href: '/security', label: 'セキュリティ' });
  items.push({ href: '/admin', label: '事務局' });
  items.push({ href: siteUrl, label: '協会サイト', external: true });
  return items;
}

/* 管理者メニュー。項目が多いので 5 つのまとまり（ホーム・会員・受付・大会・設定）にし、
   まとまりの中の画面はページ上部のタブで切り替える。ロールごとに見せる画面だけを入れる。 */
interface AdminGroup { label: string; en?: boolean; tabs: { href: string; label: string }[] }

function adminGroups(a: Admin): AdminGroup[] {
  if (a.role === 'shop') return [{ label: '代行入力', tabs: [{ href: '/shop', label: '代行入力' }, { href: '/shop/today', label: '本日の入力' }] }];
  const g: AdminGroup[] = [{ label: 'HOME', en: true, tabs: [{ href: '/admin', label: 'ダッシュボード' }] }];
  const isAssoc = a.role === 'assoc_admin';
  if (a.role !== 'sysadmin') g.push({ label: '会員', tabs: [
    { href: '/admin/members', label: '会員一覧' },
    ...(isAssoc ? [{ href: '/admin/deletions', label: '削除依頼' }, { href: '/admin/merges', label: '名寄せ' }, { href: '/admin/import', label: '名簿の取込み' }] : []),
  ] });
  if (isAssoc || a.role === 'tournament') g.push({ label: '受付', tabs: [
    ...(isAssoc ? [{ href: '/admin/registrations', label: '年度登録の承認' }] : []),
    { href: '/admin/payments', label: '入金の確認（消込）' },
  ] });
  g.push({ label: '大会', tabs: [{ href: '/admin/tournaments', label: '大会一覧' }, ...(isAssoc || a.role === 'sysadmin' ? [{ href: '/admin/tournaments/new', label: '大会を作る' }] : [])] });
  if (isAssoc || a.role === 'sysadmin') g.push({ label: '設定', tabs: [
    { href: '/admin/audit', label: '監査ログ' },
    { href: '/admin/associations', label: '協会の設定' },
    ...(a.role === 'sysadmin' ? [{ href: '/admin/admins', label: '管理者' }] : []),
  ] });
  return g;
}

/** いま開いている画面がどのまとまりのどのタブか（長く一致するものを優先） */
function activeTab(groups: AdminGroup[], path: string): { group: AdminGroup | null; href: string | null } {
  let best: { group: AdminGroup; href: string } | null = null;
  for (const group of groups) for (const t of group.tabs) {
    const hit = t.href === '/admin' ? path === '/admin' || path === '/admin/' : path === t.href || path.startsWith(t.href + '/');
    if (hit && (!best || t.href.length > best.href.length)) best = { group, href: t.href };
  }
  return best ?? { group: null, href: null };
}

function adminItems(a: Admin): NavItem[] {
  const items: NavItem[] = adminGroups(a).map((g) => ({ href: g.tabs[0].href, label: g.label, en: g.en }));
  items.push({ href: '/', label: '会員ポータル' });
  return items;
}

/* 本体サイトの入会誘導（Cta.astro）と同じ作り。ポータルでは「会員登録 → 大会エントリー」へ誘導する */
function cta(m: Member | null) {
  const HEAD = m ? 'さあ、次の大会へ。' : '1回の登録で、どの協会のどの大会へも。';
  return html`
  <section class="cta" aria-labelledby="cta-title">
    <div class="cta__media">
      <img src="/img/cta.webp" alt="上から見たテニスコートと赤いボールのイラスト" width="1600" height="1068" loading="lazy" decoding="async">
    </div>
    <div class="cta__body">
      <div class="cta__inner rv">
        <div class="cta__head">
          <span class="sec-head__mark" aria-hidden="true"></span>
          <h2 class="cta__title" id="cta-title">
            <span class="visually-hidden">${HEAD}</span>
            <span class="ink-sweep" aria-hidden="true">${HEAD}</span>
          </h2>
        </div>
        ${m
          ? html`<p class="cta__text">年度登録が承認されていれば、受付中の大会にそのままエントリーできます。ペアは会員番号か氏名で選ぶだけ。参加費の入金が確認でき次第、エントリーは確定します。</p>
                 <a class="btn btn--primary" href="/tournaments">受付中の大会を見る <span class="aw">→</span></a>`
          : html`<p class="cta__text">メールアドレスだけで登録できます。パスワードはいりません。</p>
                 <p class="cta__text">氏名・ふりがな・所属・連絡先を 1 回入力すれば、県協会・鳥取市・倉吉市・米子市のどの大会にもログインしてエントリーできます。</p>
                 <p class="cta__close">登録は一度だけ。あとは大会を選ぶだけです。</p>
                 <a class="btn btn--primary" href="/login">メールアドレスで登録する <span class="aw">→</span></a>`}
      </div>
    </div>
  </section>`;
}

/* 本体サイトのフッター（SiteFooter.astro）と同じ作り。四角の位置・大きさ・速さは本体と同じ決め打ち */
const FOOTER_DOTS = [
  '--x:63.0%;--y:23.6%;--s:185px;--c:#202020;--d:9.2s;--delay:-4.8s;--dx:6px;--dy:10px;--depth:1.68;--r:-1.3deg',
  '--x:66.9%;--y:77.9%;--s:53px;--c:#171717;--d:9.9s;--delay:-1.9s;--dx:8px;--dy:10px;--depth:0.31;--r:-0.4deg',
  '--x:11.2%;--y:82.4%;--s:166px;--c:#202020;--d:8.2s;--delay:-0.6s;--dx:2px;--dy:-6px;--depth:1.48;--r:0.7deg',
  '--x:73.1%;--y:49.5%;--s:150px;--c:#171717;--d:10.0s;--delay:-5.5s;--dx:-4px;--dy:0px;--depth:1.32;--r:-1.4deg',
  '--x:78.7%;--y:16.5%;--s:126px;--c:#232323;--d:9.8s;--delay:-5.6s;--dx:-1px;--dy:14px;--depth:1.07;--r:-2.3deg',
  '--x:28.7%;--y:0.6%;--s:122px;--c:#121212;--d:10.9s;--delay:-0.7s;--dx:14px;--dy:8px;--depth:1.03;--r:-0.4deg',
  '--x:74.9%;--y:91.8%;--s:42px;--c:#232323;--d:10.6s;--delay:-6.2s;--dx:-5px;--dy:-5px;--depth:0.20;--r:0.7deg',
  '--x:56.1%;--y:25.7%;--s:40px;--c:#202020;--d:7.0s;--delay:-11.6s;--dx:1px;--dy:2px;--depth:0.18;--r:-0.8deg',
  '--x:34.2%;--y:29.2%;--s:187px;--c:#171717;--d:10.3s;--delay:-7.1s;--dx:-18px;--dy:-19px;--depth:1.70;--r:-2.5deg',
  '--x:12.6%;--y:61.5%;--s:136px;--c:#232323;--d:9.3s;--delay:-5.7s;--dx:-11px;--dy:8px;--depth:1.17;--r:-0.2deg',
  '--x:45.6%;--y:97.7%;--s:49px;--c:#0E0E0E;--d:8.0s;--delay:-5.8s;--dx:0px;--dy:7px;--depth:0.27;--r:2.4deg',
  '--x:66.4%;--y:3.2%;--s:79px;--c:#1E1414;--d:7.4s;--delay:-8.5s;--dx:10px;--dy:-7px;--depth:0.58;--r:1.4deg',
  '--x:74.8%;--y:47.0%;--s:137px;--c:#232323;--d:7.1s;--delay:-7.8s;--dx:-10px;--dy:14px;--depth:1.18;--r:1.1deg',
  '--x:69.5%;--y:39.3%;--s:177px;--c:#1E1414;--d:8.2s;--delay:-5.2s;--dx:3px;--dy:9px;--depth:1.60;--r:0.4deg',
  '--x:85.4%;--y:30.4%;--s:181px;--c:#232323;--d:8.8s;--delay:-3.1s;--dx:-1px;--dy:19px;--depth:1.64;--r:-2.9deg',
  '--x:92.1%;--y:34.4%;--s:146px;--c:#101010;--d:9.8s;--delay:-3.3s;--dx:8px;--dy:-0px;--depth:1.28;--r:1.6deg',
  '--x:40.3%;--y:26.0%;--s:160px;--c:#171717;--d:9.6s;--delay:-7.0s;--dx:16px;--dy:-5px;--depth:1.42;--r:-2.3deg',
  '--x:4.6%;--y:35.1%;--s:43px;--c:#121212;--d:9.4s;--delay:-10.8s;--dx:-6px;--dy:9px;--depth:0.21;--r:-2.3deg',
  '--x:5.4%;--y:35.8%;--s:149px;--c:#101010;--d:6.9s;--delay:-1.5s;--dx:11px;--dy:2px;--depth:1.31;--r:-3.8deg',
  '--x:87.6%;--y:31.2%;--s:92px;--c:#232323;--d:8.4s;--delay:-3.3s;--dx:3px;--dy:-0px;--depth:0.72;--r:1.9deg',
  '--x:77.3%;--y:85.7%;--s:119px;--c:#121212;--d:7.7s;--delay:-1.8s;--dx:-2px;--dy:-2px;--depth:1.00;--r:-3.2deg',
  '--x:59.8%;--y:45.7%;--s:86px;--c:#202020;--d:11.0s;--delay:-5.4s;--dx:10px;--dy:9px;--depth:0.66;--r:1.6deg',
  '--x:91.7%;--y:82.7%;--s:77px;--c:#0E0E0E;--d:6.7s;--delay:-5.9s;--dx:-8px;--dy:-4px;--depth:0.56;--r:-2.3deg',
  '--x:67.6%;--y:54.5%;--s:80px;--c:#101010;--d:7.8s;--delay:-4.7s;--dx:11px;--dy:-11px;--depth:0.59;--r:-1.2deg',
  '--x:41.2%;--y:58.6%;--s:155px;--c:#171717;--d:8.8s;--delay:-6.2s;--dx:-13px;--dy:5px;--depth:1.37;--r:-1.5deg',
  '--x:20.5%;--y:26.3%;--s:85px;--c:#232323;--d:10.1s;--delay:-7.8s;--dx:1px;--dy:7px;--depth:0.65;--r:-0.0deg',
];

/* 文字のロゴ。協会のロゴ画像は使わず、参加するどの協会にも通用する共通ブランドにする（赤い四角＋英字＋日本語） */
function brand(env: Env, white: boolean) {
  // ポータルのロゴ画像（public/img/）。黒いフッターでは文字を白にした版を使う
  const en = env.APP_BRAND_EN || 'TENNIS MEMBERS';
  return html`<img class="brand-logo ${white ? 'brand-logo--white' : ''}" src="${white ? '/img/logo-white.png' : '/img/logo.png'}" alt="${en} ${env.APP_NAME.replace(/（デモ）$/, '')}" width="900" height="215">`;
}

async function footer(c: Ctx, siteUrl: string, admin: Admin | null) {
  const env = c.env;
  // 参加している協会を並べる（共同利用の主体が分かるように）
  const assocs = await all<{ name: string }>(env.DB, "SELECT name FROM associations ORDER BY sort_order, code").catch(() => [] as { name: string }[]);
  return html`
<footer class="site-footer">
  <div class="footer-deco" aria-hidden="true">${FOOTER_DOTS.map((s) => html`<span class="footer-dot" style="${s}"></span>`)}</div>
  <div class="container site-footer__grid">
    <div class="site-footer__brand">
      ${brand(env, true)}
      <p class="site-footer__note">会員登録・大会エントリー一元管理システム${assocs.length ? html`<br>参加協会: ${assocs.map((a) => a.name).join('・')}` : ''}</p>
    </div>
    <div><a class="fw fw--head" href="/">会員ポータル</a></div>
    <div>
      <a class="fw fw--head" href="/tournaments">大会情報</a>
      <a class="fw fw--head" href="/me">マイページ</a>
      <a class="fw fw--head" href="/registrations/new">年度登録</a>
      <a class="fw fw--head" href="/security">セキュリティ</a>
    </div>
    <div>
      <a class="fw fw--head fw--head-tight" href="${admin ? '/admin' : '/admin/login'}">事務局</a>
      <a class="fw fw--sub" href="/admin/tournaments">大会の管理</a>
      <a class="fw fw--sub" href="/shop">ショップ代行入力</a>
    </div>
    <div>
      <a class="fw fw--head fw--head-tight" href="${siteUrl}" target="_blank" rel="noopener">協会サイト</a>
      <a class="fw fw--sub" href="${siteUrl}tournaments.html" target="_blank" rel="noopener">大会情報</a>
      <a class="fw fw--sub" href="${siteUrl}membership.html" target="_blank" rel="noopener">入会案内</a>
    </div>
  </div>
  <div class="container site-footer__bottom">
    <div class="site-footer__utils">
      <a class="fw" href="/security">セキュリティと個人情報の取扱い</a>
      <a class="fw" href="/privacy">共同利用規程・プライバシーポリシー（案）</a>
    </div>
    <span class="site-footer__copy">© ${env.APP_BRAND_EN || "Tennis Members"} — ${assocs.length ? "参加協会の共同利用システム" : "テニス協会 共同利用システム"}</span>
  </div>
</footer>`;
}

/* 状態のバッジ。本体の .badge の規則（受付中＝赤、終了＝グレー、待ち＝赤の淡い地）に合わせる */
const BADGE_KIND: Record<string, string> = {
  open: 'open', approved: 'outline', confirmed: 'outline', paid: 'outline', active: 'outline',
  pending: 'tint', pending_payment: 'tint', provisional: 'tint', draft: 'outline',
  rejected: 'muted', cancelled: 'muted', withdrawn: 'muted', closed: 'muted', refunded: 'muted',
};
export const badge = (status: string) => html`<span class="badge badge--${BADGE_KIND[status] ?? 'outline'}">${STATUS_LABEL[status] ?? status}</span>`;
export const esc = (s: unknown) => html`${s == null ? '' : String(s)}`;
export { html, raw };
