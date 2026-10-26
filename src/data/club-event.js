// クラブ対抗戦の大会ページ（event-r8-club-taiko-1.html など）を、部ごとの「リーグ表 → その下に優勝クラブの写真」に組み直す。
// 旧サイトから引き継いだ結果ページ（results.js の clubDivisions）と同じ見せ方にするため。
//
// 材料は EmDash の大会1件（events.js の buildEvents が組んだ e）と、club-league.js の年度データ（term）。
//   結果の画像   … ラベル（「女子予選会 Bリーグ」など）の先頭の「男子1部」「女子予選会」で部にまとめる
//   当日の写真   … term.photoMap（部の名前 → 写真のファイル名）で部に付ける。管理画面に無い写真は term.extraPhotos から
//   優勝クラブ   … 管理画面の「成績」があればそれ、無ければ term.divisions
// 該当しない大会（クラブ対抗戦でない、結果が無い）は null を返し、ページは従来の節の並びで描く。

import { CLUB_SEASONS } from './club-league.js';
import { clubDivisionOrder } from './results.js';

/** 「女子予選会 Bリーグ」「男子予選会 Aブロック」「男子8部」→ 部の名前（男子8部／女子予選会）。部でなければ null */
export const divisionKey = (label) => (String(label || '').match(/^(男子|女子)(\d+部|予選会)/) || [])[0] || null;

/** 部の並び：男子1部→8部 → 男子予選会 → 女子1部→5部 → 女子予選会（results.js の clubDivisionOrder。クラブ対抗戦のページと同じ） */
const order = clubDivisionOrder;

/** slug から年度データの日程（前期・後期）を引く */
export const clubTermBySlug = (slug) => {
  for (const season of CLUB_SEASONS) for (const term of season.terms) if (term.slug === slug) return term;
  return null;
};

/**
 * 大会ページ用の部ごとのまとまり。
 *   { divisions: [{ key, sheets: [img], photos: [img], places: [{ award, name }] }], loose: [img], photosUsed: boolean }
 * loose は部に対応づけられなかった結果の画像（いまは無い）。photosUsed が true なら「当日の写真」の節は出さない。
 */
export function clubEventLayout(e) {
  if (!e || !/クラブ対抗戦/.test(e.name)) return null;
  const result = e.sections.find((s) => s.key === 'result');
  if (!result || !result.images.length) return null;
  const term = clubTermBySlug(e.slug);

  const map = new Map();
  const loose = [];
  const division = (key) => {
    if (!map.has(key)) map.set(key, { key, order: order(key), sheets: [], photos: [], places: [] });
    return map.get(key);
  };
  for (const img of result.images) {
    const key = divisionKey(img.label);
    if (key) division(key).sheets.push(img);
    else loose.push(img);
  }

  // 優勝クラブ：管理画面の成績があればそれ、無ければ年度データ
  if (e.winners.length) {
    for (const c of e.winners) {
      const key = divisionKey(c.category);
      if (!key) continue;
      const sub = String(c.category).slice(key.length).trim();
      for (const p of c.places) division(key).places.push({ award: [sub, p.award].filter(Boolean).join(' '), name: p.name });
    }
  } else if (term) {
    for (const d of term.divisions) {
      const key = divisionKey(d.div);
      if (!key) continue;
      const sub = d.div.slice(key.length).trim();
      division(key).places.push({ award: [sub, d.award || '優勝'].filter(Boolean).join(' '), name: d.club });
    }
  }

  // 当日の写真 → 部に付ける（年度データの photoMap。ファイル名で引く）
  const photo = e.sections.find((s) => s.key === 'photo');
  const baseName = (src) => String(src).replace(/^.*\//, '').replace(/\.\w+$/, '');
  const cmsPhotos = new Map((photo?.images ?? []).map((img) => [baseName(img.src), img]));
  const used = new Set();
  if (term?.photoMap) {
    for (const [key, names] of Object.entries(term.photoMap)) {
      for (const name of names) {
        const img = cmsPhotos.get(name);
        const extra = term.extraPhotos?.[name];
        if (img) { division(key).photos.push(img); used.add(name); }
        else if (extra) division(key).photos.push({ src: `assets/img/events/${e.slug}/${name}.webp`, label: null, w: extra[0], h: extra[1] });
      }
    }
  }
  // 管理画面の写真が全部どこかの部に付いたら、「当日の写真」の節は出さない
  const photosUsed = cmsPhotos.size > 0 && [...cmsPhotos.keys()].every((n) => used.has(n));

  const divisions = [...map.values()].sort((a, b) => a.order - b.order);
  return { divisions, loose, photosUsed, photoCount: photo?.images.length ?? 0 };
}
