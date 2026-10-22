// トップページ「イベント情報」。内容は EmDash の「イベント情報」コレクション（src/lib/cms.js が読む）。
//
// 大会ではない催し——テニス祭り、テニス教室、講習会など——を並び順の小さい順に出す。
// 終わったものは管理画面で消すか、次回の案内に書き換える。
//
//   date   … 開催日（2026-10-12 の形）。毎週あるものは空にして when に文言を書く
//   when   … 日時の文言（カードにそのまま出す）
//   image  … 縦長（3:4）のチラシやポスターがあるとよく映える。無ければ空
//   href   … 詳しいページ（サイト内）

/** EmDash の行から、ページが使う形に組み立てる。 */
export function buildEventInfo(rows) {
  const EVENT_INFO = rows
    .filter((e) => e.title)
    .map((e) => ({
      slug: e.slug,
      date: e.date || null,
      when: e.when ?? '',
      title: e.title,
      place: e.place ?? '',
      lead: e.lead ?? '',
      image: e.image?.src || e.image_path || null,
      imageAlt: e.image?.alt || e.image_alt || '',
      href: e.href || 'index.html',
      badge: e.badge || '',
      order: e.order ?? 10,
    }))
    .sort((a, b) => a.order - b.order);
  return { EVENT_INFO };
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** '2026-10-12' → { md: '10.12', dow: 'MON' }。date が無いものは null */
export function eventChip(e) {
  if (!e.date) return null;
  const [y, m, d] = e.date.split('-').map(Number);
  return { md: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`, dow: DOW[new Date(y, m - 1, d).getDay()] };
}
