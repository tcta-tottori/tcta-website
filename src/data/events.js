// 令和8年度の大会1件ごとのページ（event-<slug>.html）の唯一の正。
//
// 素材（要項・ドロー・結果・写真）は tools/build_events.py が
// 協会の作業フォルダから取り込み、events.json に書き出している。
// ここではそれに schedule.js の日程・会場・締切・登録区分を重ねて、
// ページが必要とする形にまとめている。
//
// ■ 大会を1件足す・素材を差し替える
//   tools/build_events.py の MANIFEST を直して実行する。
//   このファイルを触る必要があるのは、19大会に入らない大会（EXTRA）を
//   足すときだけ。
//
// ■ 節の並び
//   結果が出ている大会は「結果 → 写真 → ドロー → 要項」、
//   まだの大会は「要項 → 申込用紙 → ドロー」の順で出す。
//   見に来る人が最初に知りたいものを先頭に置くため。

import raw from './events.json';
import { SCHEDULE, STATUS_LABEL, REG_LABEL, dateCell } from './schedule.js';

export const SCHEDULE_PDF = raw.schedulePdf;

/** 節の見出しと説明。key は events.json の sections のキーと対応する。 */
export const SECTIONS = {
  outline: { label: '要項', en: 'Outline', lead: '募集要項です。画像をタップすると大きく表示します。' },
  entry: { label: '申込用紙', en: 'Entry', lead: '印刷してお使いください。' },
  draw: { label: 'ドロー', en: 'Draw', lead: '組み合わせです。当日の変更は会場の掲示が優先します。' },
  result: { label: '結果', en: 'Result', lead: '種目ごとの結果です。画像をタップすると大きく表示します。' },
  photo: { label: '当日の写真', en: 'Photo', lead: '' },
};

const DONE_ORDER = ['result', 'photo', 'draw', 'outline', 'entry'];
const UPCOMING_ORDER = ['outline', 'entry', 'draw', 'result', 'photo'];

/**
 * 協会主催19大会（schedule.js）には入らないが、協会が要項と結果を預かっている大会。
 * schedule.js から取れない項目をここで補う。
 */
const EXTRA = {
  'r8-tottori-univ-open': {
    date: '2026-06-21',
    label: '6月21日（日）',
    name: '鳥大オープンテニス大会',
    event: '男女ダブルス',
    place: '鳥取大学テニスコート',
    due: '6/13',
    status: 'done',
    reg: 'free',
    host: '鳥取大学硬式庭球部',
    note: '鳥取大学硬式庭球部が主催する大会です。協会は要項・ドロー・結果の掲載に協力しています。',
  },
};

const byNo = new Map(SCHEDULE.map((t) => [t.no, t]));

// 東部地区選手権のように、シングルスとダブルスで同じ大会名を使うものがある。
// 一覧や前後の行き来で取り違えないよう、名前が重なるものだけ種目を添える。
const nameCount = new Map();
for (const e of raw.events) {
  const n = (e.no ? byNo.get(e.no) : EXTRA[e.slug])?.name;
  if (n) nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
}

export const EVENTS = raw.events.map((e) => {
  const base = e.no ? byNo.get(e.no) : EXTRA[e.slug];
  if (!base) throw new Error(`events.json の ${e.slug} に対応する大会が見つからない`);

  const sections = e.sections;
  const hasResult = (sections.result?.images.length ?? 0) > 0;
  const order = (hasResult ? DONE_ORDER : UPCOMING_ORDER)
    .filter((k) => sections[k] && (sections[k].images.length || sections[k].pdfs.length))
    .map((k) => ({ key: k, ...SECTIONS[k], ...sections[k] }));

  return {
    ...base,
    slug: e.slug,
    no: e.no,
    url: `event-${e.slug}.html`,
    /** 大会名だけでは区別できないときに種目を添えた名前（タイトル・前後の行き来用） */
    displayName: nameCount.get(base.name) > 1 ? `${base.name}（${base.event}）` : base.name,
    chip: dateCell(base),
    badge: STATUS_LABEL[base.status],
    regLabel: REG_LABEL[base.reg],
    hasResult,
    sections: order,
    /** ページ上部の写真。当日の写真の1枚目を使う。無ければ null。 */
    cover: sections.photo?.images[0]?.src ?? null,
  };
});

const bySlug = new Map(EVENTS.map((e) => [e.slug, e]));
// 開催日で引く。schedule.js の通し番号は年度ごとに 01 から振り直されるため、
// 令和9年度の先行案内と取り違えないよう日付を鍵にしている。
const byDate = new Map(EVENTS.map((e) => [e.date, e]));

/** slug から1件引く */
export const eventBySlug = (slug) => bySlug.get(slug) ?? null;

/** 大会一覧（schedule.js）の行から、対応するページを引く。無ければ null。 */
export const eventForSchedule = (t) => byDate.get(t.date) ?? null;

/** 日付の新しい順（一覧に並べるとき用） */
export const EVENTS_BY_DATE = [...EVENTS].sort((a, b) => b.date.localeCompare(a.date));

/** 節の中身の量を一言でまとめる（「結果11枚・写真7枚」など） */
export function sectionSummary(e) {
  return e.sections
    .filter((s) => s.images.length)
    .map((s) => `${s.label}${s.images.length}枚`)
    .join('・');
}
