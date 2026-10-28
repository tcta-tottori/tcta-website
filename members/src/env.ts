// Worker のバインディングと設定。秘密は wrangler secret put / .dev.vars で入れる。
export interface Env {
  DB: D1Database;
  BACKUP?: R2Bucket;
  MAIL?: { send(message: unknown): Promise<void> };
  APP_ENV: string;
  APP_NAME: string;
  /** 英字のブランド名（ヘッダー・フッターの文字ロゴ）。特定の協会名は入れない */
  APP_BRAND_EN?: string;
  BASE_URL: string;
  MAIL_FROM?: string;
  /** 公式サイト本体の URL（ヘッダー・フッターのリンク先） */
  SITE_URL?: string;
  /** 最後に登録した年度から何年度で連絡先を消すか（既定 2） */
  CONTACT_RETENTION_YEARS?: string;
  DATA_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export const isProd = (env: Env) => env.APP_ENV === 'production';
/** 公開デモ（誰でも触れる。デモデータ投入・送信箱・Stripe シミュレータ・選択式の事務局ログインが有効） */
export const isDemo = (env: Env) => env.APP_ENV === 'demo';

export function requireSecret(env: Env, name: 'DATA_KEY' | 'STRIPE_WEBHOOK_SECRET'): string {
  const v = env[name];
  if (v) return v;
  if (isProd(env)) throw new Error(`${name} が設定されていません（wrangler secret put ${name}）`);
  // 開発モードだけの既定値。本番では必ず Secrets に入れる。
  return name === 'DATA_KEY' ? 'ZGV2LW9ubHkta2V5LWRvLW5vdC11c2UtaW4tcHJvZC0wMQ==' : 'whsec_dev_only_secret';
}
