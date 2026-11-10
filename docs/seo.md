# 検索（SEO）・SNS 共有・アイコン

## 入っているもの

| もの | 場所 | 内容 |
|---|---|---|
| 公開アドレス | `astro.config.mjs` の `site` | 下のすべてのアドレスの元。**本番のドメインに移すときはここだけ直す** |
| 代表アドレス（canonical） | `src/layouts/Base.astro` | ページごとに公開アドレスを示す。トップは `/`（`/index.html` と同じページ） |
| SNS で共有したときの表示（OGP） | 同上 | タイトル・説明・画像。画像は共通の `public/assets/img/ogp.jpg`（1200×630）、大会ページは当日の写真があればそれ |
| 構造化データ（JSON-LD） | 同上・`src/pages/event-[slug].html.astro` | 全ページに協会（SportsOrganization。SNS の公式アカウントつき）、トップにサイト（WebSite）、大会ページに大会（SportsEvent。日付・会場と住所・主催） |
| サイトマップ | `src/pages/sitemap.xml.ts` → `/sitemap.xml` | 固定のページ、大会のページ・結果のページ、令和6年度までの結果、テニス祭りの各回 |
| robots.txt | `src/pages/robots.txt.ts` → `/robots.txt` | 全体を許可。管理画面（`/_emdash/`）と `/api/` は除く（管理画面から上げた画像・PDF の `/_emdash/api/media/file/` は許可）。サイトマップの場所 |
| 同じページの別アドレスの転送（301） | `src/worker.ts` | www 付き → www 無し、http → https、末尾に / が付いた .html（`/about.html/`）→ / 無し |
| 検索に出さない | `Base.astro` の `noindex` | 404 のページ。また、公開アドレス以外（独自ドメインに移ったあとの workers.dev など）で見られたページ |
| アイコン | `public/favicon.ico`、`public/assets/img/` の `favicon-32/48/192.png`・`icon-512.png`・`apple-touch-icon.png` | 協会ロゴの頭（「T.T」と赤い四角）を正方形にしたもの。ロゴ全体は小さくすると読めないため |
| ホーム画面に追加したとき | `public/site.webmanifest` | 名前・アイコン |

## 本番公開のときにすること

1. **公開アドレスを本番のドメインにする**：`astro.config.mjs` の `site` は `https://tottori-city-tennis.com`（2026-11 に取得）。
   ドメインは Cloudflare のダッシュボードで Worker（tcta-site）の「設定 → ドメインとルート → 追加 → カスタムドメイン」に
   `tottori-city-tennis.com` と `www.tottori-city-tennis.com` を足してつなぐ。www 付きは `src/middleware.ts` が www 無しへ転送する。
2. **Google Search Console に登録する**（https://search.google.com/search-console ）。
   - 「ドメイン」で登録し、表示される TXT レコードを DNS（Cloudflare）に足して確認するのがいちばん簡単。
   - 「サイトマップ」に `sitemap.xml` を送信する。
   - 「URL 検査」でトップを調べ、「インデックス登録をリクエスト」。
3. **旧サイト（Jimdo）からの引っ越し**：旧サイトのアドレス（よく見られていたページ）から新しいページへの転送（301）を入れると、
   検索の評価を引き継げる。旧サイトのアドレスの一覧が分かれば `src/middleware.ts` に足せる。
4. **確かめる**：
   - リッチリザルト テスト（https://search.google.com/test/rich-results ）に大会ページのアドレスを入れ、「イベント」が出ること。
   - LINE や X に URL を貼って、画像つきで出ること（X は https://cards-dev.twitter.com/validator が無くなったので実際に貼って確かめる）。

## 書き換えるとき

- 共有の画像を変える：`public/assets/img/ogp.jpg`（1200×630 の JPEG）を差し替える。
- アイコンを変える：上の 6 つをまとめて作り直す。
- ページのタイトル・説明：各ページの `title` と `description`（`<Base>` に渡している）。説明は 80〜120 字くらいで、そのページに何があるかを書く。

## Search Console の「インデックスに登録されない」の見方（2026-11-10）

サイトマップの全ページ（371）は、転送・noindex なし、canonical は自分自身で問題なし。届いた要因は次のとおり。

| 要因 | 何のページか | 対応 |
|---|---|---|
| 代替ページ（適切な canonical タグあり） | `/index.html`（代表は `/`）、`?filter=…` 付きのアドレスなど | 意図どおり。何もしない |
| ページにリダイレクトがあります | www 付き、http のアドレス | 意図どおり（http も 301 にした） |
| noindex タグによって除外されました | 404 のページ、アンケートの送信ページ（survey.html） | 意図どおり |
| 重複しています。ユーザーにより、正規ページとして選択されていません | `/about.html/` のように末尾に / が付いたアドレス・http のアドレス（同じページが 200 で返っていた） | 301 で転送するようにした |
| robots.txt によりブロックされました | 管理画面（`/_emdash/`）・`/api/` | 意図どおり。上げた画像・PDF だけ許可した |
