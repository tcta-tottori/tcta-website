# -*- coding: utf-8 -*-
"""旧サイトの保存データから、results.json の大会に「いつ・どこで」を足す。

results.json は旧サイトの結果ページから起こしたもので、結果ページ自体には
日付がほとんど書かれていない。日付は別の資料に残っている。

  1. 年間の大会日程（「○○taikai-nittei.pdf」「○○tournament-schedule.pdf」など）
     ……その年度の全大会の期日・会場が1枚の表になっている。平成30年度と
       平成26年度だけ画像しか残っていないので、下の MANUAL に書き写してある。
  2. 大会ごとのPDF（ドロー・プログラム・要綱・申込用紙・結果）
     ……先頭に「日程 ○月○日（日）」「会場 ○○」と書いてある。
  3. 旧サイトの大会ページのHTML（ドロー・ギャラリーのページ）
  4. 画像・PDFのファイル名に入っている日付（2023club-taiko-7-16-… など）

この順ではなく、資料の種類ごとに確からしさ（下の RANK）をつけて、
いちばん確からしいものを採る。ドロー・プログラムは実際に行われた日なので
年間日程（予定）より強い。予備日に順延された大会もあるため、
年間日程しか無いものは「予定日」である点に注意。

  python3 tools/fill_dates.py          # 下調べ（tools/dates_review.tsv を書くだけ）
  python3 tools/fill_dates.py --write  # src/data/results.json を書き換える

元データの置き場所は下の SRC_DIRS。手元の保存データを指しているので、
置き場所が変わったら書き換えること。
"""
import os, re, sys, json, csv, datetime, collections, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
RESULTS = os.path.join(REPO, 'src/data/results.json')
REVIEW = os.path.join(HERE, 'dates_review.tsv')

ARCHIVE = '/Users/kazuya/Desktop/鳥取市テニス協会WEB'
SRC_DIRS = [
    os.path.join(ARCHIVE, '06_過去資料'),
    os.path.join(ARCHIVE, '01_大会'),
    os.path.join(ARCHIVE, '07_ツール/スクレイピング/scrape_output'),
]

# ----------------------------------------------------------------------
# PDF をレイアウト（座標）どおりに行へ組み直す
# ----------------------------------------------------------------------
def pdf_rows(path):
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(path)
    for pno in range(len(doc)):
        tp = doc[pno].get_textpage()
        chars = []
        for i in range(tp.count_chars()):
            c = tp.get_text_range(i, 1)
            if not c or c in '\r\n': continue
            try: l, b, r, t = tp.get_charbox(i)
            except Exception: continue
            chars.append((round((b + t) / 2, 1), l, r, c))
        chars.sort(key=lambda x: (-x[0], x[1]))
        row, cury = [], None
        rows = []
        for y, l, r, c in chars:
            if cury is None or abs(y - cury) <= 3.0:
                row.append((l, r, c)); cury = y if cury is None else cury
            else:
                rows.append(row); row = [(l, r, c)]; cury = y
        if row: rows.append(row)
        for row in rows:
            row.sort(key=lambda x: x[0])
            s, prev = '', None
            for l, r, c in row:
                if prev is not None and l - prev > 4: s += '\t'
                s += c; prev = r
            if s.replace('\t', '').strip(): yield s

def nfkc(s): return unicodedata.normalize('NFKC', s or '')

# ----------------------------------------------------------------------
# 会場名をそろえる
# ----------------------------------------------------------------------
VENUE_RULES = [
    (re.compile(r'ヤマタ'), 'ヤマタスポーツパークテニスコート'),
    (re.compile(r'ｺｶ|コカ'), 'コカ・コーラウエストスポーツパークテニスコート'),
    (re.compile(r'布勢'), '布勢コート'),
    (re.compile(r'南谷'), '南谷コート'),
    (re.compile(r'湖山池'), '湖山池テニスコート'),
    (re.compile(r'気高'), '気高コート'),
    (re.compile(r'千代'), '鳥取市営千代テニス場'),
    (re.compile(r'市民体育館'), '鳥取市民体育館'),
    (re.compile(r'県民体育館'), '鳥取県民体育館'),
    (re.compile(r'産業体育館'), '鳥取産業体育館'),
    (re.compile(r'お台場'), 'お台場コート'),
]
def tidy_venue(v):
    if not v: return None
    v = nfkc(v)
    for pat, name in VENUE_RULES:
        if pat.search(v): return name
    return v.strip() or None

VENUE_IN_TEXT = re.compile(
    r'(ヤマタスポーツパーク[^\s。、]{0,12}|ｺｶ[・･]?ｺｰﾗ[^\s。、]{0,16}|コカ[・･]?コーラ[^\s。、]{0,20}'
    r'|布勢[^\s。、]{0,10}|南谷[^\s。、]{0,10}|湖山池[^\s。、]{0,10}|気高[^\s。、]{0,10}|千代[^\s。、]{0,10}'
    r'|鳥取県民体育館|鳥取市民体育館|鳥取産業体育館|県民体育館|市民体育館|産業体育館)')

# ----------------------------------------------------------------------
# 大会の「種類キー」
# ----------------------------------------------------------------------
def kind_from_name(name, extra=''):
    s = nfkc(name + ' ' + extra).replace(' ', '')
    def has(*ws): return any(w in s for w in ws)
    if has('国体', '国民体育大会'): return 'kokutai'
    if has('東部地区'):
        if has('ダブルス', '男女複'): return 'tobu_d'
        if has('シングルス', '男女単'): return 'tobu_s'
        return 'tobu'
    if has('会長杯', '会長盃'):
        if has('春'): return 'kaicho_s'
        if has('秋'): return 'kaicho_f'
        return 'kaicho'
    if has('健康テニス', 'マスターズ'):
        if has('春'): return 'kenko_s'
        if has('秋'): return 'kenko_f'
        if has('夏'): return 'kenko_natsu'
        return 'kenko'
    if has('佐々木'): return 'sasaki'
    if has('クラブ対抗'):
        if has('前期', '1部~6部', '1部～6部'): return 'club_zenki'
        if has('後期', '7部~8部', '7部～8部', '3部~5部', '3部～5部'): return 'club_kouki'
        return 'club'
    if has('市民体育祭', '体育祭'): return 'shimin'
    if has('全日本'): return 'alljapan'
    if has('気高カップ'): return 'ketaka_cup'
    if has('気高'): return 'ketaka_open'
    if has('サマーミックス', 'サマーナイト', 'サマーマイト'): return 'summer_mix'
    if has('ダンロップ', 'ダンロ'): return 'dunlop'
    if has('エネトピア'): return 'enetopia'
    if has('プリンス'): return 'prince'
    if has('県テニス選手権', '鳥取県選手権', '県選手権'):
        if has('ダブルス', '男女複'): return 'kensen_d'
        if has('シングルス', '男女単'): return 'kensen_s'
        return 'kensen'
    if has('市長杯', '市長盃'): return 'shicho'
    if has('尾坂', '室内'):
        if has('ダブルス', '男女複'): return 'osaka_d'
        if has('シングルス', '男女単'): return 'osaka_s'
        return 'osaka'
    if has('ガス杯'): return 'gas'
    if has('鳥大', '鳥取大'):
        if has('ダブルス'): return 'toridai_d'
        if has('シングルス'): return 'toridai_s'
        return 'toridai'
    if has('スポレク'): return 'sporec'
    if has('テニスの日', 'テニスデー'): return 'tennisday'
    return None

def kind_from_slug(slug, title=''):
    s = slug.lower(); t = nfkc(title).replace(' ', '')
    def hs(*ws): return any(w in s for w in ws)
    def ht(*ws): return any(w in t for w in ws)
    if hs('club-taiko', 'clubtaiko'):
        if re.search(r'm1-?6|w1-?2|zenki', s) or ht('1部〜6部', '1部・2部', '1・２部', '前期', '1〜6部'):
            return 'club_zenki'
        if re.search(r'm7-?8|m78|w3-?4|w34|w345|w3-5|w5|m8|kouki', s) or ht('7部', '8部', '3部', '4部', '5部', '後期'):
            return 'club_kouki'
        return 'club'
    if hs('tobu', 'toubu', 'to-bu'):
        if hs('-d') or ht('ダブルス'): return 'tobu_d'
        if hs('-s') or ht('シングルス'): return 'tobu_s'
        return 'tobu'
    if hs('kaicho', 'kaichou', 'kaicno'):
        if hs('-f') or ht('秋'): return 'kaicho_f'
        if hs('-s') or ht('春'): return 'kaicho_s'
        return 'kaicho'
    if hs('kenko'): return 'kenko_f' if ht('秋') else 'kenko_s'
    if hs('sasaki'): return 'sasaki'
    if hs('ketaka'): return 'ketaka_cup' if (hs('cup') or ht('カップ')) else 'ketaka_open'
    if hs('summer'): return 'summer_mix'
    if hs('dunlop', 'dunrop'): return 'dunlop'
    if hs('enetopia', 'enetpia'): return 'enetopia'
    if hs('prince'): return 'prince'
    if hs('kensen'):
        if hs('-d') or ht('ダブルス'): return 'kensen_d'
        if hs('-s') or ht('シングルス'): return 'kensen_s'
        return 'kensen'
    if hs('sicho', 'shicho', 'sichou', 'shichou'): return 'shicho'
    if hs('osaka', 'situnai', 'sitsunai'):
        if hs('-d') or ht('ダブルス'): return 'osaka_d'
        if hs('-s') or ht('シングルス'): return 'osaka_s'
        return 'osaka'
    if hs('gashai', 'gas-hai', 'gus-hai', 'gushai'): return 'gas'
    if hs('kokutai'): return 'kokutai'
    if hs('zennihon', 'all-japan', 'alljapan'): return 'alljapan'
    if hs('toridai'):
        if hs('-d') or ht('ダブルス'): return 'toridai_d'
        if hs('-s') or ht('シングルス'): return 'toridai_s'
        return 'toridai'
    if hs('tennisday', 'tennis-day'): return 'tennisday'
    return kind_from_name(title)

# ----------------------------------------------------------------------
# 年間の大会日程
# ----------------------------------------------------------------------
SCHEDULE_PDFS = {
    '2009': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/09taikai-nittei.pdf'],
    '2012': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/h24taikai-nittei.pdf'],
    '2015': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/2015taikai-nittei.pdf',
             '06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/h27taikai-nittei.pdf'],
    '2016': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/2016meeting-schedule.pdf'],
    '2017': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/2017tournament-schedule.pdf'],
    '2019': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/2019taikai-nittei.pdf'],
    '2020': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/2020tournament-schedule.pdf'],
    '2021': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/2021tournament-schedule.pdf'],
    '2022': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/2022tournament-schedule.pdf'],
    '2023': ['06_過去資料/旧サイト・旧大会/鳥取市テニス協会WEB/2023tournament-schedule.pdf'],
}

# 平成26・30年度は日程が画像でしか残っていないので、目視で書き写した。
MANUAL_SCHEDULE = {
    '2014': ('2014meeting-schedule.jpg', 'コカ・コーラウエストスポーツパークテニスコート', {
        'tobu_d': (3, 30), 'tobu_s': (4, 6), 'kaicho_s': (4, 13), 'sasaki': (4, 27),
        'kenko_s': (5, 10), 'club_zenki': (6, 22), 'club_kouki': (6, 29),
        'shimin': (7, 6, '鳥取市営千代テニス場'), 'summer_mix': (7, 19), 'alljapan': (7, 21),
        'ketaka_open': (8, 3), 'dunlop': (8, 24), 'gas': (9, 23), 'kensen_s': (10, 13),
        'kenko_f': (11, 8), 'kensen_d': (11, 16), 'shicho': (11, 23), 'kaicho_f': (11, 24),
        'osaka_s': (1, 10, '鳥取県民体育館'), 'osaka_d': (1, 17, '鳥取産業体育館'),
    }),
    '2018': ('2018taikai-nittei.jpg', 'コカ・コーラウエストスポーツパークテニスコート', {
        'tobu_s': (3, 25), 'tobu_d': (4, 1), 'kaicho_s': (4, 8), 'sasaki': (4, 15),
        'club_zenki': (5, 13), 'kenko_s': (6, 16), 'club_kouki': (6, 24), 'prince': (7, 1),
        'shicho': (7, 15), 'alljapan': (7, 16), 'ketaka_cup': (7, 22), 'summer_mix': (7, 29),
        'dunlop': (8, 26), 'gas': (9, 17), 'kenko_f': (10, 13), 'kensen_s': (10, 14),
        'kensen_d': (11, 18), 'kaicho_f': (11, 23), 'osaka_s': (12, 22, '鳥取産業体育館'),
    }),
}

# 元の資料そのものが間違っているもの。
# ・h24gashai-result.html は「平成24年11月28日（日）」とあるが、平成24年11月28日は水曜日。
#   年間日程（h24taikai-nittei.pdf）の 11/18（日）が正しい。
OVERRIDES = {
    '2012-h24gashai': (2012, 11, 18, 'コカ・コーラウエストスポーツパークテニスコート',
                       'h24taikai-nittei.pdf（結果ページの11月28日は曜日が合わない）'),
    # 下の2件は結果PDFが画像で文字を取り出せないので、紙面を目で読んで書き写した。
    '2011-11dunlop': (2011, 9, 23, 'コカ・コーラウエストスポーツパークテニスコート',
                      '11dunlop-result.pdf（画像のため目視）'),
    '2011-11zennihon': (2011, 7, 3, 'コカ・コーラウエストスポーツパークテニスコート',
                        '11zennihon-result.pdf（画像のため目視）'),
    # 令和6年度は年間日程が残っていない。クラブ対抗戦の後期は要項に日付がある。
    '2024-2024club-taiko-m7-8': (2024, 6, 23, 'ヤマタスポーツパークテニスコート',
                                 '2024club-taiko-6-24-yoko.pdf'),
    '2024-2024club-taiko-w345': (2024, 6, 23, 'ヤマタスポーツパークテニスコート',
                                 '2024club-taiko-6-24-yoko.pdf'),
}

MD_KANJI = re.compile(r'([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日')
MD_SLASH = re.compile(r'(?<![0-9/.])([0-9]{1,2})\s*/\s*([0-9]{1,2})(?![0-9/])')
# 尾坂杯の行だけ「R312/4（土）・5（日）」のように元号が頭につく
ERA_SLASH = re.compile(r'[RＲHＨ]\s*([0-9])\s*\.?\s*([0-9]{1,2})\s*/\s*([0-9]{1,2})')
NAME_HINT = re.compile(r'東部|会長杯|健康テニス|マスターズ|佐々木|クラブ対抗|体育祭|全日本|気高|サマー'
                       r'|ダンロ|エネトピア|プリンス|県テニス選手権|県選手権|市長杯|尾坂|室内|ガス杯|国体|鳥大|スポレク|テニスの日')

def parse_schedule(path):
    rows = [nfkc(s) for s in pdf_rows(path)]
    cut = len(rows)
    for i, r in enumerate(rows):
        if i > 8 and re.search(r'年度\s*大\s*会\s*名|年度大会名', r):
            cut = i; break
    rows = rows[:cut]
    out = []
    for i, r in enumerate(rows):
        if '№' in r or '予備日会場' in r: continue
        flat = r.replace('\t', '')
        m = MD_KANJI.search(flat)
        kanji = bool(m)
        if not m: m = MD_SLASH.search(r)
        if m:
            mo, da = int(m.group(1)), int(m.group(2))
        else:
            m = ERA_SLASH.search(flat)
            if not m: continue
            mo, da = int(m.group(2)), int(m.group(3))
        if not (1 <= mo <= 12 and 1 <= da <= 31): continue
        name = r if NAME_HINT.search(r) else ''
        if not name:   # 日付を持たない見出し行を先に探す
            for j in (i-1, i+1, i-2, i+2, i-3, i+3):
                if 0 <= j < len(rows) and NAME_HINT.search(rows[j]) \
                   and not (MD_KANJI.search(rows[j].replace('\t', '')) or MD_SLASH.search(rows[j])):
                    name = rows[j]; break
        if not name:   # それでも無ければ、すぐ上の見出し行
            for j in (i-1, i-2, i-3):
                if 0 <= j < len(rows) and NAME_HINT.search(rows[j]):
                    name = rows[j]; break
        if not name: continue
        cells = r.split('\t')
        at = 0
        for k, c in enumerate(cells):
            if (MD_KANJI.search(c.replace('\t', '')) if kanji else MD_SLASH.search(c)): at = k; break
        venue = None
        for c in cells[at+1:] + cells:
            v = VENUE_IN_TEXT.search(c)
            if v: venue = tidy_venue(v.group(1)); break
        k = kind_from_name(name, r)
        if k:
            pri = 2 if '本戦' in r else (0 if ('予選' in r and '予選会' not in r) else 1)
            out.append((k, mo, da, venue, pri))
    return out

def build_schedules():
    sched = {}
    for nendo, rels in SCHEDULE_PDFS.items():
        acc = {}
        src = None
        for rel in rels:
            p = os.path.join(ARCHIVE, rel)
            if not os.path.exists(p): continue
            src = src or os.path.basename(p)
            for k, mo, da, v, pri in parse_schedule(p):
                cur = acc.get(k)
                if cur is None or pri > cur[3]:
                    acc[k] = (mo, da, v, pri)
        sched[nendo] = {k: (v[0], v[1], v[2], src) for k, v in acc.items()}
    for nendo, (src, default_venue, table) in MANUAL_SCHEDULE.items():
        d = sched.setdefault(nendo, {})
        for k, v in table.items():
            d.setdefault(k, (v[0], v[1], v[2] if len(v) > 2 else default_venue, src))
    return sched

# ----------------------------------------------------------------------
# 大会ごとのPDF／HTMLから日付を拾う
# ----------------------------------------------------------------------
GOOD_LINE = re.compile(r'日\s*程|期\s*日|日\s*時|開\s*催\s*日|月\s*日')
BAD_LINE = re.compile(r'予備日|締切|締め切り|期限|申込|受付|ドロー会議|振込|抽選|領収')
ERA_YEAR = re.compile(r'(平成|令和)\s*(元|[0-9]{1,2})\s*年|(20[0-9]{2})\s*年')

def era_to_year(m):
    if m.group(3): return int(m.group(3))
    n = 1 if m.group(2) == '元' else int(m.group(2))
    return (1988 + n) if m.group(1) == '平成' else (2018 + n)

def date_from_pdf(path):
    try:
        rows = [nfkc(s).replace('\t', '').replace(' ', '') for s in pdf_rows(path)]
    except Exception:
        return None
    if not rows: return None
    year = None
    for r in rows[:40]:
        m = ERA_YEAR.search(r)
        if m: year = era_to_year(m); break
    venue = None
    for r in rows[:60]:
        v = VENUE_IN_TEXT.search(r.split('予備')[0])
        if v: venue = tidy_venue(v.group(1)); break
    # 古い結果表にある「Ｈ16.9.23」のような書き方（点が別の行に散っていることがある）
    for r in rows[:6]:
        m = re.search(r'[HＨ平成]\s*([0-9]{2})\.?([0-9]{3,4})(?![0-9])', r)
        if m:
            yr = 1988 + int(m.group(1)); rest = m.group(2)
            pairs = ([(int(rest[:1]), int(rest[1:]))] if len(rest) == 3
                     else [(int(rest[:2]), int(rest[2:]))])
            for mo, da in pairs:
                if 1 <= mo <= 12 and 1 <= da <= 31:
                    return {'month': mo, 'day': da, 'year': yr, 'venue': venue, 'sure': True}

    best = None
    for i, r in enumerate(rows[:80]):
        head = r.split('予備')[0]
        for m in MD_KANJI.finditer(head):
            score = 10 if GOOD_LINE.search(r) else 0
            if BAD_LINE.search(head[:m.start()]): score -= 20
            score -= i * 0.05
            mo, da = int(m.group(1)), int(m.group(2))
            if not (1 <= mo <= 12 and 1 <= da <= 31): continue
            if best is None or score > best[0]: best = (score, mo, da)
    if best is None or best[0] < -5: return None
    return {'month': best[1], 'day': best[2], 'year': year, 'venue': venue, 'sure': best[0] >= 5}

def html_text(path):
    import html as H
    b = open(path, 'rb').read()
    for enc in ('utf-8', 'shift_jis', 'cp932', 'euc_jp'):
        try: s = b.decode(enc); break
        except Exception: continue
    else: s = b.decode('shift_jis', errors='ignore')
    s = re.sub(r'(?is)<(script|style).*?</\1>', ' ', s)
    s = H.unescape(re.sub(r'<[^>]+>', ' ', s))
    return nfkc(re.sub(r'[\s　]+', ' ', s)).strip()

FULL_ERA = re.compile(r'(平成|令和)\s*(元|[0-9]{1,2})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日')
FULL_WEST = re.compile(r'(20[0-9]{2})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日')

def date_from_html(path):
    t = html_text(path)
    if not t: return None
    head = t[:1200]
    for pat, era in ((FULL_ERA, True), (FULL_WEST, False)):
        m = pat.search(head)
        if not m: continue
        if BAD_LINE.search(head[max(0, m.start()-14):m.start()]): continue
        g = m.groups()
        year = era_to_year(m) if era else int(g[0])
        mo, da = (int(g[2]), int(g[3])) if era else (int(g[1]), int(g[2]))
        v = VENUE_IN_TEXT.search(head[m.end():m.end()+140]) or VENUE_IN_TEXT.search(head)
        return {'month': mo, 'day': da, 'year': year,
                'venue': tidy_venue(v.group(1)) if v else None, 'sure': True}
    m = MD_KANJI.search(head[:400])
    if m and not BAD_LINE.search(head[max(0, m.start()-14):m.start()]):
        v = VENUE_IN_TEXT.search(head)
        return {'month': int(m.group(1)), 'day': int(m.group(2)), 'year': None,
                'venue': tidy_venue(v.group(1)) if v else None, 'sure': False}
    return None

# ----------------------------------------------------------------------
# 資料とスラッグの突き合わせ
# ----------------------------------------------------------------------
SPELLING = [('dunrop', 'dunlop'), ('shicho', 'sicho'), ('sichou', 'sicho'), ('kaichou', 'kaicho'),
            ('kaicno', 'kaicho'), ('toubu', 'tobu'), ('to-bu', 'tobu'), ('club-taiko', 'clubtaiko'),
            ('osaka-hai', 'osakahai'), ('gus-hai', 'gashai'), ('gas-hai', 'gashai'), ('gushai', 'gashai'),
            ('sasaki-hai', 'sasakihai'), ('zennihon', 'alljapan'), ('all-japan', 'alljapan'),
            ('enetpia', 'enetopia'), ('rusult', 'result'), ('reslt', 'result'), ('gallrey', 'gallery'),
            ('galley', 'gallery'), ('situnai', 'sitsunai')]

def canon(s):
    s = s.lower()
    for a, b in SPELLING: s = s.replace(a, b)
    return re.sub(r'[-_ .]', '', s)

def doc_rank(name):
    n = name.lower()
    if 'result' in n: return 6
    if 'program' in n or 'draw' in n: return 5
    if 'yoko' in n or 'youkou' in n: return 4
    if 'entry' in n: return 3
    return 2

# 束ね直す前のスラッグから「同じ大会の別ページ」を落とすための接尾辞
TAIL = re.compile(r'(gallery|gallrey|galley|result|draw|program|entry|yoko|info|-[0-9]{1,2})+$')
# 「-s」「-d」だけ違う資料（要綱がシングルスとダブルスで分かれていないなど）も手がかりにする
TAIL_SD = re.compile(r'[-_]([sdmwfq])$')
def sd_mark(name):
    parts = re.split(r'[-_.]', name.lower())
    if 's' in parts: return 's'
    if 'd' in parts: return 'd'
    return None

def main():
    write = '--write' in sys.argv
    print('資料を読んでいます…', file=sys.stderr)

    pdfs, htmls = {}, {}
    for root in SRC_DIRS:
        for dp, dns, fns in os.walk(root):
            for f in fns:
                low = f.lower()
                if low.endswith('.pdf') and f not in pdfs: pdfs[f] = os.path.join(dp, f)
                elif low.endswith(('.html', '.htm')) and f not in htmls: htmls[f] = os.path.join(dp, f)
    print(f'  PDF {len(pdfs)}件 / HTML {len(htmls)}件', file=sys.stderr)

    docs = collections.defaultdict(list)   # canon(ファイル名) -> [(rank, 名前, 取り出し関数)]
    for f in pdfs: docs[canon(os.path.splitext(f)[0])].append((doc_rank(f), f, 'pdf'))
    for f in htmls: docs[canon(os.path.splitext(f)[0])].append((doc_rank(f), f, 'html'))

    cache = {}
    def extract(name, kindof):
        if name in cache: return cache[name]
        try:
            r = date_from_pdf(pdfs[name]) if kindof == 'pdf' else date_from_html(htmls[name])
        except Exception:
            r = None
        cache[name] = r
        return r

    schedules = build_schedules()
    print('  年間日程: ' + ', '.join(f'{n}年度{len(v)}件' for n, v in sorted(schedules.items())), file=sys.stderr)

    results = json.load(open(RESULTS, encoding='utf-8'))

    def slug_year(slug):
        m = re.match(r'^(20[0-9]{2})', slug)
        if m: return int(m.group(1))
        m = re.match(r'^h([0-9]{1,2})(?![0-9])', slug)
        if m: return 1988 + int(m.group(1))
        m = re.match(r'^r([0-9])(?![0-9])', slug)
        if m: return 2018 + int(m.group(1))
        return None

    def year_for(nendo, month, slug, hint=None):
        nd = int(nendo)
        guess = nd if month >= 3 else nd + 1
        for y in (hint, slug_year(slug)):
            if y and y in (nd, nd + 1) and ((y == nd) == (month >= 3)):
                return y
        return guess

    def candidates(slug):
        c = canon(slug)
        base = TAIL.sub('', slug)
        short = canon(TAIL_SD.sub('', base)) or canon(base) or c
        mark = sd_mark(slug)
        out = []
        for key, lst in docs.items():
            if len(key) < 7: continue
            if key.startswith(c) or (len(c) > len(key) and c.startswith(key)):
                out += [(r + 10, n, k) for r, n, k in lst]
            elif short != c and (key.startswith(short) or (len(short) > len(key) and short.startswith(key))):
                # シングルスの大会にダブルスの資料を当てない
                out += [(r, n, k) for r, n, k in lst
                        if not (mark and sd_mark(n) and sd_mark(n) != mark)]
        return sorted(out, key=lambda x: -x[0])

    FNAME_DATE = re.compile(r'(?:^|[-_])([0-9]{1,2})-([0-9]{1,2})(?:[-_]|$)')
    ERA_LABEL = lambda y: (f'令和{y-2018}年' if y >= 2019 else f'平成{y-1988}年')

    rows = []
    for year in results:
        nendo = year['nendo']
        for t in year['tournaments']:
            slug = t['id'][len(nendo)+1:]
            kind = kind_from_slug(slug, t['title'])
            best = None    # (優先度, 年, 月, 日, 会場, 出典)

            if t['id'] in OVERRIDES:
                oy, omo, oda, ov, osrc = OVERRIDES[t['id']]
                best = (200, oy, omo, oda, ov, osrc)
            elif t.get('date') and t.get('dateSource') in (None, '旧サイトの本文'):
                # 旧サイトの本文から起こした日付。これだけはそのまま残す。
                best = (100, None, None, None, t.get('venue'), '既存')

            if best is None:
                for rank, name, how in candidates(slug):
                    d = extract(name, how)
                    if not d: continue
                    # 「日程」「日時」の行から採れなかった日付は、結果表・ドロー・要綱に
                    # 書いてあるときだけ信じる。申込用紙のそれは締切日のことが多い。
                    if not d['sure'] and (rank % 10) <= 3: continue
                    pri = (60 if d['sure'] else 30) + rank
                    best = (pri, d['year'], d['month'], d['day'], d['venue'], name)
                    break

            s = schedules.get(nendo, {})
            if kind:
                keys = [kind]
                if kind.endswith(('_s', '_d')): keys.append(kind[:-2])
                if kind in ('club_zenki', 'club_kouki'): keys.append('club')
                if kind == 'osaka': keys += ['osaka_s', 'osaka_d']
                for k in keys:
                    if k in s:
                        mo, da, v, src = s[k]
                        if best is None or best[0] < 60:
                            best = (60, None, mo, da, v, src)
                        break

            if best is None:
                names = [os.path.basename(p['src']) for p in t['photos']] + \
                        [os.path.basename(p) for p in t['pdfs']]
                for nm in names:
                    m = FNAME_DATE.search(os.path.splitext(nm)[0])
                    if m and 1 <= int(m.group(1)) <= 12 and 1 <= int(m.group(2)) <= 31:
                        best = (20, None, int(m.group(1)), int(m.group(2)), None, 'ファイル名:' + nm)
                        break

            rows.append({'nendo': nendo, 'id': t['id'], 'slug': slug, 'title': t['title'],
                         'kind': kind, 'best': best, 't': t})

    # 同じ大会の別ページ（「（写真）」「ギャラリー」など）に日付をうつす
    bykey = {}
    for r in rows:
        if r['best']:
            bykey.setdefault((r['nendo'], canon(TAIL.sub('', r['slug']))), r['best'])
            if r['kind']: bykey.setdefault((r['nendo'], r['kind']), r['best'])
    for r in rows:
        if r['best']: continue
        for key in ((r['nendo'], canon(TAIL.sub('', r['slug']))), (r['nendo'], r['kind'])):
            if key[1] and key in bykey:
                p, y, mo, da, v, src = bykey[key]
                r['best'] = (10, y, mo, da, v, src + '（同じ大会の別ページから）')
                break

    # results.json へ
    filled = collections.Counter()
    with open(REVIEW, 'w', encoding='utf-8', newline='') as fh:
        w = csv.writer(fh, delimiter='\t')
        w.writerow(['年度', 'id', '大会名', '種類', '日付', '曜日', '会場', '確からしさ', '出典'])
        for r in rows:
            t, b = r['t'], r['best']
            if not b:
                filled['なし'] += 1
                w.writerow([r['nendo'], r['id'], r['title'], r['kind'] or '', '', '', '', '', ''])
                continue
            pri, y, mo, da, venue, src = b
            if src == '既存':
                # もともと入っていた日付（旧サイトの本文から起こしたもの）はそのまま残す。
                filled['既存'] += 1
                if write: t.setdefault('dateSource', '旧サイトの本文')
                w.writerow([r['nendo'], r['id'], r['title'], r['kind'] or '', t['date'], '',
                            t.get('venue') or '', pri, src])
                continue
            yr = year_for(r['nendo'], mo, r['slug'], y)
            try:
                d = datetime.date(yr, mo, da)
            except ValueError:
                filled['日付が不正'] += 1
                continue
            label = f'{ERA_LABEL(yr)}{mo}月{da}日'
            venue = tidy_venue(venue)
            filled['入れた'] += 1
            w.writerow([r['nendo'], r['id'], r['title'], r['kind'] or '', label,
                        '月火水木金土日'[d.weekday()], venue or '', pri, src])
            if write:
                t['date'] = label
                t['dateSource'] = src
                if venue and not t.get('venue'): t['venue'] = venue

    print(dict(filled), file=sys.stderr)
    print('一覧を書きました: ' + REVIEW, file=sys.stderr)
    if write:
        with open(RESULTS, 'w', encoding='utf-8') as fh:
            json.dump(results, fh, ensure_ascii=False, separators=(',', ':'))
        print('results.json を更新しました', file=sys.stderr)

if __name__ == '__main__':
    main()
