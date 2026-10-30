// 大会情報ページ「大会一覧」と、月ごとのカレンダー。
// 内容は EmDash の「大会」コレクション（src/lib/cms.js が読む）。
//
// ■ date
//   カレンダーに置くための実日付（2026-10-18 の形）。表に出る文言は label のほう。
//   令和8年度は 2026年3月〜2027年2月。1〜2月のものは翌年になる。
//   期間の大会（尾坂杯）は初日を date に入れ、日程の詳細は spare_note に書く。
//
// ■ spare_date / spare_venue / spare_note
//   spare_date  … 予備日（'3/28' のように日付だけ）
//   spare_venue … 予備会場
//   spare_note  … 予備日ではない補足（'荒天中止' など）
//
// ■ 受付状態（管理画面の選択肢）  終了／受付終了／受付中／まもなく受付／本日開催（「まもなく受付」は「未受付」と表示する）
// ■ 登録区分（管理画面の選択肢）  県登録／市登録／登録不要
// ■ 区分                          協会主催（一覧に出る）／預かり（一覧の下に別立て）／その他（トップのカードだけ）
//
// ■ 会場
//   主会場は原則ヤマタスポーツパーク（鳥取県立布勢総合運動公園）、
//   予備会場は鳥取市千代テニス場。予備日のある大会にだけ予備会場を入れる
//   （荒天中止の大会は日を振り替えないので、予備会場も置かない）。
//   室内の尾坂杯だけは体育館開催なので、この形に当てはめない。

/** 管理画面の文言 → コードで使うキー */
export const STATE_KEY = { '終了': 'done', '受付終了': 'closed', '受付中': 'open', 'まもなく受付': 'soon', '未受付': 'soon', '本日開催': 'live' };
export const REG_KEY = { '県登録': 'ken', '市登録': 'shi', '登録不要': 'free' };
export const KIND_KEY = { '協会主催': 'main', '預かり': 'extra', 'その他': 'other' };

export const STATUS_LABEL = {
  done: { label: '終了', badge: 'badge--muted' },
  closed: { label: '受付終了', badge: 'badge--muted' },
  open: { label: '受付中', badge: 'badge--open' },
  soon: { label: '未受付', badge: 'badge--muted' },
  live: { label: '本日開催', badge: 'badge--open' },
};

export const REG_LABEL = {
  ken: '県登録',
  shi: '市登録',
  free: '登録不要',
};

/** 年度（西暦）の表記。無いものは「令和N年度」を計算する。 */
export const NENDO_LABEL = { '2025': '令和7年度', '2026': '令和8年度', '2027': '令和9年度' };
export const nendoLabel = (nendo) => NENDO_LABEL[nendo] ?? `令和${Number(nendo) - 2018}年度`;

/** いまの年度（西暦）。3月はじまり。 */
export const CURRENT_NENDO = '2026';

/** 日本時間のいま（UTC のミリ秒）。Cloudflare 上でも端末でも同じ基準で比べるため、締切も UTC のミリ秒にして比べる */
const JST_OFFSET = 9 * 60 * 60 * 1000;
/** 日本時間の今日 'YYYY-MM-DD' */
export function todayJST(now = Date.now()) {
  return new Date(now + JST_OFFSET).toISOString().slice(0, 10);
}
/**
 * 申込締切の日時（日本時間の 20:00）を UTC のミリ秒で。締切は「10/23」の形（年は書かれていない）なので、
 * 大会の開催日の年を当て、締切の月が開催月より後なら前の年（年明け開催で締切が年内）。読めない形（「12月」など）は null
 */
export function dueAt(due, date) {
  const m = String(due ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m || !date) return null;
  const [y, em] = String(date).split('-').map(Number);
  const month = Number(m[1]), day = Number(m[2]);
  const year = month > em ? y - 1 : y;
  return Date.UTC(year, month - 1, day, 20, 0, 0) - JST_OFFSET;
}
/** 受付中の大会は、締切日の 20:00（日本時間）を過ぎたら自動で受付終了にする（管理画面を直さなくてもよいように） */
export function autoStatus(status, due, date, now = Date.now()) {
  if (status !== 'open') return status;
  const at = dueAt(due, date);
  return at !== null && now >= at ? 'closed' : status;
}

/**
 * 協会のサイトに大会ページを作らず、外部のページへ飛ばす大会（大会名で見分ける）。
 * 大会情報ページの一覧で、大会名と要項のボタンを押すとこの URL が別タブで開く（トップの大会カードの要項も同じ。大会ページがある大会はそちらが優先）。
 */
const EXTERNAL_PAGES = [
  // 鳥取市市民体育祭（鳥取市のページ）
  { match: /市民体育祭/, url: 'https://www.city.tottori.lg.jp/page/35046.html' },
];
const externalUrl = (name) => EXTERNAL_PAGES.find((x) => x.match.test(String(name ?? '')))?.url ?? null;

/** EmDash の 1 行を、移行前の schedule.json の 1 行と同じ形にする。 */
export function scheduleRow(t) {
  const date = String(t.date ?? '').slice(0, 10);
  return {
    slug: t.slug,
    nendo: String(t.nendo ?? ''),
    no: t.no || '',
    kind: KIND_KEY[t.kind] ?? 'main',
    date,
    label: t.label || '',
    spareDate: t.spare_date || '',
    spareNote: t.spare_note || '',
    spareVenue: t.spare_venue || '',
    name: t.name,
    event: t.event || '',
    place: t.place || '',
    due: t.due || '',
    status: autoStatus(STATE_KEY[t.state] ?? 'soon', t.due, date),
    reg: REG_KEY[t.reg] ?? 'free',
    externalUrl: externalUrl(t.name),
  };
}

/**
 * EmDash の行から、ページが使う形に組み立てる。
 *   SCHEDULE      … いまの年度（令和8年度）の協会主催の大会。通し番号順
 *   SCHEDULE_R7   … 前の年度（令和7年度）の協会主催の大会
 *   SCHEDULE_NEXT … 次の年度の先行案内
 *   ROWS          … 全部（区分を問わない）
 */
export function buildSchedule(rows) {
  const ROWS = rows.filter((t) => t.name && t.date).map(scheduleRow);
  const main = (nendo) => ROWS
    .filter((t) => t.kind === 'main' && t.nendo === nendo)
    .sort((a, b) => (a.no || '99').localeCompare(b.no || '99') || a.date.localeCompare(b.date));
  const next = String(Number(CURRENT_NENDO) + 1);
  const prev = String(Number(CURRENT_NENDO) - 1);
  return { ROWS, SCHEDULE: main(CURRENT_NENDO), SCHEDULE_R7: main(prev), SCHEDULE_NEXT: main(next) };
}

/** 月ごとにまとめ直したもの（カレンダー用）。大会のある月だけを、日付順に返す。 */
export function byMonth(items) {
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
  const single = !t.label || /^\d+月\d+日（.）$/.test(t.label);
  return {
    md: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
    dow: DOW_EN[new Date(y, m - 1, d).getDay()],
    note: single ? (t.label?.includes('（祝）') ? '祝日' : '') : t.label,
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
