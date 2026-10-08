// 大会情報ページ「令和8年度 大会一覧」と、月ごとのカレンダーの唯一の正。
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

/** 令和8年度（2026年度）の全19大会 */
export const SCHEDULE = [
  { no: '01', date: '2026-03-22', label: '3月22日（日）', spareDate: '3/28', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第56回東部地区テニス選手権', event: '男女シングルス', place: 'ヤマタスポーツパーク', due: '3/6', status: 'done', reg: 'ken' },
  { no: '02', date: '2026-03-29', label: '3月29日（日）', spareDate: '4/4', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第56回東部地区テニス選手権', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '3/13', status: 'done', reg: 'ken' },
  { no: '03', date: '2026-04-05', label: '4月5日（日）', spareDate: '4/11', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '佐々木杯テニス大会', event: 'ミックスダブルス', place: 'ヤマタスポーツパーク', due: '3/20', status: 'done', reg: 'shi' },
  { no: '04', date: '2026-04-29', label: '4月29日（祝）', spareDate: '5/6', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第61回鳥取市テニス協会会長杯（春季）', event: '団体戦', place: 'ヤマタスポーツパーク', due: '4/10', status: 'done', reg: 'shi' },
  { no: '05', date: '2026-05-02', label: '5月2日（土）', spareDate: '', spareNote: '荒天中止', spareVenue: '', name: '第70回鳥取健康テニス（春期）', event: '一般：男女複／ジュニア：男女単', place: 'ヤマタスポーツパーク', due: '4/25', status: 'done', reg: 'free' },
  { no: '06', date: '2026-05-10', label: '5月10日（日）', spareDate: '5/31', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '令和8年度クラブ対抗戦 前期日程', event: '男子1部〜8部', place: 'ヤマタスポーツパーク', due: '4/24', status: 'done', reg: 'shi' },
  { no: '07', date: '2026-07-05', label: '7月5日（日）', spareDate: '7/19', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '鳥取市市民体育祭（BCグループ）', event: '校区別対抗戦', place: 'ヤマタスポーツパーク', due: '別記', status: 'done', reg: 'free' },
  { no: '08', date: '2026-07-12', label: '7月12日（日）', spareDate: '7/18', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '令和8年度クラブ対抗戦 後期日程', event: '女子1部〜4部／男女予選会', place: 'ヤマタスポーツパーク', due: '6/19', status: 'done', reg: 'shi' },
  { no: '09', date: '2026-08-02', label: '8月2日（日）', spareDate: '8/8', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第11回気高カップシングルス大会', event: '男女シングルス', place: 'ヤマタスポーツパーク', due: '7/17', status: 'done', reg: 'ken' },
  { no: '10', date: '2026-08-16', label: '8月16日（日）', spareDate: '9/6', spareNote: '', spareVenue: '鳥取市千代テニス場', name: 'サマーミックスダブルス', event: 'ミックスダブルス', place: 'ヤマタスポーツパーク', due: '7/31', status: 'done', reg: 'shi' },
  { no: '11', date: '2026-08-30', label: '8月30日（日）', spareDate: '9/5', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第49回ダンロップテニストーナメント', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '8/12', status: 'done', reg: 'ken' },
  { no: '12', date: '2026-10-18', label: '10月18日（日）', spareDate: '10/24', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第31回エネトピア杯テニス大会', event: 'ミックスダブルス', place: 'ヤマタスポーツパーク', due: '10/2', status: 'closed', reg: 'shi' },
  { no: '13', date: '2026-11-07', label: '11月7日（土）', spareDate: '', spareNote: '荒天中止', spareVenue: '', name: '第71回鳥取健康テニス（秋期）', event: '一般：男女複／ジュニア：男女単', place: 'ヤマタスポーツパーク', due: '10/23', status: 'open', reg: 'free' },
  { no: '14', date: '2026-11-08', label: '11月8日（日）', spareDate: '11/14', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '鳥取県テニス選手権 シングルス', event: '男女シングルス', place: 'ヤマタスポーツパーク', due: '10/23', status: 'open', reg: 'ken' },
  { no: '15', date: '2026-11-15', label: '11月15日（日）', spareDate: '11/21', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第62回鳥取市テニス協会会長杯（秋季）', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '10/30', status: 'open', reg: 'shi' },
  { no: '16', date: '2026-11-22', label: '11月22日（日）', spareDate: '11/28', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '2026 プリンスオープン チーム対抗戦', event: 'チーム対抗戦（男子複・女子複・混合複）', place: 'ヤマタスポーツパーク', due: '11/6', status: 'open', reg: 'free' },
  { no: '17', date: '2026-11-23', label: '11月23日（祝）', spareDate: '12/5', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第41回鳥取市市長杯', event: '男女シングルス', place: 'ヤマタスポーツパーク', due: '11/6', status: 'soon', reg: 'shi' },
  { no: '18', date: '2026-11-29', label: '11月29日（日）', spareDate: '12/6', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '鳥取県テニス選手権 ダブルス', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '11/13', status: 'soon', reg: 'ken' },
  { no: '19', date: '2026-12-27', label: '12/27〜2/23', spareDate: '', spareNote: '1/3・1/9・2/20 ほか全5日', spareVenue: '', name: '尾坂杯鳥取室内テニス選手権', event: '男女シングルス／男女ダブルス', place: '鳥取市民体育館／鳥取産業体育館', due: '—', status: 'soon', reg: 'ken' },
];

/** 年度の表記。events.json の nendo（年度の西暦）から引く。 */
export const NENDO_LABEL = { '2025': '令和7年度', '2026': '令和8年度' };

/**
 * 令和7年度（2025年度）の全19大会。大会日程（令和7年度鳥取市テニス協会大会日程.pdf）から起こした。
 * すべて終了ずみなので status は 'done' で固定。大会1件ごとのページ（event-r7-*.html）の
 * 日程・会場・登録区分はここから引く。
 */
export const SCHEDULE_R7 = [
  { no: '01', date: '2025-03-23', label: '3月23日（日）', spareDate: '3/29', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第55回東部地区テニス選手権', event: '男女シングルス', place: 'ヤマタスポーツパーク', due: '3/7', status: 'done', reg: 'ken' },
  { no: '02', date: '2025-03-30', label: '3月30日（日）', spareDate: '4/5', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第55回東部地区テニス選手権', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '3/14', status: 'done', reg: 'ken' },
  { no: '03', date: '2025-04-06', label: '4月6日（日）', spareDate: '4/12', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '佐々木杯テニス大会', event: 'ミックスダブルス', place: 'ヤマタスポーツパーク', due: '3/21', status: 'done', reg: 'shi' },
  { no: '04', date: '2025-05-06', label: '5月6日（祝）', spareDate: '5/10', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第59回鳥取市テニス協会会長杯（春季）', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '4/18', status: 'done', reg: 'shi' },
  { no: '05', date: '2025-05-11', label: '5月11日（日）', spareDate: '5/31', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '令和7年度クラブ対抗戦 前期日程', event: '男子1部〜8部', place: 'ヤマタスポーツパーク', due: '4/25', status: 'done', reg: 'shi' },
  { no: '06', date: '2025-05-31', label: '5月31日（土）', spareDate: '', spareNote: '荒天中止', spareVenue: '', name: '第68回鳥取マスターズ健康テニス（春期）', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '5/23', status: 'done', reg: 'free' },
  { no: '07', date: '2025-06-01', label: '6月1日（日）', spareDate: '6/21', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '令和7年度クラブ対抗戦 後期日程', event: '女子1部〜4部／男女予選会', place: 'ヤマタスポーツパーク', due: '5/16', status: 'done', reg: 'shi' },
  { no: '08', date: '2025-06-15', label: '6月15日（日）', spareDate: '6/28', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第10回気高カップシングルス大会', event: '男女シングルス', place: 'ヤマタスポーツパーク', due: '5/30', status: 'done', reg: 'ken' },
  { no: '09', date: '2025-07-06', label: '7月6日（日）', spareDate: '7/20', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '鳥取市市民体育祭（Aグループ）', event: '校区別対抗戦', place: '鳥取市千代テニス場', due: '別記', status: 'done', reg: 'free' },
  { no: '10', date: '2025-08-24', label: '8月24日（日）', spareDate: '9/7', spareNote: '', spareVenue: '鳥取市千代テニス場', name: 'サマーミックスダブルス', event: 'ミックスダブルス', place: 'ヤマタスポーツパーク', due: '8/8', status: 'done', reg: 'shi' },
  { no: '11', date: '2025-08-31', label: '8月31日（日）', spareDate: '9/6', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第48回ダンロップテニストーナメント', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '別記', status: 'done', reg: 'ken' },
  { no: '12', date: '2025-09-23', label: '9月23日（祝）', spareDate: '9/27', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '第29回エネトピア杯ミックスダブルス', event: 'ミックスダブルス', place: 'ヤマタスポーツパーク', due: '9/5', status: 'done', reg: 'shi' },
  { no: '13', date: '2025-10-13', label: '10月13日（祝）', spareDate: '10/18', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '2025 プリンスオープン チーム対抗戦', event: 'チーム対抗戦', place: 'ヤマタスポーツパーク', due: '別記', status: 'done', reg: 'free' },
  { no: '14', date: '2025-11-08', label: '11月8日（土）', spareDate: '', spareNote: '荒天中止', spareVenue: '', name: '第69回鳥取マスターズ健康テニス（秋期）', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '10/31', status: 'done', reg: 'free' },
  { no: '15', date: '2025-11-09', label: '11月9日（日）', spareDate: '11/15', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '鳥取県テニス選手権 シングルス', event: '男女シングルス', place: 'ヤマタスポーツパーク', due: '10/24', status: 'done', reg: 'ken' },
  { no: '16', date: '2025-11-16', label: '11月16日（日）', spareDate: '11/22', spareNote: '', spareVenue: '鳥取市千代テニス場', name: '鳥取県テニス選手権 ダブルス', event: '男女ダブルス', place: 'ヤマタスポーツパーク', due: '10/31', status: 'done', reg: 'ken' },
  { no: '17', date: '2025-11-23', label: '11月23日（日）', spareDate: '11/24', spareNote: '', spareVenue: 'ヤマタスポーツパーク', name: '第60回鳥取市テニス協会会長杯（秋季）', event: '団体戦', place: 'ヤマタスポーツパーク', due: '11/7', status: 'done', reg: 'shi' },
  { no: '18', date: '2025-11-30', label: '11月30日（日）', spareDate: '12/6', spareNote: '', spareVenue: 'ヤマタスポーツパーク', name: '第40回鳥取市市長杯', event: '男女シングルス', place: 'ヤマタスポーツパーク', due: '11/14', status: 'done', reg: 'shi' },
  { no: '19', date: '2026-01-12', label: '1/12〜2/23', spareDate: '', spareNote: '1/12・1/17・2/14・2/21・2/22・2/23 の全6日', spareVenue: '', name: '第53回尾坂杯鳥取室内テニス選手権', event: '男女シングルス／男女ダブルス', place: '鳥取市民体育館／鳥取県民体育館／鳥取産業体育館', due: '12月', status: 'done', reg: 'ken' },
];

/** 令和9年度の先行案内 */
export const SCHEDULE_NEXT = [
  { no: '01', date: '2027-03-21', label: '3月21日・28日', spareDate: '', spareNote: '', spareVenue: '', name: '第57回東部地区テニス選手権', event: '男女シングルス・ダブルス', place: 'ヤマタスポーツパーク', due: '3/5', status: 'soon', reg: 'ken' },
];

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
