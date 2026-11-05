// 協会サイトの決まりのポップアップ（確認・お知らせ・読み込み中など）。
//   ・墨の薄い幕の上に白いパネル。上端に赤い線、見出しの左に赤い四角（サイトの見出しと同じ印）、角は 4px
//   ・出るときはサイトの「下から少し浮き上がって出る」動き（.fu と同じ）
//   ・ボタンはサイトの .btn（主の操作は赤、取り消しは白）
// window.confirm / window.alert の代わりは siteConfirm.tsx の siteConfirm() / siteAlert()（同じ見た目のポップアップを出し、結果を Promise で返す）。
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

export interface SiteDialogProps {
  open: boolean;
  title: string;
  /** 見出しの上の赤い英字（例 CONFIRM） */
  eyebrow?: string;
  /** 危ない操作（消す・入れ直す）。見出しに注意の印、主のボタンの文言で知らせる */
  danger?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
  /** 幕を押す・Esc で閉じる。無ければ閉じない（読み込み中など） */
  onClose?: () => void;
  size?: 'sm' | 'md' | 'lg';
  /** 閉じる（×）のボタンを出す */
  closable?: boolean;
}

export default function SiteDialog({ open, title, eyebrow, danger, children, actions, onClose, size = 'sm', closable = false }: SiteDialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // 主のボタン（最後のボタン）か、パネルにフォーカス
    const t = setTimeout(() => {
      const btns = panel.current?.querySelectorAll<HTMLElement>('.sdlg__actions button');
      (btns && btns.length ? btns[btns.length - 1] : panel.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sdlg" role="dialog" aria-modal="true" aria-labelledby="sdlg-title">
      <div className="sdlg__backdrop" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className={`sdlg__panel sdlg__panel--${size} ${danger ? 'sdlg__panel--danger' : ''}`}>
        <div className="sdlg__head">
          <span className="sec-head__mark sdlg__mark" aria-hidden="true" />
          <div className="sdlg__heading">
            {eyebrow && <p className="sdlg__eyebrow">{eyebrow}</p>}
            <h3 className="sdlg__title" id="sdlg-title">{danger && <AlertTriangle className="sdlg__warn" aria-hidden="true" />}{title}</h3>
          </div>
          {closable && onClose && (
            <button className="sdlg__close" onClick={onClose} aria-label="閉じる"><X className="w-5 h-5" /></button>
          )}
        </div>
        {children && <div className="sdlg__body">{children}</div>}
        {actions && <div className="sdlg__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
