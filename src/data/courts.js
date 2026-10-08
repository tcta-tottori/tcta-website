// コート案内（一覧と地図）の唯一の正。
//
// ■ id / lat / lng
//   地図（Leaflet）はテニスコートの面を赤く塗り、その重心にピンを立てる。
//   コートの輪郭は court-shapes.json（tools/fetch_court_shapes.py が OpenStreetMap から
//   取り込む）にあり、id で結びつく。lat / lng はコート面の重心で、
//   court-shapes.json の center と同じ値。施設を足すときは fetch_court_shapes.py の
//   VENUES に足して流し、出てきた center をここに写す。
//
// ■ href
//   一覧の行を押したときの遷移先。サイト内に説明ページがあるものはそこへ。
//
// ※ 住所に【要確認】が残っているものは、協会に確認して確定すること。

export const COURTS = [
  {
    id: 'yamata',
    name: 'ヤマタスポーツパーク',
    short: 'ヤマタ',
    note: '主会場・鳥取県立布勢総合運動公園 鳥取県鳥取市布勢146-1',
    lat: 35.498444, lng: 134.177261,
    href: '#courts',
  },
  {
    id: 'chiyo',
    name: '鳥取市千代テニス場',
    short: '千代',
    note: '予備会場（住所は公開前に確認）',
    lat: 35.501477, lng: 134.212893,
    href: '#courts',
  },
  {
    id: 'ihara',
    name: '井原公園テニスコート',
    short: '井原公園',
    note: '鳥取県鳥取市興南町174（毎週水曜日のテニス教室会場）',
    lat: 35.485585, lng: 134.232691,
    href: 'lesson.html',
  },
];

import SHAPES from './court-shapes.json';

/** 地図に渡す1施設ぶん（名前・ピンの位置・コートの輪郭・全体表示の範囲） */
export const mapData = (c) => ({
  id: c.id, name: c.name, short: c.short, lat: c.lat, lng: c.lng,
  courts: SHAPES[c.id]?.courts ?? [],
  area: SHAPES[c.id]?.area ?? null,
  bounds: SHAPES[c.id]?.bounds ?? [[c.lat, c.lng], [c.lat, c.lng]],
});

/** 別タブで開くときのURL（その座標を Google マップで開く） */
export const mapLink = (c) =>
  `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
