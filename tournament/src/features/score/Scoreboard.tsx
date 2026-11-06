import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import ScoreboardBracket from './ScoreboardBracket';
import ScoreboardLeague from './ScoreboardLeague';
import SiteDialog from '../../components/site/SiteDialog';
import { SkEmpty } from '../../components/site/Kit';
import ScoreInputDialog from './ScoreInputDialog';
import type { ScoreInputMatch } from './ScoreInputDialog';
import { resolveRequiredGames } from './gameRules';
import { refreshBracketProgress } from '../draw/rebuildMatches';
import type { Event, RoundGameRule, MatchFormatType } from '../../db/database';
import {
  MonitorPlay,
  Check,
  Play,
  RotateCcw,
  GitBranch,
  LayoutGrid,
  Table2,
  ChevronLeft,
  ChevronRight,
  Printer,
  MapPin,
  Layers,
  Eye,
  Trophy,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';
import { useMixedStore } from '../mixed/mixedStore';
import MixedScoreView from '../mixed/MixedScoreView';
import { useTeamStore } from '../team/teamStore';
import TeamScoreView from '../team/TeamScoreView';
import { siteConfirm } from '../../components/site/siteConfirm';
import { sortEventsByClass } from '../data/eventOrder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

/** 回戦に応じたゲームルール情報を取得 */
function getGameRuleForRound(evt: Event | undefined, round: number, totalRounds: number): RoundGameRule | null {
  if (!evt) return null;
  const rules: RoundGameRule[] = evt.roundGameRules || [];
  if (rules.length === 0) return null;
  if (rules.length === 1) return rules[0];
  const roundName = getRoundName(round, totalRounds);
  for (const rule of rules) {
    const label = rule.roundLabel;
    if (label === '全回戦') continue;
    const rangeMatch = label.match(/(\d+)～(\d+)回戦/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1]), to = parseInt(rangeMatch[2]);
      if (round >= from && round <= to) return rule;
      continue;
    }
    if (label.includes('以降')) {
      const cleanLabel = label.replace('以降', '');
      if (cleanLabel.includes('準々決勝') && round >= totalRounds - 2) return rule;
      if (cleanLabel.includes('準決勝') && round >= totalRounds - 1) return rule;
      if (cleanLabel.includes('決勝') && !cleanLabel.includes('準') && round >= totalRounds) return rule;
      const roundNumMatch = cleanLabel.match(/(\d+)回戦/);
      if (roundNumMatch && round >= parseInt(roundNumMatch[1])) return rule;
      continue;
    }
    if (roundName === label || label.includes(roundName)) return rule;
  }
  return rules[0];
}

function getGameRuleText(evt: Event | undefined, round: number, totalRounds: number): string {
  const rule = getGameRuleForRound(evt, round, totalRounds);
  if (rule) return rule.ruleText;
  const g = evt?.gameRules?.games ?? 6;
  return `${g}ゲームマッチ（${g}-${g}タイブレーク）`;
}

function getMatchFormat(evt: Event | undefined, round: number, totalRounds: number): MatchFormatType {
  const rule = getGameRuleForRound(evt, round, totalRounds);
  return rule?.matchFormat || 'game';
}

/** フルネームから苗字を抽出（ダブルス "A / B" にも対応） */
function getSurname(name: string): string {
  if (!name) return '';
  if (name.includes('/') || name.includes('／')) {
    return name.split(/[/／]/).map(n => getSurname(n.trim())).join('/');
  }
  const parts = name.trim().split(/\s+/);
  return parts[0] || name;
}

/** 経過時間を H:MM 形式で返す */
function formatElapsedMinutes(startedAt: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// View modes
// ---------------------------------------------------------------------------
type ViewMode = 'bracket' | 'table';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Scoreboard() {
  const isMixedImported = useMixedStore(s => s.isImported);
  const isTeamImported = useTeamStore(s => s.isImported);

  if (isMixedImported) {
    return <MixedScoreView />;
  }
  if (isTeamImported) {
    return <TeamScoreView />;
  }

  return <NormalScoreboard />;
}

function NormalScoreboard() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const matchDuration = useAppStore(state => state.scheduleConfig.matchDuration);

  // -- Event navigation (前種目/次種目) --
  const [selectedEventIdx, setSelectedEventIdx] = useState<number>(-1);
  const [showAllEvents, setShowAllEvents] = useState(true); // デフォルト: 全種目表示
  const [viewMode, setViewMode] = useState<ViewMode>('bracket');
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);
  const [selectedAllEventId, setSelectedAllEventId] = useState<string | null>(null); // 全種目表示時の選択中種目
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const initializedRef = useRef(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // スクロールでヘッダーを非表示にする
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const y = container.scrollTop;
      if (y > lastScrollY.current && y > 50) {
        setHeaderVisible(false);
      }
      lastScrollY.current = y;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // -- Data queries --
  const events = useLiveQuery(
    () => currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray().then(sortEventsByClass)
      : [],
    [currentTournamentId]
  ) || [];

  const selectedEventId = events[selectedEventIdx]?.eventId || '';
  const eventIds = useMemo(() => events.map(e => e.eventId), [events]);

  const matches = useLiveQuery(
    () => selectedEventId
      ? db.matches.where('eventId').equals(selectedEventId).toArray()
      : [],
    [selectedEventId]
  ) || [];

  // 全種目表示用: 全イベントの試合データ
  const allMatches = useLiveQuery(
    () => eventIds.length > 0
      ? db.matches.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const courts = useLiveQuery(
    () => currentTournamentId
      ? db.courts.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];

  // 全種目表示用: 全イベントのドローデータ
  const allDrawsData = useLiveQuery(
    () => eventIds.length > 0
      ? db.draws.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const drawData = useLiveQuery(
    () => selectedEventId
      ? db.draws.where('eventId').equals(selectedEventId).first()
      : undefined,
    [selectedEventId]
  );

  // 全種目表示用: 全イベントのエントリーデータ
  const allEntries = useLiveQuery(
    () => eventIds.length > 0
      ? db.entries.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const entries = useLiveQuery(
    () => selectedEventId
      ? db.entries.where('eventId').equals(selectedEventId).toArray()
      : [],
    [selectedEventId]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];

  // -- 経過時間表示用タイマー（30秒ごと更新） --
  const [clockTick, setClockTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClockTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // -- Default: 全種目表示。個別表示に切り替えた場合のみidx選択 --
  useEffect(() => {
    if (initializedRef.current) return;
    if (events.length === 0) return;
    if (!showAllEvents) {
      const idx = events.length >= 2 ? events.length - 2 : events.length - 1;
      setSelectedEventIdx(idx);
    }
    initializedRef.current = true;
  }, [events, showAllEvents]);

  // -- Build draw slot data --
  const editedSlots: DrawSlotData[] = useMemo(() => {
    if (!drawData?.slots) return [];
    return drawData.slots
      .map(s => {
        let name = 'BYE';
        let affiliation = '';
        if (!s.isBye && s.entryId) {
          const entry = entries.find(e => e.entryId === s.entryId);
          if (entry) {
            const p1 = players.find(p => p.playerId === entry.playerId);
            const isDoubles = !!entry.partnerId;
            const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;
            name = isDoubles && p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
            affiliation = isDoubles && p1 && p2 && p1.affiliation !== p2.affiliation
              ? `${p1.affiliation} / ${p2.affiliation}`
              : (p1?.affiliation || '');
          }
        }
        return { position: s.position, entryId: s.entryId, seed: s.seed, isBye: s.isBye, name, affiliation };
      })
      .sort((a, b) => a.position - b.position);
  }, [drawData, entries, players]);

  // -- Match results for bracket/league --
  const matchResults: MatchResult[] = useMemo(() =>
    matches.map(m => {
      const court = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
      return {
        round: m.round,
        position: m.position,
        player1Name: m.player1Name,
        player2Name: m.player2Name,
        winnerEntryId: m.winnerEntryId,
        player1EntryId: m.player1EntryId,
        player2EntryId: m.player2EntryId,
        score: m.score,
        status: m.status,
        courtId: m.courtId,
        courtName: court?.name || '',
        scheduledTime: m.scheduledTime,
        updatedAt: m.updatedAt,
      };
    }),
    [matches, courts]
  );

  // -- Detect round-robin vs tournament --
  const isRoundRobin = useMemo(() => {
    if (!drawData) return false;
    if (drawData.drawType === 'roundRobin') return true;
    if (drawData.drawType === 'tournament') return false;
    const realPlayers = editedSlots.filter(s => !s.isBye);
    return realPlayers.length >= 2 && realPlayers.length <= 5 && drawData.drawSize <= 8;
  }, [drawData, editedSlots]);

  // -- 全種目表示用ヘルパー: 種目ごとのデータ構築 --
  const perEventData = useMemo(() => {
    if (!showAllEvents) return [];
    return events.map(evt => {
      const evtMatches = allMatches.filter(m => m.eventId === evt.eventId);
      const evtDraw = allDrawsData.find(d => d.eventId === evt.eventId);
      const evtEntries = allEntries.filter(e => e.eventId === evt.eventId);

      const evtSlots: DrawSlotData[] = evtDraw?.slots
        ? evtDraw.slots.map(s => {
            let name = 'BYE';
            let affiliation = '';
            if (!s.isBye && s.entryId) {
              const entry = evtEntries.find(e => e.entryId === s.entryId);
              if (entry) {
                const p1 = players.find(p => p.playerId === entry.playerId);
                const isDoubles = !!entry.partnerId;
                const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;
                name = isDoubles && p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
                affiliation = isDoubles && p1 && p2 && p1.affiliation !== p2.affiliation
                  ? `${p1.affiliation} / ${p2.affiliation}`
                  : (p1?.affiliation || '');
              }
            }
            return { position: s.position, entryId: s.entryId, seed: s.seed, isBye: s.isBye, name, affiliation };
          }).sort((a, b) => a.position - b.position)
        : [];

      const evtMatchResults: MatchResult[] = evtMatches.map(m => {
        const court = m.courtId ? courts.find(c => c.courtId === m.courtId) : null;
        return {
          round: m.round, position: m.position,
          player1Name: m.player1Name, player2Name: m.player2Name,
          winnerEntryId: m.winnerEntryId,
          player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
          score: m.score, status: m.status, courtId: m.courtId,
          courtName: court?.name || '', scheduledTime: m.scheduledTime,
          updatedAt: m.updatedAt,
        };
      });

      const realPlayers = evtSlots.filter(s => !s.isBye);
      const evtIsRoundRobin = evtDraw
        ? (evtDraw.drawType === 'roundRobin' ||
           (evtDraw.drawType !== 'tournament' && realPlayers.length >= 2 && realPlayers.length <= 5 && evtDraw.drawSize <= 8))
        : false;

      const total = evtMatches.filter(m => m.player1Name && m.player2Name && m.status !== 'walkover').length;
      const finished = evtMatches.filter(m => m.status === 'finished').length;
      const playing = evtMatches.filter(m => m.status === 'playing').length;
      const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

      return {
        event: evt,
        matches: evtMatches,
        draw: evtDraw,
        slots: evtSlots,
        matchResults: evtMatchResults,
        isRoundRobin: evtIsRoundRobin,
        totalRounds: evtDraw ? Math.log2(evtDraw.drawSize) : 1,
        progress: { total, finished, playing, pct },
      };
    }).filter(d => d.matches.length > 0);
  }, [showAllEvents, events, allMatches, allDrawsData, allEntries, players, courts]);

  // -- 全種目表示時の選択中マッチ --
  const selectedAllMatch: ScoreInputMatch | null = useMemo(() => {
    if (!showAllEvents || !selectedMatchKey || !selectedAllEventId) return null;
    const evtData = perEventData.find(d => d.event.eventId === selectedAllEventId);
    if (!evtData) return null;

    const buildMatch = (m: typeof allMatches[0]): ScoreInputMatch => ({
      matchId: m.matchId, dbId: m.id!, round: m.round, position: m.position,
      matchOrder: m.matchOrder, player1Name: m.player1Name, player2Name: m.player2Name,
      player1Affiliation: m.player1Affiliation, player2Affiliation: m.player2Affiliation,
      player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
      score: m.score, winnerEntryId: m.winnerEntryId, courtId: m.courtId,
      status: m.status, scheduledTime: m.scheduledTime,
      eventName: evtData.event.name, updatedAt: m.updatedAt,
    });

    // bracket key: "round-position"
    const parts = selectedMatchKey.split('-');
    if (parts.length === 2) {
      const round = parseInt(parts[0]);
      const position = parseInt(parts[1]);
      if (!isNaN(round) && !isNaN(position)) {
        const m = evtData.matches.find(mt => mt.round === round && mt.position === position);
        if (m) return buildMatch(m);
      }
    }
    // league key: "entryId1-entryId2"
    const lm = evtData.matches.find(m => {
      const k1 = `${m.player1EntryId}-${m.player2EntryId}`;
      const k2 = `${m.player2EntryId}-${m.player1EntryId}`;
      return selectedMatchKey === k1 || selectedMatchKey === k2;
    });
    if (lm) return buildMatch(lm);
    return null;
  }, [showAllEvents, selectedMatchKey, selectedAllEventId, perEventData, allMatches]);

  // -- Total rounds for round name --
  const totalRounds = drawData ? Math.log2(drawData.drawSize) : 1;
  const makeRoundName = useCallback(
    (round: number) => getRoundName(round, totalRounds),
    [totalRounds]
  );

  // -- Selected match for action panel --
  const selectedMatch: ScoreInputMatch | null = useMemo(() => {
    if (!selectedMatchKey) return null;

    const buildMatch = (m: typeof matches[0]): ScoreInputMatch => {
      const event = events[selectedEventIdx];
      return {
        matchId: m.matchId, dbId: m.id!, round: m.round, position: m.position,
        matchOrder: m.matchOrder, player1Name: m.player1Name, player2Name: m.player2Name,
        player1Affiliation: m.player1Affiliation, player2Affiliation: m.player2Affiliation,
        player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
        score: m.score, winnerEntryId: m.winnerEntryId, courtId: m.courtId,
        status: m.status, scheduledTime: m.scheduledTime,
        eventName: event?.name || '', updatedAt: m.updatedAt,
      };
    };

    // For bracket: key is "round-position"
    const bracketParts = selectedMatchKey.split('-');
    if (bracketParts.length === 2) {
      const round = parseInt(bracketParts[0]);
      const position = parseInt(bracketParts[1]);
      if (!isNaN(round) && !isNaN(position)) {
        const m = matches.find(mt => mt.round === round && mt.position === position);
        if (m) return buildMatch(m);
      }
    }

    // For league: key is "entryId1-entryId2"
    const leagueMatch = matches.find(m => {
      const k1 = `${m.player1EntryId}-${m.player2EntryId}`;
      const k2 = `${m.player2EntryId}-${m.player1EntryId}`;
      return selectedMatchKey === k1 || selectedMatchKey === k2;
    });
    if (leagueMatch) return buildMatch(leagueMatch);

    return null;
  }, [selectedMatchKey, matches, events, selectedEventIdx]);

  // -- Match status groups for table view --
  const activeMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'playing')
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  const waitingMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'waiting' && m.player1Name && m.player2Name)
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  const finishedMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'finished' || m.status === 'walkover')
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  // -- Court status summary --
  const courtStatus = useMemo(() => {
    const src = showAllEvents ? allMatches : matches;
    const playing = src.filter(m => m.status === 'playing');
    return courts
      .sort((a, b) => a.order - b.order)
      .map(c => {
        const currentMatch = playing.find(m => m.courtId === c.courtId);
        if (!currentMatch) return { ...c, matchInfo: null as string | null, startedAt: 0, eventName: '' };
        const evt = events.find(e => e.eventId === currentMatch.eventId);
        return {
          ...c,
          matchInfo: `${getSurname(currentMatch.player1Name)} vs ${getSurname(currentMatch.player2Name)}`,
          startedAt: currentMatch.updatedAt || 0,
          eventName: evt?.name || '',
        };
      });
  }, [courts, matches, showAllEvents, allMatches, events]);

  // -- 使用中コートの判定（playing/ready で courtId が割り当て済み） --
  const occupiedCourtIds = useMemo(() => {
    const src = showAllEvents ? allMatches : matches;
    return new Set(
      src
        .filter(m => (m.status === 'playing' || m.status === 'ready') && m.courtId)
        .map(m => m.courtId!)
    );
  }, [showAllEvents, allMatches, matches]);

  // -- Event navigation handlers --
  const handlePrevEvent = () => {
    if (selectedEventIdx > 0) {
      setSelectedEventIdx(selectedEventIdx - 1);
      setSelectedMatchKey(null);
    }
  };

  const handleNextEvent = () => {
    if (selectedEventIdx < events.length - 1) {
      setSelectedEventIdx(selectedEventIdx + 1);
      setSelectedMatchKey(null);
    }
  };

  // -- Table view: legacy match operations --

  const handleFinishMatch = async (matchId: string, winnerNum: 1 | 2) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const match = matches.find(m => m.matchId === matchId);
      if (!match?.id) return;

      const winnerEntryId = winnerNum === 1 ? match.player1EntryId : match.player2EntryId;
      await db.matches.update(match.id, {
        status: 'finished',
        score: scoreInput || '(スコア未入力)',
        winnerEntryId,
        updatedAt: Date.now()
      });

      // 次ラウンドへの自動進出（リーグ戦では不要）
      if (!isRoundRobin) {
        const nextRound = match.round + 1;
        const nextPosition = Math.ceil(match.position / 2);
        const nextMatch = await db.matches
          .where('eventId').equals(match.eventId)
          .filter(m => m.round === nextRound && m.position === nextPosition)
          .first();

        if (nextMatch?.id) {
          const winnerName = winnerNum === 1 ? match.player1Name : match.player2Name;
          const winnerAff = winnerNum === 1 ? match.player1Affiliation : match.player2Affiliation;
          const isUpper = match.position % 2 === 1;
          await db.matches.update(nextMatch.id, {
            ...(isUpper
              ? { player1EntryId: winnerEntryId, player1Name: winnerName, player1Affiliation: winnerAff }
              : { player2EntryId: winnerEntryId, player2Name: winnerName, player2Affiliation: winnerAff }
            ),
            updatedAt: Date.now()
          });
        }
        // 勝ち上がり・3位決定戦の顔ぶれを整える
        await refreshBracketProgress(match.eventId);
      }

      setEditingMatchId(null);
      setScoreInput('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetMatch = async (matchId: string) => {
    if (isProcessing) return;
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    if (!(await siteConfirm('この試合を待機状態に戻しますか？'))) return;
    setIsProcessing(true);
    try {
      // 次ラウンドのクリア（リーグ戦では不要）
      if (!isRoundRobin) {
        const nextRound = match.round + 1;
        const nextPosition = Math.ceil(match.position / 2);
        const nextMatch = await db.matches
          .where('eventId').equals(match.eventId)
          .filter(m => m.round === nextRound && m.position === nextPosition)
          .first();

        if (nextMatch?.id) {
          const isUpper = match.position % 2 === 1;
          await db.matches.update(nextMatch.id, {
            ...(isUpper
              ? { player1EntryId: null, player1Name: '', player1Affiliation: '' }
              : { player2EntryId: null, player2Name: '', player2Affiliation: '' }
            ),
            updatedAt: Date.now()
          });
        }
      }

      await db.matches.update(match.id, {
        status: 'waiting',
        score: '',
        winnerEntryId: null,
        updatedAt: Date.now()
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignCourt = async (matchId: string, courtId: string) => {
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    await db.matches.update(match.id, { courtId: courtId || null, updatedAt: Date.now() });
  };

  const getCourtName = (courtId: string | null) => {
    if (!courtId) return '';
    return courts.find(c => c.courtId === courtId)?.name || courtId;
  };

  // -- Bracket/league selection handlers --
  const handleBracketMatchSelect = (round: number, position: number) => {
    const key = `${round}-${position}`;
    setSelectedMatchKey(prev => prev === key ? null : key);
  };

  const handleLeagueMatchSelect = (entryId1: string, entryId2: string) => {
    const key = `${entryId1}-${entryId2}`;
    setSelectedMatchKey(prev => {
      // Check both directions
      const altKey = `${entryId2}-${entryId1}`;
      if (prev === key || prev === altKey) return null;
      return key;
    });
  };

  // -- Print entire bracket --
  const handlePrintBracket = () => {
    window.print();
  };

  // -- Progress stats --
  const progressStats = useMemo(() => {
    const total = matches.filter(m => m.player1Name && m.player2Name && m.status !== 'walkover').length;
    const finished = matches.filter(m => m.status === 'finished').length;
    const playing = matches.filter(m => m.status === 'playing').length;
    const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
    return { total, finished, playing, pct };
  }, [matches]);

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div ref={scrollContainerRef} className="container sk-page sk-page--wide op-sb print:p-0 print:space-y-2">
      {/* ヘッダー再表示ボタン（非表示時のみ） */}
      {!headerVisible && (
        <button
          onClick={() => setHeaderVisible(true)}
          className="op-sb__reveal print:hidden"
          title="メニュー表示"
        >
          <Eye className="w-5 h-5" />
        </button>
      )}
      {/* ===== HEADER ===== */}
      <header className={`sk-sec op-sb__head print:border-none ${!headerVisible ? 'hidden' : ''}`}>
        <div className="sk-sec__head">
          <span className="sk-sec__mark" aria-hidden="true" />
          <div className="sk-sec__titles">
            <p className="sk-sec__en">SCOREBOARD</p>
            <h2 className="sk-sec__title">スコアボード</h2>
            <p className="sk-sec__lead">
              トーナメント／リーグの対戦状況・スコア管理
            </p>
          </div>

          {/* View mode toggle */}
          <div className="sk-sec__actions">
            {/* 全種目 / 個別 切替 */}
            <div className="hub-filter op-seg op-seg--inline">
              <button
                onClick={() => { setShowAllEvents(true); setSelectedMatchKey(null); }}
                className={`hub-filter__btn ${showAllEvents ? 'is-on' : ''}`}
              >
                <Layers className="w-3.5 h-3.5" /><span className="hidden xs:inline">全種目</span><span className="xs:hidden">全</span>
              </button>
              <button
                onClick={() => {
                  setShowAllEvents(false);
                  setSelectedMatchKey(null);
                  if (selectedEventIdx < 0 && events.length > 0) {
                    setSelectedEventIdx(events.length >= 2 ? events.length - 2 : 0);
                  }
                }}
                className={`hub-filter__btn ${!showAllEvents ? 'is-on' : ''}`}
              >
                <Eye className="w-3.5 h-3.5" /><span className="hidden xs:inline">個別</span><span className="xs:hidden">1</span>
              </button>
            </div>

            {!showAllEvents && (
              <div className="hub-filter op-seg op-seg--inline">
                <button
                  onClick={() => { setViewMode('bracket'); setSelectedMatchKey(null); }}
                  className={`hub-filter__btn ${viewMode === 'bracket' ? 'is-on' : ''}`}
                >
                  {isRoundRobin ? <LayoutGrid className="w-3.5 h-3.5" /> : <GitBranch className="w-3.5 h-3.5" />}
                  {isRoundRobin ? 'リーグ' : 'トーナメント'}
                </button>
                <button
                  onClick={() => { setViewMode('table'); setSelectedMatchKey(null); }}
                  className={`hub-filter__btn ${viewMode === 'table' ? 'is-on' : ''}`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  テーブル
                </button>
              </div>
            )}
            <button
              onClick={handlePrintBracket}
              className="btn btn--outline sk-btn sk-btn--sm print:hidden"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">印刷</span>
            </button>
            <button
              onClick={() => setShowRules(true)}
              className="btn btn--outline sk-btn sk-btn--sm print:hidden"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">大会ルール</span>
              <span className="sm:hidden">ルール</span>
            </button>
          </div>
        </div>

        <div className="sk-sec__body op-sb__headbody">
        {/* Event navigator — 個別表示時のみ */}
        {!showAllEvents && (
          <div className="op-sb__nav">
            <button
              onClick={handlePrevEvent}
              disabled={selectedEventIdx <= 0}
              className="op-ibtn op-ibtn--lg print:hidden"
              title="前種目"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <select
              value={selectedEventIdx >= 0 ? selectedEventIdx : ''}
              onChange={e => {
                setSelectedEventIdx(Number(e.target.value));
                setSelectedMatchKey(null);
              }}
              className="input sk-input op-sb__select"
            >
              <option value="" disabled>-- 種目を選択 --</option>
              {events.map((e, i) => (
                <option key={e.eventId} value={i}>
                  {e.name} ({e.type})
                </option>
              ))}
            </select>

            <button
              onClick={handleNextEvent}
              disabled={selectedEventIdx >= events.length - 1}
              className="op-ibtn op-ibtn--lg print:hidden"
              title="次種目"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Progress bar — 個別表示時 */}
        {!showAllEvents && selectedEventId && matches.length > 0 && (
          <div className="op-sb__prog">
            <div className="op-bar op-bar--grow">
              <div
                className="op-bar__fill"
                style={{ width: `${progressStats.pct}%` }}
              />
            </div>
            <span className="op-sb__prog-n">
              {progressStats.finished}/{progressStats.total} 完了
              {progressStats.playing > 0 && (
                <span className="op-sb__playing">({progressStats.playing} 試合中)</span>
              )}
            </span>
          </div>
        )}
        {/* Progress bar — 全種目表示時（集計） */}
        {showAllEvents && perEventData.length > 0 && (() => {
          const agg = perEventData.reduce((a, d) => ({
            total: a.total + d.progress.total,
            finished: a.finished + d.progress.finished,
            playing: a.playing + d.progress.playing,
          }), { total: 0, finished: 0, playing: 0 });
          const pct = agg.total > 0 ? Math.round((agg.finished / agg.total) * 100) : 0;
          return (
            <div className="op-sb__prog">
              <div className="op-bar op-bar--grow">
                <div
                  className="op-bar__fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="op-sb__prog-n">
                {agg.finished}/{agg.total} 完了
                {agg.playing > 0 && (
                  <span className="op-sb__playing">({agg.playing} 試合中)</span>
                )}
              </span>
            </div>
          );
        })()}
        </div>
      </header>

      {/* ===== COURT STATUS BAR ===== */}
      {!headerVisible ? null : courtStatus.length > 0 && (showAllEvents || selectedEventId) && (
        <div className="op-sb__courts print:hidden">
          {courtStatus.map(c => {
            const isOver = c.matchInfo && c.startedAt > 0 && (clockTick - c.startedAt) > matchDuration * 60 * 1000;
            return (
              <div
                key={c.courtId}
                className={`op-sb__court ${
                  isOver
                    ? 'is-over'
                    : c.matchInfo
                      ? 'is-busy'
                      : c.isAvailable
                        ? ''
                        : 'is-off'
                }`}
              >
                <MapPin className="w-3 h-3" />
                <span className="op-sb__court-n">{c.name}</span>
                {isOver && <AlertTriangle className="w-3 h-3 animate-pulse" />}
                {c.matchInfo && (
                  <>
                    {c.eventName && <span className="op-sb__court-ev">{c.eventName}</span>}
                    <span className="op-sb__court-m">{c.matchInfo}</span>
                    {c.startedAt > 0 && (
                      <span className="op-sb__court-t">{formatElapsedMinutes(c.startedAt, clockTick)}</span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== MAIN CONTENT ===== */}
      {showAllEvents ? (
        /* ===== 全種目表示 ===== */
        <div className="op-sb__list">
          {perEventData.length === 0 ? (
            <SkEmpty icon={MonitorPlay} title="試合データがありません" />
          ) : (
            perEventData.map(evtData => {
              return (
                <section key={evtData.event.eventId} className="sk-sec op-sb__ev">
                  {/* Event header — sticky */}
                  <div className="op-sb__evhead">
                    <div className="op-sb__evrow">
                      <h2 className="op-sb__evtitle">
                        {evtData.isRoundRobin
                          ? <LayoutGrid className="w-4 h-4" />
                          : <GitBranch className="w-4 h-4" />
                        }
                        {evtData.event.name}
                        <small>({evtData.event.type})</small>
                      </h2>
                      <span className="op-sb__prog-n">
                        {evtData.progress.finished}/{evtData.progress.total} 完了
                        {evtData.progress.playing > 0 && (
                          <span className="op-sb__playing">({evtData.progress.playing} 試合中)</span>
                        )}
                      </span>
                    </div>
                    {/* Per-event mini progress bar */}
                    <div className="op-bar op-bar--grow op-sb__evbar">
                      <div
                        className="op-bar__fill"
                        style={{ width: `${evtData.progress.pct}%` }}
                      />
                    </div>
                  </div>
                  {/* Bracket / League */}
                  <div className="op-sb__evbody">
                    {evtData.slots.length > 0 && evtData.draw ? (
                      evtData.isRoundRobin ? (
                        <ScoreboardLeague
                          slots={evtData.slots}
                          matchResults={evtData.matchResults}
                          onMatchSelect={(e1, e2) => {
                            setSelectedAllEventId(evtData.event.eventId);
                            const key = `${e1}-${e2}`;
                            setSelectedMatchKey(prev => {
                              const altKey = `${e2}-${e1}`;
                              if (prev === key || prev === altKey) return null;
                              return key;
                            });
                          }}
                          selectedMatchKey={selectedAllEventId === evtData.event.eventId ? selectedMatchKey : null}
                          leagueName={evtData.event.name}
                          gameRuleText={getGameRuleText(evtData.event, 1, evtData.totalRounds)}
                        />
                      ) : (
                        <ScoreboardBracket
                          slots={evtData.slots}
                          drawSize={evtData.draw.drawSize}
                          matchResults={evtData.matchResults}
                          eventType={evtData.event.type}
                          selectedMatchId={selectedAllEventId === evtData.event.eventId ? selectedMatchKey : null}
                          onMatchSelect={(round, pos) => {
                            setSelectedAllEventId(evtData.event.eventId);
                            const key = `${round}-${pos}`;
                            setSelectedMatchKey(prev => prev === key ? null : key);
                          }}
                        />
                      )
                    ) : (
                      <div className="op-sb__none">
                        <MonitorPlay className="w-8 h-8" />
                        <p>試合を生成してください</p>
                      </div>
                    )}
                  </div>
                </section>
              );
            })
          )}

          {/* Score input dialog for all-events mode */}
          {selectedAllMatch && (
            <ScoreInputDialog
              match={selectedAllMatch}
              courts={courts.filter(c => c.isAvailable).map(c => ({
                courtId: c.courtId,
                name: c.name,
                isAvailable: !occupiedCourtIds.has(c.courtId) || c.courtId === selectedAllMatch.courtId,
              }))}
              onClose={() => { setSelectedMatchKey(null); setSelectedAllEventId(null); }}
              onMatchUpdate={() => {}}
              getRoundName={(round) => {
                const evtData = perEventData.find(d => d.event.eventId === selectedAllEventId);
                return evtData ? getRoundName(round, evtData.totalRounds) : `${round}回戦`;
              }}
              isLeague={perEventData.find(d => d.event.eventId === selectedAllEventId)?.isRoundRobin}
              gameRuleText={(() => {
                const evtData = perEventData.find(d => d.event.eventId === selectedAllEventId);
                return evtData ? getGameRuleText(evtData.event, selectedAllMatch.round, evtData.totalRounds) : '';
              })()}
              requiredGames={(() => {
                const evtData = perEventData.find(d => d.event.eventId === selectedAllEventId);
                return evtData ? resolveRequiredGames(getGameRuleText(evtData.event, selectedAllMatch.round, evtData.totalRounds), selectedAllMatch.round, evtData.totalRounds) : null;
              })()}
              matchFormat={(() => {
                const evtData = perEventData.find(d => d.event.eventId === selectedAllEventId);
                return evtData ? getMatchFormat(evtData.event, selectedAllMatch.round, evtData.totalRounds) : 'game';
              })()}
            />
          )}
        </div>
      ) : !selectedEventId || selectedEventIdx < 0 ? (
        <SkEmpty icon={MonitorPlay} title="種目を選択してください" />
      ) : viewMode === 'bracket' ? (
        /* ===== BRACKET / LEAGUE VIEW (MAIN) ===== */
        <div className="op-sb__single">
          {/* Bracket/League area */}
          <div className="sk-sec op-sb__ev op-sb__evbody">
            {editedSlots.length > 0 && drawData ? (
              isRoundRobin ? (
                <ScoreboardLeague
                  slots={editedSlots}
                  matchResults={matchResults}
                  onMatchSelect={handleLeagueMatchSelect}
                  selectedMatchKey={selectedMatchKey}
                  leagueName={events[selectedEventIdx]?.name || 'リーグ'}
                  gameRuleText={getGameRuleText(events[selectedEventIdx], 1, totalRounds)}
                />
              ) : (
                <ScoreboardBracket
                  slots={editedSlots}
                  drawSize={drawData.drawSize}
                  matchResults={matchResults}
                  eventType={events[selectedEventIdx]?.type}
                  selectedMatchId={selectedMatchKey}
                  onMatchSelect={handleBracketMatchSelect}
                />
              )
            ) : matches.length === 0 ? (
              <div className="op-sb__none">
                <MonitorPlay className="w-8 h-8" />
                <p>エントリーを確定して試合を生成してください</p>
              </div>
            ) : (
              <div className="op-sb__none">
                <GitBranch className="w-8 h-8" />
                <p>ドロー表が見つかりません。テーブル表示に切り替えてください。</p>
              </div>
            )}
          </div>

          {/* Score input dialog (popup) */}
          {selectedMatch && (
            <ScoreInputDialog
              match={selectedMatch}
              courts={courts.filter(c => c.isAvailable).map(c => ({
                courtId: c.courtId,
                name: c.name,
                isAvailable: !occupiedCourtIds.has(c.courtId) || c.courtId === selectedMatch.courtId,
              }))}
              onClose={() => setSelectedMatchKey(null)}
              onMatchUpdate={() => {}}
              getRoundName={makeRoundName}
              isLeague={isRoundRobin}
              gameRuleText={getGameRuleText(events[selectedEventIdx], selectedMatch.round, totalRounds)}
              requiredGames={resolveRequiredGames(getGameRuleText(events[selectedEventIdx], selectedMatch.round, totalRounds), selectedMatch.round, totalRounds)}
              matchFormat={getMatchFormat(events[selectedEventIdx], selectedMatch.round, totalRounds)}
            />
          )}
        </div>
      ) : (
        /* ===== TABLE VIEW (LEGACY) ===== */
        <div className="op-sb__list">
          {/* 試合中 */}
          {activeMatches.length > 0 && (
            <section>
              <h2 className="op-sb__h">
                <Play className="w-4 h-4" /> 進行中 ({activeMatches.length})
              </h2>
              <div className="op-sb__cards">
                {activeMatches.map(m => {
                  // テーブルビュー用: スコアから勝者自動判定
                  const tableAutoWinner = (() => {
                    if (!scoreInput || editingMatchId !== m.matchId) return null;
                    const setParts = scoreInput.trim().split(/\s+/);
                    let p1w = 0, p2w = 0;
                    for (const part of setParts) {
                      const sm = part.match(/^(\d+)-(\d+)/);
                      if (sm) { const a = +sm[1], b = +sm[2]; if (a > b) p1w++; else if (b > a) p2w++; }
                    }
                    if (p1w > p2w) return 1 as const;
                    if (p2w > p1w) return 2 as const;
                    return null;
                  })();
                  return (
                    <div key={m.matchId} className="op-sb__card">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-mono text-gray-500">#{m.matchOrder} R{m.round}</span>
                        {m.courtId && <span className="op-badge op-badge--court">{getCourtName(m.courtId)}</span>}
                        <span className="op-st op-st--playing">
                          試合中
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <div className="flex-1">
                            <p className="font-bold text-gray-900 truncate">{m.player1Name}</p>
                            <p className="text-xs text-gray-500">{m.player1Affiliation}</p>
                          </div>
                        </div>
                        <div className="text-center text-xs text-gray-500">vs</div>
                        <div className="flex items-center">
                          <div className="flex-1">
                            <p className="font-bold text-gray-900 truncate">{m.player2Name}</p>
                            <p className="text-xs text-gray-500">{m.player2Affiliation}</p>
                          </div>
                        </div>
                      </div>
                      {editingMatchId === m.matchId ? (
                        <div className="mt-3 pt-3 border-t border-border-main space-y-2">
                          <input
                            type="text" placeholder="スコア (例: 6-4 6-3)" value={scoreInput}
                            onChange={e => setScoreInput(e.target.value)}
                            className="input sk-input"
                          />
                          {tableAutoWinner ? (
                            <button onClick={() => handleFinishMatch(m.matchId, tableAutoWinner)} disabled={isProcessing}
                              className="btn btn--primary sk-btn sk-btn--block">
                              <Trophy className="w-3 h-3 inline mr-1" />
                              結果確定 ({tableAutoWinner === 1 ? getSurname(m.player1Name) : getSurname(m.player2Name)} 勝利)
                            </button>
                          ) : (
                            <p className="text-xs text-gray-400 text-center">スコアを入力すると勝者が自動判定されます</p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 pt-3 border-t border-border-main flex items-center gap-2">
                          {m.status === 'playing' && (
                            <button onClick={() => { setEditingMatchId(m.matchId); setScoreInput(''); }}
                              className="btn btn--primary sk-btn sk-btn--sm">
                              <Check className="w-3 h-3 inline mr-1" />結果入力
                            </button>
                          )}
                          {m.status === 'playing' && m.updatedAt > 0 && (
                            <span className="ml-auto text-xs text-primary-500 font-mono whitespace-nowrap">
                              {formatElapsedMinutes(m.updatedAt, clockTick)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 待機中 */}
          {waitingMatches.length > 0 && (
            <section>
              <h2 className="op-sb__h">
                待機中 ({waitingMatches.length})
              </h2>
              <div className="sk-sec sk-table-wrap">
                <table className="sk-table">
                  <thead>
                    <tr>
                      <th className="py-2 px-2 sm:px-3 w-8 sm:w-10">#</th>
                      <th className="py-2 px-2 sm:px-3">対戦</th>
                      <th className="py-2 px-2 sm:px-3 w-24 sm:w-32">コート</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingMatches.map((m, idx) => (
                      <tr key={m.matchId} className={idx % 2 === 1 ? 'is-odd' : ''}>
                        <td className="py-2 px-2 sm:px-3 font-mono text-gray-500">{m.matchOrder}</td>
                        <td className="py-2 px-2 sm:px-3">
                          <span className="font-medium">{m.player1Name}</span>
                          <span className="text-gray-500 mx-1 sm:mx-2">vs</span>
                          <span className="font-medium">{m.player2Name}</span>
                        </td>
                        <td className="py-2 px-3">
                          <select value={m.courtId || ''} onChange={e => handleAssignCourt(m.matchId, e.target.value)}
                            className="input op-cs__mini">
                            <option value="">未割当</option>
                            {courts.filter(c => c.isAvailable && (!occupiedCourtIds.has(c.courtId) || c.courtId === m.courtId)).map(c => (
                              <option key={c.courtId} value={c.courtId}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 終了済み */}
          {finishedMatches.length > 0 && (
            <section>
              <h2 className="op-sb__h">
                終了 ({finishedMatches.length})
              </h2>
              <div className="sk-sec sk-table-wrap">
                <table className="sk-table">
                  <thead>
                    <tr>
                      <th className="py-2 px-3 w-10">#</th>
                      <th className="py-2 px-3">勝者</th>
                      <th className="py-2 px-3">敗者</th>
                      <th className="py-2 px-3 w-28">スコア</th>
                      <th className="py-2 px-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {finishedMatches.map((m, idx) => {
                      const isP1Winner = m.winnerEntryId === m.player1EntryId;
                      const winner = isP1Winner ? m.player1Name : m.player2Name;
                      const loser = isP1Winner ? m.player2Name : m.player1Name;
                      return (
                        <tr key={m.matchId} className={idx % 2 === 1 ? 'is-odd' : ''}>
                          <td className="py-2 px-3 font-mono text-gray-500">{m.matchOrder}</td>
                          <td className="py-2 px-3 font-bold text-gray-900 whitespace-nowrap">{winner}</td>
                          <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{loser || 'BYE'}</td>
                          <td className="py-2 px-3 font-mono font-bold text-gray-800">{m.score || (m.status === 'walkover' ? 'W/O' : '-')}</td>
                          <td className="py-2 px-3">
                            <button onClick={() => handleResetMatch(m.matchId)} disabled={isProcessing}
                              className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-50" title="リセット">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {matches.length === 0 && (
            <SkEmpty icon={MonitorPlay} title="エントリーを確定して試合を生成してください" />
          )}
        </div>
      )}

      {/* 大会ルール ポップアップ */}
      {showRules && (
        <SiteDialog
          open
          eyebrow="RULES"
          title="大会ルール"
          size="md"
          onClose={() => setShowRules(false)}
          closable
          actions={
            <button
              onClick={() => setShowRules(false)}
              className="btn btn--primary sdlg__btn"
            >
              閉じる
            </button>
          }
        >
            <div className="op-rules">
              {events.length === 0 ? (
                <p className="text-sm text-gray-500">種目が設定されていません</p>
              ) : (
                events.map(evt => {
                  const rules = evt.roundGameRules || [];
                  const defaultGames = evt.gameRules?.games ?? 6;
                  return (
                    <div key={evt.eventId} className="space-y-2">
                      <h3 className="op-rules__ev">
                        {evt.name}
                        <small>({evt.type})</small>
                      </h3>
                      {rules.length > 0 ? (
                        <div className="space-y-1.5">
                          {rules.map((rule, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm">
                              <span className="op-rules__rd">
                                {rule.roundLabel}
                              </span>
                              <span className="op-rules__tx">{rule.ruleText}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">
                          {defaultGames}ゲームマッチ（{defaultGames}-{defaultGames}タイブレーク）
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
        </SiteDialog>
      )}
    </div>
  );
}
