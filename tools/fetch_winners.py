"""公式サイト（Jimdo）の「大会結果」ページから、種目ごとの優勝・準優勝の文章を取り込む。

公式サイトの各結果ページには、画像のほかに

    男子シングルスA級　優勝　米本　叶芽　選手
    1位トーナメント　準優勝　小川・山内　ペア

のような1行が種目ごとに書かれている。これを拾って src/data/winners.json に
{ slug: { source, title, categories: [ { category, places: [ { award, name } ] } ] } }
の形で保存する。大会1件ごとのページ（event-<slug>.html）の「成績」の表と、
大会結果ページの一覧の要約（優勝 ○○）に使う。

■ 使い方
    python3 tools/fetch_winners.py
  PAGES に「公式サイトのURL → slug」を足してから流す。slug は build_events.py の
  MANIFEST と同じもの。公式サイトに結果が載ったあとで流せば、そのぶんが増える。

■ 拾わないもの
  「↓画像をタップ…」のような案内文、ページの見出し、【修正】の注記は落とす。
  名前の末尾の「選手」「ペア」は results.json（旧サイト分）にそろえて残す。
"""
import json
import os
import re
import subprocess
import sys
import urllib.parse
from html import unescape

SITE = 'https://www.tottori-tenis.net'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src/data/winners.json')

# 公式サイトの結果ページ → このサイトの slug
PAGES = {
    # 令和8年度
    '/大会結果/r8/東部s結果/': 'r8-tobu-singles',
    '/大会結果/r8/東部w結果/': 'r8-tobu-doubles',
    '/大会結果/r8/佐々木杯ミックスダブルス/': 'r8-sasaki',
    '/大会結果/r8/会長杯団体戦/': 'r8-kaicho-spring',
    '/大会結果/r8/鳥大オープンダブルス/': 'r8-tottori-univ-open',
    '/大会結果/r8/気高カップ/': 'r8-ketaka',
    '/大会結果/r8/サマーミックス結果/': 'r8-summer-mix',
    '/大会結果/r8/ダンロップ/': 'r8-dunlop',
    # 令和7年度
    '/大会結果/r7/東部s結果/': 'r7-tobu-singles',
    '/大会結果/r7/東部w結果/': 'r7-tobu-doubles',
    '/大会結果/r7/佐々木杯ミックスダブルス/': 'r7-sasaki',
    '/大会結果/r7/会長杯ダブルス春季/': 'r7-kaicho-spring',
    '/大会結果/r7/気高サマーシングルス結果/': 'r7-ketaka',
    '/大会結果/r7/サマーミックス結果/': 'r7-summer-mix',
    '/大会結果/r7/ダンロップ/': 'r7-dunlop',
    '/大会結果/r7/エネトピア結果/': 'r7-enetopia',
    '/大会結果/r7/プリンスオープン/': 'r7-prince-open',
    '/大会結果/r7/県選シングルス/': 'r7-kensen-singles',
    '/大会結果/r7/県選ダブルス/': 'r7-kensen-doubles',
    '/大会結果/r7/会長杯団体戦/': 'r7-kaicho-autumn',
    '/大会結果/r7/市長杯/': 'r7-shicho',
    '/大会結果/r7/鳥大オープン/': 'r7-tottori-univ-singles',
    '/大会結果/r7/尾坂杯/': 'r7-osaka',
}

AWARDS = ['優勝', '準優勝', '第3位', '第３位', 'ベスト4', 'ベスト４', 'ベスト8', 'ベスト８']
# 「3位トーナメント」「4位・5位トーナメント」の「3位」を順位と取り違えないよう、
# 順位の語は前後が空白か行端のときだけ拾う
AWARD_RE = re.compile(r'(?:(?<=\s)|^)(' + '|'.join(re.escape(a) for a in sorted(AWARDS, key=len, reverse=True)) + r')(?=\s|$)')


def fetch(path):
    url = SITE + urllib.parse.quote(path)
    raw = subprocess.run(['curl', '-sL', '--compressed', '-A', 'Mozilla/5.0', url],
                         capture_output=True, check=True).stdout
    return raw.decode('utf-8', 'ignore')


def content_text(html):
    m = re.search(r'<div id="content_area".*?(?=<div id="sidebar|<footer|<div class="jtpl-footer)', html, re.S)
    body = m.group(0) if m else html
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', body, flags=re.S)
    # Jimdo は1行を複数の <p>/<span> に割ることがあるので、ブロック要素の境目だけ改行にする
    body = re.sub(r'</(p|div|h\d|li|tr)>', '\n', body)
    body = re.sub(r'<br\s*/?>', '\n', body)
    text = unescape(re.sub(r'<[^>]+>', '', body))
    text = text.replace('\u3000', ' ').replace('\xa0', ' ')
    return [re.sub(r'\s+', ' ', l).strip() for l in text.split('\n') if l.strip()]


def norm_award(a):
    return a.replace('３', '3').replace('４', '4').replace('８', '8')


def clean_name(n):
    n = re.sub(r'[（(]\s*(左|右|中央|左から|右から)[^）)]*[）)]', '', n)   # 写真の位置の注記
    return re.sub(r'\s+', ' ', n).strip(' ・:：')


def parse(lines):
    """行の並びから [{category, places:[{award,name}]}] を作る。
    1行に「優勝 ○○ 準優勝 △△」と2つ以上あることもあるので、順位の語で区切る。"""
    cats, order = {}, []
    title = None
    for l in lines:
        if l.startswith('↓') or l.startswith('【'):
            continue
        ms = list(AWARD_RE.finditer(l))
        if not ms:
            if title is None and ('結果' in l or '大会' in l):
                title = l
            continue
        cat = l[:ms[0].start()].strip(' ・:：')
        if not cat and order:
            cat = order[-1]
        if cat not in cats:
            cats[cat] = []
            order.append(cat)
        for i, m in enumerate(ms):
            end = ms[i + 1].start() if i + 1 < len(ms) else len(l)
            name = clean_name(l[m.end():end])
            if name:
                cats[cat].append({'award': norm_award(m.group(1)), 'name': name})
    return title, [{'category': c, 'places': cats[c]} for c in order]


def main():
    out = {}
    for path, slug in PAGES.items():
        html = fetch(path)
        title, categories = parse(content_text(html))
        n = sum(len(c['places']) for c in categories)
        print(f'{slug:26s} {n:3d}件  {title or ""}', file=sys.stderr)
        if not categories:
            continue
        out[slug] = {'source': SITE + urllib.parse.quote(path), 'title': title, 'categories': categories}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f'完了  {len(out)}大会 → {os.path.relpath(OUT)}', file=sys.stderr)


if __name__ == '__main__':
    main()
