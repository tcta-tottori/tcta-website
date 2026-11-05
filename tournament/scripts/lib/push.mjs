// 大会運営システムの Worker へ外からデータを送るときの共通部分（scripts/data.mjs・scripts/catalog.mts）。
//   送信用の鍵: 環境変数 DATA_PUSH_TOKEN があればそれを使う。無ければ新しく作り、SHA-256 を Worker の秘密
//   DATA_PUSH_TOKEN_SHA256 に入れてから使う（前の鍵は使えなくなる）。Cloudflare の API トークン（Workers Scripts: Edit）が要る。
import { createHash, randomBytes } from 'node:crypto';

const API = (process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const WORKER = process.env.TOURNAMENT_WORKER || 'tcta-tournament';
export const APP_URL = (process.env.APP_URL || 'https://tcta-tournament.tcta-admin-worker.workers.dev').replace(/\/$/, '');

export function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function cf(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (CF_TOKEN) headers.Authorization = `Bearer ${CF_TOKEN}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    const first = json?.errors?.[0];
    const err = new Error(`${res.status} ${path} ${first ? `${first.code}: ${first.message}` : ''}`.trim());
    err.status = res.status;
    throw err;
  }
  return json;
}

async function account() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  try {
    const { result } = await cf('GET', '/accounts?per_page=50');
    if (result.length === 1) return result[0].id;
    for (const a of result) {
      try {
        const s = await cf('GET', `/accounts/${a.id}/workers/scripts`);
        if (s.result.some((x) => x.id === WORKER)) return a.id;
      } catch { /* 権限の無いアカウント */ }
    }
  } catch (e) {
    fail(`Cloudflare の API トークンが使えません（${e.message}）。tournament/README.md の「役員ログイン」の手順 1・2 でトークンを入れてください。`);
  }
  fail('Cloudflare のアカウントが見つかりません。環境変数 CLOUDFLARE_ACCOUNT_ID にアカウント ID を入れてください。');
}

/** 新しい送信用の鍵を作り、Worker に入れる。入れた鍵を返す */
export async function issueToken() {
  const token = `tcta_push_${randomBytes(24).toString('base64url')}`;
  const hash = createHash('sha256').update(token).digest('hex');
  const acc = await account();
  try {
    await cf('PUT', `/accounts/${acc}/workers/scripts/${WORKER}/secrets`, { name: 'DATA_PUSH_TOKEN_SHA256', text: hash, type: 'secret_text' });
  } catch (e) {
    fail(`Worker（${WORKER}）に送信用の鍵を入れられません（${e.message}）。API トークンに Workers Scripts (Edit) の権限があるか確かめてください。`);
  }
  // 秘密の反映には数秒かかり、Cloudflare の拠点ごとに少しずれる。続けて 5 回通ったら使う
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${APP_URL}/api/data/files`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 503) fail('Worker にデータベース（DATA）がまだありません。配備（GitHub Actions の Deploy tournament app）が終わってから試してください。');
    streak = res.ok ? streak + 1 : 0;
    if (streak >= 5) return token;
    await new Promise((r) => setTimeout(r, res.ok ? 300 : 2000));
  }
  fail('送信用の鍵を入れましたが、公開先がまだ受け付けません。少し待ってからもう一度試してください。');
}

let tokenPromise = null;
function pushToken() {
  tokenPromise ??= process.env.DATA_PUSH_TOKEN ? Promise.resolve(process.env.DATA_PUSH_TOKEN) : issueToken();
  return tokenPromise;
}

export async function app(method, path, { body, type, json: payload } = {}) {
  if (payload !== undefined) { body = JSON.stringify(payload); type = 'application/json'; }
  const headers = { Authorization: `Bearer ${await pushToken()}` };
  if (type) headers['Content-Type'] = type;
  // 鍵を入れ替えた直後は、拠点によってまだ古い鍵で断られることがあるので、少し待って送り直す
  let res;
  for (let i = 0; i < 5; i++) {
    res = await fetch(`${APP_URL}${path}`, { method, headers, body });
    if (res.status !== 401) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) fail(`${method} ${path} が失敗しました（${res.status} ${json?.error ?? ''}）`);
  return json;
}

