import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://tcta-tottori.github.io/tcta-website',

  // 移行前と同じURL（/about.html など）を維持する。
  // 'directory'（既定）だと /about/ に変わり、既存のリンクや検索結果が切れる。
  build: { format: 'file' },

  // base は意図的に設定していない。ページ内のリンクをすべて相対パスに保っているため、
  // プロジェクトページ（/tcta-website/配下）でも独自ドメイン（ルート直下）でも
  // 設定を変えずにそのまま動く。
});
