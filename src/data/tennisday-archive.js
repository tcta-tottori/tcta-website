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
//             kind は 'page'（サイト内のページ・節へのリンク）／'pdf'／'image'／'external'（別タブで開く）
//
// 2025年以前の資料（要項・写真・結果など）は、旧サイトの「過去のイベント」から取り込んで
// public/assets/{pdf,img}/tennis-day/<年>/ に置き、ここに1件ずつ足す。
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
];
