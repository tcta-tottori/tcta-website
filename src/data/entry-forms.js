// 要項と申込用紙の分け直し（移行前に置いた素材＝legacy_materials のぶんだけ）。
//
// 要項のページには要項だけを出し、領収証のついた紙（＝申込用紙）は「〇〇 申込用紙」のボタンにまとめる
// （ボタンを押すとページの中で全画面に開き、ダウンロード・印刷ができる。EntryForms.astro・main.js の initPdfViewer）。
// 移行前の素材には、要項の紙面やPDFに領収証つきの申込用紙が混ざっている大会があるので、ここで大会ごとに分け直す。
// 管理画面であとから足した素材は、種類（要項／申込用紙）のとおりに出す（ここでは触らない）。
//
//   hide    … 要項の紙面（画像）から外すもの。ファイル名（拡張子なし）。領収証つきの申込用紙のページ
//   images  … 要項の紙面に足すもの（要項だけのページを申込用紙つきのPDFから書き出したもの）。先頭に置く
//   outline … 要項のPDF。書いたものに差し替える（領収証のページを抜いた「要項のみ」のPDF）
//   forms   … 申込用紙のPDF（ボタン）。書いたものに差し替える
//
// 「要項のみ」「申込用紙」のPDFは、もとのPDF・紙面からページを抜き出して作ったもの（public/assets/pdf/events/<slug>/）。

const pdf = (slug, file, label, kb) => ({ src: `assets/pdf/events/${slug}/${file}`, label, kb });

const FIX = {
  'r8-club-taiko-1': {
    hide: ['outline-04', 'outline-05', 'outline-06', 'outline-07', 'outline-08', 'outline-09'],
    outline: [
      pdf('r8-club-taiko-1', '令和８年クラブ対抗要項.pdf', '令和8年 クラブ対抗戦 要項・編成表', 631),
      pdf('r8-club-taiko-1', 'クラブ対抗編成表変更のお知らせ.pdf', 'クラブ対抗編成表変更のお知らせ', 96),
    ],
    forms: [
      pdf('r8-club-taiko-1', '令和８年クラブ対抗申込用紙_前期日程（男子1〜8部）.pdf', '申込用紙（前期日程・男子1〜8部）', 65),
      pdf('r8-club-taiko-1', '令和８年クラブ対抗_選手名簿（8名）.pdf', '選手名簿（8名）', 102),
      pdf('r8-club-taiko-1', '令和８年クラブ対抗_選手名簿（12名）..pdf', '選手名簿（12名）', 104),
    ],
  },
  'r8-club-taiko-2': {
    forms: [
      pdf('r8-club-taiko-2', '令和８年クラブ対抗申込用紙_後期日程.pdf', '申込用紙（男子予選会・女子1〜4部・女子予選会）', 207),
      pdf('r8-club-taiko-1', '令和８年クラブ対抗_選手名簿（8名）.pdf', '選手名簿（8名）', 102),
      pdf('r8-club-taiko-1', '令和８年クラブ対抗_選手名簿（12名）..pdf', '選手名簿（12名）', 104),
    ],
  },
  'r8-enetopia': {
    hide: ['outline-02'],
    outline: [pdf('r8-enetopia', 'R8エネトピア杯要項（要項のみ）.pdf', 'R8エネトピア杯 要項', 185)],
    forms: [pdf('r8-enetopia', 'R8エネトピア杯要項.pdf', '申込用紙（領収証つき）', 71)],
  },
  'r8-kaicho-autumn': {
    hide: ['outline-01'],
    images: [{ src: 'assets/img/events/r8-kaicho-autumn/outline-only-01.webp', label: '要項', w: 1241, h: 1754 }],
    outline: [pdf('r8-kaicho-autumn', '2026会長杯（ダブルス）要項（要項のみ）.pdf', '2026会長杯（ダブルス）要項', 57)],
  },
  'r8-kaicho-spring': {
    outline: [pdf('r8-kaicho-spring', '令和8年度会長杯団体戦要項（要項のみ）.pdf', '令和8年度 会長杯団体戦 要項', 84)],
  },
  'r8-kensen-singles': {
    hide: ['outline-02'],
    outline: [pdf('r8-kensen-singles', '2026県選シングルス要項（要項のみ）.pdf', '2026県選シングルス 要項', 214)],
    forms: [pdf('r8-kensen-singles', '2026県選シングルス要項.pdf', '申込用紙（領収証つき）', 49)],
  },
  'r8-ketaka': {
    outline: [pdf('r8-ketaka', 'R8気高カップ要項（要項のみ）.pdf', 'R8気高カップ 要項', 190)],
    forms: [pdf('r8-ketaka', 'R8気高カップ要項.pdf', '要項・申込用紙（領収証つき）', 65)],
  },
  'r8-sasaki': {
    hide: ['outline-02', 'outline-03'],
    outline: [pdf('r8-sasaki', 'R8佐々木杯要項（要項のみ）.pdf', 'R8佐々木杯 要項', 87)],
    forms: [
      pdf('r8-sasaki', 'R8佐々木杯申込用紙.pdf', '申込用紙（領収証つき）', 151),
      pdf('r8-sasaki', '個人登録者へのお願い・登録者カード.pdf', '個人登録者へのお願い・登録者カード', 59),
    ],
  },
  'r8-summer-mix': {
    hide: ['outline-02'],
    outline: [pdf('r8-summer-mix', 'R8サマーミックス要項（要項のみ）.pdf', 'R8サマーミックス 要項', 48)],
    forms: [pdf('r8-summer-mix', 'R8サマーミックス申込用紙.pdf', '申込用紙（領収証つき）', 62)],
  },
  'r8-tobu-doubles': {
    hide: ['outline-02'],
    outline: [pdf('r8-tobu-doubles', 'R8東部選手権ダブルス要項（要項のみ）.pdf', 'R8東部選手権ダブルス 要項', 203)],
    forms: [pdf('r8-tobu-doubles', 'R8東部選手権要綱_page-0004.pdf', '申込用紙（領収証つき）', 176)],
  },
  'r8-tobu-singles': {
    hide: ['outline-02'],
    outline: [pdf('r8-tobu-singles', 'R8東部選手権シングルス要項（要項のみ）.pdf', 'R8東部選手権シングルス 要項', 202)],
    forms: [pdf('r8-tobu-singles', 'R8東部選手権シングルス要項.pdf', '申込用紙（領収証つき）', 169)],
  },
};

const baseName = (src) => String(src).split('/').pop().replace(/\.[^.]+$/, '');

/**
 * 移行前の素材（種類ごとの { images, pdfs }）を、要項と申込用紙に分け直す（out を書き換える）。
 * collectMaterials（events.js）が、管理画面の素材を足す前に呼ぶ。
 */
export function splitEntryForms(slug, out) {
  const fix = FIX[slug];
  if (!fix) return out;
  const sec = (key) => (out[key] ??= { images: [], pdfs: [] });
  if (fix.hide || fix.images) {
    const kept = sec('outline').images.filter((img) => !(fix.hide ?? []).includes(baseName(img.src)));
    sec('outline').images = [...(fix.images ?? []), ...kept];
  }
  if (fix.outline) sec('outline').pdfs = fix.outline.map((p) => ({ ...p }));
  if (fix.forms) sec('entry').pdfs = fix.forms.map((p) => ({ ...p }));
  return out;
}
