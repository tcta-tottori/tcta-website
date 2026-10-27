// Worker の入口。会員ポータル / 事務局 / ショップ / API / 開発モードを 1 つの Hono アプリにまとめる。
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import type { Vars } from './app';
import { type Env, isDemo, isProd } from './env';
import { one } from './lib/db';
import { seedDemo } from './seed';
import { readSession } from './lib/session';
import { runJobs } from './jobs';
import { getMember } from './services/members';
import { admin, resolveAdmin } from './routes/admin';
import { api } from './routes/api';
import { dev } from './routes/dev';
import { portal } from './routes/portal';
import { shop } from './routes/shop';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// 全経路 HTTPS（HSTS）・CSP でインラインスクリプト禁止・クリックジャッキング防止（設計書 §7.2, §7.3）
app.use('*', async (c, next) => {
  const turnstile = c.env.TURNSTILE_SITE_KEY ? ' https://challenges.cloudflare.com' : '';
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: turnstile ? ['https://challenges.cloudflare.com'] : ["'none'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      frameSrc: turnstile ? ['https://challenges.cloudflare.com'] : ["'none'"],
      formAction: ["'self'", 'https://checkout.stripe.com'],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
    },
    strictTransportSecurity: isProd(c.env) ? 'max-age=31536000; includeSubDomains' : false,
    referrerPolicy: 'strict-origin-when-cross-origin',
  })(c, next);
});

// Webhook と API 以外のフォーム送信は同一オリジンだけ受け付ける
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/webhooks/')) return next();
  return csrf()(c, next);
});

// BASE_URL が空なら、アクセスされた URL から決める（workers.dev でも独自ドメインでも設定なしで動く）
app.use('*', async (c, next) => {
  if (!c.env.BASE_URL) c.env.BASE_URL = new URL(c.req.url).origin;
  await next();
});

// デモ環境では、最初に誰かがトップを開いたときに空ならデモデータを入れる（空の画面にならないように）
app.use('/', async (c, next) => {
  if (isDemo(c.env) && !(await one(c.env.DB, 'SELECT 1 AS ok FROM associations LIMIT 1'))) await seedDemo(c.env);
  await next();
});

// ログイン状態の解決（会員・事務局）
app.use('*', async (c, next) => {
  c.set('member', null);
  c.set('admin', null);
  if (c.req.path.startsWith('/api/')) return next();
  const memberId = await readSession(c, 'member');
  if (memberId) {
    const m = await getMember(c.env, memberId);
    if (m && m.status !== 'withdrawn') c.set('member', m);
  }
  if (c.req.path.startsWith('/admin') || c.req.path.startsWith('/shop') || c.req.path.startsWith('/dev')) {
    c.set('admin', await resolveAdmin(c));
  }
  await next();
});

// Stripe の Webhook は /webhooks/stripe（api ルータ内）、公開 API は /api/v1/*
app.route('/api', api);
app.route('/webhooks', api);
app.route('/admin', admin);
app.route('/shop', shop);
app.use('/dev/*', async (c, next) => (isProd(c.env) ? c.notFound() : next()));
app.route('/dev', dev);
app.route('/', portal);

app.notFound((c) => c.text('ページが見つかりません', 404));
app.onError((err, c) => {
  console.error(err);
  return c.text(isProd(c.env) ? 'エラーが起きました' : `エラー: ${err.message}`, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runJobs(env));
  },
} satisfies ExportedHandler<Env>;
