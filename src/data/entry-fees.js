// 大会ごとの参加料（エントリー料）と、構造化データ（schema.org の Offer）の組み立て。
// Google の検索結果に大会として出すための SportsEvent に offers を入れる（Search Console で「項目 offers がありません」と出たため）。
//
// ■ ENTRY_FEES
//   各大会の要項（public/assets/pdf/events/<slug>/ の PDF）に書かれた基本の参加料（円）と、何あたりか。
//   鳥取市テニス協会・県協会に登録していない人は倍額になる大会もあるが、ここには要項の基本の金額を入れる。
//   要項に金額が無い・分からない大会は入れない（offers には金額を入れず、申込み先と受付状況だけ出す）。
//   新しい年度の要項が出たら、ここに足すこと。
export const ENTRY_FEES = {
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
 *   price        … ENTRY_FEES にある大会だけ。priceCurrency は JPY
 *   availability … 受付状態から
 *   validThrough … 申込締切（「11/13」の形のときだけ。締切日の 20:00）
 * @param {object} e        大会のページの情報（events.js）
 * @param {string} site     サイトの URL（https://tottori-city-tennis.com/）
 * @param {string|null} dueIso 申込締切の日付（'YYYY-MM-DD'。schedule.js の dueDate）
 */
export function eventOffer(e, site, dueIso = null) {
  const hasOutline = e.sections?.some((s) => s.key === 'outline' || s.key === 'entry');
  const fee = ENTRY_FEES[e.slug];
  return {
    '@type': 'Offer',
    url: new URL(hasOutline ? `outline-${e.slug}.html` : `event-${e.slug}.html`, site).href,
    ...(fee ? { price: fee.price, priceCurrency: 'JPY' } : {}),
    availability: AVAILABILITY[e.status] ?? 'https://schema.org/InStock',
    ...(dueIso ? { validThrough: `${dueIso}T20:00:00+09:00` } : {}),
  };
}
