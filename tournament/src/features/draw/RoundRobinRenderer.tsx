import type { DrawSlotData, MatchResult } from './DrawBoard';
import { pairDisplayLines } from './pairLabel';
import { sideScoreText } from '../score/scoreDisplay';
import { leagueStandings, type RankRule } from './leagueStandings';
import { generateLeagueMatchOrder } from './rebuildMatches';

/** 星取表の列見出し用に苗字だけにする（ダブルスは「苗字・苗字」） */
function surnameLabel(name: string): string {
  const parts = name.split(/\s*[/／・]\s*/).map(t => t.trim()).filter(Boolean);
  if (parts.length === 0) return name;
  return parts.map(t => t.split(/[\s\u3000]+/)[0]).join('・');
}

interface RoundRobinRendererProps {
  slots: DrawSlotData[];
  matchResults?: MatchResult[];
  /** 星取表のセルをタップしたときに、その対戦のスコア入力を開く（指定時のみセルがタップ可能） */
  onCellSelect?: (round: number, position: number) => void;
  /** 選手名をタップしたときに名前の修正を開く（名前修正モード時のみ指定する） */
  onPlayerSelect?: (entryId: string) => void;
  /** 順位の決め方（Draw.leagueRankRule。games＝取得ゲーム率が先）。順位別トーナメントの組み合わせと同じ計算 */
  rankRule?: RankRule;
  /** 表の左上の見出し（例「Aリーグ」）。無ければ「リーグ」 */
  title?: string;
}

/** "8-4" 形式のスコアを [自分のゲーム, 相手のゲーム] に分解（取得できなければ null） */
function parseScore(score: string | undefined | null): [number, number] | null {
  if (!score) return null;
  const m = score.match(/(\d+)\s*[-−]\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

export default function RoundRobinRenderer({ slots, matchResults = [], onCellSelect, onPlayerSelect, rankRule = 'wins', title = 'リーグ' }: RoundRobinRendererProps) {
  // BYEを除いた実選手のみ
  const players = slots.filter(s => !s.isBye);
  const n = players.length;

  if (n < 2) {
    return <div className="p-8 text-center text-gray-500">リーグ表示には2人以上の選手が必要です</div>;
  }

  // 対戦順（実際に組む試合順と同じ。協会のプログラムの順：rebuildMatches.ts）
  const matchOrder: [number, number][] = generateLeagueMatchOrder(n);

  // 試合結果を選手ペアで検索
  const findMatchBetween = (p1: DrawSlotData, p2: DrawSlotData): MatchResult | undefined => {
    return matchResults.find(m =>
      (m.player1EntryId === p1.entryId && m.player2EntryId === p2.entryId) ||
      (m.player1EntryId === p2.entryId && m.player2EntryId === p1.entryId)
    );
  };

  // 勝敗・ゲーム数集計（勝率＝取得ゲーム率の算出に使用）
  const stats = players.map((p) => {
    let wins = 0, losses = 0, gamesWon = 0, gamesLost = 0;
    for (const other of players) {
      if (other.entryId === p.entryId) continue;
      const match = findMatchBetween(p, other);
      if (!match) continue;
      if (match.winnerEntryId) {
        if (match.winnerEntryId === p.entryId) wins++;
        else losses++;
      }
      // ゲーム数（自分視点）を加算
      const sc = parseScore(match.score);
      if (sc) {
        const mine = match.player1EntryId === p.entryId ? sc[0] : sc[1];
        const theirs = match.player1EntryId === p.entryId ? sc[1] : sc[0];
        gamesWon += mine;
        gamesLost += theirs;
      }
    }
    const played = wins + losses;
    const totalGames = gamesWon + gamesLost;
    return {
      wins, losses, gamesWon, gamesLost, played,
      // 勝率＝取得ゲーム率（同勝数の並び替えに使用。試合未消化でも算出可能）
      gameRate: totalGames > 0 ? gamesWon / totalGames : 0,
    };
  });

  // 全対戦が終了しているか（順位は全結果が揃うまで非表示）
  const allFinished = matchOrder.every(([a, b]) => {
    const match = findMatchBetween(players[a], players[b]);
    return !!(match && match.winnerEntryId);
  });

  // 順位（leagueStandings.ts。順位別トーナメントの組み合わせと同じ計算）
  //   wins  … 勝数 → 同数 2 者は直接対戦、3 者以上は取得ゲーム率
  //   games … 取得ゲーム率 → 同率 2 者は直接対戦
  const ids = players.map((p) => p.entryId ?? '');
  const { standings } = leagueStandings(ids, matchResults, rankRule);
  const rankMap = new Map<number, number>();
  for (const s of standings) rankMap.set(ids.indexOf(s.entryId), s.rank);

  // セル内のスコア表示（行選手視点にそろえる）
  const getCellContent = (rowIdx: number, colIdx: number): { text: string; isWin: boolean; isLoss: boolean; match?: MatchResult } => {
    if (rowIdx === colIdx) return { text: '', isWin: false, isLoss: false };
    const p1 = players[rowIdx];
    const p2 = players[colIdx];
    const match = findMatchBetween(p1, p2);
    if (!match) return { text: '', isWin: false, isLoss: false };
    if (!match.winnerEntryId) return { text: '', isWin: false, isLoss: false, match };
    const isWin = match.winnerEntryId === p1.entryId;
    // スコアを行選手視点にそろえる（タイブレークの得点・Ret / W.O も残す）
    const aligned = sideScoreText(match.score, match.player1EntryId === p1.entryId);
    const scoreText = aligned || match.score || (isWin ? '○' : '●');
    return { text: scoreText, isWin, isLoss: !isWin, match };
  };

  return (
    <div className="overflow-auto p-4 sm:p-6" style={{ width: '100%', height: '100%' }}>
      <div className="inline-block min-w-full">
        {/* 結果画像と同じ体裁（角丸の外枠1本・薄い罫線・見出しの下に赤線） */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-red-500">
                <th className="px-2 py-1.5 text-center text-[12px] font-bold text-gray-800 min-w-[132px] sm:min-w-[170px]">
                  {title}
                </th>
                {players.map((p, i) => (
                  <th
                    key={`col-${i}`}
                    className="border-l border-gray-200 px-1.5 py-1.5 text-center text-[12px] font-bold text-gray-800 whitespace-nowrap min-w-[58px] sm:min-w-[72px]"
                  >
                    {surnameLabel(p.name)}
                  </th>
                ))}
                <th className="border-l border-gray-200 px-1.5 py-1.5 text-center text-[12px] font-bold text-gray-800 min-w-[52px] sm:min-w-[64px]">
                  勝敗
                </th>
                <th className="border-l border-gray-200 px-1.5 py-1.5 text-center text-[12px] font-bold text-gray-800 min-w-[44px] sm:min-w-[56px]">
                  勝率
                </th>
                <th className="border-l border-gray-200 px-1.5 py-1.5 text-center text-[12px] font-bold text-gray-800 min-w-[44px] sm:min-w-[56px]">
                  順位
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, rowIdx) => {
                const { names: nameLines, affiliations: affLines } =
                  pairDisplayLines(player.name, player.affiliation);
                const rank = rankMap.get(rowIdx);
                return (
                  <tr key={`row-${rowIdx}`} className={rowIdx % 2 === 1 ? 'bg-gray-50/70' : ''}>
                    {/* 選手名セル（名前修正モードではタップで修正） */}
                    <td
                      onClick={onPlayerSelect && player.entryId ? () => onPlayerSelect(player.entryId!) : undefined}
                      className={`border-t border-gray-200 px-1.5 py-1.5 whitespace-nowrap ${
                        onPlayerSelect && player.entryId ? 'cursor-pointer hover:bg-primary-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400 tabular-nums">{rowIdx + 1}</span>
                        {/* 優勝（1位）のペア・選手は赤文字にする */}
                        <span className={`font-bold leading-tight ${
                          allFinished && rank === 1 ? 'text-red-600' : 'text-gray-800'
                        }`}>
                          {nameLines.map((line, i) => <div key={i}>{line}</div>)}
                        </span>
                        {affLines.length > 0 && (
                          <span className="text-gray-500 text-[11px] leading-tight">
                            {affLines.map((line, i) => <div key={i}>（{line}）</div>)}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* 対戦結果セル */}
                    {players.map((_, colIdx) => {
                      const isSelf = rowIdx === colIdx;
                      const cell = getCellContent(rowIdx, colIdx);
                      const clickable = !isSelf && !!onCellSelect && !!cell.match;
                      return (
                        <td
                          key={`cell-${rowIdx}-${colIdx}`}
                          onClick={clickable ? () => onCellSelect!(cell.match!.round, cell.match!.position) : undefined}
                          // 結果画像と同じ体裁：勝った側は淡い赤地、負けた側は白地
                          className={`border-t border-l border-gray-200 px-1.5 py-1.5 text-center relative ${
                            isSelf ? 'bg-gray-100' : cell.text ? (cell.isWin ? 'bg-red-50' : 'bg-white') : ''
                          } ${clickable ? 'cursor-pointer hover:bg-primary-50' : ''}`}
                        >
                          {isSelf ? (
                            /* 対角線（自分 vs 自分） */
                            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                              <line x1="0" y1="0" x2="100%" y2="100%" stroke="#d1d5db" strokeWidth="1.2" />
                            </svg>
                          ) : cell.text ? (
                            // バッジにはせず、勝者=赤・敗者=グレーの文字だけで見せる
                            <span className={`text-[13px] font-bold ${cell.isWin ? 'text-red-600' : 'text-gray-500'}`}>
                              {cell.text}
                            </span>
                          ) : clickable ? (
                            <span className="text-[10px] text-gray-300">入力</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    {/* 勝敗 */}
                    <td className="border-t border-l border-gray-200 px-1.5 py-1.5 text-center font-bold text-gray-700 tabular-nums whitespace-nowrap">
                      {stats[rowIdx].played > 0
                        ? `${stats[rowIdx].wins}-${stats[rowIdx].losses}`
                        : ''}
                    </td>
                    {/* 勝率（取得ゲーム率） */}
                    <td className="border-t border-l border-gray-200 px-1.5 py-1.5 text-center text-[12px] text-gray-500 tabular-nums whitespace-nowrap">
                      {stats[rowIdx].gamesWon + stats[rowIdx].gamesLost > 0
                        ? stats[rowIdx].gameRate.toFixed(3)
                        : ''}
                    </td>
                    {/* 順位（全結果が揃うまで非表示。1位は赤字） */}
                    <td className={`border-t border-l border-gray-200 px-1.5 py-1.5 text-center font-bold whitespace-nowrap ${
                      rank === 1 ? 'text-red-600 text-[14px]' : 'text-gray-600 text-[14px]'
                    }`}>
                      {allFinished && rank ? `${rank}位` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 補足: 順位表示条件・並び替えルール */}
        <div className="mt-2 text-[11px] text-gray-500">
          {!allFinished && <span className="text-gray-700 font-medium">※順位は全対戦終了後に表示されます。</span>}
          <span className="block mt-0.5">{rankRule === 'games'
            ? '勝率＝取得ゲーム率。取得ゲーム率の高い順、同率は直接対戦の勝者が上位。'
            : '勝率＝取得ゲーム率。勝数の多い順、同勝数は「2者なら直接対戦／3者以上なら取得ゲーム率」で順位を決定します。'}</span>
        </div>

        {/* 対戦順 */}
        <div className="mt-3 text-sm text-gray-600">
          <span className="font-medium">{'※対戦順\u3000'}</span>
          {matchOrder.map(([a, b], idx) => (
            <span key={idx} className="mr-2">
              {toCircledNum(a + 1)}-{toCircledNum(b + 1)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function toCircledNum(n: number): string {
  const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯';
  return n >= 1 && n <= 16 ? circled[n - 1] : String(n);
}
