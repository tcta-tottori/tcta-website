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
//   'live'   開催当日
//   'closed' 受付終了
//   'soon'   まもなく受付
//   'open'   受付中（赤バッジ）
//
// ■ リンク先（カードをタップしたときの遷移先）
//   大会の進み具合に応じて、カード下部のボタンの文言と遷移先が切り替わる。
//   下ほど優先度が高く、URL が入っているものが採用される。
//
//     outlineUrl … 要項。募集中〜開催前はこれ（「要項を見る」）
//     drawUrl    … ドロー（組み合わせ）。決まったら入れる（「ドローを見る」）
//     liveUrl    … 大会運用システム。status:'live' の当日だけ使う（「速報・ドローを見る」）
//     resultUrl  … 結果。status:'past' はこれ（「結果を見る」）
//
//   URL を入れていない段階では、その状態を飛ばして1つ前の案内に留まる。
//   例）ドロー未発表なら「要項を見る」、結果未掲載なら「結果は準備中」と出る。
//   ※ drawUrl / liveUrl は掲載先が決まりしだい記入すること。外部システムの
//     URL でも、サイト内のページ（例 'tournaments.html#draw'）でもよい。

// カルーセル中央の「TODAY」マーカー。終了した大会と今後の大会の境目に入る。
export const TODAY = '2026.08.13';

export const STATUS = {
  past: { label: '終了', badge: 'badge--muted' },
  live: { label: '本日開催', badge: 'badge--open' },
  closed: { label: '受付終了', badge: 'badge--muted' },
  soon: { label: 'まもなく受付', badge: 'badge--muted' },
  open: { label: '受付中', badge: 'badge--open' },
};

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** '2026.08.16' → { md: '08.16', dow: 'SUN' }（カード左上の日程チップ用） */
export function dateChip(date) {
  const [y, m, d] = date.split('.').map(Number);
  return {
    md: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
    dow: DOW[new Date(y, m - 1, d).getDay()],
  };
}

/**
 * 大会の進み具合から、カードの遷移先とボタンの文言を決める。
 * 該当する URL が未記入なら、1つ手前の案内へ自動的に下がる。
 */
export function cardAction(t) {
  if (t.status === 'past') {
    return t.resultUrl
      ? { label: '結果を見る', href: t.resultUrl }
      : { label: '結果は準備中', href: null };
  }
  if (t.status === 'live' && (t.liveUrl || t.drawUrl)) {
    return { label: '速報・ドローを見る', href: t.liveUrl || t.drawUrl };
  }
  if (t.drawUrl) return { label: 'ドローを見る', href: t.drawUrl };
  if (t.outlineUrl) return { label: '要項を見る', href: t.outlineUrl };
  return { label: '詳細を見る', href: t.href ?? null };
}

/**
 * 会場ロゴ（背景透過・白抜き）。大会カードは写真の上に文字を載せるので、
 * ロゴがある会場はカード下部を文字ではなくロゴで見せる。
 * ここに無い会場は venue の文字がそのまま出る。
 * 画像を足すときは、白インク＋背景透過の PNG を public/assets/img/ に置くこと。
 */
export const VENUE_LOGOS = {
  'ヤマタスポーツパーク': { src: 'assets/img/venue-yamata.png', width: 770, height: 80 },
};

export const TOURNAMENTS = [
  {
    date: '2026.05.10',
    title: '令和8年度クラブ対抗戦 前期日程',
    event: '団体戦（男子1部〜8部）',
    venue: 'ヤマタスポーツパーク',
    status: 'past',
    resultUrl: 'results.html',
    drawUrl: null,
    image: 'assets/img/t4.png',
    imageAlt: 'コートに置かれたラケットとテニスボール',
  },
  {
    date: '2026.07.05',
    title: '鳥取市市民体育祭（BCグループ）',
    event: '校区別対抗戦',
    venue: 'ヤマタスポーツパーク',
    status: 'past',
    resultUrl: 'results.html',
    drawUrl: null,
    image: 'assets/img/t1.png',
    imageAlt: 'ネットの手前に置かれたテニスボール',
  },
  {
    date: '2026.07.12',
    title: '令和8年度クラブ対抗戦 後期日程',
    event: '女子1部〜4部／男女予選会',
    venue: 'ヤマタスポーツパーク',
    status: 'past',
    resultUrl: 'results.html',
    drawUrl: null,
    image: 'assets/img/t2.png',
    imageAlt: '青空へトスを上げてサーブする選手',
  },
  {
    date: '2026.08.02',
    title: '第11回気高カップシングルス大会',
    event: '男女シングルス',
    venue: 'ヤマタスポーツパーク',
    status: 'past',
    resultUrl: 'results.html',
    drawUrl: null,
    image: 'assets/img/t3.png',
    imageAlt: 'ネット際でボレーをする選手',
  },
  {
    date: '2026.08.16',
    title: 'サマーミックスダブルス',
    event: 'ミックスダブルス',
    venue: 'ヤマタスポーツパーク',
    status: 'closed',
    outlineUrl: 'tournaments.html',
    drawUrl: null,      // 組み合わせが決まったらURLを入れる
    liveUrl: null,      // 当日の大会運用システムのURLを入れる
    resultUrl: null,    // 終了後、結果の掲載先を入れる
    image: 'assets/img/t3.png',
    imageAlt: 'ネット際でボレーをする選手',
  },
  {
    date: '2026.08.30',
    title: '第49回ダンロップテニストーナメント',
    event: '男女ダブルス',
    venue: 'ヤマタスポーツパーク',
    status: 'closed',
    outlineUrl: 'tournaments.html',
    drawUrl: null,      // 組み合わせが決まったらURLを入れる
    liveUrl: null,      // 当日の大会運用システムのURLを入れる
    resultUrl: null,    // 終了後、結果の掲載先を入れる
    image: 'assets/img/t4.png',
    imageAlt: 'コートに置かれたラケットとテニスボール',
  },
  {
    date: '2026.10.12',
    title: '鳥取市テニス協会 テニス祭り',
    event: 'テニス教室ほか',
    venue: '鳥取産業体育館',
    status: 'soon',
    outlineUrl: 'tennis-day.html',
    drawUrl: null,      // 組み合わせが決まったらURLを入れる
    liveUrl: null,      // 当日の大会運用システムのURLを入れる
    resultUrl: null,    // 終了後、結果の掲載先を入れる
    image: 'assets/img/t2.png',
    imageAlt: '青空へトスを上げてサーブする選手',
  },
  {
    date: '2026.10.18',
    title: '第30回エネトピア杯ミックスダブルス',
    event: 'ミックスダブルス',
    venue: 'ヤマタスポーツパーク',
    status: 'open',
    outlineUrl: 'tournaments.html',
    drawUrl: null,      // 組み合わせが決まったらURLを入れる
    liveUrl: null,      // 当日の大会運用システムのURLを入れる
    resultUrl: null,    // 終了後、結果の掲載先を入れる
    image: 'assets/img/t3.png',
    imageAlt: 'ネット際でボレーをする選手',
  },
  {
    date: '2026.11.07',
    title: '第71回鳥取健康テニス（秋期）',
    event: '一般：男女ダブルス／ジュニア：男女シングルス',
    venue: 'ヤマタスポーツパーク',
    status: 'soon',
    outlineUrl: 'tournaments.html',
    drawUrl: null,      // 組み合わせが決まったらURLを入れる
    liveUrl: null,      // 当日の大会運用システムのURLを入れる
    resultUrl: null,    // 終了後、結果の掲載先を入れる
    image: 'assets/img/t1.png',
    imageAlt: 'ネットの手前に置かれたテニスボール',
  },
  {
    date: '2026.11.08',
    title: '鳥取県テニス選手権 シングルス',
    event: '男女シングルス',
    venue: 'ヤマタスポーツパーク',
    status: 'soon',
    outlineUrl: 'tournaments.html',
    drawUrl: null,      // 組み合わせが決まったらURLを入れる
    liveUrl: null,      // 当日の大会運用システムのURLを入れる
    resultUrl: null,    // 終了後、結果の掲載先を入れる
    image: 'assets/img/t4.png',
    imageAlt: 'コートに置かれたラケットとテニスボール',
  },
];
