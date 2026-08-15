// コート案内（一覧と地図）の唯一の正。
//
// ■ query
//   地図に出すときの検索語。Googleマップに施設名で引いてもらうので、
//   緯度経度は持たない（施設名が正しければ地図側が正しい場所を出す）。
//   施設名を変えたら、地図の出方もここで変わる。
//
// ■ 「すべて」の地図（MAP_ALL）
//   1枚で全コートを見せるための、地域の絞り込み検索。Googleの検索結果が
//   そのままピンになるので、協会が使う3施設以外が混ざることがある。
//   3施設だけを正確に出したい場合は、各施設の緯度経度をもらって
//   ピンを打つ作りに差し替えること（下の COURTS に lat/lng を足す想定）。
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
    query: 'ヤマタスポーツパーク 鳥取県立布勢総合運動公園 テニスコート',
    href: '#courts',
  },
  {
    name: '鳥取市千代テニス場',
    short: '千代',
    note: '予備会場（住所は公開前に確認）',
    query: '鳥取市千代テニス場',
    href: '#courts',
  },
  {
    name: '井原公園テニスコート',
    short: '井原公園',
    note: '鳥取県鳥取市興南町174（毎週水曜日のテニス教室会場）',
    query: '井原公園テニスコート 鳥取市興南町174',
    href: 'lesson.html',
  },
];

/** 1枚で全コートを見せるときの検索語（地域の絞り込み） */
export const MAP_ALL = {
  name: '鳥取市周辺のテニスコート',
  short: 'すべて',
  query: '鳥取市 テニスコート',
  zoom: 12,
};

/** 埋め込み地図のURL（APIキー不要の検索埋め込み） */
export const mapEmbed = (query, zoom = 15) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&hl=ja&output=embed`;

/** 別タブで開くときのURL */
export const mapLink = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
