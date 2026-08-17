"""令和8年度の大会素材（要項・ドロー・結果・写真）を Web 用に取り込む。

素材は協会の作業フォルダ ``鳥取市テニス協会WEB/2026`` にある PDF と、その
ページを画像に書き出した JPG／PNG。これを

  public/assets/img/events/<slug>/<種別>-NN.webp   … 画面に並べる画像
  public/assets/pdf/events/<slug>/<名前>.pdf       … ダウンロードする原本
  src/data/events.json                             … ページを組む元データ

の3つに落とす。どのファイルをどの大会のどの節に置くかは下の MANIFEST が唯一の正。

■ 大会を1つ足すとき
  MANIFEST に1件足して ``python3 tools/build_events.py`` を実行する。
  変換ずみの画像はスキップされるので、何度流しても構わない。

■ 画像の作り方
  書類（要項・ドロー・結果）は文字が読めることが最優先なので長辺 1800px・
  品質 82。写真は 1400px・品質 74 まで落とす。どちらも WebP。

■ ファイル名から見出しを作る
  結果の画像は「男子1部リーグ結果_団体戦.jpg」のような名前が付いている。
  LABEL_STRIP の語を落として画像の見出しにしている。落としきれない大会は
  MANIFEST 側で labels を明示する。
"""
import json
import os
import re
import shutil
import sys

from PIL import Image

SRC_ROOT = '/Users/kazuya/Desktop/鳥取市テニス協会WEB/2026'
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_OUT = os.path.join(REPO, 'public/assets/img/events')
PDF_OUT = os.path.join(REPO, 'public/assets/pdf/events')
JSON_OUT = os.path.join(REPO, 'src/data/events.json')

DOC = {'max': 1800, 'q': 82}    # 要項・ドロー・結果（文字を読ませる）
PHOTO = {'max': 1400, 'q': 74}  # 当日の写真

# 見出しを作るときに落とす語（長いものから順に当てる）
LABEL_STRIP = [
    '令和８年度 鳥取市テニス協会クラブ対抗戦（後期・男子予選会）_',
    '令和８年度 鳥取市テニス協会クラブ対抗戦（後期・女子）_',
    '第11回気高カップ・サマーシングルス大会_',
    '2026 サマーミックステニス大会_',
    '_結果_団体戦', '_結果', 'リーグ結果_団体戦', '_団体戦',
]


def label_of(path):
    """ファイル名から画像の見出しを作る。作れないときは None。"""
    name = os.path.splitext(os.path.basename(path))[0]
    name = re.sub(r' \(\d+\)$', '', name)             # 「… (1)」の重複印
    page = re.search(r'_page-0*(\d+)$', name)
    if page:
        return f'{int(page.group(1))}ページ目'
    for s in LABEL_STRIP:
        name = name.replace(s, '')
    name = name.strip('_ 　')
    return name or None


# ─────────────────────────────────────────────────────────────
# どの大会に、どの素材を、どの節で見せるか
#
#   slug     … 出力される URL（event-<slug>.html）
#   no       … src/data/schedule.js の通し番号。協会主催19大会と結びつける
#   src      … 素材フォルダ（SRC_ROOT からの相対）
#   outline  … 要項    draw … ドロー・プログラム
#   result   … 結果    photo … 当日の写真    entry … 申込用紙・名簿
#
#   各節は {'img': [...], 'pdf': [...]}。img は並べる順に書く。
# ─────────────────────────────────────────────────────────────
MANIFEST = [
    {
        'slug': 'r8-tobu-singles', 'no': '01', 'src': '1　東部S',
        'outline': {
            'img': ['要綱/R8東部選手権要綱_page-0001.jpg', '要綱/R8東部選手権要綱_page-0002.jpg'],
            'pdf': ['要綱/R8東部選手権シングルス要項.pdf'],
        },
        'draw': {
            'img': ['ドロー/第56回東部地区選手権シングルスドロー_page-0001.jpg',
                    'ドロー/第56回東部地区選手権シングルスドロー_page-0002.jpg',
                    'ドロー/第56回東部地区選手権シングルスドロー_page-0003.jpg',
                    'ドロー/第56回東部地区選手権シングルスドロー_page-0004.jpg',
                    'ドロー/第56回東部地区選手権B級修正_page-0001.jpg'],
            'pdf': ['ドロー/第56回東部地区選手権シングルスドロー.pdf',
                    'ドロー/第56回東部地区選手権シングルスドロー(リドロー）.pdf',
                    'ドロー/第56回東部地区選手権B級修正.pdf'],
            'labels': ['ドロー 1ページ目', 'ドロー 2ページ目', 'ドロー 3ページ目',
                       'ドロー 4ページ目', 'B級 修正ドロー'],
        },
        # 結果はスコアボードの画面写真で、ファイル名が撮影時刻のため中身から並べ直した。
        # 同じ種目を2度撮ったもの（女子A級・男子C級）と、試合前の時間割だけの
        # 男子A級（16.44.34）は落としている。
        'result': {
            'img': [f'結果/スクリーンショット 2026-03-22 {t}.png' for t in
                    ['17.46.07', '17.19.53', '16.39.49', '15.49.38', '15.25.09',
                     '16.53.50', '16.27.39', '16.16.48', '14.45.26']],
            'labels': ['男子シングルスA級', '男子シングルスB級', '男子シングルスC級',
                       '男子45歳以上シングルス', '男子55歳以上シングルス', '男子65歳以上シングルス',
                       '女子シングルスA級', '女子シングルスB級', '女子45歳以上シングルス'],
        },
        'photo': {'glob': '入賞者写真/*.jpg', 'skip': ['IMG_20260322_135041.jpg']},
    },
    {
        'slug': 'r8-tobu-doubles', 'no': '02', 'src': '2　東部D',
        'outline': {
            'img': ['R8東部選手権要綱_page-0003.jpg', 'R8東部選手権要綱_page-0004.jpg'],
            'pdf': ['R8東部選手権要綱_page-0004.pdf'],
        },
        'draw': {
            'img': ['ドロー/第56回東部ダブルスドロー_page-0001.jpg',
                    'ドロー/第56回東部ダブルスドロー_page-0002.jpg',
                    'ドロー/第56回東部ダブルスドロー_page-0003.jpg'],
            'pdf': ['ドロー/第56回東部ダブルスドロー.pdf'],
        },
        # シングルスと同じく、撮影時刻のファイル名を中身から並べ直したもの。
        # 女子45歳以上は2度撮られているので後の1枚を落とした。
        'result': {
            'img': [f'結果/スクリーンショット 2026-03-29 {t}.png' for t in
                    ['15.33.15', '15.55.32', '14.20.51', '14.22.33', '14.25.31',
                     '15.43.56', '14.26.41']],
            'labels': ['男子ダブルスA級', '男子ダブルスB級', '男子ダブルスC級',
                       '男子45歳以上ダブルス', '男子55歳以上ダブルス', '男子65歳以上ダブルス',
                       '女子45歳以上ダブルス'],
        },
        'photo': {'glob': '入賞者/*.jpg'},
    },
    {
        'slug': 'r8-sasaki', 'no': '03', 'src': '3　佐々木',
        'outline': {
            'img': ['R8佐々木杯要項_page-0001.jpg', 'R8佐々木杯要項_page-0002.jpg',
                    'R8佐々木杯要項_page-0003.jpg'],
            'pdf': ['R8佐々木杯要項.pdf'],
        },
        'entry': {'pdf': ['R8佐々木杯申込用紙.pdf']},
        'draw': {
            'img': ['ドロー/R8佐々木杯ドロー_page-0001.jpg', 'ドロー/R8佐々木杯ドロー_page-0002.jpg',
                    'ドロー/R8佐々木杯ドロー_page-0003.jpg'],
            'pdf': ['ドロー/R8佐々木杯ドロー.pdf'],
        },
        'result': {
            'img': ['結果/1位トーナメント_結果.jpg', '結果/2位トーナメント_結果.jpg',
                    '結果/3位トーナメント_結果.jpg', '結果/4・5位トーナメント_結果.jpg'] +
                   [f'結果/{c}リーグ結果.jpg' for c in 'ABCDEFGHIJKLM'],
        },
        'photo': {'glob': '2026-4-5 佐々木杯/*.jpg'},
    },
    {
        'slug': 'r8-kaicho-spring', 'no': '04', 'src': '4　会長杯団体戦',
        'outline': {
            'img': ['令和8年度会長杯団体戦要項-1-2 (1)_page-0001.jpg'],
            'pdf': ['令和8年度会長杯団体戦要項-1-2 (1).pdf'],
        },
        'entry': {'pdf': ['令和8年度会長杯団体戦申込用紙.pdf']},
        'draw': {
            'img': [f'R８会長杯団体戦プログラム_page-000{n}.jpg' for n in range(1, 5)],
            'pdf': ['R８会長杯団体戦プログラム.pdf'],
        },
        'result': {
            'img': ['結果/1位トーナメント_結果_団体戦.jpg', '結果/2位トーナメント_結果_団体戦 (1).jpg',
                    '結果/3位トーナメント_結果_団体戦.jpg', '結果/3・4位トーナメント_結果_団体戦.jpg'] +
                   [f'結果/{c}リーグ結果_団体戦.jpg' for c in 'ABCDEFG'],
        },
        'photo': {'glob': '写真/*.jpg'},
    },
    {
        'slug': 'r8-kenko-spring', 'no': '05', 'src': '6　健康テニス',
        'outline': {
            'img': ['要綱 一般_page-0001.jpg', '要綱 ジュニア (変更)_page-0001.jpg'],
            'pdf': ['要綱 一般.pdf', '要綱 ジュニア (変更).pdf'],
            'labels': ['一般の部 要綱', 'ジュニアの部 要綱'],
        },
    },
    {
        'slug': 'r8-club-taiko-1', 'no': '06', 'src': '5　クラブ対抗前期',
        'outline': {
            'img': [f'要項/令和８年クラブ対抗要項_page-000{n}.jpg' for n in range(1, 10)] +
                   ['要項/クラブ対抗編成表変更のお知らせ_page-0001.jpg'],
            'pdf': ['要項/令和８年クラブ対抗要項全ファイル.pdf',
                    '要項/クラブ対抗編成表変更のお知らせ.pdf'],
            'labels': [f'{n}ページ目' for n in range(1, 10)] + ['編成表変更のお知らせ'],
        },
        'entry': {
            'pdf': ['要項/令和８年クラブ対抗申込用紙_前期日程（男子1〜8部）.pdf',
                    '要項/令和８年クラブ対抗_選手名簿（8名）.pdf',
                    '要項/令和８年クラブ対抗_選手名簿（12名）..pdf'],
        },
        'result': {
            'img': [f'2026-5-10 クラブ対抗/男子{n}部リーグ結果_団体戦.jpg' for n in range(1, 9)],
        },
        'photo': {'glob': '2026-5-10 クラブ対抗/DSC*.jpg'},
    },
    {
        'slug': 'r8-club-taiko-2', 'no': '08', 'src': '9　クラブ対抗戦後期',
        'outline': {
            'img': [f'要綱/R8クラブ対抗（女子）実施要項_page-000{n}.jpg' for n in range(1, 5)] +
                   [f'要綱/R8クラブ対抗(男子予選会)実施要項_page-000{n}.jpg' for n in range(1, 6)],
            'pdf': ['要綱/R8クラブ対抗（女子）実施要項.pdf',
                    '要綱/R8クラブ対抗(男子予選会)実施要項.pdf',
                    '要綱/R8(男子予選会)OP他.pdf'],
            'labels': [f'女子 {n}ページ目' for n in range(1, 5)] +
                      [f'男子予選会 {n}ページ目' for n in range(1, 6)],
        },
        # 「R8クラブ対抗女子メンバー表.pdf」は、ここには入れない。
        # 全クラブの選手名を実名で並べたうえ、運営委員の携帯番号が刷り込まれている。
        # 大会当日の運営用の紙で、そのまま公開する前提の資料ではない。
        # 載せるなら、協会で公開してよいか確かめ、連絡先を伏せてから足すこと。
        'result': {
            'img': [f'女子{n}部リーグ結果_団体戦.jpg' for n in range(1, 5)] +
                   ['令和８年度 鳥取市テニス協会クラブ対抗戦（後期・女子）_女子予選会Bリーグ結果_団体戦.jpg',
                    '令和８年度 鳥取市テニス協会クラブ対抗戦（後期・女子）_予選会 1位・2位決定戦_結果_団体戦.jpg',
                    '令和８年度 鳥取市テニス協会クラブ対抗戦（後期・女子）_予選会 3位・4位決定戦_結果_団体戦.jpg',
                    '令和８年度 鳥取市テニス協会クラブ対抗戦（後期・女子）_予選会 5位・6位決定戦_結果_団体戦.jpg',
                    '令和８年度 鳥取市テニス協会クラブ対抗戦（後期・男子予選会）_男子予選会リーグ結果_団体戦.jpg',
                    '令和８年度 鳥取市テニス協会クラブ対抗戦（後期・男子予選会）_男子予選会リーグ順位表.jpg',
                    '令和８年度 鳥取市テニス協会クラブ対抗戦（後期・男子予選会）_男子予選会順位表.jpg'],
            'labels': [f'女子{n}部リーグ' for n in range(1, 5)] +
                      ['女子予選会 Bリーグ', '女子予選会 1位・2位決定戦', '女子予選会 3位・4位決定戦',
                       '女子予選会 5位・6位決定戦', '男子予選会リーグ', '男子予選会リーグ順位表',
                       '男子予選会 順位表'],
        },
        'photo': {'glob': '入賞チーム/*.jpg'},
    },
    {
        'slug': 'r8-ketaka', 'no': '09', 'src': '8　気高カップ',
        'outline': {'img': ['R8気高カップ要項_page-0001.jpg'], 'pdf': ['R8気高カップ要項.pdf']},
        'draw': {
            'img': [f'R8気高カップドロー_page-000{n}.jpg' for n in range(1, 6)],
            'pdf': ['R8気高カップドロー.pdf'],
        },
        'result': {
            'img': ['結果/第11回気高カップ・サマーシングルス大会_' + c + '_結果.jpg' for c in
                    ['男子Ａ級シングルス', '男子Ｂ級シングルス', '男子Ｃ級シングルス',
                     '男子45歳以上シングルス', '男子65歳以上シングルス', '女子Ｂ級シングルス']],
        },
        'photo': {'glob': '2026-7 気高カップ入賞者/*.jpg'},
    },
    {
        'slug': 'r8-summer-mix', 'no': '10', 'src': '10　サマーミックス',
        'outline': {
            'img': ['R8サマーミックス要項_page-0001.jpg', 'R8サマーミックス要項_page-0002.jpg'],
            'pdf': ['R8サマーミックス要項.pdf'],
        },
        'draw': {
            'img': ['R8サマーミックスドロー_page-0001.jpg', 'R8サマーミックスドロー_page-0002.jpg'],
            'pdf': ['R8サマーミックスドロー.pdf'],
        },
        'result': {
            'img': ['結果/2026 サマーミックステニス大会_1位トーナメント_結果.jpg',
                    '結果/2026 サマーミックステニス大会_2位トーナメント_結果.jpg',
                    '結果/2026 サマーミックステニス大会_3位トーナメント_結果.jpg'] +
                   ['結果/Cリーグ結果 (1).jpg' if c == 'C' else f'結果/{c}リーグ結果.jpg'
                    for c in 'ABCDEFGHIJ'],
        },
        'photo': {'glob': '写真/*'},
    },
    {
        'slug': 'r8-dunlop', 'no': '11', 'src': '11　ダンロップ',
        'outline': {'img': ['2026ダンロップ要項_page-0001.jpg'], 'pdf': ['2026ダンロップ要項.pdf']},
        'entry': {'pdf': ['2026ダンロップ申込用紙.pdf']},
    },
    {
        # 協会主催19大会には入らないが、協会が結果を預かっている大会
        'slug': 'r8-tottori-univ-open', 'no': None, 'src': '7　鳥大オープンダブルス',
        'outline': {
            'img': ['R8鳥大オープンダブルス　要項_page-0001.jpg'],
            'pdf': ['R8鳥大オープンダブルス　要項.pdf'],
        },
        'draw': {
            'img': ['R8鳥大オープンダブルスドロー_page-0001.jpg'],
            'pdf': ['R8鳥大オープンダブルスドロー.pdf'],
        },
        'result': {
            'img': ['R8鳥大オープンダブルス　結果_page-0001.jpg'],
            'pdf': ['R8鳥大オープンダブルス　結果.pdf'],
            'labels': ['結果一覧'],
        },
        'photo': {'img': ['優勝ペアの写真.jpg', '準優勝ペアの写真.jpg']},
    },
]

# 大会日程そのもの（大会情報ページの「大会日程をダウンロード」に使う）
SCHEDULE_PDF = '大会日程/令和8年度鳥取市テニス協会大会日程.pdf'

KIND_PRESET = {'photo': PHOTO}  # 指定のない節は DOC 扱い


def convert(src, dst, preset):
    """1枚を WebP に変換して、出来上がりの大きさを返す。すでにあれば測るだけ。"""
    if os.path.exists(dst):
        return Image.open(dst).size
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im = Image.open(src).convert('RGB')
    w, h = im.size
    long_side = max(w, h)
    if long_side > preset['max']:
        r = preset['max'] / long_side
        im = im.resize((round(w * r), round(h * r)), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=preset['q'], method=5)
    return im.size


def collect(section, base):
    """節の設定から、実在する素材のフルパスを並び順どおりに返す。"""
    import glob as _glob
    files = []
    if 'img' in section:
        files = [os.path.join(base, f) for f in section['img']]
    elif 'glob' in section:
        files = sorted(_glob.glob(os.path.join(base, section['glob'])))
        files = [f for f in files
                 if os.path.splitext(f)[1].lower() in ('.jpg', '.jpeg', '.png')
                 and os.path.basename(f) not in section.get('skip', [])]
    missing = [f for f in files if not os.path.exists(f)]
    for f in missing:
        print('  素材なし:', os.path.relpath(f, SRC_ROOT), file=sys.stderr)
    return [f for f in files if os.path.exists(f)]


def build_section(ev, kind, section):
    base = os.path.join(SRC_ROOT, ev['src'])
    preset = KIND_PRESET.get(kind, DOC)
    images, pdfs = [], []

    srcs = collect(section, base)
    labels = section.get('labels')
    for i, src in enumerate(srcs, 1):
        rel = f'{ev["slug"]}/{kind}-{i:02d}.webp'
        w, h = convert(src, os.path.join(IMG_OUT, rel), preset)
        label = labels[i - 1] if labels and i <= len(labels) else label_of(src)
        images.append({'src': f'assets/img/events/{rel}', 'label': label, 'w': w, 'h': h})

    for p in section.get('pdf', []):
        src = os.path.join(base, p)
        if not os.path.exists(src):
            print('  素材なし:', p, file=sys.stderr)
            continue
        name = os.path.basename(p).replace(' ', '_').replace('　', '_')
        dst = os.path.join(PDF_OUT, ev['slug'], name)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
        pdfs.append({
            'src': f'assets/pdf/events/{ev["slug"]}/{name}',
            'label': label_of(p),
            'kb': round(os.path.getsize(src) / 1024),
        })
    return {'images': images, 'pdfs': pdfs}


def main():
    out = []
    for ev in MANIFEST:
        print(ev['slug'], flush=True)
        rec = {'slug': ev['slug'], 'no': ev['no'], 'sections': {}}
        for kind in ('outline', 'entry', 'draw', 'result', 'photo'):
            if kind in ev:
                rec['sections'][kind] = build_section(ev, kind, ev[kind])
        out.append(rec)

    # 年間日程の PDF も同じ置き場にそろえる
    src = os.path.join(SRC_ROOT, SCHEDULE_PDF)
    dst = os.path.join(PDF_OUT, 'r8-schedule.pdf')
    os.makedirs(PDF_OUT, exist_ok=True)
    shutil.copy2(src, dst)
    meta = {'src': 'assets/pdf/events/r8-schedule.pdf',
            'kb': round(os.path.getsize(src) / 1024)}

    with open(JSON_OUT, 'w', encoding='utf-8') as f:
        json.dump({'schedulePdf': meta, 'events': out}, f, ensure_ascii=False, separators=(',', ':'))

    n_img = sum(len(s['images']) for e in out for s in e['sections'].values())
    n_pdf = sum(len(s['pdfs']) for e in out for s in e['sections'].values())
    print(f'完了  大会{len(out)}件 / 画像{n_img}枚 / PDF{n_pdf}件')


if __name__ == '__main__':
    main()
