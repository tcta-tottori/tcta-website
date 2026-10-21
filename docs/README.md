# docs — 設計資料

サイト実装の根拠となる資料です。**サイト本体（HTML/CSS/JS）はリポジトリのルート**にあり、
このフォルダは公開ページの一部ではありません。

| ファイル | 内容 |
| --- | --- |
| [`architecture.md`](./architecture.md) | サイト構成方針 v1.0。ブロック単位でスマホから更新できる構成（Astro + microCMS）への移行設計と段階計画 |
| [`design.md`](./design.md) | ビジュアルデザイン仕様書 v3.1。カラー、タイポグラフィ、余白、コンポーネント、レスポンシブ、アクセシビリティの規則。`assets/css/style.css` のCSS変数はこの仕様に対応しています |
| [`content.md`](./content.md) | 原稿仕様書 v2.0。各ページの実テキスト、情報構成、`【要確認】` 項目の一覧 |
| [`design-chat-log.md`](./design-chat-log.md) | ファーストビュー3案の提案から採用案（3a）決定までの検討ログ。なぜこの構成になったかの経緯 |
| [`cloudflare.md`](./cloudflare.md) | Cloudflare（Pages／Workers／Wrangler）導入の検討メモ。お問い合わせフォームを繋ぐ段階で移す判断 |
| [`admin.md`](./admin.md) | サイト更新アプリ（管理画面）の構成と設置手順。Cloudflare Worker から GitHub に 1 コミットして公開する仕組み |
| [`emdash.md`](./emdash.md) | Cloudflare の CMS「EmDash」導入の検討メモ。動画の主張の検証、手元で試した結果、このサイトとの比較、2 つの移行案と結論 |

## 使い方

- **デザインを変更するとき** — まず `design.md` のトークン表を確認し、
  `public/assets/css/style.css` 冒頭の `:root` を変更してください。個別のCSSに直値を書かない方針です。
- **文言を変更するとき** — `content.md` が原稿の正本です。サイト側だけを直すと、
  次に原稿から作業する人と食い違います。
- **`要確認` の扱い** — `content.md` の `【要確認】` と、サイト上の赤い「要確認」バッジは対応しています。
  協会で内容が確定したら、両方を更新してください。

## 注意

GitHub Pages の公開元（Settings → Pages → Source）は **GitHub Actions** を選択してください。
`Deploy from a branch` のままだと、ビルド前のソースが公開されて表示が崩れます。
