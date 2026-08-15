"""parsed.json を、サイトが読む形（src/data/results.json）に整えて、
写真と PDF を public/ へ配置する。

写真は変換済みの WebP（最大1000px・q72）を使う。
"""
import json, os, re, shutil, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBP = os.path.join(HERE, 'webp')
PDF_SRC = '/Users/kazuya/Desktop/鳥取市テニス協会WEB/scrape_output/pdf'

IMG_DST = os.path.join(SITE, 'public/assets/img/results')
PDF_DST = os.path.join(SITE, 'public/assets/pdf/results')

# 年度ラベルから、ページで使う短い表記を作る
def short_label(label):
    return label.replace('令和1年度', '令和元年度')


def slug(s):
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'[^0-9a-zA-Z\-]+', '-', s).strip('-').lower()
    return s or 'x'


def main():
    src = json.load(open(os.path.join(HERE, 'parsed.json')))
    os.makedirs(IMG_DST, exist_ok=True)
    os.makedirs(PDF_DST, exist_ok=True)

    out = []
    seen_ids = {}
    copied_img = copied_pdf = 0
    img_bytes = 0

    for y in reversed(src):                     # 新しい年度が先
        nendo = y['nendo']
        year = {'nendo': nendo, 'label': short_label(y['label']), 'tournaments': []}
        for t in y['tournaments']:
            # 同じ id が年度内に2件ある（本文ページと PDF ページ）ことがあるので通し番号で分ける
            base = f"{nendo}-{slug(t['id'])}"
            n = seen_ids.get(base, 0)
            seen_ids[base] = n + 1
            tid = base if n == 0 else f'{base}-{n + 1}'

            photos = []
            for rel in t['images']:
                sp = os.path.join(WEBP, os.path.splitext(rel)[0] + '.webp')
                if not os.path.exists(sp):
                    continue
                name = os.path.basename(sp)
                dp = os.path.join(IMG_DST, nendo, name)
                os.makedirs(os.path.dirname(dp), exist_ok=True)
                if not os.path.exists(dp):
                    shutil.copy2(sp, dp)
                    copied_img += 1
                img_bytes += os.path.getsize(dp)
                photos.append(f'assets/img/results/{nendo}/{name}')

            pdfs = []
            for name in t['pdfs']:
                sp = os.path.join(PDF_SRC, name)
                if not os.path.exists(sp):
                    continue
                dp = os.path.join(PDF_DST, name)
                if not os.path.exists(dp):
                    shutil.copy2(sp, dp)
                    copied_pdf += 1
                pdfs.append(f'assets/pdf/results/{name}')

            # 中身が何も無いものは載せない
            if not t['categories'] and not photos and not pdfs:
                continue

            # 「ギャラリー」「PDF」だけの題は一覧で見分けがつかない。
            # 同じ大会の本編（id の頭が同じもの）の題を借りて補う。
            title = t['title'].replace('結果', '').strip() or t['title']
            if title in ('ギャラリー', 'PDF', '写真'):
                stem = re.sub(r'-(gallery|pdf|photo)$', '', t['id'])
                sib = next((x for x in year['tournaments']
                            if x['id'].endswith(slug(stem))), None)
                if sib:
                    title = f"{sib['title']}（{'写真' if title == 'ギャラリー' else title}）"

            year['tournaments'].append({
                'id': tid,
                'title': title,
                'date': t['date_text'],
                'venue': t['venue'],
                'categories': t['categories'],
                'photos': photos,
                'pdfs': pdfs,
                'sourceUrl': t['source_url'],
            })
        if year['tournaments']:
            out.append(year)

    json.dump(out, open(os.path.join(SITE, 'src/data/results.json'), 'w'),
              ensure_ascii=False, separators=(',', ':'))
    print('年度', len(out), '／大会', sum(len(y['tournaments']) for y in out))
    print('写真', copied_img, '枚コピー', f'{img_bytes/1e6:.0f}MB', '／PDF', copied_pdf, '件')
    print('results.json', f"{os.path.getsize(os.path.join(SITE,'src/data/results.json'))/1e3:.0f}KB")


if __name__ == '__main__':
    main()
