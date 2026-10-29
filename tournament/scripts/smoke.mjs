// 動作確認：中継（Durable Object）と API を、起動中の Worker に対して一通り試す。
//   npm run preview      … 別のターミナルで（ビルドして wrangler dev。http://localhost:8787）
//   npm test             … このスクリプト（BASE=https://… を付ければ配備先にも使える）
// 確かめること:
//   1. アプリ本体と SPA の URL（/view/league）が返る
//   2. 運営端末が預けた大会データが、あとから入った観戦端末にすぐ届く（運営端末が切れていても）
//   3. 運営端末の変更が観戦端末へ流れる
//   4. 観戦端末からは大会データの変更を流せない（データの要求だけ流せる）
//   5. ping に pong が返る
//   6. 音声コールの中継は他のサイトから使えない
const BASE = (process.env.BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const ROOM = 'SMOKE' + Math.random().toString(36).slice(2, 6).toUpperCase();

let failed = 0;
const ok = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(viewer) {
  const ws = new WebSocket(`${WS}?room=${ROOM}`);
  const inbox = [];
  ws.addEventListener('message', (e) => inbox.push(JSON.parse(e.data)));
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ action: 'join', roomCode: ROOM, viewer }));
      resolve({ ws, inbox, send: (o) => ws.send(JSON.stringify(o)) });
    });
    ws.addEventListener('error', reject);
  });
}
const msg = (type, payload, deviceId = 'op-1') => ({ type, deviceId, deviceName: deviceId, roomCode: ROOM, timestamp: Date.now(), payload });

// 1. 静的ファイルと SPA
{
  const r = await fetch(BASE + '/');
  ok(r.ok && (await r.text()).includes('<div id="root">'), 'アプリ本体（/）が返る');
  const v = await fetch(BASE + '/view/league', { headers: { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' } });
  ok(v.ok && (await v.text()).includes('<div id="root">'), '観戦ページの URL（/view/league）でもアプリが返る');
  const h = await (await fetch(BASE + '/api/health')).json();
  ok(h.ok === true, '/api/health');
  const refused = await new Promise((resolve) => {
    const ws = new WebSocket(`${WS}?room=bad%20room`);
    ws.addEventListener('open', () => { ws.close(); resolve(false); });
    ws.addEventListener('error', () => resolve(true));
  });
  ok(refused, 'ルームコードの形が不正なら断る');
}

// 2〜5. 中継
{
  const op = await client(false);
  const snapshot = msg('snapshot-response', { dexie: [{ table: 'tournaments', rows: [{ id: 1, name: 'スモーク大会' }] }], zustand: [] });
  op.send({ action: 'cache', roomCode: ROOM, payload: snapshot });
  await sleep(300);
  op.ws.close();
  await sleep(300);

  const viewer = await client(true);
  await sleep(500);
  ok(viewer.inbox.some((m) => m.type === 'snapshot-response' && m.payload?.dexie?.[0]?.rows?.[0]?.name === 'スモーク大会'),
    '運営端末が切れたあとでも、観戦端末に預けた大会データが届く');

  const op2 = await client(false);
  await sleep(200);
  op2.send({ action: 'broadcast', roomCode: ROOM, payload: msg('dexie-change', { table: 'matches', operation: 'update', key: 1, modifications: { score: '6-4' } }) });
  await sleep(400);
  ok(viewer.inbox.some((m) => m.type === 'dexie-change' && m.payload?.modifications?.score === '6-4'), '運営端末の変更が観戦端末へ流れる');

  viewer.send({ action: 'broadcast', roomCode: ROOM, payload: msg('dexie-change', { table: 'matches', operation: 'delete', key: 1 }, 'viewer-1') });
  viewer.send({ action: 'broadcast', roomCode: ROOM, payload: msg('request-snapshot', null, 'viewer-1') });
  await sleep(400);
  ok(!op2.inbox.some((m) => m.type === 'dexie-change' && m.deviceId === 'viewer-1'), '観戦端末からの変更は運営端末へ流れない');
  ok(op2.inbox.some((m) => m.type === 'request-snapshot' && m.deviceId === 'viewer-1'), '観戦端末からのデータ要求は運営端末へ届く');

  const before = op2.inbox.length;
  op2.ws.send('{"action":"ping"}');
  await sleep(300);
  ok(op2.inbox.slice(before).some((m) => m.action === 'pong'), 'ping に pong が返る');

  viewer.ws.close();
  op2.ws.close();
}

// 6. 音声コールの中継
{
  const cross = await fetch(BASE + '/api/gemini-tts', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: '{"text":"テスト"}' });
  ok(cross.status === 403, '他のサイトからの音声コールの中継は断る');
  const status = await (await fetch(BASE + '/api/gemini-status')).json();
  ok(typeof status.available === 'boolean', `/api/gemini-status（キー: ${status.available ? 'あり' : 'なし'}）`);
}

console.log(failed ? `\n${failed} 件失敗` : '\nすべて通りました');
process.exit(failed ? 1 : 0);
