// EmDash から内容を読み、ページが使う形に組み立てる入口。
//
// 公開ページはリクエストごとに描くので、1 リクエストの中では 1 回だけ EmDash を読み、
// 結果を Astro.locals に貯めて使い回す（ページ・レイアウト・部品のどこから呼んでも同じ）。
// 返すものの形は移行前の src/data/*.js と同じにしてあり、各ページは
//   const { NEWS, SCHEDULE, EVENTS, CARDS, ... } = await siteData(Astro);
// と受け取る。
import { getEmDashCollection, getSiteSettingsWithCacheHint } from 'emdash';
import { buildNews, secondsToNextNewChange } from '../data/news.js';
import { buildSchedule, secondsToNextSwitch } from '../data/schedule.js';
import { buildEvents } from '../data/events.js';
import { buildCards } from '../data/tournaments.js';
import { buildEventInfo } from '../data/eventinfo.js';
import { buildSocial } from '../data/social.js';
import { EXTRA_TOURNAMENTS } from '../data/official-extra.js';

/** 秒数のうち小さいほう（null は無いものとして扱う） */
const minSeconds = (...xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined);
  return v.length ? Math.min(...v) : null;
};

/** コレクションを全件読む（1 ページ 100 件までなので、続きがあれば読み足す）。 */
async function readAll(collection, options = {}) {
  const rows = [];
  const hints = [];
  let cursor;
  do {
    const r = await getEmDashCollection(collection, { limit: 100, cursor, ...options });
    if (r.error) throw r.error;
    rows.push(...r.entries.map((e) => ({ slug: e.id, ...e.data })));
    if (r.cacheHint) hints.push(r.cacheHint);
    cursor = r.nextCursor;
  } while (cursor);
  return { rows, hints };
}

async function load(locals) {
  const [news, tournaments, eventInfo, settings] = await Promise.all([
    readAll('news', { orderBy: { date: 'desc' } }),
    readAll('tournaments', { orderBy: { date: 'asc' } }),
    readAll('event_info', { orderBy: { order: 'asc' } }),
    getSiteSettingsWithCacheHint(), // サイト設定（SNS のアカウント名など）
  ]);
  // アップロードした PDF の URL は、保存先の鍵から EmDash に引いてもらう
  const mediaUrl = (key) => locals.emdash?.getPublicMediaUrl?.(key) ?? null;

  // 管理画面にまだ無い大会（official-extra.js の EXTRA_TOURNAMENTS）を足す。同じ slug が管理画面にあればそちらを使う
  const have = new Set(tournaments.rows.map((t) => t.slug));
  tournaments.rows.push(...EXTRA_TOURNAMENTS.filter((t) => !have.has(t.slug)));
  tournaments.rows.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  const schedule = buildSchedule(tournaments.rows);
  const events = buildEvents(tournaments.rows, schedule, mediaUrl);
  const cards = buildCards(tournaments.rows, { ...schedule, ...events });
  const newsData = buildNews(news.rows);
  return {
    ...newsData,
    ...schedule,
    ...events,
    ...cards,
    ...buildEventInfo(eventInfo.rows),
    ...buildSocial(settings.data?.social),
    // 大会の状態（開催中・終了・受付終了）か、お知らせの NEW が次に切り替わるまでの秒数。ページの保存をその時刻で切らす（siteData）
    switchIn: minSeconds(secondsToNextSwitch(tournaments.rows), secondsToNextNewChange(newsData.NEWS)),
    loadedAt: Date.now(),
    hints: [...news.hints, ...tournaments.hints, ...eventInfo.hints, ...(settings.cacheHint ? [settings.cacheHint] : [])],
  };
}

/**
 * 内容をまとめて受け取る。同じリクエストの 2 回目からは貯めたものを返す。
 * あわせて、公開時にキャッシュが消えるよう EmDash のタグをこのページに付ける。
 */
export async function siteData(Astro) {
  const locals = Astro.locals;
  if (!locals.__tcta) locals.__tcta = load(locals);
  const data = await locals.__tcta;
  if (Astro.cache?.enabled) {
    for (const h of data.hints) Astro.cache.set(h);
    // 公開ページは1日保存する（astro.config.mjs の routeRules）。そのままだと開催日の 9:00 に「開催中」、18:00 に「終了」へ
    // 変わったことが最大1日出ないので、次に状態が切り替わる時刻（読んだ時点から数えた秒数）で保存を切らし、古いものも返さない（swr 0）
    const left = data.switchIn === null ? null : data.switchIn - Math.floor((Date.now() - data.loadedAt) / 1000);
    const maxAge = Astro.cache.options.maxAge;
    if (left !== null && maxAge !== undefined && left < maxAge) Astro.cache.set({ maxAge: Math.max(30, left), swr: 0 });
  }
  return data;
}
