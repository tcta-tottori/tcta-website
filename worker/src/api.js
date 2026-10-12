// 管理アプリが呼ぶ API。すべて /api/ の下。
//
//   POST   /api/login            {name, password}
//   POST   /api/logout
//   GET    /api/me
//   GET    /api/data             公開ずみのデータに下書きを重ねたもの
//   PUT    /api/draft/news       お知らせの全件（並びごと）
//   POST   /api/draft/news-image multipart: file, id, w, h  お知らせの写真（保存はお知らせと一緒に）
//   PUT    /api/draft/schedule   {nendo, no, status, due, spareNote}
//   POST   /api/draft/event      {nendo, no, slug}  大会ページを新しく作る
//   POST   /api/draft/upload     multipart: file, slug, section, label, w, h
//   DELETE /api/draft/upload/:id
//   GET    /api/draft/upload/:id 下書き中の画像の中身（プレビュー用）
//   PUT    /api/draft/winners/:slug  {categories}
//   PUT    /api/draft/event/:slug/order {section, srcs}   画像の並べ替え・削除
//   DELETE /api/draft            下書きを捨てる
//   POST   /api/publish          {message}
//   GET    /api/publish/:sha     公開（GitHub Actions）の進み具合
//   GET    /api/history          公開の履歴
//   POST   /api/revert           {sha}
//
// 書き込みはすべてログイン必須。Origin も確かめる（他サイトからのフォーム送信を弾く）。

import { login, logoutCookie, currentEditor } from './auth.js';
import {
  FILES, DRAFT_KEY, HISTORY_KEY, emptyDraft, loadDraft, saveDraft, loadPublished, withDraft,
  validateNewsItem, validateStatus, CARD_STATUS, safeName, NEWS_ID,
} from './data.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const fail = (message, status = 400) => json({ error: message }, status);

export async function handleApi(request, env, repo) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');
  const method = request.method;

  if (method !== 'GET' && method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return fail('不正な送信元です', 403);
  }

  if (path === '/login' && method === 'POST') {
    try {
      const { name, password } = await request.json().catch(() => ({}));
      const cookie = await login(env, String(name || '').trim(), String(password || ''), url.protocol === 'https:');
      if (!cookie) return fail('名前かパスワードが違います', 401);
      return json({ name, site: env.SITE_URL }, 200, { 'Set-Cookie': cookie });
    } catch (err) {
      console.error(err);
      return fail(`ログインの処理に失敗しました：${err.message}`, 500);
    }
  }
  if (path === '/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': logoutCookie(url.protocol === 'https:') });
  }

  const editor = await currentEditor(env, request);
  if (path === '/me') return editor ? json({ name: editor, site: env.SITE_URL }) : fail('ログインしていません', 401);
  if (!editor) return fail('ログインしていません', 401);

  const author = { name: editor, email: env.COMMIT_EMAIL || 'admin@example.com' };

  try {
    if (path === '/data' && method === 'GET') {
      const published = await loadPublished(repo);
      const draft = await loadDraft(env);
      const data = withDraft(published, draft);
      return json({
        ...data,
        draft: draft ? { editedAt: draft.editedAt, editor: draft.editor, log: draft.log, uploads: draft.uploads, changed: Object.keys(draft.files) } : null,
      });
    }

    if (path === '/draft' && method === 'DELETE') {
      const draft = await loadDraft(env);
      if (draft) for (const u of draft.uploads) await env.DRAFTS.delete(`upload:${u.id}`);
      await env.DRAFTS.delete(DRAFT_KEY);
      return json({ ok: true });
    }

    if (path === '/draft/news' && method === 'PUT') {
      const body = await request.json();
      if (!Array.isArray(body.items)) return fail('形式が違います');
      const items = body.items.map(cleanNewsItem);
      for (const n of items) { const e = validateNewsItem(n); if (e.length) return fail(e.join('／')); }
      const pages = new Set(items.filter((n) => n.body || n.images).map((n) => n.href));
      const dead = items.find((n) => /^news-/.test(n.href) && !pages.has(n.href));
      if (dead) return fail(`「${dead.title}」のリンク先のお知らせページがありません。リンク先を選ぶか、本文を書いてください`);
      const ids = items.filter((n) => n.id).map((n) => n.id);
      if (new Set(ids).size !== ids.length) return fail('同じ id のお知らせが2つあります');
      items.sort((a, b) => b.date.localeCompare(a.date));
      const draft = (await loadDraft(env)) || emptyDraft(editor);
      draft.files[FILES.news] = items;
      // 外した写真：下書き中のものはアップロードごと捨て、公開ずみのものはファイルを消す
      const used = new Set(items.flatMap((n) => (n.images || []).map((im) => 'public/' + im.src)));
      const published = await loadPublished(repo);
      draft.deletes = (draft.deletes || []).filter((p) => !p.startsWith('public/assets/img/news/') || !used.has(p));
      for (const p of published.news.flatMap((n) => (n.images || []).map((im) => 'public/' + im.src))) {
        if (!used.has(p) && !draft.deletes.includes(p)) draft.deletes.push(p);
      }
      await dropUnusedNewsUploads(env, draft, used);
      await saveDraft(env, draft, editor, body.log || 'お知らせを更新');
      return json({ ok: true });
    }

    if (path === '/draft/news-image' && method === 'POST') {
      // 写真だけ先に下書きへ置く。お知らせ本体に載るのは「下書きに保存」のとき。
      const form = await request.formData();
      const file = form.get('file');
      const id = String(form.get('id') || '');
      if (!(file instanceof File)) return fail('ファイルがありません');
      if (!NEWS_ID.test(id)) return fail('お知らせの指定が違います');
      if (!/^image\/(webp|jpeg|png)$/.test(file.type)) return fail('画像（WebP/JPEG/PNG）を選んでください');
      if (file.size > 20 * 1024 * 1024) return fail('20MB までにしてください');
      const draft = (await loadDraft(env)) || emptyDraft(editor);
      const data = withDraft(await loadPublished(repo), draft);
      const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
      const dir = `assets/img/news/${id}/`;
      const taken = new Set([
        ...data.news.flatMap((n) => (n.images || []).map((im) => im.src)),
        ...draft.uploads.map((u) => u.path.replace(/^public\//, '')),
      ].filter((s) => s.startsWith(dir)).map((s) => s.slice(dir.length).replace(/\.\w+$/, '')));
      let n = 1;
      while (taken.has(`photo-${String(n).padStart(2, '0')}`)) n++;
      const src = `${dir}photo-${String(n).padStart(2, '0')}.${ext}`;
      const upId = crypto.randomUUID();
      await env.DRAFTS.put(`upload:${upId}`, await file.arrayBuffer(), { metadata: { type: file.type } });
      draft.uploads.push({ id: upId, path: 'public/' + src, kind: 'image', kb: Math.round(file.size / 1024), newsId: id });
      draft.deletes = (draft.deletes || []).filter((p) => p !== 'public/' + src);
      await saveDraft(env, draft, editor, null);
      return json({ ok: true, item: { src, w: Number(form.get('w')) || 0, h: Number(form.get('h')) || 0 } });
    }

    if (path === '/draft/schedule' && method === 'PUT') {
      const { nendo, no, status, due, spareNote } = await request.json();
      const e = validateStatus(status); if (e.length) return fail(e.join('／'));
      const draft = (await loadDraft(env)) || emptyDraft(editor);
      const published = await loadPublished(repo);
      const data = withDraft(published, draft);
      const schedule = structuredClone(data.schedule);
      const row = (schedule[nendo] || []).find((t) => t.no === no);
      if (!row) return fail('その大会が見つかりません', 404);
      row.status = status;
      if (typeof due === 'string') row.due = due.trim() || row.due;
      if (typeof spareNote === 'string') row.spareNote = spareNote.trim();
      draft.files[FILES.schedule] = schedule;
      // トップの大会カードにも同じ状態を映す（日付で突き合わせる）
      const cards = structuredClone(data.tournaments);
      const card = cards.find((c) => c.date === row.date.replace(/-/g, '.'));
      if (card && card.status !== 'live') { card.status = CARD_STATUS[status]; draft.files[FILES.tournaments] = cards; }
      await saveDraft(env, draft, editor, `${row.name}（${row.event}）の状態を「${status}」に`);
      return json({ ok: true });
    }

    if (path === '/draft/event' && method === 'POST') {
      // 大会一覧（schedule）にはあるが、まだページ（events.json）の無い大会にページを作る
      const { nendo, no, slug } = await request.json().catch(() => ({}));
      if (!/^[a-z0-9-]{3,40}$/.test(slug || '')) return fail('ページの名前（slug）は英小文字・数字・ハイフンで入れてください');
      const draft = (await loadDraft(env)) || emptyDraft(editor);
      const data = withDraft(await loadPublished(repo), draft);
      const row = (data.schedule[nendo] || []).find((t) => t.no === no);
      if (!row) return fail('その大会が見つかりません', 404);
      const events = structuredClone(data.events);
      if (events.events.some((e) => e.slug === slug)) return fail('その名前のページはすでにあります');
      if (events.events.some((e) => e.nendo === nendo && e.no === no)) return fail('その大会のページはすでにあります');
      events.events.push({ slug, nendo, no, sections: {} });
      draft.files[FILES.events] = events;
      const cards = structuredClone(data.tournaments);
      const card = cards.find((c) => c.date === row.date.replace(/-/g, '.'));
      if (card && !card.slug) { card.slug = slug; draft.files[FILES.tournaments] = cards; }
      await saveDraft(env, draft, editor, `${row.name}（${row.event}）のページを作成`);
      return json({ ok: true, slug });
    }

    if (path === '/draft/upload' && method === 'POST') {
      const form = await request.formData();
      const file = form.get('file');
      const slug = String(form.get('slug') || '');
      const section = String(form.get('section') || '');
      const label = String(form.get('label') || '').trim();
      if (!(file instanceof File)) return fail('ファイルがありません');
      if (!/^[a-z0-9-]+$/.test(slug)) return fail('大会の指定が違います');
      if (!['outline', 'entry', 'draw', 'result', 'photo'].includes(section)) return fail('置き場所の指定が違います');
      if (file.size > 20 * 1024 * 1024) return fail('20MB までにしてください');
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const isImg = /^image\/(webp|jpeg|png)$/.test(file.type);
      if (!isPdf && !isImg) return fail('画像（WebP/JPEG/PNG）か PDF を選んでください');

      const draft = (await loadDraft(env)) || emptyDraft(editor);
      const published = await loadPublished(repo);
      const data = withDraft(published, draft);
      const events = structuredClone(data.events);
      const ev = events.events.find((x) => x.slug === slug);
      if (!ev) return fail('その大会のページがまだありません', 404);
      ev.sections[section] ??= { images: [], pdfs: [] };
      const sec = ev.sections[section];

      const id = crypto.randomUUID();
      let item, repoPath;
      if (isPdf) {
        repoPath = `public/assets/pdf/events/${slug}/${safeName(file.name.replace(/\.pdf$/i, ''))}.pdf`;
        item = { src: repoPath.replace(/^public\//, ''), label: label || file.name.replace(/\.pdf$/i, ''), kb: Math.round(file.size / 1024) };
        sec.pdfs.push(item);
      } else {
        const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
        const used = new Set(sec.images.map((im) => im.src));
        let n = sec.images.length + 1;
        while (used.has(`assets/img/events/${slug}/${section}-${String(n).padStart(2, '0')}.${ext}`)) n++;
        repoPath = `public/assets/img/events/${slug}/${section}-${String(n).padStart(2, '0')}.${ext}`;
        item = { src: repoPath.replace(/^public\//, ''), label: label || `${sec.images.length + 1}枚目`, w: Number(form.get('w')) || 0, h: Number(form.get('h')) || 0 };
        sec.images.push(item);
      }
      await env.DRAFTS.put(`upload:${id}`, await file.arrayBuffer(), { metadata: { type: file.type } });
      draft.uploads.push({ id, path: repoPath, kind: isPdf ? 'pdf' : 'image', kb: Math.round(file.size / 1024), slug, section });
      draft.files[FILES.events] = events;
      await saveDraft(env, draft, editor, `${slug} の${SECTION_LABEL[section]}に${isPdf ? 'PDF' : '画像'}を追加`);
      return json({ ok: true, id, item });
    }

    let m;
    if ((m = path.match(/^\/draft\/upload\/([0-9a-f-]+)$/)) && method === 'GET') {
      const { value, metadata } = await env.DRAFTS.getWithMetadata(`upload:${m[1]}`, 'arrayBuffer');
      if (!value) return fail('見つかりません', 404);
      return new Response(value, { headers: { 'Content-Type': metadata?.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' } });
    }
    if ((m = path.match(/^\/draft\/upload\/([0-9a-f-]+)$/)) && method === 'DELETE') {
      const draft = await loadDraft(env);
      const up = draft?.uploads.find((u) => u.id === m[1]);
      if (!up) return fail('見つかりません', 404);
      const events = draft.files[FILES.events];
      const sec = events.events.find((x) => x.slug === up.slug)?.sections[up.section];
      const src = up.path.replace(/^public\//, '');
      if (sec) { sec.images = sec.images.filter((i) => i.src !== src); sec.pdfs = sec.pdfs.filter((p) => p.src !== src); }
      draft.uploads = draft.uploads.filter((u) => u.id !== up.id);
      await env.DRAFTS.delete(`upload:${up.id}`);
      await saveDraft(env, draft, editor, null);
      return json({ ok: true });
    }

    if ((m = path.match(/^\/draft\/event\/([a-z0-9-]+)\/order$/)) && method === 'PUT') {
      const { section, srcs } = await request.json();
      if (!Array.isArray(srcs)) return fail('形式が違います');
      const draft = (await loadDraft(env)) || emptyDraft(editor);
      const data = withDraft(await loadPublished(repo), draft);
      const events = structuredClone(data.events);
      const sec = events.events.find((x) => x.slug === m[1])?.sections[section];
      if (!sec) return fail('見つかりません', 404);
      const bySrc = new Map(sec.images.map((i) => [i.src, i]));
      const kept = srcs.map((s) => bySrc.get(s)).filter(Boolean);
      const removed = sec.images.filter((i) => !srcs.includes(i.src));
      sec.images = kept;
      // 公開ずみの画像を外したときは、ファイルも消す（下書き中のものは upload の削除で消える）
      draft.deletes ??= [];
      for (const r of removed) {
        const up = draft.uploads.find((u) => u.path.replace(/^public\//, '') === r.src);
        if (up) { draft.uploads = draft.uploads.filter((u) => u.id !== up.id); await env.DRAFTS.delete(`upload:${up.id}`); }
        else draft.deletes.push(`public/${r.src}`);
      }
      draft.files[FILES.events] = events;
      await saveDraft(env, draft, editor, removed.length ? `${m[1]} の${SECTION_LABEL[section]}から画像を${removed.length}枚外す` : null);
      return json({ ok: true });
    }

    if ((m = path.match(/^\/draft\/winners\/([a-z0-9-]+)$/)) && method === 'PUT') {
      const { categories } = await request.json();
      if (!Array.isArray(categories)) return fail('形式が違います');
      const clean = categories
        .map((c) => ({
          category: String(c.category || '').trim(),
          places: (c.places || []).map((p) => ({ award: String(p.award || '').trim(), name: String(p.name || '').trim() })).filter((p) => p.name),
        }))
        .filter((c) => c.category && c.places.length);
      const draft = (await loadDraft(env)) || emptyDraft(editor);
      const data = withDraft(await loadPublished(repo), draft);
      const winners = structuredClone(data.winners);
      if (clean.length) winners[m[1]] = { ...(winners[m[1]] || {}), categories: clean };
      else delete winners[m[1]];
      draft.files[FILES.winners] = winners;
      await saveDraft(env, draft, editor, `${m[1]} の成績（優勝・準優勝）を更新`);
      return json({ ok: true });
    }

    if (path === '/publish' && method === 'POST') {
      const { message } = await request.json().catch(() => ({}));
      const draft = await loadDraft(env);
      if (!draft || (!Object.keys(draft.files).length && !draft.uploads.length)) return fail('公開する変更がありません');
      // お知らせに載らなかった写真（追加したが保存しなかったもの）は公開しない
      const news = withDraft(await loadPublished(repo), draft).news;
      await dropUnusedNewsUploads(env, draft, new Set(news.flatMap((n) => (n.images || []).map((im) => 'public/' + im.src))));
      const files = [];
      for (const [p, content] of Object.entries(draft.files)) files.push({ path: p, text: JSON.stringify(content, null, 2) + '\n' });
      for (const u of draft.uploads) {
        const buf = await env.DRAFTS.get(`upload:${u.id}`, 'arrayBuffer');
        if (!buf) return fail(`アップロードした ${u.path} が見つかりません。もう一度追加してください`);
        files.push({ path: u.path, base64: toBase64(buf) });
      }
      for (const p of draft.deletes || []) files.push({ path: p, delete: true });
      const summary = String(message || '').trim() || draft.log[0] || 'サイトを更新';
      const body = [summary, '', ...draft.log.map((l) => `- ${l}`), '', `（管理アプリから ${editor} が公開）`].join('\n');
      const sha = await repo.commit({ message: body, author, files });
      const history = (await env.DRAFTS.get(HISTORY_KEY, 'json')) || [];
      history.unshift({ sha, at: Date.now(), editor, summary, log: draft.log, files: files.map((f) => f.path) });
      await env.DRAFTS.put(HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
      for (const u of draft.uploads) await env.DRAFTS.delete(`upload:${u.id}`);
      await env.DRAFTS.delete(DRAFT_KEY);
      return json({ ok: true, sha });
    }

    if ((m = path.match(/^\/publish\/([0-9a-f]{7,40})$/)) && method === 'GET') {
      return json(await repo.deployStatus(m[1]));
    }

    if (path === '/history' && method === 'GET') {
      return json({ items: (await env.DRAFTS.get(HISTORY_KEY, 'json')) || [] });
    }

    if (path === '/revert' && method === 'POST') {
      const { sha } = await request.json().catch(() => ({}));
      const history = (await env.DRAFTS.get(HISTORY_KEY, 'json')) || [];
      const target = history.find((h) => h.sha === sha);
      if (!target) return fail('その公開は履歴にありません', 404);
      if (target.reverted) return fail('すでに戻しています');
      const newSha = await repo.revert({ sha, author, message: `「${target.summary}」を取り消す\n\n（管理アプリから ${editor} が元に戻した）` });
      target.reverted = newSha;
      history.unshift({ sha: newSha, at: Date.now(), editor, summary: `「${target.summary}」を取り消し`, log: [], files: target.files, isRevert: true });
      await env.DRAFTS.put(HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
      return json({ ok: true, sha: newSha });
    }

    return fail('見つかりません', 404);
  } catch (err) {
    console.error(err);
    return fail(`処理に失敗しました：${err.message}`, 500);
  }
}

/** お知らせ1件を、保存してよい項目だけにする */
function cleanNewsItem(n) {
  const body = String(n.body || '').replace(/\r\n?/g, '\n').trim();
  const images = Array.isArray(n.images)
    ? n.images.map((im) => ({ src: String(im.src || ''), w: Number(im.w) || 0, h: Number(im.h) || 0 }))
    : [];
  const link = String(n.link || '').trim();
  // 本文か写真があれば専用ページ（news-<id>.html）を作り、一覧からはそこへ飛ばす
  const hasPage = n.id && (body || images.length);
  return {
    date: n.date, category: n.category, title: String(n.title || '').trim(),
    href: hasPage ? `news-${n.id}.html` : String(n.href || '').trim(),
    ...(n.important ? { important: true } : {}),
    ...(n.id ? { id: String(n.id) } : {}),
    ...(body ? { body } : {}),
    ...(images.length ? { images } : {}),
    ...(hasPage && link ? { link } : {}),
  };
}

/** お知らせ用にアップロードしたが、どのお知らせにも載っていない写真を下書きから捨てる */
async function dropUnusedNewsUploads(env, draft, used) {
  const drop = draft.uploads.filter((u) => u.newsId && !used.has(u.path));
  for (const u of drop) await env.DRAFTS.delete(`upload:${u.id}`);
  draft.uploads = draft.uploads.filter((u) => !drop.includes(u));
}

const SECTION_LABEL = { outline: '要項', entry: '申込用紙', draw: 'ドロー', result: '結果', photo: '写真' };

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
