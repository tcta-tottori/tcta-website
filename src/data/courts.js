// コート案内（一覧と地図）の唯一の正。
//
// ■ query
//   地図に出すときの検索語。Googleマップに施設名で引いてもらうので、
//   緯度経度は持たない（施設名が正しければ地図側が正しい場所を出す）。
//   施設名を変えたら、地図の出方もここで変わる。
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
  {
    name: '鳥取産業体育館・鳥取市民体育館',
    short: '体育館',
    note: '冬季の室内大会・テニス祭りの会場（住所は公開前に確認）',
    query: '鳥取産業体育館',
    href: 'tennis-day.html',
  },
];

/** 埋め込み地図のURL（APIキー不要の検索埋め込み） */
export const mapEmbed = (query) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&hl=ja&output=embed`;

/** 別タブで開くときのURL */
export const mapLink = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
