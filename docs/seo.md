# 検索（SEO）・SNS 共有・アイコン

## 入っているもの

| もの | 場所 | 内容 |
|---|---|---|
| 公開アドレス | `astro.config.mjs` の `site` | 下のすべてのアドレスの元。**本番のドメインに移すときはここだけ直す** |
| 代表アドレス（canonical） | `src/layouts/Base.astro` | ページごとに公開アドレスを示す。トップは `/`（`/index.html` と同じページ） |
| SNS で共有したときの表示（OGP） | 同上 | タイトル・説明・画像。画像は共通の `public/assets/img/ogp.jpg`（1200×630）、大会ページは当日の写真があればそれ |
| 構造化データ（JSON-LD） | 同上・`src/pages/event-[slug].html.astro` | 全ページに協会（SportsOrganization。SNS の公式アカウントつき）、トップにサイト（WebSite）、大会ページに大会（SportsEvent。日付・会場と住所・主催） |
| サイトマップ | `src/pages/sitemap.xml.ts` → `/sitemap.xml` | 固定のページ、大会のページ・結果のページ、令和6年度までの結果、テニス祭りの各回 |
| robots.txt | `src/pages/robots.txt.ts` → `/robots.txt` | 全体を許可。管理画面（`/_emdash/`）と `/api/` は除く。サイトマップの場所 |
| 検索に出さない | `Base.astro` の `noindex` | 404 のページ。また、公開アドレス以外（独自ドメインに移ったあとの workers.dev など）で見られたページ |
| アイコン | `public/favicon.ico`、`public/assets/img/` の `favicon-32/48/192.png`・`icon-512.png`・`apple-touch-icon.png` | 協会ロゴの頭（「T.T」と赤い四角）を正方形にしたもの。ロゴ全体は小さくすると読めないため |
| ホーム画面に追加したとき | `public/site.webmanifest` | 名前・アイコン |

## 本番公開のときにすること

1. **公開アドレスを本番のドメインにする**：`astro.config.mjs` の `site` を `https://（ドメイン）` に直して配備する。
   ドメインを Worker につなぐのは `wrangler.jsonc` の `routes`（README）。
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
