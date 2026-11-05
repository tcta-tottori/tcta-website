// =============================================
// ライブスコア 公開ビュー（観戦用）
//
// 運営端末の入力を WebSocket 経由で受信し、
// テレビ中継風のスコアテロップでリアルタイム表示する。
// =============================================

import { Radio, Clock } from 'lucide-react';
import { useSyncStore } from '../sync/syncStore';
import LiveScoreBoard from '../livescore/LiveScoreBoard';
import { useVisibleLiveScores } from '../livescore/useVisibleLiveScores';
import { SkPage, SkSection, SkEmpty } from '../../components/site/Kit';

export default function PublicLiveScoreView() {
  const lastSyncAt = useSyncStore(s => s.lastSyncAt);
  const latencyMs = useSyncStore(s => s.latencyMs);

  // 「◯秒前に更新」表示にも使うので now を受け取る
  const { visible, liveCount, now } = useVisibleLiveScores();

  const meta = (latencyMs != null || lastSyncAt) ? (
    <div className="pv-ls__meta">
      {latencyMs != null && <span>配信遅延 約{latencyMs}ms</span>}
      {lastSyncAt && (
        <span>
          <Clock className="w-3 h-3" />
          {relativeTime(now - lastSyncAt)}に更新
        </span>
      )}
    </div>
  ) : undefined;

  return (
    <SkPage className="pv-ls">
      <SkSection
        en="LIVE SCORE"
        title={(
          <>
            <span className={`pv-ls__dot ${liveCount > 0 ? 'is-live' : ''}`} aria-hidden="true"><i /><i /></span>
            ライブスコア
          </>
        )}
        count={liveCount > 0 ? `${liveCount}試合 進行中` : undefined}
        actions={meta}
        flush={visible.length === 0}
      >
        {visible.length === 0 ? (
          <SkEmpty
            icon={Radio}
            title="現在ライブスコアを配信中の試合はありません。"
            text="運営がコートでライブスコアを開始すると、ここに1ポイントごとの経過が表示されます。"
          />
        ) : (
          <div className="pv-ls__list">
            {/* 観戦ページはスコアボードだけを見せる（下に文字を足さない） */}
            {visible.map(l => (
              <LiveScoreBoard key={`${l.eventId}-${l.matchId}`} live={l} size="md" />
            ))}
          </div>
        )}
      </SkSection>

      <p className="pv-ls__foot">
        ライブスコアは運営端末の入力に合わせて自動更新されます（更新の操作は不要です）。
      </p>
    </SkPage>
  );
}

function relativeTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分前`;
  return `${Math.floor(m / 60)}時間前`;
}
