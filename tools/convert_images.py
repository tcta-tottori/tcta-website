"""旧サイトの画像を web 用（WebP・最大1000px）に変換して scratch へ出す。
リポジトリには入れない。どれを採用するかは後で決める。"""
import os, sys, glob
from PIL import Image
from concurrent.futures import ProcessPoolExecutor

SRC = '/Users/kazuya/Desktop/鳥取市テニス協会WEB/scrape_output/images'
DST = '/private/tmp/claude-501/-Users-kazuya-Desktop-site/e75d7b55-f173-41cd-b29f-103e41a9fb92/scratchpad/webp'
MAX_W = 1000
Q = 72


def one(src):
    rel = os.path.relpath(src, SRC)
    out = os.path.join(DST, os.path.splitext(rel)[0] + '.webp')
    if os.path.exists(out):
        return 0
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        im = Image.open(src)
        im = im.convert('RGB')
        w, h = im.size
        if w > MAX_W:
            im = im.resize((MAX_W, round(h * MAX_W / w)), Image.LANCZOS)
        im.save(out, 'WEBP', quality=Q, method=4)
        return os.path.getsize(out)
    except Exception as e:
        print('NG', rel, e, file=sys.stderr)
        return 0


if __name__ == '__main__':
    files = [f for f in glob.glob(os.path.join(SRC, '**', '*'), recursive=True)
             if os.path.isfile(f) and os.path.splitext(f)[1].lower() in ('.jpg', '.jpeg', '.png', '.gif')]
    print('対象', len(files), flush=True)
    total = 0
    with ProcessPoolExecutor(max_workers=8) as ex:
        for i, n in enumerate(ex.map(one, files, chunksize=32), 1):
            total += n
            if i % 500 == 0:
                print(f'{i}/{len(files)}  {total/1e6:.0f}MB', flush=True)
    print('完了', len(files), f'{total/1e6:.0f}MB')
