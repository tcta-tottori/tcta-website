// 順位別トーナメント：リーグの順位で枠が決まるトーナメント（会長杯の「1位・2位トーナメント」など）。
//
// 大会データの sources（枠ごとに「どのリーグの何位か」）を端末に入れると Draw.slotSources になり、枠は空きのまま。
// リーグが終わったら、エントリー受付の「順位を反映して組む」で
//   1. 元のリーグ（同じ大会の、その名前の種目）の順位を出す（leagueStandings.ts。決め方は Draw.leagueRankRule）
//   2. その順位のペアを、このトーナメントのエントリーとして足し、枠に入れる
// あとはふつうのトーナメントと同じく、受付 → 確定 → 試合。あたりが違えば「あたり修正」で直せる。
import { db, type Draw, type Entry } from '../../db/database';
import { leagueStandings, type Standing } from './leagueStandings';

export type PlacementSource = NonNullable<Draw['slotSources']>[number];

export interface PlacementRow {
  position: number;
  source: PlacementSource;
  /** 枠の見出し（例 Bリーグ 1位） */
  label: string;
  /** 入るペア（決まらなければ null） */
  entry: Entry | null;
  name: string;
  /** 決まらない・気をつける理由（リーグが終わっていない・同率など） */
  problem: string;
}

/** 種目名からリーグの短い名前（「男子B級ダブルス Bリーグ」→「Bリーグ」） */
export function leagueShort(league: string): string {
  const m = league.match(/([A-Za-zＡ-Ｚ0-9０-９]+リーグ|決勝リーグ|予選リーグ.*)$/);
  return m ? m[1] : league;
}
export const sourceLabel = (s: PlacementSource) => `${leagueShort(s.league).replace(/リーグ$/, '')}${s.rank}位`;

/** その順位別トーナメントに入るペアの見込み（書き込まない） */
export async function previewPlacement(eventId: string): Promise<PlacementRow[]> {
  const draw = await db.draws.where('eventId').equals(eventId).first();
  const event = await db.events.where('eventId').equals(eventId).first();
  if (!draw?.slotSources?.length || !event) return [];
  const events = await db.events.where('tournamentId').equals(event.tournamentId).toArray();
  const players = new Map((await db.players.toArray()).map((p) => [p.playerId, p]));
  const cache = new Map<string, { standings: Standing[]; finished: boolean; entries: Map<string, Entry>; error?: string }>();

  const leagueOf = async (name: string) => {
    if (cache.has(name)) return cache.get(name)!;
    const lev = events.find((e) => e.name === name);
    let r: { standings: Standing[]; finished: boolean; entries: Map<string, Entry>; error?: string };
    if (!lev) r = { standings: [], finished: false, entries: new Map(), error: `種目「${name}」がありません` };
    else {
      const ldraw = await db.draws.where('eventId').equals(lev.eventId).first();
      const entries = await db.entries.where('eventId').equals(lev.eventId).toArray();
      const ids = (ldraw?.slots ?? []).filter((s) => s.entryId).sort((a, b) => a.position - b.position).map((s) => s.entryId!);
      const matches = await db.matches.where('eventId').equals(lev.eventId).toArray();
      const st = leagueStandings(ids, matches, ldraw?.leagueRankRule ?? 'wins');
      r = { ...st, entries: new Map(entries.map((e) => [e.entryId, e])), ...(matches.length === 0 ? { error: 'リーグがまだ確定していません' } : {}) };
    }
    cache.set(name, r);
    return r;
  };

  const rows: PlacementRow[] = [];
  for (const source of [...draw.slotSources].sort((a, b) => a.position - b.position)) {
    const lg = await leagueOf(source.league);
    const s = lg.standings.find((x) => x.rank === source.rank);
    const entry = s ? lg.entries.get(s.entryId) ?? null : null;
    const p1 = entry ? players.get(entry.playerId) : undefined;
    const p2 = entry?.partnerId ? players.get(entry.partnerId) : undefined;
    const problem = lg.error ?? (!s ? `${source.rank}位がいません` : !lg.finished ? 'リーグの試合が終わっていません' : s.tied ? '同率（くじ引きで決めてください）' : '');
    rows.push({
      position: source.position, source, label: sourceLabel(source), entry: lg.error ? null : entry,
      name: entry ? [p1?.name, p2?.name].filter(Boolean).join(' / ') : '', problem,
    });
  }
  return rows;
}

/**
 * 見込みのとおりに枠へ入れる。リーグが終わっていない枠・同率の枠も、今の順位で入れる（あとで「あたり修正」で直せる）。
 * 入れる相手のいない枠は空きのまま。すでに試合（対戦表）がある種目は入れ直さない。
 */
export async function applyPlacement(eventId: string): Promise<{ filled: number; rows: PlacementRow[] }> {
  const draw = await db.draws.where('eventId').equals(eventId).first();
  if (!draw?.id || !draw.slotSources?.length) throw new Error('順位別トーナメントではありません');
  if ((await db.matches.where('eventId').equals(eventId).count()) > 0) throw new Error('この種目はもう確定しています。確定を解除してから組み直してください');
  const rows = await previewPlacement(eventId);
  let filled = 0;
  await db.transaction('rw', [db.entries, db.draws], async () => {
    // 前に入れた分（組み直し）を消す
    const old = await db.entries.where('eventId').equals(eventId).toArray();
    await db.entries.bulkDelete(old.filter((e) => e.entryId.startsWith(`${eventId}-P`)).map((e) => e.id!));
    const byPos = new Map<number, string | null>();
    for (const r of rows) {
      if (!r.entry) { byPos.set(r.position, null); continue; }
      const entryId = `${eventId}-P${r.position}`;
      await db.entries.add({ eventId, entryId, playerId: r.entry.playerId, ...(r.entry.partnerId ? { partnerId: r.entry.partnerId } : {}), rankPoint: 0, status: 'active' });
      byPos.set(r.position, entryId);
      filled++;
    }
    const slots = draw.slots.map((s) => (byPos.has(s.position) ? { ...s, entryId: byPos.get(s.position) ?? null, isBye: false } : s));
    await db.draws.update(draw.id!, { slots, updatedAt: Date.now() });
  });
  return { filled, rows };
}
