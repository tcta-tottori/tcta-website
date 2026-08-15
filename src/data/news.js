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
// ※ 掲載例は docs/content.md 2.3 の表がもと。公開前に実際のお知らせへ
//   差し替えること（日付・文言・リンク先すべて）。

/** トップページに出す件数。これを超えた分は VIEW ALL の中だけに出る。 */
export const NEWS_VISIBLE = 4;

/** NEW を付ける期間（日） */
const NEW_DAYS = 14;

export const NEWS = [
  { date: '2026.08.03', category: 'tournament', title: 'サマーミックスダブルス大会のドローを公開しました', href: 'tournaments.html' },
  { date: '2026.08.02', category: 'result', title: '第11回気高カップサマーシングルスの結果を掲載しました', href: 'results.html' },
  { date: '2026.07.21', category: 'info', title: '令和9年度クラブ対抗戦の編成表を公開しました', href: 'club.html' },
  { date: '2026.07.15', category: 'result', title: '令和8年度クラブ対抗戦 後期の結果を掲載しました', href: 'results.html' },
  { date: '2026.07.01', category: 'info', title: '10月12日のテニス祭りの参加受付をはじめました', href: 'tennis-day.html' },
  { date: '2026.06.18', category: 'info', title: '毎週水曜日のテニス教室の会場を井原公園に変更しました', href: 'lesson.html' },
  { date: '2026.06.02', category: 'tournament', title: '令和8年度の大会日程（全19大会）を公開しました', href: 'tournaments.html' },
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
