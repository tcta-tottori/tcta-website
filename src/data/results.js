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
//   results.json を直接編集してよい。題名の誤字や、本文から会場として
//   拾ってしまった優勝チーム名（venue）は、すでにいくつか手で直してある。1行にまとめてあるので、
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

/* ======================================================================
 * 一覧（results.html）で「見やすい形」に組み直すための道具
 *
 * 旧サイトは1大会を複数ページに分けていた。
 *   ・「東部地区選手権シングルス」の次に「ダブルス」だけのページ
 *   ・「クラブ対抗戦男子1部〜6部」の次に「女子1部・2部」「ギャラリー」
 *   ・「佐々木杯」と「佐々木杯（写真）」
 * results.json もその単位のままなので、一覧では同じ大会を1枚のカードに束ねる。
 * 詳細ページ（result-*.html）は従来どおり1ページずつ。
 * ====================================================================== */

/** 単独では大会名にならない題名。直前の大会の続きとして束ねる。 */
const FRAGMENT_TITLES = new Set(['ダブルス', 'シングルス', '女子', '決勝', '男子ダブルス', '男女シングルス']);

const isFragment = (title) =>
  FRAGMENT_TITLES.has(title) ||
  (title.length <= 8 && title.includes('ギャラリー')) ||
  title.endsWith('（写真）') || title.endsWith('（PDF）') ||
  (title.startsWith('女子') && title.includes('部') && title.length <= 12);

/**
 * 束ねたときのカードの題名。先頭のページの題名が「東部地区選手権シングルス」のように
 * 一部の種目しか指していないものだけ、大会全体の名前に置き換える（先頭ページの id で引く）。
 */
const GROUP_TITLE = {
  '2024-2024club-taiko-m1-6': 'クラブ対抗戦',
  '2024-2024club-taiko-m7-8': 'クラブ対抗戦',
  '2023-2023club-taiko-m1-6': 'クラブ対抗戦',
  '2023-2023club-taiko-m7-8': 'クラブ対抗戦',
  '2022-2022club-taiko-w1-2': 'クラブ対抗戦',
  '2021-2021club-taiko-m1-6': 'クラブ対抗戦',
  '2021-2021club-taiko-m7-8': 'クラブ対抗戦',
  '2020-2020club-taiko-10-25': 'クラブ対抗戦',
  '2020-2020club-taiko-m78result': 'クラブ対抗戦',
  '2019-2019clubtaiko-m8': 'クラブ対抗戦',
  '2018-2018club-taiko-m8': 'クラブ対抗戦',
  '2017-2017club-taiko-m8': 'クラブ対抗戦',
  '2014-h26-clubtaiko-result-m7-8': 'クラブ対抗戦',
  '2021-2022osaka-hai-d': '尾坂杯鳥取室内選手権',
  '2021-2021tobu-s': '東部地区選手権',
  '2017-2017tobu-s': '東部地区テニス選手権大会',
  '2015-h27-tobu-s': '東部地区テニス選手権',
  '2014-h26kensen-d': '鳥取県テニス選手権',
  '2014-h26tobu-result-s': '東部選手権',
  '2013-h26-osakahai-result-m': '尾坂杯鳥取室内選手権',
  '2012-h24toubu-result-ms': '第41回東部地区テニス選手権大会',
  '2011-2012tottorisitunai-1-8': '鳥取室内選手権',
  '2011-11th-gashai-q': '第16回鳥取ガス杯',
  '2011-2011kaichohai-md': '会長杯（春）',
  '2011-2011tobu-result-s': '第40回東部地区テニス選手権大会',
  '2010-15thgashai-q': '鳥取ガス杯',
};

/** 「第３位」「ベスト４」「１位」など全角数字のゆれをそろえる */
export const normalizeAward = (award) =>
  award.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

/** 表の列。優勝＝1列目、準優勝＝2列目、それ以外（3位・ベスト4）＝3列目 */
export const awardColumn = (award) => {
  const a = normalizeAward(award);
  if (a === '優勝' || a === '1位') return 'win';
  if (a === '準優勝' || a === '2位') return 'second';
  return 'other';
};

/** 種目1件を、表の1行（優勝／準優勝／その他）に組み直す */
export function placeRow(c) {
  const row = { category: c.category || '種目', win: [], second: [], other: [] };
  for (const p of c.places) {
    if (!p.name) continue;
    const col = awardColumn(p.award);
    row[col].push(col === 'other' ? { award: normalizeAward(p.award), name: p.name } : { name: p.name });
  }
  return row;
}

/** 束ねた題名と各ページの題名で重なる先頭を落とす（「クラブ対抗戦男子1部〜6部」→「男子1部〜6部」） */
function subTitle(groupTitle, title) {
  let i = 0;
  while (i < groupTitle.length && i < title.length && groupTitle[i] === title[i]) i++;
  const rest = title.slice(i).replace(/^[（(・\s]+/, '');
  return i >= 4 && rest ? rest : title;
}

/**
 * 1年度分の大会を一覧用に束ねる。
 * 戻り値は { title, entries: [ { t, title, kind } ] } の配列。
 *   kind: 'result'（成績がある）／'gallery'（写真だけ）／'pdf'（PDFだけ）／'empty'
 */
export function groupYear(year) {
  const groups = [];
  for (const t of year.tournaments) {
    let parent = null;
    if (isFragment(t.title) && groups.length) {
      // 「○○（写真）」は同じ年度の「○○」に付ける。無ければ直前の大会に付ける。
      const base = t.title.replace(/（写真）$|（PDF）$/, '');
      parent = (base !== t.title && [...groups].reverse().find((g) => g.entries[0].t.title === base)) || groups[groups.length - 1];
    }
    const kind = t.categories.length ? 'result' : t.photos.length ? 'gallery' : t.pdfs.length ? 'pdf' : 'empty';
    if (parent) {
      parent.entries.push({ t, title: t.title, kind });
    } else {
      groups.push({ title: GROUP_TITLE[t.id] ?? t.title, entries: [{ t, title: t.title, kind }] });
    }
  }
  for (const g of groups) {
    for (const e of g.entries) e.title = subTitle(g.title, e.title.replace(/（写真）$|（PDF）$/, ''));
    g.photos = g.entries.reduce((n, e) => n + e.t.photos.length, 0);
    g.pdfs = g.entries.flatMap((e) => e.t.pdfs);
    g.href = resultUrl(g.entries[0].t);
    g.results = g.entries.filter((e) => e.kind === 'result');
    g.galleries = g.entries.filter((e) => e.kind === 'gallery');
  }
  return groups;
}
