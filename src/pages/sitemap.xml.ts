// サイトマップ（/sitemap.xml）。検索エンジンに、公開しているページを漏れなく知らせる。
// 固定のページ、大会のページ（管理画面の大会。結果があれば結果のページも）、令和6年度までの結果のページ、テニス祭りの各回。
// 要項・ドローだけのページ（outline-・draw-）は大会のページと同じ内容なので載せない。公開アドレスは astro.config.mjs の site。
import type { APIRoute } from 'astro';
import { siteData } from '../lib/cms.js';
import { ALL_GROUPS } from '../data/results.js';
import { TENNISDAY_EVENTS } from '../data/tennisday-archive.js';

export const prerender = false;

const PAGES: [string, string, number][] = [
  // [パス, 更新の頻度, 優先度]
  ['/', 'daily', 1.0],
  ['/tournaments.html', 'daily', 0.9],
  ['/results.html', 'weekly', 0.8],
  ['/about.html', 'monthly', 0.6],
  ['/membership.html', 'monthly', 0.7],
  ['/lesson.html', 'monthly', 0.7],
  ['/club.html', 'monthly', 0.6],
  ['/courts.html', 'monthly', 0.7],
  ['/tennis-day.html', 'monthly', 0.6],
  ['/links.html', 'monthly', 0.4],
  ['/contact.html', 'yearly', 0.5],
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async (ctx) => {
  const base = ctx.site ?? new URL(ctx.url.origin);
  const abs = (p: string) => new URL(p, base).href;
  const urls: { loc: string; changefreq: string; priority: number; lastmod?: string }[] = PAGES.map(([p, changefreq, priority]) => ({ loc: abs(p), changefreq, priority }));

  try {
    const { EVENTS = [] } = await siteData(ctx as never);
    for (const e of EVENTS) {
      urls.push({ loc: abs(`/${e.url}`), changefreq: e.hasResult ? 'monthly' : 'weekly', priority: e.hasResult ? 0.6 : 0.8, lastmod: e.date });
      if (e.hasResult) urls.push({ loc: abs(`/result-${e.slug}.html`), changefreq: 'monthly', priority: 0.6, lastmod: e.date });
    }
  } catch { /* 管理画面の内容が読めないときは固定のページだけ */ }
  for (const g of ALL_GROUPS) urls.push({ loc: abs(`/result-${g.id}.html`), changefreq: 'yearly', priority: 0.3 });
  for (const t of TENNISDAY_EVENTS) urls.push({ loc: abs(`/tennis-day-${t.year}.html`), changefreq: 'yearly', priority: 0.5 });

  const seen = new Set<string>();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.filter((u) => !seen.has(u.loc) && seen.add(u.loc)).map((u) =>
      `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(String(u.lastmod).slice(0, 10))}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority.toFixed(1)}</priority></url>`),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
