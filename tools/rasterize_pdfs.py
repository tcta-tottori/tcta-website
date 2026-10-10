"""
results.json の結果PDF（旧サイトから引き継いだ57件）を、ページごとの画像に起こして
結果画像（kind: 'sheet'）として photos の先頭に足す。

PDF だけの大会は「別タブで開く」しかなかったので、ほかの大会と同じように
ページ内に結果画像として埋め込むため。元の PDF はそのまま残し、
ページの下に「PDF をダウンロード」として置く。

  python3 -m pip install pypdfium2 pillow
  python3 tools/rasterize_pdfs.py

出力は public/assets/img/results/<年度>/<大会id>-pdf-<ページ>.webp。
変換ずみ（同じ src がすでに photos にある）のものは飛ばすので、何度流してもよい。
"""
import json
import os
import pypdfium2 as pdfium

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
SRC = os.path.join(SITE, 'src/data/results.json')
MAX_W = 1400   # 横幅の上限。ドロー表の字が読める程度
QUALITY = 80


def main():
    data = json.load(open(SRC, encoding='utf-8'))
    n_pages = n_pdfs = 0
    for year in data:
        for t in year['tournaments']:
            added = []
            for pdf in t['pdfs']:
                path = os.path.join(SITE, 'public', pdf)
                if not os.path.exists(path):
                    print('無い:', pdf)
                    continue
                stem = f"{t['id']}-pdf"
                doc = pdfium.PdfDocument(path)
                for i in range(len(doc)):
                    src = f"assets/img/results/{year['nendo']}/{stem}-{i + 1:02d}.webp"
                    if any(p.get('src') == src for p in t['photos']):
                        continue
                    page = doc[i]
                    w_pt, h_pt = page.get_size()
                    scale = MAX_W / w_pt
                    img = page.render(scale=scale).to_pil().convert('RGB')
                    out = os.path.join(SITE, 'public', src)
                    os.makedirs(os.path.dirname(out), exist_ok=True)
                    img.save(out, 'WEBP', quality=QUALITY)
                    added.append({'src': src, 'w': img.width, 'h': img.height, 'kind': 'sheet'})
                    n_pages += 1
                n_pdfs += 1
            if added:
                t['photos'] = added + t['photos']
    with open(SRC, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'PDF {n_pdfs} 件 → 画像 {n_pages} 枚')


if __name__ == '__main__':
    main()
