// Worker の入口。EmDash の定期処理（予約公開・保守）とプラグイン用の橋渡しを束ねる。
//
// www 付きのアドレス（www.tottori-city-tennis.com）は、ここで www 無しへ恒久的に転送する（301）。
// ページの保存（Workers Cache）より手前で返さないと、保存済みのページが www のまま返ってしまうため、
// Astro（src/middleware.ts）ではなく、いちばん入口のここで行う。
import handler, { createScheduledHandler, PluginBridge } from '@emdash-cms/cloudflare/worker';

export { PluginBridge };

const CANONICAL_HOST = 'tottori-city-tennis.com';

export default {
  ...handler,
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return new Response(null, { status: 301, headers: { location: url.href, 'cache-control': 'public, max-age=86400' } });
    }
    return handler.fetch!(request, env, ctx);
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
