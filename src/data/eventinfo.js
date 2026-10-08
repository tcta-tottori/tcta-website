// トップページ「イベント情報」の唯一の正。
//
// 大会（tournaments.js）ではない催し——テニス祭り、テニス教室、講習会など——をここに書く。
// 上から順に出す。終わったものは消すか、次回の案内に書き換える。
//
//   date   … 開催日（ISO）。毎週あるものは null にして when に文言を書く
//   when   … 日時の文言（カードにそのまま出す）
//   image  … 縦長（3:4）のチラシやポスターがあるとよく映える。無ければ null
//   href   … 詳しいページ（サイト内）

export const EVENT_INFO = [
  {
    date: '2026-10-12',
    when: '2026年10月12日（月・祝）9:30〜16:30',
    title: 'テニス祭り 鳥取イベント',
    place: '鳥取県立鳥取産業体育館 メインアリーナ',
    lead: 'キッズテニス、元プロ 加藤季温コーチのテニスクリニック、ピックルボール体験会。協会登録は不要で、どなたでも参加できます。',
    image: 'assets/img/tennis-day/2026-youkou.webp',
    imageAlt: 'テニス祭り 鳥取イベント 募集要項',
    href: 'tennis-day.html',
    badge: '参加者募集中',
  },
  {
    date: null,
    when: '毎週水曜日 夜',
    title: '水曜テニス教室',
    place: '井原公園テニスコート',
    lead: 'レベル別に4つのコートに分かれ、専任コーチがつきます。ラケットの持ち方から教えるコートもあり、はじめての方も歓迎です。',
    image: null,
    imageAlt: '',
    href: 'lesson.html',
    badge: '通年',
  },
];

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** '2026-10-12' → { md: '10.12', dow: 'MON' }。date が無いものは null */
export function eventChip(e) {
  if (!e.date) return null;
  const [y, m, d] = e.date.split('-').map(Number);
  return { md: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`, dow: DOW[new Date(y, m - 1, d).getDay()] };
}
