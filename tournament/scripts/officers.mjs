// 役員ログイン（Cloudflare Access）の設定と、役員の追加・削除を Cloudflare の API で行う道具。
// Claude Code から使う（.claude/skills/officer-login/SKILL.md）。手元のターミナルからも同じように使える。
//
//   node tournament/scripts/officers.mjs status                     今の設定（チーム・アプリケーション・役員・Worker の設定・公開先の状態）
//   node tournament/scripts/officers.mjs setup --emails a@x.jp,b@y.jp [--team tottori-city-tennis]
//                                                                    はじめの設定（足りないものを作り、Worker に入れる。何度走らせてもよい）。
//                                                                    --team を付けると、Zero Trust のチーム名（ログイン画面のアドレス）を付け替える
//   node tournament/scripts/officers.mjs list                       役員の一覧
//   node tournament/scripts/officers.mjs add a@x.jp [b@y.jp …]      役員を足す
//   node tournament/scripts/officers.mjs remove a@x.jp [b@y.jp …]   役員を外す
//
// 鍵: 環境変数 CLOUDFLARE_API_TOKEN（Claude Code の環境の設定に入れる。README の「役員ログイン」）。
//     必要な権限 … Access: Apps and Policies (Edit) / Access: Organizations, Identity Providers, and Groups (Edit) /
//                   Workers Scripts (Edit)
//     アカウントはトークンから自動で見つける（見つからないときだけ CLOUDFLARE_ACCOUNT_ID を使う）。
//
// 作るもの（Zero Trust → Access で見られる。名前で見分けるので、ダッシュボードで名前を変えないこと）:
//   ログインの方法  「メールのコード（One-time PIN）」
//   ポリシー        「大会運営システム 役員」… Allow。役員のメールアドレス。セッション 1 週間
//   アプリケーション「大会運営システム（役員）」… tcta-tournament.…workers.dev/auth/login だけを守る
//   Worker の秘密   ACCESS_TEAM_DOMAIN・ACCESS_AUD（tcta-tournament に入れる。配備しても消えない）

const API = (process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const WORKER = process.env.TOURNAMENT_WORKER || 'tcta-tournament';
const HOST = process.env.APP_HOST || 'tcta-tournament.tcta-admin-worker.workers.dev';
const APP_URL = process.env.APP_URL || `https://${HOST}`;
const DOMAIN = `${HOST}/auth/login`;
const APP_NAME = '大会運営システム（役員）';
const POLICY_NAME = '大会運営システム 役員';
const SESSION = '168h';
const DEFAULT_TEAM = 'tottori-city-tennis';
const SKIP_LIVE = process.env.SKIP_LIVE_CHECK === '1';

class ApiError extends Error {
  constructor(status, body, path) {
    const first = body?.errors?.[0];
    super(`${status} ${path} ${first ? `${first.code}: ${first.message}` : ''}`.trim());
    this.status = status;
    this.code = first?.code;
  }
}

async function call(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* 本文なし */ }
  if (!res.ok || json?.success === false) throw new ApiError(res.status, json, path);
  return json;
}

async function listAll(path) {
  const rows = [];
  for (let page = 1; page < 50; page++) {
    const json = await call('GET', `${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=50`);
    const got = Array.isArray(json.result) ? json.result : [];
    rows.push(...got);
    const info = json.result_info;
    if (!info || got.length === 0 || page >= (info.total_pages ?? 1)) break;
  }
  return rows;
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

const normEmails = (list) => [...new Set(list.flatMap((s) => String(s).split(/[,\s]+/)).map((s) => s.trim().toLowerCase()).filter(Boolean))];
const badEmails = (list) => list.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

// ---------------------------------------------------------------------------
// アカウント・チーム・ログインの方法・ポリシー・アプリケーション・Worker の秘密
// ---------------------------------------------------------------------------

async function account() {
  if (!TOKEN && !process.env.CF_API_BASE) {
    fail('環境変数 CLOUDFLARE_API_TOKEN がありません。tournament/README.md の「役員ログイン」の手順 1・2 で、Claude Code の環境に入れてから新しいセッションで試してください。');
  }
  try {
    await call('GET', '/user/tokens/verify');
  } catch (e) {
    fail(`Cloudflare の API トークンが使えません（${e.message}）。トークンが正しいか、期限が切れていないか確かめてください。`);
  }
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  let accounts = [];
  try { accounts = await listAll('/accounts'); } catch { /* 下で扱う */ }
  if (accounts.length === 1) return accounts[0].id;
  for (const a of accounts) {
    try {
      const scripts = await listAll(`/accounts/${a.id}/workers/scripts`);
      if (scripts.some((s) => s.id === WORKER)) return a.id;
    } catch { /* 権限の無いアカウント */ }
  }
  fail('Cloudflare のアカウントが見つかりません。環境変数 CLOUDFLARE_ACCOUNT_ID にアカウント ID を入れてください（README の手順 2）。');
}

async function organization(acc, team, create) {
  try {
    return (await call('GET', `/accounts/${acc}/access/organizations`)).result;
  } catch (e) {
    if (e.status === 401 || e.status === 403) fail(`API トークンに Access の権限がありません（${e.message}）。README の手順 1 の権限 3 つが付いているか確かめてください。`);
    if (!create) return null;
  }
  // Zero Trust のチームがまだ無い → 作る
  try {
    const org = (await call('POST', `/accounts/${acc}/access/organizations`, { name: '鳥取市テニス協会', auth_domain: `${team}.cloudflareaccess.com` })).result;
    console.log(`✓ Zero Trust のチームを作りました: ${org.auth_domain}`);
    return org;
  } catch (e) {
    fail(`Zero Trust のチームを作れませんでした（${e.message}）。https://one.dash.cloudflare.com/ を開いて Zero Trust を始め（チーム名を決めて「Free」プランを選ぶ。README の手順 3）、もう一度試してください。チーム名が使われているときは --team で別の名前を指定します。`);
  }
}

async function otpProvider(acc, create) {
  const idps = await listAll(`/accounts/${acc}/access/identity_providers`);
  const found = idps.find((p) => p.type === 'onetimepin');
  if (found || !create) return found ?? null;
  const made = (await call('POST', `/accounts/${acc}/access/identity_providers`, { name: 'メールのコード（One-time PIN）', type: 'onetimepin', config: {} })).result;
  console.log('✓ ログインの方法「メールのコード（One-time PIN）」を作りました');
  return made;
}

async function findPolicy(acc) {
  return (await listAll(`/accounts/${acc}/access/policies`)).find((p) => p.name === POLICY_NAME) ?? null;
}

const policyEmails = (policy) => (policy?.include ?? []).map((r) => r.email?.email).filter(Boolean).map((e) => e.toLowerCase());

/** 役員のメールアドレスでポリシーを書き換える（メール以外の条件はそのまま残す） */
async function savePolicy(acc, policy, emails) {
  const others = (policy?.include ?? []).filter((r) => !r.email);
  const body = { name: POLICY_NAME, decision: 'allow', include: [...emails.map((email) => ({ email: { email } })), ...others], session_duration: SESSION };
  if (body.include.length === 0) fail('役員が 1 人もいなくなります。最後の 1 人は外せません（全員を外すとログインできる人がいなくなるため）。');
  return policy
    ? (await call('PUT', `/accounts/${acc}/access/policies/${policy.id}`, body)).result
    : (await call('POST', `/accounts/${acc}/access/policies`, body)).result;
}

async function findApp(acc) {
  return (await listAll(`/accounts/${acc}/access/apps`)).find((a) => a.domain === DOMAIN || (a.destinations ?? []).some((d) => d.uri === DOMAIN)) ?? null;
}

async function saveApp(acc, app, policyId, otpId) {
  const others = (app?.policies ?? []).filter((p) => p.id && p.id !== policyId).map((p, i) => ({ id: p.id, precedence: i + 2 }));
  const body = {
    name: APP_NAME,
    domain: DOMAIN,
    type: 'self_hosted',
    session_duration: SESSION,
    app_launcher_visible: false,
    ...(otpId ? { allowed_idps: [otpId], auto_redirect_to_identity: true } : {}),
    policies: [{ id: policyId, precedence: 1 }, ...others],
  };
  return app
    ? (await call('PUT', `/accounts/${acc}/access/apps/${app.id}`, body)).result
    : (await call('POST', `/accounts/${acc}/access/apps`, body)).result;
}

async function workerSecretNames(acc) {
  try {
    return (await listAll(`/accounts/${acc}/workers/scripts/${WORKER}/secrets`)).map((s) => s.name);
  } catch (e) {
    if (e.status === 401 || e.status === 403) fail(`Worker（${WORKER}）の設定を読めません（${e.message}）。API トークンに Workers Scripts (Edit) の権限があるか確かめてください。`);
    throw e;
  }
}

async function putSecret(acc, name, text) {
  await call('PUT', `/accounts/${acc}/workers/scripts/${WORKER}/secrets`, { name, text, type: 'secret_text' });
}

/** 公開先が役員ログインを受け付ける状態か（/api/me の mode） */
async function liveMode() {
  if (SKIP_LIVE) return 'skipped';
  try {
    const res = await fetch(`${APP_URL}/api/me`, { headers: { 'Cache-Control': 'no-store' } });
    return (await res.json()).mode ?? `HTTP ${res.status}`;
  } catch (e) {
    return `確かめられない（${e.message}）`;
  }
}

// ---------------------------------------------------------------------------
// コマンド
// ---------------------------------------------------------------------------

async function status() {
  const acc = await account();
  console.log(`アカウント: ${acc}`);
  const org = await organization(acc, DEFAULT_TEAM, false);
  console.log(`Zero Trust のチーム: ${org?.auth_domain ?? '（まだ無い）'}${org ? '（ログイン画面のアドレス。変えるときは setup --team 名前）' : ''}`);
  if (!org) return console.log('\n→ はじめの設定がまだです。setup を実行してください。');
  const otp = await otpProvider(acc, false);
  console.log(`ログインの方法（メールのコード）: ${otp ? 'あり' : '（まだ無い）'}`);
  const policy = await findPolicy(acc);
  const emails = policyEmails(policy);
  console.log(`ポリシー「${POLICY_NAME}」: ${policy ? `役員 ${emails.length} 人` : '（まだ無い）'}`);
  for (const e of emails) console.log(`  - ${e}`);
  const app = await findApp(acc);
  console.log(`アプリケーション「${APP_NAME}」: ${app ? `あり（${DOMAIN}）` : '（まだ無い）'}`);
  const secrets = await workerSecretNames(acc);
  const hasTeam = secrets.includes('ACCESS_TEAM_DOMAIN');
  const hasAud = secrets.includes('ACCESS_AUD');
  console.log(`Worker（${WORKER}）の設定: ACCESS_TEAM_DOMAIN ${hasTeam ? 'あり' : 'なし'} / ACCESS_AUD ${hasAud ? 'あり' : 'なし'}`);
  console.log(`公開先（${APP_URL}）の役員ログイン: ${await liveMode()}  （access なら使える状態）`);
}

async function setup(args) {
  const emails = normEmails(optValue(args, '--emails') ?? []);
  const teamArg = optValue(args, '--team')?.[0]?.replace(/\.cloudflareaccess\.com$/, '').toLowerCase();
  if (teamArg && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(teamArg)) fail(`チーム名に使えるのは英小文字・数字・ハイフンだけです: ${teamArg}`);
  const team = teamArg ?? DEFAULT_TEAM;
  const bad = badEmails(emails);
  if (bad.length) fail(`メールアドレスの形が違います: ${bad.join(', ')}`);
  const acc = await account();
  let org = await organization(acc, team, true);
  // チーム名（ログイン画面のアドレス）を指定されたら、今のものと違えば付け替える。指定が無ければ今のまま
  if (teamArg && org.auth_domain !== `${teamArg}.cloudflareaccess.com`) {
    try {
      org = (await call('PUT', `/accounts/${acc}/access/organizations`, { name: org.name || '鳥取市テニス協会', auth_domain: `${teamArg}.cloudflareaccess.com` })).result;
      console.log(`✓ チーム名を付け替えました（ログイン画面のアドレス）: ${org.auth_domain}`);
    } catch (e) {
      fail(`チーム名を ${teamArg} に付け替えられませんでした（${e.message}）。ほかで使われている名前かもしれません。別の名前で --team を指定してください。`);
    }
  }
  console.log(`✓ Zero Trust のチーム: ${org.auth_domain}（ログイン画面のアドレス）`);
  const otp = await otpProvider(acc, true);
  let policy = await findPolicy(acc);
  if (emails.length) {
    policy = await savePolicy(acc, policy, emails);
    console.log(`✓ ポリシー「${POLICY_NAME}」: 役員 ${emails.length} 人`);
  } else if (!policy) {
    fail('はじめての設定には役員のメールアドレスが要ります（--emails a@x.jp,b@y.jp）。');
  } else {
    console.log(`✓ ポリシー「${POLICY_NAME}」: そのまま（役員 ${policyEmails(policy).length} 人）`);
  }
  const app = await saveApp(acc, await findApp(acc), policy.id, otp?.id);
  if (!app?.aud) fail('アプリケーションの AUD を受け取れませんでした。');
  console.log(`✓ アプリケーション「${APP_NAME}」: ${DOMAIN} だけを守る（セッション 1 週間・メールのコードでログイン）`);
  await putSecret(acc, 'ACCESS_TEAM_DOMAIN', org.auth_domain);
  await putSecret(acc, 'ACCESS_AUD', app.aud);
  console.log(`✓ Worker（${WORKER}）に ACCESS_TEAM_DOMAIN・ACCESS_AUD を入れました（配備しても消えません）`);
  // 秘密を入れると Worker の新しい版が動き出す。行き渡るまで少し待つ
  let mode = await liveMode();
  for (let i = 0; i < 12 && mode !== 'access' && mode !== 'skipped'; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    mode = await liveMode();
  }
  console.log(`✓ 公開先の役員ログイン: ${mode}`);
  if (mode !== 'access' && mode !== 'skipped') fail('公開先がまだ役員ログインを受け付けていません。1〜2 分おいて status で確かめてください。');
  console.log(`\n設定できました。${APP_URL}/data を開き「役員としてログイン」から、登録したメールアドレスで入れます。`);
}

async function listOfficers() {
  const acc = await account();
  const policy = await findPolicy(acc);
  if (!policy) fail('役員のポリシーがまだありません。setup を先に実行してください。');
  const emails = policyEmails(policy);
  console.log(`役員 ${emails.length} 人`);
  for (const e of emails) console.log(`  - ${e}`);
}

async function change(args, mode) {
  const targets = normEmails(args);
  if (!targets.length) fail(`${mode === 'add' ? '足す' : '外す'}メールアドレスを書いてください。`);
  const bad = badEmails(targets);
  if (bad.length) fail(`メールアドレスの形が違います: ${bad.join(', ')}`);
  const acc = await account();
  const policy = await findPolicy(acc);
  if (!policy) fail('役員のポリシーがまだありません。setup を先に実行してください。');
  const now = policyEmails(policy);
  const next = mode === 'add' ? normEmails([...now, ...targets]) : now.filter((e) => !targets.includes(e));
  const missing = mode === 'remove' ? targets.filter((e) => !now.includes(e)) : [];
  if (missing.length) console.log(`（一覧に無いので外せませんでした: ${missing.join(', ')}）`);
  if (next.length === now.length && next.every((e) => now.includes(e))) {
    console.log('変わりはありません。');
  } else {
    await savePolicy(acc, policy, next);
    console.log(`✓ 役員を${mode === 'add' ? '足しました' : '外しました'}（いま ${next.length} 人）`);
  }
  for (const e of next) console.log(`  - ${e}`);
  if (mode === 'remove') console.log('\n外した人がいまログインしている端末は、セッションが切れるまで（最長 1 週間）使えます。すぐに止めたいときは、https://one.dash.cloudflare.com/ の左のメニュー「アクセス」（Access）→「アプリケーション」（Applications）→「大会運営システム（役員）」→「既存のトークンを取り消す」（Revoke existing tokens）を押してください。');
}

function optValue(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const vals = [];
  for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++) vals.push(args[j]);
  return vals;
}

const [cmd, ...rest] = process.argv.slice(2);
const run = { status, setup: () => setup(rest), list: listOfficers, add: () => change(rest, 'add'), remove: () => change(rest, 'remove') }[cmd];
if (!run) {
  console.log('使い方: node tournament/scripts/officers.mjs status | setup --emails a@x.jp,b@y.jp [--team 名前] | list | add <メール…> | remove <メール…>');
  process.exit(cmd ? 1 : 0);
}
run().catch((e) => fail(e.message));
