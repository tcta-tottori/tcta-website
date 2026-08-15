// 大会結果アーカイブ（平成16年度〜令和6年度）の唯一の正。
//
// 中身は results.json に入っている。旧サイト（tottori-tennis.sakura.ne.jp）を
// 保存したデータから起こしたもので、
//   ・種目ごとの優勝・準優勝・第3位・ベスト4と、その名前
//   ・大会ごとの写真（WebP に変換して public/assets/img/results/<年度>/ へ）
//   ・結果PDF（public/assets/pdf/results/）
//   ・旧サイトの元ページのURL
// を大会単位で持っている。
//
// ■ 手で直すとき
//   results.json を直接編集してよい。1行にまとめてあるので、
//   まとまった修正をするときは整形してから編集し、保存時に戻すこと。
//
// ■ 新しい年度を足すとき
//   results.json の先頭に { nendo, label, tournaments: [...] } を足す。
//   写真は public/assets/img/results/<年度>/ に置き、
//   tournament.photos に 'assets/img/results/<年度>/○○.webp' の形で書く。
//
// ■ 載せていないもの
//   旧サイトに本文も写真もPDFも無かった大会は落としている。
//   結果が画像（賞状・スコア表）だけの大会は categories が空になり、
//   写真だけが並ぶ。

import RESULTS from './results.json';

export { RESULTS };

/** 年度ラベルからタブ用の短い id を作る（令和6年度 → 2024） */
export const yearId = (y) => y.nendo;

/** 大会1件の詳細ページのURL。build.format:'file' なので拡張子付きの平置き。 */
export const resultUrl = (t) => `result-${t.id}.html`;

/** 一覧に出す1行の要約。優勝者を先頭からいくつか並べる。 */
export function summarize(t, max = 3) {
  const wins = [];
  for (const c of t.categories) {
    for (const p of c.places) {
      if (p.award === '優勝' && p.name) {
        wins.push(`${c.category ? c.category + ' ' : ''}${p.name}`);
      }
      if (wins.length >= max) return wins;
    }
  }
  return wins;
}

/** 大会の中身の量（一覧で「写真◯枚」などを出すのに使う） */
export function counts(t) {
  return {
    places: t.categories.reduce((n, c) => n + c.places.length, 0),
    photos: t.photos.length,
    pdfs: t.pdfs.length,
  };
}

/** 全年度をならした一覧（詳細ページの生成に使う） */
export const ALL_RESULTS = RESULTS.flatMap((y) =>
  y.tournaments.map((t) => ({ ...t, nendo: y.nendo, yearLabel: y.label })),
);
