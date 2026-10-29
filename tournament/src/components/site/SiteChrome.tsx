// 協会サイトと同じ見た目の「枠」の部品（運営画面と観戦ページで共用）。
// マークアップはサイトの SiteHeader.astro / MobileNav.astro / 下層ページの .page-head / SiteFooter.astro と同じ。
// CSS は src/styles/site.css。
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import DecoSquares from './DecoSquares';

/** 協会サイト（開発中の Cloudflare 版）。VITE_SITE_URL で差し替えられる */
export const SITE_URL: string = (
  ((import.meta.env.VITE_SITE_URL as string | undefined) || '').trim() ||
  'https://tcta-site.tcta-admin-worker.workers.dev/'
).replace(/\/?$/, '/');

const BASE = import.meta.env.BASE_URL;
export const LOGO = `${BASE}site/logo-cut.png`;
export const LOGO_WHITE_CUT = `${BASE}site/logo-cut-white.png`;
export const LOGO_WHITE = `${BASE}site/logo-white.png`;

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
}

// ---------------------------------------------------------------------------
// ヘッダー
// ---------------------------------------------------------------------------

export function SiteHeader({
  homeTo, tag, tagEm, items, contact, aux, menuOpen, onToggleMenu, hideMenu = false,
}: {
  homeTo: string;
  /** ロゴの横の札（「大会運営」「観戦」など） */
  tag: string;
  /** 札の中の小さな英字 */
  tagEm?: string;
  items: NavLinkItem[];
  /** 右上の赤いブロック */
  contact?: { label: string; to?: string; href?: string };
  /** ハンバーガーの手前に置く小さな表示（同期の状態など） */
  aux?: ReactNode;
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** メニューを出さない（ログインの案内など） */
  hideMenu?: boolean;
}) {
  return (
    <header className={`site-header ${menuOpen ? 'is-menu' : ''}`}>
      <div className="site-container site-header__inner">
        <Link className="site-header__logo" to={homeTo} aria-label={`${tag} ホーム`}>
          <span className="site-header__logo-mark">
            <img src={LOGO} alt="鳥取市テニス協会 TOTTORI-CITY TENNIS ASSOCIATION" width={679} height={217} />
            <img className="site-header__logo-w" src={LOGO_WHITE_CUT} alt="" width={679} height={217} />
          </span>
          <span className="site-header__tag">{tag}{tagEm && <em>{tagEm}</em>}</span>
        </Link>
        <nav className="nav" aria-label="グローバルナビゲーション">
          {items.map((it) => it.href ? (
            <a key={it.key} className={`nav__link ${it.en ? 'nav__link--en' : ''}`} href={it.href} target="_blank" rel="noopener noreferrer">{it.label}</a>
          ) : (
            <Link key={it.key} className={`nav__link ${it.en ? 'nav__link--en' : ''} ${it.active ? 'is-active' : ''}`} to={it.to ?? '/'} aria-current={it.active ? 'page' : undefined}>{it.label}</Link>
          ))}
        </nav>
        {aux && <div className="header-aux">{aux}</div>}
        {contact && (contact.href
          ? <a className="header-contact" href={contact.href} target="_blank" rel="noopener noreferrer">{contact.label}</a>
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
// スマホのメニュー（黒地。下からせり上がり、行が下線の下から順に出る）
// ---------------------------------------------------------------------------

export function MobileNav({
  open, groups, foot, onClose,
}: {
  open: boolean;
  /** 見出し（英字）ごとのまとまり。見出しが無ければ行だけ並べる */
  groups: { label?: string; items: NavLinkItem[] }[];
  /** 下端に寄せるもの（協会サイト・バージョンなど） */
  foot?: ReactNode;
  onClose: () => void;
}) {
  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  let i = 0;
  return (
    <div className={`mobile-nav ${open ? 'is-open' : ''}`} id="mobile-nav" aria-hidden={!open}>
      <DecoSquares className="mobile-nav__deco" />
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label && <p className="mobile-nav__group" style={{ '--i': i++ } as React.CSSProperties}><span>{g.label}</span></p>}
          <nav className="mobile-nav__grid" aria-label={g.label ?? 'モバイルナビゲーション'}>
            {g.items.map((it) => {
              const style = { '--i': i++ } as React.CSSProperties;
              const inner = <span className="mobile-nav__tx"><span>{it.label}</span></span>;
              return it.href ? (
                <a key={it.key} className="mobile-nav__link" href={it.href} target="_blank" rel="noopener noreferrer" style={style} tabIndex={open ? 0 : -1} onClick={onClose}>{inner}</a>
              ) : (
                <Link key={it.key} className={`mobile-nav__link ${it.active ? 'is-active' : ''}`} to={it.to ?? '/'} style={style} tabIndex={open ? 0 : -1} onClick={onClose}>{inner}</Link>
              );
            })}
          </nav>
        </div>
      ))}
      <div className="mobile-nav__foot" style={{ '--i': i } as React.CSSProperties}>
        {foot}
        <p className="mobile-nav__copy" style={{ '--i': i + 1 } as React.CSSProperties}><span>© Tottori-City Tennis Association All Rights Reserved.</span></p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ページ見出し（灰色の帯・パンくず・■ 英字／日本語・背景の大きな英字）
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
    <section className="page-head page-head--app">
      <span className="ghost" aria-hidden="true">{ghost ?? en}</span>
      <div className="site-container site-container--wide">
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
        {lead && <div className="page-lead fu" style={{ animationDelay: '.15s' }}>{lead}</div>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// タブ（同じまとまりの画面を並べる。サイトの .tabs）
// ---------------------------------------------------------------------------

export function AppTabs({ items, label }: { items: NavLinkItem[]; label: string }) {
  if (items.length < 2) return null;
  return (
    <div className="app-tabs">
      <nav className="site-container site-container--wide tabs" aria-label={label}>
        {items.map((it) => (
          <Link key={it.key} className={`tab ${it.active ? 'is-active' : ''}`} to={it.to ?? '/'} aria-current={it.active ? 'page' : undefined}>
            {it.icon && <it.icon />}
            {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 大会の状態の帯（大会名・進捗・コート・時間超過を流す）
// ---------------------------------------------------------------------------

export function StatusBar({ label, live, lead, items }: { label: string; live?: boolean; lead: string; items: string[] }) {
  return (
    <div className="status-bar" role="region" aria-label="大会の状況">
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
  );
}

// ---------------------------------------------------------------------------
// フッター（黒地に漂う四角）
// ---------------------------------------------------------------------------

export function SiteFooter({ note, columns, utils }: { note?: ReactNode; columns: ReactNode; utils?: ReactNode }) {
  return (
    <footer className="site-footer">
      <DecoSquares />
      <div className="site-container site-footer__grid">
        <div className="site-footer__brand">
          <img src={LOGO_WHITE} alt="鳥取市テニス協会 TOTTORI-CITY TENNIS ASSOCIATION" width={648} height={240} />
          {note && <p className="site-footer__note">{note}</p>}
        </div>
        {columns}
      </div>
      <div className="site-container site-footer__bottom">
        <div className="site-footer__utils">{utils}</div>
        <span className="site-footer__copy">© Tottori-City Tennis Association All Rights Reserved.</span>
      </div>
    </footer>
  );
}
