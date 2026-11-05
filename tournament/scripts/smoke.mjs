// 動作確認：中継（Durable Object）・役員ログイン・API を、起動中の Worker に対して一通り試す。
//   npm run preview      … 別のターミナルで（ビルドして wrangler dev。http://localhost:8787）
//   npm test             … このスクリプト（BASE=https://… を付ければ配備先にも使える）
//
// 誰でも確かめられること（ログインなし）:
//   ・アプリ本体と SPA の URL が返る
//   ・ログインしていなければ、運営端末としての接続・音声コール・/api/me を断る
//   ・観戦端末としての接続はできて、ping に pong が返る
// 役員としてログインできるとき（手元の AUTH_MODE=dev、または OFFICER_COOKIE='__Host-tcta_officer=…' を渡したとき）:
//   ・運営端末が預けた大会データが、あとから入った観戦端末にすぐ届く（運営端末が切れていても）
//   ・運営端末の変更が観戦端末へ流れる
//   ・観戦端末からは大会データの変更を流せない（データの要求だけ流せる）。観戦端末が運営端末を名乗っても同じ
const BASE = (process.env.BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const ROOM = 'SMOKE' + Math.random().toString(36).slice(2, 6).toUpperCase();

let failed = 0;
const ok = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 接続できたら { ws, inbox, send }、断られたら null */
function connect(role, { cookie, join = role === 'viewer' } = {}) {
  const headers = { Origin: BASE };
  if (cookie) headers.Cookie = cookie;
  const ws = new WebSocket(`${WS}?room=${ROOM}&role=${role}`, { headers });
  const inbox = [];
  ws.addEventListener('message', (e) => inbox.push(JSON.parse(e.data)));
  return new Promise((resolve) => {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ action: 'join', roomCode: ROOM, viewer: join }));
      resolve({ ws, inbox, send: (o) => ws.send(JSON.stringify(o)) });
    });
    ws.addEventListener('error', () => resolve(null));
  });
}
const msg = (type, payload, deviceId = 'op-1') => ({ type, deviceId, deviceName: deviceId, roomCode: ROOM, timestamp: Date.now(), payload });

// アプリ本体と SPA
{
  const r = await fetch(BASE + '/');
  ok(r.ok && (await r.text()).includes('<div id="root">'), 'アプリ本体（/）が返る');
  const v = await fetch(BASE + '/view/league', { headers: { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' } });
  ok(v.ok && (await v.text()).includes('<div id="root">'), '観戦ページの URL（/view/league）でもアプリが返る');
  const h = await (await fetch(BASE + '/api/health')).json();
  ok(h.ok === true, '/api/health');
}

// ログインしていない人
const me = await fetch(BASE + '/api/me');
const meBody = await me.json();
console.log(`  役員ログインの方式: ${meBody.mode}`);
ok(me.status === 401 && meBody.authenticated === false, 'ログインしていなければ /api/me は 401');
ok(!(await connect('operator')), 'ログインしていなければ、運営端末としては接続できない');
{
  const forged = await connect('operator', { cookie: '__Host-tcta_officer=eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6InhAeC5qcCJ9.AAAA' });
  ok(!forged, '偽の証明では運営端末として接続できない');
  forged?.ws.close();
}
{
  const tts = await fetch(BASE + '/api/gemini-tts', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: '{"text":"テスト"}' });
  ok(tts.status === 401, 'ログインしていなければ音声コールの中継は使えない');
  const cross = await fetch(BASE + '/api/gemini-tts', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: '{"text":"テスト"}' });
  ok(cross.status === 403, '他のサイトからの音声コールの中継は断る');
  const login = await fetch(BASE + '/auth/login?return=//evil.example', { redirect: 'manual' });
  // Access を通っていなければ Access のログイン画面へ移る（その URL の中に元の要求がそのまま入るので、移る先のホストで見る）
  const loc = login.headers.get('location') || '';
  const host = loc ? new URL(loc, BASE).hostname : '';
  ok(login.status !== 302 || !host.includes('evil'), 'ログイン後の戻り先に他のサイトを指定できない');
}

// 大会データの置き場（D1）
{
  const list = await fetch(BASE + '/api/data/files?kind=schedule');
  ok(list.status === 401, 'ログインしていなければ大会データの一覧は読めない');
  const put = await fetch(BASE + '/api/data/files?kind=schedule&name=x.xlsx', { method: 'PUT', headers: { Origin: BASE }, body: 'x' });
  ok(put.status === 401, 'ログインしていなければ大会データは置けない');
  const forged = await fetch(BASE + '/api/data/files', { headers: { Authorization: 'Bearer tcta_push_forged' } });
  ok(forged.status === 401, '偽の送信用の鍵では大会データを読めない');
}

// 大会運営のデータベース（大会・辞書。worker/catalog.ts）
{
  const sch = await fetch(BASE + '/api/schema');
  ok(sch.ok && !!(await sch.json()).tournament, '/api/schema（AI 向けの形の説明）はログインなしで読める');
  ok((await fetch(BASE + '/api/catalog')).status === 401, 'ログインしていなければ大会の一覧は読めない');
  ok((await fetch(BASE + '/api/dict')).status === 401, 'ログインしていなければ辞書は読めない');
  const put = await fetch(BASE + '/api/catalog/smoke-test', { method: 'PUT', headers: { Origin: BASE, 'Content-Type': 'application/json' }, body: '{"name":"x"}' });
  ok(put.status === 401, 'ログインしていなければ大会は置けない');
}
{
  const refused = await new Promise((resolve) => {
    const ws = new WebSocket(`${WS}?room=bad%20room&role=viewer`);
    ws.addEventListener('open', () => { ws.close(); resolve(false); });
    ws.addEventListener('error', () => resolve(true));
  });
  ok(refused, 'ルームコードの形が不正なら断る');
  const viewer = await connect('viewer');
  ok(!!viewer, '観戦端末としては誰でも接続できる');
  if (viewer) {
    viewer.ws.send('{"action":"ping"}');
    await sleep(400);
    ok(viewer.inbox.some((m) => m.action === 'pong'), 'ping に pong が返る');
    viewer.ws.close();
  }
}

// 役員としてログインできるとき
let cookie = process.env.OFFICER_COOKIE || '';
if (!cookie && meBody.mode === 'dev') {
  const res = await fetch(BASE + '/auth/login?return=/data', { method: 'POST', body: new URLSearchParams({ email: 'smoke@example.com' }), redirect: 'manual' });
  cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  ok(res.status === 302 && cookie.startsWith('tcta_dev_officer='), '手元の役員ログイン（AUTH_MODE=dev）');
  const me2 = await fetch(BASE + '/api/me', { headers: { Cookie: cookie } });
  ok(me2.status === 200 && (await me2.json()).email === 'smoke@example.com', 'ログインすると /api/me が役員を返す');
}

if (cookie) {
  const op = await connect('operator', { cookie });
  ok(!!op, 'ログインしていれば運営端末として接続できる');
  const snapshot = msg('snapshot-response', { dexie: [{ table: 'tournaments', rows: [{ id: 1, name: 'スモーク大会' }] }], zustand: [] });
  op.send({ action: 'cache', roomCode: ROOM, payload: snapshot });
  await sleep(300);
  op.ws.close();
  await sleep(300);

  const viewer = await connect('viewer');
  await sleep(500);
  ok(viewer.inbox.some((m) => m.type === 'snapshot-response' && m.payload?.dexie?.[0]?.rows?.[0]?.name === 'スモーク大会'),
    '運営端末が切れたあとでも、観戦端末に預けた大会データが届く');

  const op2 = await connect('operator', { cookie });
  await sleep(200);
  op2.send({ action: 'broadcast', roomCode: ROOM, payload: msg('dexie-change', { table: 'matches', operation: 'update', key: 1, modifications: { score: '6-4' } }) });
  await sleep(400);
  ok(viewer.inbox.some((m) => m.type === 'dexie-change' && m.payload?.modifications?.score === '6-4'), '運営端末の変更が観戦端末へ流れる');

  viewer.send({ action: 'broadcast', roomCode: ROOM, payload: msg('dexie-change', { table: 'matches', operation: 'delete', key: 1 }, 'viewer-1') });
  viewer.send({ action: 'broadcast', roomCode: ROOM, payload: msg('request-snapshot', null, 'viewer-1') });
  // 観戦端末として接続したまま、join で運営端末を名乗っても流れない
  const sly = await connect('viewer', { join: false });
  sly.send({ action: 'broadcast', roomCode: ROOM, payload: msg('dexie-change', { table: 'matches', operation: 'delete', key: 2 }, 'viewer-2') });
  sly.send({ action: 'cache', roomCode: ROOM, payload: msg('snapshot-response', { dexie: [], zustand: [] }, 'viewer-2') });
  await sleep(500);
  ok(!op2.inbox.some((m) => m.type === 'dexie-change' && m.deviceId === 'viewer-1'), '観戦端末からの変更は運営端末へ流れない');
  ok(!op2.inbox.some((m) => m.deviceId === 'viewer-2' && m.type === 'dexie-change'), '観戦端末が運営端末を名乗っても、変更は流れない');
  ok(op2.inbox.some((m) => m.type === 'request-snapshot' && m.deviceId === 'viewer-1'), '観戦端末からのデータ要求は運営端末へ届く');
  const late = await connect('viewer');
  await sleep(500);
  ok(late.inbox.some((m) => m.type === 'snapshot-response' && m.payload?.dexie?.[0]?.rows?.[0]?.name === 'スモーク大会'), '観戦端末は預かった大会データを書き換えられない');

  for (const c of [viewer, op2, sly, late]) c.ws.close();

  // 大会運営のデータベース（手元のときだけ書く。配備先の本物のデータは触らない）
  if (meBody.mode === 'dev') {
    const H = { Cookie: cookie, Origin: BASE, 'Content-Type': 'application/json' };
    const bad = await fetch(BASE + '/api/catalog/smoke-test', { method: 'PUT', headers: H, body: JSON.stringify({ name: 'スモーク', status: 'ready' }) });
    ok(bad.status === 400, 'ドローの無い大会は「運営できる」にできない');
    const body = { name: 'スモーク大会', date: '2026-11-08', venue: 'テスト', draw: { events: [{ eventName: '男子シングルス', type: 'Singles', drawSize: 4, players: [
      { position: 1, name: '甲 太郎', affiliation: 'A', seed: 1 }, { position: 2, name: '乙 次郎', affiliation: 'B' }, { position: 4, name: '丙 三郎', affiliation: 'C' }] }] } };
    const put = await fetch(BASE + '/api/catalog/smoke-test', { method: 'PUT', headers: H, body: JSON.stringify(body) });
    const putBody = await put.json();
    ok(put.ok && putBody.status === 'ready' && putBody.players === 3, '役員は大会を置ける（ドローがあれば「運営できる」）');
    const one = await (await fetch(BASE + '/api/catalog/smoke-test', { headers: { Cookie: cookie } })).json();
    ok(one.draw?.events?.[0]?.players?.length === 3, '置いた大会のドローを読める');
    const list = await (await fetch(BASE + '/api/catalog', { headers: { Cookie: cookie } })).json();
    ok(list.tournaments.some((t) => t.id === 'smoke-test' && !('draw' in t)), '一覧は軽い要約だけ（ドローは入れない）');
    const d = await fetch(BASE + '/api/dict', { method: 'PUT', headers: H, body: JSON.stringify({ mode: 'merge', players: [{ name: 'スモーク 太郎', furigana: 'すもーく たろう' }] }) });
    ok(d.ok, '辞書に足せる');
    const dict = await (await fetch(BASE + '/api/dict', { headers: { Cookie: cookie } })).json();
    ok(dict.players.some((p) => p.name === 'スモーク 太郎'), '足した人が辞書にいる');
    await fetch(BASE + '/api/dict', { method: 'PUT', headers: H, body: JSON.stringify({ mode: 'merge', removePlayers: ['スモーク 太郎'] }) });
    await fetch(BASE + '/api/catalog/smoke-test', { method: 'DELETE', headers: H });
  }
} else {
  console.log('  （役員としての確認は省略：OFFICER_COOKIE を渡すか、手元の AUTH_MODE=dev で試す）');
}

console.log(failed ? `\n${failed} 件失敗` : '\nすべて通りました');
process.exit(failed ? 1 : 0);
