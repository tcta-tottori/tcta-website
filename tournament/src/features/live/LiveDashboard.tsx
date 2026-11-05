import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SkSection } from '../../components/site/Kit';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import MixedLiveCourtView from '../mixed/MixedLiveCourtView';
import TeamLiveCourtView from '../team/TeamLiveCourtView';
import type { Match, Court } from '../../db/database';
import {
  BarChart2, Play, CheckCircle, Clock, Users,
  AlertCircle, Timer, Radio,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

/** 短縮ラウンド名（コート状況バッジ用）: 1R / QF / SF / F */
function shortRoundName(round: number, totalRounds: number): string {
  if (round >= totalRounds) return 'F';
  if (round === totalRounds - 1) return 'SF';
  if (round === totalRounds - 2) return 'QF';
  return `${round}R`;
}

/** "HH:MM" -> minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** minutes -> "H:MM" display */
function minutesToDisplay(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '-' : '+';
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CourtStatus = {
  court: Court;
  currentMatch: Match | null;
  nextMatch: Match | null;
  matchCount: number;
  status: 'empty' | 'playing' | 'ready' | 'unavailable';
  /** このコートの試合をライブスコア配信中か */
  isBroadcasting: boolean;
};

/** ライブスコア配信中を示すバッジ（コートマップ用） */
function BroadcastBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`flex items-center gap-0.5 bg-[#D8232A] text-white font-bold leading-none shrink-0 ${
        compact ? 'text-[7px] px-1 py-0.5' : 'text-[7px] sm:text-[8px] px-1 sm:px-1.5 py-0.5'
      }`}
      title="ライブスコアを配信中"
    >
      <Radio className="w-2 h-2" />配信
    </span>
  );
}

// ---------------------------------------------------------------------------
// SVG Donut Chart
// ---------------------------------------------------------------------------

function DonutChart({
  percent,
  size = 140,
  strokeWidth = 14,
  playing,
  finished,
  total,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  playing: number;
  finished: number;
  total: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const finishedDash = (finished / Math.max(total, 1)) * circumference;
  const playingDash = (playing / Math.max(total, 1)) * circumference;
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="var(--gray-200)" strokeWidth={strokeWidth}
        />
        {/* Finished arc */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="var(--ink)" strokeWidth={strokeWidth}
          strokeDasharray={`${finishedDash} ${circumference - finishedDash}`}
          strokeDashoffset="0"
          className="transition-all duration-700"
        />
        {/* Playing arc (on top of finished) */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="var(--red)" strokeWidth={strokeWidth}
          strokeDasharray={`${playingDash} ${circumference - playingDash}`}
          strokeDashoffset={`${-finishedDash}`}
          className="transition-all duration-700"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="dld-donut__pct">{percent}<small>%</small></span>
        <span className="text-[10px] text-gray-400 mt-0.5 font-medium">完了</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tennis Court SVG block
// ---------------------------------------------------------------------------

/** Vertical court SVG lines overlay */
function VerticalCourtLines({ status }: { status: string }) {
  const color = status === 'playing' ? 'rgba(216, 35, 42,0.3)'
    : status === 'ready' ? 'rgba(118,118,118,0.25)'
    : status === 'unavailable' ? 'rgba(166,166,166,0.2)'
    : 'rgba(166,166,166,0.18)';
  return (
    <svg viewBox="0 0 60 110" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
      <rect x="4" y="4" width="52" height="102" fill="none" stroke={color} strokeWidth="1.5" rx="1" />
      <line x1="2" y1="55" x2="58" y2="55" stroke={color} strokeWidth="2" />
      <line x1="10" y1="30" x2="50" y2="30" stroke={color} strokeWidth="0.8" />
      <line x1="10" y1="80" x2="50" y2="80" stroke={color} strokeWidth="0.8" />
      <line x1="10" y1="4" x2="10" y2="106" stroke={color} strokeWidth="0.8" />
      <line x1="50" y1="4" x2="50" y2="106" stroke={color} strokeWidth="0.8" />
      <line x1="30" y1="30" x2="30" y2="80" stroke={color} strokeWidth="0.8" />
      <line x1="30" y1="4" x2="30" y2="8" stroke={color} strokeWidth="0.8" />
      <line x1="30" y1="102" x2="30" y2="106" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

/** Format elapsed time from updatedAt timestamp */
function formatElapsed(updatedAt: number | undefined): string {
  if (!updatedAt) return '';
  const diff = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** テニスコート型SVG（横向き・PC用） */
function HorizontalCourtLines({ status }: { status: string }) {
  const color = status === 'playing' ? 'rgba(216, 35, 42,0.3)'
    : status === 'ready' ? 'rgba(118,118,118,0.25)'
    : status === 'unavailable' ? 'rgba(166,166,166,0.2)'
    : 'rgba(166,166,166,0.18)';
  return (
    <svg viewBox="0 0 110 60" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
      <rect x="4" y="4" width="102" height="52" fill="none" stroke={color} strokeWidth="1.5" rx="1" />
      <line x1="55" y1="2" x2="55" y2="58" stroke={color} strokeWidth="2" />
      <line x1="30" y1="10" x2="30" y2="50" stroke={color} strokeWidth="0.8" />
      <line x1="80" y1="10" x2="80" y2="50" stroke={color} strokeWidth="0.8" />
      <line x1="4" y1="10" x2="106" y2="10" stroke={color} strokeWidth="0.8" />
      <line x1="4" y1="50" x2="106" y2="50" stroke={color} strokeWidth="0.8" />
      <line x1="30" y1="30" x2="80" y2="30" stroke={color} strokeWidth="0.8" />
      <line x1="4" y1="30" x2="8" y2="30" stroke={color} strokeWidth="0.8" />
      <line x1="102" y1="30" x2="106" y2="30" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

/** PC用横向きコートカード */
function TennisCourtBlockH({
  cs, isSelected, onSelect, eventName, roundLabel, isTimeOver,
}: {
  cs: CourtStatus; isSelected: boolean; onSelect: () => void; eventName?: string; roundLabel?: string; isTimeOver?: boolean;
}) {
  const statusStyles: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    playing: { bg: 'bg-primary-100', border: 'border-primary-400', text: 'text-gray-900', glow: '' },
    ready: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', glow: '' },
    empty: { bg: 'bg-white/80', border: 'border-primary-200', text: 'text-gray-600', glow: '' },
    unavailable: { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-400', glow: '' },
  };
  const style = isTimeOver
    ? { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-800', glow: '' }
    : statusStyles[cs.status];
  const courtNum = cs.court.name.replace(/[^\d]/g, '') || cs.court.name;
  const elapsed = cs.currentMatch?.status === 'playing' ? formatElapsed(cs.currentMatch.updatedAt) : '';

  return (
    <button
      onClick={onSelect}
      className={`dld-court relative border-2 cursor-pointer overflow-hidden
        ${style.bg} ${style.border} ${style.glow}
        ${isSelected ? 'is-selected' : ''}
      `}
      style={{ aspectRatio: '1.6 / 1', width: '100%' }}
    >
      <HorizontalCourtLines status={cs.status} />
      <div className="relative z-10 flex items-center h-full px-2 py-1 gap-2">
        {/* 左: コート番号 + バッジ */}
        <div className="flex flex-col items-center shrink-0 min-w-[36px] gap-0.5">
          {cs.status === 'playing' && (
            isTimeOver ? (
              <span className="flex items-center gap-0.5 bg-red-500 text-white text-[7px] font-bold px-1 py-0.5 leading-none shrink-0 animate-pulse">
                <AlertCircle className="w-2 h-2" /> 超過
              </span>
            ) : (
              <span className="flex items-center gap-0.5 bg-primary-500 text-white text-[7px] font-bold px-1 py-0.5 leading-none shrink-0">
                <Play className="w-2 h-2 fill-white" /> LIVE
              </span>
            )
          )}
          {/* ライブスコア配信中 */}
          {cs.isBroadcasting && <BroadcastBadge compact />}
          <div className={`text-xl font-black ${style.text} leading-none`}>{courtNum}</div>
          {elapsed && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <Timer className={`w-2.5 h-2.5 ${isTimeOver ? 'text-red-600' : 'text-gray-700'}`} />
              <span className={`text-[9px] font-mono font-bold tabular-nums ${isTimeOver ? 'text-red-700' : 'text-gray-800'}`}>{elapsed}</span>
            </div>
          )}
        </div>
        {/* 右: 対戦情報 */}
        {cs.currentMatch ? (
          <div className="flex-1 min-w-0 border-l border-primary-200/60 pl-2 space-y-0">
            {eventName && (
              <span className="inline-flex items-center gap-0.5 max-w-full mb-0.5 bg-primary-600 text-white rounded px-1 py-0.5 leading-none">
                <span className="text-[8px] font-bold truncate">{eventName}</span>
                {roundLabel && <span className="text-[8px] font-black bg-white/25 rounded-sm px-0.5 shrink-0">{roundLabel}</span>}
              </span>
            )}
            <p className="text-[10px] font-bold text-gray-900 truncate leading-tight">{cs.currentMatch.player1Name}</p>
            <p className="text-[7px] font-medium text-primary-500 leading-none">vs</p>
            <p className="text-[10px] font-bold text-gray-900 truncate leading-tight">{cs.currentMatch.player2Name}</p>
          </div>
        ) : cs.nextMatch ? (
          <div className="flex-1 min-w-0 border-l border-gray-100/60 pl-2 space-y-0">
            <p className="text-[9px] font-semibold text-gray-500/80 truncate leading-none mb-0.5">次の試合</p>
            <p className="text-[10px] font-bold text-gray-700 truncate leading-tight">{cs.nextMatch.player1Name}</p>
            <p className="text-[7px] font-medium text-gray-400 leading-none">vs</p>
            <p className="text-[10px] font-bold text-gray-700 truncate leading-tight">{cs.nextMatch.player2Name}</p>
          </div>
        ) : cs.status === 'unavailable' ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[10px] text-gray-400 font-medium">使用不可</p>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[10px] text-gray-400 font-medium">空き</p>
          </div>
        )}
      </div>
    </button>
  );
}

/** Single vertical court card for block-based layout */
function TennisCourtBlock({
  cs,
  isSelected,
  onSelect,
  eventName,
  roundLabel,
  isTimeOver,
}: {
  cs: CourtStatus;
  isSelected: boolean;
  onSelect: () => void;
  eventName?: string;
  roundLabel?: string;
  isTimeOver?: boolean;
}) {
  const statusStyles: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    playing: { bg: 'bg-primary-100', border: 'border-primary-400', text: 'text-gray-900', glow: '' },
    ready: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', glow: '' },
    empty: { bg: 'bg-white/80', border: 'border-primary-200', text: 'text-gray-600', glow: '' },
    unavailable: { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-400', glow: '' },
  };
  // Time-over override
  const style = isTimeOver
    ? { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-800', glow: '' }
    : statusStyles[cs.status];
  const courtNum = cs.court.name.replace(/[^\d]/g, '') || cs.court.name;
  const elapsed = cs.currentMatch?.status === 'playing' ? formatElapsed(cs.currentMatch.updatedAt) : '';

  return (
    <button
      onClick={onSelect}
      className={`dld-court relative border-2 cursor-pointer overflow-hidden
        ${style.bg} ${style.border} ${style.glow}
        ${isSelected ? 'is-selected' : ''}
      `}
      style={{ aspectRatio: '1 / 1.7', width: '100%' }}
    >
      <VerticalCourtLines status={cs.status} />
      <div className="relative z-10 flex flex-col items-center justify-between h-full py-1.5 px-1">
        {/* Top: LIVE badge + court number */}
        <div className="w-full flex items-start justify-between">
          <div className={`text-base sm:text-lg md:text-xl font-black ${style.text} leading-none pl-0.5`}>
            {courtNum}
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {cs.status === 'playing' && (
              isTimeOver ? (
                <span className="flex items-center gap-0.5 bg-red-500 text-white text-[7px] sm:text-[8px] font-bold px-1 sm:px-1.5 py-0.5 leading-none shrink-0 animate-pulse">
                  <AlertCircle className="w-2 h-2" /> 超過
                </span>
              ) : (
                <span className="flex items-center gap-0.5 bg-primary-500 text-white text-[7px] sm:text-[8px] font-bold px-1 sm:px-1.5 py-0.5 leading-none shrink-0">
                  <Play className="w-2 h-2 fill-white" /> LIVE
                </span>
              )
            )}
            {/* ライブスコア配信中 */}
            {cs.isBroadcasting && <BroadcastBadge />}
          </div>
        </div>

        {/* Middle: event name + players */}
        {cs.currentMatch ? (
          <div className="w-full flex-1 flex flex-col items-center justify-center min-h-0 gap-0.5">
            {eventName && (
              <span className="inline-flex items-center gap-0.5 max-w-full bg-primary-600 text-white rounded px-1 py-0.5 leading-none">
                <span className="text-[8px] sm:text-[9px] font-bold truncate">{eventName}</span>
                {roundLabel && <span className="text-[8px] sm:text-[9px] font-black bg-white/25 rounded-sm px-0.5 shrink-0">{roundLabel}</span>}
              </span>
            )}
            <p className="text-[10px] sm:text-xs font-bold text-gray-900 truncate w-full text-center leading-tight">{cs.currentMatch.player1Name}</p>
            <p className="text-[8px] sm:text-[9px] font-medium text-primary-500 leading-none">vs</p>
            <p className="text-[10px] sm:text-xs font-bold text-gray-900 truncate w-full text-center leading-tight">{cs.currentMatch.player2Name}</p>
          </div>
        ) : cs.nextMatch ? (
          <div className="w-full flex-1 flex flex-col items-center justify-center min-h-0 gap-0.5">
            <p className="text-[9px] sm:text-[10px] font-semibold text-gray-500/80 truncate w-full text-center leading-none">次の試合</p>
            <p className="text-[10px] sm:text-xs font-bold text-gray-700 truncate w-full text-center leading-tight">{cs.nextMatch.player1Name}</p>
            <p className="text-[8px] sm:text-[9px] font-medium text-gray-400 leading-none">vs</p>
            <p className="text-[10px] sm:text-xs font-bold text-gray-700 truncate w-full text-center leading-tight">{cs.nextMatch.player2Name}</p>
          </div>
        ) : cs.status === 'unavailable' ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[10px] sm:text-xs text-gray-400 font-medium">使用不可</p>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[10px] sm:text-xs text-gray-400 font-medium">空き</p>
          </div>
        )}

        {/* Bottom: elapsed time */}
        {elapsed ? (
          <div className="w-full flex items-center justify-center gap-1">
            <Timer className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${isTimeOver ? 'text-red-600' : 'text-gray-700'}`} />
            <span className={`text-[10px] sm:text-xs font-mono font-bold tabular-nums ${isTimeOver ? 'text-red-700' : 'text-gray-800'}`}>{elapsed}</span>
          </div>
        ) : (
          <div className="h-3 sm:h-4" />
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function LiveDashboard() {
  const isMixedImported = useMixedStore(s => s.isImported);
  const isTeamImported = useTeamStore(s => s.isImported);

  if (isMixedImported) {
    return <MixedLiveCourtView />;
  }

  if (isTeamImported) {
    return <TeamLiveCourtView />;
  }

  return <LiveDashboardInner />;
}

function LiveDashboardInner() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const matchDuration = useAppStore(state => state.scheduleConfig.matchDuration);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());


  // Tick clock every second (for elapsed time display)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // -- Data queries --
  const tournaments = useLiveQuery(() => db.tournaments.toArray()) || [];
  const currentTournament = useMemo(
    () => tournaments.find(t => t.tournamentId === currentTournamentId),
    [tournaments, currentTournamentId]
  );

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const eventNameMap = useMemo(() => {
    const map = new Map<string, string>();
    events.forEach(e => map.set(e.eventId, e.name));
    return map;
  }, [events]);

  const eventIds = useMemo(() => events.map(e => e.eventId).sort().join(','), [events]);
  const allMatches = useLiveQuery(async () => {
    const ids = eventIds.split(',').filter(Boolean);
    if (ids.length === 0) return [];
    return db.matches.where('eventId').anyOf(ids).toArray();
  }, [eventIds]) || [];

  const courts = useLiveQuery(
    () => currentTournamentId ? db.courts.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const draws = useLiveQuery(
    () => {
      const ids = eventIds.split(',').filter(Boolean);
      if (ids.length === 0) return [];
      return db.draws.where('eventId').anyOf(ids).toArray();
    },
    [eventIds]
  ) || [];

  // 種目ごとの総ラウンド数（ラウンドバッジ用）。ドロー未取得時は最大ラウンドで補完。
  const eventTotalRounds = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      const draw = draws.find(d => d.eventId === e.eventId);
      let tr = draw && draw.drawSize ? Math.log2(draw.drawSize) : 0;
      if (!tr || !isFinite(tr)) {
        let mx = 1;
        for (const m of allMatches) if (m.eventId === e.eventId && m.round > mx) mx = m.round;
        tr = mx;
      }
      map.set(e.eventId, Math.max(1, tr));
    }
    return map;
  }, [events, draws, allMatches]);

  // 試合のラウンドバッジ（例: "1R" / "SF" / "F"）
  const roundLabelOf = useCallback((match: Match | null): string | undefined => {
    if (!match) return undefined;
    return shortRoundName(match.round, eventTotalRounds.get(match.eventId) || 1);
  }, [eventTotalRounds]);

  // -- Stats --
  const stats = useMemo(() => {
    const playing = allMatches.filter(m => m.status === 'playing');
    // 不戦勝(BYE)は実際に行う試合ではないので総数・完了数から除外する
    const finished = allMatches.filter(m => m.status === 'finished');
    const waiting = allMatches.filter(m => m.status === 'waiting' || m.status === 'ready');
    const total = allMatches.filter(m => m.status !== 'walkover').length;
    const progressPercent = total > 0 ? Math.round((finished.length / total) * 100) : 0;
    return { playing, finished, waiting, total, progressPercent };
  }, [allMatches]);

  // -- Schedule delay calculation --
  const scheduleDelay = useMemo(() => {
    const nowMins = currentTime.getHours() * 60 + currentTime.getMinutes();

    // Find the latest scheduled match that should have started by now but hasn't
    const scheduledMatches = allMatches.filter(m => m.scheduledTime);
    if (scheduledMatches.length === 0) return null;

    // Count matches that are behind schedule
    let maxDelay = 0;
    let behindCount = 0;
    for (const m of scheduledMatches) {
      if (!m.scheduledTime) continue;
      const scheduledMins = timeToMinutes(m.scheduledTime);
      if (scheduledMins <= nowMins && (m.status === 'waiting' || m.status === 'ready')) {
        const delay = nowMins - scheduledMins;
        if (delay > maxDelay) maxDelay = delay;
        behindCount++;
      }
    }

    // Also check if we're ahead: next scheduled match vs current time
    const nextScheduled = scheduledMatches
      .filter(m => m.scheduledTime && timeToMinutes(m.scheduledTime) > nowMins && m.status !== 'finished' && m.status !== 'walkover')
      .sort((a, b) => timeToMinutes(a.scheduledTime!) - timeToMinutes(b.scheduledTime!));

    const nextTime = nextScheduled[0]?.scheduledTime;
    const nextMins = nextTime ? timeToMinutes(nextTime) : null;

    return {
      maxDelay,
      behindCount,
      nextScheduledTime: nextTime,
      minutesUntilNext: nextMins !== null ? nextMins - nowMins : null,
      isOnSchedule: maxDelay <= 10 && behindCount === 0,
    };
  }, [allMatches, currentTime]);

  // ライブスコアを配信中のコート（コートマップに配信バッジを出すため）
  const liveScores = useLiveQuery(() => db.liveScores.toArray(), []) || [];
  const broadcastingCourtIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of liveScores) {
      if (l.status === 'live' && l.courtId) ids.add(l.courtId);
    }
    return ids;
  }, [liveScores]);

  // -- Court status --
  const courtStatusList = useMemo((): CourtStatus[] => {
    return courts
      .sort((a, b) => a.order - b.order)
      .map(court => {
        const courtMatches = allMatches.filter(m => m.courtId === court.courtId);
        const currentMatch = courtMatches.find(m => m.status === 'playing') || null;
        const nextMatch = courtMatches.find(m =>
          (m.status === 'ready' || m.status === 'waiting') && m.player1Name && m.player2Name
        ) || null;

        let status: CourtStatus['status'] = 'empty';
        if (!court.isAvailable) status = 'unavailable';
        else if (currentMatch) status = 'playing';
        else if (nextMatch) status = 'ready';

        return {
          court, currentMatch, nextMatch,
          matchCount: courtMatches.length,
          status,
          isBroadcasting: broadcastingCourtIds.has(court.courtId),
        };
      });
  }, [courts, allMatches, broadcastingCourtIds]);

  // Time-over courts (elapsed > matchDuration)
  const timeOverCourtIds = useMemo(() => {
    const now = Date.now();
    const limitMs = matchDuration * 60 * 1000;
    const ids = new Set<string>();
    for (const cs of courtStatusList) {
      if (cs.currentMatch?.status === 'playing' && cs.currentMatch.updatedAt) {
        if (now - cs.currentMatch.updatedAt > limitMs) {
          ids.add(cs.court.courtId);
        }
      }
    }
    return ids;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtStatusList, matchDuration, currentTime]);

  const courtStats = useMemo(() => ({
    broadcasting: courtStatusList.filter(c => c.isBroadcasting).length,
    playing: courtStatusList.filter(c => c.status === 'playing').length,
    ready: courtStatusList.filter(c => c.status === 'ready').length,
    empty: courtStatusList.filter(c => c.status === 'empty').length,
    unavailable: courtStatusList.filter(c => c.status === 'unavailable').length,
  }), [courtStatusList]);

  // -- Group courts into blocks of 4 (venue-style layout) --
  const courtBlocks = useMemo(() => {
    const blocks: CourtStatus[][] = [];
    for (let i = 0; i < courtStatusList.length; i += 4) {
      blocks.push(courtStatusList.slice(i, i + 4));
    }
    return blocks;
  }, [courtStatusList]);

  // HQ position: after block index 1 (between courts 5-8 and 9-12) for 16-court venues
  const hqAfterBlock = courtBlocks.length >= 4 ? 1 : -1;

  // -- Event progress --
  const eventProgress = useMemo(() => {
    return events.map(e => {
      const eventMatches = allMatches.filter(m => m.eventId === e.eventId);
      // 不戦勝(BYE)は実際に行う試合ではないので総数・完了数から除外する（全体statsと同じ基準）。
      // これを含めると、実試合が1つも終わっていないのに完了率が上がって「既に進行済み」に見えてしまう。
      const finished = eventMatches.filter(m => m.status === 'finished').length;
      const total = eventMatches.filter(m => m.status !== 'walkover').length;
      const playing = eventMatches.filter(m => m.status === 'playing').length;
      const draw = draws.find(d => d.eventId === e.eventId);
      const totalRounds = draw ? Math.log2(draw.drawSize) : 1;
      const maxRound = eventMatches.reduce((max, m) =>
        (m.status === 'finished' || m.status === 'playing') && m.round > max ? m.round : max, 0);
      const roundName = maxRound > 0 ? getRoundName(maxRound, totalRounds) : '-';
      return { event: e, finished, total, playing, percent: total > 0 ? Math.round((finished / total) * 100) : 0, roundName };
    });
  }, [events, allMatches, draws]);

  // -- Court detail --
  const selectedDetail = useMemo(() => {
    if (!selectedCourtId) return null;
    return courtStatusList.find(c => c.court.courtId === selectedCourtId) || null;
  }, [selectedCourtId, courtStatusList]);

  const selectedCourtMatches = useMemo(() => {
    if (!selectedDetail) return [];
    return allMatches
      .filter(m => m.courtId === selectedDetail.court.courtId)
      .sort((a, b) => a.matchOrder - b.matchOrder);
  }, [selectedDetail, allMatches]);

  const getEventName = (eventId: string) => events.find(e => e.eventId === eventId)?.name || '';

  const timeStr = currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });


  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="dld container sk-page sk-page--wide">
      {/* ===== HEADER（大会名と現在時刻） ===== */}
      <header className="dld-clock rv-in">
        <div className="dld-clock__titles">
          <p className="dld-clock__en"><BarChart2 className="w-3.5 h-3.5" />LIVE DASHBOARD</p>
          <h1 className="dld-clock__title">ライブダッシュボード</h1>
          <p className="dld-clock__sub">
            {currentTournament ? currentTournament.name : '大会を選択してください'}
          </p>
        </div>
        {/* Current time */}
        <div className="dld-clock__time">
          <div className="dld-clock__hm">{timeStr}</div>
          <div className="dld-clock__date">
            {currentTime.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
          </div>
        </div>
      </header>

      {/* ===== TOP ROW: Donut + Stats + Schedule ===== */}
      <section className={`dld-summary ${scheduleDelay ? 'has-schedule' : ''}`}>
        {/* Donut chart */}
        <div className="dld-summary__donut">
          <DonutChart
            percent={stats.progressPercent}
            playing={stats.playing.length}
            finished={stats.finished.length}
            total={stats.total}
          />
          <div className="dld-legend">
            <span><i className="is-done" />終了</span>
            <span><i className="is-live" />試合中</span>
            <span><i className="is-wait" />待機</span>
          </div>
        </div>

        {/* Summary cards */}
        <div className="dld-stats">
          <StatCard icon={Users} label="全試合数" value={stats.total} color="gray" />
          <StatCard icon={Play} label="試合中" value={stats.playing.length} color="accent" />
          <StatCard icon={CheckCircle} label="終了" value={stats.finished.length} color="ink" />
          <StatCard icon={Clock} label="待機中" value={stats.waiting.length} color="gray" />
        </div>

        {/* Schedule delay indicator */}
        {scheduleDelay && (
          <div className="dld-sched">
            <p className="dld-sched__head">
              <Timer className="w-4 h-4" />
              スケジュール状況
            </p>
            {scheduleDelay.isOnSchedule ? (
              <p className="dld-sched__state"><i className="is-pulse" />予定通り</p>
            ) : scheduleDelay.maxDelay > 0 ? (
              <div>
                <p className="dld-sched__state is-late">
                  <i />{minutesToDisplay(scheduleDelay.maxDelay)}
                </p>
                <p className="dld-sched__note">
                  {scheduleDelay.behindCount}試合が遅れています
                </p>
              </div>
            ) : (
              <p className="dld-sched__state"><i />予定通り</p>
            )}
            {scheduleDelay.nextScheduledTime && (
              <div className="dld-sched__next">
                <p className="dld-sched__note">次の予定</p>
                <p className="dld-sched__time">{scheduleDelay.nextScheduledTime}</p>
                {scheduleDelay.minutesUntilNext !== null && (
                  <p className="dld-sched__note">あと{scheduleDelay.minutesUntilNext}分</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===== COURT MAP ===== */}
      {courtStatusList.length > 0 && (
        <SkSection
          en="Court Map"
          title="コートマップ"
          actions={(
            <div className="dld-legend dld-legend--map">
              {courtStats.broadcasting > 0 && (
                <span className="is-broadcast">
                  <Radio className="w-3 h-3" />
                  ライブ配信 {courtStats.broadcasting}
                </span>
              )}
              <span><i className="is-live" />試合中 {courtStats.playing}</span>
              <span><i className="is-ready" />準備 {courtStats.ready}</span>
              <span><i className="is-free" />空き {courtStats.empty}</span>
              {courtStats.unavailable > 0 && (
                <span><i className="is-off" />不可 {courtStats.unavailable}</span>
              )}
            </div>
          )}
        >
          {/* === PC縦列レイアウト (md以上) — ブロックを縦列で左→右に配置 === */}
          <div className="hidden md:flex items-start gap-0 justify-center w-full">
            {courtBlocks.map((block, blockIdx) => (
              <div key={blockIdx} className="flex items-start">
                {/* ブロック: コートを縦に並べる（番号降順：上が大きい） */}
                <div className="dld-block">
                  <div className="dld-block__label">
                    {block[block.length - 1]?.court.name.replace(/[^\d]/g, '') || (blockIdx * 4 + block.length)}〜{block[0]?.court.name.replace(/[^\d]/g, '') || (blockIdx * 4 + 1)}
                  </div>
                  {/* 対戦情報の有無でカード幅が変わらないよう、全ブロックを同じ幅に揃える */}
                  <div className="flex flex-col gap-2 w-[224px]">
                    {[...block].reverse().map(cs => {
                      const match = cs.currentMatch || cs.nextMatch;
                      const evtName = match ? eventNameMap.get(match.eventId) : undefined;
                      return (
                        <TennisCourtBlockH
                          key={cs.court.courtId}
                          cs={cs}
                          isSelected={selectedCourtId === cs.court.courtId}
                          onSelect={() => setSelectedCourtId(
                            selectedCourtId === cs.court.courtId ? null : cs.court.courtId
                          )}
                          eventName={evtName}
                          roundLabel={roundLabelOf(cs.currentMatch)}
                          isTimeOver={timeOverCourtIds.has(cs.court.courtId)}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* 本部表示（指定ブロックの後 = 5と9の間） */}
                {blockIdx === hqAfterBlock && (
                  <div className="flex flex-col items-center justify-end mx-2 self-end pb-3">
                    <div className="dld-hq dld-hq--v">
                      <i />
                      <span className="[writing-mode:vertical-rl]">本部</span>
                    </div>
                  </div>
                )}

                {/* 通路表示（ブロック間、本部以外） */}
                {blockIdx !== hqAfterBlock && blockIdx < courtBlocks.length - 1 && (
                  <div className="flex flex-col items-center justify-center mx-1 self-center">
                    <div className="h-16 border-l border-dashed border-gray-300" />
                    <span className="text-[9px] text-gray-400 my-1">通路</span>
                    <div className="h-16 border-l border-dashed border-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* === モバイル縦向きレイアウト (md未満) === */}
          <div className="md:hidden flex flex-col gap-2 items-center">
            {courtBlocks.map((block, blockIdx) => (
              <div key={blockIdx} className="contents">
                <div className="dld-block w-full max-w-lg">
                  <div className="dld-block__label dld-block__label--left">
                    {block[0]?.court.name.replace(/[^\d]/g, '') || (blockIdx * 4 + 1)}〜{block[block.length - 1]?.court.name.replace(/[^\d]/g, '') || (blockIdx * 4 + block.length)}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {block.map(cs => {
                      const match = cs.currentMatch || cs.nextMatch;
                      const evtName = match ? eventNameMap.get(match.eventId) : undefined;
                      return (
                        <TennisCourtBlock
                          key={cs.court.courtId}
                          cs={cs}
                          isSelected={selectedCourtId === cs.court.courtId}
                          onSelect={() => setSelectedCourtId(
                            selectedCourtId === cs.court.courtId ? null : cs.court.courtId
                          )}
                          eventName={evtName}
                          roundLabel={roundLabelOf(cs.currentMatch)}
                          isTimeOver={timeOverCourtIds.has(cs.court.courtId)}
                        />
                      );
                    })}
                  </div>
                </div>
                {blockIdx === hqAfterBlock && (
                  <div className="flex items-center gap-2 py-1 w-full max-w-lg justify-center">
                    <div className="flex-1 h-px bg-[var(--gray-300)]" />
                    <div className="dld-hq"><i /><span>本部</span></div>
                    <div className="flex-1 h-px bg-[var(--gray-300)]" />
                  </div>
                )}
                {blockIdx < courtBlocks.length - 1 && blockIdx !== hqAfterBlock && (
                  <div className="flex items-center gap-2 w-full max-w-lg">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[9px] text-gray-400">通路</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </SkSection>
      )}

      {/* ===== COURT DETAIL ===== */}
      {selectedDetail && (
        <SkSection
          accent
          className="dld-detail"
          en="Court"
          title={selectedDetail.court.name}
          actions={(
            <>
              {selectedDetail.isBroadcasting && (
                <span className="sk-chip sk-chip--red">
                  <Radio className="w-3 h-3" />ライブスコア配信中
                </span>
              )}
              <span className={`sk-chip ${selectedDetail.status === 'playing' ? 'sk-chip--ink' : ''}`}>
                {selectedDetail.status === 'playing' && <Play className="w-3 h-3" />}
                {selectedDetail.status === 'ready' && <Clock className="w-3 h-3" />}
                {selectedDetail.status === 'unavailable' && <AlertCircle className="w-3 h-3" />}
                {selectedDetail.status === 'playing' ? '試合中' : selectedDetail.status === 'ready' ? '次の試合あり' : selectedDetail.status === 'unavailable' ? '使用不可' : '空き'}
              </span>
              <span className="dld-muted">{selectedDetail.matchCount}試合割当</span>
              <button
                onClick={() => setSelectedCourtId(null)}
                className="btn btn--outline sk-btn sk-btn--sm"
              >
                閉じる
              </button>
            </>
          )}
        >
          {selectedDetail.currentMatch && (
            <div className="dld-now">
              <div className="dld-now__label">
                <Play className="w-3 h-3" /> 現在の試合
                <span>{getEventName(selectedDetail.currentMatch.eventId)}</span>
              </div>
              <div className="dld-now__vs">
                <b>{selectedDetail.currentMatch.player1Name}</b>
                <em>VS</em>
                <b>{selectedDetail.currentMatch.player2Name}</b>
                {selectedDetail.currentMatch.score && (
                  <span className="dld-score">{selectedDetail.currentMatch.score}</span>
                )}
              </div>
            </div>
          )}

          {selectedCourtMatches.length > 0 && (
            <ul className="dld-mlist">
              {selectedCourtMatches.map(m => (
                <li key={m.matchId} className={m.status === 'playing' ? 'is-live' : ''}>
                  <span className="dld-mlist__evt">{getEventName(m.eventId)}</span>
                  <span className="dld-mlist__p">{m.player1Name}</span>
                  <span className="dld-mlist__vs">vs</span>
                  <span className="dld-mlist__p">{m.player2Name}</span>
                  {m.score && <span className="dld-score">{m.score}</span>}
                  <span className={`dl-tag ${
                    m.status === 'playing' ? 'dl-tag--live' :
                    m.status === 'finished' || m.status === 'walkover' ? 'dl-tag--done' : ''
                  }`}>
                    {m.status === 'playing' ? '試合中' :
                     m.status === 'finished' ? '終了' :
                     m.status === 'walkover' ? 'W.O' :
                     m.status === 'ready' ? '準備完了' : '待機'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SkSection>
      )}

      {/* ===== EVENT PROGRESS ===== */}
      {eventProgress.length > 0 && (
        <SkSection en="Progress" title="種目別進行" count={`${eventProgress.length}種目`} flush>
          <ul className="dld-events">
            {eventProgress.map(ep => (
              <li key={ep.event.eventId}>
                <div className="dld-events__top">
                  <h3>{ep.event.name}</h3>
                  {ep.playing > 0 && (
                    <span className="dl-playing">
                      <i className="dld-pulse" />
                      {ep.playing}試合中
                    </span>
                  )}
                </div>

                {/* Mini donut + stats */}
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--gray-200)" strokeWidth="4" />
                      <circle
                        cx="18" cy="18" r="14" fill="none" stroke="var(--ink)" strokeWidth="4"
                        strokeDasharray={`${(ep.percent / 100) * 88} ${88 - (ep.percent / 100) * 88}`}
                        className="transition-all duration-500"
                      />
                    </svg>
                    <span className="dld-events__pct">
                      {ep.percent}%
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="dld-events__meta">
                      <span>{ep.finished}/{ep.total} 完了</span>
                      <b>{ep.roundName}</b>
                    </div>
                    <div className="dl-progress__track">
                      <div className="dl-progress__fill" style={{ width: `${ep.percent}%` }} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SkSection>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: 'accent' | 'ink' | 'gray';
}) {
  // 進行中は赤、終了は墨、その他はグレー。差し色は赤ひとつに絞る。
  return (
    <div className={`dld-stat dld-stat--${color}`}>
      <div className="dld-stat__label">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className="dld-stat__value">{value}</p>
    </div>
  );
}
