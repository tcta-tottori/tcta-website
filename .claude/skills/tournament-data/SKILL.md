---
name: tournament-data
description: 大会運営システム（tournament/、Cloudflare 版）のデータベースに、大会（ドロー）・大会日程・選手と所属のふりがな辞書を入れる・見る・直す・消す。「大会データを送ります」「このドローを入れて」「今週の大会を運営できるようにして」「ふりがなを直して／足して」「データベースに何が入っているか見せて」「外から送る鍵を作って」と言われたら使う。
---

# 大会運営のデータベースに入れる・直す

運営画面はログインすると、データベース（Cloudflare D1。`tournament/worker/catalog.ts`）の大会を並べ、選ぶとそのまま端末に入ってエントリー受付に進む。
ふりがな辞書もログイン時に自動で端末に取り込む。**ファイルを置くのではなく、JSON で直接書く**。形は `GET /api/schema`（ログイン不要）と README の「大会運営のデータベース」。

## コマンド（リポジトリの直下から。Node 22 以上）

```bash
C="node --experimental-strip-types --no-warnings tournament/scripts/catalog.mts"
$C list                                        # 大会（日程だけ／運営できる／終了）と辞書の件数
$C show <id>                                   # 大会 1 件の JSON
$C season <大会日程.xlsx>                      # 年間日程を「日程だけ」で入れる（ドローの入った大会は触らない）
$C draw <ドロー.xlsx> [--id <id>] [--name 正式名] [--courts 16]   # ドローを入れて「運営できる」に（同じ日の日程に重なる）
$C put <大会.json> --id <id>                   # JSON をそのまま入れる（画像・PDF から起こしたドローなど）
$C dict <ふりがな.xlsx> [所属.xlsx] [--merge]  # 辞書（列: 氏名・ふりがな・所属・確認メモ／所属名・ふりがな）。既定は置き換え
$C status <id> <planned|ready|done>
$C remove <id>
node tournament/scripts/data.mjs token         # 外の仕組み用の送信用の鍵（1 度だけ表示）
```

id は協会サイトの大会ページと同じ名前（`r8-kensen-singles` など。`src/features/catalog/fromExcel.ts` の SLUGS）。
Cloudflare の API トークン（Workers Scripts: Edit）は役員ログインと同じもの（`officer-login` スキル）。

## 頼まれごとと、すること

| 頼まれごと | すること |
| --- | --- |
| ドローの Excel を渡されて「入れて」 | `draw`。出力の種目・人数を伝える。同じ日の日程が無いと新しい大会になるので、そのときは id を確かめる |
| ドローが画像・PDF しか無い（サイトに載っているものなど） | 画像を読み、枠番号（BYE の位置）・シード・試合時刻・試合形式を起こして tournament の JSON を作り `put`。BYE は書かず、枠番号 position で位置を表す。2回戦以降の時刻は roundMatchTimes（`R{回戦}-{何試合目}`）。入れたら `show` で人数・シードを画像と照らし合わせる |
| 「今週の大会を運営できるようにして」 | `list` でその日の大会を見て、ドローを入れる。運営画面の「大会選択」に「運営できる」で出ることを伝える |
| ふりがなの直し・追加 | `dict … --merge`、または `PUT /api/dict`（merge）で必要な人だけ。自信のない読みは note（確認メモ）に理由を書く（画面で「要確認」に出る） |
| 年度の大会日程が来た | `season` |
| 何が入っているか | `list` |

## 守ること

- 名簿など個人情報を含むファイルはリポジトリに入れない（scratchpad などに置いて送る）
- 結果はスクリプトの出力どおりに伝える。`list`・`show` で確かめていないことを「入った」と言わない
- ドローの入った大会を `season` で上書きしない（スクリプトは自動で飛ばす）。入れ直すときは `draw` か `put`
