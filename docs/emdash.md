# EmDash（Cloudflare の CMS）導入の検討メモ

2026-10-21 時点の整理。対象は「WordPress はもう古い。Cloudflare の無料 CMS『EmDash』が AI 時代の正解だった」
（YouTube・KEITO【AI&WEB ch】）で紹介された EmDash を、このサイトに使うとしたら何が変わるかを見たもの。
動画の内容は公式ドキュメント（リポジトリ `emdash-cms/emdash` の `docs/`）と、手元で実際に動かして確かめた。

## EmDash とは（確認ずみの事実）

- Astro の**インテグレーション**として動く CMS。npm の `emdash` パッケージ（v1.3.1、2026-10-18 公開）。
  MIT ライセンス。保守は Cloudflare の開発者（Astro の中心メンバーを含む）。v1.0 は 2026-09 末。
- `astro.config.mjs` に `emdash()` を足すと、管理画面（`/_emdash/admin`）、REST API、MCP サーバー
  （`/_emdash/api/mcp`）、メディアライブラリ、メニュー、下書き・公開・予約・リビジョン、権限（Admin／Editor／
  Author／Contributor）が一式ついてくる。管理画面の作りは WordPress に寄せてある。
- ログインは**パスキー**が標準（Face ID・指紋・PIN）。GitHub／Google／Microsoft のログインも足せる。
- 本文は HTML ではなく **Portable Text（構造化 JSON）**で持つ。コレクション（投稿型）と項目は
  **管理画面でデータベースに定義**する（コードではない）。`npx emdash types` で TypeScript の型を生成。
- 動かす場所は 2 通り。**Cloudflare Workers（DB は D1、画像は R2）**か、**Node.js サーバー（SQLite＋ローカルファイル）**。
- WordPress からの取り込み（WXR エクスポート、または WordPress 側プラグイン）が標準でついている。
- AI 連携は 3 つ。① MCP サーバー（Claude・ChatGPT・Codex から記事作成・公開・画像アップロード・メニュー編集まで）、
  ② CLI `npx emdash`（content／schema／media／menu の操作）、③ Claude Code 向けのスキル（`emdash-cms/skills`）。

### 動画の説明で補足が要る点

| 動画の説明 | 確認した結果 |
| --- | --- |
| 無料。実質ドメイン代のみ | ツールは無料。Cloudflare も Free プランで動く。ただし**プラグインの隔離実行（Dynamic Workers）は Workers Paid プラン（月 5 ドル〜）が必要**。Free プランではサンドボックス型プラグインは使えない（公式テンプレートも既定で無効） |
| プラグインが壊れてもサイトは無事 | 上の有料機能のこと。`plugins: []` に書くネイティブプラグインは本体と同じプロセスで動き、隔離されない |
| 既存サイトを「EmDash に対応させて」で CMS 化 | 可能だが、サイト全体を **`output: "server"`（サーバーレンダリング）に切り替える**のが前提。静的 HTML のままでは使えない（事前レンダリングしたページはビルド時の内容で止まる） |
| サーバー管理が不要 | レンタルサーバーは不要。代わりに D1 のバックアップ（Time Travel は Free で 7 日）、暗号鍵 `EMDASH_ENCRYPTION_KEY` の保管、Cron Trigger、コアのマイグレーションが運用項目になる |
| 2026年4月発表、9月に v1.0 | 一致。v1.0 から 1 か月で v1.3 まで進んでおり、変化が速い（アップグレード手順のページがある） |

必要条件：Node.js 22.16 以上（Astro 7.4 以降は 22.22 以上）、Astro 6 以上、React（管理画面のため。公開側で使わなくても必須）。

## 手元で試した結果

公式テンプレート（`emdash-cms/templates` の `starter`、Node.js 版）をこのリポジトリの外で動かした。

- `npm install` で 632 パッケージ、`node_modules` は 679 MB（このサイトの Astro 単体より大きい）。
- `npx emdash secrets generate --write .env` で鍵を作り、`npm run dev` で 8 秒ほどで起動。
- `/_emdash/admin/` は初回セットアップ（サイト名 → メール → パスキー登録）へ転送される。
- `/_emdash/api/mcp` は POST のみ。トークン無しは `401 NOT_AUTHENTICATED`。トークンは管理画面で発行する
  個人アクセストークン（`ec_pat_…`）か OAuth（Claude のカスタムコネクタはこちら）。
- CLI は開発中の localhost なら認証なしで通る（`npx emdash whoami` → Dev Admin／admin）。
  `npx emdash schema list` でコレクション定義が JSON で取れる。
- `npm create emdash` は `api.github.com` からテンプレートを落とす。外部通信を絞った環境では 403 で止まる
  （`git clone` でテンプレートを取れば回避できる）。

## このサイトで何が変わるか

いまの構成は「Astro で静的 HTML を生成 → GitHub Pages」＋「自作の管理アプリ（Cloudflare Worker）が
`src/data/*.json` と画像を GitHub に 1 コミットして公開」（`docs/admin.md`、2026-10-10 配備ずみ）。
動画で実演している「スマホ・AI から更新 → 公開」は、この範囲ではすでに実現している。

| 項目 | 現状（Astro 静的＋GitHub Pages＋自作管理アプリ） | EmDash に移した場合 |
| --- | --- | --- |
| 閲覧者に届くもの | 静的 HTML | Worker がリクエストごとに描画（Workers Cache を正しく設定すれば実用速度） |
| 公開サイトの置き場 | GitHub Pages | Cloudflare Workers（D1・R2 が必要）。GitHub Pages には置けない |
| 内容の正本 | **Git（リポジトリ）**。履歴・差分・元に戻すが git で済む | **D1 データベース**。履歴は記事ごとのリビジョン。Git には設計（コード・seed）だけが残る |
| 編集できる範囲 | 大会の状態・結果・写真・PDF・お知らせ（専用画面） | 全ページの本文・画像・メニュー・設定まで（汎用の WordPress 風画面） |
| 編集者の認証 | 名前＋パスワード（自作） | パスキー標準。役割（Admin〜Contributor）、招待、マジックリンク |
| 下書き・プレビュー | 協会で 1 つの下書き、公開前に画面内プレビュー | 記事ごとの下書き・比較・予約公開・プレビュー |
| AI からの更新 | Claude Code が JSON を直して push（git がそのまま入口） | MCP／CLI で管理画面と同じ操作。ビルド不要で即反映 |
| 費用 | 無料 | 無料（Free プラン。隔離プラグインを使うなら月 5 ドル〜） |
| 運用で増えるもの | — | D1 バックアップ、暗号鍵の保管、Cron Trigger、コアのマイグレーション、EmDash 本体の追従（更新が速い） |
| 既存の素材（写真・PDF 約 300 MB） | リポジトリ内 | R2 へ移す（Free 10 GB）。画像変換は Images Free で月 5,000 点まで |

このサイトで効く点は 2 つ。

1. **ページ本文の編集が管理画面でできる。** 協会について・協会登録・テニス教室などの本文は、いまはコードを
   直して push するしかない。`docs/architecture.md` の段階 2〜3（ブロック化 → microCMS 接続）がこのための計画で、
   EmDash はその **microCMS の代わり**になり得る。microCMS の Hobby プラン（API 5 個まで）の制約が無く、
   Astro ネイティブで、MCP とパスキーもついてくる。
2. **AI エージェントの入口が標準化される。** いまも Claude Code からは更新できるが、git を知らない編集者が
   Claude アプリから「お知らせを投稿して」と頼む形は、MCP があれば協会の方の手元でも成り立つ。

逆に、いま困っていないことは次のとおり。

- 大会結果・写真・お知らせの更新は自作の管理アプリで足りている（大会ごとの結果画像・ドロー・要項・受付状態
  という**この協会専用の画面**は、EmDash の汎用画面ではコレクション設計からやり直しになる）。
- 「内容の正本は Git」という方針が、EmDash では「正本は D1」に変わる。元に戻す・差分を見る・丸ごと複製する
  手順が全部変わる。
- 公開サイトが静的 HTML でなくなる。設計の中心（`docs/architecture.md` 1 章「閲覧者に届くのは最後まで静的 HTML」）
  を変えることになる。

## 進めるなら（2 つの案）

**案 A：サイトごと EmDash に移す（動画どおり）**

1. 手元で `npm create emdash@latest` → Node.js 版で試し、このサイト用のコレクション（お知らせ・大会・大会ごとの
   素材・優勝者・固定ページ）を管理画面で設計し、`seed/seed.json` に書き出して Git に残す。
2. `src/pages/*.astro` を `getEmDashCollection()` から描く形に書き換える（見た目・CSS・アニメーションは
   そのまま。`output: "server"` ＋ `@astrojs/cloudflare`）。
3. `src/data/*.json` の内容を CLI か MCP で流し込む（Claude Code に任せられる）。写真・PDF を R2 へ。
4. Workers Cache の `routeRules` を全公開ページに付ける（付け忘れると管理画面のタグが 2 時間キャッシュされる）。
5. `wrangler deploy`。独自ドメインは Cloudflare の DNS に置く（`docs/cloudflare.md` の 5 と同じ）。
6. 自作管理アプリ（`admin/`・`worker/`）と `deploy.yml` を止める。

**案 B：EmDash は管理画面と API だけ。公開サイトは今のまま静的（要検証）**

EmDash を別の Worker に置き、公開時のフック（`content:afterSave`）から GitHub Actions の
`repository_dispatch` を叩き、ビルド時に REST API（トークンは Actions の Secrets）で内容を取って静的 HTML にする。
`deploy.yml` にはすでに `repository_dispatch` の受け口がある（microCMS 向けに用意したもの）。
「正本は Git でない」点は案 A と同じだが、公開サイトは静的のまま、GitHub Pages のままで済む。
EmDash 側はこの使い方を想定していない（「事前レンダリングは次のビルドまで更新されない」としか書かれていない）ので、
最初に 1 ページぶんで成立するか確かめる必要がある。

どちらも、`docs/cloudflare.md` で「お問い合わせフォームを繋ぐ段階で Cloudflare に移す」とした判断と同じ
タイミングにそろえると、Cloudflare アカウント（配備ずみ）・DNS の作業が 1 回で済む。

## 結論

- **今すぐは移さない。** スマホ・AI からの更新は自作の管理アプリと git で成り立っており、EmDash に替えても
  いま困っていることは増えない一方、公開サイトの作り（静的 HTML・正本は Git）が変わる。
- **段階 2〜3（ページ本文のブロック編集）に着手するときの第一候補にする。** その時点で microCMS と比べると、
  無料・API 数の上限なし・Astro ネイティブ・MCP・パスキーの点で EmDash が有利。
  ただし v1.0 から日が浅いので、着手時にまた最新版で試し直す（このメモの「手元で試した結果」をやり直す）。
- 着手するときは、まず**案 B が成立するか**を 1 ページで確かめる。成立すれば公開サイトの設計を変えずに済む。
  成立しなければ案 A で、`docs/architecture.md` 1 章の方針を「公開サイトは Workers で描画（Workers Cache つき）」に
  改める判断を先にする。
- 動画の「プラグイン隔離」は Workers Paid プランの機能で、このサイトでは使う予定も無い。費用の見込みは
  「Free プランで無料」でよいが、隔離プラグインの分は含めない。
