// ドロー画面の「リーグを全部並べる」表示。
//   ・大会のリーグ戦（総当たり）の種目を、種目の並び順にリーグ表（星取表）で並べる
//   ・PC（1024px 以上）は 2 列（1 リーグが画面の半分）、スマホ・タブレットは 1 列
//   ・運営画面では、星取表のセルをタップするとその試合のスコア入力を開く（1 リーグずつの表示と同じ）
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Event } from '../../db/database';
import RoundRobinRenderer from '../draw/RoundRobinRenderer';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import { leagueShort } from '../draw/placement';

interface Props {
  /** 大会の全種目（並び順のまま）。この中のリーグ戦だけを出す */
  events: Event[];
  /** セルをタップしたとき（運営画面のみ）。events の何番目か・試合の回戦と位置 */
  onCellSelect?: (eventIdx: number, round: number, position: number) => void;
}

export default function AllLeaguesGrid({ events, onCellSelect }: Props) {
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

  const leagues = useMemo(() => {
    if (!data) return [];
    const playerById = new Map(data.players.map(p => [p.playerId, p]));
    const courtName = new Map(data.courts.map(c => [c.courtId, c.name]));
    return events.flatMap((evt, idx) => {
      const draw = data.draws.find(d => d.eventId === evt.eventId);
      if (!draw || draw.drawType !== 'roundRobin') return [];
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
          } else if (!s.isBye && !s.entryId) {
            name = '（未定）';
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
      const done = matchResults.filter(m => m.status === 'finished' || m.status === 'walkover').length;
      const total = matchResults.filter(m => m.player1Name && m.player2Name).length;
      const courts = (draw.leagueCourtIds || []).map(id => courtName.get(id)).filter(Boolean) as string[];
      const playing = matchResults.filter(m => m.status === 'playing' && m.courtName).map(m => m.courtName);
      return [{ evt, idx, draw, slots, matchResults, done, total, courts, playing }];
    });
  }, [data, events]);

  if (!data) return null;
  if (leagues.length === 0) {
    return <p className="dl-allrr__empty">リーグ戦の種目がありません。</p>;
  }

  return (
    <div className="dl-allrr">
      {leagues.map(l => (
        <section key={l.evt.eventId} className="dl-allrr__item">
          <header className="dl-allrr__head">
            <h3 className="dl-allrr__title">{l.evt.name}</h3>
            <span className="dl-allrr__meta">
              {l.courts.length > 0 && <span>{l.courts.join('・')}番コート</span>}
              {l.playing.length > 0 && <span className="is-live">{l.playing.join('・')}番で試合中</span>}
              <span>{l.done}/{l.total} 試合</span>
            </span>
          </header>
          <RoundRobinRenderer
            slots={l.slots}
            matchResults={l.matchResults}
            rankRule={l.draw.leagueRankRule}
            title={leagueShort(l.evt.name) || undefined}
            onCellSelect={onCellSelect ? (round, position) => onCellSelect(l.idx, round, position) : undefined}
          />
        </section>
      ))}
    </div>
  );
}
