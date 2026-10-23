// 種目のアイコン（ピクトグラム）。トップの大会カードと大会一覧に出す。
//
// 画像は public/assets/img/event-icons/<key>.png（240×240・背景透過。黒はサイトの --ink、赤は --red）。
// 大会の「種目」の文言から、該当するアイコンを選ぶ（eventIcons）。
//   男女シングルス            → 男子シングルス・女子シングルス
//   男女ダブルス              → 男子ダブルス・女子ダブルス
//   ミックスダブルス          → ミックスダブルス
//   団体戦／○○対抗戦／男子1部〜8部／予選会 → 団体戦
//   一般：男女複／ジュニア：男女単 → 男子ダブルス・女子ダブルス・ジュニア
//   壮年男子ダブルス          → シニア
// 文言は「／」「・」で区切って、区切りごとに（性別 × シングルス／ダブルス）を読む。
// 出す数は最大 4 つまで（それ以上はカードに収まらない）。

export const EVENT_ICONS = {
  ms:   { key: 'ms',   label: '男子シングルス',   src: 'assets/img/event-icons/ms.png' },
  ws:   { key: 'ws',   label: '女子シングルス',   src: 'assets/img/event-icons/ws.png' },
  md:   { key: 'md',   label: '男子ダブルス',     src: 'assets/img/event-icons/md.png' },
  wd:   { key: 'wd',   label: '女子ダブルス',     src: 'assets/img/event-icons/wd.png' },
  xd:   { key: 'xd',   label: 'ミックスダブルス', src: 'assets/img/event-icons/xd.png' },
  team: { key: 'team', label: '団体戦',           src: 'assets/img/event-icons/team.png' },
  jr:   { key: 'jr',   label: 'ジュニア',         src: 'assets/img/event-icons/jr.png' },
  sr:   { key: 'sr',   label: 'シニア',           src: 'assets/img/event-icons/sr.png' },
};

/** 画像の大きさ（正方形） */
export const ICON_SIZE = 240;

/** 並び順（カードに複数出すとき） */
const ORDER = ['team', 'ms', 'ws', 'md', 'wd', 'xd', 'jr', 'sr'];
const MAX = 4;

/**
 * 種目の文言 → アイコンの配列（EVENT_ICONS の値）。該当が無ければ空。
 * @param {string} text 例: '男女ダブルス', '一般：男女複／ジュニア：男女単'
 */
export function eventIcons(text) {
  const found = new Set();
  const s = String(text || '');
  if (/団体|対抗|予選会|\d+部/.test(s)) found.add('team');
  let last = { men: false, women: false }; // 「男女シングルス・ダブルス」の「ダブルス」は直前の性別を引き継ぐ
  for (const part of s.split(/[／/・、，,]/)) {
    const seg = part.replace(/^[^：:]*[：:]/, ''); // 「一般：」「ジュニア：」の前置きを除く
    if (/ジュニア/.test(part)) { found.add('jr'); continue; }
    if (/壮年|シニア|ベテラン/.test(part)) { found.add('sr'); continue; }
    const mixed = /ミックス|混合/.test(seg);
    if (mixed) found.add('xd');
    const singles = /シングルス|単/.test(seg);
    const doubles = /ダブルス|複/.test(seg) && !mixed;
    let men = /男/.test(seg) && !mixed;
    let women = /女/.test(seg) && !mixed;
    if ((singles || doubles) && !men && !women) ({ men, women } = last);
    if (men || women) last = { men, women };
    if (singles) { if (men) found.add('ms'); if (women) found.add('ws'); }
    if (doubles) { if (men) found.add('md'); if (women) found.add('wd'); }
  }
  return ORDER.filter((k) => found.has(k)).slice(0, MAX).map((k) => EVENT_ICONS[k]);
}
