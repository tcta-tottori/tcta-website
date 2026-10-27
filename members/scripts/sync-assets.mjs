// 公式サイト本体（../public/assets）の CSS・JS・ロゴを members/public/assets に複製する。
// 会員ポータルは本体サイトと同じ見た目・同じ動きにそろえるため、本体の style.css / main.js をそのまま使う。
// dev / deploy / test の前に自動で走る（package.json の pre* スクリプト）。複製先は Git 管理外。
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'public', 'assets');
const dst = join(here, '..', 'public', 'assets');
const FILES = [
  'css/style.css',
  'js/main.js',
  'img/logo.png',
  'img/logo-white.png',
  'img/favicon-32.png',
  'img/favicon-192.png',
  'img/apple-touch-icon.png',
  'img/cta.webp',
];
if (!existsSync(join(src, 'css/style.css'))) {
  console.error(`本体サイトの assets が見つかりません: ${src}`);
  process.exit(1);
}
for (const f of FILES) {
  mkdirSync(dirname(join(dst, f)), { recursive: true });
  copyFileSync(join(src, f), join(dst, f));
}
console.log(`本体サイトの assets を ${FILES.length} 件複製しました → members/public/assets/`);
