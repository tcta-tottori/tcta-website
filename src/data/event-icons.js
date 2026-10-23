// 種目のピクトグラム。トップの大会カードと大会一覧に出す（描くのは components/EventIcon.astro）。
//
// 画像は public/assets/img/event-icons/<key>.png（高さ 200px・幅は絵に合わせて可変・背景透過。
// 黒はサイトの --ink、赤は --red）。ボールは ball.png に分けてあり、CSS で動かす（EventIcon.astro）。
// 大会の「種目」の文言から、該当するアイコンを選ぶ（eventIcons）。
//   団体戦／○○対抗戦（チーム対抗戦を含む）／男子1部〜8部／予選会 → 団体戦（これだけ。種目は添えない）
//   ミックスダブルス／混合                 → ミックスダブルス
//   シングルス／単                         → シングルス
//   ダブルス／複                           → ダブルス
//   ジュニア・壮年は、その種目（シングルス／ダブルス）のアイコンで表す

export const EVENT_ICONS = {
  team: { key: 'team', label: '団体戦',           src: 'assets/img/event-icons/team.png', w: 549, h: 200,
          /** 6人の並び（左から）。絵を人ごとに切って、応援の動きをずらして付ける（幅に対する %） */
          figures: [[1.5, 17.7], [18.9, 33.0], [33.7, 48.8], [51.7, 66.8], [67.9, 81.4], [82.5, 98.5]] },
  s:    { key: 's',    label: 'シングルス',       src: 'assets/img/event-icons/s.png',    w: 308, h: 200, ball: [94.3, 52.5, 9.0] },
  d:    { key: 'd',    label: 'ダブルス',         src: 'assets/img/event-icons/d.png',    w: 436, h: 200, ball: [95.9, 52.8, 9.5] },
  x:    { key: 'x',    label: 'ミックスダブルス', src: 'assets/img/event-icons/x.png',    w: 494, h: 200, ball: [95.4, 52.2, 9.0] },
};
/** ボール（選手の絵とは別に置いて動かす）。ball: [中心 x%, 中心 y%, 直径（高さに対する %）] */
export const BALL_SRC = 'assets/img/event-icons/ball.png';

/** 並び順（複数出すとき） */
const ORDER = ['s', 'd', 'x'];

/**
 * 種目の文言 → アイコンの配列（EVENT_ICONS の値）。該当が無ければ空。
 * @param {string} text 例: '男女ダブルス', '一般：男女複／ジュニア：男女単', 'チーム対抗戦（男子複・女子複・混合複）'
 */
export function eventIcons(text) {
  const s = String(text || '');
  // 団体戦・対抗戦は、中の種目（男子複・女子複…）があっても団体戦のアイコンだけにする
  if (/団体|対抗|予選会|\d+部/.test(s)) return [EVENT_ICONS.team];
  const found = new Set();
  if (/シングルス|単/.test(s)) found.add('s');
  if (/ミックス|混合/.test(s)) found.add('x');
  // 「ミックスダブルス」「混合複」だけの文言はダブルスには数えない
  if (/ダブルス|複/.test(s.replace(/ミックスダブルス|混合複|混合ダブルス/g, ''))) found.add('d');
  return ORDER.filter((k) => found.has(k)).map((k) => EVENT_ICONS[k]);
}
