// クラブ対抗戦の、EmDash に移ってからの年度（令和7年度〜）の優勝クラブ。
//
// 結果表と当日の写真は EmDash の「大会」（event-r8-club-taiko-1.html など）にある。
// 部ごとの優勝クラブは、公式サイト（tottori-tenis.net）の結果ページに書かれているものを写した。
// 管理画面の「成績」に行を入れれば、そちらが優先される（club.html を参照）。
//
// 並びは、前期日程（男子1部→8部）→ 後期日程（女子1部→4部 → 女子予選会 → 男子予選会）。
// 年度が終わったら、新しい年度を先頭に足す。
//
// photoMap … 大会ページで、どの部にどの写真（優勝クラブの写真）を付けるか（src/data/club-event.js が使う）。
//   部の名前 → 写真のファイル名（拡張子なし。管理画面の「当日の写真」の中のもの）。2枚以上なら順位の順（1位・2位）。
//   公式サイト（tottori-tenis.net）の結果ページで、リーグ表の下に置かれている写真と画像の照合で合わせた（2026-10）。
// extraPhotos … 管理画面に無い写真を public/assets/img/events/<slug>/ に置いたもの（名前 → 幅・高さ）。
//   令和7年度前期は移行時に2枚しか取り込まれていなかったので、公式サイトから6枚を足した。

export const CLUB_SEASONS = [
  {
    nendo: '2026',
    label: '令和8年度',
    terms: [
      {
        slug: 'r8-club-taiko-1', label: '前期日程', event: '男子1部〜8部', date: '2026年5月10日（日）',
        photoMap: { '男子1部': ['photo-07'], '男子2部': ['photo-08'], '男子3部': ['photo-02'], '男子4部': ['photo-06'],
                    '男子5部': ['photo-05'], '男子6部': ['photo-03'], '男子7部': ['photo-04'], '男子8部': ['photo-01'] },
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
        photoMap: { '女子1部': ['photo-05'], '女子2部': ['photo-04'], '女子3部': ['photo-06'], '女子4部': ['photo-07'],
                    '女子予選会': ['photo-03'], '男子予選会': ['photo-02', 'photo-01'] },
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
        photoMap: { '男子1部': ['photo-03'], '男子2部': ['photo-02'], '男子3部': ['photo-04'], '男子4部': ['photo-05'],
                    '男子5部': ['photo-06'], '男子6部': ['photo-07'], '男子7部': ['photo-08'], '男子8部': ['photo-01'] },
        extraPhotos: { 'photo-03': [808, 540], 'photo-04': [796, 532], 'photo-05': [756, 505], 'photo-06': [761, 509], 'photo-07': [754, 504], 'photo-08': [796, 532] },
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
        photoMap: { '女子1部': ['photo-05'], '女子2部': ['photo-06'], '女子3部': ['photo-04'], '女子4部': ['photo-03'],
                    '女子予選会': ['photo-07'], '男子予選会': ['photo-01', 'photo-02'] },
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
