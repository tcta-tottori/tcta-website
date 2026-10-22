// Worker の入口。EmDash の定期処理（予約公開・保守）とプラグイン用の橋渡しを束ねる。
import handler, { createScheduledHandler, PluginBridge } from '@emdash-cms/cloudflare/worker';

export { PluginBridge };

export default {
  ...handler,
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
