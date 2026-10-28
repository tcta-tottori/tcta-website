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
      <label>せい（ひらがな） <input type="text" name="family_kana" ${req} value="${v.family_kana ?? ''}" placeholder="やまだ"></label>
      <label>めい（ひらがな） <input type="text" name="given_kana" ${req} value="${v.given_kana ?? ''}" placeholder="たろう"></label>
    </div>`;
}

/** 氏名だけを手早く入れる 4 欄（ペアの仮登録・ショップ・クラブ代理登録用。name は prefix_family など） */
export function nameInputs(prefix: string) {
  return html`<input type="text" name="${prefix}_family" placeholder="姓"> <input type="text" name="${prefix}_given" placeholder="名"> <input type="text" name="${prefix}_family_kana" placeholder="せい"> <input type="text" name="${prefix}_given_kana" placeholder="めい">`;
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
    <label data-club-other-wrap>クラブ名 <input type="text" name="club_other" list="clubs-list" data-club-other value="${otherValue}" placeholder="登録の無いクラブ名を入力"></label>
    ${clubDatalist(clubs)}`;
}

/** クラブ名の手入力欄に添える候補（選択式でも手入力でも入れられる） */
export function clubDatalist(clubs: Club[]) {
  return html`<datalist id="clubs-list">${clubs.map((cl) => html`<option value="${cl.name}"></option>`)}</datalist>`;
}

export const clubLabel = (name: string | null | undefined) => name ?? 'フリー';
