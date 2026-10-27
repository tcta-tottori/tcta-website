// 列暗号化（AES-256-GCM）・盲検索インデックス（HMAC）・トークン生成。
// 鍵は Secrets の DATA_KEY（32 バイトの base64）。DB のダンプが漏れても住所・電話・メールは読めない。
import { type Env, requireSecret } from '../env';

const te = new TextEncoder();
const td = new TextDecoder();
const keyCache = new Map<string, Promise<{ aes: CryptoKey; mac: CryptoKey }>>();

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function b64url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function keys(env: Env) {
  const raw = requireSecret(env, 'DATA_KEY');
  let p = keyCache.get(raw);
  if (!p) {
    p = (async () => {
      let bytes = b64ToBytes(raw);
      if (bytes.length !== 32) {
        // 長さが違う鍵は SHA-256 で 32 バイトにそろえる（設定ミスでも動作はするが、本番は 32 バイトを推奨）
        bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      }
      const aes = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      const macRaw = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('index:' + raw)));
      const mac = await crypto.subtle.importKey('raw', macRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return { aes, mac };
    })();
    keyCache.set(raw, p);
  }
  return p;
}

/** 平文 → "v1:<iv>:<暗号文>"。null/空文字は null のまま。 */
export async function encrypt(env: Env, plain: string | null | undefined): Promise<string | null> {
  if (plain === null || plain === undefined || plain === '') return null;
  const { aes } = await keys(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, te.encode(plain)));
  return `v1:${bytesToB64(iv)}:${bytesToB64(ct)}`;
}

export async function decrypt(env: Env, blob: string | null | undefined): Promise<string | null> {
  if (!blob) return null;
  const [v, ivB64, ctB64] = blob.split(':');
  if (v !== 'v1' || !ivB64 || !ctB64) return null;
  const { aes } = await keys(env);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(ivB64) }, aes, b64ToBytes(ctB64));
    return td.decode(pt);
  } catch {
    return null;
  }
}

/** メールアドレスなど暗号化した列を検索するための盲検索インデックス（HMAC-SHA256）。 */
export async function blindIndex(env: Env, value: string): Promise<string> {
  const { mac } = await keys(env);
  const sig = await crypto.subtle.sign('HMAC', mac, te.encode(value.trim().toLowerCase()));
  return hex(new Uint8Array(sig));
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s))));
}

export async function hmacHex(secret: string, s: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(s))));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
