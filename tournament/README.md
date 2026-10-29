# 大会運営システム（Cloudflare 版）

GitHub Pages で動いている大会運営システム（[`tcta-tottori/tournament-management-app`](https://github.com/tcta-tottori/tournament-management-app)）を、
公式サイト・会員システムと同じ Cloudflare に載せた版です。**GitHub Pages 版はそのまま残し**、こちらは別の URL で動きます。
公式サイト本体（リポジトリ直下の Astro ＋ EmDash）とは **別の Worker・別の package.json** で、サイトのビルドや配備には影響しません。

- **https://tcta-tournament.tcta-admin-worker.workers.dev/** … 運営画面（データ・エントリー・対戦順・ドロー・配信・印刷・設定）
- **https://tcta-tournament.tcta-admin-worker.workers.dev/view** … 観戦ページ（協会サイトに貼る固定 URL）

検討の経緯と費用の見積もりは [`docs/ops-systems-cloudflare.md`](../docs/ops-systems-cloudflare.md)。

## GitHub Pages 版との違い

| | GitHub Pages 版 | Cloudflare 版（ここ） |
| --- | --- | --- |
| アプリ本体 | GitHub Pages（`/tournament-management-app/`） | Workers Static Assets（ルート `/`）。配信は無料・無制限 |
| 観戦配信・端末同期の中継 | Render 無料プランの Node サーバー（15 分で眠り、起きるのに数十秒） | 同じ Worker の `/ws`（Durable Object「SyncRoom」）。眠らない。預かった大会データは SQLite に保存され、配備や再起動で消えない |
| 中継の設定 | `SYNC_SERVER_URL` をリポジトリの Variables に入れてビルド | 不要（開いている URL と同じ Worker につなぐ） |
| 観戦端末からの書き込み | 中継サーバーはそのまま流す | 観戦端末（`viewer`）からは大会データの変更を流さない。データの要求だけ通す |
| 音声コール（Gemini TTS） | 鍵をビルドに埋め込む（ブラウザから見える）か、Render の中継が代理 | 同じ Worker の `/api/gemini-tts` が代理。鍵は Worker の secret に置き、ブラウザには渡さない。他のサイトからは使えない |
| 見た目 | 赤いサイドメニューの独自デザイン | 協会サイト（開発中）と同じ枠：白いヘッダーと横一列のナビ、右上の赤いブロック、灰色のページ見出しと背景の大きな英字、黒地のスマホメニュー、黒地のフッター。色・字・角もサイトにそろえた |
| 端末内のデータ | `tcta-tottori.github.io` の IndexedDB | 別の URL なので別。移すときは旧版の「設定 → バックアップ」で書き出し、こちらで復元する |

画面の中身（取り込み・ドロー・スコア入力・印刷などの処理）は GitHub Pages 版と同じコードです（GitHub Pages 版の main `70fe04b`（2026-10-18）から写した。写すときに、元から型検査で落ちていた 19 か所だけ直してある）。
旧版に入った修正をこちらにも入れるときは、`src/features/` 以下を同じように直してください。

## 画面の構成（協会サイトにそろえた点）

- **ヘッダー** … サイトと同じ白い帯。ロゴの横に「大会運営 SYSTEM」の札。ナビは作業の段階ごとに 6 つにまとめた
  （大会準備／大会進行／配信／印刷／マニュアル／設定）。まとまりの中の画面は、ページ見出しの下のタブで切り替える
  （会員システムの事務局画面と同じ作り）。右上の赤いブロックは「観戦ページ」
- **大会の状況の帯** … ヘッダーの直下に墨色の帯。大会名・進捗・コートの空き・時間超過を流す（サイトの「重要なお知らせ」の帯の位置）
- **ページ見出し** … 灰色の帯にパンくず、■ 英字／日本語の見出し（白いスラッシュで塗り替わる）、背景の大きな英字。
  運営の作業の邪魔にならないよう、サイトより一段低くしてある。見出しの下に読み込み中の大会名・日程・会場
- **スマホのメニュー** … サイトと同じ黒地が下からせり上がり、行が下線の下から順に出る
- **フッター** … サイトと同じ黒地に漂う四角。各画面へのリンク・観戦ページ・協会サイト・バージョン
- 印刷の画面だけは、左右 2 列を画面の高さで並べるためフッターを出さない
- 色・書体・角・影は `src/index.css` のテーマ値をサイトの値に置き換えて、各画面の中身にも効かせた
  （赤 `#D8232A`、墨 `#1A1A1A`、Noto Sans JP／Barlow／Jost、角は 0〜4px、影は浮かせる部品だけ）

枠の部品は `src/components/site/`（`SiteChrome.tsx`・`DecoSquares.tsx`）、CSS は `src/styles/site.css`。
いずれもサイトの `src/components/*.astro` と `public/assets/css/style.css` から移したもので、サイト側を変えたらこちらもそろえてください。
ロゴは `public/site/`（サイトの `public/assets/img/` の写し）。

## 手元で動かす

```bash
cd tournament
npm ci --legacy-peer-deps
npm run preview        # ビルドして wrangler dev（http://localhost:8787）。中継・音声の API も動く
npm test               # 別のターミナルで。動いている Worker に対して中継と API を確かめる（11 項目）
```

画面だけを直すときは `npm run dev`（Vite、http://localhost:5173）でもよいが、中継（`/ws`）と音声（`/api/*`）は動かない。

- `npm run typecheck` … アプリ・Vite 設定・Worker の型検査
- `BASE=https://tcta-tournament.tcta-admin-worker.workers.dev npm test` … 配備先に対して同じ確認をする

## 配備

`tournament/` を変更して push すると [`.github/workflows/deploy-tournament.yml`](../.github/workflows/deploy-tournament.yml) が
型検査 → ビルド → `wrangler deploy` → 配備先へのスモークテストを行います。公式サイト本体と同じ Secrets（`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`）を使います。
手元からは `npm run deploy`。

### 配備のあとに一度だけ行うこと

1. **Google ドライブ連携** … Google Cloud コンソールの OAuth クライアント（`316429350105-…`）の「承認済みの JavaScript 生成元」に
   `https://tcta-tournament.tcta-admin-worker.workers.dev` を足す。足すまでは、この URL でドライブに接続できない（GitHub Pages 版はそのまま使える）
2. **音声コール（任意）** … Gemini の API キーを Worker に入れる。リポジトリの Secrets に `GEMINI_API_KEY` を入れておけば配備のたびに入る。
   手元からなら `npx wrangler secret put GEMINI_API_KEY`。入れなければブラウザ内蔵の声だけで動く（既定もこちら）
3. **協会サイトの観戦リンク** … 観戦ページの URL を `https://tcta-tournament.tcta-admin-worker.workers.dev/view` に差し替える（Render を止めるときに）

## 構成

```
tournament/
├── wrangler.jsonc            Worker 名 tcta-tournament、静的ファイル（dist/）、Durable Object「SyncRoom」
├── worker/
│   ├── index.ts              入口。/ws をルームごとの Durable Object へ、/api/gemini-* を Gemini へ、ほかは静的ファイル
│   └── sync-room.ts          中継（join / leave / broadcast / cache / ping。Render 版 sync-server と同じ約束事）
├── src/
│   ├── components/site/      協会サイトと同じ枠（ヘッダー・スマホのメニュー・ページ見出し・タブ・状態の帯・フッター）
│   ├── components/layout/AppLayout.tsx   運営画面の骨組み（ナビのまとまり・タブ・状態の帯）
│   ├── features/view/PublicLayout.tsx    観戦ページの骨組み
│   ├── styles/site.css       サイトの style.css から移した枠の CSS
│   ├── index.css             テーマ値（色・書体・角・影）をサイトにそろえたもの＋各画面の部品
│   └── features/…            画面の中身（GitHub Pages 版と同じ）
├── public/site/              協会ロゴ（サイトの写し）
└── scripts/smoke.mjs         中継と API の動作確認
```

## 費用と上限

Workers Free プランで動きます（月 0 円）。静的ファイルの配信は数に入らず、数えられるのは `/ws` の接続と受信メッセージ（20 通で 1 リクエスト）と `/api/*` だけです。
ただし Free の「1 日 10 万リクエスト」は公式サイト・会員システムと **アカウント全体で共有** なので、
大会当日に観戦が集中するようになったら Workers Paid（月 5 ドル）を検討してください（[`docs/ops-systems-cloudflare.md`](../docs/ops-systems-cloudflare.md)）。

預かる大会データ（観戦端末への初期配信用）は、1 ルームにつき最新の 1 件だけを Durable Object の SQLite に置き、
書き込みは 10 秒に 1 回までに間引いています。3 日より古いものは観戦端末に送りません。

## まだ残っていること

- 運営画面にログインは無い（GitHub Pages 版と同じ）。URL を知っていれば誰でも運営画面を開ける。
  本番で使う前に、Cloudflare Access で `/`（観戦ページ `/view*` と `/ws`・`/api/*` を除く）を協会の役員だけに絞るのがよい
- 観戦ページの固定ルーム（`TCTA01`）に運営端末として入れば、誰でも大会データを配信できてしまう（これも GitHub Pages 版と同じ）。
  運営端末の接続に合言葉を付けるのは次の段階
- ドロー会議システムとの受け渡しは、これまでどおり Excel
