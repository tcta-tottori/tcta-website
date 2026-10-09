// トップページ「大会情報」カルーセルの唯一の正。
//
// ■ 写真の差し込み方
//   1. 画像を public/assets/img/tournaments/ に置く（例：enetopia-2026.jpg）
//   2. 該当大会の image を 'assets/img/tournaments/enetopia-2026.jpg' に書き換える
//   3. imageAlt に写真の内容を日本語で書く（読み上げ・画像非表示時に使われる）
//
//   image を null のままにしておくと、写真が用意できるまで大会名だけの
//   プレースホルダーを表示する。仮画像（t1〜t4.png）は差し替え待ちの目印。
//
// ■ status
//   'past'   終了（モノクロ表示・TODAY より前に並ぶ）
//   'live'   開催当日
//   'closed' 受付終了
//   'soon'   まもなく受付
//   'open'   受付中（赤バッジ）
//
// ■ リンク先（カードをタップしたときの遷移先）
//
//   slug を入れた大会は、その大会の個別ページ（event-<slug>.html）へ飛ぶ。
//   要項・ドロー・結果・写真はそこに全部まとまっているので、カードの文言だけを
//   大会の進み具合に合わせて切り替える（要項を見る／ドローを見る／結果を見る）。
//   slug は src/data/events.json のものと同じ。素材を取り込むと自動で増える。
//
//   slug の無い大会は、下の URL を上から順に見て、入っているものへ飛ぶ。
//   下ほど優先度が高い。
//
//     outlineUrl … 要項。募集中〜開催前はこれ（「要項を見る」）
//     drawUrl    … ドロー（組み合わせ）。決まったら入れる（「ドローを見る」）
//     liveUrl    … 大会運用システム。status:'live' の当日だけ使う（「速報・ドローを見る」）
//     resultUrl  … 結果。status:'past' はこれ（「結果を見る」）
//
//   URL を入れていない段階では、その状態を飛ばして1つ前の案内に留まる。
//   例）ドロー未発表なら「要項を見る」、結果未掲載なら「結果は準備中」と出る。

import { eventBySlug } from './events.js';

// カルーセル中央の「TODAY」マーカー。終了した大会と今後の大会の境目に入る。
// ビルドした日の日本時間。公開のたびに更新されるので、手で書き換えない。
export const TODAY = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()).replace(/\//g, '.');

export const STATUS = {
  past: { label: '終了', badge: 'badge--muted' },
  live: { label: '本日開催', badge: 'badge--open' },
  closed: { label: '受付終了', badge: 'badge--muted' },
  soon: { label: 'まもなく受付', badge: 'badge--muted' },
  open: { label: '受付中', badge: 'badge--open' },
};

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
 * 個別ページのある大会（slug つき）はそこへ飛ばし、文言だけを段階に合わせる。
 * 個別ページの無い大会は、該当する URL が未記入なら1つ手前の案内へ自動的に下がる。
 */
export function cardAction(t) {
  if (t.slug) {
    const e = eventBySlug(t.slug);
    const href = e ? e.url : null;
    if (!href) return { label: '詳細は準備中', href: null };
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

// 中身は tournaments.json。管理画面で大会の状態（status）を変えると、ここも書き換わる。
import TOURNAMENTS from './tournaments.json';
export { TOURNAMENTS };

