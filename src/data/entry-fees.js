// 大会ごとの参加料（エントリー料）と、構造化データ（schema.org の Offer）の組み立て。
// Google の検索結果に大会として出すための SportsEvent に offers を入れる（Search Console で「項目 offers がありません」と出たため）。
//
// ■ ENTRY_FEES
//   各大会の要項（public/assets/pdf/events/<slug>/ の PDF）に書かれた基本の参加料（円）と、何あたりか。
//   鳥取市テニス協会・県協会に登録していない人は倍額になる大会もあるが、ここには要項の基本の金額を入れる。
//   要項に金額が無い・分からない大会は入れない。その大会は offers ごと出さない
//   （金額の無い offers は Search Console で「項目 price／priceCurrency がありません」と出るため）。
//   2チーム分の金額がある大会（クラブ対抗の男子・女子など）は、高いほうの基本の金額を入れる。
//   新しい年度の要項が出たら、ここに足すこと。
export const ENTRY_FEES = {
  // 令和7年度（要項の PDF から）
  'r7-sasaki': { price: 3000, per: '1ペア' },
  'r7-kaicho-spring': { price: 3000, per: '1ペア' },
  'r7-club-taiko-1': { price: 10000, per: '男子1チーム（女子は7,000円）' },
  'r7-club-taiko-2': { price: 10000, per: '男子1チーム（女子は7,000円）' },
  'r7-ketaka': { price: 2000, per: '1人' },
  'r7-dunlop': { price: 3000, per: '1ペア' },
  'r7-enetopia': { price: 3000, per: '1ペア' },
  'r7-prince-open': { price: 18000, per: '1チーム' },
  'r7-kenko-autumn': { price: 1500, per: '1人（一般）' },
  'r7-kensen-singles': { price: 2000, per: '1人' },
  'r7-kensen-doubles': { price: 3000, per: '1ペア' },
  'r7-kaicho-autumn': { price: 9000, per: '1チーム' },
  'r7-shicho': { price: 2000, per: '1人' },
  'r7-tottori-univ-singles': { price: 1500, per: '1人' },
  'r7-osaka': { price: 2500, per: '1人（シングルス。ダブルスは3,500円）' },
  // 令和8年度
  'r8-tobu-singles': { price: 2000, per: '1人' },
  'r8-tobu-doubles': { price: 3000, per: '1組' },
  'r8-club-taiko-1': { price: 10000, per: '男子1チーム（女子は7,000円）' },
  'r8-club-taiko-2': { price: 10000, per: '男子1チーム（女子は7,000円）' },
  'r8-ketaka': { price: 2000, per: '1人' },
  'r8-sasaki': { price: 3000, per: '1ペア' },
  'r8-kaicho-spring': { price: 9000, per: '1チーム' },
  'r8-kenko-spring': { price: 1500, per: '1人（一般）' },
  'r8-tottori-univ-open': { price: 3000, per: '1ペア' },
  'r8-summer-mix': { price: 3000, per: '1組' },
  'r8-dunlop': { price: 3000, per: '1ペア' },
  'r8-kyotango-doubles': { price: 3300, per: '1ペア' },
  'r8-enetopia': { price: 3000, per: '1ペア' },
  'r8-kenko-autumn': { price: 1500, per: '1人（一般）' },
  'r8-kensen-singles': { price: 2000, per: '1人' },
  'r8-kaicho-autumn': { price: 3000, per: '1ペア' },
  'r8-prince-open': { price: 18000, per: '1チーム' },
  'r8-shicho': { price: 2000, per: '1人' },
  'r8-no18': { price: 3000, per: '1ペア' },
  'r8-kyotango-mixed': { price: 3300, per: '1ペア' },
  'r8-tottori-univ-winter': { price: 1500, per: '1人' },
};

/** 受付状態（schedule.js のキー）→ schema.org の availability。受付中は InStock、まもなく受付は PreOrder、受付終了・終了は SoldOut */
const AVAILABILITY = {
  open: 'https://schema.org/InStock',
  live: 'https://schema.org/SoldOut',
  soon: 'https://schema.org/PreOrder',
  closed: 'https://schema.org/SoldOut',
  done: 'https://schema.org/SoldOut',
};

/**
 * 大会1件の Offer（構造化データ）。
 *   url          … 申込みの案内のあるページ（要項のページ。要項がまだ無ければ大会のページ）
 *   price        … ENTRY_FEES の金額。priceCurrency は JPY。ENTRY_FEES に無い大会は null を返す（offers を出さない）
 *   availability … 受付状態から
 *   validFrom    … 受付開始（Search Console で「項目 validFrom がありません」と出たため）。
 *                  管理画面に受付開始日の欄は無いので、申込締切（読めなければ開催日）の 2か月前の 0:00 とする。
 *                  要項はおおむね締切の 1〜2か月前に出るので、受付の始まりより後にならないように早めに取っている
 *   validThrough … 申込締切（「11/13」の形のときだけ。締切日の 20:00）
 * @param {object} e        大会のページの情報（events.js）
 * @param {string} site     サイトの URL（https://tottori-city-tennis.com/）
 * @param {string|null} dueIso 申込締切の日付（'YYYY-MM-DD'。schedule.js の dueDate）
 */
/** 'YYYY-MM-DD' の 2か月前の日付（'YYYY-MM-DD'）。月末で日が無いときはその月の末日 */
function twoMonthsBefore(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 3, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

export function eventOffer(e, site, dueIso = null) {
  const hasOutline = e.sections?.some((s) => s.key === 'outline' || s.key === 'entry');
  const fee = ENTRY_FEES[e.slug];
  if (!fee) return null;
  const base = dueIso ?? (/^\d{4}-\d{2}-\d{2}/.test(String(e.date ?? '')) ? String(e.date).slice(0, 10) : null);
  return {
    '@type': 'Offer',
    url: new URL(hasOutline ? `outline-${e.slug}.html` : `event-${e.slug}.html`, site).href,
    price: fee.price,
    priceCurrency: 'JPY',
    availability: AVAILABILITY[e.status] ?? 'https://schema.org/InStock',
    ...(base ? { validFrom: `${twoMonthsBefore(base)}T00:00:00+09:00` } : {}),
    ...(dueIso ? { validThrough: `${dueIso}T20:00:00+09:00` } : {}),
  };
}
