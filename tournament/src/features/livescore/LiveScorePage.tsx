// =============================================
// ライブスコア入力 — 専用画面
//
// 対戦順 / タイムテーブル / ドロー の各画面から「ライブスコア開始」で遷移する。
// 1タップ＝1ポイントで進行し、更新はそのまま観戦ページへ配信される。
// =============================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, Undo2, RefreshCw, Trophy, Wifi, WifiOff, Radio,
  Minus, Plus, Repeat, Trash2, SlidersHorizontal,
} from 'lucide-react';
import { db } from '../../db/database';
import type { LiveScore, LiveScoreConfig, MatchFormatType } from '../../db/database';
import { useSyncStore } from '../sync/syncStore';
import LiveScoreBoard from './LiveScoreBoard';
import {
  adjustGames, awardPoint, describeConfig, pointLabel, setServer, summarize, toggleServer,
  type ScoreState,
} from './liveScoreEngine';
import {
  deleteLiveScore, finalizeLiveScore, revertLiveScoreResult, saveScoreState, updateLiveScoreConfig,
} from './liveScoreApi';
import { useNow } from './useNow';
import { usePlayerNumbers } from './usePlayerNumbers';
import { formatCourtLabel } from './courtLabel';
import { siteConfirm } from '../../components/site/siteConfirm';

/** 状態から ScoreState 部分だけを取り出す */
function toState(live: LiveScore): ScoreState {
  return {
    sets: live.sets,
    p1Points: live.p1Points,
    p2Points: live.p2Points,
    isTiebreak: live.isTiebreak,
    isSuperTiebreak: live.isSuperTiebreak,
    server: live.server,
    status: live.status,
    winner: live.winner,
    lastPointBy: live.lastPointBy,
    tiebreakFirstServer: live.tiebreakFirstServer ?? null,
  };
}

/**
 * 協会サイトのトンマナ（白ベース＋赤の差し色）に合わせた配色。
 * 画面全体: 白 / ヘッダー: 白＋下端の赤ライン / 得点ボタン: 赤 /
 * アクセント（差し色）: #D8232A
 * ※ Tailwind の任意値クラスは静的な文字列でしか解決できないため、
 *   クラス側は各所に直接記述し、ここでは背景色だけを共有する。
 */
const C = {
  /** 画面背景 */
  bg: '#ffffff',
  /** ヘッダーの地色 */
  deep: '#ffffff',
};

export default function LiveScorePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const matchId = params.get('match') || '';
  const eventId = params.get('event') || '';

  const connectionState = useSyncStore(s => s.connectionState);
  const roomCode = useSyncStore(s => s.roomCode);

  /** 「1つ戻す」用の履歴（この画面を開いている間のみ保持） */
  const historyRef = useRef<ScoreState[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showRules, setShowRules] = useState(false);
  /** 経過時間表示用の時計 */
  const now = useNow(1000);

  const live = useLiveQuery(async () => {
    if (!matchId) return null;
    const rows = await db.liveScores.where('matchId').equals(matchId).toArray();
    if (rows.length === 0) return null;
    return (eventId ? rows.find(r => r.eventId === eventId) : undefined) ?? rows[0];
  }, [matchId, eventId]);

  /** 選手番号（スコアボードのタップボタンも結果表と同じ並びで出す） */
  const numbers = usePlayerNumbers(live);

  // 画面が開いている間は端末をスリープさせない（コートサイドでの入力用）
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (nav.wakeLock) {
      nav.wakeLock.request('screen')
        .then(s => { if (cancelled) void s.release(); else sentinel = s; })
        .catch(() => { /* 非対応・拒否は無視 */ });
    }
    return () => { cancelled = true; void sentinel?.release().catch(() => {}); };
  }, []);

  const pushHistory = useCallback((state: ScoreState) => {
    historyRef.current = [...historyRef.current.slice(-49), JSON.parse(JSON.stringify(state))];
    setHistoryCount(historyRef.current.length);
  }, []);

  const apply = useCallback(async (next: ScoreState) => {
    if (!live) return;
    setBusy(true);
    try {
      await saveScoreState(live, next);
      // 規定ゲームに達して決着したら、そのまま対戦表・ドローへ反映する
      if (next.status === 'finished' && next.winner && live.status !== 'finished') {
        await finalizeLiveScore({ ...live, ...next }, next.winner);
      }
      // 終了状態から巻き戻したら、確定済みの結果も取り消す
      if (next.status === 'live' && live.status === 'finished') {
        await revertLiveScoreResult(live);
      }
    } finally {
      setBusy(false);
    }
  }, [live]);

  const handlePoint = useCallback(async (player: 1 | 2) => {
    if (!live || live.status === 'finished') return;
    const cur = toState(live);
    pushHistory(cur);
    await apply(awardPoint(cur, live.config, player));
  }, [live, apply, pushHistory]);

  const handleUndo = useCallback(async () => {
    if (!live) return;
    const prev = historyRef.current.pop();
    setHistoryCount(historyRef.current.length);
    if (!prev) return;
    await apply(prev);
  }, [live, apply]);

  const handleAdjust = useCallback(async (player: 1 | 2, delta: number) => {
    if (!live) return;
    const cur = toState(live);
    pushHistory(cur);
    await apply(adjustGames(cur, player, delta));
  }, [live, apply, pushHistory]);

  const handleToggleServer = useCallback(async () => {
    if (!live) return;
    await apply(toggleServer(toState(live)));
  }, [live, apply]);

  /** サーブ側を指定した選手に直す（ゲーム数の手動修正でずれたときの訂正用） */
  const handleSetServer = useCallback(async (player: 1 | 2) => {
    if (!live || live.server === player) return;
    await apply(setServer(toState(live), player));
  }, [live, apply]);

  /** 試合途中のゲームルール変更（変更内容はそのまま観戦ページへも配信される） */
  const handleConfigChange = useCallback(async (patch: Partial<LiveScoreConfig>) => {
    if (!live || live.status === 'finished') return;
    const next: LiveScoreConfig = { ...live.config, ...patch };
    // 2セットマッチ＋ファイナルSTB は1セット6ゲームが既定
    if (patch.format && patch.format !== live.config.format) {
      if (patch.format === 'twoSetsSuper10' && live.config.targetGames > 6) next.targetGames = 6;
      if (patch.format === 'game' && live.config.format === 'twoSetsSuper10') next.targetGames = 8;
    }
    setBusy(true);
    try {
      await updateLiveScoreConfig(live, next);
    } finally {
      setBusy(false);
    }
  }, [live]);

  const handleFinalize = useCallback(async (winner: 1 | 2) => {
    if (!live) return;
    if (!(await siteConfirm(`${winner === 1 ? live.player1Name : live.player2Name} の勝利で結果を確定します。よろしいですか？`))) return;
    setBusy(true);
    try {
      await finalizeLiveScore(live, winner);
    } finally {
      setBusy(false);
    }
  }, [live]);

  const handleDelete = useCallback(async () => {
    if (!live) return;
    if (!(await siteConfirm('この試合のライブスコア配信を終了して記録を削除しますか？（試合結果は残ります）'))) return;
    await deleteLiveScore(live);
    navigate(-1);
  }, [live, navigate]);

  if (!matchId) {
    return <CenteredNotice text="ライブスコアの対象試合が指定されていません。" onBack={() => navigate(-1)} />;
  }
  if (live === undefined) {
    return <CenteredNotice text="読み込み中..." onBack={() => navigate(-1)} />;
  }
  if (live === null) {
    return <CenteredNotice text="この試合のライブスコアは開始されていません。" onBack={() => navigate(-1)} />;
  }

  const finished = live.status === 'finished';
  const connected = connectionState === 'connected';

  return (
    <div className="dls min-h-[100dvh] flex flex-col" style={{ backgroundColor: C.bg }}>
      {/* ヘッダー */}
      <header
        className="dls-head"
        style={{ backgroundColor: C.deep }}
      >
        <button
          onClick={() => navigate(-1)}
          className="dls-btn dls-btn--sm"
        >
          <ArrowLeft className="w-4 h-4" />戻る
        </button>
        <div className="min-w-0 flex-1">
          <p className="dls-head__sub">
            {[live.eventName, live.roundName].filter(Boolean).join(' ・ ')}
          </p>
          <p className="dls-head__title">
            {formatCourtLabel(live.courtName) || 'コート未割当'} <span>#{live.matchOrder}</span>
          </p>
        </div>
        <span
          className={`dls-conn ${connected ? 'is-on' : ''}`}
          title={roomCode ? `ルーム: ${roomCode}` : '同期は開始されていません'}
        >
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? '配信中' : '未配信'}
        </span>
      </header>

      {/* 配信されていないときの案内 */}
      {!connected && (
        <div className="dls-note">
          同期が開始されていないため、この端末の中だけで記録されています。
          観戦ページへ配信するには、メニューの「同期」からルームに接続してください。
        </div>
      )}

      {/* スコアボード（観戦ページと同じ見た目） */}
      <div className="dls-board">
        <LiveScoreBoard live={live} size="lg" />
        {/* スコアはボードに出ているので、ここは経過時間だけにする */}
        <p className="dls-elapsed">経過 {formatElapsed(now - live.startedAt)}</p>
      </div>

      {/* ポイント入力 */}
      <div className="dls-body">
        {!finished ? (
          <div className="grid grid-cols-2 gap-3 flex-1 min-h-[220px]">
            {([1, 2] as const).map(p => {
              const name = p === 1 ? live.player1Name : live.player2Name;
              const aff = p === 1 ? live.player1Affiliation : live.player2Affiliation;
              const num = p === 1 ? numbers.p1 : numbers.p2;
              return (
                <button
                  key={p}
                  onClick={() => void handlePoint(p)}
                  disabled={busy}
                  className="dls-point"
                >
                  {live.server === p && (
                    <span className="dls-point__serve">
                      SERVE
                    </span>
                  )}
                  {/* 結果表と同じ「番号 選手名（所属）」の並びで表示する */}
                  <span className="dls-point__name">
                    {num != null && <span className="text-white/60 mr-1.5">{num}</span>}
                    {name || '(未定)'}
                  </span>
                  <span className="dls-point__aff">
                    {aff ? `（${aff}）` : ''}
                  </span>
                  <span className="dls-point__num">
                    {pointLabel(live, p)}
                  </span>
                  <span className="dls-point__hint">タップで +1ポイント</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="dls-final">
            <Trophy className="w-10 h-10 text-[var(--red)]" />
            <p className="dls-final__win">
              {live.winner === 1 ? live.player1Name : live.player2Name} の勝利
            </p>
            <p className="text-sm text-gray-500">{summarize(live, live.config)}</p>
            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              結果は対戦表・ドローへ反映済みです。<br />観戦ページには FINAL 表示でしばらく残ります。
            </p>
          </div>
        )}

        {/* 操作列 */}
        <div className="dls-ops">
          <button
            onClick={() => void handleUndo()}
            disabled={busy || historyCount === 0}
            className="dls-btn"
          >
            <Undo2 className="w-4 h-4" />1つ戻す
          </button>
          <button
            onClick={() => void handleToggleServer()}
            disabled={busy || finished}
            className="dls-btn"
          >
            <Repeat className="w-4 h-4" />サーブ交代
          </button>
          <button
            onClick={() => setShowAdjust(v => !v)}
            disabled={finished}
            className={`dls-btn ${showAdjust ? 'is-on' : ''}`}
          >
            <RefreshCw className="w-4 h-4" />ゲーム修正
          </button>
          <button
            onClick={() => setShowRules(v => !v)}
            disabled={finished}
            className={`dls-btn ${showRules ? 'is-on' : ''}`}
          >
            <SlidersHorizontal className="w-4 h-4" />ルール変更
          </button>
        </div>

        {/* 試合途中のゲームルール変更 */}
        {showRules && !finished && (
          <RuleEditor config={live.config} busy={busy} onChange={patch => void handleConfigChange(patch)} />
        )}

        {/* ゲーム数の手動修正 */}
        {showAdjust && !finished && (
          <div className="dls-panel space-y-2">
            <p className="text-[11px] text-gray-500">
              現在のセットのゲーム数を直接修正します（ポイントは0-0に戻ります）。
            </p>
            {([1, 2] as const).map(p => (
              <div key={p} className="flex items-center gap-2">
                <span className="flex-1 text-sm font-bold truncate">
                  {(p === 1 ? live.player1Name : live.player2Name) || '(未定)'}
                </span>
                <button
                  onClick={() => void handleAdjust(p, -1)}
                  className="dls-step"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center text-lg font-black dlsb-num">
                  {p === 1 ? live.sets[live.sets.length - 1]?.p1 ?? 0 : live.sets[live.sets.length - 1]?.p2 ?? 0}
                </span>
                <button
                  onClick={() => void handleAdjust(p, 1)}
                  className="dls-step"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* サーブ側の直接指定 */}
            {/* ゲーム数だけを直すとサーブ側が実際とずれるため、ここで合わせられるようにする */}
            <div className="pt-2 border-t border-gray-200 space-y-1.5">
              <p className="text-[11px] text-gray-500">
                このゲームのサーブ側（1ゲーム毎に自動で交代します）
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => void handleSetServer(p)}
                    disabled={busy}
                    className={`dls-btn dls-btn--sm dls-btn--trunc ${live.server === p ? 'is-on' : ''}`}
                  >
                    {(p === 1 ? live.player1Name : live.player2Name) || '(未定)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 結果確定 */}
        {!finished && (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-400 text-center">
              規定ゲームに達すると自動で確定できます。途中終了（棄権等）もここから確定できます。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2] as const).map(p => (
                <button
                  key={p}
                  onClick={() => void handleFinalize(p)}
                  disabled={busy}
                  className="dls-btn dls-btn--primary"
                >
                  <Trophy className="w-4 h-4" />
                  {(p === 1 ? live.player1Name : live.player2Name) || '(未定)'} 勝利で確定
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => void handleDelete()}
          className="dls-btn dls-btn--ghost"
        >
          <Trash2 className="w-3.5 h-3.5" />ライブスコア配信を終了して削除
        </button>

        <p className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400 pb-2">
          <Radio className="w-3 h-3" />
          入力したポイントは即座に観戦ページへ配信されます
        </p>
      </div>
    </div>
  );
}

/**
 * 試合途中でゲームルールを変更するパネル。
 * 変更は即座に保存され、観戦ページの表示にも反映される。
 */
function RuleEditor({
  config, busy, onChange,
}: {
  config: LiveScoreConfig;
  busy: boolean;
  onChange: (patch: Partial<LiveScoreConfig>) => void;
}) {
  const isTwoSets = config.format === 'twoSetsSuper10';
  return (
    <div className="dls-panel space-y-3">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        試合の途中でもルールを変更できます（変更後のゲーム数から新しいルールで進行します）。
      </p>

      {/* 試合方式 */}
      <RuleRow label="試合方式">
        {([
          { v: 'game' as MatchFormatType, label: 'Nゲームマッチ' },
          { v: 'twoSetsSuper10' as MatchFormatType, label: '2セット＋10点STB' },
        ]).map(o => (
          <ChoiceButton
            key={o.v}
            active={config.format === o.v}
            disabled={busy}
            onClick={() => onChange({ format: o.v })}
          >
            {o.label}
          </ChoiceButton>
        ))}
      </RuleRow>

      {/* 規定ゲーム数 */}
      <RuleRow label={isTwoSets ? '1セットのゲーム数' : '規定ゲーム数'}>
        {[4, 6, 8, 9].map(g => (
          <ChoiceButton
            key={g}
            active={config.targetGames === g}
            disabled={busy}
            onClick={() => onChange({ targetGames: g })}
          >
            {g}
          </ChoiceButton>
        ))}
        <span className="flex items-center gap-1 ml-1">
          <button
            onClick={() => onChange({ targetGames: Math.max(1, config.targetGames - 1) })}
            disabled={busy}
            className="dls-step dls-step--sm"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-black dlsb-num">{config.targetGames}</span>
          <button
            onClick={() => onChange({ targetGames: Math.min(99, config.targetGames + 1) })}
            disabled={busy}
            className="dls-step dls-step--sm"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </span>
      </RuleRow>

      {/* デュース / ノーアド */}
      <RuleRow label="デュース">
        <ChoiceButton active={!config.noAd} disabled={busy} onClick={() => onChange({ noAd: false })}>
          アドバンテージ
        </ChoiceButton>
        <ChoiceButton active={config.noAd} disabled={busy} onClick={() => onChange({ noAd: true })}>
          ノーアド
        </ChoiceButton>
      </RuleRow>

      {/* タイブレーク目標点 */}
      <RuleRow label="タイブレーク">
        {[5, 7, 10].map(p => (
          <ChoiceButton
            key={p}
            active={config.tiebreakTo === p}
            disabled={busy}
            onClick={() => onChange({ tiebreakTo: p })}
          >
            {p}点
          </ChoiceButton>
        ))}
      </RuleRow>

      {/* ファイナルSTB目標点（2セットマッチのみ） */}
      {isTwoSets && (
        <RuleRow label="ファイナルSTB">
          {[7, 10].map(p => (
            <ChoiceButton
              key={p}
              active={config.superTiebreakTo === p}
              disabled={busy}
              onClick={() => onChange({ superTiebreakTo: p })}
            >
              {p}点
            </ChoiceButton>
          ))}
        </RuleRow>
      )}

      <p className="text-[10px] text-gray-400 leading-relaxed">
        現在の設定: {describeConfig(config)}
      </p>
    </div>
  );
}

function RuleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-full sm:w-32 shrink-0 text-[11px] font-bold text-gray-500">{label}</span>
      {children}
    </div>
  );
}

function ChoiceButton({
  active, disabled, onClick, children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`dls-choice ${active ? 'is-on' : ''}`}
    >
      {children}
    </button>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function CenteredNotice({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div
      className="dls min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6"
      style={{ backgroundColor: C.bg }}
    >
      <p className="text-sm text-gray-600 text-center">{text}</p>
      <button
        onClick={onBack}
        className="dls-btn"
      >
        <ArrowLeft className="w-4 h-4" />戻る
      </button>
    </div>
  );
}
