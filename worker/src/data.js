// サイトのデータ（src/data/*.json）の置き場所と、下書きへの変更の当て方。
//
// 下書き（draft）は KV に1つだけ持つ。中身は「変更後のファイル」と「追加する画像・PDF」。
//   {
//     editedAt, editor,
//     files: { 'src/data/news.json': <JSON>, ... }   変更したファイルだけ
//     uploads: [{ id, path, kind, kb }]              追加するファイル（本体は upload:<id>）
//     log: ['お知らせを投稿：…', ...]                公開時のコミット文に使う
//   }
// 編集者は少人数なので、下書きは協会で1つを共有する。

export const FILES = {
  news: 'src/data/news.json',
  schedule: 'src/data/schedule.json',
  tournaments: 'src/data/tournaments.json',
  events: 'src/data/events.json',
  winners: 'src/data/winners.json',
};

export const DRAFT_KEY = 'draft';
export const HISTORY_KEY = 'publishes';

export const emptyDraft = (editor) => ({ editedAt: Date.now(), editor, files: {}, uploads: [], log: [] });

export async function loadDraft(env) {
  return (await env.DRAFTS.get(DRAFT_KEY, 'json')) || null;
}

export async function saveDraft(env, draft, editor, logLine) {
  draft.editedAt = Date.now();
  draft.editor = editor;
  if (logLine) draft.log.push(logLine);
  await env.DRAFTS.put(DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

/** 公開ずみ（GitHub main）のデータを全部読む */
export async function loadPublished(repo) {
  const out = { shas: {} };
  for (const [key, path] of Object.entries(FILES)) {
    const r = await repo.readJson(path);
    out[key] = r?.data ?? (key === 'events' ? { events: [] } : key === 'schedule' ? {} : key === 'winners' ? {} : []);
    out.shas[key] = r?.sha ?? null;
  }
  return out;
}

/** 下書きがあればそれを重ねた「いま編集中の姿」 */
export function withDraft(published, draft) {
  const data = { ...published };
  if (draft) {
    for (const [key, path] of Object.entries(FILES)) {
      if (draft.files[path]) data[key] = draft.files[path];
    }
  }
  return data;
}

/* ---------- 入力の確かめ ---------- */

const CATEGORIES = new Set(['tournament', 'result', 'junior', 'info']);
const STATUS = new Set(['done', 'closed', 'open', 'soon']);

export function validateNewsItem(n) {
  const e = [];
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(n.date || '')) e.push('日付は 2026.10.08 の形で入れてください');
  if (!CATEGORIES.has(n.category)) e.push('分類が正しくありません');
  if (!n.title || n.title.length > 80) e.push('タイトルは1〜80文字で入れてください');
  if (!n.href || /^https?:/.test(n.href) || n.href.includes('..')) e.push('リンク先はサイト内のページ（例：event-r8-enetopia.html）を入れてください');
  return e;
}

export function validateStatus(status) {
  return STATUS.has(status) ? [] : ['状態が正しくありません'];
}

/** 大会一覧（schedule）の状態を、トップの大会カード（tournaments）の status にも映す */
export const CARD_STATUS = { done: 'past', closed: 'closed', open: 'open', soon: 'soon' };

/** ファイル名に使える形にする（日本語はそのまま、記号と空白だけ落とす） */
export const safeName = (s) => String(s).replace(/[\\/:*?"<>|#%&{}$!'`@+=\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'file';
