// 種目のピクトグラム。トップの大会カードと大会一覧に出す。
//
// 画像は public/assets/img/event-icons/<key>.png（高さ 200px・幅は絵に合わせて可変・背景透過。
// 黒はサイトの --ink、赤は --red、ボールは黄色）。
// 大会の「種目」の文言から、該当するアイコンを選ぶ（eventIcons）。
//   シングルス／単                         → シングルス
//   ダブルス／複                           → ダブルス
//   ミックスダブルス／混合                 → ミックスダブルス
//   団体戦／○○対抗戦／男子1部〜8部／予選会 → 団体戦
//   ジュニア・壮年は、その種目（シングルス／ダブルス）のアイコンで表す
// 出す数は最大 4 つまで（団体戦・シングルス・ダブルス・ミックスで全部）。

export const EVENT_ICONS = {
  team: { key: 'team', label: '団体戦',           src: 'assets/img/event-icons/team.png', w: 549, h: 200 },
  s:    { key: 's',    label: 'シングルス',       src: 'assets/img/event-icons/s.png',    w: 308, h: 200 },
  d:    { key: 'd',    label: 'ダブルス',         src: 'assets/img/event-icons/d.png',    w: 436, h: 200 },
  x:    { key: 'x',    label: 'ミックスダブルス', src: 'assets/img/event-icons/x.png',    w: 494, h: 200 },
};

/** 並び順（複数出すとき） */
const ORDER = ['team', 's', 'd', 'x'];

/**
 * 種目の文言 → アイコンの配列（EVENT_ICONS の値）。該当が無ければ空。
 * @param {string} text 例: '男女ダブルス', '一般：男女複／ジュニア：男女単', 'チーム対抗戦（男子複・女子複・混合複）'
 */
export function eventIcons(text) {
  const s = String(text || '');
  const found = new Set();
  if (/団体|対抗|予選会|\d+部/.test(s)) found.add('team');
  if (/シングルス|単/.test(s)) found.add('s');
  if (/ミックス|混合/.test(s)) found.add('x');
  // 「ミックスダブルス」「混合複」だけの文言はダブルスには数えない
  if (/ダブルス|複/.test(s.replace(/ミックスダブルス|混合複|混合ダブルス/g, ''))) found.add('d');
  return ORDER.filter((k) => found.has(k)).map((k) => EVENT_ICONS[k]);
}
