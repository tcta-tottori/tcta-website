// 大会当日の結果速報（大会運営システムの観戦ページ）の行き先。
// 運営の端末は、HP 掲載用の固定の部屋（TCTA01。tournament/src/features/sync/syncStore.ts の PUBLIC_ROOM）で「インターネット公開を開始」しておく。
// 使うところ：大会ページの「結果速報」の欄（LiveResultBox.astro）と、開催中の大会の「速報」のボタン（event-buttons.js）。
export const LIVE_ROOM = 'TCTA01';
export const LIVE_VIEW = 'https://tcta-tournament.tcta-admin-worker.workers.dev/view';
/** ドロー・結果速報のページ */
export const LIVE_DRAW_URL = `${LIVE_VIEW}/draw?room=${LIVE_ROOM}`;
/** 対戦順・進み具合のページ */
export const LIVE_ORDER_URL = `${LIVE_VIEW}/order?room=${LIVE_ROOM}`;

/** 大会運営システム（公開のリーグの組み合わせ /api/public/leagues/<大会> を、リーグ戦の順位計算のページが読む） */
export const TOURNAMENT_APP = 'https://tcta-tournament.tcta-admin-worker.workers.dev';

/**
 * サイトの大会の slug と、大会運営システムのデータベースの大会 id が違うもの（運営システムの id は年間日程の取り込みで決まった）。
 * 順位計算・リーグ表・審判用紙が、運営システムの公開の組み合わせ（/api/public/leagues/<id>）を読むときに使う
 */
export const CATALOG_IDS = {
  'r8-no18': 'r8-kensen-doubles', // 鳥取県テニス選手権 ダブルス
};
/** サイトの slug → 運営システムの大会 id */
export const catalogIdOf = (slug) => CATALOG_IDS[slug] ?? slug;
