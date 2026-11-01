// 公開ページの応答に手を入れる。
//
// ■ エラー応答をキャッシュしない
//   routeRules で公開ページを 1 日キャッシュしているので、これが無いと配備直後に出た
//   一時的なエラー（404・500・移行中の 503 など）が 1 日残ってしまう。
//
// ■ www 付きのアドレスは www 無しへ移す（301）
//   主な転送は src/worker.ts（保存済みのページより手前）で行う。ここは念のための二重の備え。
//
// ■ 位置情報を自サイトで使えるようにする
//   EmDash は応答に Permissions-Policy（geolocation=() ＝ 位置情報を全面禁止）を「無ければ」付ける。
//   トップのコート案内の地図に「現在地」ボタンがあるので、公開ページでは自サイト（self）だけ許可した値を先に付けておく。
//   管理画面（/_emdash/）は EmDash の値のまま。
import { defineMiddleware } from 'astro:middleware';

const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(self), payment=()';

const CANONICAL_HOST = 'tottori-city-tennis.com';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.hostname === `www.${CANONICAL_HOST}`) {
    const to = new URL(context.url);
    to.hostname = CANONICAL_HOST;
    return new Response(null, { status: 301, headers: { location: to.href, 'cache-control': 'no-store' } });
  }
  const response = await next();
  if (response.status >= 400) context.cache?.set(false);
  if (!context.url.pathname.startsWith('/_emdash')) {
    try { response.headers.set('Permissions-Policy', PERMISSIONS_POLICY); } catch { /* 変更できない応答（静的ファイルなど）はそのまま */ }
  }
  return response;
});
