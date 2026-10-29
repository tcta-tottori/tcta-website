// コート案内（トップの一覧と地図、コート案内のページ courts.html）の唯一の正。
//
// ■ id / lat / lng
//   地図（Leaflet）はテニスコートの面を赤く塗り、その重心にピンを立てる。
//   コートの輪郭は court-shapes.json（tools/fetch_court_shapes.py が OpenStreetMap から
//   取り込む）にあり、id で結びつく。lat / lng はコート面の重心で、
//   court-shapes.json の center と同じ値。施設を足すときは fetch_court_shapes.py の
//   VENUES に足して流し、出てきた center をここに写す。
//   id はコート案内のページの節の id にもなる（courts.html#yamata）。
//
// ■ main
//   主会場（ヤマタスポーツパーク）に付ける。地図の「すべて」では、この施設のピンとラベルを
//   赤くして最前面に出す（他の施設のラベルに隠れないように）。
//
// ■ image
//   施設の写真（public/assets/img/courts/<id>.webp、16:9）。地図では選んだ施設の写真を左上に重ね、
//   一覧では行の右端に敷いて中央へ向けて薄くする。コート案内のページでは大きく出す。無い施設は写真なし。
//
// ■ surface / courts
//   サーフェスと面数。サーフェスは協会の確認ずみ（オムニ／クレー／ハード、屋根付きは「室内」を付ける）。
//   面数も協会の確認ずみ。空（''／0）のものは出ない。
//
// ■ note
//   トップの一覧の行に出す1行の補足（住所や申込先）。
//
// ■ コート案内のページ（courts.html）に出すもの
//   desc     … 施設の説明（1〜2文）
//   address  … 住所。分からないものは '' のまま（ページでは「確認中」と出る）
//   features … 設備の一覧（'夜間照明あり' など。時間は書かない。屋根付きは surface の「室内」で出るので書かない）
//   reserve  … 予約先 { label, url }。鳥取市の施設は鳥取市公共施設予約システム（CITY_RESERVE）。
//              そこで予約できない施設（八頭町の郡家ふれあいドーム・八東総合運動公園）は null にし、電話（contact）で申し込む
//   contact  … 電話の問い合わせ先 { label, tel }（施設や管理事務所）。無ければ null
//   link     … 公式ページ { label, url }
//
// ■ href
//   トップの一覧の行を押したときの遷移先。コート案内のページのその施設の節（courts.html#<id>）。
//
// ■ pageOnly
//   true の施設はコート案内のページにだけ出し、トップの地図には出さない（体育館など。COURTS_HOME から外れる）。
//
// ※ 住所が '' のものは、協会に確認して埋めること。

/** 鳥取市公共施設予約システム。鳥取市の施設（ヤマタ・千代・井原公園・東冨安公園・若葉台・金沢・用瀬）はここから */
export const CITY_RESERVE = { label: '鳥取市公共施設予約システム', url: 'https://p-kashikan.jp/tottori/' };

export const COURTS = [
  {
    id: 'yamata',
    name: 'ヤマタスポーツパーク',
    short: 'ヤマタ',
    note: '主会場・鳥取県立布勢総合運動公園 鳥取県鳥取市布勢146-1',
    lat: 35.498444, lng: 134.177261,
    image: 'assets/img/courts/yamata.webp',
    surface: 'オムニコート', courts: 16,
    desc: '鳥取県立布勢総合運動公園（ネーミングライツにより「ヤマタスポーツパーク」）のテニスコート。協会の主催大会の主会場です。',
    address: '鳥取県鳥取市布勢146-1',
    features: ['夜間照明あり'],
    reserve: CITY_RESERVE,
    contact: null,
    link: { label: 'ヤマタスポーツパーク 公式サイト', url: 'https://www.fuse-sportspark.com/' },
    href: 'courts.html#yamata',
    main: true,
  },
  {
    id: 'chiyo',
    name: '鳥取市千代テニス場',
    short: '千代',
    note: '予備会場（住所は公開前に確認）',
    lat: 35.501477, lng: 134.212893,
    image: 'assets/img/courts/chiyo.webp',
    surface: 'クレーコート', courts: 12,
    desc: '千代川沿いのクレーコート。主催大会の予備会場として使用します。',
    address: '',
    features: [],
    reserve: CITY_RESERVE,
    contact: null,
    link: null,
    href: 'courts.html#chiyo',
  },
  {
    id: 'ihara',
    name: '井原公園テニスコート',
    short: '井原公園',
    note: '鳥取県鳥取市興南町174（毎週水曜日のテニス教室会場）',
    lat: 35.485585, lng: 134.232691,
    image: 'assets/img/courts/ihara.webp',
    surface: 'ハードコート', courts: 4,
    desc: '毎週水曜日の夜に行う水曜テニス教室の会場です。4面を使用します。',
    address: '鳥取県鳥取市興南町174',
    features: ['夜間照明あり'],
    reserve: CITY_RESERVE,
    contact: null,
    link: { label: '水曜テニス教室のご案内', url: 'lesson.html', internal: true },
    href: 'courts.html#ihara',
  },
  {
    id: 'higashi-tomiyasu',
    name: '東冨安公園テニスコート',
    short: '東冨安公園',
    note: '2面・鳥取市交通公園に併設・鳥取県鳥取市南吉方1丁目31',
    lat: 35.488967, lng: 134.231325,
    image: 'assets/img/courts/higashi-tomiyasu.webp',
    surface: 'オムニコート', courts: 2,
    desc: '鳥取市交通公園に併設された2面のコート。市街地にあり、鳥取駅から歩いて行けます。夜間照明があります。',
    address: '鳥取県鳥取市南吉方1丁目31',
    features: ['夜間照明あり'],
    reserve: CITY_RESERVE,
    contact: null,
    link: null,
    href: 'courts.html#higashi-tomiyasu',
  },
  {
    id: 'wakabadai',
    name: '若葉台テニス場',
    short: '若葉台',
    note: '全天候型3面・鳥取市若葉台南1丁目（申込：美保球場管理事務所 0857-26-0888）',
    lat: 35.445006, lng: 134.257068,
    image: 'assets/img/courts/wakabadai.webp',
    surface: 'オムニコート', courts: 3,
    desc: '若葉台ニュータウンにある全天候型3面のコートです。',
    address: '鳥取県鳥取市若葉台南1丁目',
    features: [],
    reserve: CITY_RESERVE,
    contact: { label: '美保球場管理事務所', tel: '0857-26-0888' },
    link: { label: '鳥取市 若葉台テニス場', url: 'https://www.city.tottori.lg.jp/site/kasenkouen-kouenn/5792.html' },
    href: 'courts.html#wakabadai',
  },
  {
    id: 'kanazawa',
    name: '湖山池公園金沢テニス場',
    short: '金沢',
    note: '全天候型3面・夜間照明あり・鳥取市金沢（申込：鳥取グリーン 0857-28-5090）',
    lat: 35.49887, lng: 134.133547,
    image: 'assets/img/courts/kanazawa.webp',
    surface: 'オムニコート', courts: 3,
    desc: '湖山池のほとりにある全天候型3面のコート。夜間照明があります。',
    address: '鳥取県鳥取市金沢',
    features: ['夜間照明あり'],
    reserve: CITY_RESERVE,
    contact: { label: '鳥取グリーン', tel: '0857-28-5090' },
    link: { label: '鳥取市 湖山池公園金沢テニス場', url: 'https://www.city.tottori.lg.jp/site/kasenkouen-kouenn/5759.html' },
    href: 'courts.html#kanazawa',
  },
  {
    id: 'mochigase',
    name: '用瀬町運動公園テニスコート',
    short: '用瀬',
    note: '全天候型4面・夜間照明あり・鳥取市用瀬町古用瀬660-1（0858-87-3332）',
    lat: 35.33332, lng: 134.20208,
    image: 'assets/img/courts/mochigase.webp',
    surface: 'オムニコート', courts: 4,
    desc: '用瀬町運動公園の全天候型（砂入り人工芝）4面のコート。夜間照明があり、最大22時まで使えます。',
    address: '鳥取県鳥取市用瀬町古用瀬660-1',
    features: ['夜間照明あり'],
    reserve: CITY_RESERVE,
    contact: { label: '用瀬町運動公園', tel: '0858-87-3332' },
    link: { label: '用瀬町運動公園 施設案内', url: 'https://mochigase.net/dish.html' },
    href: 'courts.html#mochigase',
  },
  {
    id: 'kooge',
    name: '郡家ふれあいドーム',
    short: '郡家ドーム',
    note: '屋根付きコート・八頭郡八頭町下門尾180（予約：八頭町シルバー人材センター 0858-72-3351）',
    lat: 35.419104, lng: 134.254368,
    image: 'assets/img/courts/kooge.webp',
    surface: '室内オムニコート', courts: 1,
    desc: '屋根付きのコートで、雨の日でも使えます。',
    address: '鳥取県八頭郡八頭町下門尾180',
    features: [],
    reserve: null, // 鳥取市の予約システムでは予約できない。電話で申し込む
    contact: { label: '八頭町シルバー人材センター', tel: '0858-72-3351' },
    link: { label: '八頭町 郡家ふれあいドーム', url: 'https://www.town.yazu.tottori.jp/soshiki/14/1457.html' },
    href: 'courts.html#kooge',
  },
  {
    id: 'hatto',
    name: '八東総合運動公園',
    short: '八東',
    note: '屋根付多目的広場 テニス3面・八頭郡八頭町徳丸528（0858-84-2890）',
    lat: 35.367133, lng: 134.339588,
    image: 'assets/img/courts/hatto.webp',
    surface: '室内クレーコート', courts: 2,
    desc: '屋根付多目的広場の中にあるクレーコート。雨の日でも使えます。',
    address: '鳥取県八頭郡八頭町徳丸528',
    features: [],
    reserve: null, // 鳥取市の予約システムでは予約できない。電話で申し込む
    contact: { label: '八東総合運動公園', tel: '0858-84-2890' },
    link: { label: '八東総合運動公園（やず観光ナビ）', url: 'https://yazukanko.jp/seeing_play/onsen-park/hatto-sports-park/' },
    href: 'courts.html#hatto',
  },
  {
    id: 'shimin-gym',
    name: '鳥取市民体育館',
    short: '市民体育館',
    pageOnly: true, // コート案内のページだけ（トップの地図には出さない）
    note: '屋内・鳥取市吉成3-1-1（0857-24-5222）',
    lat: 35.48386, lng: 134.22128, // OpenStreetMap の施設の位置
    image: 'assets/img/courts/shimin-gym.webp',
    surface: '屋内（体育館）', courts: 0,
    desc: '屋内の体育館。尾坂杯鳥取室内テニス選手権の会場の一つです。',
    address: '鳥取県鳥取市吉成3-1-1',
    features: [],
    reserve: null, // 予約・利用は体育館へ電話で問い合わせる
    contact: { label: '鳥取市民体育館', tel: '0857-24-5222' },
    link: { label: '鳥取市民体育館（ミズノ 施設サイト）', url: 'https://shisetsu.mizuno.jp/m-7133' },
    href: 'courts.html#shimin-gym',
  },
  {
    id: 'sangyo-gym',
    name: '鳥取産業体育館',
    short: '産業体育館',
    pageOnly: true, // コート案内のページだけ（トップの地図には出さない）
    note: '屋内・鳥取市天神町50-2（0857-24-2815）',
    lat: 35.49177, lng: 134.22134, // OpenStreetMap の施設の位置
    image: null, // 写真が届いたら public/assets/img/courts/sangyo-gym.webp に置いてここに書く
    surface: '屋内（体育館）', courts: 0,
    desc: '県立の屋内体育館。尾坂杯鳥取室内テニス選手権の会場の一つです。',
    address: '鳥取県鳥取市天神町50-2',
    features: [],
    reserve: null, // 予約・利用は体育館へ電話で問い合わせる
    contact: { label: '鳥取産業体育館', tel: '0857-24-2815' },
    link: { label: '鳥取県立鳥取産業体育館', url: 'https://t-santai.tottori-sf.net/' },
    href: 'courts.html#sangyo-gym',
  },
];

/** トップの地図に出す施設（pageOnly の施設を除く） */
export const COURTS_HOME = COURTS.filter((c) => !c.pageOnly);

import SHAPES from './court-shapes.json';

/** 地図に渡す1施設ぶん（名前・ピンの位置・コートの輪郭・全体表示の範囲・写真・サーフェス・面数） */
/** サーフェスのバッジ画像（public/assets/img/badges/）。コート案内のページと地図の下のバッジで使う。
 *  「室内オムニコート」のように頭に「室内」が付くものは indoor に「屋内」のバッジ画像（INDOOR_BADGE）を入れて返す
 *  （サーフェスの画像の前に添える。屋根付きの設備バッジはこれと重なるので出さない）。
 *  対応する画像が無いサーフェスは null（文字のバッジで出す）。 */
export const INDOOR_BADGE = { img: 'assets/img/badges/indoor.webp', w: 600, h: 240, alt: '屋内' };
const SURFACE_BADGES = [
  { match: 'オムニコート', img: 'assets/img/badges/surface-omni.webp', w: 600, h: 134 },
  { match: 'クレーコート', img: 'assets/img/badges/surface-clay.webp', w: 600, h: 136 },
  { match: 'ハードコート', img: 'assets/img/badges/surface-hard.webp', w: 600, h: 134 },
];
export const surfaceBadge = (surface) => {
  const hit = SURFACE_BADGES.find((b) => String(surface ?? '').includes(b.match));
  return hit ? { ...hit, indoor: String(surface).startsWith('室内') ? INDOOR_BADGE : null } : null;
};
/** 夜間照明の項目か（濃い黄色のバッジにする） */
export const isLightFeature = (f) => String(f).startsWith('夜間照明');

export const mapData = (c) => ({
  id: c.id, name: c.name, short: c.short, lat: c.lat, lng: c.lng, main: !!c.main,
  image: c.image ?? null, surface: c.surface ?? '', faces: c.courts ?? 0,
  badge: surfaceBadge(c.surface), features: c.features ?? [],
  courts: SHAPES[c.id]?.courts ?? [],
  area: SHAPES[c.id]?.area ?? null,
  bounds: SHAPES[c.id]?.bounds ?? [[c.lat, c.lng], [c.lat, c.lng]],
});

/** 別タブで開くときのURL（その座標を Google マップで開く） */
export const mapLink = (c) =>
  `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;

/** 「オムニコート 16面」のように、サーフェスと面数を1つにした文言（無い方は省く） */
export const courtSpec = (c) => [c.surface, c.courts ? `${c.courts}面` : ''].filter(Boolean).join(' ');
