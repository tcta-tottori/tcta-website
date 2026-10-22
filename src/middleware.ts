// エラー応答（404・500・移行中の 503 など）を Workers Cache に入れない。
// routeRules で公開ページを 1 日キャッシュしているので、これが無いと配備直後に出た
// 一時的なエラーが 1 日残ってしまう。
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (response.status >= 400) context.cache?.set(false);
  return response;
});
