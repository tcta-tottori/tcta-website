// =============================================================================
// 印刷する用紙（リーグ表・審判用紙）の中身と、大会のデータからの組み立て。
//   ・中身はすべて文字列で持ち、プレビューの上で直せる（SheetViews.tsx）
//   ・用紙の大きさは切り替えられる（既定はリーグ表 A4 横・審判用紙 B5 横）
// 紙面は協会の紙の用紙（リーグ表・審判用紙）と同じ構成にする。
// =============================================================================
import type { Court, Draw, Entry, Event, Match, Player, Tournament } from '../../db/database';
import { generateLeagueMatchOrder } from '../draw/rebuildMatches';
import { getGameRuleText, getRoundName } from '../score/roundRules';
import { sideScoreText } from '../score/scoreDisplay';

export type SheetPaper = 'a4-landscape' | 'a4-portrait' | 'b5-landscape' | 'b5-portrait' | 'b4-landscape' | 'b4-portrait' | 'a3-landscape';

// B5・B4 は日本の規格（JIS。B5 = 182×257mm）。CSS の「B5」は国際規格（176×250mm）で小さいので、印刷の大きさは mm で指定する
const paper = (label: string, w: number, h: number) => ({ label, w, h, css: `${w}mm ${h}mm` });
export const SHEET_PAPERS: Record<SheetPaper, { label: string; w: number; h: number; css: string }> = {
  'a4-landscape': paper('A4 横', 297, 210),
  'a4-portrait': paper('A4 縦', 210, 297),
  'b5-landscape': paper('B5 横', 257, 182),
  'b5-portrait': paper('B5 縦', 182, 257),
  'b4-landscape': paper('B4 横', 364, 257),
  'b4-portrait': paper('B4 縦', 257, 364),
  'a3-landscape': paper('A3 横', 420, 297),
};

/** 用紙の余白（mm） */
export const SHEET_MARGIN = 8;

export interface LeaguePlayer {
  no: string;
  /** 氏名（ダブルスは 2 行） */
  names: string;
  /** 所属（ダブルスは 2 行） */
  affs: string;
  /** 対戦の列の見出し（「谷口・近藤」） */
  short: string;
}

export interface LeagueSheet {
  id: string;
  title: string;          // 男子B級ダブルス
  league: string;         // A
  court: string;          // No.1 コート
  tournament: string;     // 2026会長杯テニス大会
  format: string;         // 8ゲーム制
  players: LeaguePlayer[];
  /** 対戦のマス（[行][列]。空なら手書き用） */
  cells: string[][];
  results: string[];      // 成績の欄
  ranks: string[];        // 順位の欄
  order: string;          // 試合順：①-② ③-④ …
  orderNote: string;      // 1番目ペアが進行管理をお願いします。
  ruleTitle: string;      // リーグ戦の順位決定方法
  rules: string;          // （1）…\n（2）…
}

export interface RefereeSide { no: string; names: string; affs: string }

export interface RefereeSheet {
  id: string;
  title: string;          // 審判用紙
  tournament: string;     // 第62回会長杯テニス大会
  date: string;           // 令和8年11月15日
  event: string;          // 男子B級ダブルス\n1位・2位トーナメント
  round: string;          // 1回戦
  court: string;          // 7
  method: string;         // 6ゲームマッチ\nノーアドバンテージ\n(6-6タイブレーク)
  start: string;          // 開始時間
  left: RefereeSide;
  right: RefereeSide;
  score: string;          // 6 － 2（空なら手書き）
  footer: string;         // 鳥取市テニス協会
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
const uid = () => Math.random().toString(36).slice(2, 10);

/** 「男子B級ダブルス Aリーグ」→ ['男子B級ダブルス', 'A'] */
export function splitLeagueName(name: string): [string, string] {
  const m = String(name).trim().match(/^(.*?)[\s　]*([A-ZＡ-Ｚa-z0-9０-９]+)\s*リーグ$/);
  if (m) return [m[1].trim(), m[2].normalize('NFKC')];
  const m2 = String(name).trim().match(/^(.*?)[\s　]+(\S*リーグ)$/);
  if (m2) return [m2[1].trim(), m2[2].replace(/リーグ$/, '')];
  return [String(name).trim(), ''];
}

/** 「男子B級ダブルス 1位・2位トーナメント」→ 2 行に */
function eventTwoLines(name: string): string {
  const t = String(name).trim();
  const i = t.lastIndexOf(' ');
  return i > 0 ? `${t.slice(0, i)}\n${t.slice(i + 1)}` : t;
}

/** 'YYYY-MM-DD' → 令和8年11月15日 */
export function reiwaDate(iso: string): string {
  const t = String(iso ?? '').trim();
  // 2026-11-15・2026/11/15・2026.11.15・11/15（年が無ければ今年）
  const m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/) ?? t.match(/^()(\d{1,2})[/月](\d{1,2})/);
  if (!m) return t;
  const y = m[1] ? Number(m[1]) : new Date().getFullYear();
  return `令和${y - 2018}年${Number(m[2])}月${Number(m[3])}日`;
}

const surname = (n: string) => String(n ?? '').trim().split(/[\s　]+/)[0] ?? '';

/** 試合方式の見出し（「8ゲーム制」など） */
function formatText(evt: Event): string {
  const text = getGameRuleText(evt, 1, 1);
  const m = text.match(/(\d+)\s*ゲーム/);
  return m ? `${m[1]}ゲーム制` : text;
}

/** 順位の決め方の文（運営システムの決め方。紙面では直せる） */
function rulesText(rule: 'wins' | 'games' | undefined): string {
  return rule === 'games'
    ? '（1）取得ゲーム率の高い順に順位を決めます。\n（2）2チームが同率の場合…直接対決の勝者を上位とします。\n（3）3チーム以上が同率の場合…勝数の多い順、それでも決まらない場合は抽選により決定致します。'
    : '（1）2チームが同ポイントの場合…直接対決の勝者（取得率）を上位とします。\n（2）3チームが同ポイントの場合…抽選により決定致します。';
}

/** リーグ戦の種目から、リーグ表を組み立てる（withResults なら結果も入れる） */
export function buildLeagueSheet(
  t: Tournament | undefined, evt: Event, draw: Draw, entries: Entry[], players: Player[], matches: Match[], courts: Court[], withResults: boolean,
): LeagueSheet {
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const slots = draw.slots.filter((s) => !s.isBye).sort((a, b) => a.position - b.position);
  const list: (LeaguePlayer & { entryId: string | null })[] = slots.map((s, k) => {
    const e = entries.find((x) => x.entryId === s.entryId);
    const p1 = e ? byId.get(e.playerId) : undefined;
    const p2 = e?.partnerId ? byId.get(e.partnerId) : undefined;
    const ps = [p1, p2].filter(Boolean) as Player[];
    return {
      entryId: s.entryId ?? null,
      no: String(k + 1),
      names: ps.map((p) => p.name).join('\n'),
      affs: ps.map((p) => p.affiliation || '').join('\n'),
      short: ps.map((p) => surname(p.name)).join('・'),
    };
  });
  const n = list.length;
  const [title, league] = splitLeagueName(evt.name);
  const courtNames = (draw.leagueCourtIds ?? []).map((id) => courts.find((c) => c.courtId === id)?.name).filter(Boolean) as string[];
  const cells = list.map(() => list.map(() => ''));
  if (withResults) {
    list.forEach((a, i) => list.forEach((b, j) => {
      if (i === j || !a.entryId || !b.entryId) return;
      const m = matches.find((x) => (x.player1EntryId === a.entryId && x.player2EntryId === b.entryId) || (x.player1EntryId === b.entryId && x.player2EntryId === a.entryId));
      if (m?.score && (m.status === 'finished' || m.status === 'walkover')) cells[i][j] = sideScoreText(m.score, m.player1EntryId === a.entryId) || m.score;
    }));
  }
  const order = generateLeagueMatchOrder(n).map(([a, b]) => `${CIRCLED[a] ?? a + 1}-${CIRCLED[b] ?? b + 1}`).join(' ');
  return {
    id: uid(),
    title,
    league,
    court: courtNames.length ? `No.${courtNames.map((c) => c.replace(/[^0-9A-Za-z-]/g, '') || c).join('・')} コート` : '',
    tournament: t?.name ?? '',
    format: formatText(evt),
    players: list.map(({ entryId: _e, ...p }) => p),
    cells,
    results: list.map(() => ''),
    ranks: list.map(() => ''),
    order: `試合順：${order}`,
    orderNote: '1番目ペアが進行管理をお願いします。',
    ruleTitle: 'リーグ戦の順位決定方法',
    rules: rulesText(draw.leagueRankRule),
  };
}

/** 空のリーグ表（手で全部書く） */
export function blankLeagueSheet(tournament: string, n: number): LeagueSheet {
  const order = generateLeagueMatchOrder(n).map(([a, b]) => `${CIRCLED[a]}-${CIRCLED[b]}`).join(' ');
  return {
    id: uid(), title: '種目名', league: 'A', court: '', tournament, format: '',
    players: Array.from({ length: n }, (_, k) => ({ no: String(k + 1), names: '', affs: '', short: '' })),
    cells: Array.from({ length: n }, () => Array(n).fill('')),
    results: Array(n).fill(''), ranks: Array(n).fill(''),
    order: `試合順：${order}`, orderNote: '1番目ペアが進行管理をお願いします。', ruleTitle: 'リーグ戦の順位決定方法', rules: rulesText('wins'),
  };
}

/** 試合 1 つの審判用紙 */
export function buildRefereeSheet(
  t: Tournament | undefined, evt: Event, draw: Draw | undefined, m: Match, totalRounds: number, courts: Court[], withScore: boolean,
): RefereeSheet {
  const posOf = (entryId: string | null) => {
    if (!entryId) return '';
    const s = draw?.slots.find((x) => x.entryId === entryId);
    return s ? String(s.position) : '';
  };
  const side = (name: string, aff: string, entryId: string | null): RefereeSide => ({
    no: posOf(entryId),
    names: String(name ?? '').split(/\s*[/／]\s*/).filter(Boolean).join('\n'),
    affs: String(aff ?? '').split(/\s*[/／・]\s*/).filter(Boolean).join('\n'),
  });
  const league = draw?.drawType === 'roundRobin';
  const court = m.courtId ? courts.find((c) => c.courtId === m.courtId)?.name ?? '' : '';
  return {
    id: uid(),
    title: '審判用紙',
    tournament: t?.name ?? '',
    date: reiwaDate(t?.date ?? ''),
    event: eventTwoLines(evt.name),
    round: league ? 'リーグ戦' : getRoundName(m.round, totalRounds),
    court: court.replace(/コート$/, ''),
    method: (m.gameRule || getGameRuleText(evt, m.round, totalRounds)).replace(/（/g, '\n（').replace(/\(/g, '\n('),
    start: m.scheduledTime ?? '',
    left: side(m.player1Name, m.player1Affiliation, m.player1EntryId),
    right: side(m.player2Name, m.player2Affiliation, m.player2EntryId),
    score: withScore && m.score ? m.score.replace(/-/g, ' － ') : '',
    footer: '鳥取市テニス協会',
  };
}

/** 空の審判用紙（手で書く） */
export function blankRefereeSheet(tournament: string, date: string): RefereeSheet {
  return {
    id: uid(), title: '審判用紙', tournament, date, event: '', round: '', court: '', method: '', start: '',
    left: { no: '', names: '', affs: '' }, right: { no: '', names: '', affs: '' }, score: '', footer: '鳥取市テニス協会',
  };
}
