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

/** 端末から大会 1 つ分の運営データを消す */
export async function removeLocalTournament(tournamentId: string): Promise<void> {
  const events = await db.events.where('tournamentId').equals(tournamentId).toArray();
  const eventIds = events.map((e) => e.eventId);
  await db.transaction('rw', [db.tournaments, db.events, db.entries, db.draws, db.matches, db.courts], async () => {
    if (eventIds.length) {
      await db.entries.where('eventId').anyOf(eventIds).delete();
      await db.draws.where('eventId').anyOf(eventIds).delete();
      await db.matches.where('eventId').anyOf(eventIds).delete();
    }
    await db.events.where('tournamentId').equals(tournamentId).delete();
    await db.courts.where('tournamentId').equals(tournamentId).delete();
    await db.tournaments.where('tournamentId').equals(tournamentId).delete();
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

    const players = new Map<string, { name: string; affiliation: string }>();
    for (const [ei, ev] of t.draw!.events.entries()) {
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
        const entryId = `EN-${t.id}-${ei}-${pi}`;
        await db.entries.add({ eventId, entryId, playerId, partnerId, rankPoint: 0, seedNo: p.seed && p.seed > 0 ? p.seed : undefined, status: 'active' });
        entryByPos.set(p.position, entryId);
      }

      const byPos = new Map(ev.players.map((p) => [p.position, p]));
      const slots = Array.from({ length: ev.drawSize }, (_, i) => {
        const p = byPos.get(i + 1);
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
        updatedAt: now,
      });
    }

    // 選手（同じ人が前の大会で入っていれば、その行を更新する）
    for (const [playerId, p] of players) {
      const furigana = dict.get(playerId) ?? '';
      const cur = existingPlayers.get(playerId);
      if (cur?.id != null) await db.players.update(cur.id, { name: p.name, affiliation: p.affiliation, furigana: furigana || cur.furigana });
      else await db.players.add({ playerId, name: p.name, furigana, affiliation: p.affiliation, rankings: {}, isManual: false });
    }

    for (const [ci, name] of courtNames.entries()) {
      await db.courts.add({ tournamentId, courtId: `C-${now}-${ci}`, name, surface: '', isAvailable: true, currentMatchId: null, order: ci + 1 });
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
