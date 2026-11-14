// Instagram のストーリーズ告知（協会サイトのお知らせから作った画像を、役員が確かめてから投稿する）。
//
//   GET  /api/insta/stories      … 協会サイトの /api/stories.json（要項・受付開始／ドロー／結果のお知らせ）に、投稿ずみかを足して返す（役員だけ）
//   GET  /api/insta/proxy?u=…    … 協会サイトの画像を、この Worker 経由で返す（画面の canvas に描くため。協会サイトの画像だけ。役員だけ）
//   POST /api/insta/post         … 画面で作った JPEG を受け取り、Instagram にストーリーズとして投稿する（役員だけ・このサイトの画面からだけ）
//   GET  /api/insta/img/<id>.jpg … 投稿する画像（Instagram がこの URL を読みに来るので、ログインなしで返す。推測できない id）
//   POST /api/insta/token        … Instagram の鍵（アクセストークン）を入れる。{ token, userId? } を確かめて D1 に置く（役員だけ・このサイトの画面からだけ）
//                                  IG… の鍵（Instagram ログイン）も EAA… の鍵（Facebook 方式・Unified login）も受ける（resolveAccount）
//   DELETE /api/insta/token      … 鍵を外す
//
// 投稿は Instagram API のコンテンツ公開（ストーリーズ。Instagram ログイン。instagram_business_content_publish の権限）。
// 鍵は画面（設定 → Instagram）から入れ、D1 の insta_meta に置く（パソコンで wrangler を使わなくても入れられるように）。
// Worker の秘密（IG_USER_ID・IG_ACCESS_TOKEN・IG_GRAPH_HOST）に入れてもよい（画面で入れた鍵が優先）。
// Instagram ログインの長期の鍵は 60 日で切れるので、画面を開いたときに、前に新しくしてから 7 日たっていれば新しくする（refresh_access_token）。
// 鍵が無いあいだは投稿のボタンは使えず、画面で画像を保存して手で投稿する。
//
// 投稿の流れ：画像を D1 に置く → /{IG_USER_ID}/media（media_type=STORIES, image_url）でコンテナを作る
// → 状態が FINISHED になるのを待つ → /{IG_USER_ID}/media_publish で公開 → 投稿ずみとして記録（同じお知らせを二重に出さない）。

import { officerOf, sameOrigin } from './auth';
import type { Env } from './index';

const SITE = 'https://tottori-city-tennis.com';
const GRAPH_VERSION = 'v24.0';
/** 受け取る画像の大きさの上限（JPEG） */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let schemaReady: Promise<unknown> | null = null;
function ensureSchema(db: D1Database): Promise<unknown> {
  schemaReady ??= db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS insta_images (
      id TEXT PRIMARY KEY,
      story_key TEXT NOT NULL,
      jpeg BLOB NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS insta_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS insta_posts (
      story_key TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      image_id TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      posted_by TEXT NOT NULL
    )`),
  ]).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

export async function handleInsta(request: Request, env: Env, url: URL): Promise<Response> {
  const db = env.DATA;
  if (!db) return json({ error: 'データベース（D1）がつながっていません' }, 500);

  // Instagram が読みに来る画像（ログインなし）
  const img = url.pathname.match(/^\/api\/insta\/img\/([a-f0-9]{32})\.jpg$/);
  if (img) {
    await ensureSchema(db);
    const row = await db.prepare('SELECT jpeg FROM insta_images WHERE id = ?').bind(img[1]).first<{ jpeg: ArrayBuffer }>();
    if (!row) return new Response('not found', { status: 404 });
    return new Response(row.jpeg, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
  }

  const officer = await officerOf(request, env, url);
  if (!officer) return json({ error: '役員ログインが必要です' }, 401);
  await ensureSchema(db);

  if (url.pathname === '/api/insta/token') {
    if (!sameOrigin(request, url)) return json({ error: 'このサイトの画面からだけ使えます' }, 403);
    if (request.method === 'DELETE') {
      await db.prepare(`DELETE FROM insta_meta WHERE k IN ('token', 'user_id', 'username', 'host', 'refreshed_at')`).run();
      return json({ ok: true });
    }
    if (request.method !== 'POST') return json({ error: 'POST で呼んでください' }, 405);
    const body = await request.json<{ token?: string; userId?: string }>().catch(() => ({} as { token?: string; userId?: string }));
    const token = String(body.token ?? '').trim();
    const givenId = String(body.userId ?? '').replace(/\D/g, '');
    if (!/^[A-Za-z0-9_\-.|]{20,1000}$/.test(token)) return json({ error: '鍵（アクセストークン）の形が違います' }, 400);
    const found = await resolveAccount(token, givenId);
    if ('error' in found) return json({ error: found.error, needUserId: found.needUserId ?? false }, 400);
    await saveMeta(db, { token, user_id: found.userId, username: found.username, host: found.host, refreshed_at: new Date().toISOString() });
    return json({ ok: true, username: found.username });
  }

  const creds = await credsOf(env, db);
  const configured = !!creds;

  if (url.pathname === '/api/insta/stories' && request.method === 'GET') {
    if (creds?.fromDb) await refreshIfOld(db, creds).catch(() => { /* 次に開いたときにまた試す */ });
    const res = await fetch(`${SITE}/api/stories.json`, { headers: { accept: 'application/json' } });
    if (!res.ok) return json({ error: `協会サイトのお知らせを読めませんでした（${res.status}）` }, 502);
    const data = await res.json<{ items: { key: string }[] }>();
    const posted = await db.prepare('SELECT story_key, media_id, posted_at, posted_by FROM insta_posts').all<{ story_key: string; media_id: string; posted_at: string; posted_by: string }>();
    const byKey = new Map(posted.results.map((p) => [p.story_key, p]));
    return json({
      configured,
      account: creds ? { username: creds.username, fromDb: creds.fromDb } : null,
      items: data.items.map((it) => ({ ...it, posted: byKey.get(it.key) ?? null })),
    });
  }

  if (url.pathname === '/api/insta/proxy' && request.method === 'GET') {
    const u = url.searchParams.get('u') ?? '';
    let target: URL;
    try { target = new URL(u); } catch { return json({ error: 'u が不正です' }, 400); }
    if (target.origin !== SITE) return json({ error: '協会サイトの画像だけ読めます' }, 400);
    const res = await fetch(target.href);
    if (!res.ok) return new Response('not found', { status: 404 });
    const type = res.headers.get('content-type') ?? '';
    if (!/^image\//.test(type)) return json({ error: '画像ではありません' }, 400);
    return new Response(res.body, { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' } });
  }

  if (url.pathname === '/api/insta/post' && request.method === 'POST') {
    if (!sameOrigin(request, url)) return json({ error: 'このサイトの画面からだけ投稿できます' }, 403);
    if (!configured) return json({ error: 'Instagram の鍵が未設定です。画面の「Instagram の鍵」で入れるか、画像を保存して手で投稿してください' }, 409);
    const key = (url.searchParams.get('key') ?? '').slice(0, 300);
    if (!key) return json({ error: 'key がありません' }, 400);
    if (request.headers.get('content-type') !== 'image/jpeg') return json({ error: 'JPEG で送ってください' }, 415);
    const already = await db.prepare('SELECT media_id FROM insta_posts WHERE story_key = ?').bind(key).first();
    if (already && url.searchParams.get('again') !== '1') return json({ error: 'このお知らせはもう投稿しています' }, 409);
    const jpeg = await request.arrayBuffer();
    if (jpeg.byteLength === 0 || jpeg.byteLength > MAX_IMAGE_BYTES) return json({ error: '画像の大きさが不正です' }, 413);

    const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await db.prepare('INSERT INTO insta_images (id, story_key, jpeg, created_at) VALUES (?, ?, ?, ?)').bind(id, key, jpeg, new Date().toISOString()).run();
    const imageUrl = `${url.origin}/api/insta/img/${id}.jpg`;

    try {
      const mediaId = await publishStory(creds!, imageUrl);
      await db.prepare(`INSERT INTO insta_posts (story_key, media_id, image_id, posted_at, posted_by) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(story_key) DO UPDATE SET media_id = excluded.media_id, image_id = excluded.image_id, posted_at = excluded.posted_at, posted_by = excluded.posted_by`)
        .bind(key, mediaId, id, new Date().toISOString(), officer.email).run();
      return json({ ok: true, mediaId });
    } catch (e) {
      return json({ error: `Instagram への投稿に失敗しました：${(e as Error).message}` }, 502);
    }
  }

  return json({ error: 'not found' }, 404);
}

type Found = { userId: string; username: string; host: string } | { error: string; needUserId?: boolean };

/** Graph API の返事（使う項目だけ） */
type GraphBody = {
  id?: string; user_id?: string; username?: string; name?: string;
  error?: { message?: string };
  data?: { instagram_business_account?: { id?: string; username?: string } }[];
};
async function getJson(u: string): Promise<{ ok: boolean; body: GraphBody }> {
  const res = await fetch(u);
  const body: GraphBody = await res.json<GraphBody>().catch(() => ({}));
  return { ok: res.ok && !body.error, body };
}

/**
 * 鍵から、投稿する Instagram のアカウント（ID と名前）と、問い合わせ先を調べる。
 *   IG… で始まる鍵（Instagram ログイン）… graph.instagram.com の /me
 *   EAA… で始まる鍵（Facebook 方式・Unified login）… graph.facebook.com で
 *     ① /me が Instagram のアカウントを返せばそれ、② つないだ Facebook ページの Instagram アカウント、
 *     ③ 画面で入れたアカウント ID（開発者ページの一覧に出ている 1784… の数字）を、この鍵で読めるか確かめる
 */
async function resolveAccount(token: string, givenId: string): Promise<Found> {
  const t = encodeURIComponent(token);
  const ig = `https://graph.instagram.com/${GRAPH_VERSION}`;
  const fb = `https://graph.facebook.com/${GRAPH_VERSION}`;
  if (!/^EAA/.test(token)) {
    const me = await getJson(`${ig}/me?fields=user_id,username&access_token=${t}`);
    if (me.ok && (me.body.user_id || me.body.id)) return { userId: String(me.body.user_id ?? me.body.id), username: String(me.body.username ?? ''), host: 'graph.instagram.com' };
    if (!givenId) return { error: `Instagram でこの鍵を確かめられませんでした：${me.body.error?.message ?? '不明'}` };
  }
  if (givenId) {
    const acc = await getJson(`${fb}/${givenId}?fields=id,username&access_token=${t}`);
    if (acc.ok && acc.body.id) return { userId: String(acc.body.id), username: String(acc.body.username ?? ''), host: 'graph.facebook.com' };
    const acc2 = await getJson(`${ig}/${givenId}?fields=id,username&access_token=${t}`);
    if (acc2.ok && acc2.body.id) return { userId: String(acc2.body.id), username: String(acc2.body.username ?? ''), host: 'graph.instagram.com' };
    return { error: `アカウント ID ${givenId} をこの鍵で読めませんでした：${acc.body.error?.message ?? acc2.body.error?.message ?? '不明'}`, needUserId: true };
  }
  const me = await getJson(`${fb}/me?fields=id,username,name&access_token=${t}`);
  if (me.ok && me.body.username && me.body.id) return { userId: String(me.body.id), username: String(me.body.username), host: 'graph.facebook.com' };
  const pages = await getJson(`${fb}/me/accounts?fields=instagram_business_account{id,username}&access_token=${t}`);
  const linked = (pages.body.data ?? []).map((p) => p.instagram_business_account).find((a) => a?.id);
  if (linked?.id) return { userId: String(linked.id), username: String(linked.username ?? ''), host: 'graph.facebook.com' };
  if (!me.ok) return { error: `この鍵を確かめられませんでした：${me.body.error?.message ?? '不明'}` };
  return { error: 'この鍵から Instagram のアカウントが分かりませんでした。開発者ページの一覧で tottori.city.tennis の下に出ている数字（1784… のアカウント ID）を、下の欄に入れてください', needUserId: true };
}

type Creds = { token: string; userId: string; username: string; host: string; refreshedAt: string; fromDb: boolean };

/** 投稿に使う鍵。画面で入れたもの（D1）が優先、無ければ Worker の秘密 */
async function credsOf(env: Env, db: D1Database): Promise<Creds | null> {
  const rows = await db.prepare('SELECT k, v FROM insta_meta').all<{ k: string; v: string }>();
  const m = new Map(rows.results.map((r) => [r.k, r.v]));
  if (m.get('token') && m.get('user_id')) {
    return { token: m.get('token')!, userId: m.get('user_id')!, username: m.get('username') ?? '', host: m.get('host') || 'graph.instagram.com', refreshedAt: m.get('refreshed_at') ?? '', fromDb: true };
  }
  if (env.IG_USER_ID && env.IG_ACCESS_TOKEN) {
    return { token: env.IG_ACCESS_TOKEN, userId: env.IG_USER_ID, username: '', host: env.IG_GRAPH_HOST || 'graph.instagram.com', refreshedAt: '', fromDb: false };
  }
  return null;
}

async function saveMeta(db: D1Database, values: Record<string, string>) {
  const now = new Date().toISOString();
  await db.batch(Object.entries(values).map(([k, v]) =>
    db.prepare('INSERT INTO insta_meta (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at').bind(k, v, now)));
}

/** 長期の鍵は 60 日で切れるので、前に新しくしてから 7 日たっていれば新しくする（Instagram ログインの鍵だけ） */
async function refreshIfOld(db: D1Database, creds: Creds) {
  if (creds.host !== 'graph.instagram.com') return; // Facebook 方式の鍵（EAA…）はここでは新しくできない
  const last = Date.parse(creds.refreshedAt || '') || 0;
  if (Date.now() - last < 7 * 86400000) return;
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(creds.token)}`);
  const body = await res.json<{ access_token?: string }>().catch(() => ({} as { access_token?: string }));
  if (!res.ok || !body.access_token) return;
  await saveMeta(db, { token: body.access_token, refreshed_at: new Date().toISOString() });
}

/** ストーリーズを1枚公開して、公開した投稿の ID を返す */
async function publishStory(creds: Creds, imageUrl: string): Promise<string> {
  const host = creds.host;
  const base = `https://${host}/${GRAPH_VERSION}/${creds.userId}`;
  const token = creds.token;
  const call = async (u: string, init?: RequestInit) => {
    const res = await fetch(u, init);
    const body = await res.json<{ id?: string; status_code?: string; error?: { message?: string } }>().catch(() => ({} as { id?: string; status_code?: string; error?: { message?: string } }));
    if (!res.ok || body.error) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    return body;
  };
  const form = (o: Record<string, string>) => ({ method: 'POST', body: new URLSearchParams({ ...o, access_token: token }) });

  const container = await call(`${base}/media`, form({ media_type: 'STORIES', image_url: imageUrl }));
  // 画像の取り込みが終わるのを待つ（ふつうは数秒）
  for (let i = 0; i < 15; i++) {
    const st = await call(`https://${host}/${GRAPH_VERSION}/${String(container.id)}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error(`画像の取り込みに失敗しました（${st.status_code}）`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const published = await call(`${base}/media_publish`, form({ creation_id: String(container.id) }));
  return String(published.id);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
