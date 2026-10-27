// 事務局画面の認証。本番は Cloudflare Access が手前にあり、Access が付ける JWT（Cf-Access-Jwt-Assertion）を
// 検証してメールアドレスを取り出す。開発モード（CF_ACCESS_* が無い）は /admin/login の選択式ログインで代用。
import type { Env } from '../env';

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
const certCache = new Map<string, { at: number; keys: Jwk[] }>();

function b64urlToBytes(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export function accessEnabled(env: Env): boolean {
  return Boolean(env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD);
}

/** JWT を検証して email を返す。失敗したら null。 */
export async function verifyAccessJwt(env: Env, jwt: string | undefined): Promise<string | null> {
  if (!jwt || !accessEnabled(env)) return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if (header.alg !== 'RS256') return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  const aud: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.CF_ACCESS_AUD!)) return null;

  const certsUrl = `https://${env.CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`;
  let cached = certCache.get(certsUrl);
  if (!cached || Date.now() - cached.at > 60 * 60 * 1000) {
    const res = await fetch(certsUrl);
    if (!res.ok) return null;
    const body = (await res.json()) as { keys: Jwk[] };
    cached = { at: Date.now(), keys: body.keys };
    certCache.set(certsUrl, cached);
  }
  const jwk = cached.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) return null;
  return typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
}
