// 大会ページ（EmDash の大会）の結果を、「種目 → 結果表 → 入賞者の写真 → 入賞者の名前」のまとまりにする。
// 旧サイトの結果ページと同じ構成（種目ごとに 結果表 → 写真 → 「優勝 ○○　準優勝 ○○」の1行）。
//
// 管理画面には「結果」の画像と「当日の写真」が別々に入っていて、どの写真がどの種目のものかは
// そのままでは分からない。種目への対応づけは次の順で決める。
//   1. 公式サイトの結果ページと画像を照合した対応（src/data/event-layout.json。tools/match_event_photos.py が作る）
//   2. 画像のラベル（管理画面で付けた「1位トーナメント」「1位トーナメント 優勝 ○○ペア」など）の先頭の種目名
//   3. どちらも無ければ、結果表を全部ひとまとめにし、写真も全部その下に（種目は分けない）
// 入賞者の名前は、管理画面の「成績」の行（e.winners）をその種目のぶんだけ使う。
// 「成績」が無い大会は、1 の対応に入っている文言（優勝 ○○）を使う。
//
//   blocks     … [{ label, sheets: [img], photos: [img], places: [{ award, name }], captions: ['優勝 ○○', ...] }] 種目の順（category-order.js）
//                 photos の各要素には caption（その写真の「優勝 ○○ペア」。分からなければ null）を足してある
//   restSheets … どの種目にも付かなかった結果表
//   restPhotos … どの種目にも付かなかった当日の写真（別の升目に出す）
// 結果も成績も無い大会は null。
import LAYOUT from './event-layout.json';
import { sortByCategory } from './category-order.js';

const baseName = (src) => String(src).replace(/^.*\//, '').replace(/\.\w+$/, '');

/** 「第３位」「ベスト４」など全角数字をそろえ、空白を詰める */
const norm = (s) => String(s ?? '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/\s+/g, ' ').trim();

/** 写真のラベルに入っている「優勝 ○○ペア」の部分（順位の言葉から後ろ）。無ければ null */
const AWARD_RE = /(総合優勝|優勝|準優勝|第\s*3\s*位|3位|ベスト\s*[48]|1位|2位)(?!トーナメント|・)/;
export function photoCaption(label, category) {
  let s = norm(label);
  if (!s) return null;
  if (category && s.startsWith(norm(category))) s = s.slice(norm(category).length).trim();
  const m = s.match(AWARD_RE);
  if (!m) return null;
  const rest = s.slice(m.index).replace(/\s+/g, ' ').trim();
  // 「優勝ペアの写真」のように名前が無いものは、順位だけ
  return rest.replace(/(ペア)?の写真$/, '').trim() || null;
}

/** 種目の成績（places）→ 写真の下の1行（「優勝 ○○　準優勝 ○○」の各要素） */
const captionsOf = (places) => places.filter((p) => p.name).map((p) => `${p.award} ${p.name}`);

/** ラベルの先頭が種目名か（「1位トーナメント 優勝 ○○」→ 1位トーナメント） */
const startsWithCategory = (label, category) => {
  const l = norm(label);
  const c = norm(category);
  return !!c && l.startsWith(c) && (l.length === c.length || /[\s　・/／(（]/.test(l[c.length]));
};

export function eventResultLayout(e) {
  const result = e.sections.find((s) => s.key === 'result');
  const photo = e.sections.find((s) => s.key === 'photo');
  const sheetImgs = result?.images ?? [];
  const photoImgs = photo?.images ?? [];
  const winners = sortByCategory(e.winners ?? [], (c) => c.category);
  if (!sheetImgs.length && !photoImgs.length && !winners.length) return null;
  if (!sheetImgs.length && !winners.length) return null; // 写真だけなら「当日の写真」の節に任せる

  const placesOf = (label) => winners.find((c) => norm(c.category) === norm(label))?.places ?? [];
  const used = new Set();
  let blocks;

  const spec = LAYOUT[e.slug];
  if (spec && spec.length) {
    // 1. 公式サイトとの照合による対応
    const sheets = new Map(sheetImgs.map((img) => [baseName(img.src), img]));
    const photos = new Map(photoImgs.map((img) => [baseName(img.src), img]));
    const pick = (map, names) => names.map((n) => { const img = map.get(n); if (img) used.add(n); return img; }).filter(Boolean);
    blocks = spec.map((b) => {
      const places = placesOf(b.label);
      return { label: b.label, sheets: pick(sheets, b.sheets), photos: pick(photos, b.photos), places, captions: places.length ? captionsOf(places) : b.captions };
    });
    // 成績にあって対応に無い種目（写真も結果表も無い）は名前だけ出す
    for (const c of winners) {
      if (!blocks.some((b) => norm(b.label) === norm(c.category))) blocks.push({ label: c.category, sheets: [], photos: [], places: c.places, captions: captionsOf(c.places) });
    }
  } else if (winners.length) {
    // 2. 画像のラベルの先頭の種目名で対応づける
    blocks = winners.map((c) => {
      const sheets = sheetImgs.filter((img) => startsWithCategory(img.label, c.category));
      const photos = photoImgs.filter((img) => startsWithCategory(img.label, c.category));
      for (const img of [...sheets, ...photos]) used.add(baseName(img.src));
      return { label: c.category, sheets, photos, places: c.places, captions: captionsOf(c.places) };
    });
    // 種目が1つだけで画像にラベルが無いときは、結果表と写真をその種目に付ける
    if (winners.length === 1 && used.size === 0) {
      blocks[0].sheets = [...sheetImgs];
      blocks[0].photos = [...photoImgs];
      for (const img of [...sheetImgs, ...photoImgs]) used.add(baseName(img.src));
    }
  } else {
    // 3. 種目が分からない。結果表を全部 → その下に写真を全部
    blocks = [{ label: '', sheets: [...sheetImgs], photos: [...photoImgs], places: [], captions: [] }];
    for (const img of [...sheetImgs, ...photoImgs]) used.add(baseName(img.src));
  }

  blocks = blocks.filter((b) => b.sheets.length || b.photos.length || b.captions.length);
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
  blocks = blocks.filter((b) => b.sheets.length || b.photos.length || b.captions.length);
  if (prelim.length) blocks.unshift({ label: '予選リーグ', sheets: prelim, photos: [], places: [], captions: [] });
  blocks = sortByCategory(blocks, (b) => b.label);

  // 写真1枚ごとの名前（ラベルの「優勝 ○○ペア」）
  for (const b of blocks) b.photos = b.photos.map((img) => ({ ...img, caption: photoCaption(img.label, b.label) }));

  // 種目が1つだけなら、どこにも付かなかった結果表もその種目のもの
  const main = blocks.filter((b) => b.label !== '予選リーグ');
  if (main.length === 1) {
    for (const img of sheetImgs) if (!used.has(baseName(img.src))) { main[0].sheets.push(img); used.add(baseName(img.src)); }
  }
  const restSheets = sheetImgs.filter((img) => !used.has(baseName(img.src)));
  const restPhotos = photoImgs.filter((img) => !used.has(baseName(img.src)));
  return { blocks, restSheets, restPhotos };
}
