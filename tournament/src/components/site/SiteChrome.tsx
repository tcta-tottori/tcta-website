// 協会サイトと同じ「枠」の部品（運営画面・観戦ページ・ログインの案内で共用）。
// マークアップは協会サイトの次の部品と同じにしてある（CSS もサイトの style.css をそのまま使う。scripts/sync-site.mjs）:
//   SiteHeader.astro / MobileNav.astro / LiteToggle.astro / SnsLinks.astro / SiteFooter.astro / 下層ページの .page-head
// サイト側のマークアップを変えたら、ここも同じに直すこと。
// 大会運営システムだけのもの（ロゴ横の札・同期の札・状態の帯・タブの帯）の見た目は src/styles/app.css。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import DecoSquares from './DecoSquares';

/** 協会サイト。VITE_SITE_URL で差し替えられる */
export const SITE_URL: string = (
  ((import.meta.env.VITE_SITE_URL as string | undefined) || '').trim() ||
  'https://tottori-city-tennis.com/'
).replace(/\/?$/, '/');

const BASE = import.meta.env.BASE_URL;
export const LOGO = `${BASE}site/logo-cut.png`;
export const LOGO_WHITE = `${BASE}site/logo-cut-white.png`;
/** 大会運営システムのロゴ（鳥取市テニス協会／大会運営｜SYSTEM） */
export const SYSTEM_LOGO = { src: `${BASE}logo-system.png`, white: `${BASE}logo-system-white.png`, width: 957, height: 240, alt: '鳥取市テニス協会 大会運営 SYSTEM' };

export interface NavLinkItem {
  key: string;
  label: string;
  /** アプリ内の移動先 */
  to?: string;
  /** 外部リンク（別タブで開く） */
  href?: string;
  active?: boolean;
  /** 英字の項目（HOME など）はサイトと同じく英字の書体にする */
  en?: boolean;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  onClick?: () => void;
  /** スマホのメニューで、まとまりの中の画面（まとまりの名前の下に小さく並べ、押すとその画面へ） */
  children?: NavLinkItem[];
  /** まとまりの英字（スマホのメニューで名前の上に小さく出す） */
  eyebrow?: string;
}

// ---------------------------------------------------------------------------
// ヘッダー（SiteHeader.astro）
// ---------------------------------------------------------------------------

export function SiteHeader({
  homeTo, tag, tagEm, items, contact, aux, menuOpen, onToggleMenu, hideMenu = false, scrolled = false, logo,
}: {
  /** ロゴを差し替える（大会運営システムのロゴなど） */
  logo?: { src: string; white: string; width: number; height: number; alt: string };
  homeTo: string;
  /** ロゴの横の札（「大会運営」「観戦」など。協会サイトには無い、このシステムの印） */
  tag?: string;
  tagEm?: string;
  items: NavLinkItem[];
  /** 右上の赤いブロック（サイトの「お問い合わせ」の位置） */
  contact?: { label: string; to?: string; href?: string; external?: boolean };
  /** ハンバーガーの手前に置く小さな表示（同期の状態など） */
  aux?: ReactNode;
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** メニューを出さない（ログインの案内など） */
  hideMenu?: boolean;
  /** 本文が少し下がったら影を付ける（サイトの .hsh） */
  scrolled?: boolean;
}) {
  return (
    <header className={`site-header ${menuOpen ? 'is-menu' : ''} ${scrolled ? 'hsh' : ''}`}>
      <div className="container site-header__inner">
        <Link className={`site-header__logo ${logo ? 'site-header__logo--system' : ''}`} to={homeTo} aria-label={logo ? logo.alt : `鳥取市テニス協会 ${tag ?? ''}`}>
          <img className="site-header__logo-img" src={logo?.src ?? LOGO} alt={logo?.alt ?? '鳥取市テニス協会 TOTTORI-CITY TENNIS ASSOCIATION'} width={logo?.width ?? 679} height={logo?.height ?? 217} />
          <img className="site-header__logo-w" src={logo?.white ?? LOGO_WHITE} alt="" width={logo?.width ?? 679} height={logo?.height ?? 217} />
        </Link>
        {tag && <span className="app-tag" aria-hidden="true">{tag}{tagEm && <em>{tagEm}</em>}</span>}
        <nav className="nav" aria-label="グローバルナビゲーション">
          {items.map((it) => it.href ? (
            <a key={it.key} className={`nav__link ${it.en ? 'nav__link--en' : ''}`} href={it.href} target="_blank" rel="noopener noreferrer">{it.label}</a>
          ) : (
            <Link key={it.key} className={`nav__link ${it.en ? 'nav__link--en' : ''} ${it.active ? 'is-active' : ''}`} to={it.to ?? '/'} aria-current={it.active ? 'page' : undefined}>{it.label}</Link>
          ))}
        </nav>
        {aux && <div className="app-aux">{aux}</div>}
        {contact && (contact.href
          ? <a className="header-contact" href={contact.href} {...(contact.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{contact.label}</a>
          : <Link className="header-contact" to={contact.to ?? '/'}>{contact.label}</Link>)}
        {!hideMenu && (
          <button className="hamburger" type="button" aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={onToggleMenu}>
            <span /><span /><span />
            <span className="visually-hidden">{menuOpen ? 'メニューを閉じる' : 'メニューを開く'}</span>
          </button>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// スマホのメニュー（MobileNav.astro。黒地が下からせり上がり、行が下線の下から順に出る）
// ---------------------------------------------------------------------------

export function MobileNav({ open, items, onClose }: { open: boolean; items: NavLinkItem[]; onClose: () => void }) {
  // サイトの main.js と同じく、開くときに上の余白をヘッダーの下端にそろえる
  const [padTop, setPadTop] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    const hd = document.querySelector('.site-header');
    if (hd) setPadTop(hd.getBoundingClientRect().bottom);
    document.body.classList.add('is-locked');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('is-locked'); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  return (
    <div className={`mobile-nav ${open ? 'is-open' : ''}`} id="mobile-nav" aria-hidden={!open} style={padTop ? { paddingTop: padTop } : undefined}>
      <DecoSquares className="mobile-nav__deco" />
      <nav className="mobile-nav__grid" aria-label="モバイルナビゲーション">
        {items.map((it, i) => {
          const style = { '--i': i } as React.CSSProperties;
          const inner = <span className="mobile-nav__tx"><span>{it.eyebrow && <small className="mobile-nav__en">{it.eyebrow}</small>}{it.label}</span></span>;
          const cls = `mobile-nav__link ${it.active ? 'is-active' : ''} ${it.children ? 'mobile-nav__link--group' : ''}`;
          const tab = open ? 0 : -1;
          if (it.children) {
            return (
              <div key={it.key} className={`mobile-nav__group ${it.active ? 'is-active' : ''}`} style={style}>
                <Link className={cls} to={it.to ?? '/'} tabIndex={tab} onClick={onClose}>{inner}</Link>
                {it.children.length > 1 && (
                  <div className="mobile-nav__subs">
                    {it.children.map((c) => (
                      <Link key={c.key} className={`mobile-nav__sub ${c.active ? 'is-active' : ''}`} to={c.to ?? '/'} tabIndex={tab} onClick={onClose}>{c.label}</Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          if (it.onClick) return <button key={it.key} type="button" className={`${cls} mobile-nav__link--sm`} style={style} tabIndex={tab} onClick={() => { onClose(); it.onClick!(); }}>{inner}</button>;
          if (it.href) return <a key={it.key} className={`${cls} mobile-nav__link--sm`} href={it.href} target="_blank" rel="noopener noreferrer" style={style} tabIndex={tab} onClick={onClose}>{inner}</a>;
          return <Link key={it.key} className={cls} to={it.to ?? '/'} style={style} tabIndex={tab} onClick={onClose}>{inner}</Link>;
        })}
      </nav>
      {/* 下端に寄せる：軽量モード・SNS・キャッチコピー・著作権の表記（サイトのメニューと同じ） */}
      <div className="mobile-nav__foot">
        <div className="mobile-nav__lite"><LiteToggle dark /></div>
        <div className="mobile-nav__sns" style={{ '--i': items.length } as React.CSSProperties}><SnsLinks /></div>
        <p className="mobile-nav__copy mobile-nav__tagline" style={{ '--i': items.length + 1 } as React.CSSProperties}><span className="tagline">PLAY BEYOND.</span></p>
        <p className="mobile-nav__copy" style={{ '--i': items.length + 2 } as React.CSSProperties}><span>© Tottori-City Tennis Association All Rights Reserved.</span></p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 軽量モード（LiteToggle.astro）。動きを最小限にする。端末に覚える（サイトと同じ tcta-lite）
// ---------------------------------------------------------------------------

export function LiteToggle({ dark = false }: { dark?: boolean }) {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('is-lite'));
  const toggle = () => {
    const next = !on;
    setOn(next);
    document.documentElement.classList.toggle('is-lite', next);
    try { localStorage.setItem('tcta-lite', next ? '1' : '0'); } catch { /* 保存できない環境 */ }
  };
  return (
    <button className={`lite-toggle ${dark ? 'lite-toggle--dark' : ''} ${on ? 'is-on' : ''}`} type="button" aria-pressed={on} onClick={toggle}>
      <span className="lite-toggle__label">軽量モード</span>
      <span className="lite-toggle__sw" aria-hidden="true"><span className="lite-toggle__knob" /></span>
      <span className="lite-toggle__state">{on ? 'ON' : 'OFF'}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 協会の SNS（SnsLinks.astro。アイコンは Icon.astro と同じ形）
// ---------------------------------------------------------------------------

const SNS = [
  { key: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/@%E9%B3%A5%E5%8F%96%E5%B8%82%E3%83%86%E3%83%8B%E3%82%B9%E5%8D%94%E4%BC%9A',
    d: 'M12 4.5c3.1 0 6.1.1 7.6.4a2.7 2.7 0 0 1 1.9 1.9c.4 1.5.5 3.4.5 5.2s-.1 3.7-.5 5.2a2.7 2.7 0 0 1-1.9 1.9c-1.5.3-4.5.4-7.6.4s-6.1-.1-7.6-.4a2.7 2.7 0 0 1-1.9-1.9C2.1 15.7 2 13.8 2 12s.1-3.7.5-5.2a2.7 2.7 0 0 1 1.9-1.9c1.5-.3 4.5-.4 7.6-.4ZM10 8.7v6.6l5.6-3.3L10 8.7Z' },
  { key: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/tottori.city.tennis/',
    d: 'M7.6 2.5h8.8a5.1 5.1 0 0 1 5.1 5.1v8.8a5.1 5.1 0 0 1-5.1 5.1H7.6a5.1 5.1 0 0 1-5.1-5.1V7.6a5.1 5.1 0 0 1 5.1-5.1Zm0 2.2a2.9 2.9 0 0 0-2.9 2.9v8.8a2.9 2.9 0 0 0 2.9 2.9h8.8a2.9 2.9 0 0 0 2.9-2.9V7.6a2.9 2.9 0 0 0-2.9-2.9H7.6ZM12 7.3a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4Zm0 2.2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm5.1-3.4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z' },
  { key: 'line', label: 'LINE', url: 'https://lin.ee/1oJQ9mu',
    d: 'M12 2.5C6.2 2.5 1.5 6.3 1.5 11c0 4.2 3.7 7.7 8.8 8.4.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1.1.9.6 1.2-.5 6.3-3.7 8.6-6.4 1.6-1.7 2.4-3.5 2.4-5.4C22.5 6.3 17.8 2.5 12 2.5ZM4.6 8.3h1.4v4.1h2.6v1.3H4.6V8.3Zm4.8 0h1.4v5.4H9.4V8.3Zm2.3 0h1.4l2.2 3.3V8.3h1.3v5.4h-1.3l-2.3-3.4v3.4h-1.3V8.3Zm4.8 0h3.1v1.3h-1.8v.8h1.8v1.2h-1.8v.8h1.8v1.3h-3.1V8.3Z' },
];

export function SnsLinks({ className = '' }: { className?: string }) {
  return (
    <ul className={`sns-list ${className}`} aria-label="協会の SNS">
      {SNS.map((s) => (
        <li key={s.key}><a className="sns-link" href={s.url} target="_blank" rel="me noopener noreferrer">
          <svg className="ico sns-link__ico" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path fillRule="evenodd" d={s.d} /></svg>
          <span className="sns-link__label">{s.label}</span>
        </a></li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// ページ見出し（下層ページの .page-head。灰色の帯・パンくず・■ 英字／日本語・背景の大きな英字）
// ---------------------------------------------------------------------------

export function PageHead({
  crumbs, en, title, lead, ghost,
}: {
  crumbs: { label: string; to?: string; href?: string }[];
  en: string;
  title: string;
  lead?: ReactNode;
  /** 背景の大きな英字（省略すると en） */
  ghost?: string;
}) {
  return (
    <section className="page-head">
      <span className="ghost" aria-hidden="true">{ghost ?? en}</span>
      <div className="container">
        <nav className="breadcrumb" aria-label="パンくず">
          {crumbs.map((c, idx) => (
            <span key={idx} style={{ display: 'contents' }}>
              {idx > 0 && <span className="breadcrumb__sep" aria-hidden="true">›</span>}
              {c.href
                ? <a href={c.href} target="_blank" rel="noopener noreferrer">{c.label}</a>
                : c.to && idx < crumbs.length - 1
                  ? <Link to={c.to}>{c.label}</Link>
                  : <span aria-current={idx === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>}
            </span>
          ))}
        </nav>
        <div className="page-title-row fu">
          <span className="sec-head__mark" aria-hidden="true" />
          <div>
            <p className="page-title__en">{en}</p>
            <h1 className="page-title">{title}</h1>
          </div>
        </div>
        {lead && <div className="page-lead fu app-lead" style={{ animationDelay: '.15s' }}>{lead}</div>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// タブ（同じまとまりの画面を並べる。サイトの .tabs）
// ---------------------------------------------------------------------------

export function AppTabs({ items, label }: { items: NavLinkItem[]; label: string }) {
  const navRef = useRef<HTMLElement>(null);
  const activeKey = items.find((it) => it.active)?.key;
  // 今の画面のタブが端に隠れないよう、横に送って見える位置に出す
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('.tab.is-active');
    if (!nav || !el) return;
    const left = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [activeKey]);
  // タブの高さを main に知らせ、ほかの貼り付く帯（表の見出しなど）をタブの下に並べる
  const wrapRef = useRef<HTMLDivElement>(null);
  const show = items.length >= 2;
  useEffect(() => {
    const el = wrapRef.current;
    const main = el?.closest<HTMLElement>('.app-main');
    if (!el || !main || typeof ResizeObserver === 'undefined') return;
    const set = () => main.style.setProperty('--app-sticky-top', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); main.style.removeProperty('--app-sticky-top'); };
  }, [show]);
  if (!show) return null;
  return (
    <div ref={wrapRef} className="app-tabs">
      <nav ref={navRef} className="container tabs" aria-label={label}>
        {items.map((it) => (
          <Link key={it.key} className={`tab ${it.active ? 'is-active' : ''}`} to={it.to ?? '/'} aria-current={it.active ? 'page' : undefined}>
            {it.icon && <it.icon className="app-tabs__ico" />}
            {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 大会の状態の帯（大会名・進捗・コート・時間超過を流す）。サイトの「重要なお知らせ」の帯（.notice-bar）の位置と作り
// ---------------------------------------------------------------------------

export function StatusBar({ label, live, lead, items, place }: { label: string; live?: boolean; lead: string; items: string[]; place: 'top' | 'main' }) {
  return (
    <div className={`status-bar status-bar--${place}`} role="region" aria-label="大会の状況">
      <div className="container status-bar__inner">
        <span className={`status-bar__label ${live ? 'status-bar__label--live' : ''}`}>{label}</span>
        <div className="status-bar__area">
          <div className="info-ticker">
            <span className="info-ticker-item info-ticker-lead">
              <span>{lead}</span>
              {items.length > 0 && <span className="info-ticker-dot" />}
            </span>
            {items.map((item, i) => {
              const alert = item.startsWith('⚠');
              return (
                <span key={i} className={`info-ticker-item ${alert ? 'info-ticker-alert' : ''}`}>
                  {alert && <AlertTriangle className="w-3 h-3" />}
                  <span>{alert ? item.slice(2) : item}</span>
                  {i < items.length - 1 && <span className="info-ticker-dot" />}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// フッター（SiteFooter.astro。黒地に漂う四角）
// ---------------------------------------------------------------------------

export function SiteFooter({ columns, utils }: { columns: ReactNode; utils?: ReactNode }) {
  return (
    <footer className="site-footer">
      <DecoSquares />
      <div className="container site-footer__grid">
        <div className="site-footer__brand">
          <img className="site-footer__logo" src={LOGO_WHITE} alt="鳥取市テニス協会 TOTTORI-CITY TENNIS ASSOCIATION" width={679} height={217} />
          <SnsLinks className="site-footer__sns" />
        </div>
        {columns}
      </div>
      <div className="container site-footer__bottom">
        <div className="site-footer__utils">{utils}</div>
        <div className="site-footer__end">
          <p className="tagline">PLAY BEYOND.</p>
          <span className="site-footer__copy">© Tottori-City Tennis Association All Rights Reserved.</span>
        </div>
      </div>
    </footer>
  );
}
