// 編集者のパスワードのハッシュを作る。
//   node scripts/hash-password.mjs <名前> <パスワード>
// 出てきた1行を EDITORS（JSON）に足して `npx wrangler secret put EDITORS` で登録する。
import { hashPassword } from '../src/auth.js';

const [name, password] = process.argv.slice(2);
if (!name || !password) {
  console.error('使い方: node scripts/hash-password.mjs <名前> <パスワード>');
  process.exit(1);
}
if (password.length < 10) {
  console.error('パスワードは10文字以上にしてください');
  process.exit(1);
}
console.log(JSON.stringify({ [name]: await hashPassword(password) }));
