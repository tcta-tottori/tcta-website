// seed/seed.json（EmDash の内容モデルと最初の内容）を、移行前のデータから組み立てる。
//
//   node tools/build_seed.mjs
//
// 入力は src/data/ の news.json・schedule.json・tournaments.json・events.json・winners.json
// （移行前に公式サイトと管理アプリが使っていたもの。移行後は変更しない）。
// seed はビルド時に Worker に埋め込まれ、配備先の D1 が空のとき最初のリクエストで
// 「内容モデル」だけが適用される。内容（お知らせ・大会）は、管理画面の初回セットアップで
// 「サンプルの内容を含める」を選んだときに入る（docs/emdash.md）。
//
// 項目の選択肢は編集者が読む日本語の文言にしてある。コードでは src/data/*.js の
// STATE_KEY などで英字のキーに戻す。
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'));
const NEWS = read('news.json');
const SCHEDULE = read('schedule.json');
const CARDS = read('tournaments.json');
const EVENTS = read('events.json').events;
const WINNERS = read('winners.json');

/* ---------- 選択肢（日本語） ---------- */
export const STATE = { done: '終了', closed: '受付終了', open: '受付中', soon: 'まもなく受付', live: '本日開催' };
export const REG = { ken: '県登録', shi: '市登録', free: '登録不要' };
export const KIND = { main: '協会主催', extra: '預かり', other: 'その他' };
export const CATEGORY = { tournament: '大会', result: '結果', junior: 'ジュニア', info: 'お知らせ' };
const SECTION = { outline: '要項', entry: '申込用紙', draw: 'ドロー', result: '結果', photo: '当日の写真' };
const AWARDS = ['優勝', '準優勝', '3位', 'ベスト4', 'ベスト8'];

/* ---------- 協会主催19大会に入らない大会（旧 src/data/events.js の EXTRA） ---------- */
const EXTRA = {
  'r8-tottori-univ-open': {
    date: '2026-06-21', label: '6月21日（日）', name: '鳥大オープンテニス大会', event: '男女ダブルス',
    place: '鳥取大学テニスコート', due: '6/13', status: 'done', reg: 'free', host: '鳥取大学硬式庭球部',
    note: '鳥取大学硬式庭球部が主催する大会です。協会は要項・ドロー・結果の掲載に協力しています。',
  },
  'r7-tottori-univ-singles': {
    date: '2025-12-14', label: '12月14日（日）', name: '鳥大オープンテニス大会', event: '男女シングルス',
    place: '鳥取大学テニスコート', due: '12/5', status: 'done', reg: 'free', host: '鳥取大学硬式庭球部',
    note: '鳥取大学硬式庭球部が主催する大会です。協会は要項・結果の掲載に協力しています。',
  },
  'r8-kyotango-doubles': {
    date: '2026-10-04', label: '10月4日（日）', name: '第22回京丹後市オープンダブルステニス大会',
    event: '一般男子ダブルス／女子ダブルス／壮年男子ダブルス', place: '峰山総合公園テニスコート（京都府京丹後市）',
    spareNote: '予備日なし', due: '9/25（金）20:00', status: 'done', reg: 'free', host: '京丹後市テニス協会',
    note: '京丹後市テニス協会が主催するオープン大会です。申込は京丹後市テニス協会のホームページにあるエントリーフォームから行ってください（本人以外の申込はできません）。ドローも同ホームページに掲載されます。',
    link: { label: '京丹後市テニス協会のホームページで申し込む', url: 'https://kyotangotennis.sakura.ne.jp/' },
  },
};

/* ---------- 主催が別のところにある大会の補足（旧 events.js の NOTES） ---------- */
const NOTES = {
  'r8-prince-open': {
    host: 'フラシーノラケットワークス（協賛：グローブライド株式会社／協力：鳥取市テニス協会）',
    note: 'プリンス商品の使用・着用と、クラブプリンスメルマガの会員登録（大会当日の新規登録も可）が参加条件です。ドローと開催要項はドロー会議後にこのサイトで発表します。',
    link: { label: 'クラブプリンスメルマガに登録する', url: 'https://www.princeshop.jp/shop/mail/mag.aspx' },
  },
};

/* ---------- トップの「イベント情報」（旧 src/data/eventinfo.js） ---------- */
const EVENT_INFO = [
  {
    slug: 'tennis-day-2026', date: '2026-10-12', when: '2026年10月12日（月・祝）9:30〜16:30',
    title: 'テニス祭り 鳥取イベント', place: '鳥取県立鳥取産業体育館 メインアリーナ',
    lead: 'キッズテニス、元プロ 加藤季温コーチのテニスクリニック、ピックルボール体験会。協会登録は不要で、どなたでも参加できます。',
    image: 'assets/img/tennis-day/2026-youkou.webp', imageAlt: 'テニス祭り 鳥取イベント 募集要項',
    href: 'tennis-day.html', badge: '参加者募集中',
  },
  {
    slug: 'wednesday-lesson', date: '', when: '毎週水曜日 夜', title: '水曜テニス教室', place: '井原公園テニスコート',
    lead: 'レベル別に4つのコートに分かれ、専任コーチがつきます。ラケットの持ち方から教えるコートもあり、はじめての方も歓迎です。',
    image: '', imageAlt: '', href: 'lesson.html', badge: '通年',
  },
];

/* ---------- 内容モデル ---------- */
const str = (slug, label, extra = {}) => ({ slug, label, type: 'string', ...extra });
const select = (slug, label, options, defaultValue, extra = {}) =>
  ({ slug, label, type: 'select', validation: { options }, defaultValue, ...extra });

const collections = [
  {
    slug: 'news', label: 'お知らせ', labelSingular: 'お知らせ',
    supports: ['drafts', 'revisions', 'search'],
    fields: [
      str('title', 'タイトル', { required: true, searchable: true }),
      str('date', '日付（2026-10-12 の形）', { required: true, indexed: true }),
      select('category', '分類', Object.values(CATEGORY), CATEGORY.info, { required: true }),
      str('href', 'リンク先（サイト内のページ。例：event-r8-enetopia.html）', { required: true }),
      { slug: 'important', label: '目立たせる（中止・延期など。全ページ上部の赤い帯に出す）', type: 'boolean', defaultValue: false },
    ],
  },
  {
    slug: 'tournaments', label: '大会', labelSingular: '大会',
    supports: ['drafts', 'revisions', 'search'],
    fields: [
      str('name', '大会名', { required: true, searchable: true }),
      str('nendo', '年度（西暦。令和8年度＝2026）', { required: true, indexed: true }),
      str('no', '通し番号（協会主催の大会のみ。01〜19）'),
      select('kind', '区分', Object.values(KIND), KIND.main, { required: true }),
      str('event', '種目'),
      str('date', '開催日（2026-10-18 の形。期間の大会は初日）', { required: true, indexed: true }),
      str('label', '期日の表記（例：10月18日（日））'),
      str('place', '会場'),
      str('spare_date', '予備日（例：10/24）'),
      str('spare_venue', '予備会場'),
      str('spare_note', '予備日がないときの補足（例：荒天中止）'),
      str('due', '申込締切（例：10/9）'),
      select('state', '受付状態', Object.values(STATE), STATE.soon, { required: true }),
      select('reg', '登録区分', Object.values(REG), REG.shi, { required: true }),
      str('host', '主催（協会以外のとき）'),
      { slug: 'note', label: '補足（概要の下に出る）', type: 'text' },
      str('link_label', '外部リンクの文言'),
      { slug: 'link_url', label: '外部リンクの URL', type: 'url' },
      { slug: 'card', label: 'トップページの大会カードに出す', type: 'boolean', defaultValue: false },
      str('card_event', 'カードに出す種目の文言（空なら「種目」をそのまま使う）'),
      { slug: 'card_image', label: 'カードの写真', type: 'image' },
      str('card_image_alt', 'カードの写真の説明（読み上げ用）'),
      str('card_image_path', '取り込みずみの写真の場所（編集不要）'),
      { slug: 'live_url', label: '当日の速報・ドロー（大会運用システム）の URL', type: 'url' },
      { slug: 'outline_url', label: '要項の URL（ページを作らない大会のみ）', type: 'url' },
      { slug: 'draw_url', label: 'ドローの URL（ページを作らない大会のみ）', type: 'url' },
      { slug: 'result_url', label: '結果の URL（ページを作らない大会のみ）', type: 'url' },
      {
        slug: 'materials', label: '要項・申込用紙・ドロー・結果・当日の写真', type: 'blocks',
        validation: { allowedTypes: ['material_image', 'material_pdf'], maxItems: 100 },
      },
      {
        slug: 'winners', label: '成績（種目ごとの優勝・準優勝）', type: 'repeater',
        validation: {
          subFields: [
            { slug: 'category', label: '種目', type: 'string', required: true },
            { slug: 'award', label: '順位', type: 'select', required: true, options: AWARDS },
            { slug: 'name', label: '名前', type: 'string', required: true },
          ],
        },
      },
      { slug: 'legacy_materials', label: '取り込みずみの素材（移行前の画像・PDF。編集不要）', type: 'json' },
    ],
  },
  {
    slug: 'event_info', label: 'イベント情報', labelSingular: 'イベント',
    supports: ['drafts', 'revisions'],
    fields: [
      str('title', 'タイトル', { required: true }),
      str('date', '開催日（2026-10-12 の形。毎週あるものは空）'),
      str('when', '日時の文言', { required: true }),
      str('place', '会場'),
      { slug: 'lead', label: '紹介文', type: 'text' },
      { slug: 'image', label: '画像（縦長のチラシやポスター）', type: 'image' },
      str('image_alt', '画像の説明（読み上げ用）'),
      str('image_path', '取り込みずみの画像の場所（編集不要）'),
      str('href', 'リンク先（サイト内のページ）', { required: true }),
      str('badge', 'バッジの文言（例：参加者募集中）'),
      { slug: 'order', label: '並び順（小さいほど上）', type: 'integer', defaultValue: 10, indexed: true },
    ],
  },
];

const blockTypes = [
  {
    slug: 'material_image', label: '画像（要項・ドロー・結果・写真）', currentVersion: 1,
    versions: [{
      version: 1,
      fields: [
        select('section', '種類', Object.values(SECTION), SECTION.result, { required: true }),
        { slug: 'image', label: '画像', type: 'image', required: true },
        str('label', '説明（例：男子シングルスA級）'),
      ],
    }],
  },
  {
    slug: 'material_pdf', label: 'PDF（要項・申込用紙・ドロー・結果）', currentVersion: 1,
    versions: [{
      version: 1,
      fields: [
        select('section', '種類', Object.values(SECTION).filter((s) => s !== SECTION.photo), SECTION.outline, { required: true }),
        { slug: 'file', label: 'PDF', type: 'file', required: true, validation: { allowedMimeTypes: ['application/pdf'] } },
        str('label', 'ボタンの文言（例：R8東部選手権シングルス要項）'),
      ],
    }],
  },
];

/* ---------- 内容 ---------- */
const reiwa = (nendo) => Number(nendo) - 2018;
const eventByKey = new Map(EVENTS.filter((e) => e.no).map((e) => [`${e.nendo}-${e.no}`, e]));
const cardBySlug = new Map(CARDS.filter((c) => c.slug).map((c) => [c.slug, c]));
// slug の無いカードは、大会名と開催日が同じ一覧の大会に付ける（例：市民体育祭）
const cardByNameDate = new Map(CARDS.filter((c) => !c.slug).map((c) => [`${c.title}|${c.date.replace(/\./g, '-')}`, c]));
const matchedCards = new Set();

function winnersRows(slug) {
  const rows = [];
  for (const c of WINNERS[slug]?.categories ?? []) {
    for (const p of c.places) rows.push({ category: c.category || '種目', award: p.award, name: p.name });
  }
  return rows;
}

function cardFields(card, event = '') {
  if (!card) return { card: false };
  return {
    card: true,
    card_event: card.event && card.event !== event ? card.event : '',
    card_image_path: card.image ?? '',
    card_image_alt: card.imageAlt ?? '',
    live_url: card.liveUrl ?? '', outline_url: card.outlineUrl ?? '', draw_url: card.drawUrl ?? '', result_url: card.resultUrl ?? '',
  };
}

function entry(slug, data) {
  return { id: slug, slug, status: 'published', data };
}

const tournaments = [];
const used = new Set();

// 協会主催の大会（年度ごとの一覧）
for (const [year, rows] of Object.entries(SCHEDULE)) {
  const nendo = year === 'next' ? String(Math.max(...Object.keys(SCHEDULE).filter((k) => k !== 'next').map(Number)) + 1) : year;
  for (const t of rows) {
    const ev = eventByKey.get(`${nendo}-${t.no}`);
    const slug = ev?.slug ?? `r${reiwa(nendo)}-no${t.no}`;
    used.add(slug);
    const notes = NOTES[slug] ?? {};
    const matched = cardByNameDate.get(`${t.name}|${t.date}`);
    if (matched) matchedCards.add(matched);
    tournaments.push(entry(slug, {
      name: t.name, nendo, no: t.no, kind: KIND.main, event: t.event, date: t.date, label: t.label, place: t.place,
      spare_date: t.spareDate ?? '', spare_venue: t.spareVenue ?? '', spare_note: t.spareNote ?? '', due: t.due ?? '',
      state: STATE[t.status], reg: REG[t.reg],
      host: notes.host ?? '', note: notes.note ?? '', link_label: notes.link?.label ?? '', link_url: notes.link?.url ?? '',
      ...cardFields(cardBySlug.get(slug) ?? cardByNameDate.get(`${t.name}|${t.date}`), t.event),
      materials: [], winners: winnersRows(slug), legacy_materials: ev?.sections ?? {},
    }));
  }
}

// 協会が要項や結果を預かっている大会
for (const ev of EVENTS.filter((e) => !e.no)) {
  const x = EXTRA[ev.slug];
  if (!x) throw new Error(`${ev.slug} の日程・会場が EXTRA に無い`);
  used.add(ev.slug);
  tournaments.push(entry(ev.slug, {
    name: x.name, nendo: ev.nendo, no: '', kind: KIND.extra, event: x.event, date: x.date, label: x.label, place: x.place,
    spare_date: x.spareDate ?? '', spare_venue: x.spareVenue ?? '', spare_note: x.spareNote ?? '', due: x.due ?? '',
    state: STATE[x.status], reg: REG[x.reg],
    host: x.host ?? '', note: x.note ?? '', link_label: x.link?.label ?? '', link_url: x.link?.url ?? '',
    ...cardFields(cardBySlug.get(ev.slug), x.event),
    materials: [], winners: winnersRows(ev.slug), legacy_materials: ev.sections ?? {},
  }));
}

// トップのカードにだけ出る大会（一覧にもページにも出ない）
const CARD_STATE = { past: STATE.done, live: STATE.live, closed: STATE.closed, soon: STATE.soon, open: STATE.open };
CARDS.filter((c) => !c.slug && !matchedCards.has(c)).forEach((c, i) => {
  const date = c.date.replace(/\./g, '-');
  const slug = `r${reiwa(date.slice(0, 4))}-card-${i + 1}`;
  used.add(slug);
  tournaments.push(entry(slug, {
    name: c.title, nendo: String(Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 3 ? 1 : 0)), no: '', kind: KIND.other,
    event: c.event, date, label: '', place: c.venue,
    spare_date: '', spare_venue: '', spare_note: '', due: '', state: CARD_STATE[c.status], reg: REG.free,
    host: '', note: '', link_label: '', link_url: c.href ?? '',
    ...cardFields(c, c.event), materials: [], winners: [], legacy_materials: {},
  }));
});

for (const c of CARDS) if (c.slug && !used.has(c.slug)) throw new Error(`tournaments.json の ${c.slug} に対応する大会が無い`);

const news = NEWS.map((n, i) => entry(`${n.date.replace(/\./g, '')}-${String(NEWS.length - i).padStart(2, '0')}`, {
  title: n.title, date: n.date.replace(/\./g, '-'), category: CATEGORY[n.category], href: n.href, important: !!n.important,
}));

const event_info = EVENT_INFO.map((e, i) => entry(e.slug, {
  title: e.title, date: e.date, when: e.when, place: e.place, lead: e.lead,
  image_alt: e.imageAlt, image_path: e.image, href: e.href, badge: e.badge, order: (i + 1) * 10,
}));

const seed = {
  $schema: 'https://emdashcms.com/seed.schema.json',
  version: '1',
  meta: { name: '鳥取市テニス協会', description: '鳥取市テニス協会 公式サイトの内容モデルと移行時の内容', author: '鳥取市テニス協会' },
  settings: { title: '鳥取市テニス協会', tagline: 'つなぐ、広がる、テニスの輪。', timezone: 'Asia/Tokyo' },
  blockTypes,
  collections,
  content: { news, tournaments, event_info },
};

writeFileSync(new URL('../seed/seed.json', import.meta.url), JSON.stringify(seed, null, '\t') + '\n');
console.log(`seed/seed.json: news ${news.length} / tournaments ${tournaments.length} / event_info ${event_info.length}`);
