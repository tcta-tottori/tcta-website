# 大会運営システム（Cloudflare 版）

GitHub Pages で動いている大会運営システム（[`tcta-tottori/tournament-management-app`](https://github.com/tcta-tottori/tournament-management-app)）を、
公式サイト・会員システムと同じ Cloudflare に載せた版です。**GitHub Pages 版はそのまま残し**、こちらは別の URL で動きます。
公式サイト本体（リポジトリ直下の Astro ＋ EmDash）とは **別の Worker・別の package.json** で、サイトのビルドや配備には影響しません。

- **https://tcta-tournament.tcta-admin-worker.workers.dev/** … 運営画面（データ・エントリー・対戦順・ドロー・配信・印刷・設定）。**役員だけ**（下の「役員ログイン」）
- **https://tcta-tournament.tcta-admin-worker.workers.dev/view** … 観戦ページ（協会サイトに貼る固定 URL）。誰でも見られる

検討の経緯と費用の見積もりは [`docs/ops-systems-cloudflare.md`](../docs/ops-systems-cloudflare.md)。

## GitHub Pages 版との違い

| | GitHub Pages 版 | Cloudflare 版（ここ） |
| --- | --- | --- |
| アプリ本体 | GitHub Pages（`/tournament-management-app/`） | Workers Static Assets（ルート `/`）。配信は無料・無制限 |
| 観戦配信・端末同期の中継 | Render 無料プランの Node サーバー（15 分で眠り、起きるのに数十秒） | 同じ Worker の `/ws`（Durable Object「SyncRoom」）。眠らない。預かった大会データは SQLite に保存され、配備や再起動で消えない |
| 中継の設定 | `SYNC_SERVER_URL` をリポジトリの Variables に入れてビルド | 不要（開いている URL と同じ Worker につなぐ） |
| 使える人 | URL を知っていれば誰でも運営画面を開け、誰でも運営端末として配信できる | 運営画面・運営端末としての同期・音声コールは **役員だけ**（Cloudflare Access でログイン。Worker が毎回確かめる）。観戦ページは誰でも |
| 観戦端末からの書き込み | 中継サーバーはそのまま流す | 観戦端末（`viewer`）からは大会データの変更を流さない。データの要求だけ通す |
| 音声コール（Gemini TTS） | 鍵をビルドに埋め込む（ブラウザから見える）か、Render の中継が代理 | 同じ Worker の `/api/gemini-tts` が代理。鍵は Worker の secret に置き、ブラウザには渡さない。他のサイトからは使えない |
| 見た目 | 赤いサイドメニューの独自デザイン | 協会サイト（開発中）と同じ枠：白いヘッダーと横一列のナビ、右上の赤いブロック、灰色のページ見出しと背景の大きな英字、黒地のスマホメニュー、黒地のフッター。色・字・角もサイトにそろえた |
| 大会データの読み込み元 | Google ドライブの共有フォルダ（各自が Google でログインして接続し、Excel を選ぶ） | Cloudflare のデータベース（D1「tcta-tournament-data」）。ログインしたら大会を選ぶだけ。ふりがな辞書もログイン時に自動で取り込む。AI・スクリプトから直接書ける（下の「大会運営のデータベース」） |
| 端末内のデータ | `tcta-tottori.github.io` の IndexedDB | 別の URL なので別。移すときは旧版の「設定 → バックアップ」で書き出し、こちらで復元する |

画面の中身（取り込み・ドロー・スコア入力・印刷などの処理）は GitHub Pages 版と同じコードです（GitHub Pages 版の main `70fe04b`（2026-10-18）から写した。写すときに、元から型検査で落ちていた 19 か所だけ直してある）。
旧版に入った修正をこちらにも入れるときは、`src/features/` 以下を同じように直してください。

## 画面の構成（協会サイトにそろえた点）

協会サイト（https://tottori-city-tennis.com/ 。このリポジトリ直下の Astro サイト）と同じ見た目・同じ並びにしてあります。

- **サイトの CSS をそのまま使う** … `scripts/sync-site.mjs` が dev・build の前に `../public/assets/css/style.css` を
  `src/site/style.css` に写し、`src/index.css` が CSS のレイヤー「site」として読み込む（ロゴも `public/site/` に写す。どちらも Git には入れない）。
  サイトの CSS が変われば、次のビルドで大会運営システムの見た目も同じだけ変わる。手で写した CSS は持っていない
- **枠のマークアップはサイトの部品と同じ** … `src/components/site/SiteChrome.tsx` がサイトの `SiteHeader.astro`・`MobileNav.astro`・
  `LiteToggle.astro`・`SnsLinks.astro`・`SiteFooter.astro`・下層ページの `.page-head` と同じ HTML を出す。サイト側のマークアップを変えたら、ここも同じに直す
- **ヘッダー** … サイトと同じ白い帯・同じ位置のロゴと横一列のナビ・右上の赤いブロック（ここでは「観戦ページ」）。
  スマホ・タブレットはサイトと同じく帯を出さず、ロゴとメニューのボタンだけが浮く。ロゴの横に「大会運営 SYSTEM」の札（サイトには無い、このシステムの印）
- **ナビ** … 画面が 13 あるので作業の段階ごとに 5 つにまとめた（大会準備／大会進行／配信／印刷／設定）。
  まとまりの中の画面は、ページ見出しの下のタブ（サイトの `.tabs`）で切り替える
- **ページ見出し** … サイトの下層ページと同じ灰色の帯・パンくず・■ 英字／日本語の見出し（白いスラッシュで塗り替わる）・背景の大きな英字。
  見出しの下に、読み込み中の大会名・日程・会場
- **大会の状況の帯** … 墨色の帯に大会名・進捗・コートの空き・時間超過を流す（サイトの「重要なお知らせ」の帯と同じ作り）。PC はヘッダーの直下、スマホはタブの下
- **スマホのメニュー** … サイトと同じ黒地が下からせり上がり、2 列の行が下線の下から順に出る。下に軽量モード・SNS・PLAY BEYOND.・著作権の表記
- **軽量モード** … サイトと同じスイッチ（メニューの下）。動きを最小限にする。端末に覚える
- **フッター** … サイトと同じ黒地に漂う四角・白いロゴと SNS・PLAY BEYOND.。列は各画面へのリンク、下にバージョンとログアウト
- **画面の中身** … もとの大会運営アプリの部品のまま、テーマの値（`src/index.css` の `@theme`）をサイトの値にした
  （赤 `#D8232A`、墨 `#1A1A1A`、グレーの段階、Noto Sans JP／Barlow／Jost、角は 4px まで、影は浮かせる部品だけ）。
  さらに `src/styles/app.css` で、グラデーションを平らな面に、文字の入った丸いボタンを角 4px に、薄赤の塗りのボタンをサイトの白いボタン（`.btn--outline`）にそろえた
- 印刷の画面だけは、左右 2 列を画面の高さで並べるためフッターを出さない
- 運営画面は画面の高さいっぱいを使う画面があるため、サイトのように文書全体ではなく、ヘッダーの下の本文だけがスクロールする

## 手元で動かす

```bash
cd tournament
npm ci --legacy-peer-deps
npm run preview        # ビルドして wrangler dev（http://localhost:8787）。中継・音声の API も動く
npm test               # 別のターミナルで。動いている Worker に対して中継・役員ログイン・API を確かめる
npm run test:auth      # 役員ログインの証明（JWT）の検証を、自分で作った鍵で確かめる（Worker を起動しなくてよい）
```

手元では `.dev.vars.example` を `.dev.vars` に写すと、役員ログインが「メールアドレスを入れるだけ」の画面になり（`AUTH_MODE=dev`。localhost のときだけ効く）、
`npm test` も役員としての確認（運営端末の配信など）まで通します。`.dev.vars` が無ければ「未設定」として運営の操作を断ります。

画面だけを直すときは `npm run dev`（Vite、http://localhost:5173）でもよいが、中継（`/ws`）と音声（`/api/*`）は動かない。

- `npm run typecheck` … アプリ・Vite 設定・Worker の型検査
- `BASE=https://tcta-tournament.tcta-admin-worker.workers.dev npm test` … 配備先に対して同じ確認をする

## 配備

`tournament/` を変更して push すると [`.github/workflows/deploy-tournament.yml`](../.github/workflows/deploy-tournament.yml) が
型検査 → ビルド → `wrangler deploy` → 配備先へのスモークテストを行います。公式サイト本体と同じ Secrets（`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`）を使います。
手元からは `npm run deploy`。

### 配備のあとに一度だけ行うこと

1. **大会データのデータベース** … 最初の配備で D1「tcta-tournament-data」が名前どおりに作られる（GitHub Actions の配備用トークンに D1: Edit が要る。公式サイトと同じトークンなので入っている）。
   表は Worker が最初に使うときに作る。Google ドライブの設定は要らない
2. **音声コール（任意）** … Gemini の API キーを Worker に入れる。リポジトリの Secrets に `GEMINI_API_KEY` を入れておけば配備のたびに入る。
   手元からなら `npx wrangler secret put GEMINI_API_KEY`。入れなければブラウザ内蔵の声だけで動く（既定もこちら）
3. **協会サイトの観戦リンク** … 観戦ページの URL を `https://tcta-tournament.tcta-admin-worker.workers.dev/view` に差し替える（Render を止めるときに）
4. **役員ログイン** … 下の「はじめに一度だけ、人がすること」。**これをするまで運営画面は誰も使えない**（観戦ページは使える）

## 大会運営のデータベース（Cloudflare D1）

大会もふりがな辞書も、**ファイルではなくデータベースの中の JSON** で持ちます（`worker/catalog.ts`。形の説明は `/api/schema`）。
運営画面・Claude（AI）・スクリプトが同じ形で読み書きするので、Excel やフォルダを選ぶ操作はありません。

| 画面 | すること |
| --- | --- |
| 大会選択（`/data`） | ログインすると、データベースの大会が協会サイトの大会情報と同じカードで並ぶ。「運営をはじめる」で種目・ドロー・試合時刻・シードが端末に入り、時間割も作ってそのまま**エントリー受付**へ。前に入れた大会は「続きから」、データベース側が新しくなれば「更新あり・入れ直す」 |
| ドロー確認（`/data/review/<id>`） | 「確認して運営をはじめる」で開く。1 回戦の組と 2 回戦の相手を種目ごとに見て、気をつける所（ドローの形・シード・同じ人の重なり・姓名の空白・ふりがなや所属の抜け・同じ所属どうしの 1 回戦・時刻の抜け）を自動で並べる。枠の入れ替え・移動・名前／所属／シードの修正・空きにする・1 回戦の時刻・ふりがなの追加・大会の情報をその場で直し、データベースに保存してから端末に入れてエントリーへ |
| 選手・所属（`/dict`） | ふりがな辞書（選手・所属）を見る・探す・その場で直す。ログインした時点で端末に自動で取り込む（版が同じなら何もしない）。今の大会でふりがなの無い選手を上に出す。読みに自信のない人（要確認）だけを絞り込める |
| データ管理（設定 → データ管理） | ミックスダブルス・団体戦・時間割の Excel を端末に直接取り込む（従来の取り込み）、端末のデータの消去、テスト用のスコア入力 |

全角の英数字（ＬＴＣ河原・ｄｏＭｅ など）は、どこから入れても（画面・Excel・AI・スクリプト）データベースに書くときに半角にそろえる（`worker/catalog.ts` の `hw`・`src/lib/halfwidth.ts`）。端末の辞書に残っていた全角の所属は、ログイン時の取り込みで消える。

大会の状態は 3 つ: **日程だけ**（planned。大会日程表から入れた。ドローはまだ）→ **運営できる**（ready。ドローあり）→ **終了**（done）。
大会の id は協会サイトの大会ページと同じ名前（`r8-kensen-singles` ＝ `event-r8-kensen-singles.html`）。

### 入れ方（AI ネイティブ）

- **Claude に頼む**（いちばん楽）… 要項・ドロー（Excel・PDF・画像）や名簿を渡して「県選ダブルスのドローを入れて」「この人たちのふりがなを足して」と頼む。
  Claude は `scripts/catalog.mts` か API で直接データベースに書き、`list` で入ったことを確かめる（スキル `tournament-data`）。
  画像や PDF しか無いドローは、Claude が中身を読み取って JSON（`/api/schema` の tournament の形）に起こして `put` する
- **運営画面の「Excel から入れる」**（大会選択の下）… ドロー表の Excel を選ぶと、同じ日の大会日程に重ねてデータベースに入る（端末ではなく、まずデータベースへ。ほかの端末からも選べる）
- **スクリプト**（Node 22 以上。リポジトリの直下から）
  ```bash
  C="node --experimental-strip-types --no-warnings tournament/scripts/catalog.mts"
  $C list                                     # 大会と辞書の一覧
  $C season 大会日程.xlsx                     # 年間の大会日程を「日程だけ」で入れる（ドローの入った大会は触らない）
  $C draw ドロー.xlsx [--id r8-kensen-singles] [--courts 16]   # ドローを入れて「運営できる」に
  $C put 大会.json --id r8-xxx                # AI が作った JSON をそのまま入れる
  $C dict ふりがな一覧.xlsx 所属一覧.xlsx [--merge]            # 辞書（既定は丸ごと置き換え）
  $C status r8-kensen-singles done            # 終わった大会を「終了」に
  ```
  Excel の読み取りは運営画面と同じ処理（`src/features/data/*Parser.ts`・`src/features/catalog/fromExcel.ts`）なので、画面で読んだときと同じ結果になる
- **外の仕組みから** … `node tournament/scripts/data.mjs token` で送信用の鍵を作り、`Authorization: Bearer <鍵>` で `PUT /api/catalog/<id>`・`PUT /api/dict` を呼ぶ

### API（`worker/catalog.ts`）

| | |
| --- | --- |
| `GET /api/catalog` | 大会の一覧（ドローを除いた要約）と辞書の件数・版 |
| `GET /api/catalog/<id>` | 大会 1 件（ドロー込み） |
| `PUT /api/catalog/<id>` | 大会を置く（上書き）。形を確かめ、だめなら理由を返す（ドローの無い大会を「運営できる」にはできない、など） |
| `GET /api/dict` / `PUT /api/dict` | 辞書。`{ mode: "merge" \| "replace", players, affiliations, removePlayers }` |
| `GET /api/schema` | 上の形の説明（ログイン不要。AI が最初に読む） |

使えるのは役員（書き込みはこのサイトの画面からだけ）と送信用の鍵だけです。辞書は 1 つの JSON 文書として持ちます（D1 の 1 回あたりの問い合わせ数の上限に収めるため）。

### ファイルの置き場（`/api/data/files`）

バックアップの JSON（設定 → バックアップ → Cloudflare に保存）と、時間割の Excel を置く場所です。`scripts/data.mjs list|push|remove`。
大会と辞書は上のデータベースに置き、ここには置きません。

## 役員ログイン

運営画面（`/view` 以外のすべて）・運営端末としての同期・音声コールは、協会の役員だけが使えます。
ログインは Cloudflare Access（Zero Trust。50 人まで無料）で、**登録したメールアドレスに届く 6 桁のコード**で入ります。パスワードはありません。

| | 誰が使えるか | どこで確かめるか |
| --- | --- | --- |
| 運営画面（`/data` ほか、`/live`・`/live-score`） | 役員 | 画面を開いたときに `/api/me`（ログインしていなければ案内の画面） |
| 運営端末としての同期（`/ws?role=operator`） | 役員 | Worker が接続のたびに証明を検証。無ければ接続を断る |
| 音声コール（`/api/gemini-tts`） | 役員 | Worker が呼ばれるたびに証明を検証 |
| 観戦ページ（`/view`）・観戦端末としての同期・HP 埋め込み（`/embed/livescore`） | 誰でも | — |

しくみ: Access で守るのはログインの入口 `/auth/login` だけです。役員が「役員としてログイン」を押すとそこに移り、Access がメールのコードを聞きます。
通ると Access が署名付きの証明（JWT）を付けて Worker に渡し、Worker はそれを検証してから自分の Cookie に移します。
以後、同期の接続・音声コール・画面を開くたびに、Worker がその証明の署名・発行元・宛先・期限を確かめます（`worker/auth.ts`）。
Access の設定が無いあいだは「未設定」として、運営の操作をすべて断ります（閉じる側に倒してある）。

### 運用のしかた（Claude Code に頼む）

役員ログインの設定と役員の出し入れは、**Claude Code に日本語で頼むだけ**で済むようにしてあります。
Claude Code が `scripts/officers.mjs` で Cloudflare の API を直接操作します（GitHub は通さない。ダッシュボードを開く必要もない）。
頼み方の決まりは `.claude/skills/officer-login/SKILL.md` にあり、このリポジトリを開いた Claude Code は自動で読みます。

| 頼むこと（例） | Claude Code がすること |
| --- | --- |
| 「役員ログインを設定して。役員は a@example.jp と b@example.jp」 | Zero Trust のチーム・メールのコードでのログイン・役員の許可・`/auth/login` を守るアプリケーションを作り、Worker に入れ、公開先で使える状態になったかを確かめる |
| 「c@example.jp を役員に追加して」 | 役員の一覧に足す（すぐに効く） |
| 「b@example.jp を役員から外して」 | 一覧から外す。その人がいまログイン中の端末をすぐ止める方法も案内する |
| 「役員の一覧を見せて」 | 今の一覧 |
| 「役員ログインの状態を確認して」「○○さんがログインできない」 | 設定・Worker・公開先の状態を確かめる |

役員のメールアドレスは Cloudflare の中だけに置き、このリポジトリ（公開）には書きません。

### はじめに一度だけ、人がすること

Claude Code が Cloudflare を操作するための鍵（API トークン）を作って、Claude Code の環境に入れます。所要 5 分ほどです。

1. **API トークンを作る**（Cloudflare のダッシュボードは日本語表示。英語表示のときの名前を（ ）に書いた）
   … https://dash.cloudflare.com/profile/api-tokens を開く（協会の Cloudflare アカウント t.c.t.a.r7@gmail.com でログイン）と、
   「**ユーザー API トークン**」（User API Tokens）の画面が開く（ダッシュボードの右上の人のアイコン →「プロファイル」からも開ける）
   1. 「**トークンの作成**」（Create Token）を押す
   2. いちばん下の「**カスタムトークンを作成する**」（Create Custom Token）の「**始める**」（Get started）を押す
   3. 「**トークン名**」（Token name）に `Claude Code 大会運営 役員ログイン` と入れる
   4. 「**権限**」（Permissions）の欄で、「**さらに追加**」（+ Add more）を押して 3 行にし、1 行ずつ左から順に選ぶ。
      左の欄は「**アカウント**」（Account）、右の欄は「**編集**」（Edit）。真ん中の欄は次の 3 つ
      （真ん中の欄の項目名は、日本語表示でも英語のまま出ることがある。欄に `Access` や `Workers` と打つと絞り込める）
      - **Access: Apps and Policies**（Access: アプリとポリシー）
      - **Access: Organizations, Identity Providers, and Groups**（Access: 組織、ID プロバイダー、グループ）
      - **Workers Scripts**（Workers スクリプト）
   5. 「**アカウント リソース**」（Account Resources）は「**含む**」（Include）と、協会のアカウント（`T.c.t.a.r7@gmail.com's Account` など）を選ぶ
   6. ほかの欄（クライアント IP アドレスのフィルタリング・TTL）は空のまま、いちばん下の「**概要に進む**」（Continue to summary）を押す
   7. 内容を確かめて「**トークンを作成**」（Create Token）を押す
   8. 出てきたトークン（長い英数字）の横の「コピー」を押す。**この画面を閉じると二度と表示されない**（失くしたら作り直す）。
      **チャットには貼らない**
2. **Claude Code の環境の「ネットワークの秘密」に入れる** … 環境変数ではなく、ここに入れる。
   環境変数は、その環境を使う人なら誰でも値を見られるため（設定画面にもそう書いてある）。
   ネットワークの秘密に入れた鍵はセッションの中に入らず、Claude Code の通信のうち Cloudflare の API（api.cloudflare.com）宛てのものにだけ、
   途中のプロキシが付けて送る（Claude Code 自身も鍵の値は見られない）
   1. https://claude.ai/code で、このリポジトリのセッションを開く
   2. 画面上部のセッションの題名の右の「∨」（キャレット）を押し、「**Edit cloud environment**」（クラウド環境を編集）を開く
      （新しいセッションの画面からは、入力欄の下の最初のボタン（環境の選択）→ 使っている環境の行の右の歯車）
   3. 「**Network secrets**」（ネットワークの秘密）の行を開き、「**Add secret**」を押す
   4. 次のように入れて「**Add**」（または「Add secret」）を押す（「Save changes」は押さなくても保存される）
      - **Name**（名前）: `Cloudflare API（役員ログイン）`
      - **Secret type**（種類）: **Bearer**（そのまま）。短い入力欄だけの画面なら **Token**
      - **Allowed websites** / **Host**（送り先）: `api.cloudflare.com`
      - **Custom headers**（ヘッダー）: Name は `Authorization`、Prefix は `Bearer`（どちらも最初から入っている）、**Value** に手順 1 でコピーしたトークン
        （短い入力欄だけの画面なら **Value** にトークン）
   5. **新しいセッションを始める**（秘密は新しいセッションから使われる）

   ※ もし環境変数の欄（Environment variables）にトークンを入れてしまったら、その行は消す。
   ※ トークンの値をチャットや画面写真で見せてしまったら、手順 1 の画面でそのトークンの右の「…」→「**ロール**」（Roll）で新しい値に替え、
   古い値は使えなくしてから、新しい値をネットワークの秘密に入れる
3. **Zero Trust（ログインのしくみ）を始める** … 多くの場合、手順 4 で Claude Code が自動で始める。
   Claude Code から「Zero Trust を始めてください」と言われたときだけ、https://one.dash.cloudflare.com/ を開く
   （ダッシュボードの左のメニューの「**Zero Trust**」からも開ける）。アカウントを選び、画面の案内に沿って
   1. 「**チーム名**」（team name）を決める（例 `tottori-city-tennis`。ログイン画面のアドレス `tottori-city-tennis.cloudflareaccess.com` になる）
   2. プランは「**Free**」（無料。50 人まで）を選ぶ
   3. 支払い方法の登録を求められたら登録する（Free プランのままなら請求は来ない）
   チーム名を聞かれずに「Cloudflare One」の概要の画面（ユーザー 0 / 50 人中 など）まで進んだときは、それで開始できている
   （チーム名は自動で付く）。名前は手順 4 で Claude Code が見せるので、変えたければそのとき「チーム名を tottori-city-tennis にして」と頼む
4. **Claude Code に頼む** … 新しいセッションで「役員ログインを設定して。役員は（メールアドレスを並べる）」と書く
5. **確かめる** … https://tcta-tournament.tcta-admin-worker.workers.dev/data を開き、**役員としてログイン** → メールアドレス →
   メールで届いた 6 桁のコード → 運営画面に戻れば完了。
   ログインしていないブラウザ（シークレットウィンドウ）で同じ URL を開くと案内の画面が出ること、
   https://tcta-tournament.tcta-admin-worker.workers.dev/view（観戦ページ）はそのまま見られることも確かめる

作られるもの（https://one.dash.cloudflare.com/ の左のメニュー「**アクセス**」（Access）→「**アプリケーション**」（Applications）／「**ポリシー**」（Policies）で見られる。名前で見分けているので名前は変えない）:

| 種類 | 名前 | 中身 |
| --- | --- | --- |
| ログインの方法 | メールのコード（日本語表示では「ワンタイム PIN」。One-time PIN） | 無ければ作る |
| ポリシー | 大会運営システム 役員 | Allow。役員のメールアドレス。セッション 1 週間 |
| アプリケーション | 大会運営システム（役員） | Self-hosted。`tcta-tournament.tcta-admin-worker.workers.dev/auth/login` だけを守る。ログインの方法はメールのコードだけ |
| Worker の秘密 | `ACCESS_TEAM_DOMAIN`・`ACCESS_AUD` | `tcta-tournament` に入れる。GitHub からの配備でも消えない |

トークンの期限・権限を見直すときは、手順 1 の URL で同じトークンの右の「…」から「**編集**」（Edit）。使わなくなったら「**削除**」（Delete）すれば、Claude Code からは操作できなくなる（役員ログインそのものは動き続ける）。

### 使うときのこと

- 一度ログインした端末は、Access のセッション（1 週間）のあいだそのまま使えます。期限が切れても画面は止めず、上に赤い帯で「ログインし直す」を出します（入力した内容は端末に残ります）
- 会場で電波が無いときも、前に（7 日以内に）ログインできていた端末なら運営画面はそのまま使えます。同期と音声コールは電波が戻ってから
- ログアウトはフッター（スマホはメニューの下）の「ログアウト」

## 構成

```
tournament/
├── wrangler.jsonc            Worker 名 tcta-tournament、静的ファイル（dist/）、Durable Object「SyncRoom」、D1「tcta-tournament-data」
├── worker/
│   ├── index.ts              入口。/ws をルームごとの Durable Object へ（運営端末は役員だけ）、/api/gemini-* を Gemini へ、ほかは静的ファイル
│   ├── catalog.ts            大会運営のデータベース（大会・辞書。/api/catalog・/api/dict・/api/schema）
│   ├── data.ts               ファイルの置き場（バックアップ・時間割。/api/data/files）
│   ├── auth.ts               役員ログイン（Cloudflare Access の証明の検証・/auth/login・/auth/logout・/api/me）
│   └── sync-room.ts          中継（join / leave / broadcast / cache / ping。Render 版 sync-server と同じ約束事）
├── src/
│   ├── components/site/      協会サイトと同じ枠（ヘッダー・スマホのメニュー・軽量モード・SNS・ページ見出し・タブ・状態の帯・フッター）と役員ログインの案内（OfficerGate）
│   ├── features/auth/officer.ts          役員ログインの状態（画面の側）
│   ├── features/catalog/                 大会選択（TournamentHub）・選手と所属（DictionaryPage）・端末への読み込み・辞書の自動取り込み・Excel の変換
│   ├── components/layout/AppLayout.tsx   運営画面の骨組み（ナビのまとまり・タブ・状態の帯）
│   ├── features/view/PublicLayout.tsx    観戦ページの骨組み
│   ├── site/style.css        協会サイトの style.css の写し（ビルドの前に作る。Git に入れない）
│   ├── styles/app.css        このシステムだけの見た目（骨組み・状態の帯・札・ログインの案内）と、中身をサイトに寄せる指定
│   ├── index.css             レイヤーの順（サイト → Tailwind）・テーマ値（色・書体・角・影）をサイトにそろえたもの＋各画面の部品
│   └── features/…            画面の中身（GitHub Pages 版と同じ）
├── public/site/              協会ロゴ（サイトの写し。ビルドの前に作る）
├── scripts/sync-site.mjs     協会サイトの CSS・ロゴを写す
├── scripts/catalog.mts      大会・辞書をデータベースに入れる（Excel の読み取りは画面と同じ処理。Claude Code からも使う）
├── scripts/data.mjs         ファイルの置き場への送信・送信用の鍵（scripts/lib/push.mjs）
├── scripts/officers.mjs      役員ログイン（Cloudflare Access）の設定と役員の追加・削除（Claude Code から使う）
├── scripts/smoke.mjs         中継・役員ログイン・API の動作確認
└── scripts/auth.test.mts     役員ログインの証明の検証のテスト
```

## 費用と上限

Workers Free プランで動きます（月 0 円）。静的ファイルの配信は数に入らず、数えられるのは `/ws` の接続と受信メッセージ（20 通で 1 リクエスト）と `/api/*` だけです。
ただし Free の「1 日 10 万リクエスト」は公式サイト・会員システムと **アカウント全体で共有** なので、
大会当日に観戦が集中するようになったら Workers Paid（月 5 ドル）を検討してください（[`docs/ops-systems-cloudflare.md`](../docs/ops-systems-cloudflare.md)）。

預かる大会データ（観戦端末への初期配信用）は、1 ルームにつき最新の 1 件だけを Durable Object の SQLite に置き、
書き込みは 10 秒に 1 回までに間引いています。3 日より古いものは観戦端末に送りません。

## まだ残っていること

- アプリのファイル（JavaScript）そのものは誰でも取れる（観戦ページと共用のため。中身は公開リポジトリと同じで、秘密は入っていない）。
  大会データは各端末の中と、役員だけが書ける中継にあるので、ファイルを取られても大会データには届かない
- ドロー会議システムとの受け渡しは、これまでどおり Excel
