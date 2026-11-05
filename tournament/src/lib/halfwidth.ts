// 全角の英数字・記号を半角にそろえる（所属・氏名・種目名など）。半角カナは全角カナにする。
//   例 "ＬＴＣ河原" → "LTC河原"、"ｄｏＭｅ" → "doMe"、"Ｌｏｖｅ\u3000ＡＬＬ" → "Love ALL"、"ﾃﾆｽｸﾗﾌﾞ" → "テニスクラブ"
// 日本語の書き方として全角のままにする記号（（）・～・、。・「」など）は変えない。
// worker/catalog.ts にも同じものがある（Worker は src を読まないため）。直すときは両方そろえる。
const FW = /[０-９Ａ-Ｚａ-ｚ＃＆＋，－．／：＠＿]/g;

export function toHalfwidth(s: string, opts: { space?: boolean } = {}): string {
  if (!s) return s ?? '';
  let out = s
    .replace(FW, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[｡-ﾟ]+/g, (m) => m.normalize('NFKC'))
    .replace(/[‐‑−ｰ](?=[A-Za-z0-9])|(?<=[A-Za-z0-9])[−]/g, '-');
  // 所属は全角の空白も半角に（氏名は姓と名の間の全角空白を残す）
  if (opts.space) out = out.replace(/\u3000/g, ' ').replace(/ {2,}/g, ' ').trim();
  return out;
}

/** 全角の英数字・記号（か半角カナ）を含むか */
export function hasFullwidth(s: string): boolean {
  return !!s && toHalfwidth(s, { space: true }) !== s.replace(/\u3000/g, ' ').replace(/ {2,}/g, ' ').trim();
}
