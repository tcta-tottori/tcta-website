// 役員ログイン（Cloudflare Access）の設定を、Cloudflare の API でそろえる（配備のたびに GitHub Actions が走らせる）。
//
// すること（何度走らせても同じ結果になる）:
//   1. Zero Trust のチーム（ログイン画面のドメイン xxx.cloudflareaccess.com）を確かめる
//   2. ログインの方法「メールのコード（One-time PIN）」が無ければ作る
//   3. 役員の一覧（OFFICER_EMAILS）から、許可のポリシー「大会運営システム 役員」を作る・書き換える
//   4. ログインの入口 /auth/login だけを守るアプリケーション「大会運営システム（役員）」を作る・書き換える（セッション 1 週間）
//   5. Worker に渡すチームのドメインと AUD を GitHub Actions の出力（team / aud）に書く
//
// 必要なもの:
//   CLOUDFLARE_API_TOKEN … 次の権限を足したトークン（配備に使っているものに足せばよい）
//       Account → Access: Apps and Policies → Edit
//       Account → Access: Organizations, Identity Providers, and Groups → Edit
//   CLOUDFLARE_ACCOUNT_ID
//   OFFICER_EMAILS       … 役員のメールアドレス（カンマ区切り）。無ければポリシーには手を付けない（ダッシュボードで決めたものを残す）
//   APP_HOST             … 守る Worker のホスト名（既定 tcta-tournament.tcta-admin-worker.workers.dev）
//
// 失敗しても配備は止めない（設定が無ければ Worker は運営の操作をすべて断るので、閉じた側のまま）。
// 公開リポジトリの Actions のログは誰でも読めるので、メールアドレスはログに出さない（件数だけ）。
import { appendFileSync } from 'node:fs';

const API = (process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const HOST = process.env.APP_HOST || 'tcta-tournament.tcta-admin-worker.workers.dev';
// 守るのはログインの入口だけ（ログアウトや観戦ページは Access を通さない）
const DOMAIN = `${HOST}/auth/login`;
const APP_NAME = '大会運営システム（役員）';
const POLICY_NAME = '大会運営システム 役員';
const SESSION = '168h'; // 1 週間。大会の途中でログインが切れないように
const emails = [...new Set((process.env.OFFICER_EMAILS || '').split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+$/.test(s)))];

function out(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function note(msg) { console.log(msg); }
function warn(msg) { console.log(`::warning::${msg}`); }

class ApiError extends Error {
  constructor(status, body) {
    const first = body?.errors?.[0];
    super(`${status} ${first ? `${first.code}: ${first.message}` : JSON.stringify(body).slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

async function api(method, path, body) {
  const res = await fetch(`${API}/accounts/${ACCOUNT}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* 本文なし */ }
  if (!res.ok || json?.success === false) throw new ApiError(res.status, json);
  return json;
}

/** 一覧の API をすべてのページぶん読む */
async function list(path) {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const json = await api('GET', `${path}${sep}page=${page}&per_page=100`);
    const rows = json.result ?? [];
    all.push(...rows);
    const info = json.result_info;
    if (!info || rows.length === 0 || page >= (info.total_pages ?? 1)) break;
  }
  return all;
}

async function main() {
  if (!TOKEN || !ACCOUNT) {
    warn('CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID が無いので、役員ログインの設定はしません。');
    return;
  }

  // 1. Zero Trust のチーム
  let org;
  try {
    org = (await api('GET', '/access/organizations')).result;
  } catch (e) {
    if (e.status === 403 || e.status === 401) {
      warn('API トークンに Access の権限がありません。tournament/README.md の「役員ログイン」の手順 2（トークンに権限を足す）をしてください。役員ログインは未設定のままです。');
    } else {
      warn(`Zero Trust がまだ始まっていないようです（${e.message}）。tournament/README.md の「役員ログイン」の手順 1 をしてください。役員ログインは未設定のままです。`);
    }
    return;
  }
  const team = org?.auth_domain;
  if (!team) {
    warn('Zero Trust のチームのドメインが分かりません。ダッシュボードでチーム名を決めてください。');
    return;
  }
  note(`Zero Trust のチーム: ${team}`);

  // 2. ログインの方法（メールのコード）
  let otpId = null;
  try {
    const idps = await list('/access/identity_providers');
    otpId = idps.find((p) => p.type === 'onetimepin')?.id ?? null;
    if (!otpId) {
      otpId = (await api('POST', '/access/identity_providers', { name: 'メールのコード（One-time PIN）', type: 'onetimepin', config: {} })).result.id;
      note('ログインの方法「メールのコード（One-time PIN）」を作りました');
    }
  } catch (e) {
    warn(`ログインの方法を確かめられませんでした（${e.message}）。ダッシュボードの設定のまま使います。`);
  }

  // 3. 役員の許可のポリシー
  let policyId = null;
  const policies = await list('/access/policies');
  const existingPolicy = policies.find((p) => p.name === POLICY_NAME);
  if (emails.length > 0) {
    const body = { name: POLICY_NAME, decision: 'allow', include: emails.map((email) => ({ email: { email } })), session_duration: SESSION };
    if (existingPolicy) {
      policyId = (await api('PUT', `/access/policies/${existingPolicy.id}`, body)).result.id;
      note(`ポリシー「${POLICY_NAME}」を役員 ${emails.length} 人で書き換えました`);
    } else {
      policyId = (await api('POST', '/access/policies', body)).result.id;
      note(`ポリシー「${POLICY_NAME}」を役員 ${emails.length} 人で作りました`);
    }
  } else if (existingPolicy) {
    policyId = existingPolicy.id;
    note(`OFFICER_EMAILS が無いので、ポリシー「${POLICY_NAME}」はダッシュボードで決めたまま使います`);
  } else {
    warn('OFFICER_EMAILS（役員のメールアドレス）が無く、ポリシーもまだありません。GitHub の Secrets に OFFICER_EMAILS を入れてください。それまでは誰もログインできません。');
  }

  // 4. ログインの入口だけを守るアプリケーション
  const apps = await list('/access/apps');
  const existingApp = apps.find((a) => a.domain === DOMAIN || (a.destinations ?? []).some((d) => d.uri === DOMAIN));
  const appBody = {
    name: APP_NAME,
    domain: DOMAIN,
    type: 'self_hosted',
    session_duration: SESSION,
    app_launcher_visible: false,
    ...(otpId ? { allowed_idps: [otpId], auto_redirect_to_identity: true } : {}),
    policies: policyId ? [{ id: policyId, precedence: 1 }] : [],
  };
  let app;
  if (existingApp) {
    // ダッシュボードで足した別のポリシーは残し、役員のポリシーを先頭に置く
    const others = (existingApp.policies ?? []).filter((p) => p.id && p.id !== policyId).map((p, i) => ({ id: p.id, precedence: i + 2 }));
    app = (await api('PUT', `/access/apps/${existingApp.id}`, { ...appBody, policies: [...appBody.policies, ...others] })).result;
    note(`アプリケーション「${APP_NAME}」（${DOMAIN}）を書き換えました`);
  } else {
    app = (await api('POST', '/access/apps', appBody)).result;
    note(`アプリケーション「${APP_NAME}」（${DOMAIN}）を作りました`);
  }
  if (!app?.aud) {
    warn('アプリケーションの AUD が分かりませんでした。');
    return;
  }

  // 5. Worker に渡す
  out('team', team);
  out('aud', app.aud);
  note('役員ログインの設定ができました。Worker にチームのドメインと AUD を渡します。');
}

main().catch((e) => {
  warn(`役員ログインの設定に失敗しました（${e.message}）。役員ログインは前の設定のまま（無ければ未設定）です。`);
});
