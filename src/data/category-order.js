// 種目の並び順。結果ページ（大会ページ・旧サイトから引き継いだ結果）で共通に使う。
//   予選 → 決勝（本戦・トーナメント）、男子（男女・混合も含む）→ 女子 の順。
//   それ以外は元の並び（公式サイト・旧サイトの順）を保つ（安定ソート）。
const stageOf = (label) => (/予選/.test(label) ? 0 : 1);
const genderOf = (label) => (/女子/.test(label) && !/男女|男子/.test(label) ? 1 : 0);

/** 種目の文言から並び順の鍵を作る。小さいほど先 */
export const categoryKey = (label) => genderOf(String(label || '')) * 10 + stageOf(String(label || ''));

/** items を、getLabel が返す種目の文言で並べ替える（同じ鍵は元の順） */
export function sortByCategory(items, getLabel) {
  return items
    .map((item, i) => ({ item, i, k: categoryKey(getLabel(item)) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.item);
}
