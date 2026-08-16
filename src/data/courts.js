// コート案内（一覧と地図）の唯一の正。
//
// ■ query
//   地図に出すときの検索語。Googleマップに施設名で引いてもらうので、
//   緯度経度は持たない（施設名が正しければ地図側が正しい場所を出す）。
//   施設名を変えたら、地図の出方もここで変わる。
//
// ■ 3施設をまとめて1枚に出すことについて
//   「鳥取市 テニスコート」のような地域検索で1枚にまとめる作りにしていたが、
//   Googleの検索結果がそのままピンになるため、協会が使わないコート
//   （城北・金沢・B&G・津ノ井ニュータウン など）まで並んでしまい、
//   どれが協会の会場なのか分からなくなっていた。そのため取りやめ、
//   埋め込みは施設ごとの正確な1枚に統一している。
//   3施設だけをピンで1枚に出したい場合は、各施設の緯度経度をもらって
//   地図を自前で描く作りに差し替えること（COURTS に lat/lng を足す想定）。
//   それまでは、下の mapAllLink で別タブのGoogleマップに3施設をまとめて渡す。
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

/** 埋め込み地図のURL（APIキー不要の検索埋め込み） */
export const mapEmbed = (query, zoom = 15) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&hl=ja&output=embed`;

/** 別タブで開くときのURL（1施設） */
export const mapLink = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/**
 * 3施設をまとめてGoogleマップで開くURL。
 * 経路の形にすると、Google が3か所すべてを地図に収めて表示してくれる。
 */
export const mapAllLink = (courts = COURTS) => {
  const q = courts.map((c) => encodeURIComponent(c.query));
  return `https://www.google.com/maps/dir/?api=1&origin=${q[0]}` +
    `&destination=${q[q.length - 1]}` +
    (q.length > 2 ? `&waypoints=${q.slice(1, -1).join('|')}` : '');
};
