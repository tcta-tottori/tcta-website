// 会員の入力部品。氏名（姓・名／せい・めい）と所属（フリー／登録済みクラブ／その他を手入力）を各画面で共通に使う。
import { html } from 'hono/html';
import type { Club } from '../types';

export interface NameValues { family_name?: string | null; given_name?: string | null; family_kana?: string | null; given_kana?: string | null }

/** 姓・名・せい・めい の 4 欄（プロフィール用。ラベル付き） */
export function nameFields(v: NameValues, required = true) {
  const req = required ? 'required' : '';
  return html`
    <div class="name-row">
      <label>姓 <input type="text" name="family_name" ${req} value="${v.family_name ?? ''}" placeholder="山田" autocomplete="family-name"></label>
      <label>名 <input type="text" name="given_name" ${req} value="${v.given_name ?? ''}" placeholder="太郎" autocomplete="given-name"></label>
    </div>
    <div class="name-row">
      <label>せい（ひらがな） <input type="text" name="family_kana" ${req} value="${v.family_kana ?? ''}" placeholder="やまだ" pattern="[ぁ-ゖァ-ヶー 　]+" title="ひらがなで入力してください" data-kana autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <label>めい（ひらがな） <input type="text" name="given_kana" ${req} value="${v.given_kana ?? ''}" placeholder="たろう" pattern="[ぁ-ゖァ-ヶー 　]+" title="ひらがなで入力してください" data-kana autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    </div>`;
}

/** 氏名だけを手早く入れる 4 欄（ペアの仮登録・ショップ・クラブ代理登録用。name は prefix_family など） */
export function nameInputs(prefix: string) {
  return html`<input type="text" name="${prefix}_family" placeholder="姓"> <input type="text" name="${prefix}_given" placeholder="名"> <input type="text" name="${prefix}_family_kana" placeholder="せい（ひらがな）" pattern="[ぁ-ゖァ-ヶー 　]+" title="ひらがなで入力してください" data-kana autocapitalize="off" autocorrect="off" spellcheck="false"> <input type="text" name="${prefix}_given_kana" placeholder="めい（ひらがな）" pattern="[ぁ-ゖァ-ヶー 　]+" title="ひらがなで入力してください" data-kana autocapitalize="off" autocorrect="off" spellcheck="false">`;
}

/** 所属の選択。フリー（無所属）／登録済みクラブ／その他（手入力）。JS が「その他」のときだけ手入力欄を出す */
export function clubSelect(clubs: Club[], selectedId: string | null | undefined, otherValue = '') {
  const sel = selectedId && clubs.some((cl) => cl.id === selectedId) ? selectedId : selectedId ? '__other__' : '__free__';
  return html`
    <label>所属 <select name="club_sel" data-club-select>
      <option value="__free__" ${sel === '__free__' ? 'selected' : ''}>フリー（無所属）</option>
      ${clubs.map((cl) => html`<option value="${cl.id}" ${sel === cl.id ? 'selected' : ''}>${cl.name}</option>`)}
      <option value="__other__" ${sel === '__other__' ? 'selected' : ''}>その他（クラブ名を入力）</option>
    </select></label>
    <label data-club-other-wrap>クラブ名 <input type="text" name="club_other" data-club-other value="${otherValue}" placeholder="一覧に無いクラブ名を入力"></label>`;
}

/** クラブ名の手入力欄に添える候補（選択式でも手入力でも入れられる） */
export function clubDatalist(clubs: Club[]) {
  return html`<datalist id="clubs-list">${clubs.map((cl) => html`<option value="${cl.name}"></option>`)}</datalist>`;
}

export const clubLabel = (name: string | null | undefined) => name ?? 'フリー';

/* ---- 生年月（日は持たない）----
   保存するのは西暦の年と月だけ。選べる年は「現実的な年齢」の範囲（MIN_AGE〜MAX_AGE 歳）。
   JS が動くときは public/members.js が見やすいピッカー（元号の切り替え・年の一覧・月のマス目）に置き換え、
   値が空なら 30 歳前後の年を一覧の真ん中に出す（値は勝手に入れない）。JS が無ければ下のプルダウンのまま使える。 */
export const MIN_AGE = 5;
export const MAX_AGE = 100;
export const DEFAULT_AGE = 30;

export const ERAS: { key: string; label: string; base: number; from: number; to: number }[] = [
  { key: 'reiwa', label: '令和', base: 2018, from: 2019, to: 9999 },
  { key: 'heisei', label: '平成', base: 1988, from: 1989, to: 2019 },
  { key: 'showa', label: '昭和', base: 1925, from: 1926, to: 1989 },
  { key: 'taisho', label: '大正', base: 1911, from: 1912, to: 1926 },
];
/** 西暦の年を和暦の表記に（改元の年は新しい元号で。例 2019 → 令和元年） */
export function warekiOf(y: number): string {
  const e = ERAS.find((x) => y >= x.from && y <= x.to) ?? ERAS[ERAS.length - 1];
  const n = y - e.base;
  return `${e.label}${n === 1 ? '元' : n}年`;
}

export function birthFields(year: number | null | undefined, month: number | null | undefined, required = true, now = new Date()) {
  const thisYear = now.getFullYear();
  const maxY = thisYear - MIN_AGE;
  const minY = thisYear - MAX_AGE;
  const years: number[] = [];
  for (let y = maxY; y >= minY; y--) years.push(y);
  const req = required ? 'required' : '';
  return html`
    <div class="birth" data-birth data-this-year="${thisYear}" data-default-year="${thisYear - DEFAULT_AGE}">
      <span class="birth__label">生年月${required ? '' : '（任意）'}</span>
      <div class="name-row birth__native">
        <label>年 <select name="birth_y" ${req} data-birth-year><option value="">年を選ぶ</option>${years.map((y) => html`<option value="${y}" ${y === year ? 'selected' : ''}>${y}年（${warekiOf(y)}）</option>`)}</select></label>
        <label>月 <select name="birth_m" ${req} data-birth-month><option value="">月を選ぶ</option>${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>${m}月</option>`)}</select></label>
      </div>
      <p class="mute">年齢区分の判定にだけ使います。日は預かりません。${MIN_AGE}〜${MAX_AGE} 歳の方が登録できます。</p>
    </div>`;
}

/** フォームの生年月を検査して { year, month } に。空なら null、範囲外ならエラー文 */
export function birthFromForm(f: Record<string, string>, required = true, now = new Date()): { year: number; month: number } | null | string {
  let y = Number(f.birth_y);
  // 以前の形（元号＋元号内の年）でも受け付ける
  if (f.birth_era && f.birth_era !== 'seireki') {
    const e = ERAS.find((x) => x.key === f.birth_era);
    if (e) y = e.base + y;
  }
  const m = Number(f.birth_m);
  if (!f.birth_y && !f.birth_m) return required ? '生年月を選んでください' : null;
  if (!f.birth_y || !f.birth_m || !Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return '生年月は年と月の両方を選んでください';
  const thisYear = now.getFullYear();
  if (y > thisYear - MIN_AGE || y < thisYear - MAX_AGE) return `生年は ${thisYear - MAX_AGE}〜${thisYear - MIN_AGE} 年の範囲で選んでください（${MIN_AGE}〜${MAX_AGE} 歳）`;
  return { year: y, month: m };
}
