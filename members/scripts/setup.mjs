// 初回セットアップ: .dev.vars を用意し、手元の D1 にマイグレーションを当てる。--reset で手元のデータを消してやり直す。
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const reset = process.argv.includes('--reset');
if (!existsSync('.dev.vars')) {
  copyFileSync('.dev.vars.example', '.dev.vars');
  console.log('.dev.vars を作りました（開発用の既定値。本番の鍵は別に作ること）');
}
if (reset && existsSync('.wrangler/state')) {
  rmSync('.wrangler/state', { recursive: true, force: true });
  console.log('.wrangler/state を消しました');
}
const r = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'tcta-members', '--local'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('\n次: npm run dev → http://localhost:8787/dev を開いて「デモデータを投入」');
