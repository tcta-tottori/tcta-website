import { useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Timer, Trophy } from 'lucide-react';

export interface BracketTabItem {
  /** タブの識別子（順位カテゴリなど） */
  id: string;
  /** 見出しに出す名前 */
  label: string;
  /** 完了した試合数 */
  finished: number;
  /** 全試合数（BYEを除く） */
  total: number;
}

interface Props {
  tabs: BracketTabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** 見出しの下に出す小さな説明（ゲームルールなど） */
  subtitle?: string;
  /** 進行中の試合数（0なら非表示） */
  playing?: number;
  /** 表示回戦の絞り込みを出すか */
  canAdjustRounds?: boolean;
  startRound?: number;
  maxStartRound?: number;
  /** 「全回戦表示」「準決勝以降」などのラベル */
  startRoundLabel?: string;
  /** null を渡すと自動（決着済みの回戦を省略）に戻す */
  onStartRoundChange?: (value: number | null) => void;
  /** 右側に置く追加のボタンなど */
  right?: React.ReactNode;
  /** 親のパディングを打ち消して、画面の横幅いっぱいに表示する */
  fullBleedClass?: string;
}

/**
 * 決勝トーナメント表の上部ヘッダー（シングルス大会の CourtBracketPage と同じ形式）。
 * - 左右の矢印／スワイプ／下のドットでクラス（順位カテゴリ）を切り替える
 * - 進捗バーと、表示回戦の絞り込み（回戦が進むと表示を縮小）を備える
 */
export default function BracketTopBar({
  tabs,
  selectedId,
  onSelect,
  subtitle,
  playing = 0,
  canAdjustRounds = false,
  startRound = 0,
  maxStartRound = 0,
  startRoundLabel = 'ALL 1R〜',
  onStartRoundChange,
  right,
  fullBleedClass = '',
}: Props) {
  const idx = Math.max(0, tabs.findIndex(t => t.id === selectedId));
  const current = tabs[idx];

  const gotoPrev = useCallback(() => {
    if (tabs.length === 0) return;
    onSelect(tabs[(idx - 1 + tabs.length) % tabs.length].id);
  }, [tabs, idx, onSelect]);
  const gotoNext = useCallback(() => {
    if (tabs.length === 0) return;
    onSelect(tabs[(idx + 1) % tabs.length].id);
  }, [tabs, idx, onSelect]);

  // スワイプでクラス切替
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || tabs.length <= 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) gotoNext(); else gotoPrev();
  }, [tabs.length, gotoNext, gotoPrev]);

  const pct = current && current.total > 0 ? Math.round((current.finished / current.total) * 100) : 0;

  return (
    <div
      className={`dl-bar ${fullBleedClass}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="dl-bar__row">
        <button onClick={gotoPrev} className="dl-arrow" aria-label="前のクラス">
          <ChevronLeft />
        </button>

        <div className="dl-title">
          <h2 className="dl-title__btn" style={{ cursor: 'default' }}>
            <Trophy className="w-4 h-4 shrink-0" />
            <span>{current?.label || 'トーナメント'}</span>
          </h2>
          {subtitle && <p className="dl-title__sub">{subtitle}</p>}
        </div>

        <button onClick={gotoNext} className="dl-arrow" aria-label="次のクラス">
          <ChevronRight />
        </button>
      </div>

      {/* 表示回戦の絞り込み（左）・進捗バー（中央・伸縮）・右側のボタン群（固定）を 1 行に。
          「3回戦以降」など文字数が変わっても右のボタンが動かないよう、ラベルは固定幅。 */}
      <div className="dl-bar__row">
        {canAdjustRounds && onStartRoundChange ? (
          <div className="dl-rounds">
            <button
              onClick={() => onStartRoundChange(Math.max(0, startRound - 1))}
              disabled={startRound === 0}
              title="前の回戦を表示する"
              aria-label="前の回戦を表示する"
            >
              <ChevronLeft />
            </button>
            <button
              onClick={() => onStartRoundChange(null)}
              className={`dl-rounds__label ${startRound === 0 ? '' : 'is-on'}`}
              title="タップで自動（決着済みの回戦を省略）に戻す"
            >
              {startRound === 0 ? <Eye /> : <EyeOff />}
              {/* ラベルの幅を固定して、回戦が変わってもボタンが動かないようにする */}
              <span>{startRoundLabel}</span>
            </button>
            <button
              onClick={() => onStartRoundChange(Math.min(maxStartRound, startRound + 1))}
              disabled={startRound >= maxStartRound}
              title="終わった回戦を隠す"
              aria-label="終わった回戦を隠す"
            >
              <ChevronRight />
            </button>
          </div>
        ) : null}

        {/* 進捗バー */}
        <div className="dl-progress">
          <div className="dl-progress__track">
            <div className="dl-progress__fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="dl-progress__num">
            {current?.finished ?? 0}/{current?.total ?? 0} ({pct}%)
          </span>
        </div>
        {playing > 0 && (
          <span className="dl-playing">
            <Timer />
            {playing}試合中
          </span>
        )}

        {right && <div className="dl-tools">{right}</div>}
      </div>

      {/* クラスタブ（小さい四角） */}
      {tabs.length > 1 && (
        <div className="dl-dots">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={i === idx ? 'is-current' : ''}
              title={t.label}
              aria-label={t.label}
            />
          ))}
        </div>
      )}
    </div>
  );
}
