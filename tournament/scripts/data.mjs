// 大会データ（Cloudflare D1。worker/data.ts）を外から送る・見る・消す道具。Claude Code からも、手元のターミナルからも使う。
//
//   node tournament/scripts/data.mjs list [種類]                  置いてあるファイルの一覧
//   node tournament/scripts/data.mjs push <種類> <ファイル…>        ファイルを送る（同じ種類・同じ名前があれば上書き）
//   node tournament/scripts/data.mjs remove <種類> <名前…>         ファイルを消す
//   node tournament/scripts/data.mjs token                         外の仕組み用に、送信用の鍵を新しく作って 1 度だけ表示する
//
// 種類: tournament（大会一覧＝大会日程表とドロー Excel）/ schedule（時間割）/ furigana（ふりがな一覧）/
//       affiliation（所属一覧）/ backup（バックアップ JSON）/ result（大会結果）
//
// 送信用の鍵:
//   ・環境変数 DATA_PUSH_TOKEN があれば、それを使う（token で作った鍵）
//   ・無ければ、その場で新しい鍵を作り、SHA-256 を Worker の秘密 DATA_PUSH_TOKEN_SHA256 に入れてから使う
//     （前の鍵は使えなくなる）。秘密を入れるのに Cloudflare の API トークン（Workers Scripts: Edit）が要る。
//     トークンは officers.mjs と同じく、Claude Code の「ネットワークの秘密」か環境変数 CLOUDFLARE_API_TOKEN
// 鍵そのものは Cloudflare にもリポジトリにも置かない（Worker には SHA-256 だけ）。
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const API = (process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const WORKER = process.env.TOURNAMENT_WORKER || 'tcta-tournament';
const APP_URL = (process.env.APP_URL || 'https://tcta-tournament.tcta-admin-worker.workers.dev').replace(/\/$/, '');
const KINDS = {
  tournament: '大会一覧（大会日程表・ドロー Excel）',
  schedule: '時間割',
  furigana: 'ふりがな一覧',
  affiliation: '所属一覧',
  backup: 'バックアップ',
  result: '大会結果',
};
const MIME = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function fail(msg) {
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
async function issueToken() {
  const token = `tcta_push_${randomBytes(24).toString('base64url')}`;
  const hash = createHash('sha256').update(token).digest('hex');
  const acc = await account();
  try {
    await cf('PUT', `/accounts/${acc}/workers/scripts/${WORKER}/secrets`, { name: 'DATA_PUSH_TOKEN_SHA256', text: hash, type: 'secret_text' });
  } catch (e) {
    fail(`Worker（${WORKER}）に送信用の鍵を入れられません（${e.message}）。API トークンに Workers Scripts (Edit) の権限があるか確かめてください。`);
  }
  // 秘密の反映には数秒かかる
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${APP_URL}/api/data/files`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return token;
    if (res.status === 503) fail('Worker にデータベース（DATA）がまだありません。配備（GitHub Actions の Deploy tournament app）が終わってから試してください。');
    await new Promise((r) => setTimeout(r, 2000));
  }
  fail('送信用の鍵を入れましたが、公開先がまだ受け付けません。少し待ってからもう一度試してください。');
}

let tokenPromise = null;
function pushToken() {
  tokenPromise ??= process.env.DATA_PUSH_TOKEN ? Promise.resolve(process.env.DATA_PUSH_TOKEN) : issueToken();
  return tokenPromise;
}

async function app(method, path, { body, type } = {}) {
  const headers = { Authorization: `Bearer ${await pushToken()}` };
  if (type) headers['Content-Type'] = type;
  const res = await fetch(`${APP_URL}${path}`, { method, headers, body });
  const json = await res.json().catch(() => null);
  if (!res.ok) fail(`${method} ${path} が失敗しました（${res.status} ${json?.error ?? ''}）`);
  return json;
}

function kindOf(k) {
  if (!(k in KINDS)) fail(`種類は ${Object.keys(KINDS).join(' / ')} のどれかです（${k ?? '指定なし'}）`);
  return k;
}

const kb = (n) => `${(Number(n) / 1024).toFixed(1)} KB`;
const when = (iso) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

async function list(kind) {
  const q = kind ? `?kind=${kindOf(kind)}` : '';
  const { files } = await app('GET', `/api/data/files${q}`);
  if (files.length === 0) return console.log(kind ? `${KINDS[kind]}: （まだありません）` : '（まだ何もありません）');
  let last = '';
  for (const f of files) {
    if (f.kind !== last) { console.log(`\n${KINDS[f.kind] ?? f.kind}（${f.kind}）`); last = f.kind; }
    console.log(`  - ${f.name}  ${kb(f.size)}  ${when(f.modifiedTime)}  ${f.updatedBy}`);
  }
}

async function push(kind, paths) {
  kindOf(kind);
  if (paths.length === 0) fail('送るファイルを指定してください');
  for (const p of paths) {
    const data = await readFile(p).catch(() => fail(`ファイルを読めません: ${p}`));
    const name = basename(p);
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    const { file } = await app('PUT', `/api/data/files?kind=${kind}&name=${encodeURIComponent(name)}`, { body: data, type: MIME[ext] ?? 'application/octet-stream' });
    console.log(`✓ ${KINDS[kind]} に「${file.name}」を置きました（${kb(file.size)}）`);
  }
}

async function remove(kind, names) {
  kindOf(kind);
  const { files } = await app('GET', `/api/data/files?kind=${kind}`);
  for (const n of names) {
    const f = files.find((x) => x.name === n);
    if (!f) { console.log(`- 「${n}」は ${KINDS[kind]} にありません`); continue; }
    await app('DELETE', `/api/data/files/${encodeURIComponent(f.id)}`);
    console.log(`✓ ${KINDS[kind]} から「${n}」を消しました`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'list') await list(args[0]);
else if (cmd === 'push') await push(args[0], args.slice(1));
else if (cmd === 'remove') await remove(args[0], args.slice(1));
else if (cmd === 'token') {
  const t = await issueToken();
  console.log('送信用の鍵（この 1 回だけ表示します。前の鍵は使えなくなりました）:');
  console.log(t);
  console.log(`\n送り方: curl -X PUT "${APP_URL}/api/data/files?kind=schedule&name=時間割.xlsx" -H "Authorization: Bearer <鍵>" --data-binary @時間割.xlsx`);
} else {
  console.log('使い方: node tournament/scripts/data.mjs list [種類] | push <種類> <ファイル…> | remove <種類> <名前…> | token');
  console.log(`種類: ${Object.entries(KINDS).map(([k, v]) => `${k}（${v}）`).join(' / ')}`);
}
