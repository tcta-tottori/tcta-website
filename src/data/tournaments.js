// トップページ「大会情報」カルーセルの唯一の正。
//
// ■ 写真の差し込み方
//   1. 画像を public/assets/img/tournaments/ に置く（例：enetopia-2026.jpg）
//   2. 該当大会の image を 'assets/img/tournaments/enetopia-2026.jpg' に書き換える
//   3. imageAlt に写真の内容を日本語で書く（読み上げ・画像非表示時に使われる）
//
//   image を null のままにしておくと、写真が用意できるまで大会名だけの
//   プレースホルダーを表示する。仮画像（t1〜t4.png）は差し替え待ちの目印。
//
// ■ status
//   'past'   終了（モノクロ表示・TODAY より前に並ぶ）
//   'closed' 受付終了
//   'soon'   まもなく受付
//   'open'   受付中（赤バッジ）

// カルーセル中央の「TODAY」マーカー。終了した大会と今後の大会の境目に入る。
export const TODAY = '2026.08.13';

export const STATUS = {
  past: { label: '終了', badge: 'badge--muted' },
  closed: { label: '受付終了', badge: 'badge--muted' },
  soon: { label: 'まもなく受付', badge: 'badge--muted' },
  open: { label: '受付中', badge: 'badge--open' },
};

export const TOURNAMENTS = [
  {
    date: '2026.05.10',
    title: '令和8年度クラブ対抗戦 前期日程',
    event: '団体戦（男子1部〜8部）',
    venue: '鳥取市千代テニス場',
    status: 'past',
    href: 'results.html',
    image: 'assets/img/t4.png',
    imageAlt: 'コートに置かれたラケットとテニスボール',
  },
  {
    date: '2026.07.05',
    title: '鳥取市市民体育祭（BCグループ）',
    event: '校区別対抗戦',
    venue: '鳥取市千代テニス場',
    status: 'past',
    href: 'results.html',
    image: 'assets/img/t1.png',
    imageAlt: 'ネットの手前に置かれたテニスボール',
  },
  {
    date: '2026.07.12',
    title: '令和8年度クラブ対抗戦 後期日程',
    event: '女子1部〜4部／男女予選会',
    venue: '鳥取市千代テニス場',
    status: 'past',
    href: 'results.html',
    image: 'assets/img/t2.png',
    imageAlt: '青空へトスを上げてサーブする選手',
  },
  {
    date: '2026.08.02',
    title: '第11回気高カップシングルス大会',
    event: '男女シングルス',
    venue: '鳥取市千代テニス場',
    status: 'past',
    href: 'results.html',
    image: 'assets/img/t3.png',
    imageAlt: 'ネット際でボレーをする選手',
  },
  {
    date: '2026.08.16',
    title: 'サマーミックスダブルス',
    event: 'ミックスダブルス',
    venue: '鳥取市千代テニス場',
    status: 'closed',
    href: 'tournaments.html',
    image: 'assets/img/t3.png',
    imageAlt: 'ネット際でボレーをする選手',
  },
  {
    date: '2026.08.30',
    title: '第49回ダンロップテニストーナメント',
    event: '男女ダブルス',
    venue: '鳥取市千代テニス場',
    status: 'closed',
    href: 'tournaments.html',
    image: 'assets/img/t4.png',
    imageAlt: 'コートに置かれたラケットとテニスボール',
  },
  {
    date: '2026.10.12',
    title: '鳥取市テニス協会 テニス祭り',
    event: 'テニス教室ほか',
    venue: '鳥取産業体育館',
    status: 'soon',
    href: 'tennis-day.html',
    image: 'assets/img/t2.png',
    imageAlt: '青空へトスを上げてサーブする選手',
  },
  {
    date: '2026.10.18',
    title: '第30回エネトピア杯ミックスダブルス',
    event: 'ミックスダブルス',
    venue: '鳥取市千代テニス場',
    status: 'open',
    href: 'tournaments.html',
    image: 'assets/img/t3.png',
    imageAlt: 'ネット際でボレーをする選手',
  },
  {
    date: '2026.11.07',
    title: '第71回鳥取健康テニス（秋期）',
    event: '一般：男女ダブルス／ジュニア：男女シングルス',
    venue: '鳥取市千代テニス場',
    status: 'soon',
    href: 'tournaments.html',
    image: 'assets/img/t1.png',
    imageAlt: 'ネットの手前に置かれたテニスボール',
  },
  {
    date: '2026.11.08',
    title: '鳥取県テニス選手権 シングルス',
    event: '男女シングルス',
    venue: '鳥取市千代テニス場',
    status: 'soon',
    href: 'tournaments.html',
    image: 'assets/img/t4.png',
    imageAlt: 'コートに置かれたラケットとテニスボール',
  },
];
