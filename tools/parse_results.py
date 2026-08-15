"""旧サイトの大会結果ページの本文から、種目・順位・選手名を取り出す。

本文はページから文字だけを抜いたもので、改行もタグも残っていない。
たとえばこういう1本の文字列になっている。

  男子シングルスA級　　優勝　小池直哉選手（左）　準優勝　安田彰汰選手男子シングルス　B級　…
  男子1部　優勝　ウィング男子2部　優勝　カプリスA男子3部　優勝　…

そこで「優勝／準優勝／第3位／ベスト4」を目印に切り、
  ・目印の前  → 種目（空なら直前の種目が続いているとみなす）
  ・目印の後  → 名前
として拾う。名前の終わりは
  ・「選手」「ペア」「さん」などの語（個人戦）
  ・次の賞、または次の種目らしい語の直前（団体戦・クラブ対抗戦）
のうち、いちばん手前にあるところ。
"""
import json, glob, os, re, unicodedata

SRC = '/Users/kazuya/Desktop/鳥取市テニス協会WEB/scrape_output/data/results'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'parsed.json')

# 本文の後ろにくっついている共通ナビ。ここから先は捨てる。
NAV_MARKS = ['このページの先頭へ', 'ナビゲーションtop page', 'copyright©']

AWARD = re.compile(
    r'準\s*優\s*勝|優\s*勝|第\s*[3３]\s*位|ベスト\s*[48４８]'
    # 「１位　◯◯ペア」形式（グループ戦）。
    # 「1位トーナメント」「4位・5位トーナメント」は種目名なので外す
    r'|[0-9０-９]\s*位(?!\s*(?:[・･]\s*[0-9０-９]\s*位\s*)?(?:トーナメント|グループ|リーグ|ブロック))'
)

# 種目らしい語。名前がどこで終わるかの判断にも使う。
CAT = re.compile(
    r'(?:男子|女子)\s*[0-9０-９]{1,2}\s*部'
    r'|(?:男子|女子|一般|ジュニア)[^優勝準]{0,16}?(?:シングルス|ダブルス)'
    r'|(?:シングルス|ダブルス)\s*[ＡＢＣA-C]?\s*級?'
    r'|[0-9０-９一二三四五]{1,2}\s*位(?:\s*・\s*[0-9０-９]{1,2}\s*位)?\s*(?:トーナメント|グループ|リーグ)'
    r'|[ＡＢＣA-C]\s*(?:ゾーン|ゾンーン|グループ|ブロック)'
)

# 個人戦の名前の終わりの目印。
NAME_END = re.compile(r'(選手|ペア|ペヤ|さん|君|組)')
# 名前の前後につく（左）（左から）などの補足。
PAREN = re.compile(r'[（(][^）)]{0,14}[）)]')
# 名前の頭に残りがちなゴミ。
LEAD_JUNK = re.compile(r'^(?:選手|ペア|さん|君|組|結果|は|・|、|，)+')
# 種目名の末尾につく「（左より）」「左から」などの写真の説明。
CAT_TAIL = re.compile(r'(?:[（(][^）)]{0,14}[）)]|左から|左より|右から|右より|中央|写真)+$')

DATE = re.compile(r'(?:平成|令和)\s*(?:[0-9０-９]{1,2}|元)\s*年\s*[0-9０-９]{1,2}\s*月(?:\s*[0-9０-９]{1,2}\s*日)?')
VENUE = re.compile(r'(ヤマタスポーツパーク[^　\s]*|千代[^　\s]*|県民体育館|産業体育館|市民体育館|布勢[^　\s]*|湖山池[^　\s]*|コカ・コーラウェスト[^　\s]*)')


def squash(s):
    return re.sub(r'[\s　]+', '', s or '')


def tidy(s):
    return re.sub(r'[\s　]+', ' ', (s or '')).strip(' ・、，')


def tidy_cat(s):
    """種目名を整える。写真の説明文が紛れ込むことがあるので、句点の後ろだけ残す。
    全角と半角が混ざっている（「1位」と「１位」など）ので、そこも揃える。"""
    s = unicodedata.normalize('NFKC', squash(s))
    if '。' in s:
        s = s.rsplit('。', 1)[1]
    s = CAT_TAIL.sub('', s)
    s = LEAD_JUNK.sub('', s)
    return tidy(s)[:24]


def clean(text):
    for m in NAV_MARKS:
        i = text.find(m)
        if i > 0:
            text = text[:i]
    # 先頭の決まり文句（協会名・「大会結果」「ギャラリー」）を落とす
    text = re.sub(r'^(?:鳥取市テニス協会)?\s*(?:大会結果|ギャラリー)?', '', text.strip())
    return text.strip()


def name_from(rest):
    """賞の直後から名前を取り出す。戻り値は (名前, 消費した長さ)。"""
    # 名前が終わりうる位置：次の賞、次の種目語、それと全体の終わり
    stops = [len(rest)]
    m = AWARD.search(rest)
    if m:
        stops.append(m.start())
    m = CAT.search(rest, 1)
    if m:
        stops.append(m.start())
    limit = min(stops)
    seg = rest[:limit]

    # 個人戦は「選手」「ペア」などで切れる。ただし先頭に来ることはない
    m = NAME_END.search(seg, 1)
    if m:
        end = m.end()
        p = PAREN.match(seg[end:].lstrip())
        if p:
            end += len(seg[end:]) - len(seg[end:].lstrip()) + p.end()
        return seg[:end], end
    return seg, len(seg)


def parse(text):
    """(種目ごとの順位, 前置き) を返す。"""
    text = clean(text)
    marks = list(AWARD.finditer(text))
    if not marks:
        return [], text[:120]

    lead = text[:marks[0].start()]
    # 前置きの末尾が最初の種目になっていることが多い（「…選手権結果男子Ａ級シングルス」）
    first_cat = ''
    cm = None
    for cm in CAT.finditer(lead):
        pass
    if cm:
        first_cat = lead[cm.start():]
        lead = lead[:cm.start()]

    rows = []
    pos = marks[0].start()
    for m in marks:
        if m.start() < pos:
            continue
        cat = text[pos:m.start()] if pos < m.start() else ''
        name, used = name_from(text[m.end():])
        pos = m.end() + used
        rows.append({
            'cat': tidy_cat(cat),
            'award': squash(m.group(0)),
            'name': tidy(LEAD_JUNK.sub('', PAREN.sub('', name).strip())),
            'note': ''.join(PAREN.findall(name)),
        })
    if rows and not rows[0]['cat']:
        rows[0]['cat'] = tidy_cat(first_cat)

    # 種目が空の行は直前の種目が続いているとみなす
    last = ''
    for r in rows:
        if r['cat']:
            last = r['cat']
        else:
            r['cat'] = last

    groups, order = {}, []
    for r in rows:
        c = r['cat']
        if c not in groups:
            groups[c] = []
            order.append(c)
        groups[c].append({k: r[k] for k in ('award', 'name', 'note') if r[k]})
    return [{'category': c, 'places': groups[c]} for c in order], tidy(lead)


def main():
    out = []
    stat = {'大会': 0, '結果あり': 0, '順位行': 0, '名前空': 0, '種目空': 0}
    for f in sorted(glob.glob(os.path.join(SRC, '*.json'))):
        d = json.load(open(f))
        year = {'nendo': d['nendo'], 'label': d['label'], 'tournaments': []}
        for t in d['tournaments']:
            stat['大会'] += 1
            txt = (t.get('results_text') or [''])[0]
            cats, lead = parse(txt)
            stat['順位行'] += sum(len(c['places']) for c in cats)
            stat['名前空'] += sum(1 for c in cats for p in c['places'] if not p.get('name'))
            stat['種目空'] += sum(1 for c in cats if not c['category'])
            if cats:
                stat['結果あり'] += 1
            body = clean(txt)
            dm = DATE.search(body[:240])
            vm = VENUE.search(body[:240])
            year['tournaments'].append({
                'id': t['id'],
                'title': t['title'],
                'lead': lead[:120],
                'date_text': squash(dm.group(0)) if dm else None,
                'venue': vm.group(1) if vm else None,
                'categories': cats,
                'images': [os.path.relpath(i['local_path'],
                                           '/Users/kazuya/Desktop/鳥取市テニス協会WEB/scrape_output/images')
                           for i in t.get('images', []) if i.get('saved')],
                'pdfs': [os.path.basename(p.get('local_path', '')) for p in t.get('pdfs', [])],
                'page_type': t.get('page_type'),
                'source_url': t.get('original_url'),
            })
        out.append(year)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(stat)


if __name__ == '__main__':
    main()
