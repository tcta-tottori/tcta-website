// ナビゲーションの定義。ヘッダー・モバイルナビの唯一の正。
// 各ページは `navActive` / `mobileNavActive` に下記の key を渡して現在地を示す。

export const NAV = [
  { key: 'home', label: 'HOME', href: 'index.html', en: true },
  { key: 'tournaments', label: '大会情報', href: 'tournaments.html' },
  { key: 'about', label: '協会について', href: 'about.html' },
  { key: 'membership', label: '入会案内', href: 'membership.html' },
  { key: 'courts', label: 'コート案内', href: 'index.html#courts' },
  { key: 'news', label: 'お知らせ', href: 'index.html#news' },
];

export const MOBILE_NAV = [
  { key: 'home', label: 'ホーム', href: 'index.html' },
  { key: 'tournaments', label: '大会情報', href: 'tournaments.html' },
  { key: 'results', label: '大会結果', href: 'results.html' },
  { key: 'club', label: 'クラブ対抗戦', href: 'club.html' },
  { key: 'lesson', label: '水曜テニス教室', href: 'lesson.html' },
  { key: 'tennis-day', label: 'テニスの日', href: 'tennis-day.html' },
  { key: 'about', label: '協会について', href: 'about.html' },
  { key: 'membership', label: '入会案内（協会登録）', href: 'membership.html' },
  { key: 'links', label: 'リンク集', href: 'links.html' },
];
