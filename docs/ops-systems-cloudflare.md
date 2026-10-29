# 大会運営システム・ドロー会議システムの Cloudflare 化の検討メモ

> **2026-10-29 追記：大会運営システムは段階 0・1 を実施した。** GitHub Pages 版を残したまま、Cloudflare 版を
> [`tournament/`](../tournament/)（https://tcta-tournament.tcta-admin-worker.workers.dev/ ）に作った。
> 中継は Durable Object に移し（Render 不要）、音声コールの鍵は Worker の secret に、見た目は協会サイトと同じ枠にそろえた。
> 運営画面・運営端末としての同期・音声コールは役員だけ（Cloudflare Access のメールのコードでログインし、Worker が毎回確かめる）。
> Access の設定（tournament/README.md の「役員ログイン」）が入るまでは、運営の操作はすべて止めてある。
> Workers Paid への切り替えはまだ行っていない（Free のまま）。ドロー会議システムは未着手。

2026-10-29 時点の整理。公式サイト（Astro ＋ EmDash、Cloudflare Workers）と
会員システムのサンプル（`members/`、Cloudflare Workers ＋ D1）が Cloudflare でそろったので、
GitHub Pages で動いている **大会運営システム** と **ドロー会議システム** も Cloudflare に寄せるべきか、
費用と運用の両面で見たもの。

対象のリポジトリ:

- 大会運営システム … `tcta-tottori/tournament-management-app`（React ＋ Vite の PWA）
- ドロー会議システム … `tcta-tottori/tottori-tennis-draw`（素の HTML／JS）

## 結論（先に）

- **置き場所を GitHub Pages から Cloudflare に移すだけなら、得るものは小さい。** どちらも静的ファイルの配信で、
  GitHub Pages で困っていることは無い。費用も両方とも無料で変わらない。
- **移す価値があるのは、2 つのアプリが外にぶら下げている「糊」の部分。** 観戦用の中継サーバー（Render）、
  ドロー会議の共有（Firebase）、ランキング・ふりがなの取得（公開設定した Google スプレッドシートの gviz）、
  バックアップ（GitHub の PAT を端末に保存）。これらは **無料プランの寝落ち・公開範囲・端末に残る秘密** という
  運用上の弱点を抱えており、Cloudflare の 1 アカウントに集めると消える。
- **費用は、全部まとめても Free プランで月 0 円のまま収まる見込み。** ただし Free の「1 日 10 万リクエスト」は
  **アカウント全体で共通**なので、公式サイト・会員システム・運営・ドローが同じアカウントに乗ると大会当日に
  上限を分け合う。安心を買うなら **Workers Paid（月 5 ドル ≒ 800 円、年 1 万円弱）**。これが本件で発生しうる唯一の費用。
- **やるなら「アプリの作り直し」ではなく「中継と保存先の差し替え」として、大会の無い時期に段階的に。**
  両アプリは端末内（IndexedDB／localStorage）にデータを持つオフライン前提の設計で、これは会場の電波事情を考えると
  正しい。Cloudflare 化でサーバー依存にしてはいけない。
- **本当の本命は会員システム（`members/`）との統合。** エントリー → ドロー会議 → 運営 → 結果 → 公式サイト を
  Excel の受け渡し無しで繋ぐことができ、これは Cloudflare に集めないと作れない。いまの運営アプリは
  会員システムの API（`/api/v1/tournaments/:id/entries.json`）を読む前提にすでになっている。

## いまの構成

### 大会運営システム（tournament-management-app）

| 要素 | いまの実装 | 置き場所・費用 |
| --- | --- | --- |
| アプリ本体 | React ＋ Vite の PWA。データは端末の IndexedDB（Dexie）。ドロー表・エントリー・要項は **Excel を読み込む** | GitHub Pages（無料） |
| 観戦用のリアルタイム配信 | WebSocket 中継サーバー（`sync-server/server.mjs`、Node）。ルームごとに最新スナップショットを保持 | **Render 無料プラン**。15 分アクセスが無いと眠り、次の接続で数十秒待つ |
| バックアップ・データ同期 | Google Drive（共有フォルダ「鳥取テニス協会バックアップ」）に、利用者の Google アカウントで OAuth | 無料（Google） |
| 音声コール | Gemini TTS。鍵はビルド時に埋め込み、または中継サーバーが代理で呼ぶ | 鍵の持ち主の Gemini 利用料 |
| 配備 | GitHub Actions → GitHub Pages。`VITE_SYNC_SERVER_URL` などをビルド時に埋め込む | 無料 |

### ドロー会議システム（tottori-tennis-draw）

| 要素 | いまの実装 | 置き場所・費用 |
| --- | --- | --- |
| アプリ本体 | 素の HTML／JS（ビルド無し）。エントリー・大会日程は **localStorage** | GitHub Pages（無料） |
| ランキング・ふりがな | Google スプレッドシートを **gviz の CSV エンドポイント**で直接読む（`ranking-loader.js`） | 無料。ただし**シートを「リンクを知っている全員」に公開**しておく必要がある |
| 複数端末での共有 | **Firebase Realtime Database**。利用者が Firebase の設定（apiKey・databaseURL）を画面から貼る | Firebase Spark（無料。同時接続 100 まで） |
| ふりがな辞書の更新・バックアップ | **GitHub REST API**。リポジトリ書き込み権限の PAT を端末の localStorage に保存して `data/furigana.json` や `backups/` に push | 無料。ただし PAT が端末に残る。公開リポジトリに名前入りのバックアップが載る |
| もう一つのバックアップ | Google Drive（運営アプリと同じ共有フォルダ） | 無料 |
| 名簿の読み取り | Gemini Vision（OCR）。鍵は利用者が入れる | 鍵の持ち主の利用料 |

2 つのアプリの受け渡しは Excel（ドロー会議が書き出し、運営アプリが読み込む）。結果の公式サイト掲載も手作業。

### 「スプレッドシートから API 経由」の正体

ドロー会議システムがランキングとふりがなを読んでいる gviz（`/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv`）は、
Google が公式に案内している API ではなく、**シートを公開設定にしたときだけ使える裏口**。
コード側にも「存在しないシート名でも 200 を返す」対策が入っており、Google 側の変更で黙って壊れる種類のもの。
Sheets API 本体（1 分 300 回／プロジェクト、1 分 60 回／利用者）の枯渇ではなく、
**公開範囲と壊れやすさ**が問題になる。

## Cloudflare に寄せた場合の構成案

```
                     Cloudflare（1 アカウント・Free または Paid）
 ┌──────────────────────────────────────────────────────────────────┐
 │ tcta-site   公式サイト（Astro＋EmDash）          D1 / R2 / Cron      │ 既設
 │ tcta-members 会員・エントリー                    D1 / Access         │ サンプル済み
 │ tcta-ops    大会運営システム                                        │ 新規
 │   ├ 静的ファイル（Workers Static Assets、無料・無制限）               │
 │   ├ 観戦用 WebSocket 中継（Durable Object、Hibernation API）          │ ← Render を置き換え
 │   └ Gemini TTS の代理呼び出し（鍵は secret）                          │
 │ tcta-draw   ドロー会議システム                                      │ 新規
 │   ├ 静的ファイル                                                   │
 │   ├ ランキング・ふりがな・エントリーの読み出し API（D1）               │ ← gviz・公開シートを置き換え
 │   ├ 会議中の共有（Durable Object か D1）                             │ ← Firebase を置き換え
 │   └ バックアップ（R2。Access で管理者だけ）                           │ ← GitHub PAT を置き換え
 └──────────────────────────────────────────────────────────────────┘
```

- アプリ本体は **いまのまま端末内にデータを持つ**。Worker は「中継・保存先・読み出し元」だけを担う。
  Excel の読み込み・ドロー生成・印刷などの重い処理は引き続きブラウザ側（Free プランの Worker は 1 回 10 ms の CPU 制限）。
- 中継サーバー（約 300 行の Node）は Durable Object に **ほぼそのまま**移せる。Render の寝落ちが無くなり、
  ルームごとのスナップショット保持も Durable Object の性質（1 ルーム＝1 オブジェクト、メモリ＋SQLite）と合う。
- ランキング・ふりがなの**入力の場**は、使い慣れているならスプレッドシートのままでもよい。Worker が定期的に取り込んで
  D1 に置き、アプリは D1 から読む形にすれば、シートを公開にする必要が無くなる（取り込みはサービスアカウント
  か、管理画面からの Excel アップロード）。
- 配備は `members/` と同じ型（GitHub Actions → `wrangler deploy`）。API トークンと Account ID はいまのものが使える。

## 費用

### いまの外部サービス（すべて無料枠）

| サービス | 無料枠 | 気になる点 |
| --- | --- | --- |
| GitHub Pages | 月 100 GB 配信の目安、リポジトリは公開 | バックアップ（名前入り）が公開リポジトリに載る |
| Render Free | 月 750 時間、15 分で休止 | 休止からの復帰に数十秒。大会前に誰かが起こしておく運用 |
| Firebase Spark | 1 GB 保存、月 10 GB 転送、**同時接続 100** | 利用者ごとに設定を貼る。Google 側の無料枠の変更に左右される |
| Google スプレッドシート（gviz） | 無制限 | 公開設定が必須。非公式の口 |
| Google Drive API | 無制限（利用者の容量内） | そのまま残してよい |

### Cloudflare に移したあと

| 項目 | Workers Free | Workers Paid（月 5 ドル） | 見込みの使用量 |
| --- | --- | --- | --- |
| Worker のリクエスト | **1 日 10 万（アカウント全体）** | 月 1,000 万まで込み | 下記 |
| 静的ファイル | 無料・無制限 | 同 | アプリ本体の配信はここ。カウント外 |
| Durable Objects（中継） | 1 日 10 万リクエスト。受信 WebSocket メッセージは 20 通＝1 リクエスト | 月 100 万まで込み | 大会 1 日: 運営端末 5 台×数千通 ＋ 観戦 200 人の接続 ≒ 数千リクエスト |
| D1 | 1 日 読み 500 万行・書き 10 万行、5 GB | 月 読み 250 億行・書き 5,000 万行 | ランキング・エントリー・ドローの読み書き程度。十分 |
| R2 | 10 GB、egress 無料 | 同 | バックアップ JSON（1 回 0.5 MB 程度）。十分 |
| Cloudflare Access | **50 人まで無料** | 同 | 管理者・運営担当は 10〜20 人 |
| Cron Triggers | 無料（Worker のリクエストとして数える） | 同 | 公式サイトが毎分 1 回＝1 日 1,440 を既に使用 |

- **月 0 円で収まる見込み。** 配信はカウント外で、カウントされるのは中継・API・Cron だけ。
- ただし Free の 10 万／日は **公式サイト（毎リクエスト Worker が動く＋毎分の Cron）・会員システム・運営・ドロー
  の合算**。上限を超えると遅くなるのではなく **その日は失敗する**。大会当日に観戦が集まる日と、公式サイトの
  アクセスが重なると読めない。
- そこで、運営・ドローを載せるタイミングで **Workers Paid（月 5 ドル ≒ 800 円、年 1 万円弱）** に上げるのが現実的。
  リクエスト上限が月 1,000 万に、Worker の CPU 制限が 30 秒になり、日次上限の心配が消える。
  Durable Objects・D1・R2 の無料枠は Paid でも別枠で付いてくるので、ここから先の従量課金は実質発生しない。
- 既設の公式サイトも同じアカウントなので、Paid に上げれば公式サイトの余裕も同時に増える（1 回払えば全部に効く）。
- Gemini（音声・OCR）の利用料は、置き場所を変えても変わらない。

## 運用

### 良くなること

1. **寝落ちと手動の起こしが無くなる。** Render の休止、Firebase の設定貼り付け、PAT の入力といった
   「大会前の儀式」が無くなる。観戦 URL は固定で、公式サイトの大会ページに貼ったままにできる。
2. **秘密と個人情報の置き場が整う。** 端末の localStorage に残る GitHub PAT、公開リポジトリの `backups/`、
   公開設定のランキングシートが、Access で守られた R2・D1 に置き換わる。会員システムが扱う名簿と同じ水準になる。
3. **配備・監視・バックアップが 1 か所に。** 4 つの Worker が同じアカウント・同じ Actions の型・同じ
   `wrangler` で動く。障害の見る場所も 1 つ。
4. **Excel の受け渡しが減らせる。** 会員システムのエントリーをドロー会議が読み、ドロー会議の結果を運営アプリが読み、
   運営アプリの結果を公式サイト（EmDash の「大会」）に戻す。いま 3 回ある手作業の受け渡しを API にできる。
   ドメインが 1 つにそろうので、Access の認証や Cookie も共用できる。

### 増えること・注意すること

1. **移行時に端末内のデータは引き継がれない。** オリジン（URL）が変わると IndexedDB・localStorage は空になり、
   PWA も入れ直し。両アプリに書き出し・読み込みがあるので、**大会の無い時期に、各端末で書き出してから**行う。
   公式サイトやマニュアルに書いた旧 URL（`tcta-tottori.github.io/...`）は転送を置く。
2. **Cloudflare 1 社への集中。** 公式サイト・会員・運営・ドローのすべてが同じアカウントに乗る。
   アカウントの事故（トークン漏えい・支払い停止）が全部に及ぶ。緩和策は、アプリ本体を静的ファイルのまま保つ
   （他所にも置ける）、D1 の定期エクスポート、Excel の読み書きを「非常口」として残すこと。
3. **Durable Objects の学習。** 中継サーバーの移植は小さいが、WebSocket Hibernation API の作法を 1 回は覚える必要がある。
   ほかは D1・R2・Access で、`members/` と公式サイトで既に使っている技術。
4. **Free のまま行くなら日次上限の見張りが要る。** Paid にしないなら、観戦ページを 1 つの Durable Object に集約して
   接続数を抑える、公式サイトの Cron を毎分から間引く、などの工夫で凌ぐ。年 1 万円で消える手間なので、Paid を勧める。
5. **ランキングシートの運用は決めてから。** いま誰がどう更新しているかで、「シートのまま・Worker が取り込む」か
   「管理画面からアップロード」かが変わる。gviz を外す（公開設定を止める）ことだけは早めにやってよい。
6. **GitHub Pages 側の後片付け。** 二重公開を避けるため、移行が終わったら Pages を止める。
   リポジトリは公開のままで問題ないが、`backups/` の JSON は履歴からも消すか、非公開にするかを決める。

## 進め方（段階案）

| 段階 | 内容 | 目安 | 効果 |
| --- | --- | --- | --- |
| 0 | 2 つのアプリを **Workers Static Assets** に載せる（中身は変えない）。配備の Actions を `members/` の型にそろえる | 半日 | URL とアカウントがそろう。単独ではほぼ無益なので 1 と同時に |
| 1 | 観戦用の中継を **Durable Object** に移植。Gemini TTS の代理も同じ Worker に。Render を止める | 1〜2 日 | 寝落ちが消える。観戦 URL を固定にして公式サイトに貼れる |
| 2 | ドロー会議の **ランキング・ふりがなを D1 の API** から読む（取り込みは Cron かアップロード）。共有を Firebase から Durable Object へ。バックアップを R2＋Access へ。gviz・PAT・Firebase 設定を外す | 2〜3 日 | 公開シート・端末内の PAT・公開バックアップが無くなる |
| 3 | 会員システムの本番化に合わせて、**エントリー → ドロー → 運営 → 結果 → 公式サイト** を API で繋ぐ。Excel の受け渡しを「非常口」に格下げ | 会員システムの計画しだい | 手作業の受け渡しが消える。これが本命 |

- 0〜2 は会員システムの本番化を待たずに進められる。**年度の大会が一段落した時期**（端末データの引き継ぎのため）に
  0・1・2 をまとめて行うのが手戻りが少ない。
- Workers Paid への切り替えは段階 1 のとき（観戦トラフィックが乗る前）。
- 段階 3 は、`members/` の `entries.json` API と運営アプリの「ドロー会議からの読み込み」（`DrawMeetingImport`）が
  既に対になっているので、受け渡しの形式を JSON にそろえるだけで始められる。

## 参考（確認した一次情報）

- Workers の料金・上限 … Free は 1 日 10 万リクエスト・CPU 10 ms／回、Paid は月 5 ドルで 1,000 万リクエスト・
  CPU 3,000 万 ms。静的ファイルは無料・無制限（developers.cloudflare.com/workers/platform/pricing）
- Durable Objects … Free でも SQLite バックエンドなら使える。1 日 10 万リクエスト、受信 WebSocket は 20:1 で換算
  （developers.cloudflare.com/durable-objects/platform/pricing）
- D1 … Free は 1 日 読み 500 万行・書き 10 万行・5 GB（developers.cloudflare.com/d1/platform/pricing）
- Zero Trust（Access） … Free は 50 人まで、その先は 1 人 7 ドル／月（cloudflare.com/plans/zero-trust-services）
- Google Sheets API の割当 … 1 分 300 回／プロジェクト、1 分 60 回／利用者。日次上限は無し。超過分の課金は
  「2026 年中に開始予定」（developers.google.com/workspace/sheets/api/limits）
- Apps Script（個人アカウント） … 実行 6 分、URL Fetch 1 日 2 万回、トリガー合計 90 分／日
  （developers.google.com/apps-script/guides/services/quotas）
