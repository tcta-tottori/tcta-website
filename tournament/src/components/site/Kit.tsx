// サイトの部品（運営画面で共通に使う）。見た目は styles/app.css の「サイトの部品」（.sk-*）。
//   <SkPage>      画面の中身の枠
//   <SkSection>   区画（赤い四角＋英字＋見出し＋右に操作。collapsible で開閉）
//   <SkEmpty>     何も無いとき
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function SkPage({ children, className = '', wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={`container sk-page ${wide ? 'sk-page--wide' : ''} ${className}`}>{children}</div>;
}

export function SkSection({ en, title, lead, actions, children, className = '', accent = false, flush = false, collapsible = false, defaultOpen = true, count }: {
  en?: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string;
  accent?: boolean; flush?: boolean; collapsible?: boolean; defaultOpen?: boolean; count?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const body = children != null && <div className={`sk-sec__body ${flush ? 'sk-sec__body--flush' : ''}`}>{children}</div>;
  return (
    <section className={`sk-sec ${accent ? 'sk-sec--accent' : ''} ${className}`}>
      <div className="sk-sec__head">
        <span className="sk-sec__mark" aria-hidden="true" />
        <div className="sk-sec__titles">
          {en && <p className="sk-sec__en">{en}</p>}
          <h2 className="sk-sec__title">{title}{count != null && <small>{count}</small>}</h2>
          {lead && <p className="sk-sec__lead">{lead}</p>}
        </div>
        {actions && <div className="sk-sec__actions">{actions}</div>}
        {collapsible && (
          <button className="sk-sec__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label={open ? '閉じる' : '開く'}>
            <ChevronDown className="w-5 h-5" />
          </button>
        )}
      </div>
      {collapsible ? <div className={`sk-collapse ${open ? 'is-open' : ''}`}><div>{body}</div></div> : body}
    </section>
  );
}

export function SkEmpty({ icon: Icon, title, text, children }: { icon?: React.ComponentType<{ className?: string }>; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sk-empty">
      {Icon && <Icon className="sk-empty__ico" />}
      <p className="sk-empty__title">{title}</p>
      {text && <p className="sk-empty__text">{text}</p>}
      {children}
    </div>
  );
}
