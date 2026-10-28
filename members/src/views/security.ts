// 画面に添えるセキュリティの要点（会員登録・ログイン・マイページ・エントリー・事務局）。
// 詳しい説明は /security（専用ページ）にまとめ、ここでは場面に関係することだけを 3〜4 行で出す。
import { html } from 'hono/html';

export type NoteKind = 'login' | 'signup' | 'me' | 'entry' | 'admin' | 'shop';

const NOTES: Record<NoteKind, { title: string; items: string[]; anchor: string }> = {
  login: {
    title: 'ログインの安全について',
    anchor: 'login',
    items: [
      'パスワードは使いません。メールに届くリンクは 15 分だけ有効で、1 回使うと無効になります。',
      '心当たりのないリンクが届いたときは開かずに捨ててください。リンクを開かない限り何も起きません。',
      '同じ場所からの送信は 15 分に 3 回までに制限しています。',
    ],
  },
  signup: {
    title: 'お預かりする情報と守り方',
    anchor: 'data',
    items: [
      'お預かりするのは氏名・ふりがな・性別・生年・所属・連絡先（メール・電話・住所）だけです。生年月日ではなく生年のみです。',
      'メール・電話・住所は暗号化して保存し、見られるのは登録先の協会の事務局（協会管理）だけです。大会運営・ショップ・ペアには表示されません。',
      '住所・電話が開かれるたびに「誰が・いつ」を記録に残します。退会後 2 年で連絡先は削除します。',
    ],
  },
  me: {
    title: 'あなたの情報の取扱い',
    anchor: 'roles',
    items: [
      '連絡先を見られるのは、あなたが登録している協会の事務局だけです。閲覧は記録され、本人も記録の開示を求められます。',
      '大会運営アプリに渡るのは氏名・所属・クラスだけです。',
      '情報の訂正はこの画面から、削除の依頼は協会の個人情報管理責任者へ。30 日以内に対応します。',
    ],
  },
  entry: {
    title: 'ペアと大会運営に渡る情報',
    anchor: 'api',
    items: [
      'ペア検索で見えるのは氏名・ふりがな・会員番号・所属だけです。住所や電話は出ません。',
      'ペアに指定された方には通知が届きます。身に覚えのない指定は事務局に申し出れば取り消せます。',
      'ドロー・運営アプリに渡るのは氏名・所属・クラスだけで、大会ごとの期限付きの鍵で取得します。',
    ],
  },
  admin: {
    title: '管理者の責務',
    anchor: 'admin',
    items: [
      '住所・電話・メールは業務に必要なときだけ開いてください。閲覧・出力・更新はすべて監査ログに残り、管理者本人も消せません。',
      '名簿は Excel・USB・メール添付で授受せず、この画面の閲覧権限で共有します。CSV を出すときは目的を記録します。',
      '本番では Cloudflare Access と 2 段階認証が必須です。権限は年 1 回棚卸しし、退任時は即日削除します。',
    ],
  },
  shop: {
    title: 'ショップ端末での取扱い',
    anchor: 'roles',
    items: [
      'この画面では氏名・所属・会員番号だけを扱います。住所や電話は表示も出力もできません。',
      '入力した本人分だけ当日中は取り消せます。翌日以降の訂正は事務局へ。',
      '共用の端末では、作業が終わったら必ずログアウトしてください。',
    ],
  },
};

export function securityNote(kind: NoteKind) {
  const n = NOTES[kind];
  return html`<aside class="secnote" aria-label="${n.title}">
    <p class="secnote__title"><span class="secnote__mark" aria-hidden="true"></span>${n.title}</p>
    <ul class="secnote__list">${n.items.map((t) => html`<li>${t}</li>`)}</ul>
    <a class="secnote__more" href="/security#${n.anchor}">セキュリティと個人情報の取扱いをくわしく <span class="aw">→</span></a>
  </aside>`;
}
