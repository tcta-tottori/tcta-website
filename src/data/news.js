// トップページ「お知らせ」。内容は EmDash の「お知らせ」コレクション（src/lib/cms.js が読む）。
//
// ■ 並び
//   新しいものから順に出す。トップページは上から4件だけを出し、
//   5件目があるときは「まだ続きがある」ことが分かるよう薄く重ねて見せる。
//   VIEW ALL を押すと全件が別画面で開く。
//
// ■ 出す期間
//   日付が見た時点から3ヶ月以内のものだけを出す（VIEW ALL の中も、上部の赤い帯も同じ）。
//   古いものは管理画面に残っていても表には出ないので、消して回らなくてよい。
//   先の日付（予告として先に書いたもの）はそのまま出る。
//
// ■ 分類（管理画面の選択肢）
//   '大会'     … 要項公開、エントリー受付、ドロー発表
//   '結果'     … 大会結果の掲載
//   'ジュニア' … ジュニア向け大会・教室の案内
//   'お知らせ' … 登録案内、役員名簿、規約改定、コート利用連絡
//   ラベルは表には出さないが、あとで絞り込みを付けるときのために残してある。
//
// ■ NEW の付き方
//   日付が見た時点から2週間以内のものに、赤い NEW が自動で付く。
//   手で付け外しはしない（消し忘れが必ず起きるため）。
//
// ■ 書くときの約束
//   このサイトに載っていないものは、お知らせにも書かない。
//   （例：大会結果は大会のページに入れてから「結果を掲載しました」と書く。先に書かないこと）
//   リンク先は必ずサイト内の実在するページにする（例：event-r8-enetopia.html）。

/** トップページに出す件数。4件目は薄く重ねて「続きがある」ことだけ見せ、全部は VIEW ALL の中に出る。 */
export const NEWS_VISIBLE = 3;

/** NEW を付ける期間（日） */
const NEW_DAYS = 14;

/** お知らせを出す期間（ヶ月）。日付がこれより前のものは表に出ない */
const NEWS_MONTHS = 3;

/** 見た時点から NEWS_MONTHS ヶ月前の日付（'2026-07-22' の形）。これより前のお知らせは出さない */
export function newsCutoff(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - NEWS_MONTHS, now.getDate());
  // 月末の日付からの引き算で月をまたいだとき（5/31 → 2/31 = 3/3）は、その月の末日に丸める
  if (d.getDate() !== now.getDate()) d.setDate(0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 移行時に付けた slug（20261004-16）の末尾の番号。それ以外は 0 */
const seedNo = (n) => (/^\d{8}-\d{2}$/.test(n.slug) ? Number(n.slug.slice(9)) : 0);

/** 管理画面の分類 → コードで使うキー */
export const CATEGORY_KEY = { '大会': 'tournament', '結果': 'result', 'ジュニア': 'junior', 'お知らせ': 'info' };

/**
 * EmDash の行から、ページが使う形に組み立てる。
 *   NEWS           … 新しい順、見た時点から3ヶ月以内のもの。{ date: '2026.10.12', category, title, href, important }
 *   IMPORTANT_NEWS … 全ページ上部の帯に出す重要なお知らせ（中止・延期など）
 */
export function buildNews(rows, now = new Date()) {
  const cutoff = newsCutoff(now);
  const NEWS = rows
    .filter((n) => n.title && n.date)
    .filter((n) => String(n.date).slice(0, 10) >= cutoff)
    .map((n) => ({
      slug: n.slug,
      date: String(n.date).slice(0, 10).replace(/-/g, '.'),
      category: CATEGORY_KEY[n.category] ?? 'info',
      title: n.title,
      href: n.href || 'index.html',
      important: !!n.important,
      createdAt: n.createdAt instanceof Date ? n.createdAt.getTime() : 0,
    }))
    // 新しい日付が先。同じ日付は、移行時のもの（slug が 20261004-16 の形）は末尾の番号が大きいほど新しく、
    // 管理画面で作ったものはあとから作ったものが先。
    .sort((a, b) => b.date.localeCompare(a.date) || seedNo(b) - seedNo(a) || b.createdAt - a.createdAt || b.slug.localeCompare(a.slug));
  return { NEWS, IMPORTANT_NEWS: NEWS.filter((n) => n.important) };
}

/** '2026.08.03' → { day: '08.03', year: '2026' }（左端の日付表示用） */
export function newsDate(date) {
  const [year, m, d] = date.split('.');
  return { day: `${m}.${d}`, year };
}

/**
 * 見た時点から NEW_DAYS 以内かどうか。
 * 先の日付（予告として先に書いたもの）も NEW として扱う。
 */
export function isNew(date, now = new Date()) {
  const [y, m, d] = date.split('.').map(Number);
  const days = (now - new Date(y, m - 1, d)) / 86400000;
  return days < NEW_DAYS;
}
