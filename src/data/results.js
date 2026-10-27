// 大会結果アーカイブ（平成16年度〜令和6年度）の唯一の正。
//
// 中身は results.json に入っている。旧サイト（tottori-tennis.sakura.ne.jp）を
// 保存したデータから起こしたもので、
//   ・種目ごとの優勝・準優勝・第3位・ベスト4と、その名前
//   ・大会ごとの写真（WebP に変換して public/assets/img/results/<年度>/ へ）
//   ・結果PDF（public/assets/pdf/results/）
//   ・旧サイトの元ページのURL
//   ・開催日（date）と会場（venue）
// を大会単位で持っている。
//
// ■ 開催日と会場
//   旧サイトの結果ページには日付がほとんど書かれていない。date と venue は、
//   手元の過去資料（年間の大会日程、大会ごとのドロー・プログラム・要綱のPDF、
//   旧サイトのドロー／ギャラリーのページ）から tools/fill_dates.py が起こしたもの。
//   date は「令和6年4月7日」の形の文字列で、並べ替えに使う YYYY-MM-DD は
//   下の legacyMeta がここから作る。dateSource はどの資料から採ったかの控えで、
//   画面には出さない。dateSource が年間日程のPDF（○○taikai-nittei.pdf /
//   ○○tournament-schedule.pdf）になっているものは「予定されていた日」で、
//   予備日に順延された大会はずれている可能性がある。ドロー・プログラム・結果表から
//   452大会のうち366件に日付が入っている。
//
// ■ どこから起こしたか
//   最初の巡回（scrape_output）は旧サイトの年度一覧から辿れるページしか見ていなかった。
//   一覧から外れていた結果ページ（クラブ対抗戦の平成19・22〜25・27年度、2016・2023年度など）は
//   tools/restore_missing.py が旧サイト丸ごとの控えから拾い直して足してある
//   （成績のあるページ64件、写真だけのギャラリー61件）。
//
// ■ 一覧での束ね方
//   旧サイトは1つの大会を「結果」「ギャラリー」「予選」「決勝」と別ページにしていて、
//   題名のつけ方もばらばらだった。groupYear は、ページ名と題名から割り出した
//   大会の種類（legacyKind）が同じものを1枚のカードに束ね、いちばん大会名らしい
//   題名を選んで出す。
//
// ■ 手で直すとき
//   results.json を直接編集してよい。題名の誤字や、本文から会場として
//   拾ってしまった優勝チーム名（venue）は、すでにいくつか手で直してある。1行にまとめてあるので、
//   まとまった修正をするときは整形してから編集し、保存時に戻すこと。
//
// ■ 新しい年度を足すとき
//   results.json の先頭に { nendo, label, tournaments: [...] } を足す。
//   写真は public/assets/img/results/<年度>/ に置き、
//   tournament.photos に { src: 'assets/img/results/<年度>/○○.webp', w, h, kind } の形で書く。
//   kind は 'sheet'（ドロー表・リーグ表などの結果画像）か 'photo'（表彰・試合の写真）。
//   旧サイトと同じく「種目の結果画像 → その種目の優勝者の写真」の順に並べる。
//   旧サイト分の kind は tools/classify_photos.py が画像の中身から付けた。
//
// ■ 載せていないもの
//   旧サイトに本文も写真もPDFも無かった大会は落としている。
//   結果が画像（賞状・スコア表）だけの大会は categories が空になり、
//   写真だけが並ぶ。

import RESULTS from './results.json';

export { RESULTS };

/** 年度ラベルからタブ用の短い id を作る（令和6年度 → 2024） */
export const yearId = (y) => y.nendo;

/**
 * 大会1件の詳細ページのURL。build.format:'file' なので拡張子付きの平置き。
 * 旧サイトで「ダブルス」「写真」と別ページに分かれていたものは、束ねた先頭ページの id を使う
 * （下の groupYear を参照）。
 */
export const resultUrl = (t) => `result-${GROUP_ID.get(t.id) ?? t.id}.html`;

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
 *   ・「クラブ対抗戦男子1部〜6部」「男子7部・8部」「女子1部・2部」「女子3〜5部」「ギャラリー」
 *   ・「佐々木杯」と「佐々木杯（写真）」
 * results.json もその単位のままなので、同じ大会を1つに束ねる。
 * 詳細ページ（result-*.html）も束ねた単位で1ページ。
 * クラブ対抗戦は年度の中の全ページを1つに束ね、部の順（男子1部→8部 → 男子予選会 → 女子1部→5部 → 女子予選会）に並べ直す（下の clubDivisions）。
 * 写真だけのページ（ギャラリー）は、結果のある大会では別ページ（gallery-*.html）に出す。
 * ====================================================================== */

/** 写真だけのページをギャラリーとして別ページに出す枚数。これより少なければ結果のページにそのまま並べる */
const GALLERY_MIN = 12;

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
  let club = null;
  for (const t of year.tournaments) {
    const kind = t.categories.length ? 'result' : t.photos.length ? 'gallery' : t.pdfs.length ? 'pdf' : 'empty';
    // クラブ対抗戦は、年度の中の全ページ（男子1部〜6部・7部8部・女子・ギャラリー）を1つに束ねる
    if (isClubLeague(t)) {
      if (!club) groups.push((club = { title: 'クラブ対抗戦', merged: true, entries: [] }));
      club.entries.push({ t, title: t.title, kind });
      continue;
    }
    let parent = null;
    const plain = groups.filter((g) => !g.merged);
    if (isFragment(t.title) && plain.length) {
      // 「○○（写真）」は同じ年度の「○○」に付ける。無ければ直前の大会に付ける。
      const base = t.title.replace(/（写真）$|（PDF）$/, '');
      parent = (base !== t.title && [...plain].reverse().find((g) => g.entries[0].t.title === base)) || plain[plain.length - 1];
    }
    if (parent) {
      parent.entries.push({ t, title: t.title, kind });
    } else {
      groups.push({ title: GROUP_TITLE[t.id] ?? t.title, entries: [{ t, title: t.title, kind }] });
    }
  }
  const out = mergeByKind(groups);
  for (const g of out) {
    if (!g.merged) g.title = tidyGroupTitle(g.title);
    for (const e of g.entries) e.title = subTitle(g.title, e.title.replace(/（写真）$|（PDF）$/, ''));
    g.photos = g.entries.reduce((n, e) => n + e.t.photos.length, 0);
    g.pdfs = g.entries.flatMap((e) => e.t.pdfs);
    g.href = `result-${g.entries[0].t.id}.html`;
    g.results = g.entries.filter((e) => e.kind === 'result');
    g.galleries = g.entries.filter((e) => e.kind === 'gallery');
    // 結果のある大会に付いた写真だけのページは、別ページ（ギャラリー）に出す。数枚しか無いものはそのまま
    g.galleryPhotos = g.galleries.reduce((n, e) => n + e.t.photos.length, 0);
    g.galleryHref = g.results.length && g.galleryPhotos >= GALLERY_MIN ? `gallery-${g.entries[0].t.id}.html` : null;
  }
  return out;
}

/* ---- クラブ対抗戦 ---- */

/** クラブ対抗戦のページかどうか（旧サイトの id で判定） */
export const isClubLeague = (t) => /club-?taiko|club-?gallery|clubtaiko/.test(t.id);

const toAscii = (str) => str.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

/* ----------------------------------------------------------------------
 * 同じ大会のページをまとめる「種類キー」
 *
 * 旧サイトは1つの大会を「結果」「ギャラリー」「予選」「決勝」と別ページにしていて、
 * 題名のつけ方もページごとにばらばら（「鳥取ガス杯」「第15回鳥取ガス杯ギャラリー」）。
 * 題名だけでは束ねられないので、ページのファイル名と題名から大会の種類を割り出して束ねる。
 * tools/fill_dates.py の kind_from_slug と同じ決め方。
 * ---------------------------------------------------------------------- */
function legacyKind(t) {
  const s = (t.id || '').toLowerCase();
  const title = toAscii(t.title || '').replace(/\s+/g, '');
  const hs = (...w) => w.some((x) => s.includes(x));
  const ht = (...w) => w.some((x) => title.includes(x));
  if (hs('club-taiko', 'clubtaiko')) return 'club';
  if (hs('tobu', 'toubu', 'to-bu')) return ht('ダブルス') ? 'tobu_d' : ht('シングルス') ? 'tobu_s' : hs('-d') ? 'tobu_d' : hs('-s') ? 'tobu_s' : 'tobu';
  if (hs('kaicho', 'kaichou', 'kaicno')) return hs('-f') || ht('秋') ? 'kaicho_f' : hs('-s') || ht('春') ? 'kaicho_s' : 'kaicho';
  if (hs('kenko')) return ht('秋') ? 'kenko_f' : 'kenko_s';
  if (hs('sasaki')) return 'sasaki';
  if (hs('ketaka')) return hs('cup') || ht('カップ') ? 'ketaka_cup' : 'ketaka_open';
  if (hs('summer')) return 'summer_mix';
  if (hs('dunlop', 'dunrop')) return 'dunlop';
  if (hs('enetopia', 'enetpia')) return 'enetopia';
  if (hs('prince')) return 'prince';
  if (hs('kensen')) return ht('ダブルス') ? 'kensen_d' : ht('シングルス') ? 'kensen_s' : hs('-d') ? 'kensen_d' : hs('-s') ? 'kensen_s' : 'kensen';
  if (hs('sicho', 'shicho', 'sichou', 'shichou')) return 'shicho';
  if (hs('osaka', 'situnai', 'sitsunai')) return ht('ダブルス') ? 'osaka_d' : ht('シングルス') ? 'osaka_s' : 'osaka';
  if (hs('gashai', 'gas-hai', 'gus-hai', 'gushai', 'torigas')) return 'gas';
  if (hs('kokutai')) return 'kokutai';
  if (hs('zennihon', 'all-japan', 'alljapan')) return 'alljapan';
  if (hs('toridai')) return ht('ダブルス') ? 'toridai_d' : ht('シングルス') ? 'toridai_s' : 'toridai';
  return null;
}

/** 束ねたカードに出す題名。大会名らしく、飾りの少ないものを選んで整える。 */
const EVENT_WORD = /杯|選手権|オープン|トーナメント|ミックス|対抗|予選会|フェスタ|カップ/;
const TITLE_JUNK = /^(決勝|予選|順位別|女子|男子|シングルス|ダブルス|ギャラリ|写真)/;

function bestTitle(entries) {
  const score = (e) => {
    const t = e.t.title || '';
    let v = e.t.categories.reduce((n, c) => n + c.places.length, 0) * 5;
    if (EVENT_WORD.test(t)) v += 60;
    if (/ギャラリ|写真|入賞者/.test(t)) v -= 60;
    if (TITLE_JUNK.test(t)) v -= 120;
    v -= Math.abs(t.length - 12);
    return v;
  };
  const best = entries.slice().sort((a, b) => score(b) - score(a))[0].t.title || '';
  return tidyGroupTitle(best, /(予選|決勝|結果|入賞者|優勝者|（写真）|ギャラリ[ーｰ]?[0-9]*)+$/);
}

/** カードの題名から「入賞者」「ギャラリー」などの飾りを落とす（3文字以上残るときだけ） */
function tidyGroupTitle(title, re = /(入賞者|優勝者|ギャラリ[ーｰ]?[0-9]*)+$/) {
  const tidy = (title || '').replace(re, '').trim();
  return tidy.length >= 3 ? tidy : title;
}

/** 同じ種類の束ねを1つにする（「鳥取ガス杯」「第15回鳥取ガス杯ギャラリー」など） */
function mergeByKind(groups) {
  const byKind = new Map();
  const out = [];
  for (const g of groups) {
    const kinds = new Set(g.entries.map((e) => legacyKind(e.t)).filter(Boolean));
    const k = g.merged || kinds.size !== 1 ? null : [...kinds][0];
    const head = byKind.get(k);
    if (k && head) {
      head.entries.push(...g.entries);
    } else {
      if (k) byKind.set(k, g);
      out.push(g);
    }
  }
  for (const g of out) if (!g.merged && g.entries.length > 1) g.title = bestTitle(g.entries);
  return out;
}


/** 「男子8部Aゾーン」→ { name: '男子8部', gender: 0, no: 8, zone: 'Aゾーン' }。部の形でなければ null */
export function divisionOf(category) {
  const m = toAscii(category || '').replace(/\s+/g, '').match(/^(男子|女子)(\d+)部(.*)$/);
  if (!m) return null;
  return { name: `${m[1]}${m[2]}部`, gender: m[1] === '男子' ? 0 : 1, no: Number(m[2]), zone: m[3] };
}

/** クラブ対抗戦の部の並び順（クラブ対抗戦のページ・大会ページ共通）。
 *  男子1部→8部 → 男子予選会 → 女子1部→5部 → 女子予選会。部の形でないものは最後。
 *  「女子予選会 Bリーグ」「男子8部Aゾーン」のように後ろに何か付いていてもよい */
export const clubDivisionOrder = (name) => {
  const m = toAscii(name || '').replace(/\s+/g, '').match(/^(男子|女子)(\d+)?(部|予選会)/);
  if (!m) return 999;
  const base = m[1] === '男子' ? 0 : 100;
  return base + (m[3] === '予選会' ? 50 : Number(m[2]));
};
/** 部の並び順（上と同じ。旧名） */
export const divisionOrder = clubDivisionOrder;

/**
 * 画像を「結果表（1枚以上）→ 写真（0枚以上）」のひとまとまりに切る。
 * 写真のあとにまた結果表が来たら、次のまとまり。
 * 旧サイトの並びは「その部の結果表（リーグ表が何枚か）→ その部の優勝クラブの写真 → 次の部…」なので、
 * まとまりの数と部の数が合えば、n番目のまとまり＝n番目の部と分かる。
 */
export function imageRuns(photos) {
  const runs = [];
  for (const p of photos) {
    const last = runs[runs.length - 1];
    if (!last || (p.kind === 'sheet' && last.photos.length)) runs.push({ sheets: [], photos: [] });
    const run = runs[runs.length - 1];
    (p.kind === 'sheet' ? run.sheets : run.photos).push(p);
  }
  return runs;
}

/**
 * クラブ対抗戦の1年度分（束ねた group）を、部ごとにまとめ直す。
 * 旧サイトは「男子1部〜6部」「男子7部・8部」「女子1部・2部」「女子3〜5部」と別ページだったが、
 * 男子1部→…→8部、女子1部→…→5部の順に1ページで見せる。ゾーン分け（男子8部Aゾーン・Bゾーン）は同じ部にまとめる。
 *   divisions … [{ name, order, places: [{ award, name, note }], sheets: [], photos: [] }] 部の順
 *   loose     … 部に対応づけられなかった画像のまとまり（旧ページの題名つき。いまは無い）
 *   galleries … 写真だけのページ（ギャラリー）。別ページに出す
 */
export function clubDivisions(g) {
  const map = new Map();
  const loose = [];
  const division = (name) => {
    if (!map.has(name)) map.set(name, { name, order: divisionOrder(name), places: [], sheets: [], photos: [] });
    return map.get(name);
  };
  for (const e of g.entries) {
    const t = e.t;
    if (!t.categories.length) continue; // ギャラリーなど
    const cats = t.categories.map((c) => ({ c, d: divisionOf(c.category) }));
    const names = [...new Set(cats.map(({ c, d }) => (d ? d.name : c.category)))];
    for (const { c, d } of cats) {
      const target = division(d ? d.name : c.category);
      for (const p of c.places) target.places.push({ award: d?.zone ? `${d.zone} ${p.award}` : p.award, name: p.name, note: p.note });
    }
    const runs = imageRuns(t.photos);
    if (runs.length === names.length) {
      runs.forEach((r, i) => { const target = map.get(names[i]); target.sheets.push(...r.sheets); target.photos.push(...r.photos); });
    } else if (runs.length) {
      loose.push({ title: e.title, runs });
    }
  }
  const divisions = [...map.values()].sort((a, b) => a.order - b.order);
  return { divisions, loose };
}

/** 部ごとの優勝クラブ（複数ゾーンなら「お台場クラブ（Aゾーン）／達 磨（Bゾーン）」） */
export function divisionChampion(d) {
  const wins = d.places.filter((p) => p.name && /優勝|^1位$/.test(normalizeAward(p.award).replace(/^.ゾーン /, '')));
  if (!wins.length) return null;
  return wins.map((p) => {
    const zone = p.award.match(/^(.ゾーン) /)?.[1];
    return zone ? `${p.name}（${zone}）` : p.name;
  }).join('／');
}

/**
 * 画像を「結果画像 1枚 ＋ それに続く写真」のかたまりに切る。
 * 旧サイトの並び（種目の結果画像 → 優勝者の写真 → 次の種目…）をそのまま再現するため。
 * 先頭が写真から始まるときは sheet が null のかたまりになる。
 */
export function photoBlocks(t) {
  const blocks = [];
  for (const p of t.photos) {
    if (p.kind === 'sheet' || !blocks.length) blocks.push({ sheet: p.kind === 'sheet' ? p : null, photos: [] });
    if (p.kind !== 'sheet') blocks[blocks.length - 1].photos.push(p);
  }
  return blocks;
}

/* 旧サイトから引き継いだ束ね1件の、日付と種目（大会結果の一覧に出す）。分かる範囲で：
 *   date  … どれかのページに「平成26年4月13日」「令和５年５月７日」の形の日付があれば YYYY-MM-DD（無ければ null。ほとんどのページに無い）
 *   event … 種目名から組み立てる。クラブ対抗戦は「男子1部〜8部・女子1部〜5部」、ミックスは「ミックスダブルス」、
 *           それ以外は「男女シングルス・ダブルス」のように性別＋種目。「1位トーナメント」だけの団体戦は「団体戦」 */
export function legacyMeta(g) {
  let date = null;
  for (const e of g.entries) {
    const m = toAscii(e.t.date || '').replace(/\s+/g, '').match(/^(令和|平成)(\d+)年(\d+)月(\d+)日/);
    if (m) { const y = (m[1] === '令和' ? 2018 : 1988) + Number(m[2]); date = `${y}-${String(m[3]).padStart(2, '0')}-${String(m[4]).padStart(2, '0')}`; break; }
  }
  const cats = g.entries.flatMap((e) => e.t.categories.map((c) => toAscii(c.category)));
  const titles = g.entries.map((e) => e.t.title).join(' ');
  let event = null;
  if (g.merged) {
    const no = (gender) => Math.max(0, ...cats.map((c) => (c.match(new RegExp(`^${gender}(\\d+)部`)) || [])[1] || 0).map(Number));
    const parts = [];
    if (no('男子')) parts.push(`男子1部〜${no('男子')}部`);
    if (no('女子')) parts.push(`女子1部〜${no('女子')}部`);
    event = parts.join('・') || '団体戦';
  } else if (/ミックス/.test(cats.join(' ') + titles)) {
    event = 'ミックスダブルス';
  } else {
    const src = cats.join(' ') + ' ' + titles;
    const types = ['シングルス', 'ダブルス'].filter((t) => src.includes(t));
    const genders = ['男子', '女子'].filter((x) => cats.some((c) => c.startsWith(x)));
    if (types.length) event = (genders.length === 2 ? '男女' : genders[0] || '') + types.join('・');
    else if (/団体/.test(titles) || cats.some((c) => /^\d+位(・\d+位)?トーナメント$/.test(c))) event = '団体戦';
  }
  return { date, event };
}

/**
 * 年度の中を開催順に並べ替える。
 * 旧サイトは年度の中の並びがまちまちで（尾坂杯が先頭に来ている年度がある）、
 * 一覧は「開催順に並びます」と書いているので、分かっている日付で並べ直す。
 * 日付の分からない大会は、旧サイトでその直前にあった大会のすぐ後ろに残す
 * （先頭にあるものは、最初に日付の分かる大会に合わせる）。
 */
function sortByDate(groups) {
  const dates = groups.map((g) => legacyMeta(g).date);
  if (dates.every((d) => !d)) return groups;
  const keys = dates.slice();
  for (let i = 1; i < keys.length; i++) if (!keys[i]) keys[i] = keys[i - 1];
  const first = keys.find(Boolean);
  for (let i = 0; i < keys.length; i++) if (!keys[i]) keys[i] = first;
  return groups
    .map((g, i) => ({ g, i, d: keys[i] }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i))
    .map((x) => x.g);
}

/** 全年度の束ね（詳細ページの生成と、一覧の並びに使う）。新しい年度が先、年度の中は開催順。 */
export const GROUPS_BY_YEAR = RESULTS.map((y) => ({
  nendo: y.nendo,
  label: y.label,
  groups: sortByDate(
    groupYear(y).map((g) => ({ ...g, id: g.entries[0].t.id, nendo: y.nendo, yearLabel: y.label })),
  ),
}));

/** 旧サイトの1ページ（tournament.id）→ 束ねたページの id */
const GROUP_ID = new Map(
  GROUPS_BY_YEAR.flatMap((y) => y.groups.flatMap((g) => g.entries.map((e) => [e.t.id, g.id]))),
);

export const ALL_GROUPS = GROUPS_BY_YEAR.flatMap((y) => y.groups);

/** 束ねたページの id か、束ねる前の旧ページの id から、束ねた1件を引く（古いリンクでも同じページが出る） */
export const groupById = (id) => ALL_GROUPS.find((g) => g.id === id) ?? ALL_GROUPS.find((g) => GROUP_ID.get(id) === g.id) ?? null;

/** クラブ対抗戦の年度ごとの束ね（新しい年度が先）。club.html の「これまでの優勝クラブ」に使う */
export const CLUB_GROUPS = ALL_GROUPS.filter((g) => g.merged);
