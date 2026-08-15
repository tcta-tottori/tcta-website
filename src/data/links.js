// リンク集（トップページのマーキーと links ページ）の唯一の正。
//
// ■ バナーの差し替え方
//   1. 画像を public/assets/img/banners/ に置く
//      （元データは Desktop/site/バナー/ にある。ファイル名は英数字に直して置く）
//   2. 該当リンクの banner を 'assets/img/banners/○○.png' に書き換える
//   3. 横長のバナー（1018×168 前後、およそ 6:1）を想定している。
//      比率が違う画像でもカード幅に合わせて切り抜いて表示する。
//
//   banner を null にすると、バナーの代わりに団体名だけのプレースホルダーが出る。
//
// ■ url
//   すべて外部サイト。別タブで開き、rel="noopener noreferrer" を付けている。
//   リンク切れ防止のため、年1回の定期確認を運用手順に含めること。
//
// ■ group
//   links ページの見出し分け。GROUPS の並び順がそのままページの並び順になる。
//
// ■ row
//   トップページのマーキーは2段組み。'assoc'（テニス協会・連盟のHP）が上段、
//   'other'（施設・予約・クラブ・協賛など）が下段に並ぶ。上段は右から左へ、
//   下段は左から右へ流れる。段を移したいときはこの値だけ書き換えればよい。

export const GROUPS = [
  { id: 'official', title: '協会の公式アカウント' },
  { id: 'org', title: '関係団体' },
  { id: 'facility', title: '施設の予約・会場' },
  { id: 'nearby', title: '近隣のテニス協会・加盟クラブ' },
  { id: 'sponsor', title: '協賛・関連' },
];

export const LINKS = [
  {
    group: 'official',
    name: '鳥取市テニス協会 LINE公式アカウント',
    row: 'other',
    desc: '大会・教室のお知らせを配信中',
    url: 'https://lin.ee/sius2Li',
    banner: 'assets/img/banners/line-official.png',
  },
  {
    group: 'org',
    name: '鳥取県テニス協会',
    row: 'assoc',
    desc: '県登録・県大会に関する情報はこちら',
    url: 'https://tottoritennis.sakura.ne.jp/wp/',
    banner: 'assets/img/banners/tottori-ken-tennis.png',
  },
  {
    group: 'org',
    name: 'JLTF鳥取県支部',
    row: 'assoc',
    desc: '日本レディーステニス連盟の県支部',
    url: 'https://jltftottori.fc2.page/',
    banner: 'assets/img/banners/jltf-tottori.png',
  },
  {
    group: 'facility',
    name: 'とっとり施設予約サービス',
    row: 'other',
    desc: '市内のテニスコートの予約はこちらから',
    url: 'https://p-kashikan.jp/tottori/',
    banner: 'assets/img/banners/tottori-yoyaku.jpg',
  },
  {
    group: 'facility',
    name: 'ヤマタスポーツパーク',
    row: 'other',
    desc: '鳥取県立布勢総合運動公園（大会会場）',
    url: 'https://www.fuse-sportspark.com/',
    banner: 'assets/img/banners/yamata-sportspark.png',
  },
  {
    group: 'nearby',
    name: '米子市テニス協会',
    row: 'assoc',
    desc: '鳥取県西部の大会情報',
    url: 'https://yonago-tta.sfnc.jp/index.html',
    banner: 'assets/img/banners/yonago-tennis.png',
  },
  {
    group: 'nearby',
    name: '京丹後市テニス協会',
    row: 'assoc',
    desc: '京都府北部の大会情報',
    url: 'https://kyotangotennis.sakura.ne.jp/',
    banner: 'assets/img/banners/kyotango-tennis.png',
  },
  {
    group: 'nearby',
    name: '琴浦テニスクラブ',
    row: 'other',
    desc: '東伯郡琴浦町のテニスクラブ',
    url: 'https://kotouratennisclub.1web.jp/',
    banner: 'assets/img/banners/kotoura-tc.png',
  },
  {
    group: 'sponsor',
    name: 'テニスショップ フラシーノ',
    row: 'other',
    desc: '鳥取市南吉方のテニス専門店',
    url: 'https://frassino.jp/',
    banner: 'assets/img/banners/frassino.png',
  },
  {
    group: 'sponsor',
    name: '上海茶楼',
    row: 'other',
    desc: '鳥取市の中国上海料理店',
    url: 'https://www.shanghai-charo.com/',
    banner: 'assets/img/banners/shanghai-charo.png',
  },
];

/** トップページのマーキー上段（テニス協会・連盟のHP） */
export const LINKS_ASSOC = LINKS.filter((l) => l.row === 'assoc');
/** トップページのマーキー下段（施設・クラブ・協賛など） */
export const LINKS_OTHER = LINKS.filter((l) => l.row !== 'assoc');

// group ごとにまとめ直したもの（links ページで使う）。
// 中身が空のグループは落とすので、LINKS を減らしても見出しだけ残らない。
export const LINK_GROUPS = GROUPS
  .map((g) => ({ ...g, items: LINKS.filter((l) => l.group === g.id) }))
  .filter((g) => g.items.length > 0);
