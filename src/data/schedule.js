// 大会情報ページ「令和8年度 大会一覧」と、月ごとのカレンダーの唯一の正。
// データ本体は schedule.json（年度の西暦をキーにした配列。"next" は翌年度の先行案内）。
// 管理画面（admin/）は status・due・spareNote を書き換える。
//
// ■ date
//   カレンダーに置くための実日付（ISO）。表に出る文言は label のほう。
//   令和8年度は 2026年3月〜2027年2月。1〜2月のものは翌年になる。
//   期間の大会（尾坂杯）は初日を date に入れ、日程の詳細は spareNote に書く。
//
// ■ spareDate / spareVenue / spareNote
//   spareDate  … 予備日（'3/28' のように日付だけ）
//   spareVenue … 予備会場（空欄は表で「—」と出る）
//   spareNote  … 予備日ではない補足（'荒天中止' など）
//
// ■ status  'done' 終了／'closed' 受付終了／'open' 受付中／'soon' まもなく受付
// ■ reg     'ken' 県登録／'shi' 市登録／'free' 登録不要
//
// ■ 会場
//   主会場は原則ヤマタスポーツパーク（鳥取県立布勢総合運動公園）、
//   予備会場は鳥取市千代テニス場。予備日のある大会にだけ予備会場を入れる
//   （荒天中止の大会は日を振り替えないので、予備会場も置かない）。
//   室内の尾坂杯だけは体育館開催なので、この形に当てはめない。

export const STATUS_LABEL = {
  done: { label: '終了', badge: 'badge--muted' },
  closed: { label: '受付終了', badge: 'badge--muted' },
  open: { label: '受付中', badge: 'badge--open' },
  soon: { label: 'まもなく受付', badge: 'badge--muted' },
};

export const REG_LABEL = {
  ken: '県登録',
  shi: '市登録',
  free: '登録不要',
};

import SCHEDULE_JSON from './schedule.json';

/** 令和8年度（2026年度）の全19大会（schedule.json の "2026"） */
export const SCHEDULE = SCHEDULE_JSON['2026'];


/** 年度の表記。events.json の nendo（年度の西暦）から引く。 */
export const NENDO_LABEL = { '2025': '令和7年度', '2026': '令和8年度' };

/**
 * 令和7年度（2025年度）の全19大会。大会日程（令和7年度鳥取市テニス協会大会日程.pdf）から起こした。
 * すべて終了ずみなので status は 'done' で固定。大会1件ごとのページ（event-r7-*.html）の
 * 日程・会場・登録区分はここから引く。
 */
export const SCHEDULE_R7 = SCHEDULE_JSON['2025'];


/** 令和9年度の先行案内 */
export const SCHEDULE_NEXT = SCHEDULE_JSON.next;


/** 月ごとにまとめ直したもの（カレンダー用）。大会のある月だけを、日付順に返す。 */
export function byMonth(items = SCHEDULE) {
  const map = new Map();
  for (const t of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = t.date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  return [...map].map(([key, list]) => {
    const [y, m] = key.split('-').map(Number);
    return { key, year: y, month: m, items: list };
  });
}

const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * 一覧の期日欄。トップページの大会カードと同じ「08.16 ＋ 改行 ＋ SUN」で出す。
 * 曜日は date（実日付）から出すので、label の書き方に左右されない。
 *
 * note … チップの下に小さく添える一言。
 *   ・1日で終わらない大会（尾坂杯・令和9年度の東部選手権）は、もとの表記をそのまま
 *   ・祝日開催のものは「祝日」（曜日だけでは分からないため）
 */
export function dateCell(t) {
  const [y, m, d] = t.date.split('-').map(Number);
  const single = /^\d+月\d+日（.）$/.test(t.label);
  return {
    md: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
    dow: DOW_EN[new Date(y, m - 1, d).getDay()],
    note: single ? (t.label.includes('（祝）') ? '祝日' : '') : t.label,
  };
}

/**
 * 月のマス目を組む。日曜はじまりで、前後の欠けは null で埋める。
 * 大会のある日には、その日の大会を持たせる。
 */
export function monthGrid({ year, month, items }) {
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  const cells = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, iso, dow: new Date(year, month - 1, d).getDay(), items: items.filter((t) => t.date === iso) });
  }
  while (cells.length % 7) cells.push(null);
  return { cells, en: MONTH_EN[month - 1] };
}
