// ホームページについてのアンケート（survey.html と、受付・読み出しの API が同じものを使う）。
//
//   ・回答は D1 の survey_responses に保存する（src/pages/api/survey.ts）
//   ・読み出しは /api/survey-results（合言葉＝鍵が要る。src/pages/api/survey-results.ts）
//     鍵そのものはリポジトリに置かず、wrangler.jsonc の SURVEY_KEY_SHA256 に「鍵の SHA-256」だけを置く
//   ・集計は tools/survey_report.mjs（Claude Code から SURVEY_READ_KEY=… node tools/survey_report.mjs）
//   ・やり方の全体は docs/survey.md
//
// 次のアンケートをするときは、id を変えて期間と質問を書き換える（前の回答は id ごとに残る）。

export const SURVEY = {
  /** アンケートの番号。回答はこの番号ごとに分けて保存する */
  id: 'site-2026-11',
  title: 'ホームページについてのアンケート',
  /** 受付の始めと終わり（日本時間）。終わりを過ぎると、ページは「受付終了」になり、API も受け付けない */
  opensAt: '2026-11-02T00:00:00+09:00',
  closesAt: '2026-11-09T23:59:59+09:00',
  /** ページに出す期間の書き方 */
  periodLabel: '2026年11月2日（月）〜11月9日（月）',
  closesLabel: '11月9日（月）',
};

/** 回答者の立場（1つ） */
export const ROLES = ['協会に登録している選手', 'クラブ・団体の代表・役員', '協会の役員・理事', '登録していない一般の方', 'その他'];

/** ふだん見る端末（1つ） */
export const DEVICES = ['スマートフォン', 'タブレット', 'パソコン'];

/** 見やすさ・使いやすさ（5段階。数字が大きいほどよい） */
export const RATINGS = [
  { value: 1, label: '使いにくい' },
  { value: 2, label: 'やや使いにくい' },
  { value: 3, label: 'ふつう' },
  { value: 4, label: 'やや使いやすい' },
  { value: 5, label: '使いやすい' },
];

/** ご意見のあるページ（いくつでも） */
export const PAGES = [
  'サイト全体',
  'トップページ',
  '協会について',
  '大会情報（一覧・カレンダー）',
  '大会のページ（要項・ドロー・結果）',
  '大会結果',
  'イベント情報',
  '水曜テニス教室',
  '入会案内',
  'コート案内',
  'お問い合わせ',
];

/** ご意見の種類（いくつでも。1つ以上） */
export const KINDS = [
  '追加してほしいこと（機能・情報）',
  '修正が必要な箇所（誤り・不具合）',
  'デザイン・見やすさ',
  '使いにくいところ',
  'その他',
];

/** 文字数の上限 */
export const LIMITS = { body: 3000, place: 500, name: 60 };

/** いまが受付期間かどうか */
export const surveyOpen = (now = new Date()) =>
  now >= new Date(SURVEY.opensAt) && now <= new Date(SURVEY.closesAt);
