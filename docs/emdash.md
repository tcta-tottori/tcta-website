# EmDash（Cloudflare の CMS）への移行 — 構成・設置・運用

2026-10-21 に、公式サイトごと Cloudflare Workers に移し、CMS に EmDash を採用した（案 A）。
検討の経緯と EmDash そのものの説明は、末尾の「検討の経緯（2026-10-21 時点のメモ）」にそのまま残してある。

## 全体像

```
   編集者（スマホ・PC）／ AI（Claude・ChatGPT・Claude Code）
     │  パスキーでログイン            │  MCP（/_emdash/api/mcp）・CLI
     ▼                               ▼
 ┌────────────────────────────────────────────────┐
 │ Cloudflare Worker  tcta-site（Astro ＋ EmDash）   │
 │   /_emdash/admin/ … 管理画面                      │
 │   /_emdash/api/   … REST・MCP                     │
 │   /               … 公式サイト（リクエストごとに描画）│
 │   D1: 内容   R2: アップロードした画像・PDF          │
 │   Workers Cache: 公開ページ（公開時にタグで無効化） │
 └────────────────────────────────────────────────┘
          ▲ wrangler deploy（main への push → .github/workflows/deploy.yml）
          │
   GitHub  tcta-tottori/tcta-website（ページの作り・デザイン・seed・旧結果データ）
```

- **内容の正本は D1**（お知らせ・大会・イベント情報）。Git にはページの作り・デザイン・内容モデル（`seed/seed.json`）が残る。
- **移行前に置いた画像・PDF（約 300 MB）は `public/assets/` のまま**。Workers の静的ファイルとして配信する。
  管理画面からアップロードしたものだけ R2 に入る。
- **URL は移行前と同じ**（`/about.html`、`/event-r8-enetopia.html` …）。`src/pages/*.html.astro` のファイル名がそのまま URL になる。
- 平成16〜令和6年度の大会結果（`src/data/results.json`・327大会）は EmDash に入れず、これまでどおりコードから描く。

## 内容モデル（管理画面のコレクション）

`seed/seed.json` が正本。`node tools/build_seed.mjs` で、移行前の `src/data/*.json` から組み立てた。

| コレクション | 1件 | 主な項目 |
| --- | --- | --- |
| お知らせ `news` | お知らせ1件 | タイトル、日付（2026-10-12）、分類（大会／結果／ジュニア／お知らせ）、リンク先、目立たせる（赤い帯） |
| 大会 `tournaments` | 大会1件（年度ごと） | 大会名、年度、通し番号、区分（協会主催／預かり／その他）、種目、開催日、期日の表記、会場、予備日・予備会場・補足、申込締切、受付状態、登録区分、主催・補足・外部リンク、トップのカード（出す／写真／種目の文言）、**要項・申込用紙・ドロー・結果・当日の写真**（画像と PDF のブロック）、**成績**（種目・順位・名前の繰り返し）、取り込みずみの素材（編集不要） |
| イベント情報 `event_info` | （トップの「イベント情報」欄は 2026-10 に外したので、今はどのページにも出ない）| タイトル、開催日、日時の文言、会場、紹介文、画像、リンク先、バッジ、並び順 |
| （サイト設定）Settings → Social | — | YouTube・Instagram・X・Facebook のアカウント名。フッターとリンク集に出る |

受付状態・登録区分・区分・分類の選択肢は日本語の文言で、コード側（`src/data/schedule.js` の `STATE_KEY` など）で英字のキーに戻す。
受付状態に「本日開催」を足した（移行前はトップのカードだけにあった状態）。

大会のページ（`event-<slug>.html`）は、素材・成績・補足・外部リンクのどれかがある大会にだけ作られる。
まだ何も無い大会は一覧に名前だけ出て、リンクにならない（移行前と同じ）。素材を足して公開するとページができる。

## ファイル

```
astro.config.mjs        server 出力・Cloudflare アダプタ・EmDash（D1／R2）・Workers Cache の規則
wrangler.jsonc          Worker の設定（D1 と R2 の名前、セッション用 KV の ID、Cron、キャッシュ）
src/worker.ts           Worker の入口（EmDash の定期処理）
src/live.config.ts      EmDash を Astro の Live Collections に登録（決まり文句）
src/lib/cms.js          EmDash から読んで、ページが使う形に組む入口（1 リクエストに 1 回）
src/data/*.js           組み立ての道具（news / schedule / events / tournaments / eventinfo）。results.js は旧結果の正本
src/data/*.json         移行前のデータ（seed の入力。results.json 以外はもう公式サイトには使われない）
seed/seed.json          内容モデルと移行時の内容（tools/build_seed.mjs が生成）
.github/workflows/deploy.yml   main への push で wrangler deploy
```

## 設置手順（はじめて配備するとき）

> **2026-10-22 に配備ずみ。** 公開 URL は https://tcta-site.tcta-admin-worker.workers.dev/ 、
> 管理画面は https://tcta-site.tcta-admin-worker.workers.dev/_emdash/admin/ 。初回セットアップと管理者のパスキー登録も済み。
> 以下は記録。つまずいた点：R2 はダッシュボードで有効化（支払い方法の登録）してから
> `npx wrangler r2 bucket create tcta-site-media` で作る必要があった。セッション用 KV は最初の配備で作られ、
> その ID を `wrangler.jsonc` に書いておかないと 2 回目以降の配備が「同じ名前がある」で止まる。

Cloudflare アカウントは配備ずみの管理アプリと同じもの（t.c.t.a.r7@gmail.com）を使う。Free プランでよい。

1. 手元で道具を入れ、ログインする。
   ```bash
   npm install
   npx wrangler login
   ```
2. **暗号鍵**を作り、Worker の秘密情報に入れる。プラグインの設定などを暗号化する鍵で、失うと復号できない。
   作った値は協会のパスワード管理に控える。
   ```bash
   npx emdash secrets generate            # 値だけ表示
   npx wrangler secret put EMDASH_ENCRYPTION_KEY
   ```
3. **配備**する。最初の配備で D1（`tcta-site`）と R2（`tcta-site-media`）が名前どおりに作られる。
   ```bash
   npm run deploy        # astro build && wrangler deploy
   ```
   `https://tcta-site.<アカウント>.workers.dev` が公式サイトの URL になる。
4. **初回セットアップ**。`https://…workers.dev/_emdash/admin/` を開くと設定画面に転送される。
   - サイト名・キャッチコピー → **「サンプルの内容を含める」を選ぶ**（移行時のお知らせ・大会・イベント情報が入る）
   - 管理者のメールアドレス → **パスキーを登録**（Face ID・指紋・PIN）
   - 配備先の URL でセットアップすること。パスキーはその URL に結びつく（独自ドメインに移すときは管理画面の
     「Change domain」で移す）。
5. **自動配備**。リポジトリの Secrets に `CLOUDFLARE_API_TOKEN`（Workers Scripts: Edit／D1: Edit／Workers R2 Storage: Edit）と
   `CLOUDFLARE_ACCOUNT_ID` があれば、以後は `main` に push するだけで配備される（`deploy.yml`）。
6. 全ページを見て回る（GitHub Pages の旧サイトは 2026-10-23 に公開を止めた）。
7. **編集者を招く**。管理画面の Users から招待する（役割：Editor＝内容すべて／Author＝自分の記事）。
   招待メールを送るにはメールの設定（Resend など）が要る。設定前は、管理者がその場でパスキーを登録してもらう。
8. 独自ドメイン（`www.tottori-tenis.net`）に移すときは、DNS を Cloudflare に置き、`wrangler.jsonc` に
   `"routes": [{ "pattern": "www.tottori-tenis.net", "custom_domain": true }]` を足して配備する。
9. GitHub Pages の公開（Settings → Pages）を止める（2026-10-23 済み）。

## 更新のしかた（編集者）

- **お知らせ**：管理画面 → お知らせ → 新規。日付は `2026-10-12` の形。リンク先はサイト内のページ（`event-r8-enetopia.html` など）。
  「目立たせる」にチェックすると全ページ上部の赤い帯に出る（中止・延期）。**保存 → 公開**で反映。
- **大会の受付状態**：大会 → 該当の大会 → 受付状態を変えて公開。トップのカードの表示も変わる。
- **要項・ドロー・結果・写真**：大会 → 該当の大会 → 「要項・申込用紙・ドロー・結果・当日の写真」にブロックを足す。
  画像は「画像」ブロック、PDF は「PDF」ブロック。種類（要項／ドロー／結果／当日の写真…）を選び、必要なら説明を書く。
  公開すると、その大会のページに移行前のものの後ろに並ぶ。
- **成績**：大会 → 成績 の行を足す（種目・順位・名前）。同じ種目は行をまとめて書く。
- **新しい年度の大会**：大会 → 新規。年度（西暦）・通し番号・区分「協会主催」・種目・開催日・期日の表記・会場・締切・登録区分を入れる。
  slug は `r9-tobu-singles` のように英小文字で付ける（ページの URL になる）。
- **SNS（YouTube・Instagram・X・Facebook）**：Settings → Social にアカウント名（`@tcta-tottori` のようなハンドル。
  URL をそのまま貼ってもよい）を入れて保存する。入れたものだけが、全ページのフッター（ロゴの下）と
  リンク集の「協会の公式アカウント」に出る。空にすると消える（`src/data/social.js`）。
- **公開の反映**：公開した瞬間に Workers Cache が消え、次の表示から新しくなる（数秒）。
- **下書き・比較・履歴**：記事ごとに下書きを保存でき、公開前に「比較」で差分が見られる。公開後も「リビジョン」から戻せる。

## AI からの更新

- **Claude（アプリ）**：設定 → コネクタ → カスタムコネクタに `https://<サイト>/_emdash/api/mcp` を足す。EmDash の
  ログイン画面でパスキー認証し、許可する操作（内容の読み書き・メディア…）を選ぶ。
  以後「10月4日の大会の要項を公開したというお知らせを下書きして」などと頼める。
- **Claude Code／Codex**：同じ URL を MCP として登録する。長期のトークンは管理画面 → API tokens で発行（`ec_pat_…`）。
  `npx emdash login --url https://<サイト>` でも CLI から操作できる（`npx emdash content list news` など）。
- 権限はログインした人の役割で決まる（Editor なら内容すべて、Author なら自分の記事）。
  トークンの scope でさらに絞れる。Admin の操作（コレクションの定義変更）は AI に渡さない。
- EmDash の公式スキル（`npx skills add emdash-cms/skills`）を入れると、Claude Code がこのサイトのコレクション
  定義やクエリ API を正しく扱う。

## 運用のメモ

- **バックアップ**：D1 の Time Travel が Free プランで 7 日。年に数回、
  `npx wrangler d1 export tcta-site --remote --output backup.sql` で手元にも置く。R2 の中身は
  `npx wrangler r2 object` か S3 互換の道具で別に取る。
- **EmDash の更新**：`npm update emdash @emdash-cms/cloudflare` → `npm run build` → 配備。
  メジャー更新のときは公式の「Upgrade」ページを読む。更新が速い（v1.0 から 1 か月で v1.3）。
- **配備とキャッシュ**：配備するたびに公開ページのキャッシュは空になる（最初の表示だけ少し遅い）。
  エラー応答（404・500・503）はキャッシュしない（`src/middleware.ts`）。
- **手元で動かす**：`npm run dev` で http://localhost:4321/ 。管理画面は `/_emdash/admin/`。初回は
  `npx emdash secrets generate --write .env` で鍵を作る。D1 と R2 の代わりに手元の `.wrangler/` に保存される。
  内容を入れるには `curl -X POST http://localhost:4321/_emdash/api/setup -H 'content-type: application/json'
  -H 'origin: http://localhost:4321' -d '{"title":"鳥取市テニス協会","includeContent":true}'`
  （seed が大きいので、`seedComplete: true` が返るまで 2〜3 回叩く）。CLI は localhost なら認証なしで通る。
- **内容モデルを変えるとき**：`tools/build_seed.mjs` の `collections` を直して `node tools/build_seed.mjs`。
  配備ずみのサイトには seed は再適用されないので、管理画面の Schema か MCP の `schema_*` で同じ変更を加える。
- **プラグインの隔離実行**は Workers Paid プランが要る。使う予定は無い。
- **お問い合わせフォーム**の送信先はまだ無い。EmDash の Forms プラグイン（ネイティブ）か、同じ Worker の API ルートが候補。
- **旧サイトの結果**（results.json）を EmDash に移すのは、ページ本文のブロック化（architecture.md 段階 2）と一緒に検討する。

## 移行時の検証（2026-10-21）

- 移行前の `main` を静的ビルドした 321 ページと、EmDash 版のサーバー描画を 1 ページずつ比べ、
  CSS／JS の版の印と EmDash の編集ボタン用スクリプトを除いて**全ページ同一**であることを確認した。
- 手元（Cloudflare アダプタ・ローカル D1）で `npm run dev`・`npm run build` とも通る。
  ビルド中に管理画面の Google Fonts を取りに行って失敗する警告が出るが、外部通信を絞った環境のためで、
  GitHub Actions では出ない。
- `wrangler deploy` と初回セットアップは、協会の Cloudflare アカウントでの作業（上の設置手順 1〜4）が必要で、
  このリポジトリの変更には含まれない。

---

## 検討の経緯（2026-10-21 時点のメモ）

2026-10-21 時点の整理。対象は「WordPress はもう古い。Cloudflare の無料 CMS『EmDash』が AI 時代の正解だった」
（YouTube・KEITO【AI&WEB ch】）で紹介された EmDash を、このサイトに使うとしたら何が変わるかを見たもの。
動画の内容は公式ドキュメント（リポジトリ `emdash-cms/emdash` の `docs/`）と、手元で実際に動かして確かめた。

### EmDash とは（確認ずみの事実）

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

### 手元で試した結果

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

### このサイトで何が変わるか

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

### 進めるなら（2 つの案）

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

### 結論

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
