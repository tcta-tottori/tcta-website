// ドローの「すべて表示」「全部並べる」で、各クラスの見出しの下に出す道具（1 種目ずつの表示の上の帯と同じもの）。
//   ・試合形式（ルール）… タップでそのクラスのゲームルールの修正
//   ・回戦の表示範囲（トーナメントのみ）… ALL 1R〜／2R〜…。決着した回戦を隠して残りを詰める
//   ・進み具合 … 終わった試合 / 全試合（%）・試合中の数
//   ・修正メニュー … そのクラスの 1 種目ずつの表示に切り替えて、あたり・名前などの修正メニューを開く
import { ChevronLeft, ChevronRight, Eye, EyeOff, SlidersHorizontal, Timer } from 'lucide-react';

export default function AllEventTools({ rulesText, onEditRules, round, progress, onOpenTools }: {
  rulesText?: string;
  onEditRules?: () => void;
  /** 回戦の表示範囲（トーナメントで 2 回戦以上あるときだけ） */
  round?: { start: number; max: number; label: string; onChange: (v: number | null) => void };
  progress: { finished: number; total: number; playing: number };
  onOpenTools?: () => void;
}) {
  const pct = progress.total > 0 ? Math.round((progress.finished / progress.total) * 100) : 0;
  return (
    <div className="dl-alltools">
      {rulesText && (
        onEditRules
          ? <button type="button" className="dl-alltools__rules" onClick={onEditRules} title="タップでゲームルールを修正">{rulesText}</button>
          : <p className="dl-alltools__rules">{rulesText}</p>
      )}
      <div className="dl-bar__row dl-alltools__row">
        {round && (
          <div className="dl-rounds">
            <button onClick={() => round.onChange(Math.max(0, round.start - 1))} disabled={round.start === 0} aria-label="前の回戦を表示する"><ChevronLeft /></button>
            <button onClick={() => round.onChange(null)} className={`dl-rounds__label ${round.start === 0 ? '' : 'is-on'}`} title="タップで自動（決着済みの回戦を省略）に戻す">
              {round.start === 0 ? <Eye /> : <EyeOff />}<span>{round.label}</span>
            </button>
            <button onClick={() => round.onChange(Math.min(round.max, round.start + 1))} disabled={round.start >= round.max} aria-label="終わった回戦を隠す"><ChevronRight /></button>
          </div>
        )}
        <div className="dl-progress">
          <div className="dl-progress__track"><div className="dl-progress__fill" style={{ width: `${pct}%` }} /></div>
          <span className="dl-progress__num">{progress.finished}/{progress.total} ({pct}%)</span>
        </div>
        {progress.playing > 0 && <span className="dl-playing"><Timer />{progress.playing}試合中</span>}
        {onOpenTools && (
          <div className="dl-tools">
            <button onClick={onOpenTools} className="dl-icon-btn" title="このクラスを 1 種目ずつの表示で開き、あたり・名前などの修正メニューを出す" aria-label="修正メニューを開く">
              <SlidersHorizontal />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
