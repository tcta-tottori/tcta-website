// =============================================================================
// コート変更ダイアログ（コート番号を選び直すための共通ポップアップ）
//
// 当日は「雨で使えなくなった」「隣のコートが空いたので移した」など、
// いったん決めたコートを直したい場面が必ず出てくる。
// 各メニューから同じ操作でコートを付け替えられるよう、共通化している。
//
// 値は「1」「2」…のコート番号（文字列）でやり取りする。
// 保存形式が "1コート" のような画面では、呼び出し側で変換する。
// =============================================================================

import { MapPin, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface CourtChangeDialogProps {
  /** 見出し */
  title?: string;
  /** 対象の説明（対戦カード名など） */
  subtitle?: string;
  /** 選べるコート数（1〜courtCount） */
  courtCount?: number;
  /** 複数コートを選べるようにする（団体戦は1対戦で複数面を使う） */
  multi?: boolean;
  /** 現在選ばれているコート番号 */
  selected: string[];
  /** 他で使用中のコート番号 → 表示する理由（例: "B戦" "使用中"） */
  busy?: Record<string, string>;
  onConfirm: (courts: string[]) => void;
  /** 割当を空にする（未割当に戻す）。省略時はボタンを出さない */
  onClear?: () => void;
  onClose: () => void;
  /** 選択状態の更新（呼び出し側で state を持つ） */
  onToggle: (court: string) => void;
}

export default function CourtChangeDialog({
  title = 'コートを変更',
  subtitle,
  courtCount = 16,
  multi = false,
  selected,
  busy = {},
  onConfirm,
  onClear,
  onClose,
  onToggle,
}: CourtChangeDialogProps) {
  const courts = Array.from({ length: courtCount }, (_, i) => String(i + 1));

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center psd-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="psd-panel psd-panel--xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="sdlg__head psd-head psd-head--plain">
          <span className="sec-head__mark sdlg__mark" aria-hidden="true" />
          <div className="sdlg__heading">
            <p className="sdlg__eyebrow">COURT</p>
            <h3 className="sdlg__title"><MapPin className="w-5 h-5 text-primary-600" />{title}</h3>
          </div>
          <button onClick={onClose} className="sdlg__close" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="psd-body">
          {subtitle && (
            <div className="psd-box mb-3 text-xs font-bold text-gray-700">{subtitle}</div>
          )}
          <p className="text-[11px] font-bold text-gray-500 mb-2">
            コート番号を選択
            {multi && <span className="font-normal text-gray-400">（複数選択できます）</span>}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {courts.map(c => {
              const isSelected = selected.includes(c);
              const busyReason = !isSelected ? busy[c] : undefined;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => { if (!busyReason) onToggle(c); }}
                  disabled={!!busyReason}
                  className={`psd-cnum ${busyReason ? 'is-off' : isSelected ? 'is-on' : ''}`}
                >
                  {c}
                  {busyReason && <span className="block text-[7px] font-normal text-gray-300">{busyReason}</span>}
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <p className="mt-3 text-center text-[11px] text-gray-500">
              選択中: <span className="font-bold text-gray-700">
                {[...selected].sort((a, b) => parseInt(a) - parseInt(b)).join('・')}
              </span> 番コート
            </p>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="btn btn--outline psd-btn">
              キャンセル
            </button>
            <button
              onClick={() => onConfirm(selected)}
              disabled={selected.length === 0}
              className="btn btn--primary psd-btn"
            >
              決定
            </button>
          </div>
          {onClear && (
            <button
              onClick={onClear}
              className="w-full mt-2 py-2 text-xs font-bold text-gray-500 hover:text-primary-600 transition-colors"
            >
              コート指定を消す
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
