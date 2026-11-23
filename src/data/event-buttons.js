// 大会の「要項・ドロー・結果」の3つのボタン。大会情報ページの一覧（TournamentList.astro）と、
// トップの大会カード（TournamentCard.astro。src/data/tournaments.js の buildCards が付ける）で共用する。
//
// 行き先：要項 → outline-<slug>.html（申込用紙もこのページに載せる）、ドロー → draw-<slug>.html、結果 → result-<slug>.html。
// 要項のボタンは、要項か申込用紙のどちらかがあれば押せる。素材の無いものは href が null（押せない灰色のボタン）。
// 大会ページの無い大会（区分「その他」）は、管理画面の要項・ドロー・結果の URL を使う（urls）。
// 外部のページへ飛ばす大会（schedule.js の EXTERNAL_PAGES。市民体育祭など）は、要項のボタンでそのページを、結果のボタンで年度ごとの結果の URL を開く。

// 開催中（開催日の 9:00〜18:00。schedule.js の liveStatus）は、結果のボタンを「速報」にして、運営システムの観戦ページ（結果速報）を開く。
// 管理画面に速報の URL（live_url）があればそちらを使う。
import { LIVE_DRAW_URL } from './live.js';
import { NO_LIVE } from './official-extra.js';

/**
 * @param {object|null} e 大会ページの情報（cms.js の eventForSchedule / eventBySlug）
 * @param {{ outline?: string|null, draw?: string|null, result?: string|null }} [urls] 大会ページが無いときの行き先
 * @param {{ status?: string, liveUrl?: string|null }} [state] 大会の状態（schedule.js の status：live なら開催中）と速報の URL
 */
export function eventButtons(e, urls = {}, state = {}) {
  const buttons = baseButtons(e, urls);
  // 速報を取りやめた大会（official-extra.js の NO_LIVE）は、開催中でも結果のボタンのまま
  if (state.status !== 'live' || (e && NO_LIVE.includes(e.slug))) return buttons;
  return buttons.map((b) => (b.key === 'result'
    ? { key: 'live', label: '速報', href: state.liveUrl || LIVE_DRAW_URL, external: true, live: true }
    : b));
}

function baseButtons(e, urls) {
  if (!e) {
    return [
      { key: 'outline', label: '要項', href: urls.outline ?? null, external: !!urls.outline },
      { key: 'draw', label: 'ドロー', href: urls.draw ?? null, external: !!urls.draw },
      { key: 'result', label: '結果', href: urls.result ?? null, external: !!urls.result },
    ];
  }
  const has = (key) => e.sections.some((s) => s.key === key);
  return [
    { key: 'outline', label: '要項', href: has('outline') || has('entry') ? `outline-${e.slug}.html` : null },
    { key: 'draw', label: 'ドロー', href: has('draw') ? `draw-${e.slug}.html` : null },
    { key: 'result', label: '結果', href: e.hasResult ? `result-${e.slug}.html` : null },
  ];
}
