# テニス協会 会員登録・大会エントリー一元管理システム（Phase 1 サンプル）

役員会資料「会員登録・大会エントリー一元管理システムの導入について」と「導入設計書 Ver.1.0」の内容を、
**手元で一通り動かして確かめられる形**にしたサンプルです。
公式サイト本体（リポジトリ直下の Astro ＋ EmDash）とは **別の Worker・別の D1・別の package.json** で動き、
サイト本体のビルドや配備には影響しません（設計書の「会員ポータルは別プロジェクト（サブドメイン）」の構成）。
将来 `tcta-members` リポジトリに切り出すときは、この `members/` をそのまま移せます。

## 公開デモ（インストール不要）

他の人が触って確かめられるデモを Cloudflare Workers に置いています（架空のデータ。誰でも入れ直せます）。

- **https://tcta-members-demo.tcta-admin-worker.workers.dev/**
- 最初に **/dev**（画面上部の黄色い帯「はじめに読む」）を開くと、手順とデモ用のメールアドレス・管理者の一覧があります。
- メールは実際には送りません。ログインリンクは送信後の画面にそのまま出ます（**/dev/mailbox** の送信箱でも見られます）。Stripe は決済ページの代わりにシミュレータが出ます。
- 事務局画面は **/admin/login** で管理者を選ぶだけで入れます（本番では Cloudflare Access に置き換わります）。

`members/` を変更して push すると `.github/workflows/deploy-members.yml` がデモを配備し直します。
データを入れ直すときは /dev の「デモデータを投入」を押してください。

## 手元で動かす

```bash
cd members
npm install
npm run setup      # .dev.vars を用意し、手元の D1（.wrangler/state）にスキーマを作る
npm run dev        # http://localhost:8787
```

1. http://localhost:8787/dev を開き **「デモデータを投入」** を押す（協会 4・クラブ 6・会員 8・大会 3・管理者 6）。
2. 画面上部の黄色い帯から、送信箱・Stripe シミュレータ・事務局ログインに行けます。
3. 一通りの流れを自動で通すには `npm test`（別ポートで `wrangler dev` を起動し、54 項目を確認して終了します）。

### 動作確認の流れ（設計書 §5 のとおり）

| 手順 | 画面 | 確かめること |
| --- | --- | --- |
| 会員登録 | `/login` → 送信箱 `/dev/mailbox` のリンク → `/signup` | パスワード無しのマジックリンク（15 分・1 回限り）。会員番号 `T-26-0001` の発番。同姓同名の仮会員への自動紐づけ |
| 年度登録 | `/registrations/new` → `/pay/…` | 県と市を同時に選べる。協会ごとに支払が分かれる（他協会の資金を預からない） |
| 消込・承認 | `/admin/login`（鳥取市 事務局）→ 消込 → 年度登録 | 振込・PayPay・現金は事務局が消込、そのあと承認で当年度有効。承認メールが届く |
| エントリー | `/tournaments/T-DEMO-OPEN/entry` | 年度登録が無いとエントリーできない。ペアは会員番号・氏名検索（住所・電話は出ない）。ペアにも通知 |
| Stripe | `/pay/…` → シミュレータ | Webhook の署名検証・金額突合。署名無し／金額改ざんは拒否され監査ログに残る |
| 運営アプリ連携 | 事務局の大会画面 → トークン発行 → `/api/v1/tournaments/T-DEMO-OPEN/entries.json?token=…` | 氏名・クラブ・クラスだけの JSON。大会単位・期限付きトークン |
| ショップ代行入力 | `/admin/login`（テニスショップ）→ `/shop` | 紙受付の代わりに入力。現金受領でその場で確定・領収書番号。個人情報は見えない。当日分だけ取消可 |
| クラブ管理 | yamada@example.com でログイン → `/club` | 自クラブの氏名と登録状態だけ閲覧。まとめて年度登録・一括支払 |
| 名寄せ | 事務局 → 名寄せ | Excel 取込みで同姓同名があれば候補に。自動結合せず事務局が確定、取り消し可 |
| 権限 | 管理者を変えてログイン | 大会運営は担当大会のみ・名簿不可。閲覧は氏名のみ。システム管理者は設定のみで個人情報を見ない |
| 定期実行 | `/__scheduled?cron=0+0+*+*+*` | 締切リマインド、締切処理（支払待ちの自動キャンセル／保留）、継続登録リマインド、退会 2 年後の連絡先削除、R2 バックアップ |
| 監査ログ | 事務局 → 監査ログ | 閲覧・出力・更新が「誰が・いつ・何を」で残る。トリガーで UPDATE/DELETE 禁止 |

デモの管理者: `sysadmin@`（システム管理者）/ `tottori-admin@`（鳥取市 協会管理）/ `pref-admin@`（県 協会管理）/
`unei@`（大会運営・秋季ダブルス担当）/ `viewer@`（閲覧）/ `shop@`（ショップ）。いずれも `example.com`。

## 参加資格（大会ごとに必要な年度登録）

大会ごとに「どの協会の年度登録が必要か」を組み合わせで持ち、エントリー時に代表とペアの両方を自動判定します
（`tournaments.eligibility_json`、判定は `src/services/eligibility.ts`）。年度は開催日を各協会の年度切替月で読み替え、
承認済みの年度登録だけを数えます。

| 例 | ルール | デモの大会 |
| --- | --- | --- |
| 市登録が必要（県登録だけでは不可） | `[["tottori-city"]]` | 鳥取市秋季ダブルス大会 |
| 県登録が必要 | `[["tottori-pref"]]` | 鳥取県選手権 |
| 市 または 県（どちらかでよい） | `[["tottori-city"],["tottori-pref"]]` | 鳥取市オープンシングルス |
| 県 と 市 の両方が必要 | `[["tottori-pref","tottori-city"]]` | 県選手権 鳥取市予選 |
| 米子市登録が必要 | `[["yonago-city"]]` | 米子市ダブルス選手権 |
| 誰でも参加できる | `[]` | 鳥取市ふれあいテニス大会 |

事務局の大会フォームでは定型（主催協会／県／県＋主催／県 or 主催／不要）から選ぶか、協会コードで
`P+T` と `K` のように 1 行 1 選択肢で指定します。ペアも同じ条件にするか（既定）、代表だけ判定するかを大会ごとに選べます。
会員側は大会一覧・大会詳細に「出場できます／登録が足りません（何が足りないか）」が出て、ペア検索の結果にも可否が付きます。
公開 API（`/api/v1/tournaments`）にもルールと説明文が入るので、協会サイト側でも同じ表示ができます。

## 見た目と動き（協会サイトにそろえる）

画面は協会サイト本体（リポジトリ直下の Astro サイト）と同じ CSS / JS を使います。ロゴだけは特定の協会のものを使わず、文字のロゴ（`APP_BRAND_EN`・`APP_NAME`）にしてあり、フッターには参加協会を DB から並べます。
`scripts/sync-assets.mjs` が `../public/assets` の `style.css`・`main.js`・ロゴ画像を `members/public/assets/` に複製し、
`npm run dev` / `npm test` / `npm run deploy`（と GitHub Actions）の前に自動で走ります（複製先は Git 管理外）。
本体のデザインが変わればポータルも追従します。

- レイアウト（`src/views/layout.ts`）は本体の `Base.astro` と同じ骨組み：追従ヘッダー、右上の赤いブロック、
  ハンバーガーの札配りメニュー、ページ見出しのスラッシュ塗り替え、背景の大きな英字、スクロールで現れるブロック、
  押したときの波紋、CTA、漂う四角のフッター
- ポータル固有の部品（表・フォーム・バッジ・カード）は `public/members.css` で本体の規則（赤は入口だけ・直角・細い罫線）に合わせて上書き
- `public/members.js` は本文のブロックに `.rv` を付けるだけ。動きは本体の `main.js` が担う
- スクリプトは同一オリジンのファイルと nonce 付きの 1 本だけ（CSP）。Google Fonts は本体と同じ

## 構成

```
members/
├── wrangler.jsonc        Worker 名 tcta-members、D1、Cron（毎日 09:00 JST）、静的ファイル
├── migrations/0001_init.sql  設計書 §4 のテーブル（members / clubs / associations / registrations /
│                              tournaments / entries / payments / admins / audit_log …）
├── src/
│   ├── index.ts          入口。CSP（script-src 'none'）・HSTS・CSRF・セッション解決・ルーティング・Cron
│   ├── routes/portal.ts  会員ポータル（登録・ログイン・マイページ・年度登録・エントリー・支払・クラブ管理）
│   ├── routes/admin.ts   事務局（承認・消込・会員・大会・トークン・取込み・名寄せ・監査ログ・管理者・協会）
│   ├── routes/shop.ts    ショップの代行入力
│   ├── routes/api.ts     公開 API（大会一覧）、運営アプリ向け JSON、Stripe Webhook
│   ├── routes/dev.ts     開発モードだけ: 送信箱・Stripe シミュレータ・デモデータ
│   ├── jobs.ts           定期実行
│   ├── seed.ts           デモデータ
│   ├── services/         members（暗号化・会員番号・検索・名寄せ）、payments（消込→確定→通知）、permissions（ロール表）
│   ├── lib/              crypto（AES-GCM 列暗号化・盲検索 HMAC）、access（Cloudflare Access JWT）、stripe、mail、session、audit、ratelimit、ulid、fiscal
│   └── views/layout.ts   共通レイアウト（本体の Base.astro と同じ骨組み）
├── public/members.css, members.js   本体にそろえるための上書き（本体の assets は sync-assets が複製）
└── scripts/setup.mjs, smoke.mjs
```

## 設計書との対応と、サンプルで置き換えているもの

| 設計書の要素 | この実装 | 本番で必要なこと |
| --- | --- | --- |
| Pages（会員ポータル・管理画面） | 同じ Worker がサーバー描画。本体サイトと同じ CSS / JS で見た目をそろえる | そのまま配備可。Astro 側に「エントリーする」ボタンを置く |
| Workers API（Hono） | `src/` 全体 | — |
| D1（会員マスター） | `migrations/` | `wrangler d1 create tcta-members` して `database_id` を書く |
| R2（日次バックアップ 90 日） | `jobs.ts` の backup（バインディングがある時だけ） | `wrangler.jsonc` の `r2_buckets` を有効化 |
| Access ＋ Turnstile | Access の JWT 検証を実装。開発モードは `/admin/login` の選択式 | `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` を secret に、Access のグループ＝協会で `/admin` `/shop` を保護。Turnstile は `TURNSTILE_*` を入れると有効 |
| Cron Triggers | `jobs.ts`（手元は `/__scheduled`） | — |
| Stripe 決済リンク・Webhook | `STRIPE_SECRET_KEY` があれば Checkout Session を作る。無ければ `/dev/stripe/:id` のシミュレータ。署名検証は共通 | Stripe の Webhook 先を `/webhooks/stripe` にし、`STRIPE_WEBHOOK_SECRET` を入れる。協会ごとの Stripe アカウントは未実装（1 アカウント） |
| Email Sending / 公式 LINE | `MAIL` バインディングがあれば Workers から直接送信。無ければ `mail_outbox` に貯める。LINE は未実装 | `send_email` バインディングを有効化し `MAIL_FROM` を設定 |
| GitHub Pages の運営アプリ | `/api/v1/tournaments/:id/entries.json`（トークン） | 運営アプリ側を「CSV 読込」から「API 読込」に変更 |
| Excel 名簿の取込み | 事務局 → 取込み（CSV 貼り付け）＋名寄せ候補 | ふりがな名簿を CSV にして貼る |
| 列暗号化・最小保有 | 住所・電話・メールは AES-256-GCM、メール検索は HMAC。退会 2 年で削除 | `DATA_KEY` を 32 バイトで作り直す（.dev.vars の既定値は開発専用） |

未実装・簡略化: 協会ごとの Stripe アカウント切替、LINE Push、領収書 PDF、Stripe 側の返金 API 呼び出し（返金記録のみ）、
Google／LINE ログイン、名寄せ取り消し時の年度登録・エントリーの戻し（会員レコードの結合だけ解きます）。

## 本番に配備するとき

```bash
cd members
npx wrangler d1 create tcta-members          # 出た database_id を wrangler.jsonc に書く
npx wrangler secret put DATA_KEY             # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_SECRET_KEY    # 任意
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
npx wrangler secret put CF_ACCESS_AUD
npm run db:migrate:remote
npm run deploy
```

`wrangler.jsonc` の `vars.BASE_URL` を実際の URL（例 `https://members.tottori-tenis.net`）にし、
Cloudflare Access で `/admin*` と `/shop*` を保護してください。管理者は事務局 → 管理者で登録します
（Access を通ったメールが `admins` に無ければ入れません）。初期データは本番では `/dev` が無効なので、
事務局の「取込み」から名簿を入れ、「協会」「大会」を画面で作ります。
GitHub Actions からの配備は `.github/workflows/deploy-members.yml` を Actions の画面から手動で実行し、配備先に production を選びます（demo は push で自動）。
