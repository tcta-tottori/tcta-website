// Instagram のストーリーズ告知の元になるお知らせ（GET /api/stories.json）。
// 大会運営システム（tournament/）の「Instagram」の画面がこれを読み、告知画像を自動で作って、役員が確かめてから投稿する
// （tournament/worker/insta.ts・src/features/insta/）。
//
// 返すのは、見た時点から STORY_DAYS 日以内のお知らせのうち、要項・受付開始／ドロー／結果のもの（新しい順）。
// 1件ごとに、行き先の大会ページの情報（大会名・日程・会場・締切・種目）と、画像に使う写真・資料の URL を添える：
//   結果 … 種目ごとの優勝者の写真（説明つき）と成績
//   ドロー・要項 … ドロー・要項の画像の1枚目（当日の写真があればそれも）
// 中身はどれも公開ページに出ているものだけ。鍵は要らない。
import type { APIRoute } from 'astro';
import { siteData } from '../../lib/cms.js';
import { eventResultLayout } from '../../data/event-result.js';

export const prerender = false;

/** 何日前までのお知らせを出すか */
const STORY_DAYS = 30;
/** ストーリーズを作るお知らせの種類（news.js の newsKind） */
const STORY_KINDS = new Set(['outline', 'draw', 'result']);

type Img = { src: string; w?: number; h?: number; label?: string | null };

export const GET: APIRoute = async (Astro) => {
  const data = await siteData(Astro);
  const origin = String(Astro.site ?? Astro.url.origin).replace(/\/$/, '');
  const abs = (src: string | null | undefined) => (src ? new URL(src, `${origin}/`).href : null);
  const since = new Date(Date.now() - STORY_DAYS * 86400000 + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '.');
  const bySlug = new Map<string, any>(data.EVENTS.map((e: any) => [e.slug, e]));

  const items = data.NEWS
    .filter((n: any) => STORY_KINDS.has(n.kind) && n.date >= since)
    .map((n: any) => {
      const slug = String(n.href).match(/^(?:event|draw|outline|result)-([a-z0-9-]+)\.html/)?.[1] ?? null;
      const e = slug ? bySlug.get(slug) : null;
      const section = (key: string) => e?.sections?.find((s: any) => s.key === key);
      const firstImage = (key: string): Img | null => section(key)?.images?.[0] ?? null;
      let photos: { src: string | null; category: string; caption: string | null }[] = [];
      if (n.kind === 'result' && e) {
        const layout = eventResultLayout(e);
        for (const b of layout?.blocks ?? []) {
          if (!b.photos.length) continue;
          const champ = b.photos.find((p: any) => /^(総合)?優勝/.test(p.caption ?? '')) ?? b.photos[0];
          photos.push({ src: abs(champ.src), category: b.label || '', caption: champ.caption ?? null });
        }
      }
      const sheetKey = n.kind === 'draw' ? 'draw' : n.kind === 'outline' ? 'outline' : 'result';
      const sheet = firstImage(sheetKey);
      return {
        key: n.slug || `${n.date}|${n.title}`,
        kind: n.kind,
        date: n.date.replace(/\./g, '-'),
        title: n.title,
        url: abs(n.href),
        event: e
          ? {
              slug: e.slug,
              name: e.name,
              nendoLabel: e.nendoLabel,
              date: e.date,
              label: e.label,
              place: e.place,
              event: e.event,
              due: e.due,
              spareDate: e.spareDate,
              spareNote: e.spareNote,
              status: e.status,
            }
          : null,
        winners: e?.winners ?? [],
        photos,
        sheet: sheet ? { src: abs(sheet.src), w: sheet.w, h: sheet.h } : null,
        cover: abs(e?.cover ?? null),
      };
    });

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
