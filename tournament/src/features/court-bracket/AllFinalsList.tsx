// ドロー画面の「リーグを全部並べる」表示で、リーグ表の下に並べる決勝トーナメント（トーナメントの種目）。
//   ・リーグの順位で組む順位別トーナメントなど、リーグではない種目を、種目の並び順にトーナメント表で並べる
//   ・まだ組まれていない枠（リーグが終わる前）は「B1位」のように、どのリーグの何位が入るかを出す
//   ・運営画面では、試合をタップするとその試合のスコア入力を開く（1 種目ずつの表示と同じ）
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Event } from '../../db/database';
import CourtBracketView from './CourtBracketView';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import { sourceLabel } from '../draw/placement';
import { isLeagueKind } from './leagueKind';

interface Props {
  /** 大会の全種目（並び順のまま）。この中のトーナメントの種目だけを出す */
  events: Event[];
  /** 試合をタップしたとき（運営画面のみ）。events の何番目か・試合の回戦と位置 */
  onMatchSelect?: (eventIdx: number, round: number, position: number) => void;
  /** 「決勝トーナメント」の見出しを出さない（ドローの「すべて表示」で種目ごとに並べるとき） */
  bare?: boolean;
}

export default function AllFinalsList({ events, onMatchSelect, bare = false }: Props) {
  const ids = useMemo(() => events.map(e => e.eventId), [events]);
  const data = useLiveQuery(async () => {
    if (ids.length === 0) return null;
    const [draws, entries, matches, players, courts] = await Promise.all([
      db.draws.where('eventId').anyOf(ids).toArray(),
      db.entries.where('eventId').anyOf(ids).toArray(),
      db.matches.where('eventId').anyOf(ids).toArray(),
      db.players.toArray(),
      db.courts.toArray(),
    ]);
    return { draws, entries, matches, players, courts };
  }, [ids]);

  const finals = useMemo(() => {
    if (!data) return [];
    const playerById = new Map(data.players.map(p => [p.playerId, p]));
    const courtName = new Map(data.courts.map(c => [c.courtId, c.name]));
    return events.flatMap((evt, idx) => {
      const draw = data.draws.find(d => d.eventId === evt.eventId);
      if (!draw || !draw.drawSize || isLeagueKind(evt.name, draw.drawType)) return [];
      const entries = data.entries.filter(e => e.eventId === evt.eventId);
      const slots: DrawSlotData[] = draw.slots
        .map(s => {
          let name = 'BYE';
          let affiliation = '';
          if (!s.isBye && s.entryId) {
            const entry = entries.find(e => e.entryId === s.entryId);
            const p1 = entry ? playerById.get(entry.playerId) : undefined;
            const p2 = entry?.partnerId ? playerById.get(entry.partnerId) : undefined;
            name = p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || '(不明)');
            affiliation = p1 && p2 && p1.affiliation !== p2.affiliation ? `${p1.affiliation} / ${p2.affiliation}` : (p1?.affiliation || '');
          } else if (!s.isBye) {
            const src = draw.slotSources?.find(x => x.position === s.position);
            name = src ? sourceLabel(src) : '（未定）';
          }
          return { position: s.position, entryId: s.entryId, seed: s.seed, isBye: s.isBye, name, affiliation };
        })
        .sort((a, b) => a.position - b.position);
      const matchResults: MatchResult[] = data.matches
        .filter(m => m.eventId === evt.eventId)
        .map(m => ({
          round: m.round, position: m.position,
          player1Name: m.player1Name, player2Name: m.player2Name,
          winnerEntryId: m.winnerEntryId,
          player1EntryId: m.player1EntryId, player2EntryId: m.player2EntryId,
          score: m.score, status: m.status, courtId: m.courtId,
          courtName: m.courtId ? courtName.get(m.courtId) || '' : '', scheduledTime: m.scheduledTime,
          updatedAt: m.updatedAt,
        }));
      const done = matchResults.filter(m => m.status === 'finished').length;
      const total = matchResults.filter(m => m.player1Name && m.player2Name && m.status !== 'walkover').length;
      return [{ evt, idx, draw, slots, matchResults, done, total }];
    });
  }, [data, events]);

  if (!data || finals.length === 0) return null;

  return (
    <div className="dl-allko">
      {!bare && <h2 className="dl-allko__heading">決勝トーナメント</h2>}
      {finals.map(f => (
        <section key={f.evt.eventId} className="dl-allrr__item dl-allko__item">
          <header className="dl-allrr__head">
            <h3 className="dl-allrr__title">{f.evt.name}</h3>
            <span className="dl-allrr__meta">
              {f.total > 0 ? <span>{f.done}/{f.total} 試合</span> : f.draw.slotSources?.length ? <span>リーグの順位が決まると組まれます</span> : <span>確定すると試合が出ます</span>}
            </span>
          </header>
          <CourtBracketView
            slots={f.slots}
            drawSize={f.draw.drawSize}
            matchResults={f.matchResults}
            eventType={f.evt.type as 'Singles' | 'Doubles' | 'Team'}
            totalRounds={Math.log2(f.draw.drawSize)}
            onMatchSelect={onMatchSelect ? (round, position) => onMatchSelect(f.idx, round, position) : undefined}
            startRound={0}
          />
        </section>
      ))}
    </div>
  );
}
