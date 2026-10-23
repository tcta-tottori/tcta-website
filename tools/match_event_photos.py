"""公式サイト（Jimdo）の結果ページと、こちらに取り込んだ画像を照合して、
大会ごとに「種目 → 結果表の画像 → 入賞者の写真 → 順位の文言」の対応（src/data/event-layout.json）を作る。

公式サイトの結果ページは、種目ごとに
    結果表の画像 → 入賞者の写真（優勝・準優勝…）→ 「男子シングルスA級　優勝　○○」の1行
の順に並んでいる。こちらの管理画面には「結果」の画像と「当日の写真」が別々に入っていて、
どの写真がどの種目のものかは分からない。そこで公式サイトの画像を取り、画像の中身（知覚ハッシュ）で
こちらの result-XX / photo-XX と突き合わせる。

■ 使い方
    python3 tools/match_event_photos.py            # 全部
    python3 tools/match_event_photos.py r8-dunlop  # 1件だけ
  公式サイトの URL → slug は fetch_winners.py の PAGES と同じ。
  出力は src/data/event-layout.json。{ slug: [ { label, sheets: ['result-01'], photos: ['photo-03'], captions: ['優勝 ○○'] } ] }
  照合できなかった画像は、標準出力に出す（手で確かめる）。

■ 必要なもの
  Pillow（画像の縮小とハッシュ）。公式サイトの画像は tools/.cache/official/ に置く（Git 管理外）。
"""
import json
import os
import re
import subprocess
import sys
import urllib.parse
from html import unescape

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_winners import PAGES, SITE  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src/data/event-layout.json')
CACHE = os.path.join(ROOT, 'tools/.cache/official')
IMG_ROOT = os.path.join(ROOT, 'public/assets/img/events')
# 「1位トーナメント」「3・4位トーナメント」の「1位」は順位ではないので除く
AWARD = re.compile(r'(総合優勝|優勝|準優勝|第\s*[3３]\s*位|(?<![・･])[3３]位(?![トーナメント・･])|ベスト\s*[48４８]|[1１]位(?![トーナメント・･])|[2２]位(?![トーナメント・･]))')
THRESHOLD = 40  # dHash（256bit）の距離。これ以下なら同じ画像とみなす


def fetch(url):
    raw = subprocess.run(['curl', '-sL', '--compressed', '-A', 'Mozilla/5.0', url], capture_output=True, check=True).stdout
    return raw.decode('utf-8', 'ignore')


def dhash(path, size=16):
    im = Image.open(path).convert('L').resize((size + 1, size), Image.LANCZOS)
    px = list(im.get_flattened_data()) if hasattr(im, 'get_flattened_data') else list(im.getdata())
    return [px[y * (size + 1) + x] > px[y * (size + 1) + x + 1] for y in range(size) for x in range(size)]


def dist(a, b):
    return sum(x != y for x, y in zip(a, b))


def parse(html):
    """本文を上から順に、画像（URL）と文字に分ける。文字は入賞の1行だけ拾う。"""
    body = re.sub(r'<(script|style|nav|header|footer)[^>]*>.*?</\1>', '', html, flags=re.S)
    seq = []
    for m in re.finditer(r'<img[^>]+src="([^"]+)"[^>]*>|>([^<]{2,})<', body):
        if m.group(1):
            src = m.group(1)
            if 'jimcdn.com' in src and '/image/' in src and 'dimension=174' not in src:
                src = re.sub(r'dimension=[^/]+', 'dimension=900x10000', src)
                src = re.sub(r'format=\w+', 'format=jpg', src)
                seq.append(('img', src))
        else:
            t = re.sub(r'\s+', ' ', unescape(m.group(2))).strip()
            if AWARD.search(t) and not t.startswith('↓'):
                seq.append(('txt', t))
    return seq


def split_caption(t):
    """「男子シングルスA級 優勝 ○○」→ (種目, 「優勝 ○○」)。種目が無ければ ('', 全文)"""
    m = AWARD.search(t)
    return t[:m.start()].strip(' 　'), t[m.start():].strip()


def run(slug, path):
    url = SITE + urllib.parse.quote(path)
    seq = parse(fetch(url))
    folder = os.path.join(IMG_ROOT, slug)
    local = {}
    if os.path.isdir(folder):
        for f in sorted(os.listdir(folder)):
            if re.match(r'(result|photo)-\d+\.webp$', f):
                local[f[:-5]] = dhash(os.path.join(folder, f))
    os.makedirs(os.path.join(CACHE, slug), exist_ok=True)
    blocks = []
    pending = []
    unmatched = []
    for kind, v in seq:
        if kind == 'img':
            i = len([1 for k, _ in seq[: seq.index((kind, v)) + 1] if k == 'img'])
            dst = os.path.join(CACHE, slug, f'{i:03d}.jpg')
            if not os.path.exists(dst):
                subprocess.run(['curl', '-sL', '-A', 'Mozilla/5.0', '-o', dst, v], check=False)
            try:
                h = dhash(dst)
            except Exception:
                unmatched.append(f'{i:03d} (読めない)')
                continue
            best = sorted((dist(h, lh), name) for name, lh in local.items())
            if best and best[0][0] <= THRESHOLD:
                pending.append(best[0][1])
            else:
                unmatched.append(f'{i:03d} (最も近い {best[0][1] if best else "-"} d={best[0][0] if best else "-"})')
        else:
            label, caption = split_caption(v)
            if blocks and blocks[-1]['label'] == label and not pending:
                blocks[-1]['captions'].append(caption)
            else:
                blocks.append({
                    'label': label,
                    'sheets': [n for n in pending if n.startswith('result-')],
                    'photos': [n for n in pending if n.startswith('photo-')],
                    'captions': [caption],
                })
            pending = []
    if pending:
        blocks.append({'label': '', 'sheets': [n for n in pending if n.startswith('result-')], 'photos': [n for n in pending if n.startswith('photo-')], 'captions': []})
    # 同じ種目が続くとき（優勝の写真 → 文言 → 準優勝の写真 → 文言）は1つにまとめる
    merged = []
    for b in blocks:
        if merged and merged[-1]['label'] == b['label'] and not b['sheets']:
            merged[-1]['photos'] += b['photos']
            merged[-1]['captions'] += b['captions']
        else:
            merged.append(b)
    used = {n for b in merged for n in b['sheets'] + b['photos']}
    unused = sorted(n for n in local if n not in used)
    return merged, unmatched, unused


def main():
    only = sys.argv[1:]
    out = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    for path, slug in PAGES.items():
        if only and slug not in only:
            continue
        blocks, unmatched, unused = run(slug, path)
        out[slug] = blocks
        print(f'== {slug}: {len(blocks)} 種目')
        for b in blocks:
            print(f"   {b['label'] or '(種目なし)'} | 表 {b['sheets']} | 写真 {b['photos']} | {b['captions']}")
        if unmatched:
            print('   照合できない公式の画像:', unmatched)
        if unused:
            print('   どこにも付かなかったこちらの画像:', unused)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
