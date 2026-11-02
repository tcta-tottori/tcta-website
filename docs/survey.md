# アンケート（ホームページについて）

ホームページの中にアンケートのページを置き、回答はサイトのデータベース（D1）に保存する。
回答の読み出しと集計は、鍵を知っている人だけができる。

| 役割 | 場所 |
|---|---|
| 質問・選択肢・受付期間 | `src/data/survey.js`（`SURVEY.id`・`opensAt`・`closesAt`） |
| アンケートのページ | `src/pages/survey.html.astro`（`/survey.html`） |
| 受付（保存） | `src/pages/api/survey.ts`（`POST /api/survey` → D1 の `survey_responses`） |
| 読み出し・集計 | `src/pages/api/survey-results.ts`（`GET /api/survey-results`。鍵が要る） |
| 集計の道具 | `tools/survey_report.mjs` |
| お知らせ | `src/data/official-extra.js` の `EXTRA_NEWS`（`survey.html` へのリンク） |

## Google フォームではなく、この形にした理由

- 回答がサイトのデータベースに入るので、Claude Code から鍵1つで読み出し・集計できる
  （Google フォームの回答はスプレッドシートに入り、Claude Code から読むには Google の接続が別に要る）。
- 見た目がサイトと同じで、スマホでも答えやすい。外部サービスの広告やログインも無い。
- 受付期間を過ぎると、ページは自動で「受付終了」になり、受付（API）も止まる。
- CSV（Excel で開ける）でも取り出せる。

## 鍵（合言葉）

- 鍵そのものはリポジトリにも Cloudflare にも置かない。`wrangler.jsonc` の `vars.SURVEY_KEY_SHA256` に
  **鍵の SHA-256** だけを置いている（リポジトリは公開なので、元に戻せない形だけ）。
- 鍵は協会の担当者が控えておく。Claude Code のクラウド環境で使うときは、環境の設定の
  「シークレット（環境変数）」に `SURVEY_READ_KEY` として入れておくと、毎回伝えなくてよい。
- 鍵を変えるとき：新しい鍵を作り（例：`openssl rand -hex 24`）、`printf %s '<鍵>' | sha256sum` の値を
  `SURVEY_KEY_SHA256` に入れて配備する。

## 回答を見る

Claude Code に「アンケートの結果を見せて」と頼めば、次を動かして集計を出す。

```bash
SURVEY_READ_KEY=<鍵> node tools/survey_report.mjs
```

```bash
SURVEY_READ_KEY=<鍵> node tools/survey_report.mjs --csv survey.csv
```

ブラウザで CSV をそのまま落とすなら（鍵がアドレスに残るので、自分の端末だけで）：
`https://tottori-city-tennis.com/api/survey-results?format=csv&key=<鍵>`

## 次のアンケートをするとき

`src/data/survey.js` の `id` を新しくし（例：`site-2027-04`）、期間と質問を書き換えて、
`EXTRA_NEWS` にお知らせを足す。前の回答は `--survey site-2026-11` で読み出せる。
