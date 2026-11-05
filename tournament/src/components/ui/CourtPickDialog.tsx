// =============================================================================
// コート選択ポップアップ
//
// 待機中の試合を「どのコートに入れるか」運営が選ぶためのダイアログ。
// 対戦順シート（MatchManager）とコート別ドロー（CourtBracketPage）の
// どちらから入っても同じ操作になるよう、共通コンポーネントにしている。
// （以前はドロー側が自動で入るコートを決めてしまい、選べなかった）
//
// 表示はコート状況（コートマップ）に合わせて4面ごとのブロックで行を分け、
// 会場の全コートを並べる。空きコートだけが赤のボタンで選択でき、
// 試合中・使用しないコートはグレーで選択できない。
// =============================================================================

import { X, Trophy } from 'lucide-react';

export interface CourtPickCourt {
  courtId: string;
  name: string;
  /** 'empty' = 空き（選択可） / 'playing' = 試合中 / 'unavailable' = 使用しない */
  status: 'empty' | 'playing' | 'unavailable';
}

interface CourtPickDialogProps {
  /** 種目名（短縮済みでも可） */
  eventName: string;
  /** 回戦名（例: 1回戦） */
  roundName: string;
  player1Name: string;
  player2Name: string;
  /** 会場の全コート（番号順） */
  courts: CourtPickCourt[];
  onSelect: (courtId: string) => void;
  onClose: () => void;
  /**
   * コートを選ばずにそのままスコア入力へ進む。
   * 空きコートが無い・コート運用をしていない場合でも結果を入力できるようにするための導線。
   */
  onScoreInput?: () => void;
}

/** 1ブロックのコート数（コート状況の並びに合わせる） */
const BLOCK_SIZE = 4;

/** 配列を size ごとのブロックに分割する */
function chunk<T>(items: T[], size: number): T[][] {
  const blocks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    blocks.push(items.slice(i, i + size));
  }
  return blocks;
}

export default function CourtPickDialog({
  eventName,
  roundName,
  player1Name,
  player2Name,
  courts,
  onSelect,
  onClose,
  onScoreInput,
}: CourtPickDialogProps) {
  const blocks = chunk(courts, BLOCK_SIZE);
  const emptyCount = courts.filter(c => c.status === 'empty').length;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center psd-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="psd-panel psd-panel--sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="sdlg__head psd-head psd-head--plain">
          <span className="sec-head__mark sdlg__mark" aria-hidden="true" />
          <div className="sdlg__heading">
            <p className="sdlg__eyebrow">COURT</p>
            <h3 className="sdlg__title">コートに入れる</h3>
          </div>
          <button onClick={onClose} className="sdlg__close" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="psd-body space-y-4">
        <div className="psd-box text-sm space-y-1">
          <div>
            <span className="font-medium">{eventName}</span>
            {roundName && <span className="ml-2 text-gray-500">{roundName}</span>}
          </div>
          <div className="text-gray-900 font-semibold">
            {player1Name} <span className="text-gray-400 font-normal mx-0.5">vs</span> {player2Name}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-500">入れるコートを選択</label>
            <span className="text-[11px] text-gray-400">空き {emptyCount} / {courts.length}面</span>
          </div>
          {courts.length === 0 ? (
            <p className="text-sm text-gray-400 py-2 text-center">コートが登録されていません。</p>
          ) : (
            <div className="space-y-2">
              {blocks.map((block, bi) => (
                <div key={bi} className="psd-box psd-courtblock">
                  <div className="text-[10px] font-bold text-gray-800 mb-1.5 px-0.5">
                    {block.length > 1
                      ? `${block[0].name}〜${block[block.length - 1].name}番コート`
                      : `${block[0].name}番コート`}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {block.map(c => {
                      const selectable = c.status === 'empty';
                      return (
                        <button
                          key={c.courtId}
                          onClick={() => selectable && onSelect(c.courtId)}
                          disabled={!selectable}
                          className={`psd-court ${selectable ? '' : 'is-off'}`}
                        >
                          <span className="text-base font-black leading-none">{c.name}</span>
                          <span className="text-[9px] font-bold leading-none mt-1 opacity-90">
                            {c.status === 'empty' ? '空き' : c.status === 'playing' ? '試合中' : '使用不可'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {emptyCount === 0 && courts.length > 0 && (
            <p className="text-sm text-gray-400 py-2 text-center">現在、空きコートがありません。</p>
          )}
        </div>

        {/* コートを決めずに結果だけ入れる導線（コート未選択でもスコア入力できる） */}
        {onScoreInput && (
          <div className="pt-1 border-t border-gray-100">
            <button
              onClick={onScoreInput}
              className="btn btn--outline psd-btn psd-btn--block"
            >
              <Trophy className="w-4 h-4" />
              コートを選ばずにスコア入力
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
