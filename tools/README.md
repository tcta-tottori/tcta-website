# tools —— 旧サイトから大会結果を起こすための道具

`src/data/results.json`（平成16年度〜令和6年度・327大会）は手書きではなく、
旧サイト <https://tottori-tennis.sakura.ne.jp> を保存したデータから起こしている。
その手順をここに残す。ふだんの更新では使わない。**結果を直したいときは
`src/data/results.json` を直接編集してよい**（再実行すると上書きされる点にだけ注意）。

## 元データ

保存データは、このリポジトリではなく手元の

```
~/Desktop/鳥取市テニス協会WEB/scrape_output/
├── data/results/*.json   年度ごとの大会一覧（本文・画像・PDFの対応）
├── images/               元の写真 6,146枚（約1.1GB）
└── pdf/                  結果PDF 57件
```

にある。各スクリプトの先頭でこのパスを指しているので、置き場所が変わったら書き換える。

## 実行の順番

```bash
python3 tools/convert_images.py   # 写真を WebP（最大1000px・q72）に変換 1.1GB → 約220MB
python3 tools/parse_results.py    # 本文から 種目・優勝・準優勝 を取り出す → parsed.json
python3 tools/build_dataset.py    # parsed.json を results.json に整え、写真とPDFを public/ へ
```

`convert_images.py` と `parse_results.py` の出力先はスクリプト内の作業用ディレクトリ。
`build_dataset.py` だけが `src/data/results.json` と `public/assets/` を書き換える。

## 解析の精度

旧サイトの本文にはタグも改行も無く、

```
男子シングルスA級　　優勝　小池直哉選手（左）　準優勝　安田彰汰選手男子シングルス　B級　…
```

のように1本の文字列でつながっている。「優勝／準優勝／第3位／ベスト4」を目印に切り、
「選手」「ペア」「さん」などで名前の終わりを判断している。詳しくは
`parse_results.py` の冒頭を読むこと。

最後に流したときの結果は次のとおり。

| 項目 | 件数 |
| --- | --- |
| 大会 | 328 |
| 成績を取り出せた大会 | 222 |
| 順位の行 | 1,399 |
| 名前が取れなかった行 | 3 |
| 種目名が取れなかった行 | 8 |

残り106大会は、旧サイトにも文章が無く、結果が写真かPDFだけだったもの。
