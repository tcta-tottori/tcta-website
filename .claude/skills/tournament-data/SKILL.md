---
name: tournament-data
description: 大会運営システム（tournament/、Cloudflare 版）の大会データ（D1 に置く Excel・バックアップ）を送る・一覧する・消す。「大会データを送ります」「この Excel を時間割として入れて」「プレイヤーデータ（ふりがな・所属）を入れて」「Cloudflare に何が入っているか見せて」「外から送る鍵を作って」と言われたら使う。
---

# 大会データ（Cloudflare）を送る・見る・消す

運営画面は Google ドライブではなく、Cloudflare の D1（`tcta-tournament-data`）に置いたファイルを読む（`tournament/worker/data.ts`）。
置き場は種類ごとに分かれ、運営画面の「大会データ（Cloudflare）」のボタンはそれぞれの種類を読む。しくみは `tournament/README.md` の「大会データ（Cloudflare）」。

| 種類 | 置くもの | 画面のどこで読むか |
| --- | --- | --- |
| `tournament` | 大会日程表（ファイル名に「大会日程」）と、各大会のドロー Excel | 一括読込・大会・時間割 |
| `schedule` | 時間割 Excel | 一括読込・大会・時間割、時間割の画面 |
| `furigana` | ふりがな一覧 Excel（列: 氏名・ふりがな）。いちばん新しい 1 つを読む | ふりがな・所属 |
| `affiliation` | 所属一覧 Excel（列: 所属名・ふりがな）。いちばん新しい 1 つを読む | ふりがな・所属 |
| `backup` | 「設定 → バックアップ」の JSON | バックアップの復元 |
| `result` | 大会結果 | — |

## コマンド（リポジトリの直下から。Node 22 以上）

```bash
node tournament/scripts/data.mjs list [種類]
node tournament/scripts/data.mjs push <種類> <ファイル…>     # 同じ種類・同じ名前があれば上書き
node tournament/scripts/data.mjs remove <種類> <名前…>
node tournament/scripts/data.mjs token                      # 外の仕組み用の送信用の鍵（1 度だけ表示。前の鍵は使えなくなる）
```

Cloudflare の API トークン（Workers Scripts: Edit）は役員ログインと同じもの（`officer-login` スキル）。届いていなければスクリプトがそう言って止まる。

## 頼まれごとと、すること

| 頼まれごと | すること |
| --- | --- |
| ファイルを渡されて「入れて」 | 中身（シート名・見出し行）を見て種類を決める。迷うときは聞く。`push` のあと `list` で入ったことを確かめて伝える |
| プレイヤーデータ | 画面が読む形は「ふりがな一覧（氏名・ふりがな）」と「所属一覧（所属名・ふりがな）」。選手名簿そのものはドロー Excel から取り込まれる。別の形で届いたら、どの形にするかを確かめてから Excel に直して送る |
| 何が入っているか | `list` |
| 外のシステムから送りたい | `token` で鍵を作り、README の curl の例と一緒に伝える。鍵はリポジトリ・コミットに書かない |

## 守ること

- 個人情報を含むファイル（名簿など）をリポジトリに入れない。送るときは scratchpad などリポジトリの外に置いて `push` する
- 結果はスクリプトの出力どおりに伝える。`list` で確かめていないことを「入った」と言わない
