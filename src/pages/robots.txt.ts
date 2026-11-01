// robots.txt。検索エンジンにサイト全体を見てもらい、サイトマップの場所を伝える。
// 管理画面（/_emdash/）と、お問い合わせの送信先（/api/）は見せない。公開アドレスは astro.config.mjs の site。
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ site, url }) => {
  const base = site ?? new URL(url.origin);
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /_emdash/',
    'Disallow: /api/',
    '',
    `Sitemap: ${new URL('/sitemap.xml', base).href}`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
