// 大会の「要項・申込用紙・ドロー・結果」の4つのボタン。大会情報ページの一覧（TournamentList.astro）と、
// トップの大会カード（TournamentCard.astro。src/data/tournaments.js の buildCards が付ける）で共用する。
//
// 行き先：要項 → outline-<slug>.html、ドロー → draw-<slug>.html、結果 → result-<slug>.html（それぞれ独立したページ）、
// 申込用紙 → PDF を直接（別タブ。無ければ大会ページの申込の節）。素材の無いものは href が null（押せない灰色のボタン）。
// 大会ページの無い大会（区分「その他」）は、管理画面の要項・ドロー・結果の URL を使う（urls）。

/**
 * @param {object|null} e 大会ページの情報（cms.js の eventForSchedule / eventBySlug）
 * @param {{ outline?: string|null, draw?: string|null, result?: string|null }} [urls] 大会ページが無いときの行き先
 */
export function eventButtons(e, urls = {}) {
  if (!e) {
    return [
      { key: 'outline', label: '要項', href: urls.outline ?? null, external: !!urls.outline },
      { key: 'entry', label: '申込用紙', href: null },
      { key: 'draw', label: 'ドロー', href: urls.draw ?? null, external: !!urls.draw },
      { key: 'result', label: '結果', href: urls.result ?? null, external: !!urls.result },
    ];
  }
  const sec = (key) => e.sections.find((s) => s.key === key) ?? null;
  const entry = sec('entry');
  const entryPdf = entry?.pdfs[0]?.src ?? null;
  return [
    { key: 'outline', label: '要項', href: sec('outline') ? `outline-${e.slug}.html` : null },
    { key: 'entry', label: '申込用紙', href: entryPdf ?? (entry ? `${e.url}#entry` : null), external: !!entryPdf },
    { key: 'draw', label: 'ドロー', href: sec('draw') ? `draw-${e.slug}.html` : null },
    { key: 'result', label: '結果', href: e.hasResult ? `result-${e.slug}.html` : null },
  ];
}
