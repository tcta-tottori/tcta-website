// リーグ戦（総当たり）の順位。順位別トーナメントの組み合わせ（placement.ts）に使う。
//
// 決め方（Draw.leagueRankRule）
//   wins  … 勝数の多い順。同数が 2 者なら対戦の勝者が上、3 者以上なら取得ゲーム率の高い順（その中で 2 者が並べば対戦の勝者）。既定
//   games … 取得ゲーム率（取ったゲーム ÷ 全ゲーム）の高い順。同率が 2 者なら対戦の勝者が上（男子B級のような「8ゲーム制」の予選）
// どの決め方でも決まらない並び（同率で対戦も無い・引き分け扱い）は tied に印を付ける（会場でくじ引き）。
//
// スコアは試合の score（"8-3" のような player1-player2 の順）から数える。不戦勝（W.O）はゲーム数に入れない。
import type { Match } from '../../db/database';

export type RankRule = 'wins' | 'games';

export interface Standing {
  entryId: string;
  rank: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  /** 取得ゲーム率（0〜1） */
  gameRate: number;
  /** 決め方で決まらない（くじ引きが要る） */
  tied: boolean;
}

/** "8-3" / "6-1 RET" / "8-7(5)" → [player1 のゲーム, player2 のゲーム] */
function games(score: string | null | undefined): [number, number] | null {
  const m = String(score ?? '').match(/(\d+)\s*[-−]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * @param entryIds リーグの全員（並びは枠の順）
 * @param matches  そのリーグの試合
 */
type LeagueMatch = Pick<Match, 'player1EntryId' | 'player2EntryId' | 'winnerEntryId' | 'score' | 'status'>;

export function leagueStandings(entryIds: string[], matches: LeagueMatch[], rule: RankRule = 'wins'): { standings: Standing[]; finished: boolean } {
  const between = (a: string, b: string) => matches.find((m) =>
    (m.player1EntryId === a && m.player2EntryId === b) || (m.player1EntryId === b && m.player2EntryId === a));

  const stat = new Map(entryIds.map((id) => [id, { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0 }]));
  let finished = entryIds.length >= 2;
  for (let i = 0; i < entryIds.length; i++) {
    for (let j = i + 1; j < entryIds.length; j++) {
      const a = entryIds[i], b = entryIds[j];
      const m = between(a, b);
      if (!m?.winnerEntryId) { finished = false; continue; }
      const w = m.winnerEntryId === a ? a : b, l = w === a ? b : a;
      stat.get(w)!.wins++;
      stat.get(l)!.losses++;
      const g = m.status === 'walkover' ? null : games(m.score);
      if (g) {
        const aIsP1 = m.player1EntryId === a;
        const ga = aIsP1 ? g[0] : g[1], gb = aIsP1 ? g[1] : g[0];
        stat.get(a)!.gamesWon += ga; stat.get(a)!.gamesLost += gb;
        stat.get(b)!.gamesWon += gb; stat.get(b)!.gamesLost += ga;
      }
    }
  }
  const rate = (id: string) => { const s = stat.get(id)!; const t = s.gamesWon + s.gamesLost; return t > 0 ? s.gamesWon / t : 0; };
  const h2h = (a: string, b: string) => { const m = between(a, b); return m?.winnerEntryId === a ? -1 : m?.winnerEntryId === b ? 1 : 0; };
  const tied = new Set<string>();

  /** 同じ値どうしをまとめ、まとまりの中を次の決め方で並べる */
  const order = (ids: string[], keys: ((id: string) => number)[]): string[] => {
    if (ids.length <= 1) return ids;
    if (ids.length === 2) {
      const h = h2h(ids[0], ids[1]);
      if (h !== 0) return h < 0 ? ids : [ids[1], ids[0]];
    }
    if (keys.length === 0) { ids.forEach((id) => tied.add(id)); return ids; }
    const [key, ...rest] = keys;
    const groups = new Map<number, string[]>();
    for (const id of ids) { const k = Math.round(key(id) * 1e9); groups.set(k, [...(groups.get(k) ?? []), id]); }
    if (groups.size === 1) return order(ids, rest);
    return [...groups.entries()].sort((x, y) => y[0] - x[0]).flatMap(([, g]) => order(g, rest));
  };

  const wins = (id: string) => stat.get(id)!.wins;
  // 最初の決め方でまとめ、同じまとまりの中は「2 者なら対戦・3 者以上なら次の決め方」
  const first = rule === 'games' ? rate : wins;
  const next = rule === 'games' ? [wins] : [rate];
  const groups = new Map<number, string[]>();
  for (const id of entryIds) { const k = Math.round(first(id) * 1e9); groups.set(k, [...(groups.get(k) ?? []), id]); }
  const sorted = [...groups.entries()].sort((x, y) => y[0] - x[0]).flatMap(([, g]) => order(g, next));

  return {
    finished,
    standings: sorted.map((id, i) => ({ entryId: id, rank: i + 1, ...stat.get(id)!, gameRate: rate(id), tied: tied.has(id) })),
  };
}
