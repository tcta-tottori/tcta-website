// トップページ「お知らせ」の唯一の正。
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
//   （例：令和8年度の大会結果は results.json にまだ無いので「結果を掲載しました」
//     とは書けない。結果を入れてから、そのお知らせを足すこと）
//   href は必ずサイト内の実在するページにする。

/** トップページに出す件数。これを超えた分は VIEW ALL の中だけに出る。 */
export const NEWS_VISIBLE = 4;

/** NEW を付ける期間（日） */
const NEW_DAYS = 14;

export const NEWS = [
  { date: '2026.08.12', category: 'tournament', title: 'エネトピア杯ミックスダブルスの受付をはじめました', href: 'tournaments.html' },
  { date: '2026.07.31', category: 'tournament', title: 'サマーミックスダブルスの受付を締め切りました', href: 'tournaments.html' },
  { date: '2026.07.21', category: 'info', title: '令和9年度クラブ対抗戦の編成表を公開しました', href: 'club.html' },
  { date: '2026.07.01', category: 'info', title: '10月12日のテニス祭りの参加受付をはじめました', href: 'tennis-day.html' },
  { date: '2026.06.18', category: 'info', title: '毎週水曜日のテニス教室の会場を井原公園に変更しました', href: 'lesson.html' },
  { date: '2026.06.02', category: 'tournament', title: '令和8年度の大会日程（全19大会）を公開しました', href: 'tournaments.html' },
  { date: '2026.05.20', category: 'result', title: '平成16年度〜令和6年度の大会結果を掲載しました', href: 'results.html' },
  { date: '2026.04.13', category: 'info', title: '令和8年度の協会登録の受付をはじめました', href: 'membership.html' },
];

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
