// データベースの大会を、この端末の運営用データ（IndexedDB）に入れる。
//
// 中身は「Excel から取り込む」（DrawMeetingImport.tsx の handleExcelImport）と同じ書き方で、
// ドロー表を読む代わりにデータベースの JSON を使う。入れたあと時間割も自動で作るので、そのままエントリー受付に進める。
//   ・同じ大会を前に入れていれば、その端末の分（種目・エントリー・ドロー・試合・コート）を消してから入れ直す
//   ・選手のふりがなは端末の辞書（ログイン時にデータベースから取り込んだもの）から付ける
import { db, type Tournament } from '../../db/database';
import { toHalfwidth } from '../../lib/halfwidth';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { applyHeatToRules } from '../data/HeatRulePatternInput';
import { STANDARD_COURTS } from '../data/CourtSelector';
import { generateScheduleFromDraws, AUTO_GENERATED_SCHEDULE_LABEL } from '../schedule/generateSchedule';
import { dateParts, type CatalogTournamentFull } from './catalogApi';

const keyOf = (name: string) => name.replace(/[\s\u3000]+/g, '');

/** この端末に、その大会を入れた記録があればそれを返す */
export async function localCopyOf(catalogId: string): Promise<Tournament | undefined> {
  return (await db.tournaments.toArray()).find((t) => t.catalogId === catalogId);
}

/**
 * 端末から大会 1 つ分の運営データを消す（種目・受付・ドロー・試合・コート・ライブスコア）。
 * その大会を運営中だったときは、アプリに 1 つだけ持っている時間割（タイムテーブル）も空にする
 * （消したあとも前の試合が時間割に残って見えないように）
 */
export async function removeLocalTournament(tournamentId: string): Promise<void> {
  const events = await db.events.where('tournamentId').equals(tournamentId).toArray();
  const eventIds = events.map((e) => e.eventId);
  const store = useAppStore.getState();
  if (store.currentTournamentId === tournamentId) clearScheduleState();
  await db.transaction('rw', [db.tournaments, db.events, db.entries, db.draws, db.matches, db.courts, db.liveScores], async () => {
    if (eventIds.length) {
      await db.entries.where('eventId').anyOf(eventIds).delete();
      await db.draws.where('eventId').anyOf(eventIds).delete();
      await db.matches.where('eventId').anyOf(eventIds).delete();
      await db.liveScores.where('eventId').anyOf(eventIds).delete();
    }
    await db.events.where('tournamentId').equals(tournamentId).delete();
    await db.courts.where('tournamentId').equals(tournamentId).delete();
    await db.tournaments.where('tournamentId').equals(tournamentId).delete();
  });
}

/** アプリに 1 つだけ持っている時間割・対戦順の作業データを空にする */
export function clearScheduleState(): void {
  const store = useAppStore.getState();
  store.setImportedSchedule([]);
  store.setScheduleFileName('');
  store.setScheduleSlots([]);
  store.setAllScheduleMatches([]);
}

type CatalogEvent = NonNullable<CatalogTournamentFull['draw']>['events'][number];
type PlayerMap = Map<string, { name: string; affiliation: string }>;

/** データベースの種目 1 つを端末に書く（種目・エントリー・ドロー）。トランザクションの中で呼ぶ */
async function writeEvent(
  t: CatalogTournamentFull, ev: CatalogEvent, ei: number,
  ctx: { tournamentId: string; now: number; heat: ReturnType<typeof useAppStore.getState>['heatRulePattern']; courtIdByName: Map<string, string>; players: PlayerMap; entrySuffix: string },
): Promise<void> {
  const { tournamentId, now, heat, courtIdByName, players, entrySuffix } = ctx;
  const eventId = `E-${t.id}-${ei}-${now}`;
  const rules = (ev.roundGameRules ?? []) as Parameters<typeof applyHeatToRules>[0];
  const defaultGames = rules && rules.length > 0 ? rules[0].games : 6;
  await db.events.add({
    tournamentId,
    eventId,
    name: ev.eventName,
    type: ev.type,
    gameRules: { sets: 1, games: defaultGames, deuce: true, tiebreakPoint: defaultGames },
    roundGameRules: applyHeatToRules(rules, defaultGames, heat),
  });

  const entryByPos = new Map<number, string>();
  for (const [pi, p] of ev.players.entries()) {
    const playerId = keyOf(p.name);
    if (!players.has(playerId)) players.set(playerId, { name: toHalfwidth(p.name), affiliation: toHalfwidth(p.affiliation, { space: true }) });
    let partnerId: string | undefined;
    if (ev.type === 'Doubles' && p.partnerName) {
      partnerId = keyOf(p.partnerName);
      if (!players.has(partnerId)) players.set(partnerId, { name: toHalfwidth(p.partnerName), affiliation: toHalfwidth(p.partnerAffiliation ?? '', { space: true }) });
    }
    const entryId = `EN-${t.id}-${ei}-${pi}${entrySuffix}`;
    await db.entries.add({ eventId, entryId, playerId, partnerId, rankPoint: 0, seedNo: p.seed && p.seed > 0 ? p.seed : undefined, status: 'active' });
    entryByPos.set(p.position, entryId);
  }

  const byPos = new Map(ev.players.map((p) => [p.position, p]));
  // 順位別トーナメントの枠は、選手が決まるまで空き（BYE ではない）
  const sourcePos = new Set((ev.sources ?? []).map((x) => x.position));
  const slots = Array.from({ length: ev.drawSize }, (_, i) => {
    const p = byPos.get(i + 1);
    if (!p && sourcePos.has(i + 1)) return { position: i + 1, entryId: null, seed: 0, isBye: false };
    return p
      ? { position: i + 1, entryId: entryByPos.get(i + 1) ?? null, seed: p.seed ?? 0, isBye: false }
      : { position: i + 1, entryId: null, seed: 0, isBye: true };
  });
  await db.draws.add({
    eventId,
    drawSize: ev.drawSize,
    drawType: ev.isRoundRobin ? 'roundRobin' : 'tournament',
    slots,
    matchTimes: ev.matchTimes && Object.keys(ev.matchTimes).length > 0 ? (ev.matchTimes as Record<number, string>) : undefined,
    roundMatchTimes: ev.roundMatchTimes && Object.keys(ev.roundMatchTimes).length > 0 ? ev.roundMatchTimes : undefined,
    eventStartTime: ev.eventStartTime || undefined,
    ...(ev.isRoundRobin && ev.rankRule ? { leagueRankRule: ev.rankRule } : {}),
    ...(ev.sources?.length ? { slotSources: ev.sources } : {}),
    // 順位で組む種目に選手まで書いてあれば、大会本部が組み合わせを固定したもの（順位で組み直さない）
    ...(ev.sources?.length && ev.players.length ? { slotsForced: true } : {}),
    // リーグ戦の専用コート（大会データにコート名で書いてあれば、そのリーグのコートに固定する）
    ...(ev.isRoundRobin && ev.leagueCourts?.length
      ? { leagueCourtIds: ev.leagueCourts.map((n) => courtIdByName.get(n)).filter((x): x is string => !!x).slice(0, 2) } : {}),
    updatedAt: now,
  });
}

export interface ImportProgress { step: 'prepare' | 'write' | 'schedule' | 'done'; label: string }

/** 端末に入れて、その大会を選んだ状態にする。戻り値は端末の大会 ID */
export async function importToDevice(t: CatalogTournamentFull, onProgress?: (p: ImportProgress) => void, opts: { test?: boolean } = {}): Promise<string> {
  if (!t.draw || t.draw.events.length === 0) throw new Error('この大会にはまだドローが入っていません');
  onProgress?.({ step: 'prepare', label: '端末を準備しています' });

  // 前に入れた分を消す（入れ直し）。ミックス・団体戦のデータが残っていれば、画面がそちらに切り替わらないよう外す
  const prev = await localCopyOf(t.id);
  if (prev) await removeLocalTournament(prev.tournamentId);
  if (useMixedStore.getState().isImported) useMixedStore.getState().resetAll();
  if (useTeamStore.getState().isImported) useTeamStore.getState().resetAll();

  onProgress?.({ step: 'write', label: `${t.draw.events.length} 種目・${t.players} 人を入れています` });
  const now = Date.now();
  const tournamentId = `T-${t.id}-${String(now).slice(-6)}`;
  const heat = useAppStore.getState().heatRulePattern;
  const courtNames = t.settings.courtNames?.length ? t.settings.courtNames : STANDARD_COURTS.split(',');
  const startTime = t.settings.startTime || t.draw.earliestStartTime || '09:00';
  // コートの ID は先に決めておく（リーグ戦の専用コート leagueCourts をコート名から引くため）
  const courtIdByName = new Map(courtNames.map((name, ci) => [name, `C-${now}-${ci}`]));

  // ふりがなは端末の辞書から
  const dict = new Map((await db.furiganaDict.toArray()).map((d) => [d.name, d.furigana]));
  const existingPlayers = new Map((await db.players.toArray()).map((p) => [p.playerId, p]));

  await db.transaction('rw', [db.tournaments, db.events, db.entries, db.draws, db.players, db.courts], async () => {
    await db.tournaments.add({
      tournamentId,
      name: t.name,
      date: dateParts(t.date)?.slash ?? '',
      venue: t.venue,
      reserveDate: dateParts(t.reserveDate)?.slash ?? '',
      reserveVenue: t.reserveVenue,
      createdAt: now,
      drawStartTime: startTime,
      suggestedCourtCount: t.draw!.suggestedCourtCount,
      catalogId: t.id,
      catalogUpdatedAt: t.updatedAt,
      ...(opts.test ? { isTest: true } : {}),
    });

    const players: PlayerMap = new Map();
    for (const [ei, ev] of t.draw!.events.entries()) {
      await writeEvent(t, ev, ei, { tournamentId, now, heat, courtIdByName, players, entrySuffix: '' });
    }

    // 選手（同じ人が前の大会で入っていれば、その行を更新する）
    for (const [playerId, p] of players) {
      const furigana = dict.get(playerId) ?? '';
      const cur = existingPlayers.get(playerId);
      if (cur?.id != null) await db.players.update(cur.id, { name: p.name, affiliation: p.affiliation, furigana: furigana || cur.furigana });
      else await db.players.add({ playerId, name: p.name, furigana, affiliation: p.affiliation, rankings: {}, isManual: false });
    }

    for (const [ci, name] of courtNames.entries()) {
      await db.courts.add({ tournamentId, courtId: courtIdByName.get(name) ?? `C-${now}-${ci}`, name, surface: '', isAvailable: true, currentMatchId: null, order: ci + 1 });
    }
  });

  // 時間割（ドロー表の時刻と使うコートから自動で作る。画面の「ドローから自動生成」と同じ）
  onProgress?.({ step: 'schedule', label: '時間割を作っています' });
  const store = useAppStore.getState();
  store.setCurrentTournamentId(tournamentId);
  const sched = await generateScheduleFromDraws(tournamentId, { courtNames, startTime });
  store.setImportedSchedule(sched.items);
  store.setScheduleFileName(sched.items.length ? AUTO_GENERATED_SCHEDULE_LABEL : '');
  store.setScheduleConfig({ startTime: sched.startTime, matchDuration: sched.matchDuration });
  store.setScheduleSlots([]);
  store.setAllScheduleMatches([]);

  onProgress?.({ step: 'done', label: '入れました' });
  return tournamentId;
}

// ---------------------------------------------------------------------------
// 結果を残して入れ直す（大会の途中で種目の組み方が変わったとき）
//   ・データベースの種目と、端末の種目を名前で突き合わせる
//   ・名前・枠の数・リーグ／トーナメントの別・順位別の枠の決め方が同じで、データベースの選手が端末にもいる種目は、
//     端末の分（受付・ドロー・試合結果）をそのまま残す
//   ・変わった種目は入れ直し、データベースに無くなった種目は端末から消し、新しい種目は足す
// ---------------------------------------------------------------------------

export interface MergePlan { keep: string[]; replace: string[]; add: string[]; remove: string[] }

const sourcesKey = (src?: { position: number; league: string; rank: number }[]) =>
  JSON.stringify([...(src ?? [])].sort((a, b) => a.position - b.position).map((x) => [x.position, keyOf(x.league), x.rank]));

async function mergeLayout(t: CatalogTournamentFull, tournamentId: string) {
  const localEvents = await db.events.where('tournamentId').equals(tournamentId).toArray();
  const byName = new Map(localEvents.map((e) => [keyOf(e.name), e]));
  const keepIds = new Set<string>();
  const plan: MergePlan = { keep: [], replace: [], add: [], remove: [] };
  const newIdx: number[] = [];
  for (const [ei, ev] of (t.draw?.events ?? []).entries()) {
    const local = byName.get(keyOf(ev.eventName));
    if (!local) { plan.add.push(ev.eventName); newIdx.push(ei); continue; }
    const draw = await db.draws.where('eventId').equals(local.eventId).first();
    const entries = await db.entries.where('eventId').equals(local.eventId).toArray();
    const have = new Set(entries.map((x) => `${x.playerId}|${x.partnerId ?? ''}`));
    const same = !!draw
      && draw.drawSize === ev.drawSize
      && (draw.drawType ?? 'tournament') === (ev.isRoundRobin ? 'roundRobin' : 'tournament')
      && sourcesKey(draw.slotSources) === sourcesKey(ev.sources)
      && ev.players.every((p) => have.has(`${keyOf(p.name)}|${ev.type === 'Doubles' && p.partnerName ? keyOf(p.partnerName) : ''}`));
    if (same) { plan.keep.push(ev.eventName); keepIds.add(local.eventId); }
    else { plan.replace.push(ev.eventName); newIdx.push(ei); }
  }
  const catalogNames = new Set((t.draw?.events ?? []).map((ev) => keyOf(ev.eventName)));
  for (const e of localEvents) if (!catalogNames.has(keyOf(e.name))) plan.remove.push(e.name);
  const dropIds = localEvents.filter((e) => !keepIds.has(e.eventId)).map((e) => e.eventId);
  return { plan, newIdx, dropIds };
}

/** 結果を残して入れ直すと、どの種目がどうなるか（入れ直す前の確認用）。端末に入っていなければ null */
export async function planMergeImport(t: CatalogTournamentFull): Promise<MergePlan | null> {
  const prev = await localCopyOf(t.id);
  if (!prev) return null;
  return (await mergeLayout(t, prev.tournamentId)).plan;
}

/**
 * 結果を残して入れ直す。同じ種目の受付・ドロー・試合結果はそのまま、変わった種目・新しい種目だけ入れる。
 * 端末の大会 ID・コートも変えない（ほかの端末との同期・時間割のコートがそのまま使える）。戻り値は端末の大会 ID
 */
export async function mergeImportToDevice(t: CatalogTournamentFull, onProgress?: (p: ImportProgress) => void): Promise<string> {
  if (!t.draw || t.draw.events.length === 0) throw new Error('この大会にはまだドローが入っていません');
  const prev = await localCopyOf(t.id);
  if (!prev) return importToDevice(t, onProgress);
  onProgress?.({ step: 'prepare', label: '端末の種目と突き合わせています' });
  const tournamentId = prev.tournamentId;
  const { plan, newIdx, dropIds } = await mergeLayout(t, tournamentId);

  onProgress?.({ step: 'write', label: `${newIdx.length} 種目を入れ直しています` });
  const now = Date.now();
  const heat = useAppStore.getState().heatRulePattern;
  const localCourts = (await db.courts.where('tournamentId').equals(tournamentId).toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const courtIdByName = new Map(localCourts.map((c) => [c.name, c.courtId]));
  const dict = new Map((await db.furiganaDict.toArray()).map((d) => [d.name, d.furigana]));
  const existingPlayers = new Map((await db.players.toArray()).map((p) => [p.playerId, p]));

  await db.transaction('rw', [db.tournaments, db.events, db.entries, db.draws, db.matches, db.liveScores, db.players], async () => {
    if (dropIds.length) {
      await db.entries.where('eventId').anyOf(dropIds).delete();
      await db.draws.where('eventId').anyOf(dropIds).delete();
      await db.matches.where('eventId').anyOf(dropIds).delete();
      await db.liveScores.where('eventId').anyOf(dropIds).delete();
      await db.events.where('eventId').anyOf(dropIds).delete();
    }
    await db.tournaments.where('tournamentId').equals(tournamentId).modify({ catalogUpdatedAt: t.updatedAt, suggestedCourtCount: t.draw!.suggestedCourtCount });
    const players: PlayerMap = new Map();
    // エントリーの ID が残した種目のものと重ならないよう、入れ直した時刻を付ける
    for (const ei of newIdx) await writeEvent(t, t.draw!.events[ei], ei, { tournamentId, now, heat, courtIdByName, players, entrySuffix: `-${now}` });
    for (const [playerId, p] of players) {
      const furigana = dict.get(playerId) ?? '';
      const cur = existingPlayers.get(playerId);
      if (cur?.id != null) await db.players.update(cur.id, { name: p.name, affiliation: p.affiliation, furigana: furigana || cur.furigana });
      else await db.players.add({ playerId, name: p.name, furigana, affiliation: p.affiliation, rankings: {}, isManual: false });
    }
  });

  // 時間割は作り直さない（作り直すと、試合中・コートに入れた試合が「待ち」に戻ってしまう）。
  // 新しい種目の試合は、順位を反映して組んだあと、対戦順の画面でコートに入れる
  useAppStore.getState().setCurrentTournamentId(tournamentId);
  onProgress?.({ step: 'done', label: `入れ直しました（結果を残した種目 ${plan.keep.length}）` });
  return tournamentId;
}

/**
 * 端末の大会に切り替える（入れ直さない）。時間割はアプリに 1 つしか持てないので、
 * 別の大会から切り替えたときだけ、その大会のドローから作り直す
 */
export async function switchToLocal(tournamentId: string): Promise<void> {
  const store = useAppStore.getState();
  if (store.currentTournamentId === tournamentId) return;
  store.setCurrentTournamentId(tournamentId);
  const t = await db.tournaments.where('tournamentId').equals(tournamentId).first();
  const courts = (await db.courts.where('tournamentId').equals(tournamentId).toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((c) => c.name);
  const sched = await generateScheduleFromDraws(tournamentId, { courtNames: courts.length ? courts : undefined, startTime: t?.drawStartTime || '09:00' });
  store.setImportedSchedule(sched.items);
  store.setScheduleFileName(sched.items.length ? AUTO_GENERATED_SCHEDULE_LABEL : '');
  store.setScheduleConfig({ startTime: sched.startTime, matchDuration: sched.matchDuration });
}
