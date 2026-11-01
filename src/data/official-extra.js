// 公式サイト（https://www.tottori-tenis.net/）に先に載った内容を、管理画面（EmDash）に入るまでのあいだ補うもの。
// 管理画面に同じ素材・状態・お知らせが入ったら、ここから消すこと（素材は二重に並ぶため）。
//
//   EXTRA_MATERIALS … 大会ごとに足す素材（種類 → { images, pdfs }）。移行前の素材のあと、管理画面の素材の前に並ぶ（events.js）
//   STATE_OVERRIDE  … 管理画面の受付状態がまだ「まもなく受付／未受付」のときだけ、こちらの状態にする（schedule.js）
//   EXTRA_CARDS     … 管理画面で「トップページの大会カードに出す」にチェックが無くても、トップの大会カードに出す大会（tournaments.js）
//   EXTRA_TOURNAMENTS … 管理画面にまだ無い大会の行（管理画面の「大会」と同じ項目。cms.js が読み込んだ行に足す。同じ slug が管理画面にあればそちらを使う）
//   EXTRA_NEWS      … お知らせに足す行（news.js。同じ日付・同じ題名の行が管理画面にあれば足さない）

const img = (slug, file, label) => ({ src: `assets/img/events/${slug}/${file}`, label, w: 1241, h: 1754 });

export const EXTRA_MATERIALS = {
  // 第22回京丹後市オープンミックスダブルステニス大会：要項（京丹後市テニス協会から届いた Word を PDF にしたもの。2026.11.2）
  'r8-kyotango-mixed': {
    outline: {
      images: [img('r8-kyotango-mixed', 'outline-01.webp', '要項')],
      pdfs: [{ src: 'assets/pdf/events/r8-kyotango-mixed/第22回京丹後市オープンミックスダブルス大会_要項.pdf', label: '要項', kb: 59 }],
    },
  },
  // 鳥大オープンテニス大会（12月・シングルス）：要項と申込用紙（1枚の紙に両方。2026.11.2 の訂正版：種目をダブルス→シングルスに訂正）
  'r8-tottori-univ-winter': {
    outline: { images: [img('r8-tottori-univ-winter', 'outline-01.webp', '要項・申込用紙')], pdfs: [] },
    entry: { images: [], pdfs: [{ src: 'assets/pdf/events/r8-tottori-univ-winter/R8鳥大オープンテニス大会_要項.pdf', label: '要項・申込用紙', kb: 222 }] },
  },
  // 鳥取県テニス選手権 シングルス：ドロー（2026.10.30。選手の所属を訂正した版）
  'r8-kensen-singles': {
    draw: {
      images: [
        img('r8-kensen-singles', 'draw-01.webp', 'プログラム'),
        img('r8-kensen-singles', 'draw-02.webp', '一般男子シングルス'),
        img('r8-kensen-singles', 'draw-03.webp', '男子45歳以上・65歳以上／一般女子・女子45歳以上シングルス（訂正）'),
      ],
      pdfs: [],
    },
  },
  // 鳥取県テニス選手権 ダブルス：要項と申込用紙（2026.10.26。11/13 締切）
  'r8-no18': {
    outline: { images: [img('r8-no18', 'outline-01.webp', '要綱')], pdfs: [] },
    entry: { images: [], pdfs: [{ src: 'assets/pdf/events/r8-no18/令和8年県選ダブルス申込用紙.pdf', label: '申込用紙', kb: 104 }] },
  },
};

export const EXTRA_TOURNAMENTS = [
  // 第22回京丹後市オープンミックスダブルステニス大会（12/6。京丹後市テニス協会の主催。申込は同協会のエントリーフォーム）
  {
    slug: 'r8-kyotango-mixed',
    name: '第22回京丹後市オープンミックスダブルステニス大会', nendo: '2026', no: '', kind: '預かり',
    event: 'ミックスダブルス（一般クラス／100歳クラス）', date: '2026-12-06', label: '12月6日（日）',
    place: '峰山総合公園テニスコート（京都府京丹後市）',
    spare_date: '', spare_venue: '', spare_note: '予備日なし',
    due: '11/27（金）20:00', state: '受付中', reg: '登録不要',
    host: '京丹後市テニス協会',
    note: '京丹後市テニス協会が主催するオープン大会です（ミックスダブルス。一般クラスと、ペアの年齢の合計が100歳以上の100歳クラス。各クラス4組以上で成立）。参加料は1ペア3,300円（保険料込み・当日会場で支払い。高校生以下は半額）。申込は京丹後市テニス協会のホームページにあるエントリーフォームから行ってください（100歳クラスは生年月日を必ず記入。本人以外の申込はできません）。ドローも同ホームページに掲載されます。',
    link_label: '京丹後市テニス協会のホームページで申し込む', link_url: 'https://kyotangotennis.sakura.ne.jp/',
    card: true, materials: [], winners: [], legacy_materials: {},
  },
  // 鳥大オープンテニス大会（12月・シングルス）。要項・申込用紙は 2026.11.2 の訂正版（申込期限 11/27）
  {
    slug: 'r8-tottori-univ-winter',
    name: '鳥大オープンテニス大会', nendo: '2026', no: '', kind: '預かり',
    event: '男女シングルス', date: '2026-12-06', label: '12月6日（日）',
    place: '鳥取大学テニスコート',
    spare_date: '', spare_venue: '', spare_note: '',
    due: '11/27', state: '受付中', reg: '登録不要',
    host: '鳥取大学硬式庭球部',
    note: '鳥取大学硬式庭球部が主催する大会です（男子シングルス・女子シングルス。1セットマッチ・セルフジャッジ、決勝のみ8ゲームズプロセット）。参加費は1人1,500円で、当日の受付で集めます。申込用紙は鳥取大学硬式庭球部の部室か、テニスショップ フラシーノへ届けてください（11/27 まで）。雨で中止のときは30分前までに連絡があります。協会は要項・ドロー・結果の掲載に協力しています。',
    link_label: '', link_url: '',
    card: true, materials: [], winners: [], legacy_materials: {},
  },
];

export const STATE_OVERRIDE = {
  'r8-no18': '受付中',
};

export const EXTRA_CARDS = [
  'r8-no18', // 鳥取県テニス選手権 ダブルス（受付中。11/13 締切）
  'r8-tottori-univ-winter', // 鳥大オープンテニス大会（12/6。受付中。11/27 締切）
  'r8-kyotango-mixed', // 京丹後市オープンミックスダブルス（12/6。受付中。11/27 締切）
];

export const EXTRA_NEWS = [
  { slug: 'official-20261102-kyotango-mixed-outline', date: '2026-11-02', category: '大会', title: '京丹後市オープンミックスダブルス大会（12/6）の要項を掲載しました（11/27締切）', href: 'outline-r8-kyotango-mixed.html' },
  { slug: 'official-20261102-tottori-univ-outline-fix', date: '2026-11-02', category: '大会', title: '鳥大オープンテニス大会（12/6）の要項を訂正しました（種目はダブルスではなくシングルスです）', href: 'outline-r8-tottori-univ-winter.html' },
  { slug: 'official-20261101-tottori-univ-outline', date: '2026-11-01', category: '大会', title: '鳥大オープンテニス大会（12/6）の要項・申込用紙を掲載しました（11/27締切）', href: 'outline-r8-tottori-univ-winter.html' },
  { slug: 'official-20261030-kensen-s-draw', date: '2026-10-30', category: '大会', title: '鳥取県テニス選手権シングルスのドローを掲載しました（選手の所属を訂正）', href: 'draw-r8-kensen-singles.html' },
  { slug: 'official-20261026-kensen-d-outline', date: '2026-10-26', category: '大会', title: '鳥取県テニス選手権ダブルスの要項・申込用紙を掲載しました（11/13締切）', href: 'outline-r8-no18.html' },
];
