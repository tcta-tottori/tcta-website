"""
results.json の photos を、結果画像（ドロー表・リーグ表・スコア表）と
当日の写真（表彰・試合）に仕分けし、幅・高さを添える。

旧サイトの結果ページは「種目の結果画像 → その種目の優勝者の写真 → 次の種目の結果画像 → …」
の順で画像を並べていた。results.json もその順のままなので、どれが結果画像かが分かれば
同じ構成でページを組み直せる。

仕分けは画像の中身で行う。
  ・白い画素（RGB すべて 225 以上）の割合が 35% 以上なら結果画像
  ・28% 以上でも幅 800px 以上なら結果画像（色付きのリーグ表がこの帯に入る）
  ・それ以外は写真
幅 300px 以下の小さな画像（スポンサーのロゴ 205×65 など）は落とす。

photos の各要素は文字列から { src, w, h, kind } に変わる。kind は 'sheet' か 'photo'。
すでに変換ずみの要素はそのまま通す（何度流してもよい）。

  python3 tools/classify_photos.py
"""
import json
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
SRC = os.path.join(SITE, 'src/data/results.json')


def classify(path):
    im = Image.open(path)
    w, h = im.size
    if w <= 300 or h < 100:
        return None
    small = im.convert('RGB')
    small.thumbnail((120, 120))
    px = list(small.getdata())
    white = sum(1 for r, g, b in px if min(r, g, b) > 225) / len(px)
    kind = 'sheet' if white >= 0.35 or (white >= 0.28 and w >= 800) else 'photo'
    return {'src': None, 'w': w, 'h': h, 'kind': kind}


def main():
    data = json.load(open(SRC, encoding='utf-8'))
    n_sheet = n_photo = n_drop = 0
    for year in data:
        for t in year['tournaments']:
            out = []
            for p in t['photos']:
                if isinstance(p, dict):
                    out.append(p)
                    continue
                info = classify(os.path.join(SITE, 'public', p))
                if info is None:
                    n_drop += 1
                    continue
                info['src'] = p
                out.append(info)
                if info['kind'] == 'sheet':
                    n_sheet += 1
                else:
                    n_photo += 1
            t['photos'] = out
    with open(SRC, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'結果画像 {n_sheet} 枚／写真 {n_photo} 枚／落とした小画像 {n_drop} 枚')


if __name__ == '__main__':
    main()
