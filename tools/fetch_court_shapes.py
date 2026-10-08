"""コート案内の地図に塗るテニスコートの輪郭を OpenStreetMap から取り込む。

地図（Leaflet）はタイルをグレーに落としているので、どれがテニスコートか分かるよう
コートの面だけを赤く塗る。その輪郭を OSM の地図データ API
（https://api.openstreetmap.org/api/0.6/map）から取って
src/data/court-shapes.json に書く。ふだんの更新では使わない。

    python3 tools/fetch_court_shapes.py

VENUES の id は src/data/courts.js の id と同じ。各施設について
  courts … sport=tennis の面（コート1面ずつ）
  area   … 施設全体の面（name にテニスが入る leisure=pitch/stadium）。無ければ空
  center … コート面の重心（ピンの位置）
  bounds … コート面すべてが入る範囲（「全体表示」に使う）
を書き出す。
"""
import json
import os
import subprocess
import xml.etree.ElementTree as ET

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src/data/court-shapes.json')

# id → (中心の緯度, 経度, 取りに行く範囲（度）, 取り込むコートの範囲（度）)
# 井原公園は 400m 北に別のテニスコートがあるので、取り込む範囲を狭くして外している。
# 若葉台テニス場は OSM では「津ノ井ニュータウンテニス場」の名前で入っている。
# 郡家ふれあいドームと八東総合運動公園（屋根付多目的広場）は OSM にコートの面が無いので、
# 指定した中心にピンだけ立つ（面が描かれたら流し直せば拾える）。
VENUES = {
    'yamata': (35.4983, 134.1772, 0.006, 0.004),
    'chiyo': (35.5015, 134.2129, 0.004, 0.003),
    'ihara': (35.4856, 134.2327, 0.004, 0.0015),
    'wakabadai': (35.445, 134.257, 0.003, 0.0015),
    'kanazawa': (35.49887, 134.1335, 0.003, 0.0015),
    'kooge': (35.4190418, 134.2544146, 0.003, 0.001),
    'hatto': (35.36677, 134.34070, 0.003, 0.0015),
}


def fetch(lat, lon, d):
    url = f'https://api.openstreetmap.org/api/0.6/map?bbox={lon - d},{lat - d},{lon + d},{lat + d}'
    return subprocess.run(['curl', '-s', '-A', 'tcta-site/1.0', url], capture_output=True, check=True).stdout


def main():
    out = {}
    for key, (lat, lon, d, keep) in VENUES.items():
        root = ET.fromstring(fetch(lat, lon, d))
        nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.findall('node')}
        courts, area = [], None
        for w in root.findall('way'):
            tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
            pts = [nodes[nd.get('ref')] for nd in w.findall('nd') if nd.get('ref') in nodes]
            if not pts:
                continue
            c = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
            if abs(c[0] - lat) > keep or abs(c[1] - lon) > keep:
                continue
            ring = [[round(p[0], 6), round(p[1], 6)] for p in pts]
            if tags.get('sport') == 'tennis':
                courts.append(ring)
            elif 'テニス' in tags.get('name', '') and tags.get('leisure') in ('pitch', 'stadium', 'sports_centre'):
                area = ring
        allpts = [p for ring in courts for p in ring]
        if allpts:
            center = [round(sum(p[0] for p in allpts) / len(allpts), 6), round(sum(p[1] for p in allpts) / len(allpts), 6)]
            bounds = [[min(p[0] for p in allpts), min(p[1] for p in allpts)], [max(p[0] for p in allpts), max(p[1] for p in allpts)]]
        else:
            # コートの面が無い施設は、指定した中心にピンだけ。全体表示は中心のまわり 120m ほど
            center = [lat, lon]
            bounds = [[lat - 0.0011, lon - 0.0014], [lat + 0.0011, lon + 0.0014]]
        out[key] = {'center': center, 'bounds': bounds, 'courts': courts, 'area': area}
        print(f'{key:8s} コート{len(courts)}面  敷地{"あり" if area else "なし"}  中心 {center}')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('→', os.path.relpath(OUT))


if __name__ == '__main__':
    main()
