// 動作確認（E2E）。wrangler dev を別ポートで起動し、設計書の流れを一気通貫で通す:
//   会員登録(マジックリンク) → 年度登録(振込) → 事務局の消込・承認 → 大会エントリー(ペア検索)
//   → Stripe(シミュレータ)の Webhook で自動確定 → 運営アプリ向け JSON → 権限の分離 → 定期実行 → 監査ログ
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const PERSIST = '.wrangler/smoke-state';
const sh = process.platform === 'win32';

if (existsSync(PERSIST)) rmSync(PERSIST, { recursive: true, force: true });
const mig = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'tcta-members', '--local', '--persist-to', PERSIST], { stdio: 'inherit', shell: sh });
if (mig.status !== 0) process.exit(1);

const dev = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--test-scheduled', '--persist-to', PERSIST, '--log-level', 'warn'], { stdio: ['ignore', 'pipe', 'pipe'], shell: sh, detached: !sh });
let devLog = '';
dev.stdout.on('data', (d) => (devLog += d));
dev.stderr.on('data', (d) => (devLog += d));
// wrangler は子プロセス（workerd）を持つので、プロセスグループごと止める
const stop = () => { try { if (!sh && dev.pid) process.kill(-dev.pid, 'SIGTERM'); else dev.kill('SIGTERM'); } catch {} };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });
process.on('SIGTERM', () => { stop(); process.exit(143); });

// ---- 小さな HTTP クライアント（Cookie 持ち・リダイレクト追わない） ----
class Client {
  constructor() { this.jar = new Map(); }
  cookieHeader() { return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(path, { method = 'GET', body, headers = {} } = {}) {
    const h = { Cookie: this.cookieHeader(), ...headers };
    let payload;
    if (body) { h['Content-Type'] = 'application/x-www-form-urlencoded'; h['Origin'] = BASE; payload = new URLSearchParams(body).toString(); }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [kv, ...attrs] = sc.split(';');
      const [k, v] = kv.split('=');
      if (attrs.some((a) => /max-age=0/i.test(a))) this.jar.delete(k.trim()); else this.jar.set(k.trim(), v);
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text(), headers: res.headers };
  }
  get(p) { return this.req(p); }
  post(p, body) { return this.req(p, { method: 'POST', body: body ?? {} }); }
}

let passed = 0;
function check(cond, label, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { console.error(`  ✗ ${label} ${extra}`); throw new Error(`FAILED: ${label}`); }
}
const pick = (s, re) => { const m = s.match(re); return m ? m[1] : null; };

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${BASE}/api/v1/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('wrangler dev が起動しません\n' + devLog);
}

try {
  await waitReady();
  console.log('wrangler dev 起動');
  const anon = new Client();
  const member = new Client();
  const admin = new Client();
  const unei = new Client();
  const shop = new Client();

  console.log('\n[0] デモデータ');
  let r = await anon.post('/dev/seed');
  check(r.status === 302, 'デモデータを投入');
  r = await anon.get('/api/v1/tournaments');
  const pub = JSON.parse(r.text);
  check(pub.tournaments.some((t) => t.id === 'T-DEMO-OPEN'), '公開 API に受付中の大会が出る');
  check(!r.text.includes('@example.com'), '公開 API に個人情報が無い');

  console.log('\n[0b] セキュリティの案内');
  r = await anon.get('/security');
  check(r.status === 200 && r.text.includes('誰が何を見られるか') && r.text.includes('漏えいが疑われるとき'), '専用ページ /security が開く');
  r = await anon.get('/privacy');
  check(r.status === 200 && r.text.includes('共同利用の主体と目的'), '共同利用規程（案）/privacy が開く');
  r = await anon.get('/login');
  check(r.text.includes('ログインの安全について') && r.text.includes('/security#login'), 'ログイン画面にセキュリティの要点が出る');

  console.log('\n[1] 会員登録（マジックリンク）');
  r = await member.post('/login', { email: 'smoke@example.com' });
  check(r.status === 200 && r.text.includes('ログインリンクを作りました') && r.text.includes('/auth/'), 'ログインリンクの発行（デモはその場に表示）');
  r = await anon.get('/dev/mailbox.json');
  const mail = JSON.parse(r.text).find((m) => m.to_addr === 'smoke@example.com');
  const link = pick(mail?.body ?? '', /(http:\/\/[^\s]+\/auth\/[^\s]+)/);
  check(link, '送信箱にマジックリンクが届く');
  r = await member.get(new URL(link).pathname);
  check(r.status === 302 && r.location === '/signup', '未登録メール → 会員登録フォームへ');
  r = await member.get('/signup');
  check(r.text.includes('お預かりする情報と守り方') && r.text.includes('href="/privacy"'), '会員登録画面に取扱いの要点と規程へのリンクが出る');
  r = await member.get(new URL(link).pathname);
  check(r.status === 302 && r.location === '/login', 'リンクは 1 回限り');
  r = await member.post('/signup', { family_name: '煙', given_name: '試験', family_kana: 'けむり', given_kana: 'しけん', sex: 'male', birth_era: 'heisei', birth_y: '2', club_sel: '__other__', club_other: '煙テニスクラブ', home: 'tottori-city', phone: '090-1234-5678', postal: '680-0001', address: '鳥取市テスト1-1', consent: 'on' });
  check(r.status === 302 && r.location === '/me', '会員登録 → マイページへ');
  r = await member.get('/me');
  check(r.text.includes('煙 試験') && /T-\d\d-\d{4}/.test(r.text), '会員番号（T-yy-nnnn）が発番される');
  check(r.text.includes('090-1234-5678'), '本人は自分の電話番号を見られる');
  check(r.text.includes('煙テニスクラブ'), '所属を手入力すると新しいクラブとして登録される');
  r = await member.get('/me/profile');
  check(r.text.includes('value="1990" selected'), '生年を「平成 2 年」で入れると西暦 1990 年として保存される');
  r = await member.post('/me/profile', { family_name: '煙', given_name: '試験', family_kana: 'けむり', given_kana: 'しけん', sex: 'male', birth_era: 'seireki', birth_y: '1990', club_sel: '__free__', club_other: '', email: 'smoke@example.com', phone: '090-1234-5678', postal: '680-0001', address: '鳥取市テスト1-1' });
  r = await member.get('/me');
  check(r.text.includes('<dd>フリー</dd>'), '所属を「フリー（無所属）」にできる');
  r = await anon.get('/api/v1/postal/6800001');
  check(r.status === 200 || r.status === 502, '郵便番号 → 住所の API が応答する（外部に出られない環境では 502）');
  if (r.status === 200) check(JSON.parse(r.text).address.includes('鳥取'), '郵便番号 680-0001 は鳥取県の住所');

  console.log('\n[2] 年度登録（振込）');
  const now = new Date(Date.now() + 9 * 3600 * 1000); // JST
  const fy = now.getUTCMonth() + 1 >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  r = await member.post('/registrations/new', { fy: String(fy), assoc: 'tottori-city', category: 'general', method: 'bank' });
  check(r.status === 302 && r.location?.startsWith('/pay/'), '年度登録の申請 → 支払ページ');
  const regPay = r.location.split('/').pop();
  r = await member.get(`/pay/${regPay}`);
  check(r.text.includes('振込') && r.text.includes('3,000円'), '振込先と金額が出る');
  r = await member.get('/tournaments/T-DEMO-OPEN');
  check(r.text.includes('年度登録（承認済み）が必要'), '未承認のうちはエントリーできない（参加資格の自動判定）');

  console.log('\n[3] 事務局: 消込 → 承認（鳥取市 事務局）');
  r = await admin.get('/admin/login');
  const adminId = pick(r.text, /value="([^"]+)" required> 鳥取市 事務局/);
  check(adminId, '開発モードの管理者選択にある');
  r = await admin.post('/admin/login', { id: adminId });
  check(r.status === 302 && r.location === '/admin', '事務局ログイン');
  r = await admin.get('/admin/payments');
  check(r.text.includes(regPay), '消込待ちに振込が出る');
  r = await admin.post(`/admin/payments/${regPay}/confirm`, { note: '通帳 10/27 ケムリシケン' });
  check(r.status === 302, '入金確認');
  r = await admin.get('/admin/registrations?status=pending');
  const regId = pick(r.text, /action="\/admin\/registrations\/([^/]+)\/approve"/);
  check(regId, '承認待ちに出る（入金済み）');
  r = await admin.post(`/admin/registrations/${regId}/approve`);
  check(r.status === 302, '年度登録を承認');
  r = await member.get('/me');
  check(r.text.includes('承認済み'), 'マイページで承認済みになる');
  r = await anon.get('/dev/mailbox.json');
  check(JSON.parse(r.text).some((m) => m.to_addr === 'smoke@example.com' && m.subject.includes('承認')), '承認メールが届く');

  console.log('\n[4] 大会エントリー（ペア検索 → Stripe）');
  r = await member.get('/tournaments/T-DEMO-OPEN/entry?q=さとう');
  const partnerId = pick(r.text, /name="partner" value="([0-9A-Z]{26})"> 佐藤 花子/);
  check(partnerId, 'ペアを氏名で検索できる');
  check(!r.text.includes('090-0000-0002'), 'ペア検索に電話番号は出ない');
  r = await member.post('/tournaments/T-DEMO-OPEN/entry', { event: 'MD', class: 'A', partner: partnerId, method: 'stripe' });
  check(r.status === 302 && r.location?.startsWith('/pay/'), 'エントリー → 支払ページ');
  const entryPay = r.location.split('/').pop();
  r = await member.post('/tournaments/T-DEMO-OPEN/entry', { event: 'MD', class: 'A', partner: partnerId, method: 'stripe' });
  check(r.status === 302 && r.location?.includes('/entry'), '同じ種目への二重エントリーは拒否');
  r = await member.post(`/pay/${entryPay}/stripe`);
  check(r.status === 302 && r.location === `/dev/stripe/${entryPay}`, 'Stripe（鍵なし）はシミュレータへ');
  r = await member.post(`/dev/stripe/${entryPay}/pay`, { badsig: '1' });
  check(r.status === 302 && r.location?.startsWith('/dev/stripe/'), '署名の無い Webhook は拒否');
  r = await member.post(`/dev/stripe/${entryPay}/pay`, { tamper: '1' });
  check(r.status === 302 && r.location?.startsWith('/dev/stripe/'), '金額を改ざんした Webhook は拒否');
  r = await member.post(`/dev/stripe/${entryPay}/pay`);
  check(r.status === 302 && r.location === `/pay/${entryPay}`, '正しい Webhook で入金確定');
  r = await member.get(`/pay/${entryPay}`);
  check(r.text.includes('入金を確認済み') && /R-\d\d-\d{5}/.test(r.text), '領収書番号が出る');
  r = await member.get('/me');
  check(r.text.includes('確定') && r.text.includes('佐藤 花子'), 'マイページでエントリー確定');
  r = await anon.get('/dev/mailbox.json');
  const mails = JSON.parse(r.text);
  check(mails.some((m) => m.to_addr === 'sato@example.com' && m.subject.includes('ペアにエントリー')), 'ペアに通知が届く（なりすまし対策）');
  check(mails.some((m) => m.to_addr === 'smoke@example.com' && m.subject.includes('エントリー確定')), '本人に確定通知が届く');

  console.log('\n[4b] 参加資格の判定（大会ごとに必要な年度登録が違う）');
  // smoke 会員は鳥取市登録のみ
  r = await member.get('/tournaments');
  check(r.text.includes('出場できます') && r.text.includes('登録が足りません'), '一覧に大会ごとの可否が出る');
  r = await member.get('/tournaments/T-DEMO-PREF');
  check(r.text.includes('鳥取県テニス協会') && r.text.includes('年度登録（承認済み）が必要'), '県登録が必要な大会は市登録だけでは出られない');
  r = await member.post('/tournaments/T-DEMO-PREF/entry', { event: 'MS', class: '', partner: '', method: 'bank' });
  check(r.status === 302 && r.location?.includes('/entry'), '資格の無い大会へのエントリーは拒否');
  r = await member.get('/tournaments/T-DEMO-BOTH');
  check(r.text.includes('足りない: 鳥取県テニス協会'), '県＋市が必要な大会は、足りない側（県）を示す');
  r = await member.get('/tournaments/T-DEMO-OPEN2');
  check(r.text.includes('あなたは条件を満たしています'), '市 または 県 の大会は市登録だけで出られる');
  r = await member.get('/tournaments/T-DEMO-YONAGO');
  check(r.text.includes('米子市テニス協会') && !r.text.includes('あなたは条件を満たしています'), '米子市登録が必要な大会には出られない');
  r = await member.get('/tournaments/T-DEMO-ANYONE');
  check(r.text.includes('どなたでも参加できる'), '登録不要の大会は誰でも参加できる');
  r = await member.post('/tournaments/T-DEMO-ANYONE/entry', { event: 'MS', class: '', partner: '', method: 'bank' });
  check(r.status === 302 && r.location?.startsWith('/pay/'), '登録不要の大会にはエントリーできる');
  // ペアの資格: 高橋（倉吉＋県）は鳥取市登録が無いので、市登録必須の大会のペアにはなれない
  r = await member.get('/tournaments/T-DEMO-OPEN/entry?q=たかはし');
  const takahashi = pick(r.text, /name="partner" value="([0-9A-Z]{26})"> 高橋 健/);
  check(takahashi && r.text.includes('登録不足'), 'ペア検索で登録不足のペアが分かる');
  r = await member.post('/tournaments/T-DEMO-OPEN/entry', { event: 'MD', class: 'B', partner: takahashi, method: 'bank' });
  check(r.status === 302 && r.location?.includes('/entry'), '登録不足のペアとのエントリーは拒否');
  r = await anon.get('/api/v1/tournaments');
  check(JSON.parse(r.text).tournaments.some((t) => t.id === 'T-DEMO-BOTH' && t.eligibility.rule.length === 1 && t.eligibility.rule[0].length === 2), '公開 API に参加資格のルールが出る');

  console.log('\n[5] 運営アプリ向け JSON と権限');
  r = await admin.post('/admin/tournaments/T-DEMO-OPEN/tokens', { label: 'smoke', days: '30' });
  const token = pick(r.text, /entries\.json\?token=([A-Za-z0-9_-]+)/);
  check(token, '読み取り専用トークンを発行');
  r = await anon.get(`/api/v1/tournaments/T-DEMO-OPEN/entries.json?token=${token}`);
  const j = JSON.parse(r.text);
  check(r.status === 200 && j.entries.some((e) => e.players.some((p) => p.name === '煙 試験')), 'JSON に確定エントリーが出る');
  check(!r.text.includes('example.com') && !r.text.includes('090-'), 'JSON に個人情報が無い');
  r = await anon.get('/api/v1/tournaments/T-DEMO-PREF/entries.json?token=' + token);
  check(r.status === 403, 'トークンは大会単位');
  r = await anon.get('/admin/members');
  check(r.status === 302 && r.location === '/admin/login', '未ログインは事務局画面に入れない');
  r = await unei.get('/admin/login');
  const uneiId = pick(r.text, /value="([^"]+)" required> 大会運営/);
  await unei.post('/admin/login', { id: uneiId });
  r = await unei.get('/admin/members');
  check(r.status === 403, '大会運営ロールは名簿を見られない');
  r = await unei.get('/admin/tournaments/T-DEMO-OPEN');
  check(r.status === 200 && r.text.includes('煙 試験'), '大会運営は担当大会のエントリーを見られる');
  r = await unei.get('/admin/tournaments/T-DEMO-PREF');
  check(r.status === 404, '担当外の大会は見られない');
  r = await admin.get('/admin/members?q=けむり');
  const memberId = pick(r.text, /\/admin\/members\/([0-9A-Z]{26})/);
  r = await admin.get(`/admin/members/${memberId}`);
  check(r.text.includes('090-1234-5678') && r.text.includes('監査ログに記録'), '協会管理は連絡先を見られ、閲覧が記録される');
  r = await admin.post('/admin/members/export.csv', { purpose: 'smoke test' });
  check(r.status === 200 && r.text.includes('"煙","試験","けむり","しけん"'), '名簿 CSV を目的つきで出力（姓・名・せい・めいの列）');

  console.log('\n[6] ショップ代行入力（現金）');
  r = await shop.get('/admin/login');
  const shopId = pick(r.text, /value="([^"]+)" required> テニスショップ/);
  r = await shop.post('/admin/login', { id: shopId });
  check(r.status === 302 && r.location === '/shop', 'ショップは代行入力画面へ');
  r = await shop.get('/shop?q=すずき');
  const suzuki = pick(r.text, /name="member" value="([0-9A-Z]{26})" required> T-[^<]*鈴木/);
  check(suzuki, 'ショップが会員を検索できる');
  check(!r.text.includes('090-0000-0003'), 'ショップに電話番号は出ない');
  r = await shop.post('/shop/entry', { member: suzuki, tournament: 'T-DEMO-OPEN', event: 'MS', class: '', partner: '', cash_received: 'on' });
  check(r.status === 302 && r.location === '/shop/today', '現金受領でその場で確定');
  r = await shop.get('/shop/today');
  check(r.text.includes('鈴木 一郎') && r.text.includes('確定'), '本日の入力に出る');
  r = await shop.get('/admin/members');
  check(r.status === 302 && r.location === '/shop', 'ショップは事務局画面に入れない');

  console.log('\n[7] 定期実行と監査ログ');
  r = await anon.get('/__scheduled?cron=0+0+*+*+*');
  check(r.status === 200, '定期実行（締切処理・リマインド・バックアップ）が動く');
  r = await admin.get('/admin/audit?q=entry.confirm');
  check(r.text.includes('stripe:webhook'), '監査ログに Webhook の確定が残る');
  r = await admin.get('/admin/audit?q=member.view_pii');
  check(r.text.includes('tottori-admin@example.com'), '監査ログに個人情報の閲覧が残る');
  r = await admin.get('/admin/audit?q=webhook.rejected');
  check(r.text.includes('bad signature'), '拒否した Webhook も残る');
  r = await admin.get('/admin/audit?q=jobs.run');
  check(r.text.includes('jobs.run'), '定期実行の記録が残る');

  console.log(`\nすべて通りました（${passed} 件）`);
  stop();
  process.exit(0);
} catch (e) {
  console.error('\n' + e.message);
  console.error('\n--- wrangler dev のログ ---\n' + devLog.slice(-4000));
  stop();
  process.exit(1);
}
