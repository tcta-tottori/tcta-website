import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
import react from '@astrojs/react';
import { d1, r2 } from '@emdash-cms/cloudflare';
import { defineConfig } from 'astro/config';
import emdash from 'emdash/astro';

// CSS と JS の URL に付けるハッシュ（Base.astro が使う）。
// サーバー描画になったので、ビルド時にここで計算して定数として埋め込む
// （Workers の実行時には public/ のファイルを読めないため）。
const assetV = (path) =>
  createHash('sha1').update(readFileSync(new URL(`./public/${path}`, import.meta.url))).digest('hex').slice(0, 8);

// 公開ページのキャッシュ（Workers Cache）。EmDash が内容の公開時にタグで無効化するので、
// 長めに持たせてよい。タグはコレクション名（news / tournaments / event_info）に合わせる。
const PAGE = { maxAge: 86_400, swr: 604_800, tags: ['news', 'tournaments', 'event_info', 'all'] };

export default defineConfig({
  site: 'https://tcta-site.tcta-admin-worker.workers.dev',

  // EmDash（管理画面・API・最新の内容）はリクエストごとに描くので server 出力。
  // 公開サイトは Cloudflare Workers で動く（docs/emdash.md）。
  output: 'server',
  adapter: cloudflare(),

  // URL は移行前と同じ /about.html の形を保つ（src/pages/*.html.astro）。
  // base は意図的に設定していない。ページ内のリンクをすべて相対パスに保っているため。

  integrations: [
    react(), // EmDash の管理画面が React で動く（公開ページでは使わない）
    emdash({
      database: d1({ binding: 'DB', session: 'auto', coalesce: true }),
      storage: r2({ binding: 'MEDIA' }),
      // 公開ページはキャッシュするので、編集者向けの「編集」ピルは端末側で出す
      toolbar: 'client',
    }),
  ],

  cache: { provider: cacheCloudflare() },
  routeRules: {
    '/': PAGE,
    '/index.html': PAGE,
    '/tournaments.html': PAGE,
    '/results.html': PAGE,
    '/event-[slug].html': PAGE,
    '/result-[id].html': PAGE,
    '/outline-[slug].html': PAGE,
    '/draw-[slug].html': PAGE,
    '/gallery-[id].html': PAGE,
    '/about.html': PAGE,
    '/club.html': PAGE,
    '/lesson.html': PAGE,
    '/tennis-day.html': PAGE,
    '/membership.html': PAGE,
    '/links.html': PAGE,
    '/contact.html': PAGE,
  },

  vite: {
    define: {
      __ASSET_V__: JSON.stringify({ css: assetV('assets/css/style.css'), js: assetV('assets/js/main.js') }),
    },
  },
  devToolbar: { enabled: false },
});
