// 編集者の名前とパスワードを対話で聞き、ハッシュにして EDITORS の秘密情報として登録する。
//   node scripts/register-editors.mjs
// パスワードは画面に出さない。複数人を続けて入れられる（名前を空で Enter すると終了）。
// すでに登録ずみの EDITORS は上書きされるので、全員ぶんをまとめて入れること。
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { hashPassword } from '../src/auth.js';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = (q, hidden = false) => new Promise((resolve) => {
  if (!hidden) return rl.question(q, (a) => resolve(a.trim()));
  const origWrite = rl._writeToOutput;
  process.stdout.write(q);
  rl._writeToOutput = () => {};
  rl.question('', (a) => { rl._writeToOutput = origWrite; process.stdout.write('\n'); resolve(a); });
});

const editors = {};
console.log('編集者を登録します。名前を空のまま Enter すると登録に進みます。\n');
for (;;) {
  const name = await ask('名前（例：山田）: ');
  if (!name) break;
  const pw = await ask('パスワード（10文字以上・画面に出ません）: ', true);
  if (pw.length < 10) { console.log('  → 10文字以上にしてください\n'); continue; }
  const pw2 = await ask('もう一度パスワード: ', true);
  if (pw !== pw2) { console.log('  → 一致しません。やり直してください\n'); continue; }
  editors[name] = await hashPassword(pw);
  console.log(`  → ${name} を追加しました（これまでに ${Object.keys(editors).length} 人）\n`);
}
rl.close();
if (!Object.keys(editors).length) { console.log('誰も登録しませんでした'); process.exit(1); }
console.log(`\n${Object.keys(editors).join('・')} を EDITORS として登録します…`);
const r = spawnSync('npx', ['wrangler', 'secret', 'put', 'EDITORS'], { input: JSON.stringify(editors), stdio: ['pipe', 'inherit', 'inherit'] });
process.exit(r.status ?? 1);
