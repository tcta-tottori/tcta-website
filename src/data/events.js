// 大会1件ごとのページ（event-<slug>.html）。内容は EmDash の「大会」コレクション（src/lib/cms.js が読む）。
//
// 素材（要項・申込用紙・ドロー・結果・写真）は 2 か所から集める。
//   ・legacy_materials … 移行前に public/assets/ に置いた画像・PDF（編集しない）
//   ・materials        … 管理画面でアップロードした画像・PDF（ブロック）
// 同じ種類のものは、移行前のものが先、あとから足したものが後ろに並ぶ。
//
// 種目ごとの優勝・準優勝（winners）は管理画面の「成績」の行をそのまま種目ごとにまとめる。
//
// ■ 節の並び
//   結果が出ている大会は「結果 → 写真 → ドロー → 要項」、
//   まだの大会は「要項 → 申込用紙 → ドロー」の順で出す。
//   見に来る人が最初に知りたいものを先頭に置くため。

import { nendoLabel, STATUS_LABEL, REG_LABEL, dateCell } from './schedule.js';

/** 令和8年度の大会日程（PDF）。年度はじめに差し替える。 */
export const SCHEDULE_PDF = { src: 'assets/pdf/events/r8-schedule.pdf', kb: 86 };

/** 節の見出しと説明。key は素材の「種類」と対応する。 */
export const SECTIONS = {
  outline: { label: '要項', en: 'Outline', lead: '募集要項です。画像をタップすると全画面で表示します。' },
  entry: { label: '申込用紙', en: 'Entry', lead: '印刷してお使いください。' },
  draw: { label: 'ドロー', en: 'Draw', lead: '組み合わせです。当日の変更は会場の掲示が優先します。' },
  result: { label: '結果', en: 'Result', lead: '種目ごとの結果です。画像をタップすると全画面で表示します。' },
  photo: { label: '当日の写真', en: 'Photo', lead: '' },
};

/** 管理画面の「種類」の文言 → key */
const SECTION_KEY = { '要項': 'outline', '申込用紙': 'entry', 'ドロー': 'draw', '結果': 'result', '当日の写真': 'photo' };

const DONE_ORDER = ['result', 'photo', 'draw', 'outline', 'entry'];
const UPCOMING_ORDER = ['outline', 'entry', 'draw', 'result', 'photo'];

/** 移行前の素材とアップロードした素材を、種類ごとの { images, pdfs } にまとめる。 */
function collectMaterials(t, mediaUrl) {
  const out = {};
  const sec = (key) => (out[key] ??= { images: [], pdfs: [] });
  const legacy = t.legacy_materials && typeof t.legacy_materials === 'object' ? t.legacy_materials : {};
  for (const [key, s] of Object.entries(legacy)) {
    if (!SECTIONS[key]) continue;
    for (const img of s.images ?? []) sec(key).images.push({ src: img.src, label: img.label ?? null, w: img.w, h: img.h });
    for (const pdf of s.pdfs ?? []) sec(key).pdfs.push({ src: pdf.src, label: pdf.label, kb: pdf.kb ?? 0 });
  }
  for (const b of Array.isArray(t.materials) ? t.materials : []) {
    const key = SECTION_KEY[b.section];
    if (!key) continue;
    if (b._type === 'material_image' && b.image?.src) {
      sec(key).images.push({ src: b.image.src, label: b.label || null, w: b.image.width ?? 1241, h: b.image.height ?? 1754 });
    } else if (b._type === 'material_pdf' && b.file) {
      const f = b.file;
      const storageKey = typeof f.meta?.storageKey === 'string' ? f.meta.storageKey : null;
      const src = (storageKey && mediaUrl(storageKey)) || (f.provider === 'external' ? f.src : f.url) || null;
      if (!src) continue;
      const bytes = f.size ?? f.meta?.size ?? 0;
      sec(key).pdfs.push({ src, label: b.label || f.filename || 'PDF', kb: Math.round(bytes / 1024) });
    }
  }
  return out;
}

/** 管理画面の「成績」の行（種目・順位・名前）を、種目ごとにまとめる。 */
export function groupWinners(rows) {
  const cats = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.name) continue;
    const category = r.category || '種目';
    let c = cats.find((x) => x.category === category);
    if (!c) cats.push((c = { category, places: [] }));
    c.places.push({ award: r.award || '優勝', name: r.name });
  }
  return cats;
}

/**
 * EmDash の行から、ページが使う形に組み立てる。
 *   EVENTS          … ページのある大会。区分が「協会主催」「預かり」で、素材・成績・補足・外部リンクの
 *                     どれかがあるもの（まだ何も無い大会はページを作らず、一覧でもリンクにしない）
 *   EVENTS_BY_DATE  … 日付の新しい順
 *   EVENTS_BY_NENDO … 年度ごと（大会結果ページの年度タブ用）。結果の出ている大会だけ
 *   eventBySlug / eventForSchedule … 引く道具
 */
export function buildEvents(rows, { ROWS }, mediaUrl = () => null) {
  const base = new Map(ROWS.map((r) => [r.slug, r]));

  const hasContent = (t) =>
    (Array.isArray(t.materials) && t.materials.length > 0) ||
    (t.legacy_materials && Object.keys(t.legacy_materials).length > 0) ||
    (Array.isArray(t.winners) && t.winners.length > 0) ||
    !!t.note || !!t.link_url;
  const withPage = rows.filter((t) => base.has(t.slug) && base.get(t.slug).kind !== 'other' && hasContent(t));

  // 東部地区選手権のように、シングルスとダブルスで同じ大会名を使うものがある。
  // 一覧や前後の行き来で取り違えないよう、名前が重なるものだけ種目を添える。
  const nameCount = new Map();
  for (const t of withPage) nameCount.set(t.name, (nameCount.get(t.name) ?? 0) + 1);

  const EVENTS = withPage
    .map((t) => {
      const b = base.get(t.slug);
      const sections = collectMaterials(t, mediaUrl);
      const winners = groupWinners(t.winners);
      const hasResult = (sections.result?.images.length ?? 0) > 0 || (sections.result?.pdfs.length ?? 0) > 0 || winners.length > 0;
      const order = (hasResult ? DONE_ORDER : UPCOMING_ORDER)
        .filter((k) => sections[k] && (sections[k].images.length || sections[k].pdfs.length))
        .map((k) => ({ key: k, ...SECTIONS[k], ...sections[k] }));
      const link = t.link_url ? { label: t.link_label || t.link_url, url: t.link_url } : null;
      return {
        ...b,
        host: t.host || '',
        note: t.note || '',
        link,
        nendoLabel: nendoLabel(b.nendo),
        url: `event-${b.slug}.html`,
        /** 種目ごとの優勝・準優勝。無ければ空 */
        winners,
        /** 大会名だけでは区別できないときに種目を添えた名前（タイトル・前後の行き来用） */
        displayName: nameCount.get(b.name) > 1 && b.event ? `${b.name}（${b.event}）` : b.name,
        chip: dateCell(b),
        badge: STATUS_LABEL[b.status],
        regLabel: REG_LABEL[b.reg],
        hasResult,
        sections: order,
        /** ページ上部の写真。当日の写真の1枚目を使う。無ければ null。 */
        cover: sections.photo?.images[0]?.src ?? null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const bySlug = new Map(EVENTS.map((e) => [e.slug, e]));
  const EVENTS_BY_DATE = [...EVENTS].sort((a, b) => b.date.localeCompare(a.date));
  const EVENTS_BY_NENDO = [...new Set(EVENTS.map((e) => e.nendo))]
    .sort((a, b) => b.localeCompare(a))
    .map((nendo) => ({
      nendo,
      label: nendoLabel(nendo),
      events: EVENTS.filter((e) => e.nendo === nendo && e.hasResult),
    }))
    .filter((y) => y.events.length);

  return {
    EVENTS,
    EVENTS_BY_DATE,
    EVENTS_BY_NENDO,
    eventBySlug: (slug) => bySlug.get(slug) ?? null,
    /** 大会一覧の行から、対応するページを引く（slug が同じ）。 */
    eventForSchedule: (t) => bySlug.get(t.slug) ?? null,
  };
}

/** 一覧に出す1行の要約。優勝者を先頭からいくつか並べる（results.js の summarize と同じ形）。 */
export function winnersSummary(e, max = 3) {
  const wins = [];
  for (const c of e.winners) {
    for (const p of c.places) {
      if (p.award === '優勝' && p.name) wins.push(`${c.category ? c.category + ' ' : ''}${p.name}`);
      if (wins.length >= max) return wins;
    }
  }
  return wins;
}

/** 節の中身の量を一言でまとめる（「結果11枚・写真7枚」など） */
export function sectionSummary(e) {
  return e.sections
    .filter((s) => s.images.length)
    .map((s) => `${s.label}${s.images.length}枚`)
    .join('・');
}
