// テニス祭り（テニスの日 鳥取イベント）の開催記録。イベント情報のページ（tennis-day.html）の
// 「過去の開催記録」に、新しい年から順に並ぶ。
//
// 1件の形：
//   year    … 開催年（並び順と見出しに使う）
//   title   … 大会名（「2026テニス祭り鳥取イベント」など）
//   date    … 開催日の表示（「2026年10月12日（月・祝）」）
//   venue   … 会場
//   summary … 1〜2文の内容（任意）
//   items   … 見られる資料。{ label, href, kind }。
//             kind は 'page'（サイト内のページ・節へのリンク）／'pdf'／'image'／'external'（別タブで開く）／
//             'gallery'（その年の写真・動画を全画面のパネルで開く。href の代わりに gallery: '<年>' を書き、
//             ページ側で src/data/tennisday-<年>.json を読み込んで TennisDayGallery に渡す）
//
// 過去の資料（要項・写真・結果など）は public/assets/{pdf,img}/tennis-day/<年>/ に置き、ここに1件ずつ足す。
// 2025年の写真・動画は旧サイト（www.tottori-tenis.net の「2025テニス祭り鳥取イベント」）から取り込んだ。
export const TENNISDAY_ARCHIVE = [
  {
    year: 2026,
    title: '2026テニス祭り鳥取イベント',
    date: '2026年10月12日（月・祝）',
    venue: '鳥取県立鳥取産業体育館 メインアリーナ',
    summary: '元プロ 加藤季温コーチのキッズテニス・テニスクリニック、ピックルボール体験会、タイブレークマッチを開催。',
    items: [
      { label: '当日の写真・動画（このページ）', href: '#gallery', kind: 'page' },
      { label: '募集要項・申込用紙（PDF／783KB）', href: 'assets/pdf/tennis-day/2026-tennis-matsuri-youkou.pdf', kind: 'pdf' },
    ],
  },
  {
    year: 2025,
    title: '2025テニス祭り鳥取イベント',
    date: '2025年9月15日（月・祝）',
    venue: '鳥取市民体育館 エネトピアアリーナ',
    summary: '元プロ 加藤季温コーチと小山慶大コーチによるキッズテニス・テニスクリニック、ピックルボール体験会、じゃんけん大会、タイブレークマッチ（最後に加藤プロと安田彰汰選手のシングルス対決）を開催。',
    items: [
      { label: '当日の写真・動画（写真124枚・動画2本）', gallery: '2025', kind: 'gallery' },
    ],
  },
];
