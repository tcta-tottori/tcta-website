// 協会サイト（リポジトリ直下の Astro サイト）の見た目をそのまま使うため、サイトの CSS とロゴを写す。
//   ../public/assets/css/style.css → src/site/style.css（src/index.css が CSS のレイヤー「site」として読み込む）
//   ../public/assets/img/logo-cut*.png → public/site/
// dev / build の前に自動で走る（package.json の predev・prebuild）。写したものは Git に入れない（.gitignore）。
// サイトの CSS が変われば、次のビルドで大会運営システムの見た目も同じだけ変わる。
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'public', 'assets');
const app = join(here, '..');
const FILES = [
  [join(site, 'css', 'style.css'), join(app, 'src', 'site', 'style.css')],
  [join(site, 'img', 'logo-cut.png'), join(app, 'public', 'site', 'logo-cut.png')],
  [join(site, 'img', 'logo-cut-white.png'), join(app, 'public', 'site', 'logo-cut-white.png')],
];
for (const [from, to] of FILES) {
  if (!existsSync(from)) {
    console.error(`協会サイトのファイルが見つかりません: ${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  if (to.endsWith('.css')) {
    // レイヤーの中では @charset を書けないので外す（ファイルは UTF-8 のまま）
    writeFileSync(to, readFileSync(from, 'utf8').replace(/^@charset "UTF-8";\s*/, ''));
  } else {
    copyFileSync(from, to);
  }
}
console.log(`協会サイトの CSS・ロゴを ${FILES.length} 件写しました`);
