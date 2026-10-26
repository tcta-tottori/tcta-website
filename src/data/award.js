// 入賞者の表記（「優勝 米本 叶芽 選手」「準優勝 ○○・○○ペア」「第3位 ○○」）を、順位のバッジ＋名前に分ける。
// 表示は src/components/AwardLine.astro（順位は画像のバッジ、名前は太字、「選手」「ペア」は普通の太さ）。
//
//   parseAward('優勝 米本 叶芽 選手') → { prefix: '', award: '優勝', name: '米本 叶芽', suffix: '選手', note: '' }
//   awardBadge('優勝')               → { rank: 1, label: '優勝' }（順位ごとの色の文字バッジ。1 金・2 銀・3 銅・4 緑、それ以外は rank 0 で灰色）
//
// 名前の表記はここでそろえる：
//   シングルス … 記録どおりのフルネーム（「米本 叶芽」。旧サイトから引き継いだ記録で苗字しか無いものはそのまま）
//   ダブルス   … 苗字だけを「・」でつなぐ（「安田 彰汰（遊ポート）・檜垣 直斗（フリー）ペア」→「安田・檜垣 ペア」）。
//                ペアと分かるもの（後ろに「ペア」、または種目がダブルス／ミックス）だけ。
//                クラブ対抗戦のチーム名（「微分・積分・いい気分」など）は触らない

/** 全角の数字・英字を半角に、空白をそろえる */
const norm = (s) => String(s ?? '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/\s+/g, ' ').trim();

/** 順位の言葉（先頭に「Aブロック」などが付いていてもよい） */
const AWARD_RE = /^(.*?)(総合優勝|優勝|準優勝|第\s*3\s*位|3位|4位|ベスト\s*[48]|1位|2位)\s*(.*)$/;
/** 名前の後ろの「選手」「ペア」「チーム」「組」と、そのあとの注記（棄権 など） */
const SUFFIX_RE = /^(.*?)\s*(選手|ペア|ぺあ|チーム|組)?\s*([（(][^（）()]*[）)])?$/;   // 注記はいちばん後ろの（ ）だけ（名前の中の（所属）は名前の一部）
/** 種目名からダブルスかどうか */
export const isPairCategory = (category) => /ダブルス|ミックス|ペア/.test(String(category ?? ''));
/** 「安田 彰汰（遊ポート）」→「安田」。空白が無ければ（苗字だけ・区切りの無いフルネーム）そのまま */
const surname = (s) => s.replace(/[（(][^）)]*[）)]/g, '').trim().split(/[ 　]/)[0];
/** ペアの名前を苗字だけに。「・」で区切られたそれぞれの人を苗字に */
const pairSurnames = (name) => name.split(/\s*・\s*/).map(surname).filter(Boolean).join('・');

/** 順位の表記ゆれをそろえる（第３位 → 3位、ベスト ４ → ベスト4） */
const awardKey = (award) => norm(award).replace(/^第\s*(\d)\s*位$/, '$1位').replace(/\s+/g, '');

/** 順位のバッジ。種目の枠（.rblock__cat）と同じ形で、順位ごとの色（style.css の .award__badge--1〜4）。
 *  1 … 優勝・総合優勝・1位（金）、2 … 準優勝・2位（銀）、3 … 3位（銅）、4 … 4位（緑）、0 … それ以外（ベスト4 など。灰色） */
const RANKS = {
  '優勝': 1, '総合優勝': 1, '1位': 1,
  '準優勝': 2, '2位': 2,
  '3位': 3,
  '4位': 4,
};
export function awardBadge(award) {
  const label = norm(award);
  return { rank: RANKS[awardKey(award)] ?? 0, label };
}

/** 「優勝 米本 叶芽 選手」→ 順位・名前・「選手」などに分ける。順位の言葉が無ければ award は '' で全体を name に。
 *  pair … ダブルスの種目か（苗字だけにする判断に使う。後ろに「ペア」が付いていれば種目に関わらずペア） */
export function parseAward(text, note = '', pair = false) {
  const s = norm(text);
  const m = s.match(AWARD_RE);
  const prefix = m ? m[1].trim() : '';
  const award = m ? m[2].replace(/\s+/g, '') : '';
  const rest = m ? m[3] : s;
  const sm = rest.match(SUFFIX_RE);
  let name = sm ? sm[1].trim() : rest;
  let suffix = sm?.[2] ?? '';
  if (suffix === 'ぺあ') suffix = 'ペア';
  let n = (sm?.[3] ?? '').trim();
  // ダブルスは苗字だけ（「・」でつないだ名前で、ペアと分かるもの）
  if (name.includes('・') && (suffix === 'ペア' || (pair && suffix !== 'チーム' && suffix !== '組'))) {
    name = pairSurnames(name);
    if (!suffix) suffix = 'ペア';
  }
  if (note) n = [n, /^[（(]/.test(note) ? note : `（${note}）`].filter(Boolean).join(' ');
  return { prefix, award, name, suffix, note: n };
}

/** 成績の1件 { award, name, note } → parseAward と同じ形 */
export const placeToAward = (p, pair = false) => parseAward(`${p.award ?? ''} ${p.name ?? ''}`, p.note ?? '', pair);
