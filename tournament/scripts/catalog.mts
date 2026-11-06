// 大会運営のデータベース（worker/catalog.ts）に、Excel やファイルから大会・辞書を入れる道具。Claude Code からも手元からも使う。
// Excel の読み取りは運営画面と同じ処理（src/features/data/*Parser.ts）を使うので、画面で読み込んだときと同じ結果になる。
//
//   node --experimental-strip-types tournament/scripts/catalog.mts list                      大会と辞書の一覧
//   … catalog.mts show <id>                                                                 大会 1 件の中身（JSON）
//   … catalog.mts season <大会日程.xlsx>                                                    年間の大会日程を「日程だけ（planned）」で入れる
//   … catalog.mts draw <ドロー.xlsx> [--id r8-kensen-singles] [--name 正式名] [--courts 16]  ドローを入れて「運営できる（ready）」にする
//   … catalog.mts put <大会.json> [--id …]                                                  JSON をそのまま入れる（AI が作った大会など）
//   … catalog.mts dict <ふりがな.xlsx> [所属.xlsx] [--merge]                                 辞書を入れる（既定は丸ごと置き換え）
//   … catalog.mts status <id> <planned|ready|done>                                          大会の状態を変える
//   … catalog.mts remove <id>
//   … catalog.mts results <id> <結果.json> [--replace] [--source 手描きのドロー表]  試合結果を受け箱に入れる（運営中の端末が取り込む）
//   … catalog.mts results <id>                                                      受け箱の中身を見る
//   … catalog.mts results <id> --clear                                              受け箱を空にする
//      結果.json の形：{ "events": [{ "event": "一般男子シングルス", "matches": [{ "winner": "北畠 史基", "loser": "渕上 雅博", "score": "8-3" }] }] }
//      スコアは勝った人から見た形（8-3、6-1 RET）。不戦勝は "score": "", "note": "W.O"。途中経過（その時点までの結果）でよい
//
// 送信用の鍵は scripts/lib/push.mjs（data.mjs と同じ）。
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import * as XLSX from 'xlsx';
import { parseDrawExcel } from '../src/features/data/drawExcelParser.ts';
import { parseTournamentListExcel } from '../src/features/data/tournamentListParser.ts';
import { drawEntry, seasonEntry } from '../src/features/catalog/fromExcel.ts';
// @ts-expect-error 型の無い .mjs
import { app, fail } from './lib/push.mjs';

process.env.TZ = 'Asia/Tokyo'; // Excel の時刻セルをローカル時刻で読むため（画面と同じ）

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const has = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};

const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

interface Item {
  id: string; name: string; date: string; venue: string; reserveDate: string; reserveVenue: string; category: string;
  status: string; events: { name: string; players: number }[]; players: number; updatedAt: string; updatedBy: string; note: string;
}

async function catalog(): Promise<{ tournaments: Item[]; dict: { players: number; affiliations: number; version: string } }> {
  return app('GET', '/api/catalog');
}

async function put(id: string, body: unknown) {
  return app('PUT', `/api/catalog/${id}`, { json: body });
}

const [cmd, ...rest] = args;

if (cmd === 'list') {
  const c = await catalog();
  console.log(`辞書: 選手 ${c.dict.players} 人・所属 ${c.dict.affiliations} 件（${c.dict.version || 'まだありません'}）\n`);
  const label: Record<string, string> = { planned: '日程だけ', ready: '運営できる', done: '終了' };
  for (const t of c.tournaments) {
    console.log(`${t.date || '----------'}  ${t.id.padEnd(22)} ${(label[t.status] ?? t.status).padEnd(6)} ${t.name}${t.players ? `（${t.events.length} 種目・${t.players} 人）` : ''}`);
  }
} else if (cmd === 'show') {
  console.log(JSON.stringify(await app('GET', `/api/catalog/${rest[0]}`), null, 2));
} else if (cmd === 'season') {
  const file = rest[0] ?? fail('大会日程の Excel を指定してください');
  const list = parseTournamentListExcel(toArrayBuffer(await readFile(file)));
  const existing = new Map((await catalog()).tournaments.map((t) => [t.id, t]));
  let n = 0;
  for (const t of list) {
    const { id, body } = seasonEntry(t, basename(file));
    const cur = existing.get(id);
    if (cur && cur.status !== 'planned') { console.log(`- ${id} はドローが入っているのでそのまま（${cur.name}）`); continue; }
    await put(id, body);
    console.log(`✓ ${body.date || '日付なし'}  ${id}  ${body.name}`);
    n++;
  }
  console.log(`\n${n} 件を入れました`);
} else if (cmd === 'draw') {
  const idArg = flag('id');
  const nameArg = flag('name');
  const courts = Number(flag('courts') ?? '0');
  const file = rest[0] ?? fail('ドローの Excel を指定してください');
  const parsed = parseDrawExcel(toArrayBuffer(await readFile(file)), basename(file));
  if (parsed.events.length === 0) fail('ドローの種目が読み取れませんでした（運営画面の「Excel から取り込む」で読めるか確かめてください）');
  const { tournaments } = await catalog();
  const { id, body, matched } = drawEntry(parsed, tournaments as never, { id: idArg, name: nameArg, courts, sourceName: basename(file) });
  const r = await put(id, body);
  console.log(`✓ ${r.id}  ${r.name}（${r.date}）: ${r.events.map((e: { name: string; players: number }) => `${e.name} ${e.players}人`).join(' / ')}`);
  if (!matched) console.log('  （大会日程に同じ日の大会が無かったので、新しく作りました。id を合わせるときは --id を付けて入れ直してください）');
} else if (cmd === 'put') {
  const idArg = flag('id');
  const file = rest[0] ?? fail('大会の JSON を指定してください');
  const body = JSON.parse(await readFile(file, 'utf8'));
  const id = idArg ?? body.id ?? fail('id が要ります（--id か JSON の id）');
  const r = await put(id, body);
  console.log(`✓ ${r.id}  ${r.name}（${r.status}）`);
} else if (cmd === 'dict') {
  const merge = has('merge');
  const [furiFile, affFile] = rest;
  if (!furiFile) fail('ふりがな一覧の Excel を指定してください');
  const rows = (f: string) => readFile(f).then((b) => {
    const wb = XLSX.read(b, { type: 'buffer' });
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  });
  const players = (await rows(furiFile)).map((r) => ({
    name: String(r['氏名'] ?? r['選手名'] ?? r['name'] ?? '').trim(),
    furigana: String(r['ふりがな'] ?? r['furigana'] ?? '').trim(),
    affiliation: String(r['所属'] ?? '').trim(),
    note: String(r['確認メモ'] ?? r['メモ'] ?? '').trim(),
  })).filter((p) => p.name && p.furigana);
  const affiliations = affFile
    ? (await rows(affFile)).map((r) => ({ name: String(r['所属名'] ?? r['name'] ?? '').trim(), furigana: String(r['ふりがな'] ?? '').trim() })).filter((a) => a.name && a.furigana)
    : undefined;
  const r = await app('PUT', '/api/dict', { json: { mode: merge ? 'merge' : 'replace', players, ...(affiliations ? { affiliations } : {}) } });
  console.log(`✓ 辞書: 選手 ${r.total.players} 人・所属 ${r.total.affiliations} 件（${merge ? '足した' : '置き換えた'}）`);
} else if (cmd === 'status') {
  const [id, status] = rest;
  const t = await app('GET', `/api/catalog/${id}`);
  const r = await put(id, { ...t, status });
  console.log(`✓ ${r.id} を ${r.status} にしました`);
} else if (cmd === 'results') {
  const id = rest[0] ?? fail('大会の id を指定してください（catalog.mts list で見られます）');
  const source = flag('source');
  if (has('clear')) {
    await app('DELETE', `/api/catalog/${id}/results`);
    console.log(`✓ ${id} の受け箱を空にしました`);
  } else if (rest[1]) {
    const doc = JSON.parse(await readFile(rest[1], 'utf8'));
    const mode = has('replace') ? 'replace' : 'merge';
    const r = await app('PUT', `/api/catalog/${id}/results`, { json: { ...doc, mode, ...(source ? { source } : {}) } });
    console.log(`✓ ${r.received} 試合の結果を入れました（受け箱の合計 ${r.total} 試合・${r.version}）。運営中の端末は 20 秒ほどで取り込みます`);
  } else {
    const doc = await app('GET', `/api/catalog/${id}/results`);
    if (!doc.events?.length) console.log('受け箱は空です');
    for (const e of doc.events ?? []) {
      console.log(`■ ${e.event}（${e.matches.length} 試合）`);
      for (const m of e.matches) console.log(`   ${m.winner} が ${m.loser} に ${m.score || ''}${m.note ? ` ${m.note}` : ''}`);
    }
  }
} else if (cmd === 'remove') {
  await app('DELETE', `/api/catalog/${rest[0]}`);
  console.log(`✓ ${rest[0]} を消しました`);
} else {
  console.log('使い方: node --experimental-strip-types tournament/scripts/catalog.mts list | show <id> | season <大会日程.xlsx> | draw <ドロー.xlsx> [--id] [--name] [--courts] | put <大会.json> [--id] | dict <ふりがな.xlsx> [所属.xlsx] [--merge] | status <id> <planned|ready|done> | remove <id> | results <id> [結果.json] [--replace] [--clear]');
}
