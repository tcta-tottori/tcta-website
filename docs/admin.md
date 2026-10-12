# 管理アプリ（サイト更新）— 構成と設置手順

2026-10-10 時点。スマホ・PC 共通の専用 Web アプリ（PWA）から、大会の結果・写真・PDF と
お知らせを更新し、GitHub Pages の公式サイトに反映するための仕組み。

## 全体像

```
   編集者（スマホ・PC）
     │  ログイン（名前＋パスワード）
     ▼
 ┌──────────────────────────────┐
 │ Cloudflare Worker  tcta-admin │  admin/   … 画面（PWA。/ で配信）
 │                               │  worker/  … API（/api/*）・ログイン・下書き・公開
 │   KV: 下書き／画像／公開履歴   │
 └──────────────┬────────────────┘
                │ GitHub REST API（Contents / Git Data / Actions）
                │ 秘密のトークンは Worker の中だけ
                ▼
 ┌──────────────────────────────┐
 │ GitHub  tcta-tottori/tcta-website  main │ src/data/*.json と public/assets/… に 1 コミット
 └──────────────┬────────────────┘
                │ push → .github/workflows/deploy.yml（Astro でビルド）
                ▼
 ┌──────────────────────────────┐
 │ GitHub Pages（公式サイト）      │  ← 閲覧者はいままでどおりここを見る
 └──────────────────────────────┘
```

- 公式サイトは **GitHub Pages のまま**。管理アプリは別の URL：**https://tcta-admin.tcta-admin-worker.workers.dev/**（2026-10-10 配備。Cloudflare アカウントは t.c.t.a.r7@gmail.com）。
- 画面側の権限表示は目安で、**保存・公開の API 側でも毎回ログインを確かめる**（`worker/src/api.js`）。
- GitHub への書き込みトークンは Worker の秘密情報（`wrangler secret`）にだけ置く。リポジトリにも画面にも無い。

## できること（第1段階）

| 画面 | できること | 書き換わるファイル |
| --- | --- | --- |
| 大会 | 受付状態（受付中／まもなく／受付終了／終了）・締切・補足の変更 | `src/data/schedule.json`、`src/data/tournaments.json`（トップのカードの状態） |
| 大会 | 結果・写真・ドロー・要項・申込用紙への画像／PDF の追加、並べ替え、取り外し | `src/data/events.json`、`public/assets/img/events/<slug>/`、`public/assets/pdf/events/<slug>/` |
| 大会 | 種目ごとの優勝・準優勝（文字） | `src/data/winners.json` |
| 大会 | 一覧にあるがページの無い大会に、ページを作る | `src/data/events.json` |
| お知らせ | 投稿・修正・削除。「目立たせる」で全ページ上部の赤い帯に出す（中止・延期）。本文か写真を入れると専用ページ `news-<id>.html` ができる | `src/data/news.json`・`public/assets/img/news/<id>/` |
| プレビュー | 下書きを反映した見え方（公式サイトの CSS を使って画面内に描く） | — |
| 公開 | 下書きをまとめて 1 コミット → 公開処理の進み具合 → 「公開完了」 | — |
| 履歴 | 公開の記録。「元に戻す」でその公開を取り消す（取り消しも履歴に残る） | — |

画像は端末側で縮めてから送る（書類は長辺 1800px、写真は 1400px。WebP に変換できない端末は JPEG）。
下書きは協会で 1 つを共有する（編集者は少人数の前提）。公開するまで公式サイトには何も出ない。

当初は写真・PDF もいままでどおりリポジトリに置く。1 GB の上限（現在 約 300 MB）に近づいたら R2 などへ分ける。

## ファイル

```
admin/                 管理アプリ（静的。Worker がそのまま配信）
├── index.html / app.js / style.css
├── manifest.webmanifest / sw.js   ホーム画面に追加するための PWA 設定
└── icons/
worker/
├── wrangler.toml      Worker の設定（KV の id、公開サイトの URL など）
├── src/index.js       入口（/api/* → API、それ以外 → admin/）
├── src/api.js         API 本体（下書き・アップロード・公開・履歴・元に戻す）
├── src/auth.js        ログインとセッション Cookie
├── src/github.js      GitHub への読み書き（1 公開 = 1 コミット）
├── src/data.js        扱うファイルの一覧と入力の確かめ
├── scripts/register-editors.mjs 編集者の名前とパスワードを対話で聞いて EDITORS に登録する
├── scripts/hash-password.mjs   ハッシュだけ作る
└── scripts/local-dev.mjs       手元で動かす（Cloudflare も GitHub も使わない）
.github/workflows/admin-deploy.yml   admin/ と worker/ が変わったら Worker を配備
```

## 手元で動かす（設置前の確認）

```bash
npm run dev                          # 公式サイト（http://localhost:4321）
node worker/scripts/local-dev.mjs    # 管理アプリ（http://localhost:8788）  test / localtest123
```

GitHub の代わりに、このリポジトリを一時フォルダに clone したものへコミットする。本物の main には触れない。
「公開」は 6 秒後に「公開完了」になる。

## 設置手順（はじめて）

2026-10-10 時点で 1〜4・6 の SESSION_SECRET・7 まで済み。残りは **GITHUB_TOKEN と EDITORS の登録**（2・5・6）。

1. **Cloudflare アカウント**を協会名義（または担当者名義）で作る。Free プランでよい。
2. **GitHub のトークン**を作る。GitHub → Settings → Developer settings → Fine-grained personal access tokens。
   - Repository access: `tcta-tottori/tcta-website` だけ
   - Permissions: **Contents: Read and write**、**Actions: Read**（公開の進み具合を見るため）
   - 有効期限は 1 年にし、切れる前に作り直す（切れると「公開」が失敗する）。
3. 手元で Worker の道具を入れ、ログインする。
   ```bash
   cd worker && npm install && npx wrangler login
   ```
4. **KV** を作り、出てきた `id` を `worker/wrangler.toml` の `REPLACE_WITH_KV_NAMESPACE_ID` に書く。
   ```bash
   npx wrangler kv namespace create DRAFTS
   ```
5. **編集者**を登録する。名前とパスワードを対話で聞いて、そのまま EDITORS に登録する。
   ```bash
   node scripts/register-editors.mjs
   ```
   パスワードは画面に出ない。複数人は続けて入れる（全員ぶんをまとめて登録する。あとから
   1 人足すときも全員ぶんを入れ直す）。ハッシュだけ作りたいときは `node scripts/hash-password.mjs 名前 'パスワード'`。
6. **秘密情報**を入れる（聞かれたら値を貼り付ける）。
   ```bash
   npx wrangler secret put GITHUB_TOKEN     # 2 で作ったトークン
   npx wrangler secret put SESSION_SECRET   # openssl rand -base64 48 などで作った長い文字列
   # EDITORS は 5 のスクリプトが登録する
   ```
7. **配備**する。
   ```bash
   npx wrangler deploy
   ```
   `https://tcta-admin.<アカウント>.workers.dev` が管理アプリの URL になる。
8. スマホでその URL を開き、**ホーム画面に追加**する（iPhone：共有 → ホーム画面に追加／Android：メニュー → ホーム画面に追加）。
9. 以後、`admin/` や `worker/` を直して main に push すると、GitHub Actions が自動で配備する
   （リポジトリの Secrets に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を入れておく）。

公式サイトを独自ドメインに移したら、`wrangler.toml` の `SITE_URL` をその URL に直す
（プレビューが CSS と公開ずみ画像をここから読む）。

## 運用のメモ

- **公開に失敗したとき**：保存（コミット）は済んでいて公開処理（Actions）だけ失敗した場合、
  履歴に残っている。GitHub の Actions の画面でやり直すか、もう一度何かを公開すれば直る。
- **元に戻す**：その公開で変えたファイルを直前の状態に戻す新しいコミットを積む（履歴は消さない）。
  2 つ前の公開を戻すと、その後の公開で同じファイルを変えていた分も一緒に戻るので、直近から順に戻すこと。
- **編集者を外す／足す**：`node scripts/register-editors.mjs` で残す人全員を入れ直す（EDITORS は丸ごと置き換わる）。ログイン中でも次の操作から無効になる。
- **パスワードを忘れた**：同じスクリプトで全員ぶんを入れ直す。
- **tools/build_events.py との関係**：このスクリプトは MANIFEST から `events.json` を丸ごと書き直すので、
  管理アプリで足した大会・画像が消える。管理アプリを使い始めたら、まとめ取り込みは行わないか、
  行う前に `events.json` の差分を確かめること。
- JSON は `JSON.stringify(…, null, 2)` の形（2 スペース・UTF-8）で統一している。手で直すときも同じ形にすると差分が小さい。

## 今後の候補

- 下書きを編集者ごとに分ける／同時編集の衝突を知らせる
- 写真・PDF を R2 に置き、リポジトリを軽くする
- お問い合わせフォームの送信先を同じ Worker に持たせる（docs/cloudflare.md）
- 公式サイトごと Workers Static Assets に移す（Cloudflare は新規には Pages より Workers を勧めている）
