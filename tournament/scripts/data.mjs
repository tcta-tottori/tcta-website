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
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { APP_URL, app, fail, issueToken } from './lib/push.mjs';

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
