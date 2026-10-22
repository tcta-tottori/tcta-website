// クラブ対抗戦の、EmDash に移ってからの年度（令和7年度〜）の優勝クラブ。
//
// 結果表と当日の写真は EmDash の「大会」（event-r8-club-taiko-1.html など）にある。
// 部ごとの優勝クラブは、公式サイト（tottori-tenis.net）の結果ページに書かれているものを写した。
// 管理画面の「成績」に行を入れれば、そちらが優先される（club.html を参照）。
//
// 並びは、前期日程（男子1部→8部）→ 後期日程（女子1部→4部 → 女子予選会 → 男子予選会）。
// 年度が終わったら、新しい年度を先頭に足す。

export const CLUB_SEASONS = [
  {
    nendo: '2026',
    label: '令和8年度',
    terms: [
      {
        slug: 'r8-club-taiko-1', label: '前期日程', event: '男子1部〜8部', date: '2026年5月10日（日）',
        divisions: [
          { div: '男子1部', club: 'オレンジ' },
          { div: '男子2部', club: 'doMe' },
          { div: '男子3部', club: 'ノーレット7' },
          { div: '男子4部', club: 'メテオスマッシュ' },
          { div: '男子5部', club: 'MID PLUS' },
          { div: '男子6部', club: 'あ〜るさん' },
          { div: '男子7部', club: 'Red Hot Chili Peppers' },
          { div: '男子8部', club: '因幡打輪ゲッツ' },
        ],
      },
      {
        slug: 'r8-club-taiko-2', label: '後期日程', event: '女子1部〜4部／男女予選会', date: '2026年7月12日（日）',
        divisions: [
          { div: '女子1部', club: 'ラフ' },
          { div: '女子2部', club: 'あみたま' },
          { div: '女子3部', club: 'ノーレット7' },
          { div: '女子4部', club: 'ShiningStar⭐︎' },
          { div: '女子予選会', club: 'プリーモ' },
          { div: '男子予選会', club: 'プラセール', award: '1位' },
          { div: '男子予選会', club: 'フラミンゴ', award: '2位' },
        ],
      },
    ],
  },
  {
    nendo: '2025',
    label: '令和7年度',
    terms: [
      {
        slug: 'r7-club-taiko-1', label: '前期日程', event: '男子1部〜8部', date: '2025年5月11日（日）',
        divisions: [
          { div: '男子1部', club: 'オレンジ' },
          { div: '男子2部', club: '湖山池TC' },
          { div: '男子3部', club: 'doMe' },
          { div: '男子4部', club: 'ノーレット7' },
          { div: '男子5部', club: 'フェアフェイ' },
          { div: '男子6部', club: 'MID PLUS' },
          { div: '男子7部', club: 'あ〜るさん' },
          { div: '男子8部', club: 'Red Hot Chili Peppers' },
        ],
      },
      {
        slug: 'r7-club-taiko-2', label: '後期日程', event: '女子1部〜4部／男女予選会', date: '2025年6月1日（日）',
        divisions: [
          { div: '女子1部', club: '田園' },
          { div: '女子2部', club: 'スマクロ' },
          { div: '女子3部', club: 'レイリー' },
          { div: '女子4部', club: '遊ポートTC' },
          { div: '女子予選会', club: 'カリーナ' },
          { div: '男子予選会 Aブロック', club: '鳥取大学A' },
          { div: '男子予選会 Bブロック', club: '鳥取大学B' },
        ],
      },
    ],
  },
];
