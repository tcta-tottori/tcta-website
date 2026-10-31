// 公式サイト（https://www.tottori-tenis.net/）に先に載った内容を、管理画面（EmDash）に入るまでのあいだ補うもの。
// 管理画面に同じ素材・状態・お知らせが入ったら、ここから消すこと（素材は二重に並ぶため）。
//
//   EXTRA_MATERIALS … 大会ごとに足す素材（種類 → { images, pdfs }）。移行前の素材のあと、管理画面の素材の前に並ぶ（events.js）
//   STATE_OVERRIDE  … 管理画面の受付状態がまだ「まもなく受付／未受付」のときだけ、こちらの状態にする（schedule.js）
//   EXTRA_NEWS      … お知らせに足す行（news.js。同じ日付・同じ題名の行が管理画面にあれば足さない）

const img = (slug, file, label) => ({ src: `assets/img/events/${slug}/${file}`, label, w: 1241, h: 1754 });

export const EXTRA_MATERIALS = {
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

export const STATE_OVERRIDE = {
  'r8-no18': '受付中',
};

export const EXTRA_NEWS = [
  { slug: 'official-20261030-kensen-s-draw', date: '2026-10-30', category: '大会', title: '鳥取県テニス選手権シングルスのドローを掲載しました（選手の所属を訂正）', href: 'draw-r8-kensen-singles.html' },
  { slug: 'official-20261026-kensen-d-outline', date: '2026-10-26', category: '大会', title: '鳥取県テニス選手権ダブルスの要項・申込用紙を掲載しました（11/13締切）', href: 'outline-r8-no18.html' },
];
