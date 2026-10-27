# -*- coding: utf-8 -*-
"""旧サイトに残っていて results.json に入っていない大会結果を拾い直す。

results.json は `scrape_output/`（旧サイトを巡回して保存したもの）から起こした。
巡回は旧サイトの年度一覧から辿れるページしか見ていなかったので、手元の
旧サイト丸ごとの控え（`06_過去資料/旧サイト・旧大会/`）には、一覧から外れた
結果ページが150本ほど残っている。クラブ対抗戦の平成19・22〜25年度、平成27年度、
2016年度、2019年度、2023年度などがこれにあたる。

ここでやること。

  1. 控えの「結果ページらしい名前の HTML」で results.json に無いものを集め、
     parse_results.py と同じやり方で本文から 種目・優勝者 を取り出す
     （クラブ対抗戦だけはリーグ表が混ざるので専用の読み方をする）
  2. すでに results.json にある同じ大会が成績ゼロなら、そこに入れ直す。
     成績が入っていて優勝者も重なるなら、同じページなので捨てる。
     どちらでもなければ新しい大会として足す
  3. ページが載せていた画像を WebP（最大1000px・q72）にして
     public/assets/img/results/<年度>/ へ置き、sheet／photo を仕分ける

年度の決め方は下の `decide_nendo` を参照。

  python3 tools/restore_missing.py          # 下調べ（tools/restore_review.tsv を書くだけ）
  python3 tools/restore_missing.py --write  # results.json と public/assets を更新する

このあと `python3 tools/fill_dates.py --write` を流すと、足した大会にも日付が入る。
"""
import os, re, sys, json, csv, html as H, unicodedata, importlib.util, collections, glob

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
RESULTS = os.path.join(REPO, 'src/data/results.json')
REVIEW = os.path.join(HERE, 'restore_review.tsv')

ARCHIVE = '/Users/kazuya/Desktop/鳥取市テニス協会WEB'
MIRROR = os.path.join(ARCHIVE, '06_過去資料/旧サイト・旧大会')
SCRAPE_YEARS = os.path.join(ARCHIVE, '07_ツール/スクレイピング/scrape_output/data')
OLD_SITE = 'https://tottori-tennis.sakura.ne.jp/'

MAX_W, QUALITY = 1000, 72

# 本文パーサと大会の種類キーは、すでにある道具をそのまま使う
ARGS = list(sys.argv[1:])   # 下の _load が読み込む側の sys.argv を見ないよう、先に控える


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

PR = _load('parse_results')
FD = _load('fill_dates')

RESULT_NAME = re.compile(r'result|gallrey|gallery|galley|winner')
SKIP_NAME = re.compile(r'^(gallerypage|tournamaentresult|taikairesult|dc[0-9]|sporec|.*tennis-?day|.*tennis-?festa|.*kidstennis)')
IMG_JUNK = re.compile(r'bg_|header|arrow|line_|banner|icon|logo|s-top|top_up|menu|btn|spacer')


def nfkc(s):
    return unicodedata.normalize('NFKC', s or '')


def decode(path):
    b = open(path, 'rb').read()
    for enc in ('utf-8', 'shift_jis', 'cp932', 'euc_jp'):
        try:
            return b.decode(enc)
        except Exception:
            continue
    return b.decode('shift_jis', errors='ignore')


def page_title(src):
    m = re.search(r'(?is)<title[^>]*>(.*?)</title>', src)
    return H.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''


def body_text(src):
    s = re.sub(r'(?is)<(script|style).*?</\1>', ' ', src)
    s = H.unescape(re.sub(r'<[^>]+>', ' ', s))
    return re.sub(r'[\s　]+', ' ', s).strip()


def page_images(src):
    out = []
    for u in re.findall(r'(?i)<img[^>]+src="([^"]+)"', src):
        n = os.path.basename(u)
        if not n.lower().endswith(('.jpg', '.jpeg', '.png', '.gif')):
            continue
        if IMG_JUNK.search(n.lower()) or n in out:
            continue
        out.append(n)
    return out


# ---------------------------------------------------------------- 成績の読み取り
CLUB_ROW = re.compile(r'(男子|女子)\s*([0-9]{1,2})\s*部\s*(?:の)?\s*[:：]?\s*優\s*勝\s*[:：]?\s*(.{1,24}?)'
                      r'(?=(?:男子|女子)\s*[0-9]{1,2}\s*部|$)')
NAME_BAD = re.compile(r'^[のはがをに、・]|[。♪⌒ヽ？?！!…]|平成|令和|年度|テニス協会|ナビゲーション|コート|ページ'
                      r'|皆さん|写真|ギャラリー|隠し|チーム名|リーグ|トーナメントの|^チームの|[＆&]$')


def parse_club(text):
    """クラブ対抗戦のページ。リーグ表が本文に混ざるので「男子N部 優勝 ○○」だけ拾う。"""
    t = re.sub(r'[\s　]+', '', nfkc(PR.clean(text)))
    rows = []
    for g, no, name in CLUB_ROW.findall(t):
        name = re.sub(r'(チーム名|結果|優勝).*$', '', name).strip('・、，:：')
        if not name or NAME_BAD.search(name):
            continue
        rows.append({'category': f'{g}{int(no)}部',
                     'places': [{'award': '優勝', 'name': name}]})
    # 同じ部が二度出たら先のものを残す
    seen, out = set(), []
    for r in rows:
        if r['category'] in seen:
            continue
        seen.add(r['category'])
        out.append(r)
    return out


def clean_categories(cats):
    """名前が明らかに本文の切れ端になっている行を落とす。"""
    out = []
    for c in cats:
        places = [p for p in c['places']
                  if p.get('name') and len(p['name']) <= 26 and not NAME_BAD.search(p['name'])]
        if not places:
            continue
        cat = re.sub(r'結果$', '', c['category']).strip()
        out.append({'category': cat, 'places': places})
    return out


def read_page(src):
    text = body_text(src)
    title = page_title(src)
    if 'クラブ対抗' in nfkc(title + text[:200]):
        # リーグ表がそのまま本文に出るので、ふつうのパーサでは読めない。
        # 「男子N部 優勝 ○○」が無いページ（予選リーグだけのページ）は落とす。
        return parse_club(text)
    cats, _ = PR.parse(text)
    return clean_categories(cats)


# ---------------------------------------------------------------- 題名と年度
ERA_HEAD = re.compile(r'^\s*(?:平成\s*[0-9]{1,2}\s*年度?|令和\s*[0-9]{1,2}\s*年度?'
                      r'|[HＨRＲ]\s*[0-9]{1,2}\s*年?度?|(?:20[0-9]{2})\s*年?度?)')
TITLE_TAIL = re.compile(r'(結果|決勝Ｔ|決勝T)+\s*$')


def tidy_title(raw):
    t = re.sub(r'[\s　]+', '', H.unescape(raw or ''))
    t = re.sub(r'^(?:鳥取市テニス協会)?', '', t)
    t = TITLE_TAIL.sub('', t)
    cut = ERA_HEAD.sub('', t)
    if len(cut) >= 5:
        t = cut
    cut = re.sub(r'^(?:0[0-9]|1[0-9]|2[0-4])(?=[^0-9])', '', t)
    if len(cut) >= 5:
        t = cut
    t = re.sub(r'部部', '部', t)
    return t.strip() or (raw or '').strip()


def year_in_text(s):
    t = re.sub(r'[\s　]+', '', nfkc(s or ''))
    m = re.search(r'平成([0-9]{1,2})年', t)
    if m:
        y = 1988 + int(m.group(1))
    else:
        m = re.search(r'令和([0-9]{1,2})年', t)
        if m:
            y = 2018 + int(m.group(1))
        else:
            m = re.search(r'(20[0-9]{2})年', t)
            if not m:
                return None
            y = int(m.group(1))
    # 1〜3月の大会は前の年度に属する
    mm = re.search(r'年\s*([0-9]{1,2})\s*月', t[m.start():])
    if mm and 1 <= int(mm.group(1)) <= 3 and '年度' not in t[m.start():m.start() + 6]:
        y -= 1
    return y


SPELLING = [('dunrop', 'dunlop'), ('shicho', 'sicho'), ('sichou', 'sicho'), ('kaichou', 'kaicho'),
            ('kaicno', 'kaicho'), ('toubu', 'tobu'), ('to-bu', 'tobu'), ('club-taiko', 'clubtaiko'),
            ('club_taiko', 'clubtaiko'), ('osaka-hai', 'osakahai'), ('gus-hai', 'gashai'),
            ('gas-hai', 'gashai'), ('gushai', 'gashai'), ('torigas-hai', 'gashai'),
            ('sasaki-hai', 'sasakihai'), ('zennihon', 'alljapan'), ('all-japan', 'alljapan'),
            ('enetpia', 'enetopia'), ('situnai', 'sitsunai'), ('tottorisitsunai', 'sitsunai')]


def canon(s):
    s = s.lower()
    for a, b in SPELLING:
        s = s.replace(a, b)
    return re.sub(r'[-_ .,]', '', s)


def common_prefix(a, b):
    n = 0
    while n < len(a) and n < len(b) and a[n] == b[n]:
        n += 1
    return n


KAI = re.compile(r'第\s*([0-9]{1,3})\s*回')
# 第N回が年に何度あるか。会長杯だけ春・秋の年2回。
KAI_STEP = {'kaicho': 2, 'kaicho_s': 2, 'kaicho_f': 2}


def kind_of(title, slug=''):
    return FD.kind_from_slug(slug.lower(), title) if slug else FD.kind_from_name(title)


def kai_table(data):
    """results.json にある「第N回○○」から、大会ごとの 回数→年度 の手がかりを作る。"""
    anchors = collections.defaultdict(dict)
    for y in data:
        for t in y['tournaments']:
            m = KAI.search(nfkc(t['title']))
            k = FD.kind_from_slug(t['id'][len(y['nendo']) + 1:].lower(), t['title'])
            if not m or not k:
                continue
            base = k.split('_')[0]
            anchors[base].setdefault(int(m.group(1)), int(y['nendo']))
    return anchors


def nendo_from_kai(anchors, kind, title, text=''):
    m = KAI.search(nfkc(title)) or KAI.search(nfkc(text[:300]))
    if not m or not kind:
        return None
    base = kind.split('_')[0]
    table = anchors.get(base)
    if not table:
        return None
    n = int(m.group(1))
    if n in table:
        return table[n]
    step = KAI_STEP.get(base, 1)
    # 近い手がかりから数える。手がかり同士が食い違う回は使わない。
    guesses = set()
    for an, ay in table.items():
        guesses.add(ay + (n - an) // step if step > 1 else ay + (n - an))
    return guesses.pop() if len(guesses) == 1 else None


# ---------------------------------------------------------------- 画像
def to_webp(src_path, nendo, name):
    from PIL import Image
    out_rel = f'assets/img/results/{nendo}/{os.path.splitext(name)[0]}.webp'
    out_abs = os.path.join(REPO, 'public', out_rel)
    if not os.path.exists(out_abs):
        os.makedirs(os.path.dirname(out_abs), exist_ok=True)
        im = Image.open(src_path).convert('RGB')
        w, h = im.size
        if w > MAX_W:
            im = im.resize((MAX_W, round(h * MAX_W / w)), Image.LANCZOS)
        im.save(out_abs, 'WEBP', quality=QUALITY, method=4)
    im = Image.open(out_abs)
    w, h = im.size
    if w <= 300 or h < 100:
        return None
    small = im.convert('RGB')
    small.thumbnail((120, 120))
    px = list(small.getdata())
    white = sum(1 for r, g, b in px if min(r, g, b) > 225) / len(px)
    kind = 'sheet' if white >= 0.35 or (white >= 0.28 and w >= 800) else 'photo'
    return {'src': out_rel, 'w': w, 'h': h, 'kind': kind}


def winners(cats):
    return {p['name'] for c in cats for p in c['places']
            if p.get('name') and p.get('award', '').startswith('優勝')}


def win_pairs(cats):
    return {(c['category'], p['name']) for c in cats for p in c['places']
            if p.get('name') and p.get('award', '').startswith('優勝')}


def same_event(a, b):
    """同じページの焼き直しかどうか。種目と優勝者の組で見る。"""
    pa, pb = win_pairs(a), win_pairs(b)
    if pa and pb and len(pa & pb) >= 0.5 * min(len(pa), len(pb)):
        return True
    wa, wb = winners(a), winners(b)
    return bool(wa and wb and min(len(wa), len(wb)) >= 3
                and len(wa & wb) >= 0.5 * min(len(wa), len(wb)))


# ---------------------------------------------------------------- 本体
def main():
    write = '--write' in ARGS

    html_files, image_files = {}, {}
    for dp, dns, fns in os.walk(MIRROR):
        for f in fns:
            low = f.lower()
            if low.endswith(('.html', '.htm')):
                html_files.setdefault(low.rsplit('.', 1)[0], os.path.join(dp, f))
            elif low.endswith(('.jpg', '.jpeg', '.png', '.gif')):
                image_files.setdefault(low, os.path.join(dp, f))
    print(f'控え: HTML {len(html_files)}本 / 画像 {len(image_files)}枚', file=sys.stderr)

    # 巡回したときの年度わけ（ページによってはこれだけが手がかり）
    scraped_nendo = {}
    for f in glob.glob(os.path.join(SCRAPE_YEARS, '*.json')):
        if os.path.basename(f) == 'index.json':
            continue
        d = json.load(open(f, encoding='utf-8'))
        if not isinstance(d, dict) or 'tournaments' not in d:
            continue
        label = d.get('label') or ''
        y = year_in_text(label)
        if y is None:
            continue
        for t in d['tournaments']:
            scraped_nendo.setdefault(t['id'].lower(), y)

    data = json.load(open(RESULTS, encoding='utf-8'))
    years = {y['nendo']: y for y in data}
    anchors = kai_table(data)
    known, slug_nendo = set(), {}
    for y in data:
        for t in y['tournaments']:
            slug = t['id'][len(y['nendo']) + 1:]
            for k in (os.path.basename(t.get('sourceUrl') or '').rsplit('.', 1)[0], slug):
                if k:
                    known.add(k.lower())
                    slug_nendo[canon(k)] = y['nendo']

    review = []

    # ---- すでにある大会で成績が空のものを、控えの HTML から取り直す
    refilled = 0
    for y in data:
        for t in y['tournaments']:
            if sum(len(c['places']) for c in t['categories']):
                continue
            base = os.path.basename(t.get('sourceUrl') or '').rsplit('.', 1)[0].lower()
            p = html_files.get(base) or html_files.get(t['id'][len(y['nendo']) + 1:].lower())
            if not p:
                continue
            cats = read_page(decode(p))
            n = sum(len(c['places']) for c in cats)
            if n:
                refilled += 1
                review.append(['入れ直し', y['nendo'], t['id'], t['title'], n, '', '',
                               '／'.join(sorted(winners(cats)))[:140]])
                if write:
                    t['categories'] = cats

    # ---- 控えにしか無い結果ページを集める
    found, unplaced, photo_only = [], [], []
    for key in sorted(html_files):
        if key in known or not RESULT_NAME.search(key) or SKIP_NAME.match(key):
            continue
        src = decode(html_files[key])
        cats = read_page(src)
        rows = sum(len(c['places']) for c in cats)
        if not rows:
            # 成績が読めないページ（ギャラリー）。写真だけでも残すので、あとでまとめて見る。
            photo_only.append((key, src))
            continue
        raw_title = page_title(src)
        title = tidy_title(raw_title)
        kind = FD.kind_from_slug(key, title)
        nendo, how = decide_nendo(key, raw_title, body_text(src), kind,
                                  slug_nendo, scraped_nendo, anchors)
        if nendo is None or str(nendo) not in years:
            unplaced.append((key, title, rows))
            continue
        found.append({'key': key, 'src': src, 'title': title, 'nendo': str(nendo),
                      'kind': kind, 'cats': cats, 'rows': rows, 'how': how})

    # ---- 中身が同じページ（ファイル名だけ違うもの）をまとめる
    uniq, by_sig = [], {}
    for f in found:
        sig = (f['nendo'], f['title'], tuple(sorted(winners(f['cats']))))
        if sig in by_sig:
            continue
        by_sig[sig] = f
        uniq.append(f)

    # ---- すでにある大会と突き合わせる
    added, merged, skipped, upgraded = [], [], [], []
    for f in uniq:
        f['images'] = [n for n in page_images(f['src']) if n.lower() in image_files]
        w = winners(f['cats'])
        same = [t for t in years[f['nendo']]['tournaments']
                if f['kind'] and FD.kind_from_slug(t['id'][len(f['nendo']) + 1:].lower(), t['title']) == f['kind']]
        empty = [t for t in same if not sum(len(c['places']) for c in t['categories'])]
        dup = None
        for t in same:
            if same_event(t['categories'], f['cats']):
                dup = t
                break
        if dup is not None:
            # 同じ大会でも、控えのページのほうが中身が多ければそちらに入れ替える
            have = sum(len(c['places']) for c in dup['categories'])
            if f['rows'] > have and winners(dup['categories']) <= w:
                upgraded.append((f, dup))
            else:
                skipped.append((f, dup))
        elif empty:
            merged.append((f, empty[0]))
        else:
            added.append(f)

    for f, t in skipped:
        review.append(['重複で見送り', f['nendo'], f['key'], f['title'], f['rows'],
                       len(f['images']), f['how'], f'既存 {t["id"]} と同じ'])
    for f, t in upgraded:
        review.append(['既存を差し替え', f['nendo'], f['key'], t['title'], f['rows'],
                       len(f['images']), f['how'], '／'.join(sorted(winners(f['cats'])))[:140]])
    for f, t in merged:
        review.append(['既存に合流', f['nendo'], f['key'], t['title'], f['rows'],
                       len(f['images']), f['how'], '／'.join(sorted(winners(f['cats'])))[:140]])
    for f in added:
        review.append(['追加', f['nendo'], f['key'], f['title'], f['rows'],
                       len(f['images']), f['how'], '／'.join(sorted(winners(f['cats'])))[:140]])
    for key, title, rows in unplaced:
        review.append(['年度が決められず見送り', '', key, title, rows, '', '', ''])

    # ---- 成績が読めないページ（ギャラリー）。大会名と写真だけでも残す。
    #      同じ年度に同じ大会があれば「○○（写真）」として束ねられるようにする。
    for f, _t in skipped:
        photo_only.append((f['key'], f['src']))
    galleries = []
    for key, src in photo_only:
        imgs = [n for n in page_images(src) if n.lower() in image_files]
        if len(imgs) < 3:
            continue
        raw_title = page_title(src)
        title = tidy_title(raw_title)
        kind = FD.kind_from_slug(key, title)
        nendo, how = decide_nendo(key, raw_title, body_text(src), kind,
                                  slug_nendo, scraped_nendo, anchors)
        if nendo is None or str(nendo) not in years:
            review.append(['写真・年度が決められず見送り', '', key, title, 0, len(imgs), '', ''])
            continue
        nendo = str(nendo)
        parent = None
        if kind:
            cands = [t for t in years[nendo]['tournaments']
                     if FD.kind_from_slug(t['id'][len(nendo) + 1:].lower(), t['title']) == kind
                     and sum(len(c['places']) for c in t['categories'])
                     and not re.search(r'（写真）$', t['title'])]
            if cands:
                parent = max(cands, key=lambda t: sum(len(c['places']) for c in t['categories']))
        name = title
        if parent:
            base = re.sub(r'(ギャラリ[ーｰ]?[0-9]*|入賞者)$', '', parent['title']).strip()
            if len(base) >= 3:
                name = base + '（写真）'
        if not name:
            name = 'ギャラリー'
        galleries.append({'key': key, 'src': src, 'title': name, 'nendo': nendo,
                          'kind': kind, 'cats': [], 'rows': 0, 'how': how, 'images': imgs})
        review.append(['写真だけ追加', nendo, key, name, 0, len(imgs), how, ''])

    with open(REVIEW, 'w', encoding='utf-8', newline='') as fh:
        wtr = csv.writer(fh, delimiter='\t')
        wtr.writerow(['区分', '年度', 'ページ', '題名', '成績行', '写真', '年度の決め方', '優勝者'])
        wtr.writerows(review)
    print(f'入れ直し {refilled} / 追加 {len(added)} / 既存に合流 {len(merged)} / '
          f'既存を差し替え {len(upgraded)} / 重複で見送り {len(skipped)} / '
          f'写真だけ追加 {len(galleries)} / 年度が決められず {len(unplaced)}', file=sys.stderr)
    print('一覧を書きました: ' + REVIEW, file=sys.stderr)

    if not write:
        return

    def photos_of(f):
        out = []
        for n in f['images']:
            try:
                info = to_webp(image_files[n.lower()], f['nendo'], n)
            except Exception as e:
                print('画像NG', n, e, file=sys.stderr)
                continue
            if info:
                out.append(info)
        return out

    for f, t in merged + upgraded:
        t['categories'] = f['cats']
        have = {p['src'] for p in t['photos']}
        t['photos'] = t['photos'] + [p for p in photos_of(f) if p['src'] not in have]

    for f in added + galleries:
        t = {
            'id': f'{f["nendo"]}-{f["key"]}',
            'title': f['title'],
            'date': None,
            'venue': None,
            'categories': f['cats'],
            'photos': photos_of(f),
            'pdfs': [],
            'sourceUrl': OLD_SITE + f['key'] + '.html',
        }
        lst = years[f['nendo']]['tournaments']
        ck = canon(f['key'])
        at, best = len(lst), 0
        for i, other in enumerate(lst):
            n = common_prefix(ck, canon(other['id'][len(f['nendo']) + 1:]))
            if n >= 7 and n >= best:
                at, best = i + 1, n
        lst.insert(at, t)

    with open(RESULTS, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    print('results.json を更新しました', file=sys.stderr)


def decide_nendo(key, raw_title, text, kind, slug_nendo, scraped_nendo, anchors):
    """年度の決め方。確かな手がかりから順に見る。"""
    ck = canon(key)
    best, best_n = None, 0
    for ok, nendo in slug_nendo.items():          # 1. 同じ大会の別ページが results.json にある
        n = common_prefix(ck, ok)
        if n >= 7 and n > best_n:
            best, best_n = nendo, n
    if best:
        return best, '同じ大会の別ページ'
    if key in scraped_nendo:                      # 2. 旧サイトを巡回したときの年度わけ
        return scraped_nendo[key], '巡回時の年度わけ'
    y = year_in_text(raw_title) or year_in_text(text[:300])
    if y:                                         # 3. 題名か本文の先頭にある年
        return y, '題名・本文の年'
    y = nendo_from_kai(anchors, kind, raw_title, text)  # 4. 「第N回」から数える
    if y:
        return y, '第N回から逆算'
    m = re.match(r'^(20[0-9]{2})', key)           # 5. ファイル名の年
    if m:
        return int(m.group(1)), 'ファイル名の年'
    m = re.match(r'^h([0-9]{1,2})(?![0-9])', key)
    if m:
        return 1988 + int(m.group(1)), 'ファイル名の年'
    m = re.match(r'^([0-9]{2})(?!th)', key)
    if m:
        return 2000 + int(m.group(1)), 'ファイル名の年'
    return None, ''


main()
