// トップページ「お知らせ」の唯一の正（データ本体は news.json）。
//
// ■ 並び
//   新しいものから順に書く。トップページは上から4件だけを出し、
//   5件目があるときは「まだ続きがある」ことが分かるよう薄く重ねて見せる。
//   VIEW ALL を押すと全件が別画面で開く。
//
// ■ category
//   'tournament' 大会  … 要項公開、エントリー受付、ドロー発表
//   'result'     結果  … 大会結果の掲載
//   'junior'     ジュニア … ジュニア向け大会・教室の案内
//   'info'       お知らせ … 登録案内、役員名簿、規約改定、コート利用連絡
//   ラベルは表には出さないが、あとで絞り込みを付けるときのために残してある。
//
// ■ NEW の付き方
//   date がビルド時点から2週間以内のものに、赤い NEW が自動で付く。
//   手で付け外しはしない（消し忘れが必ず起きるため）。
//   公開はビルドのたびに更新されるので、記事を足して push すれば付き直る。
//
// ■ 旧サイトの「新着情報」との対応
//   旧サイト（https://www.tottori-tenis.net/）のトップにある新着情報が、
//   このお知らせにあたる。旧サイトは「■サマーミックステニス大会ドロー」のような
//   体言止めだが、ここでは docs/content.md 2.3 の方針どおり「〜しました」に直す。
//   一覧で読んだときに、新しく起きたことなのか、ただの案内なのかを分けるため。
//
//   旧サイトの新着情報は、次の7種類がくり返し出る。ここに足すときも同じ形に寄せる。
//     ・大会日程の公開（年度はじめ）      ・開催要項／申込用紙の公開
//     ・エントリー受付の開始・締切        ・ドローの公開と訂正
//     ・大会結果の掲載                    ・協会登録の案内
//     ・水曜テニス教室の案内
//
// ■ 書くときの約束
//   このサイトに載っていないものは、お知らせにも書かない。
//   （例：大会結果は events.json（tools/build_events.py）に入れてから
//     「結果を掲載しました」と書く。先に書かないこと）
//   href は必ずサイト内の実在するページにする。

/** トップページに出す件数。これを超えた分は VIEW ALL の中だけに出る。 */
export const NEWS_VISIBLE = 4;

/** NEW を付ける期間（日） */
const NEW_DAYS = 14;

// 中身は news.json。管理画面（admin/）からの投稿もここに書き込まれる。
//   { date, category, title, href, important? }
//   important: true … 中止・延期などの重要なお知らせ。全ページ上部の赤い帯にも出る。
import NEWS from './news.json';
export { NEWS };

/** 全ページ上部の帯に出す重要なお知らせ（中止・延期など）。新しいものから。 */
export const IMPORTANT_NEWS = NEWS.filter((n) => n.important);


/** '2026.08.03' → { day: '08.03', year: '2026' }（左端の日付表示用） */
export function newsDate(date) {
  const [year, m, d] = date.split('.');
  return { day: `${m}.${d}`, year };
}

/**
 * ビルド時点から NEW_DAYS 以内かどうか。
 * 先の日付（予告として先に書いたもの）も NEW として扱う。
 */
export function isNew(date, now = new Date()) {
  const [y, m, d] = date.split('.').map(Number);
  const days = (now - new Date(y, m - 1, d)) / 86400000;
  return days < NEW_DAYS;
}
