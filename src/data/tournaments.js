// トップページ「大会情報」カルーセル。内容は EmDash の「大会」コレクションのうち
// 「トップページの大会カードに出す」にチェックの入ったもの（src/lib/cms.js が読む）。
//
// ■ 写真
//   管理画面の「カードの写真」にアップロードする。移行前に public/assets/img/ に置いた写真は
//   「取り込みずみの写真の場所」に残してあり、アップロードが無いときはそちらを使う。
//   どちらも無い大会は、写真が用意できるまで大会名だけのプレースホルダーを表示する。
//
// ■ 状態（受付状態から決まる）
//   'past'   終了（モノクロ表示・TODAY より前に並ぶ）
//   'live'   開催当日
//   'closed' 受付終了
//   'soon'   まもなく受付
//   'open'   受付中（赤バッジ）
//
// ■ リンク先（カードをタップしたときの遷移先）
//   区分が「協会主催」「預かり」の大会は、その大会のページ（event-<slug>.html）へ飛ぶ。
//   要項・ドロー・結果・写真はそこに全部まとまっているので、カードの文言だけを
//   大会の進み具合に合わせて切り替える（要項を見る／ドローを見る／結果を見る）。
//
//   区分が「その他」の大会（ページを作らないもの）は、下の URL を上から順に見て、入っているものへ飛ぶ。
//   下ほど優先度が高い。
//     outline_url … 要項。募集中〜開催前はこれ（「要項を見る」）
//     draw_url    … ドロー（組み合わせ）。決まったら入れる（「ドローを見る」）
//     live_url    … 大会運用システム。本日開催の日だけ使う（「速報・ドローを見る」）
//     result_url  … 結果。終了後はこれ（「結果を見る」）
//   URL を入れていない段階では、その状態を飛ばして1つ前の案内に留まる。
//   例）ドロー未発表なら「要項を見る」、結果未掲載なら「結果は準備中」と出る。

/** カルーセル中央の「TODAY」マーカーの日付。見た日の日本時間。 */
export const today = () => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()).replace(/\//g, '.');

export const STATUS = {
  past: { label: '終了', badge: 'badge--muted' },
  live: { label: '本日開催', badge: 'badge--open' },
  closed: { label: '受付終了', badge: 'badge--muted' },
  soon: { label: 'まもなく受付', badge: 'badge--muted' },
  open: { label: '受付中', badge: 'badge--open' },
};

/** 受付状態（schedule.js のキー）→ カードの状態 */
const CARD_STATUS = { done: 'past', closed: 'closed', open: 'open', soon: 'soon', live: 'live' };

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** '2026.08.16' → { md: '08.16', dow: 'SUN' }（カード左上の日程チップ用） */
export function dateChip(date) {
  const [y, m, d] = date.split('.').map(Number);
  return {
    md: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
    dow: DOW[new Date(y, m - 1, d).getDay()],
  };
}

/**
 * 大会の進み具合から、カードの遷移先とボタンの文言を決める。
 * 個別ページのある大会はそこへ飛ばし、文言だけを段階に合わせる。
 * 個別ページの無い大会は、該当する URL が未記入なら1つ手前の案内へ自動的に下がる。
 */
export function cardAction(t, e) {
  if (e) {
    const href = e.url;
    if (t.status === 'live') return { label: '速報・ドローを見る', href: t.liveUrl || href };
    if (e.hasResult) return { label: '結果を見る', href };
    if (e.sections.some((s) => s.key === 'draw')) return { label: 'ドローを見る', href };
    return { label: '要項を見る', href };
  }
  if (t.status === 'past') {
    return t.resultUrl
      ? { label: '結果を見る', href: t.resultUrl }
      : { label: '結果は準備中', href: null };
  }
  if (t.status === 'live' && (t.liveUrl || t.drawUrl)) {
    return { label: '速報・ドローを見る', href: t.liveUrl || t.drawUrl };
  }
  if (t.drawUrl) return { label: 'ドローを見る', href: t.drawUrl };
  if (t.outlineUrl) return { label: '要項を見る', href: t.outlineUrl };
  return { label: '詳細を見る', href: t.href ?? null };
}

/**
 * 会場ロゴ（背景透過・白抜き）。大会カードは写真の上に文字を載せるので、
 * ロゴがある会場はカード下部を文字ではなくロゴで見せる。
 * ここに無い会場は venue の文字がそのまま出る。
 * 画像を足すときは、白インク＋背景透過の PNG を public/assets/img/ に置くこと。
 */
export const VENUE_LOGOS = {
  'ヤマタスポーツパーク': { src: 'assets/img/venue-yamata.png', width: 770, height: 80 },
};

/**
 * EmDash の行から、カードの配列を組み立てる。日付の古い順。
 *   TOURNAMENTS … { date: '2026.10.18', slug, title, event, venue, status, image, imageAlt, action }
 */
export function buildCards(rows, { ROWS, eventBySlug }) {
  const base = new Map(ROWS.map((r) => [r.slug, r]));
  const TOURNAMENTS = rows
    .filter((t) => t.card && base.has(t.slug))
    .map((t) => {
      const b = base.get(t.slug);
      const e = eventBySlug(t.slug);
      const card = {
        slug: b.slug,
        date: b.date.replace(/-/g, '.'),
        title: b.name,
        event: t.card_event || b.event,
        venue: b.place,
        status: CARD_STATUS[b.status] ?? 'soon',
        image: t.card_image?.src || t.card_image_path || null,
        imageAlt: t.card_image?.alt || t.card_image_alt || '',
        liveUrl: t.live_url || null,
        outlineUrl: t.outline_url || null,
        drawUrl: t.draw_url || null,
        resultUrl: t.result_url || null,
        href: t.link_url || null,
      };
      card.action = cardAction(card, e);
      return card;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { TOURNAMENTS };
}
