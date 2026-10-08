// コート案内（一覧と地図）の唯一の正。
//
// ■ lat / lng
//   地図は緯度経度でピンを1本だけ出す。施設名で検索させると、ヤマタスポーツパークの
//   ように園内の施設（駐車場・陸上競技場・多目的広場…）が全部ピンになって、
//   どれがテニスコートか分からなくなるため。
//   座標は Google マップでその施設を開いたときの URL（@緯度,経度）から取った。
//   施設を足すときも同じやり方で lat / lng を入れる。
//
// ■ href
//   一覧の行を押したときの遷移先。サイト内に説明ページがあるものはそこへ。
//
// ※ 住所に【要確認】が残っているものは、協会に確認して確定すること。

export const COURTS = [
  {
    name: 'ヤマタスポーツパーク',
    short: 'ヤマタ',
    note: '主会場・鳥取県立布勢総合運動公園 鳥取県鳥取市布勢146-1',
    lat: 35.5000335, lng: 134.1804658,
    zoom: 16,
    href: '#courts',
  },
  {
    name: '鳥取市千代テニス場',
    short: '千代',
    note: '予備会場（住所は公開前に確認）',
    lat: 35.501401, lng: 134.2128641,
    zoom: 16,
    href: '#courts',
  },
  {
    name: '井原公園テニスコート',
    short: '井原公園',
    note: '鳥取県鳥取市興南町174（毎週水曜日のテニス教室会場）',
    lat: 35.48557, lng: 134.2326964,
    zoom: 16,
    href: 'lesson.html',
  },
];

/**
 * 埋め込み地図のURL（APIキー不要）。
 * q を「緯度,経度(施設名)」にすると、その場所にピンが1本だけ立ち、吹き出しに施設名が出る。
 */
export const mapEmbed = (c) =>
  `https://maps.google.com/maps?q=${c.lat},${c.lng}(${encodeURIComponent(c.name)})&z=${c.zoom ?? 16}&hl=ja&output=embed`;

/** 別タブで開くときのURL（その座標を Google マップで開く） */
export const mapLink = (c) =>
  `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
