// 大会ページ（EmDash の大会）の結果を、「種目 → 結果表 → 入賞者の写真 → 順位」のまとまりにする。
//
// 管理画面には「結果」の画像と「当日の写真」が別々に入っていて、どの写真がどの種目のものかは分からない。
// 公式サイトの結果ページ（種目ごとに 結果表 → 写真 → 順位の1行 の順）と画像を照合した対応が
// src/data/event-layout.json にあり（tools/match_event_photos.py が作る）、それを使ってまとめる。
// 対応の無い大会は、結果表の一覧と成績の表、当日の写真の升目をそのまま出す（layout は null）。
//
//   blocks     … [{ label, sheets: [img], photos: [img], captions: ['優勝 ○○', ...] }] 種目の順（category-order.js）
//   restSheets … どの種目にも付かなかった結果表
//   restPhotos … どの種目にも付かなかった当日の写真（別の升目に出す）
import LAYOUT from './event-layout.json';
import { sortByCategory } from './category-order.js';

const baseName = (src) => String(src).replace(/^.*\//, '').replace(/\.\w+$/, '');

export function eventResultLayout(e) {
  const spec = LAYOUT[e.slug];
  if (!spec || !spec.length) return null;
  const sheets = new Map((e.sections.find((s) => s.key === 'result')?.images ?? []).map((img) => [baseName(img.src), img]));
  const photos = new Map((e.sections.find((s) => s.key === 'photo')?.images ?? []).map((img) => [baseName(img.src), img]));
  const used = new Set();
  const pick = (map, names) => names.map((n) => { const img = map.get(n); if (img) used.add(n); return img; }).filter(Boolean);
  let blocks = spec.map((b) => ({ label: b.label, sheets: pick(sheets, b.sheets), photos: pick(photos, b.photos), captions: b.captions }))
    .filter((b) => b.sheets.length || b.photos.length);
  if (!blocks.length) return null;
  // 予選リーグの表（「予選 Aリーグ」「Aリーグ結果」「Aリーグ 成績表」）は、公式サイトでは最初の種目の前に
  // まとめて置かれている。「予選リーグ」として切り出し、決勝トーナメントより前に出す
  const isPrelim = (img) => /予選|リーグ/.test(img.label ?? '') && !/決勝|トーナメント/.test(img.label ?? '');
  const prelim = [];
  for (const b of blocks) {
    if (/予選|リーグ/.test(b.label)) continue; // 種目そのものが予選のときは触らない
    const keep = [];
    for (const img of b.sheets) (isPrelim(img) ? prelim : keep).push(img);
    b.sheets = keep;
  }
  blocks = blocks.filter((b) => b.sheets.length || b.photos.length);
  if (prelim.length) blocks.unshift({ label: '予選リーグ', sheets: prelim, photos: [], captions: [] });
  blocks = sortByCategory(blocks, (b) => b.label);
  const restSheets = [...sheets.entries()].filter(([n]) => !used.has(n)).map(([, img]) => img);
  const restPhotos = [...photos.entries()].filter(([n]) => !used.has(n)).map(([, img]) => img);
  return { blocks, restSheets, restPhotos };
}
