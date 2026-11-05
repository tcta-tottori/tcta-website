---
name: officer-login
description: 大会運営システム（tournament/、Cloudflare 版）の役員ログイン（Cloudflare Access）を設定・確認し、役員を追加・削除・一覧する。「役員ログインを設定して」「役員を追加して」「○○さんを役員から外して」「役員の一覧を見せて」「ログインできない」「Access の状態を確認して」と頼まれたら使う。
---

# 役員ログインの設定と役員の管理

大会運営システム（`tournament/`）の運営画面は、Cloudflare Access に登録した役員だけが使える。
設定と役員の出し入れは、`tournament/scripts/officers.mjs` が Cloudflare の API で直接行う（GitHub は通さない）。
しくみと、人が一度だけする準備は `tournament/README.md` の「役員ログイン」。

## はじめに確かめること

- 環境変数 `CLOUDFLARE_API_TOKEN` が要る。無ければ、スクリプトがそう言って止まる。
  そのときはトークンをチャットに貼ってもらうのではなく、`tournament/README.md` の「役員ログイン」の手順 1・2
  （トークンを作り、Claude Code の環境の設定に入れて、新しいセッションを始める）を案内する。
- コマンドはリポジトリの直下から実行する。Node 22 以上（追加のインストールは要らない）。

## コマンド

```bash
node tournament/scripts/officers.mjs status                      # 今の設定と、公開先が役員ログインを受け付けているか
node tournament/scripts/officers.mjs setup --emails a@x.jp,b@y.jp  # はじめの設定（何度実行してもよい）。チーム名を変えるときは --team 名前
node tournament/scripts/officers.mjs list                        # 役員の一覧
node tournament/scripts/officers.mjs add a@x.jp [b@y.jp …]       # 役員を足す
node tournament/scripts/officers.mjs remove a@x.jp [b@y.jp …]    # 役員を外す
```

## 頼まれごとと、すること

| 頼まれごと | すること |
| --- | --- |
| 役員ログインを使えるようにしたい | 役員のメールアドレスを聞き、`setup --emails …`。最後に `status` で「公開先の役員ログイン: access」を確かめ、ログインの試し方（運営画面 → 役員としてログイン → メールのコード）を伝える |
| チーム名（ログイン画面のアドレス `○○.cloudflareaccess.com`）を変えたい・決めたい | `status` で今の名前を見せ、変えるなら `setup --team 名前`（英小文字・数字・ハイフン）。Zero Trust をダッシュボードで始めたときは名前が自動で付いていることがあるので、はじめの設定のときに今の名前を伝えて、変えるか聞く |
| 役員を足す・外す | `add` / `remove`。外したときは、その人がいまログイン中の端末は最長 1 週間使えること、すぐ止める方法（スクリプトが出す案内）を伝える |
| 誰が役員か | `list` |
| ログインできない | `status` で設定を確かめ、その人のメールアドレスが一覧にあるか、迷惑メールにコードが入っていないかを伝える |

## 守ること

- 役員のメールアドレスをリポジトリ（コード・README・コミットメッセージ）に書かない。公開リポジトリなので、誰でも読める
- `--emails` で全員を入れ直すとき以外は、`add` / `remove` を使う（`setup --emails` は一覧を丸ごと置き換える）
- Zero Trust のダッシュボードで「大会運営システム 役員」「大会運営システム（役員）」の名前を変えない（名前で見分けている）
- スクリプトが失敗したら、出たメッセージのとおりに案内する。トークンの権限が足りないときは README の手順 1 の権限 3 つを確かめてもらう
- 結果はスクリプトの出力どおりに伝える。`status` で確かめていないことを「できた」と言わない
