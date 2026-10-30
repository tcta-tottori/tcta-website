// 大会の「要項・ドロー・結果」の3つのボタン。大会情報ページの一覧（TournamentList.astro）と、
// トップの大会カード（TournamentCard.astro。src/data/tournaments.js の buildCards が付ける）で共用する。
//
// 行き先：要項 → outline-<slug>.html（申込用紙もこのページに載せる）、ドロー → draw-<slug>.html、結果 → result-<slug>.html。
// 要項のボタンは、要項か申込用紙のどちらかがあれば押せる。素材の無いものは href が null（押せない灰色のボタン）。
// 大会ページの無い大会（区分「その他」）は、管理画面の要項・ドロー・結果の URL を使う（urls）。
// 外部のページへ飛ばす大会（schedule.js の EXTERNAL_PAGES。市民体育祭など）は、要項のボタンでそのページを開く。

/**
 * @param {object|null} e 大会ページの情報（cms.js の eventForSchedule / eventBySlug）
 * @param {{ outline?: string|null, draw?: string|null, result?: string|null }} [urls] 大会ページが無いときの行き先
 */
export function eventButtons(e, urls = {}) {
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
