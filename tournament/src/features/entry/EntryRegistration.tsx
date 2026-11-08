import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Draw, type Entry } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import HeatRulePatternInput, { applyHeatToRules } from '../data/HeatRulePatternInput';
import { UserCheck, UserPlus, Search, Eye, List, AlertCircle, ChevronDown, GitBranch, ZoomIn, RotateCcw, Lock, Ban, Unlock, X, Check, Clock, Shuffle, ArrowDownToLine, ArrowUpToLine, ChevronLeft, ChevronRight } from 'lucide-react';
import ProcessingModal, { type ProcessingStep } from '../../components/ui/ProcessingModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { repairShiftedDrawTimes } from '../schedule/repairDrawTimes';
import {
  buildMatchesFromDraw, findResetMatches, isLeagueEvent, rebuildEventMatches,
} from '../draw/rebuildMatches';
import {
  applyBlockPattern, applyBlockPatterns, blockPatternOf, BLOCK_PATTERN_LABELS,
  describeBlockPatterns, insertGapAt, isEmptySlot, parseBlockPatterns,
  removeGapAt, swapSlotContents, type BlockPattern,
} from '../draw/drawSlotOps';
import { useMixedStore } from '../mixed/mixedStore';
import MixedEntryView from '../mixed/MixedEntryView';
import { useTeamStore } from '../team/teamStore';
import TeamEntryView from '../team/TeamEntryView';
import { SkPage, SkEmpty } from '../../components/site/Kit';
import { sortEventsByClass } from '../data/eventOrder';
import EntrySheet, { type SheetSlot } from './EntrySheet';
import EntrySlotDialog, { type SlotChange } from './EntrySlotDialog';
import { sourceLabel } from '../draw/placement';
import PlacementPanel from './PlacementPanel';
import { isUnfilledPlacement, maybeRegenerateSchedule as regenerateScheduleCore, recalculateGlobalMatchOrder as recalcOrderCore } from './confirmCore';
import { toHalfwidth } from '../../lib/halfwidth';

/** 'HH:MM' → 分。不正な値は Infinity（比較時に最後に来る）。 */
function toMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
  if (!m) return Infinity;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

type CheckInSlot = {
  drawPosition: number;
  seed: number;
  entryId: string | null;
  isBye: boolean;
  entry: Entry | null;
  playerName: string;
  partnerName: string;
  affiliation: string;
  /** 順位別トーナメントの枠の見出し（例 B1位）。選手が入るまで枠に出す */
  sourceLabel?: string;
};


export default function EntryRegistration() {
  const isMixedImported = useMixedStore(s => s.isImported);
  const isTeamImported = useTeamStore(s => s.isImported);

  // ミックスダブルスモード
  if (isMixedImported) {
    return <MixedEntryView />;
  }
  // 団体戦モード
  if (isTeamImported) {
    return <TeamEntryView />;
  }

  return <NormalEntryRegistration />;
}

function NormalEntryRegistration() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const heatRulePattern = useAppStore(state => state.heatRulePattern);
  const setHeatRulePattern = useAppStore(state => state.setHeatRulePattern);

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set());
  const [stickyEventName, setStickyEventName] = useState('');
  /** 選手の並べ方：一覧（細い罫の行）かドロー図か。スマホは一覧、PC はドロー図から。
   *  「対戦表」はこの切り替えではなく、全画面で開く（sheetEventId。サイトのドロー表の形でズームし、タップで受付・種目も切り替えられる） */
  const [viewMode, setViewMode] = useState<'list' | 'draw'>(
    typeof window !== 'undefined' && window.innerWidth < 1024 ? 'list' : 'draw'
  );

  // === あたり（対戦の組み合わせ）修正 ===
  // 取り込んだドロー表と実際のあたりが違うとき、この画面で枠を並べ替えて直す。
  // 保存するまではドラフトだけを書き換えるので、ブラケット表示で結果を確認できる。
  const [drawEdit, setDrawEdit] = useState<{ eventId: string; slots: Draw['slots'] } | null>(null);
  const [drawEditHistory, setDrawEditHistory] = useState<Draw['slots'][]>([]);
  const [editSelectedPos, setEditSelectedPos] = useState<number | null>(null);
  const [savingDrawEdit, setSavingDrawEdit] = useState(false);
  /** 一度にずらす枠数（4枠のまとまりに合わせるとき 2〜4 をよく使う） */
  const [shiftCount, setShiftCount] = useState(1);
  /** 型のまとめ指定（"4,空,2,3下,..." の形式） */
  const [patternText, setPatternText] = useState('');

  // 処理中モーダル
  const [procModalOpen, setProcModalOpen] = useState(false);
  const [procModalTitle, setProcModalTitle] = useState('');
  const [procModalSteps, setProcModalSteps] = useState<ProcessingStep[]>([]);
  const [procModalProgress, setProcModalProgress] = useState(0);
  const [procModalResult, setProcModalResult] = useState<{ success: boolean; message: string } | null>(null);

  // 確認ダイアログ
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; danger?: boolean; confirmLabel?: string;
  }>({ open: false, title: '', message: '' });
  const confirmResolverRef = useRef<((v: boolean) => void) | null>(null);
  const requestConfirm = useCallback((opts: { title: string; message: string; danger?: boolean; confirmLabel?: string }) => {
    return new Promise<boolean>(resolve => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({ ...opts, open: true });
    });
  }, []);
  const handleConfirmOk = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
    confirmResolverRef.current?.(true);
    confirmResolverRef.current = null;
  }, []);
  const handleConfirmCancel = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
    confirmResolverRef.current?.(false);
    confirmResolverRef.current = null;
  }, []);

  // Queries
  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray().then(sortEventsByClass) : [],
    [currentTournamentId]
  ) || [];

  const eventIds = useMemo(() => events.map(e => e.eventId), [events]);

  const allEntries = useLiveQuery(
    () => eventIds.length > 0
      ? db.entries.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const allDraws = useLiveQuery(
    () => eventIds.length > 0
      ? db.draws.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const allMatches = useLiveQuery(
    () => eventIds.length > 0
      ? db.matches.where('eventId').anyOf(eventIds).toArray()
      : [],
    [eventIds]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];
  const playerMap = useMemo(() => new Map(players.map(p => [p.playerId, p])), [players]);

  const entryMap = useMemo(() => new Map(allEntries.map(e => [e.entryId, e])), [allEntries]);
  const drawMap = useMemo(() => new Map(allDraws.map(d => [d.eventId, d])), [allDraws]);

  // Check if an event has confirmed matches
  const confirmedEventsSet = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMatches) {
      set.add(m.eventId);
    }
    return set;
  }, [allMatches]);

  // Build check-in slots for an event
  const buildSlotsForEvent = useCallback((eventId: string): CheckInSlot[] => {
    const draw = drawMap.get(eventId);
    const eventEntries = allEntries.filter(e => e.eventId === eventId);
    // あたり修正中の種目は、保存前のドラフトで表示する（ブラケットで結果を確認できる）
    const drawSlots = drawEdit?.eventId === eventId ? drawEdit.slots : draw?.slots;

    if (draw && drawSlots && drawSlots.length > 0) {
      const labelByPos = new Map((draw.slotSources ?? []).map((x) => [x.position, sourceLabel(x)]));
      return drawSlots
        .slice()
        .sort((a, b) => a.position - b.position)
        .map(slot => {
          const entry = slot.entryId ? entryMap.get(slot.entryId) || null : null;
          let playerName = '';
          let partnerName = '';
          let affiliation = '';

          if (entry) {
            const p1 = playerMap.get(entry.playerId);
            playerName = p1?.name || '(不明)';
            affiliation = p1?.affiliation || '';
            if (entry.partnerId) {
              const p2 = playerMap.get(entry.partnerId);
              partnerName = p2?.name || '';
              if (p2?.affiliation && p2.affiliation !== affiliation) {
                affiliation = `${affiliation} / ${p2.affiliation}`;
              }
            }
          }

          return {
            drawPosition: slot.position,
            seed: slot.seed,
            entryId: slot.entryId,
            isBye: slot.isBye,
            entry,
            playerName: slot.isBye && !entry ? 'BYE' : playerName,
            partnerName,
            affiliation,
            sourceLabel: labelByPos.get(slot.position),
          };
        });
    }

    return eventEntries.map((entry, idx) => {
      const p1 = playerMap.get(entry.playerId);
      const p2 = entry.partnerId ? playerMap.get(entry.partnerId) : null;
      return {
        drawPosition: idx + 1,
        seed: entry.seedNo || 0,
        entryId: entry.entryId,
        isBye: false,
        entry,
        playerName: p1?.name || '(不明)',
        partnerName: p2?.name || '',
        affiliation: p1?.affiliation || '',
      };
    });
  }, [drawMap, allEntries, entryMap, playerMap, drawEdit]);

  // 検索ポップアップ用: 全種目のエントリーを平坦化した検索リスト
  type SearchRow = CheckInSlot & { eventId: string; eventName: string };
  const allSearchRows = useMemo<SearchRow[]>(() => {
    const list: SearchRow[] = [];
    for (const e of events) {
      for (const s of buildSlotsForEvent(e.eventId)) {
        if (!s.entry || s.isBye) continue; // 実エントリーのみ
        list.push({ ...s, eventId: e.eventId, eventName: e.name });
      }
    }
    return list;
  }, [events, buildSlotsForEvent]);

  // 検索ポップアップの状態
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const searchModalInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchModalOpen) setTimeout(() => searchModalInputRef.current?.focus(), 50);
  }, [searchModalOpen]);
  // 閉じるときは検索語をクリアし、下の一覧を元に戻す
  const closeSearchModal = useCallback(() => { setSearchModalOpen(false); setSearchQuery(''); }, []);

  // PC/スマホ判定：PCは検索結果をポップアップではなく下にカードリストで表示、スマホはポップアップ
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ポップアップの検索結果（選手名・所属・種目名で絞り込み）
  const searchModalResults = useMemo<SearchRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allSearchRows.filter(r =>
      r.playerName.toLowerCase().includes(q) ||
      r.partnerName.toLowerCase().includes(q) ||
      r.affiliation.toLowerCase().includes(q) ||
      r.eventName.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [searchQuery, allSearchRows]);

  // 検索結果の1行（ポップアップ／PCのカードリスト共通）
  const renderSearchResultRow = (row: SearchRow, variant: 'popup' | 'card') => {
    const isAbsent = row.entry?.status === 'withdrawn';
    const isChecked = !isAbsent && !!row.entryId && confirmedIds.has(row.entryId);
    return (
      <button
        key={`${row.eventId}-${row.entryId}`}
        onClick={() => handleCheckIn(row)}
        className={`ent-hit ent-hit--${variant} ${isAbsent ? 'is-def' : isChecked ? 'is-checked' : ''}`}
      >
        <span className="ent-hit__mark">
          {isAbsent ? <Ban className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
        </span>
        <span className="ent-hit__body">
          <span className="ent-hit__name">
            {row.playerName}{row.partnerName && ` / ${row.partnerName}`}
          </span>
          <span className="ent-hit__meta">
            {row.affiliation}{row.affiliation && ' ・ '}<b>{row.eventName}</b>
          </span>
        </span>
        <span className={`sk-chip ent-hit__st ${isAbsent ? 'sk-chip--red' : isChecked ? 'sk-chip--ink' : ''}`}>
          {isAbsent ? '欠場' : isChecked ? '受付済' : '未受付'}
        </span>
      </button>
    );
  };

  // Filter slots by search
  const getSearchMatchSet = useCallback((slots: CheckInSlot[]): Set<number> => {
    if (!searchQuery) return new Set();
    const q = searchQuery.toLowerCase();
    return new Set(
      slots
        .filter(s =>
          s.playerName.toLowerCase().includes(q) ||
          s.partnerName.toLowerCase().includes(q) ||
          s.affiliation.toLowerCase().includes(q)
        )
        .map(s => s.drawPosition)
    );
  }, [searchQuery]);

  // Check-in handlers
  const handleCheckIn = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id) return;
    if (slot.entry.status === 'withdrawn') {
      await handleRestore(slot);
      return;
    }
    setConfirmedIds(prev => {
      const next = new Set(prev);
      if (next.has(slot.entryId!)) next.delete(slot.entryId!);
      else next.add(slot.entryId!);
      return next;
    });
  }, []);

  const handleCheckInAll = useCallback(() => {
    const allActiveEntryIds = allEntries.filter(e => e.status === 'active').map(e => e.entryId);
    setConfirmedIds(new Set(allActiveEntryIds));
  }, [allEntries]);

  const handleResetAll = useCallback(() => { setConfirmedIds(new Set()); }, []);

  const handleCheckInEvent = useCallback((eventId: string) => {
    const eventEntryIds = allEntries.filter(e => e.eventId === eventId && e.status === 'active').map(e => e.entryId);
    setConfirmedIds(prev => {
      const next = new Set(prev);
      for (const id of eventEntryIds) next.add(id);
      return next;
    });
  }, [allEntries]);

  const handleResetEvent = useCallback((eventId: string) => {
    const eventEntryIds = new Set(allEntries.filter(e => e.eventId === eventId).map(e => e.entryId));
    setConfirmedIds(prev => {
      const next = new Set(prev);
      for (const id of eventEntryIds) next.delete(id);
      return next;
    });
  }, [allEntries]);

  const handleMarkBye = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id || !slot.entryId) return;
    await db.entries.update(slot.entry.id, { status: 'withdrawn' });
    // DBから最新のドローを直接取得
    const draw = await db.draws.where('eventId').equals(slot.entry.eventId).first();
    if (draw && draw.id) {
      const updatedSlots = draw.slots.map(s => s.entryId === slot.entryId ? { ...s, isBye: true } : s);
      await db.draws.update(draw.id, { slots: updatedSlots, updatedAt: Date.now() });
    }
    const matches = await db.matches.where('eventId').equals(slot.entry.eventId).toArray();
    for (const match of matches) {
      if (match.player1EntryId === slot.entryId || match.player2EntryId === slot.entryId) {
        const isPlayer1 = match.player1EntryId === slot.entryId;
        const updates: Partial<typeof match> = {};
        if (isPlayer1) { updates.player1Name = 'BYE'; updates.player1Affiliation = ''; }
        else { updates.player2Name = 'BYE'; updates.player2Affiliation = ''; }
        const opponentId = isPlayer1 ? match.player2EntryId : match.player1EntryId;
        if (opponentId && match.status !== 'finished' && match.status !== 'playing') {
          updates.status = 'walkover'; updates.winnerEntryId = opponentId;
        }
        await db.matches.update(match.id!, updates);
      }
    }
    setConfirmedIds(prev => { const next = new Set(prev); next.delete(slot.entryId!); return next; });
  }, []);

  const handleRestore = useCallback(async (slot: CheckInSlot) => {
    if (!slot.entry || !slot.entry.id || !slot.entryId) return;
    await db.entries.update(slot.entry.id, { status: 'active' });
    // DBから最新のドローと選手データを直接取得
    const draw = await db.draws.where('eventId').equals(slot.entry.eventId).first();
    if (draw && draw.id) {
      const updatedSlots = draw.slots.map(s => s.entryId === slot.entryId ? { ...s, isBye: false } : s);
      await db.draws.update(draw.id, { slots: updatedSlots, updatedAt: Date.now() });
    }
    const matches = await db.matches.where('eventId').equals(slot.entry.eventId).toArray();
    const allPlayers = await db.players.toArray();
    const pMap = new Map(allPlayers.map(p => [p.playerId, p]));
    const p1 = pMap.get(slot.entry.playerId);
    const p2 = slot.entry.partnerId ? pMap.get(slot.entry.partnerId) : null;
    const restoredName = p2 ? `${p1?.name || ''} / ${p2.name}` : (p1?.name || '');
    const restoredAffiliation = p1?.affiliation || '';
    for (const match of matches) {
      if (match.player1EntryId === slot.entryId || match.player2EntryId === slot.entryId) {
        const isPlayer1 = match.player1EntryId === slot.entryId;
        const updates: Partial<typeof match> = {};
        if (isPlayer1) { updates.player1Name = restoredName; updates.player1Affiliation = restoredAffiliation; }
        else { updates.player2Name = restoredName; updates.player2Affiliation = restoredAffiliation; }
        if (match.status === 'walkover') { updates.status = 'waiting'; updates.winnerEntryId = null; }
        await db.matches.update(match.id!, updates);
      }
    }
  }, []);

  const maybeRegenerateSchedule = useCallback(() => regenerateScheduleCore(), []);
  const recalculateGlobalMatchOrder = useCallback(() => recalcOrderCore(), []);

  // === エントリー確定（対戦表生成）===
  const handleConfirmEvent = useCallback(async (eventId: string, skipConfirm = false, skipReorder = false) => {
    // 取込済みドローの開始時刻がタイムゾーンぶんずれている場合は先に補正する。
    // （旧バージョンで取り込んだ 9:00 が 0:00 として保存されているケース。
    //   補正前に対戦表を作ると 0:00 が試合の予定時刻として書き込まれてしまう）
    const tidForRepair = useAppStore.getState().currentTournamentId;
    if (tidForRepair) await repairShiftedDrawTimes(tidForRepair);

    // DBから最新データを直接取得（クロージャの古いデータに依存しない）
    const draw = await db.draws.where('eventId').equals(eventId).first();
    if (!draw) return;
    // 順位別トーナメントは、リーグの順位を入れてから確定する
    if (isUnfilledPlacement(draw)) {
      if (!skipConfirm) await requestConfirm({ title: '順位別トーナメント', message: 'まだリーグの順位を入れていません。リーグが終わったら「順位を反映して組む」を押してから確定してください。', confirmLabel: 'わかりました' });
      return;
    }

    // 熱中症警戒時の試合形式を指定している場合は種目の回戦ルールへ付与する
    if (heatRulePattern.enabled) {
      const evForHeat = await db.events.where('eventId').equals(eventId).first();
      if (evForHeat?.id != null) {
        const defaultGames = evForHeat.roundGameRules?.[0]?.games ?? evForHeat.gameRules?.games ?? 6;
        const nextRules = applyHeatToRules(evForHeat.roundGameRules, defaultGames, heatRulePattern);
        await db.events.update(evForHeat.id, { roundGameRules: nextRules });
      }
    }

    if (!skipConfirm) {
      const scored = (await db.matches.where('eventId').equals(eventId).toArray())
        .filter(m => m.score || m.winnerEntryId).length;
      const ok = await requestConfirm({
        title: 'エントリー確定',
        message: scored > 0
          ? `エントリーを確定し対戦表を生成しますか？\n入力済みのスコア（${scored}試合）はそのまま引き継がれます。`
          : 'エントリーを確定し対戦表を生成しますか？',
        confirmLabel: '確定する',
      });
      if (!ok) return;
    }

    // 処理中モーダル表示（skipConfirm=true の場合は呼び出し元が管理）
    const showModal = !skipConfirm;
    const evtName = events.find(e => e.eventId === eventId)?.name || eventId;
    if (showModal) {
      setProcModalTitle(`${evtName} 確定処理`);
      setProcModalSteps([
        { label: '対戦表を生成中...', status: 'loading' },
        { label: '時間割と紐付け', status: 'waiting' },
      ]);
      setProcModalProgress(0);
      setProcModalResult(null);
      setProcModalOpen(true);
    }

    try {
    // ドローの内容から対戦表を組み直す（入力済みスコアは可能な限り引き継ぐ）
    await rebuildEventMatches(eventId);

    if (showModal) {
      setProcModalProgress(60);
      setProcModalSteps([
        { label: '対戦表を生成完了', status: 'done' },
        { label: '時間割と紐付け中...', status: 'loading' },
      ]);
    }

    // === 確定後の実際の対戦に合わせて時間割を再編成し、対戦順を再計算 ===
    if (!skipReorder) {
      // 欠場（不足）を反映した実際の試合だけで自動生成時間割を作り直す
      await maybeRegenerateSchedule();
      // 再編成した時間割どおりに対戦順（matchOrder）・コート・時刻を並び替える
      await recalculateGlobalMatchOrder();
    }

    if (showModal) {
      setProcModalProgress(100);
      setProcModalSteps([
        { label: '対戦表を生成完了', status: 'done' },
        { label: '時間割と紐付け完了', status: 'done' },
      ]);
      setProcModalResult({ success: true, message: `${evtName} の対戦表を確定しました` });
    }
    } catch (err) {
      if (showModal) {
        setProcModalProgress(100);
        setProcModalSteps(prev => prev.map(s => s.status === 'loading' ? { ...s, status: 'error' as const, label: `エラー: ${(err as Error).message}` } : s));
        setProcModalResult({ success: false, message: `確定処理に失敗: ${(err as Error).message}` });
      }
    }
  }, [events, maybeRegenerateSchedule, recalculateGlobalMatchOrder, heatRulePattern]);

  const handleConfirmAll = useCallback(async () => {
    const currentDraws = eventIds.length > 0
      ? await db.draws.where('eventId').anyOf(eventIds).toArray()
      : [];
    // 順位別トーナメントでまだ組んでいないもの（リーグの順位待ち）は飛ばす
    const drawEventIds = new Set(currentDraws.filter(d => !isUnfilledPlacement(d)).map(d => d.eventId));
    const targets = events.filter(evt => drawEventIds.has(evt.eventId));
    if (targets.length === 0) return;
    const scoredAll = (await db.matches.where('eventId').anyOf(targets.map(t => t.eventId)).toArray())
      .filter(m => m.score || m.winnerEntryId).length;
    const ok = await requestConfirm({
      title: '全種目一括確定',
      message: scoredAll > 0
        ? `全${targets.length}種目のエントリーを確定し対戦表を生成しますか？\n入力済みのスコア（${scoredAll}試合）はそのまま引き継がれます。`
        : `全${targets.length}種目のエントリーを確定し対戦表を生成しますか？`,
      confirmLabel: '確定する',
    });
    if (!ok) return;

    setProcModalTitle('全種目 一括確定');
    const initialSteps: ProcessingStep[] = targets.map(t => ({ label: t.name, status: 'waiting' as const }));
    initialSteps.push({ label: '時間割と紐付け', status: 'waiting' });
    setProcModalSteps(initialSteps);
    setProcModalProgress(0);
    setProcModalResult(null);
    setProcModalOpen(true);

    try {
      for (let i = 0; i < targets.length; i++) {
        setProcModalSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'loading', label: `${targets[i].name} を処理中...` } : s));
        setProcModalProgress(Math.round(((i) / (targets.length + 1)) * 100));
        await handleConfirmEvent(targets[i].eventId, true, true);
        setProcModalSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'done', label: targets[i].name } : s));
      }
      // 時間割紐付け（欠場を反映して再編成 → 対戦順を並び替え）
      setProcModalSteps(prev => prev.map((s, j) => j === targets.length ? { ...s, status: 'loading', label: '時間割と紐付け中...' } : s));
      setProcModalProgress(Math.round((targets.length / (targets.length + 1)) * 100));
      await maybeRegenerateSchedule();
      await recalculateGlobalMatchOrder();
      setProcModalSteps(prev => prev.map((s, j) => j === targets.length ? { ...s, status: 'done', label: '時間割と紐付け完了' } : s));
      setProcModalProgress(100);
      setProcModalResult({ success: true, message: `全${targets.length}種目の対戦表を確定しました` });
    } catch (err) {
      setProcModalResult({ success: false, message: `確定処理に失敗: ${(err as Error).message}` });
    }
  }, [events, eventIds, handleConfirmEvent, maybeRegenerateSchedule, recalculateGlobalMatchOrder]);

  // === 確定リセット（対戦表削除）===
  const handleRevertConfirm = useCallback(async (eventId: string) => {
    const evtName = events.find(e => e.eventId === eventId)?.name || eventId;
    const ok = await requestConfirm({ title: '確定解除', message: `「${evtName}」の確定を解除し、対戦表を削除しますか？\nこの操作は取り消せません。`, danger: true, confirmLabel: '解除する' });
    if (!ok) return;
    const matches = await db.matches.where('eventId').equals(eventId).toArray();
    const ids = matches.map(m => m.id).filter((id): id is number => id !== undefined);
    if (ids.length > 0) {
      await db.matches.bulkDelete(ids);
    }
    // 時間割紐付けを再計算
    await recalculateGlobalMatchOrder();
  }, [events, recalculateGlobalMatchOrder]);

  // ===== 対戦表でタップした枠（確認ダイアログ） =====
  const [sheetTap, setSheetTap] = useState<{ eventId: string; position: number } | null>(null);
  /** 全画面の対戦表で開いている種目（null は閉じている） */
  const [sheetEventId, setSheetEventId] = useState<string | null>(null);
  useEffect(() => {
    if (!sheetEventId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [sheetEventId]);

  /** 選手を変更する（氏名・所属。ダブルスは相方も）。エントリーの選手を差し替え、対戦表の名前も入れ替える */
  const handleChangePlayer = useCallback(async (slot: CheckInSlot, next: SlotChange) => {
    if (!slot.entry?.id || !slot.entryId) return;
    const keyOf = (n: string) => n.replace(/[\s\u3000]+/g, '');
    const norm = (n: string) => toHalfwidth(n.trim().replace(/\s+/g, '\u3000'));
    const upsert = async (name: string, affiliation: string) => {
      const playerId = keyOf(name);
      const aff = toHalfwidth(affiliation.trim(), { space: true });
      const cur = await db.players.where('playerId').equals(playerId).first();
      if (cur?.id != null) { await db.players.update(cur.id, { name, affiliation: aff }); }
      else {
        const furigana = (await db.furiganaDict.get(playerId))?.furigana ?? '';
        await db.players.add({ playerId, name, furigana, affiliation: aff, rankings: {}, isManual: true });
      }
      return { playerId, name, affiliation: aff };
    };
    const p1 = await upsert(norm(next.name), next.affiliation);
    const p2 = slot.entry.partnerId || next.partnerName.trim() ? await upsert(norm(next.partnerName), next.partnerAffiliation) : null;
    await db.entries.update(slot.entry.id, { playerId: p1.playerId, ...(p2 ? { partnerId: p2.playerId } : {}) });
    // 対戦表（まだ終わっていない試合）の名前も入れ替える
    const name = p2 ? `${p1.name} / ${p2.name}` : p1.name;
    const aff = p2 && p2.affiliation !== p1.affiliation ? `${p1.affiliation} / ${p2.affiliation}` : p1.affiliation;
    const matches = await db.matches.where('eventId').equals(slot.entry.eventId).toArray();
    for (const m of matches) {
      if (m.status === 'finished') continue;
      if (m.player1EntryId === slot.entryId) await db.matches.update(m.id!, { player1Name: name, player1Affiliation: aff });
      else if (m.player2EntryId === slot.entryId) await db.matches.update(m.id!, { player2Name: name, player2Affiliation: aff });
    }
  }, []);

  // Summary stats
  const computeStats = useCallback((slots: CheckInSlot[]) => {
    const playerSlots = slots.filter(s => s.entry && !(!s.entry && s.isBye));
    const total = playerSlots.length;
    const checkedIn = playerSlots.filter(s => s.entry && s.entry.status === 'active' && confirmedIds.has(s.entryId!)).length;
    const absent = playerSlots.filter(s => s.entry && s.entry.status === 'withdrawn').length;
    const remaining = total - checkedIn - absent;
    return { total, checkedIn, absent, remaining };
  }, [confirmedIds]);

  // 確定済み種目を自動折りたたみ
  useEffect(() => {
    if (confirmedEventsSet.size > 0) {
      setCollapsedEvents(prev => {
        const next = new Set(prev);
        for (const id of confirmedEventsSet) next.add(id);
        return next;
      });
    }
  }, [confirmedEventsSet]);

  const toggleCollapse = (eventId: string) => {
    setCollapsedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  // ===== 選手 1 人ぶんの表示（ドロー図の枠・一覧の行で共通） =====
  const slotState = (slot: CheckInSlot, matches: Set<number>) => {
    const hasSearch = searchQuery.length > 0;
    return {
      isWithdrawn: slot.entry?.status === 'withdrawn',
      isConfirmed: slot.entryId ? confirmedIds.has(slot.entryId) : false,
      isDimmed: hasSearch && !!slot.entry && !matches.has(slot.drawPosition),
      isHighlighted: hasSearch && matches.has(slot.drawPosition),
    };
  };

  /** ドロー図の枠（絶対配置） */
  const renderSlotBox = (
    slot: CheckInSlot, x: number, y: number, w: number, h: number,
    num: number, keyPrefix: string, size: 'sm' | 'md', matches: Set<number>,
  ) => {
    const { isWithdrawn, isConfirmed, isDimmed, isHighlighted } = slotState(slot, matches);
    return (
      <div key={`${keyPrefix}-slot-${slot.drawPosition}`}
        className={`ent-slot ent-slot--${size} ${isWithdrawn ? 'is-def' : isConfirmed ? 'is-checked' : ''} ${isDimmed ? 'is-dim' : ''} ${isHighlighted ? 'is-hit' : ''}`}
        style={{ left: x, top: y, width: w, height: h }}>
        <div className="ent-slot__no">{num}</div>
        {slot.seed > 0 && <div className="ent-seed">{slot.seed}</div>}
        <div className="ent-slot__body">
          {slot.entry ? (
            <button onClick={() => handleCheckIn(slot)} className="ent-slot__main" title={isWithdrawn ? '復元する' : isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}>
              <span className="ent-slot__name">
                {slot.playerName}{slot.partnerName && <span className="ent-slot__partner"> / {slot.partnerName}</span>}
              </span>
              {slot.affiliation && !isWithdrawn && <span className="ent-slot__aff">{slot.affiliation}</span>}
            </button>
          ) : <span className="ent-slot__none">{slot.sourceLabel || '---'}</span>}
        </div>
        {slot.entry && (
          <div className="ent-slot__acts">
            {isWithdrawn ? (
              <>
                <span className="ent-slot__def">DEF</span>
                <button onClick={(e) => { e.stopPropagation(); handleRestore(slot); }} className="ent-ico" title="復元する"><RotateCcw className="w-3.5 h-3.5" /></button>
              </>
            ) : (
              <>
                <button onClick={(e) => { e.stopPropagation(); handleCheckIn(slot); }} className={`ent-ico ${isConfirmed ? 'is-on' : ''}`} title={isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}><UserPlus className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); handleMarkBye(slot); }} className="ent-ico" title="DEFにする"><Ban className="w-3.5 h-3.5" /></button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  /** 一覧の 1 行（細い罫で区切る。名前は大きく・所属は小さく・状態の札・受付ボタン） */
  const renderPlayerRow = (slot: CheckInSlot, num: number, matches: Set<number>) => {
    const { isWithdrawn, isConfirmed, isDimmed, isHighlighted } = slotState(slot, matches);
    return (
      <li key={`row-${slot.drawPosition}`}
        className={`ent-row ${isWithdrawn ? 'is-def' : isConfirmed ? 'is-checked' : ''} ${isDimmed ? 'is-dim' : ''} ${isHighlighted ? 'is-hit' : ''}`}>
        <span className="ent-row__no">{num}</span>
        <button onClick={() => handleCheckIn(slot)} className="ent-row__main" title={isWithdrawn ? '復元する' : isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}>
          <span className="ent-row__name">
            {slot.seed > 0 && <span className="ent-seed" title={`第${slot.seed}シード`}>{slot.seed}</span>}
            <span className="ent-row__nm">{slot.playerName}{slot.partnerName && <span className="ent-row__partner"> / {slot.partnerName}</span>}</span>
          </span>
          <span className="ent-row__meta">
            <span className={`ent-st ${isWithdrawn ? 'ent-st--def' : isConfirmed ? 'ent-st--on' : ''}`}>
              {isWithdrawn ? 'DEF' : isConfirmed ? '受付済' : '未受付'}
            </span>
            {slot.affiliation && <span className="ent-row__aff">{slot.affiliation}</span>}
          </span>
        </button>
        <span className="ent-row__acts">
          {isWithdrawn ? (
            <button onClick={(e) => { e.stopPropagation(); handleRestore(slot); }} className="btn btn--outline sk-btn ent-row__btn" title="復元する">
              <RotateCcw className="w-4 h-4" />復元
            </button>
          ) : (
            <>
              <button onClick={(e) => { e.stopPropagation(); handleCheckIn(slot); }}
                className={`btn sk-btn ent-row__btn ${isConfirmed ? 'btn--primary' : 'btn--outline'}`}
                aria-pressed={isConfirmed}
                title={isConfirmed ? '受付済み → 未確認に戻す' : 'クリックで受付'}>
                {isConfirmed ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {isConfirmed ? '受付済' : '受付'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleMarkBye(slot); }} className="ent-ico ent-ico--lg" title="DEFにする" aria-label="DEFにする">
                <Ban className="w-4 h-4" />
              </button>
            </>
          )}
        </span>
      </li>
    );
  };

  /** 選手の一覧（BYE と空き枠は出さない。番号はドロー図の枠番号と同じ数え方） */
  const renderPlayerList = (slots: CheckInSlot[]) => {
    const matches = getSearchMatchSet(slots);
    const rows: React.ReactNode[] = [];
    let vi = 0;
    for (const slot of slots.slice().sort((a, b) => a.drawPosition - b.drawPosition)) {
      if (slot.isBye && !slot.entry) continue;
      vi++;
      if (!slot.entry) continue;
      rows.push(renderPlayerRow(slot, vi, matches));
    }
    if (rows.length === 0) return <div className="ent-none">選手がいません</div>;
    return <ul className="rlist ent-list">{rows}</ul>;
  };

  // ===== League / Round-robin table =====
  const renderLeagueTable = (eventId: string, slots: CheckInSlot[]) => {
    const draw = drawMap.get(eventId);
    const searchMatches = getSearchMatchSet(slots);
    const playerSlots = slots.filter(s => s.entry && !(s.isBye && !s.entry));

    if (playerSlots.length === 0) {
      return <div className="ent-none">リーグデータがありません</div>;
    }

    // 開始時刻: 確定済みなら試合の予定時刻、無ければドロー表記載の開始時刻
    const leagueStartTime = (() => {
      const times = allMatches
        .filter(m => m.eventId === eventId && m.scheduledTime)
        .map(m => m.scheduledTime as string)
        .filter(t => /^\d{1,2}:\d{2}$/.test(t));
      if (times.length > 0) return times.reduce((a, b) => (toMinutes(a) <= toMinutes(b) ? a : b));
      return draw?.eventStartTime || '';
    })();

    return (
      <div>
        {draw && (
          <div className="ent-stats">
            <span>リーグ <b>{playerSlots.length}人</b></span>
            {leagueStartTime && (
              <span className="ent-stats__time"><Clock className="w-3.5 h-3.5" />開始 <b>{leagueStartTime}</b>〜</span>
            )}
          </div>
        )}
        <ul className="rlist ent-list">
          {playerSlots.map((slot, idx) => renderPlayerRow(slot, idx + 1, searchMatches))}
        </ul>
      </div>
    );
  };

  // ===== 全画面の対戦表（サイトのドロー表の形。ズーム・スワイプで動かし、選手をタップで受付。上の札で種目を切り替える） =====
  const openSheet = () => {
    const byNav = events.find(e => e.name === activeNavName)?.eventId;
    setSheetEventId((!showAllEvents && selectedEventId) || byNav || events[0]?.eventId || null);
  };
  const renderSheetScreen = () => {
    if (!sheetEventId) return null;
    const idx = Math.max(0, events.findIndex(e => e.eventId === sheetEventId));
    const ev = events[idx];
    if (!ev) return null;
    const slots = buildSlotsForEvent(ev.eventId);
    const stats = computeStats(slots);
    const go = (d: number) => { const n = events[(idx + d + events.length) % events.length]; if (n) setSheetEventId(n.eventId); };
    return createPortal(
      <div className="ent-ss" role="dialog" aria-modal="true" aria-label="対戦表で受付">
        <div className="ent-ss__head">
          <div className="ent-ss__ttl">
            <span className="ent-ss__en">ENTRY ・ 対戦表</span>
            <span className="ent-ss__tally"><b>{stats.checkedIn}</b>/{stats.total} 受付{stats.absent > 0 && <em> ・ DEF {stats.absent}</em>} ・ 未受付 {stats.remaining}</span>
          </div>
          <button type="button" className="ent-ss__x" onClick={() => setSheetEventId(null)} aria-label="対戦表を閉じる"><X className="w-5 h-5" /></button>
        </div>
        <div className="ent-ss__nav">
          <button type="button" className="ent-ss__arrow" onClick={() => go(-1)} aria-label="前の種目"><ChevronLeft className="w-5 h-5" /></button>
          <div className="ent-ss__chips" role="tablist" aria-label="種目">
            {events.map(e => {
              const st = computeStats(buildSlotsForEvent(e.eventId));
              const on = e.eventId === ev.eventId;
              return (
                <button key={e.eventId} role="tab" aria-selected={on} className={`ent-ss__chip ${on ? 'is-on' : ''} ${confirmedEventsSet.has(e.eventId) ? 'is-done' : ''}`}
                  ref={on ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'center' }) : undefined}
                  onClick={() => setSheetEventId(e.eventId)}>
                  {confirmedEventsSet.has(e.eventId) && <Lock className="w-3 h-3" />}{e.name}<small>{st.checkedIn}/{st.total}</small>
                </button>
              );
            })}
          </div>
          <button type="button" className="ent-ss__arrow" onClick={() => go(1)} aria-label="次の種目"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="ent-ss__body">{renderSheet(ev.eventId, slots)}</div>
      </div>,
      document.body,
    );
  };

  // ===== 対戦表（サイトのドロー表の形。ズームして、選手をタップすると確認ダイアログ） =====
  const renderSheet = (eventId: string, slots: CheckInSlot[]) => {
    const draw = drawMap.get(eventId);
    const event = events.find(e => e.eventId === eventId);
    if (slots.length === 0) return <div className="ent-none">ドローデータがありません</div>;
    const ds = draw?.drawSize || slots.length;
    const isLeague = draw?.drawType === 'roundRobin' || (ds > 0 && (ds & (ds - 1)) !== 0) || /リーグ/.test(event?.name || '');
    const sheetSlots: SheetSlot[] = slots.map(s => ({
      position: s.drawPosition,
      seed: s.seed,
      isBye: s.isBye,
      hasEntry: !!s.entry,
      name: s.playerName,
      partner: s.partnerName,
      affiliation: s.affiliation,
      label: s.sourceLabel,
      state: s.entry?.status === 'withdrawn' ? 'def' : s.entryId && confirmedIds.has(s.entryId) ? 'checked' : 'none',
    }));
    return (
      <div className="ent-ss__sheet">
        <EntrySheet
          key={eventId}
          fill
          eventName={event?.name || ''}
          drawSize={ds}
          isLeague={isLeague}
          doubles={event?.type === 'Doubles' || slots.some(s => !!s.partnerName)}
          slots={sheetSlots}
          matchTimes={draw?.matchTimes}
          onTap={(position) => setSheetTap({ eventId, position })}
        />
      </div>
    );
  };

  // ===== SVG Bracket-based draw view =====
  const renderDrawTable = (eventId: string, slots: CheckInSlot[]) => {
    const draw = drawMap.get(eventId);
    const searchMatches = getSearchMatchSet(slots);

    const event = events.find(e => e.eventId === eventId);
    const eventType = event?.type as string | undefined;
    const ds = draw?.drawSize || 0;
    const isPowerOf2 = ds > 0 && (ds & (ds - 1)) === 0;
    const isLeague =
      eventType === 'league' || eventType === 'round-robin' ||
      draw?.drawType === 'roundRobin' ||
      (ds > 0 && !isPowerOf2) ||
      /リーグ/i.test(event?.name || '');
    if (isLeague) return renderLeagueTable(eventId, slots);

    if (slots.length === 0) {
      return <div className="ent-none">ドローデータがありません</div>;
    }

    // Bracket constants - コンパクトに収める
    const SLOT_HEIGHT = 36;
    const SLOT_WIDTH = 220;
    const Y_SPACING = 44;
    const X_SPACING = 50; // スロット間のギャップ（線のみ）
    const OFFSET_X = 28;
    const OFFSET_Y = 24;

    const drawSize = draw?.drawSize || (slots.length <= 1 ? 2 : Math.pow(2, Math.ceil(Math.log2(slots.length))));
    // DBに保存された位置をそのまま使用する
    const displaySlots = slots.slice().sort((a, b) => a.drawPosition - b.drawPosition);
    const halfSize = drawSize / 2;

    // === 試合開始時刻 ===
    // 確定済みなら試合(matches)の予定時刻を、未確定ならドロー表記載の時刻を表示する。
    // matches.position は各ラウンド内の通し番号（左山→右山、上から下）。
    const scheduledByRoundPos = new Map<string, string>();
    for (const m of allMatches) {
      if (m.eventId !== eventId || !m.scheduledTime) continue;
      scheduledByRoundPos.set(`${m.round}|${m.position}`, m.scheduledTime);
    }
    /**
     * 試合の開始時刻を取得する。
     * @param round 1始まりの回戦
     * @param matchNumInRound 回戦内の通し番号（1始まり・左山→右山）
     * @param upperPosition 1回戦の場合のペア上側ブラケット位置
     */
    const getMatchTime = (round: number, matchNumInRound: number, upperPosition: number): string => {
      const scheduled = scheduledByRoundPos.get(`${round}|${matchNumInRound}`);
      if (scheduled) return scheduled;
      if (round === 1) return draw?.matchTimes?.[upperPosition] || '';
      return draw?.roundMatchTimes?.[`R${round}-${matchNumInRound}`] || '';
    };
    /** 種目内の最も早い開始時刻（ヘッダー表示用） */
    const earliestMatchTime = (() => {
      const all = [
        ...scheduledByRoundPos.values(),
        ...Object.values(draw?.matchTimes || {}),
        ...Object.values(draw?.roundMatchTimes || {}),
      ].filter(t => /^\d{1,2}:\d{2}$/.test(t));
      if (all.length === 0) return '';
      return all.reduce((a, b) => (toMinutes(a) <= toMinutes(b) ? a : b));
    })();

    /** 開始時刻ラベル（ブラケット線の上に表示） */
    const timeLabel = (
      key: string, x: number, y: number, time: string, size: 'sm' | 'md',
    ): React.ReactNode => (
      <div key={key}
        className={`ent-time ent-time--${size}`}
        style={{ left: x, top: y, transform: 'translate(-50%, -115%)' }}>
        {time}
      </div>
    );

    const LINE_ONLY_W = 40;
    const getX = (r: number): number => {
      if (r === 0) return OFFSET_X;
      return OFFSET_X + SLOT_WIDTH + X_SPACING + (r - 1) * LINE_ONLY_W;
    };
    const getSlotW = (r: number): number => r === 0 ? SLOT_WIDTH : LINE_ONLY_W;

    // === ブラケットセクション描画ヘルパー（左山/右山それぞれ独立描画） ===
    const renderBracketSection = (
      sectionSlots: CheckInSlot[],
      sectionDrawSize: number,
      globalVisibleOffset: number,
      keyPrefix: string,
      label?: { text: string },
      /** このセクション先頭のブラケット位置オフセット（右山なら halfSize） */
      positionOffset = 0,
    ) => {
      const sectionRoundsCount = Math.log2(sectionDrawSize);
      const isBye = (i: number): boolean => {
        const s = i < sectionSlots.length ? sectionSlots[i] : null;
        return !s || (s.isBye && !s.entry);
      };

      // ラウンドr、位置iのサブツリーが全てBYEかを再帰的にチェック
      const isEmptySubtree = (r: number, i: number): boolean => {
        if (r === 0) return isBye(i);
        return isEmptySubtree(r - 1, i * 2) && isEmptySubtree(r - 1, i * 2 + 1);
      };

      // Y位置計算（セクション内で独立）
      const r0Y: number[] = new Array(sectionDrawSize).fill(0);
      let nextY = OFFSET_Y;
      for (let mi = 0; mi < sectionDrawSize / 2; mi++) {
        const t = mi * 2, b = mi * 2 + 1;
        const tBye = isBye(t), bBye = isBye(b);
        if (tBye && bBye) { r0Y[t] = nextY; r0Y[b] = nextY; }
        else if (tBye) { r0Y[t] = nextY; r0Y[b] = nextY; nextY += Y_SPACING; }
        else if (bBye) { r0Y[t] = nextY; r0Y[b] = nextY; nextY += Y_SPACING; }
        else { r0Y[t] = nextY; r0Y[b] = nextY + Y_SPACING; nextY += Y_SPACING * 2; }
      }

      const getY = (r: number, i: number): number => {
        if (r === 0) return r0Y[i];
        return (getY(r - 1, i * 2) + getY(r - 1, i * 2 + 1)) / 2;
      };

      const secWidth = getX(sectionRoundsCount) + OFFSET_X;
      const secHeight = nextY + SLOT_HEIGHT;

      // SVG ブラケット線
      const paths: React.ReactNode[] = [];
      // 試合開始時刻ラベル（線の上に重ねて表示）
      const timeLabels: React.ReactNode[] = [];
      for (let r = 0; r < sectionRoundsCount; r++) {
        const nm = sectionDrawSize / Math.pow(2, r + 1);
        for (let m = 0; m < nm; m++) {
          const topEmpty = isEmptySubtree(r, m * 2);
          const botEmpty = isEmptySubtree(r, m * 2 + 1);
          if (topEmpty && botEmpty) continue;

          const xS = r === 0 ? getX(r) + getSlotW(r) : getX(r);
          const xN = getX(r + 1);
          const xM = (xS + xN) / 2;
          const yT = getY(r, m * 2) + SLOT_HEIGHT / 2;
          const yB = getY(r, m * 2 + 1) + SLOT_HEIGHT / 2;
          const yM = getY(r + 1, m) + SLOT_HEIGHT / 2;

          // この試合の開始時刻（両者が揃う＝実際に試合が行われる枠のみ表示）
          if (!topEmpty && !botEmpty) {
            const round = r + 1;
            const mnr = positionOffset / Math.pow(2, round) + m + 1;
            const upperPos = positionOffset + m * Math.pow(2, round) + 1;
            const t = getMatchTime(round, mnr, upperPos);
            if (t) timeLabels.push(timeLabel(`${keyPrefix}-t-r${r}-m${m}`, xM, yM, t, 'sm'));
          }

          if (topEmpty || botEmpty) {
            // 片方が全BYEサブツリー → 次ラウンドのY位置まで接続
            const pY = topEmpty ? yB : yT;
            if (Math.abs(pY - yM) < 1) {
              paths.push(<path key={`${keyPrefix}-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xN} ${pY}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
            } else {
              paths.push(<path key={`${keyPrefix}-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xM} ${pY} L ${xM} ${yM} L ${xN} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
            }
            continue;
          }

          paths.push(<path key={`${keyPrefix}-r${r}-m${m}-t`} d={`M ${xS} ${yT} L ${xM} ${yT} L ${xM} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
          paths.push(<path key={`${keyPrefix}-r${r}-m${m}-b`} d={`M ${xS} ${yB} L ${xM} ${yB} L ${xM} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
          paths.push(<path key={`${keyPrefix}-r${r}-m${m}-c`} d={`M ${xM} ${yM} L ${xN} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
        }
      }

      // 選手スロット描画
      const elems: React.ReactNode[] = [];
      let vi = globalVisibleOffset;
      for (let i = 0; i < sectionDrawSize; i++) {
        const slot = i < sectionSlots.length ? sectionSlots[i] : null;
        if (!slot || (slot.isBye && !slot.entry)) continue;
        vi++;
        const x = getX(0), y = r0Y[i];
        elems.push(renderSlotBox(slot, x, y, SLOT_WIDTH, SLOT_HEIGHT, vi, keyPrefix, 'sm', searchMatches));
      }

      // Left/Right ラベル
      const labelEl = label ? (
        <div className="ent-side"
          style={{ left: 0, top: OFFSET_Y, width: 22, height: Math.max(nextY - OFFSET_Y, 40) }}>
          <span>{label.text}</span>
        </div>
      ) : null;

      return (
        <div className="ent-bracket">
          <div className="relative" style={{ width: secWidth, height: secHeight, minWidth: secWidth }}>
            {labelEl}
            <svg className="absolute inset-0 pointer-events-none" width={secWidth} height={secHeight}>{paths}</svg>
            {timeLabels}
            {elems}
          </div>
        </div>
      );
    };

    // === PC統一ブラケット（左山→中央←右山・レスポンシブ幅） ===
    const renderUnifiedBracket = () => {
      const leftSlotsU = displaySlots.slice(0, halfSize);
      const rightSlotsU = displaySlots.slice(halfSize);
      const halfRounds = Math.log2(halfSize);

      // レスポンシブ: 表示領域幅に合わせてブラケット線の間隔を自動計算
      const containerW = bracketWidth || 900;
      const PC_SLOT_W = 240; // PC用：少し広めのスロット幅
      const PC_SLOT_H = 40;  // PC用：少し高めのスロット高さ
      const PC_OFFSET_X = 16;
      // 固定幅 = 両端のスロット + パディング
      const fixedW = 2 * (PC_OFFSET_X + PC_SLOT_W);
      // 可変幅 = 中央ギャップ + 各半分のラウンド間隔
      const flexW = Math.max(containerW - fixedW, halfRounds * 2 * 30 + 40);
      // 1ラウンド分の間隔（各半分 halfRounds 個 + 中央ギャップ1個）
      const totalSegments = halfRounds * 2 + 1;
      const segW = flexW / totalSegments;
      const dynLineW = segW;   // 各ラウンド間の線幅
      const dynCenterGap = segW; // 中央ギャップ

      // 動的X位置計算（左半分用）
      const gxL = (r: number): number => {
        if (r === 0) return PC_OFFSET_X;
        return PC_OFFSET_X + PC_SLOT_W + (r - 1) * dynLineW + dynLineW;
      };
      // 左半分の最終X（準決勝出力位置）
      const leftEndX = gxL(halfRounds);
      const totalW = leftEndX + dynCenterGap + leftEndX; // 対称

      // mirrorX
      const mx = (x: number) => totalW - x;

      // Y位置計算ヘルパー
      const calcHalfY = (sectionSlots: CheckInSlot[], sectionSize: number) => {
        const isByeFn = (i: number): boolean => {
          const s = i < sectionSlots.length ? sectionSlots[i] : null;
          return !s || (s.isBye && !s.entry);
        };
        const r0Y: number[] = new Array(sectionSize).fill(0);
        let nextY = OFFSET_Y;
        for (let mi = 0; mi < sectionSize / 2; mi++) {
          const t = mi * 2, b = mi * 2 + 1;
          const tBye = isByeFn(t), bBye = isByeFn(b);
          if (tBye && bBye) { r0Y[t] = nextY; r0Y[b] = nextY; }
          else if (tBye) { r0Y[t] = nextY; r0Y[b] = nextY; nextY += Y_SPACING; }
          else if (bBye) { r0Y[t] = nextY; r0Y[b] = nextY; nextY += Y_SPACING; }
          else { r0Y[t] = nextY; r0Y[b] = nextY + Y_SPACING; nextY += Y_SPACING * 2; }
        }
        const getYFn = (r: number, i: number): number => {
          if (r === 0) return r0Y[i];
          return (getYFn(r - 1, i * 2) + getYFn(r - 1, i * 2 + 1)) / 2;
        };
        const isEmptySubtreeFn = (r: number, i: number): boolean => {
          if (r === 0) return isByeFn(i);
          return isEmptySubtreeFn(r - 1, i * 2) && isEmptySubtreeFn(r - 1, i * 2 + 1);
        };
        return { r0Y, getY: getYFn, height: nextY + PC_SLOT_H, isBye: isByeFn, isEmptySubtree: isEmptySubtreeFn };
      };

      const leftCalc = calcHalfY(leftSlotsU, halfSize);
      const rightCalc = calcHalfY(rightSlotsU, halfSize);
      const maxHeight = Math.max(leftCalc.height, rightCalc.height);
      const leftYOff = (maxHeight - leftCalc.height) / 2;
      const rightYOff = (maxHeight - rightCalc.height) / 2;

      const paths: React.ReactNode[] = [];
      // 試合開始時刻ラベル（線の上に重ねて表示）
      const timeLabels: React.ReactNode[] = [];

      // --- 左半分のブラケット線 ---
      for (let r = 0; r < halfRounds; r++) {
        const nm = halfSize / Math.pow(2, r + 1);
        for (let m = 0; m < nm; m++) {
          const topEmpty = leftCalc.isEmptySubtree(r, m * 2);
          const botEmpty = leftCalc.isEmptySubtree(r, m * 2 + 1);
          if (topEmpty && botEmpty) continue;

          const xS = r === 0 ? gxL(0) + PC_SLOT_W : gxL(r);
          const xN = gxL(r + 1);
          const xM = (xS + xN) / 2;
          const yT = leftCalc.getY(r, m * 2) + PC_SLOT_H / 2 + leftYOff;
          const yB = leftCalc.getY(r, m * 2 + 1) + PC_SLOT_H / 2 + leftYOff;
          const yM = leftCalc.getY(r + 1, m) + PC_SLOT_H / 2 + leftYOff;

          if (!topEmpty && !botEmpty) {
            const round = r + 1;
            const t = getMatchTime(round, m + 1, m * Math.pow(2, round) + 1);
            if (t) timeLabels.push(timeLabel(`UL-t-r${r}-m${m}`, xM, yM, t, 'md'));
          }

          if (topEmpty || botEmpty) {
            const pY = topEmpty ? yB : yT;
            if (Math.abs(pY - yM) < 1) {
              paths.push(<path key={`L-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xN} ${pY}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
            } else {
              paths.push(<path key={`L-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xM} ${pY} L ${xM} ${yM} L ${xN} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
            }
            continue;
          }

          paths.push(<path key={`L-r${r}-m${m}-t`} d={`M ${xS} ${yT} L ${xM} ${yT} L ${xM} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
          paths.push(<path key={`L-r${r}-m${m}-b`} d={`M ${xS} ${yB} L ${xM} ${yB} L ${xM} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
          paths.push(<path key={`L-r${r}-m${m}-c`} d={`M ${xM} ${yM} L ${xN} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
        }
      }

      // --- 右半分のブラケット線（X座標ミラー） ---
      for (let r = 0; r < halfRounds; r++) {
        const nm = halfSize / Math.pow(2, r + 1);
        for (let m = 0; m < nm; m++) {
          const topEmpty = rightCalc.isEmptySubtree(r, m * 2);
          const botEmpty = rightCalc.isEmptySubtree(r, m * 2 + 1);
          if (topEmpty && botEmpty) continue;

          const xS = r === 0 ? mx(gxL(0) + PC_SLOT_W) : mx(gxL(r));
          const xN = mx(gxL(r + 1));
          const xM = (xS + xN) / 2;
          const yT = rightCalc.getY(r, m * 2) + PC_SLOT_H / 2 + rightYOff;
          const yB = rightCalc.getY(r, m * 2 + 1) + PC_SLOT_H / 2 + rightYOff;
          const yM = rightCalc.getY(r + 1, m) + PC_SLOT_H / 2 + rightYOff;

          if (!topEmpty && !botEmpty) {
            const round = r + 1;
            const mnr = halfSize / Math.pow(2, round) + m + 1;
            const t = getMatchTime(round, mnr, halfSize + m * Math.pow(2, round) + 1);
            if (t) timeLabels.push(timeLabel(`UR-t-r${r}-m${m}`, xM, yM, t, 'md'));
          }

          if (topEmpty || botEmpty) {
            const pY = topEmpty ? yB : yT;
            if (Math.abs(pY - yM) < 1) {
              paths.push(<path key={`R-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xN} ${pY}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
            } else {
              paths.push(<path key={`R-r${r}-m${m}-bye`} d={`M ${xS} ${pY} L ${xM} ${pY} L ${xM} ${yM} L ${xN} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
            }
            continue;
          }

          paths.push(<path key={`R-r${r}-m${m}-t`} d={`M ${xS} ${yT} L ${xM} ${yT} L ${xM} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
          paths.push(<path key={`R-r${r}-m${m}-b`} d={`M ${xS} ${yB} L ${xM} ${yB} L ${xM} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
          paths.push(<path key={`R-r${r}-m${m}-c`} d={`M ${xM} ${yM} L ${xN} ${yM}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
        }
      }

      // --- 決勝接続線（左SF→中央←右SF） ---
      const leftFinalY = leftCalc.getY(halfRounds, 0) + PC_SLOT_H / 2 + leftYOff;
      const rightFinalX = mx(leftEndX);
      const rightFinalY = rightCalc.getY(halfRounds, 0) + PC_SLOT_H / 2 + rightYOff;
      const centerX = totalW / 2;
      // 左から水平にcenterXへ → 縦線 → 右から水平にcenterXへ（Excel標準ブラケットパターン）
      if (Math.abs(leftFinalY - rightFinalY) < 1) {
        // 左右同じ高さ → 一本の直線
        paths.push(<path key="final-line" d={`M ${leftEndX} ${leftFinalY} L ${rightFinalX} ${rightFinalY}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
      } else {
        // 左から水平 → 中央で縦 → 右へ水平
        paths.push(<path key="final-line" d={`M ${leftEndX} ${leftFinalY} L ${centerX} ${leftFinalY} L ${centerX} ${rightFinalY} L ${rightFinalX} ${rightFinalY}`} fill="none" stroke="#a6a6a6" strokeWidth="1.5" />);
      }
      // 決勝の開始時刻
      {
        const finalRound = Math.log2(drawSize);
        const finalTime = getMatchTime(finalRound, 1, 1);
        if (finalTime) {
          timeLabels.push(timeLabel('UF-t', centerX, Math.min(leftFinalY, rightFinalY), finalTime, 'md'));
        }
      }

      // --- スロット描画ヘルパー ---
      const renderSlot = (slot: CheckInSlot, x: number, y: number, viNum: number, keyPrefix: string) =>
        renderSlotBox(slot, x, y, PC_SLOT_W, PC_SLOT_H, viNum, keyPrefix, 'md', searchMatches);

      // --- 左半分の選手スロット ---
      const elems: React.ReactNode[] = [];
      let vi = 0;
      for (let i = 0; i < halfSize; i++) {
        const slot = i < leftSlotsU.length ? leftSlotsU[i] : null;
        if (!slot || (slot.isBye && !slot.entry)) continue;
        vi++;
        elems.push(renderSlot(slot, gxL(0), leftCalc.r0Y[i] + leftYOff, vi, 'UL'));
      }

      // --- 右半分の選手スロット ---
      for (let i = 0; i < halfSize; i++) {
        const slot = i < rightSlotsU.length ? rightSlotsU[i] : null;
        if (!slot || (slot.isBye && !slot.entry)) continue;
        vi++;
        const x = mx(gxL(0)) - PC_SLOT_W;
        elems.push(renderSlot(slot, x, rightCalc.r0Y[i] + rightYOff, vi, 'UR'));
      }

      return (
        <div className="relative" style={{ width: totalW, height: maxHeight, minWidth: totalW }}>
          <svg className="absolute inset-0 pointer-events-none" width={totalW} height={maxHeight}>{paths}</svg>
          {timeLabels}
          {elems}
        </div>
      );
    };

    // 統計ヘッダー
    const statsHeader = draw ? (
      <div className="ent-stats">
        <span>ドロー <b>{draw.drawSize}</b></span>
        <span>エントリー <b>{slots.filter(s => s.entry && !s.isBye).length}</b></span>
        <span className="ent-stats__def">DEF <b>{slots.filter(s => s.entry?.status === 'withdrawn').length}</b></span>
        {earliestMatchTime && (
          <span className="ent-stats__time"><Clock className="w-3.5 h-3.5" />開始 <b>{earliestMatchTime}</b>〜</span>
        )}
      </div>
    ) : null;

    // 一覧表示（スマホの既定）：細い罫の行で受付する。あたり修正中の種目はドロー図で確かめられるよう図を出す
    if (viewMode === 'list' && drawEdit?.eventId !== eventId) {
      return (
        <div>
          {statsHeader}
          {renderPlayerList(slots)}
        </div>
      );
    }

    // ドローサイズ < 8 は単一表示、8以上はPC統一/スマホ分割
    if (drawSize < 8) {
      return (
        <div>
          {statsHeader}
          {renderBracketSection(displaySlots, drawSize, 0, 'full')}
        </div>
      );
    }

    // 左山・右山に分割
    const leftSlots = displaySlots.slice(0, halfSize);
    const rightSlots = displaySlots.slice(halfSize);
    let leftVisCount = 0;
    for (const s of leftSlots) {
      if (s && !(s.isBye && !s.entry)) leftVisCount++;
    }

    return (
      <div>
        {statsHeader}
        {/* PC: 左山→中央←右山の統一ブラケット（レスポンシブ幅） */}
        <div className="hidden lg:block ent-bracket">
          {renderUnifiedBracket()}
        </div>
        {/* スマホ: 左山・右山を分割表示 */}
        <div className="lg:hidden">
          {renderBracketSection(leftSlots, halfSize, 0, 'left', { text: 'Left side' })}
          {renderBracketSection(rightSlots, halfSize, leftVisCount, 'right', { text: 'Right side' }, halfSize)}
        </div>
      </div>
    );
  };

  // ===== Event Section =====
  // === あたり修正の操作 ===
  const startDrawEdit = useCallback((eventId: string) => {
    const draw = drawMap.get(eventId);
    if (!draw) return;
    setDrawEdit({ eventId, slots: draw.slots.slice().sort((a, b) => a.position - b.position).map(s => ({ ...s })) });
    setDrawEditHistory([]);
    setEditSelectedPos(null);
  }, [drawMap]);

  const cancelDrawEdit = useCallback(() => {
    setDrawEdit(null);
    setDrawEditHistory([]);
    setEditSelectedPos(null);
  }, []);

  const pushDrawEdit = useCallback((next: Draw['slots']) => {
    setDrawEdit(cur => {
      if (!cur) return cur;
      setDrawEditHistory(h => [...h, cur.slots]);
      return { ...cur, slots: next };
    });
  }, []);

  const undoDrawEdit = useCallback(() => {
    if (drawEditHistory.length === 0) return;
    const prev = drawEditHistory[drawEditHistory.length - 1];
    setDrawEdit(cur => (cur ? { ...cur, slots: prev } : cur));
    setDrawEditHistory(h => h.slice(0, -1));
    setEditSelectedPos(null);
  }, [drawEditHistory]);

  /** 枠のタップ: 1つ目で選択、2つ目で入れ替え */
  const handleEditSlotTap = useCallback((position: number) => {
    if (!drawEdit) return;
    if (editSelectedPos == null) { setEditSelectedPos(position); return; }
    if (editSelectedPos === position) { setEditSelectedPos(null); return; }
    pushDrawEdit(swapSlotContents(drawEdit.slots, editSelectedPos, position));
    setEditSelectedPos(null);
  }, [drawEdit, editSelectedPos, pushDrawEdit]);

  /**
   * 空き枠をまとめて挿入する。
   * 「4枠ずつのまとまり」の境目に合わせるには複数個ずらす必要があるため、
   * 個数を指定して一度に動かせるようにする。
   */
  const handleEditInsertGap = useCallback((position: number, count = 1) => {
    if (!drawEdit) return;
    let slots = drawEdit.slots;
    for (let i = 0; i < count; i++) {
      const { slots: next, error } = insertGapAt(slots, position);
      if (error) {
        if (i === 0) { alert(error); return; }
        alert(`${i}つ分だけずらしました（${error}）`);
        break;
      }
      slots = next;
    }
    pushDrawEdit(slots);
    // 選択は残す（続けてずらせるように）
  }, [drawEdit, pushDrawEdit]);

  const handleEditRemoveGap = useCallback((position: number, count = 1) => {
    if (!drawEdit) return;
    let slots = drawEdit.slots;
    for (let i = 0; i < count; i++) {
      const target = slots.find(s => s.position === position);
      if (!target || !isEmptySlot(target)) break;
      slots = removeGapAt(slots, position);
    }
    pushDrawEdit(slots);
    // 選択は残す（続けて詰められるように）
  }, [drawEdit, pushDrawEdit]);

  /**
   * まとまり（4枠）の型を適用する。
   * そのまとまり以降の選手を順番どおりに並べ直すので、
   * ドロー表を見ながら上から順に型を選べば同じ並びになる。
   */
  const handleBlockPattern = useCallback((blockStart: number, pattern: BlockPattern) => {
    if (!drawEdit || !pattern) return;
    const { slots: next, error } = applyBlockPattern(drawEdit.slots, blockStart, pattern);
    if (error) { alert(error); return; }
    pushDrawEdit(next);
    setEditSelectedPos(null);
  }, [drawEdit, pushDrawEdit]);

  /**
   * まとまりの型をまとめて指定して並べ替える。
   * 例: "4,空,2,3下,4,空,2,3下,3上,2,4,空,3上,2,4,空"
   */
  const handleApplyPatternText = useCallback(() => {
    if (!drawEdit) return;
    const { patterns, error } = parseBlockPatterns(patternText);
    if (error) { alert(error); return; }
    const r = applyBlockPatterns(drawEdit.slots, patterns);
    if (r.error) { alert(r.error); return; }
    pushDrawEdit(r.slots);
    setEditSelectedPos(null);
  }, [drawEdit, patternText, pushDrawEdit]);

  /** あたり修正を保存し、対戦表を組み直す（入力済みスコアは可能な限り引き継ぐ） */
  const saveDrawEdit = useCallback(async () => {
    if (!drawEdit) return;
    const { eventId, slots: nextSlots } = drawEdit;
    const draw = drawMap.get(eventId);
    if (!draw?.id) return;

    // 対戦カードが変わって結果が消える試合を先に知らせる
    const existing = allMatches.filter(m => m.eventId === eventId);
    if (existing.length > 0) {
      const draftDraw = { ...draw, slots: nextSlots };
      const isLeague = await isLeagueEvent(eventId, draftDraw);
      const nextMatches = await buildMatchesFromDraw(eventId, draftDraw, isLeague);
      const lost = findResetMatches(nextMatches, existing);
      if (lost.length > 0) {
        const names = lost.slice(0, 5).map(m => `・${m.player1Name} vs ${m.player2Name}（${m.score || '結果あり'}）`).join('\n');
        const more = lost.length > 5 ? `\n…ほか${lost.length - 5}試合` : '';
        const ok = await requestConfirm({
          title: 'あたりの修正',
          message: `対戦の組み合わせが変わるため、次の試合の結果は取り消されます。\n\n${names}${more}\n\n保存してよろしいですか？`,
          danger: true,
          confirmLabel: '保存する',
        });
        if (!ok) return;
      }
    }

    setSavingDrawEdit(true);
    try {
      await db.draws.update(draw.id, { slots: nextSlots, updatedAt: Date.now() });
      // 対戦表があるときだけ組み直す（未確定なら確定時に作られる）
      if (existing.length > 0) await rebuildEventMatches(eventId);
      cancelDrawEdit();
    } catch (e) {
      console.error('[あたり修正] 保存に失敗:', e);
      alert('保存に失敗しました');
    } finally {
      setSavingDrawEdit(false);
    }
  }, [drawEdit, drawMap, allMatches, requestConfirm, cancelDrawEdit]);

  /**
   * あたり修正パネル。
   * 「4枠ずつのまとまり（＝2回戦で当たる相手が決まる単位）」で区切って並べ、
   * 手書きのドロー表と同じ形にできるようにする。
   */
  const renderDrawEditor = (eventId: string, slots: CheckInSlot[]) => {
    if (!drawEdit || drawEdit.eventId !== eventId) return null;
    const selected = editSelectedPos != null
      ? drawEdit.slots.find(s => s.position === editSelectedPos)
      : undefined;
    const selectedIsEmpty = !!selected && isEmptySlot(selected);
    const byPos = new Map(slots.map(s => [s.drawPosition, s]));

    /** 4枠ごと（2回戦のまとまり）に区切ったブロック */
    const blocks: number[][] = [];
    for (let p = 1; p <= drawEdit.slots.length; p += 4) {
      blocks.push(drawEdit.slots.slice(p - 1, p + 3).map(s => s.position));
    }
    // 列の切れ目が「次の回戦で合流するまとまり」を割らないように偶数個で分ける
    const half = Math.ceil(blocks.length / 4) * 2;

    const slotButton = (pos: number) => {
      const s = byPos.get(pos);
      const raw = drawEdit.slots.find(x => x.position === pos);
      const empty = !raw || isEmptySlot(raw);
      const name = empty
        ? '空き'
        : [s?.playerName, s?.partnerName].filter(Boolean).join(' / ') || '(不明)';
      const isSel = editSelectedPos === pos;
      return (
        <button
          key={pos}
          onClick={() => handleEditSlotTap(pos)}
          className={`ent-ed__slot ${isSel ? 'is-sel' : empty ? 'is-empty' : ''}`}
        >
          <span className="ent-ed__pos">{pos}</span>
          <span className="ent-ed__name">{name}</span>
          {!empty && s?.affiliation && (
            <span className="ent-ed__aff">{s.affiliation}</span>
          )}
        </button>
      );
    };

    /** 4枠のまとまり（2回戦で当たる単位） */
    const blockBox = (block: number[]) => {
      const start = block[0];
      const current = blockPatternOf(drawEdit.slots, start);
      return (
        <div key={start} className="ent-ed__block">
          {/* まとまりの型（ドロー表を見ながら上から順に選ぶと同じ並びになる） */}
          <div className="ent-ed__blockhead">
            <span className="ent-ed__range">{start}〜{start + 3}</span>
            <select
              value={current ?? ''}
              onChange={e => handleBlockPattern(start, e.target.value as BlockPattern)}
              className="ent-ed__select"
            >
              {current === null && <option value="">（型を選ぶ）</option>}
              {(Object.keys(BLOCK_PATTERN_LABELS) as BlockPattern[]).map(k => (
                <option key={k} value={k}>{BLOCK_PATTERN_LABELS[k]}</option>
              ))}
            </select>
          </div>
          {[0, 2].map(off => (
            <div key={off} className="ent-ed__pair">
              {block.slice(off, off + 2).map(pos => slotButton(pos))}
            </div>
          ))}
        </div>
      );
    };

    /** 4枠のまとまり2つ＝次の回戦で合流する単位 */
    const blockColumn = (list: number[][]) => {
      const groups: number[][][] = [];
      for (let i = 0; i < list.length; i += 2) groups.push(list.slice(i, i + 2));
      return (
        <div className="ent-ed__col">
          {groups.map(g => (
            <div key={g[0][0]} className="ent-ed__group">
              {g.map(block => blockBox(block))}
              <p className="ent-ed__hint">
                ↑ この2つの勝者が次の回戦で対戦
              </p>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div className="ent-ed">
        {/* 操作バー */}
        <div className="ent-ed__bar">
          <span className="ent-ed__title">
            <Shuffle className="w-4 h-4" />あたり修正中
          </span>
          <span className="ent-ed__msg">
            {editSelectedPos == null
              ? '枠をタップして選ぶと、入れ替え・ずらしができます'
              : `#${editSelectedPos} を選択中 — 入れ替え先をタップ、または右のボタンでずらす`}
          </span>
        </div>
        <div className="ent-ed__bar">
          {editSelectedPos != null && (
            <>
              {/* ずらす数（まとまりの境目に合わせるには複数ずらすことが多い） */}
              <span className="ent-ed__step">
                <button
                  onClick={() => setShiftCount(c => Math.max(1, c - 1))}
                  aria-label="ずらす数を減らす"
                >−</button>
                <span className="ent-ed__stepnum">{shiftCount}枠</span>
                <button
                  onClick={() => setShiftCount(c => Math.min(16, c + 1))}
                  aria-label="ずらす数を増やす"
                >＋</button>
              </span>
              <button onClick={() => handleEditInsertGap(editSelectedPos, shiftCount)}
                className="btn btn--outline sk-btn sk-btn--sm"
                title="この位置に空き枠を作り、以降の選手をその分だけ下へずらします">
                <ArrowDownToLine className="w-3.5 h-3.5" />空きを入れて下へ
              </button>
              {selectedIsEmpty && (
                <button onClick={() => handleEditRemoveGap(editSelectedPos, shiftCount)}
                  className="btn btn--outline sk-btn sk-btn--sm"
                  title="この空き枠を詰めて、以降の選手をその分だけ上へ上げます">
                  <ArrowUpToLine className="w-3.5 h-3.5" />空きを詰めて上へ
                </button>
              )}
            </>
          )}
          <button onClick={undoDrawEdit} disabled={savingDrawEdit || drawEditHistory.length === 0}
            className="btn btn--outline sk-btn sk-btn--sm">
            <RotateCcw className="w-3.5 h-3.5" />1つ戻す
          </button>
          <button onClick={cancelDrawEdit} disabled={savingDrawEdit}
            className="btn btn--outline sk-btn sk-btn--sm sk-btn--ghost">
            やめる
          </button>
          <button onClick={() => void saveDrawEdit()} disabled={savingDrawEdit || drawEditHistory.length === 0}
            className="btn btn--primary sk-btn sk-btn--sm">
            {savingDrawEdit ? '保存中...' : '保存して対戦表に反映'}
          </button>
        </div>

        {/* 型のまとめ指定（ドロー表から読み取った並びを一度に反映できる） */}
        <div className="ent-ed__bar ent-ed__bulk">
          <span className="ent-ed__label">型をまとめて指定</span>
          <input
            value={patternText}
            onChange={e => setPatternText(e.target.value)}
            placeholder="例: 4,空,2,3下,4,空,2,3下,3上,2,4,空,3上,2,4,空"
            className="input ent-ed__input"
          />
          <button
            onClick={handleApplyPatternText}
            disabled={!patternText.trim()}
            className="btn btn--primary sk-btn sk-btn--sm"
          >
            一括で並べ替え
          </button>
          <button
            onClick={() => setPatternText(describeBlockPatterns(drawEdit.slots))}
            className="btn btn--outline sk-btn sk-btn--sm"
            title="今の並びを型の記号で書き出します"
          >
            今の並びを読み込む
          </button>
        </div>

        <p className="ent-ed__note">
          四角の囲みが「2回戦で当たるまとまり（4枠）」です。ドロー表を見ながら、
          上のまとまりから順に<strong>型</strong>を選ぶと同じ並びになります
          （型を選ぶと、それ以降の選手は順番どおりに詰め直されます）。
          個別に直したいときは枠をタップして入れ替え・ずらしもできます。
          下のドロー図には修正内容がそのまま反映されます。
        </p>

        <div className="ent-ed__grid">
          {blockColumn(blocks.slice(0, half))}
          {blockColumn(blocks.slice(half))}
        </div>
      </div>
    );
  };

  const renderEventSection = (eventId: string, eventName: string, forceShow = false) => {
    const slots = buildSlotsForEvent(eventId);
    const stats = computeStats(slots);
    const isCollapsed = collapsedEvents.has(eventId);
    const isConfirmedEvent = confirmedEventsSet.has(eventId);

    if (!forceShow && searchQuery) {
      const searchMatches = getSearchMatchSet(slots);
      if (searchMatches.size === 0 && searchQuery.length > 0) return null;
    }

    return (
      <section key={eventId} className={`ent-ev ${isConfirmedEvent ? 'is-confirmed' : ''}`}
        data-event-id={eventId} data-event-name={eventName}>
        {/* Event header（貼り付けない。中身に重ならない） */}
        <div className="ent-ev__head">
          <button onClick={() => toggleCollapse(eventId)} className="ent-ev__toggle" aria-expanded={!isCollapsed}>
            <span className="sk-sec__mark" aria-hidden="true" />
            <span className="ent-ev__titles">
              <span className="sk-sec__en ent-ev__en">
                {isConfirmedEvent ? 'Confirmed' : 'Event'}
                {isConfirmedEvent && <span className="ent-ev__done"><Lock className="w-3 h-3" />確定済</span>}
              </span>
              <span className="ent-ev__title">{eventName}</span>
            </span>
            <ChevronDown className="ent-ev__chev w-5 h-5" />
          </button>
          <div className="ent-ev__count" aria-label="受付済み / エントリー">
            <span className="ent-ev__num"><b>{stats.checkedIn}</b><small>/ {stats.total}</small></span>
            {stats.absent > 0 && <span className="sk-chip sk-chip--red">{stats.absent} DEF</span>}
          </div>
          <div className="ent-ev__actions">
            {!isConfirmedEvent && (
              <button onClick={(e) => { e.stopPropagation(); handleCheckInEvent(eventId); }}
                className="btn btn--outline sk-btn sk-btn--sm">
                <UserCheck className="w-3.5 h-3.5" />全員受付
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); handleConfirmEvent(eventId); }}
              className={`btn sk-btn sk-btn--sm ${isConfirmedEvent ? 'btn--outline' : 'btn--primary'}`}>
              <Lock className="w-3.5 h-3.5" />{isConfirmedEvent ? '再確定' : '確定'}
            </button>
            {isConfirmedEvent && (
              <button onClick={(e) => { e.stopPropagation(); handleRevertConfirm(eventId); }}
                className="btn btn--outline sk-btn sk-btn--sm ent-btn--danger">
                <Unlock className="w-3.5 h-3.5" />解除
              </button>
            )}
            {drawMap.has(eventId) && (
              <button onClick={(e) => {
                  e.stopPropagation();
                  if (drawEdit?.eventId === eventId) cancelDrawEdit(); else startDrawEdit(eventId);
                }}
                className={`btn sk-btn sk-btn--sm ${drawEdit?.eventId === eventId ? 'btn--primary' : 'btn--outline'}`}
                aria-pressed={drawEdit?.eventId === eventId}
                title="ドロー表とあたりが違う場合に、枠を並べ替えて直します">
                <Shuffle className="w-3.5 h-3.5" />あたり修正
              </button>
            )}
            {!isConfirmedEvent && (
              <button onClick={(e) => { e.stopPropagation(); handleResetEvent(eventId); }}
                className="btn btn--outline sk-btn sk-btn--sm sk-btn--ghost" title="この種目の受付をリセット" aria-label="この種目の受付をリセット">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className={`sk-collapse ${isCollapsed ? '' : 'is-open'}`}>
          <div>
            {!isCollapsed && drawMap.get(eventId)?.slotSources?.length ? (
              <PlacementPanel eventId={eventId} filled={!isUnfilledPlacement(drawMap.get(eventId))} confirmed={isConfirmedEvent} ask={requestConfirm} />
            ) : null}
            {!isCollapsed && renderDrawEditor(eventId, slots)}
            {!isCollapsed && renderDrawTable(eventId, slots)}
          </div>
        </div>
      </section>
    );
  };

  // Overall stats
  const allSlots = showAllEvents
    ? events.flatMap(e => buildSlotsForEvent(e.eventId))
    : selectedEventId
      ? buildSlotsForEvent(selectedEventId)
      : [];
  const overallStats = computeStats(allSlots);

  // スクロール中の種目名（種目の切り替え帯で今いる種目を示す）
  const contentRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [bracketWidth, setBracketWidth] = useState(0);

  // ドロー図の幅＝右の列の幅（種目の区画の枠線 2px を除く）。列は常にあるので、図の出し入れに左右されない
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setBracketWidth(Math.max(0, entry.contentRect.width - 2));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentTournamentId]);

  useEffect(() => {
    const desktopEl = contentRef.current;
    // 画面は <main> の中がスクロールする
    const mainEl = desktopEl?.closest('main') as HTMLElement | null;
    if (!desktopEl || !mainEl) return;

    const onScroll = () => {
      const y = mainEl.scrollTop;
      // 種目の切り替え帯の下端より上に来た種目を「今の種目」とする
      const container = contentRef.current;
      if (container) {
        const line = (navRef.current?.getBoundingClientRect().bottom ?? 100) + 12;
        const sections = container.querySelectorAll('[data-event-name]');
        let currentName = '';
        for (const sec of sections) {
          const rect = (sec as HTMLElement).getBoundingClientRect();
          if (rect.top <= line) {
            currentName = (sec as HTMLElement).dataset.eventName || '';
          }
        }
        setStickyEventName(y > 10 ? currentName : '');
      }
    };

    mainEl.addEventListener('scroll', onScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', onScroll);
  }, []);

  // 今の種目の札が帯の中で見えるように横へ送る
  const activeNavName = showAllEvents
    ? (stickyEventName || events[0]?.name || '')
    : (events.find(e => e.eventId === selectedEventId)?.name || '');
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !activeNavName) return;
    const chip = Array.from(nav.querySelectorAll<HTMLElement>('[data-nav-name]')).find(c => c.dataset.navName === activeNavName);
    if (!chip) return;
    const left = chip.offsetLeft - nav.clientWidth / 2 + chip.offsetWidth / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [activeNavName]);

  const goToEvent = (eventId: string) => {
    if (!showAllEvents) { setSelectedEventId(eventId); return; }
    const sec = contentRef.current?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(eventId)}"]`);
    sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!currentTournamentId) {
    return (
      <SkPage>
        <SkEmpty icon={AlertCircle} title="大会が選択されていません" text="データ管理画面で対象の大会を選択するか、新しく作成してください。" />
      </SkPage>
    );
  }

  const searchBox = (
    <div className="ent-search">
      <Search className="ent-search__ico" />
      {isDesktop ? (
        // PC: その場で入力し、下にカードリストで結果表示
        <input type="text" placeholder="選手名・所属・種目で検索..." value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input sk-input ent-search__input" />
      ) : (
        // スマホ: タップでポップアップ
        <input type="text" readOnly placeholder="選手名・所属で検索..." value={searchQuery}
          onClick={() => setSearchModalOpen(true)}
          onFocus={() => setSearchModalOpen(true)}
          className="input sk-input ent-search__input" />
      )}
      {isDesktop && searchQuery && (
        <button onClick={() => setSearchQuery('')} className="ent-search__clear" title="クリア" aria-label="クリア">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="container sk-page sk-page--wide ent">
      {/* LEFT（スマホは上）: 受付の操作。貼り付けない（スマホで中身に重ならないように） */}
      <aside className="ent__side">
        <section className="sk-sec sk-sec--accent ent-ctl">
          <div className="sk-sec__head">
            <span className="sk-sec__mark" aria-hidden="true" />
            <div className="sk-sec__titles">
              <p className="sk-sec__en">Reception</p>
              <h2 className="sk-sec__title">
                エントリー受付
                {(showAllEvents || selectedEventId) && <small>{overallStats.checkedIn}/{overallStats.total}</small>}
              </h2>
            </div>
            <button className="sk-sec__toggle" aria-expanded={controlsOpen} onClick={() => setControlsOpen(prev => !prev)} aria-label={controlsOpen ? '閉じる' : '開く'}>
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          <div className={`sk-collapse ${controlsOpen ? 'is-open' : ''}`}>
            <div>
              <div className="ent-ctl__body">
                <div className="ent-ctl__row">
                  <div className="hub-filter ent-seg" role="group" aria-label="種目の表示">
                    <button onClick={() => setShowAllEvents(true)} className={`hub-filter__btn ${showAllEvents ? 'is-on' : ''}`}>
                      <List className="w-3.5 h-3.5" />すべて表示
                    </button>
                    <button onClick={() => setShowAllEvents(false)} className={`hub-filter__btn ${!showAllEvents ? 'is-on' : ''}`}>
                      <Eye className="w-3.5 h-3.5" />個別表示
                    </button>
                  </div>
                  <div className="hub-filter ent-seg" role="group" aria-label="選手の並べ方">
                    <button onClick={() => setViewMode('list')} className={`hub-filter__btn ${viewMode === 'list' ? 'is-on' : ''}`}>
                      <List className="w-3.5 h-3.5" />一覧
                    </button>
                    <button onClick={() => setViewMode('draw')} className={`hub-filter__btn ${viewMode === 'draw' ? 'is-on' : ''}`}>
                      <GitBranch className="w-3.5 h-3.5" />ドロー図
                    </button>
                    <button onClick={openSheet} className={`hub-filter__btn ${sheetEventId ? 'is-on' : ''}`} title="全画面で開く。サイトのドロー表と同じ形でズーム・スワイプし、選手をタップで受付。種目も切り替えられる">
                      <ZoomIn className="w-3.5 h-3.5" />対戦表
                    </button>
                  </div>
                </div>

                {!showAllEvents && (
                  <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)}
                    className="input sk-input ent-ctl__select">
                    <option value="">-- 種目を選択 --</option>
                    {events.map(e => <option key={e.eventId} value={e.eventId}>{e.name}</option>)}
                  </select>
                )}

                {searchBox}

                {/* PC: 検索結果を下にカードリストで表示 */}
                {isDesktop && searchQuery.trim() && (
                  <div className="ent-hits">
                    <div className="ent-hits__head">
                      <span>検索結果 {searchModalResults.length}件</span>
                      <span>タップで受付／取消</span>
                    </div>
                    {searchModalResults.length === 0 ? (
                      <div className="ent-none">該当する選手が見つかりません</div>
                    ) : (
                      searchModalResults.map((row) => renderSearchResultRow(row, 'card'))
                    )}
                  </div>
                )}

                {(showAllEvents || selectedEventId) && (
                  <>
                    <dl className="ent-tally">
                      <div><dt>合計</dt><dd>{overallStats.total}</dd></div>
                      <div className="is-on"><dt>受付済</dt><dd>{overallStats.checkedIn}</dd></div>
                      <div className="is-def"><dt>DEF</dt><dd>{overallStats.absent}</dd></div>
                      <div><dt>未受付</dt><dd>{overallStats.remaining}</dd></div>
                    </dl>
                    <div className="ent-ctl__btns">
                      <button onClick={showAllEvents ? handleCheckInAll : () => selectedEventId && handleCheckInEvent(selectedEventId)}
                        className="btn btn--outline sk-btn">
                        <UserCheck className="w-4 h-4" />全員受付済み
                      </button>
                      <button onClick={showAllEvents ? handleResetAll : () => selectedEventId && handleResetEvent(selectedEventId)}
                        className="btn btn--outline sk-btn sk-btn--ghost">
                        <RotateCcw className="w-4 h-4" />リセット
                      </button>
                      <button onClick={handleConfirmAll}
                        className="btn btn--primary sk-btn ent-ctl__confirm">
                        <Lock className="w-4 h-4" />全種目確定
                      </button>
                    </div>
                  </>
                )}

                {/* 熱中症警戒時の試合形式（確定時に各種目へ付与） */}
                <HeatRulePatternInput value={heatRulePattern} onChange={setHeatRulePattern} />
              </div>
            </div>
          </div>
        </section>
      </aside>

      {/* RIGHT: 種目ごとの受付 */}
      <div className="ent__main" ref={contentRef}>
        {/* 種目の切り替え（横に送れる札。スマホではこれだけを上に貼り付ける） */}
        {events.length > 0 && (
          <nav className="ent-evnav" aria-label="種目">
            <div className="ent-evnav__track" ref={navRef}>
              {events.map(e => (
                <button key={e.eventId} data-nav-name={e.name}
                  onClick={() => goToEvent(e.eventId)}
                  className={`ent-evnav__chip ${activeNavName === e.name ? 'is-on' : ''} ${confirmedEventsSet.has(e.eventId) ? 'is-done' : ''}`}
                  aria-current={activeNavName === e.name ? 'true' : undefined}>
                  {confirmedEventsSet.has(e.eventId) && <Lock className="w-3 h-3" />}
                  {e.name}
                </button>
              ))}
            </div>
          </nav>
        )}

        {showAllEvents ? (
          events.length === 0 ? (
            <SkEmpty icon={AlertCircle} title="種目が登録されていません" />
          ) : (
            events.map(e => renderEventSection(e.eventId, e.name))
          )
        ) : selectedEventId ? (
          renderEventSection(selectedEventId, events.find(e => e.eventId === selectedEventId)?.name || '', true)
        ) : (
          <SkEmpty icon={AlertCircle} title="上の札または一覧から対象種目を選択してください" />
        )}
      </div>

      {/* 全画面の対戦表 */}
      {renderSheetScreen()}

      {/* 対戦表で選手をタップしたときの確認ダイアログ */}
      {sheetTap && (() => {
        const slot = buildSlotsForEvent(sheetTap.eventId).find(s => s.drawPosition === sheetTap.position);
        if (!slot?.entry) return null;
        const event = events.find(e => e.eventId === sheetTap.eventId);
        const p1 = playerMap.get(slot.entry.playerId);
        const p2 = slot.entry.partnerId ? playerMap.get(slot.entry.partnerId) : undefined;
        const state: 'none' | 'checked' | 'def' = slot.entry.status === 'withdrawn' ? 'def' : slot.entryId && confirmedIds.has(slot.entryId) ? 'checked' : 'none';
        const close = () => setSheetTap(null);
        return (
          <EntrySlotDialog
            key={`${sheetTap.eventId}-${sheetTap.position}`}
            open
            eventName={event?.name || ''}
            position={slot.drawPosition}
            seed={slot.seed}
            doubles={!!slot.entry.partnerId || event?.type === 'Doubles'}
            current={{ name: p1?.name || slot.playerName, affiliation: p1?.affiliation || '', partnerName: p2?.name || slot.partnerName, partnerAffiliation: p2?.affiliation || '' }}
            state={state}
            locked={confirmedEventsSet.has(sheetTap.eventId)}
            onClose={close}
            onCheckIn={() => { if (state === 'none') void handleCheckIn(slot); }}
            onUncheck={() => { if (state === 'checked') void handleCheckIn(slot); }}
            onWithdraw={() => handleMarkBye(slot)}
            onRestore={() => handleRestore(slot)}
            onChange={(next) => handleChangePlayer(slot, next)}
          />
        );
      })()}

      {/* 処理中モーダル */}
      <ProcessingModal
        open={procModalOpen}
        title={procModalTitle}
        steps={procModalSteps}
        progress={procModalProgress}
        result={procModalResult}
        onClose={() => setProcModalOpen(false)}
      />

      {/* 確認ダイアログ */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        danger={confirmDialog.danger}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={handleConfirmOk}
        onCancel={handleConfirmCancel}
      />

      {/* 検索ポップアップ（スマホのみ。PCは左パネル下にカードリスト表示） */}
      {searchModalOpen && !isDesktop && createPortal(
        <div className="ent-modal" role="dialog" aria-modal="true" aria-label="選手を検索">
          <div className="ent-modal__back" onClick={closeSearchModal} />
          <div className="ent-modal__panel">
            {/* ヘッダー: 検索入力 */}
            <div className="ent-modal__head">
              <div className="ent-search">
                <Search className="ent-search__ico" />
                <input ref={searchModalInputRef} type="text" placeholder="選手名・所属・種目で検索..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input sk-input ent-search__input" />
              </div>
              <button onClick={closeSearchModal} className="hub-icon-btn ent-modal__x" aria-label="閉じる">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 検索結果リスト */}
            <div className="ent-modal__list">
              {!searchQuery.trim() ? (
                <div className="ent-modal__empty">
                  <Search className="w-8 h-8" />
                  選手名・所属・種目名で検索してください
                </div>
              ) : searchModalResults.length === 0 ? (
                <div className="ent-modal__empty">
                  <AlertCircle className="w-8 h-8" />
                  該当する選手が見つかりません
                </div>
              ) : (
                <div>
                  {searchModalResults.map((row) => renderSearchResultRow(row, 'popup'))}
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="ent-modal__foot">
              <span>タップで受付／取消</span>
              <button onClick={closeSearchModal} className="btn btn--primary sk-btn sk-btn--sm">
                完了
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
