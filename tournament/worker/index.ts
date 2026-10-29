// 大会運営システム（Cloudflare 版）の Worker。
//
//   /ws?room=<ルームコード>&role=operator|viewer
//                             … 端末どうしの同期と観戦配信の WebSocket。ルームごとに Durable Object（SyncRoom）1 つ。
//                               運営端末（operator）は役員ログインが要る。観戦端末（viewer）は誰でも
//   /auth/login・/auth/logout … 役員ログイン（Cloudflare Access。worker/auth.ts）
//   /api/me                   … ログイン中の役員（運営画面が最初に確かめる）
//   /api/gemini-status        … 音声コール（Gemini TTS）が使えるか
//   /api/gemini-tts           … 音声コールの生成（役員だけ。API キーは Worker の secret。ブラウザには渡さない）
//   /api/health               … 動作確認
//   それ以外                  … アプリ本体（dist/ の静的ファイル。SPA なので未知の URL は index.html）
//
// 静的ファイルは Worker を通さずに配信される（wrangler.jsonc の run_worker_first）。
// Worker が動くのは上の /ws と /api/* だけなので、Free プランの 1 日 10 万リクエストをほとんど使わない。
//
// GitHub Pages 版が使っていた Render の中継サーバー（sync-server/server.mjs）と同じ約束事
// （join / leave / broadcast / cache / ping）をそのまま受けるので、アプリ側の同期処理は変えていない。

import { handleAuth, handleMe, officerOf, sameOrigin } from './auth';

export { SyncRoom } from './sync-room';

export interface Env {
  ASSETS: Fetcher;
  SYNC_ROOM: DurableObjectNamespace;
  /** Gemini の API キー（wrangler secret put GEMINI_API_KEY）。無ければ音声コールはブラウザ内蔵の声だけ */
  GEMINI_API_KEY?: string;
  /** 既定の TTS モデル */
  GEMINI_TTS_MODEL?: string;
  /** 役員ログイン（worker/auth.ts）。Zero Trust のチーム名と、/auth のアプリケーションの AUD */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** 任意。役員のメールアドレス（カンマ区切り）。Access を通っても、ここに無い人は断る */
  OFFICER_EMAILS?: string;
  /** 手元の確認だけ 'dev'（localhost のときだけ効く） */
  AUTH_MODE?: string;
}

const ROOM_RE = /^[A-Za-z0-9_-]{1,40}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return json({ error: 'WebSocket で接続してください' }, 426);
      }
      const room = url.searchParams.get('room') ?? '';
      if (!ROOM_RE.test(room)) return json({ error: 'room が不正です' }, 400);
      // 運営端末として入るには役員ログインが要る（大会データを流せるのは運営端末だけ）
      const role = url.searchParams.get('role') === 'viewer' ? 'viewer' : 'operator';
      if (role === 'operator') {
        if (!sameOrigin(request, url)) return json({ error: 'このサイトの画面からだけ接続できます' }, 403);
        if (!(await officerOf(request, env, url))) return json({ error: '役員ログインが必要です' }, 401);
      }
      // 役割は Worker が決めて Durable Object に渡す（クライアントの申告は使わない）
      const headers = new Headers(request.headers);
      headers.set('X-Sync-Role', role);
      const stub = env.SYNC_ROOM.get(env.SYNC_ROOM.idFromName(room));
      return stub.fetch(new Request(request, { headers }));
    }

    if (url.pathname === '/auth/login' || url.pathname === '/auth/logout') {
      return handleAuth(request, env, url);
    }

    if (url.pathname === '/api/me') {
      return handleMe(request, env, url);
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, gemini: !!env.GEMINI_API_KEY });
    }

    if (url.pathname === '/api/gemini-status' || url.pathname === '/api/gemini-tts/status') {
      return json({ available: !!env.GEMINI_API_KEY, model: env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL });
    }

    if (url.pathname === '/api/gemini-tts') {
      if (request.method !== 'POST') return json({ error: 'POST で呼んでください' }, 405);
      if (!sameOrigin(request, url)) return json({ error: 'このサイトの画面からだけ使えます' }, 403);
      if (!(await officerOf(request, env, url))) return json({ error: '役員ログインが必要です' }, 401);
      return geminiTts(request, env);
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);

    // run_worker_first の対象外はここに来ないが、念のため静的ファイルに渡す
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ---------------------------------------------------------------------------
// Gemini TTS（sync-server/server.mjs の handleGeminiTts と同じ入出力）
// ---------------------------------------------------------------------------

const DEFAULT_TTS_MODEL = 'gemini-3.1-flash-preview-tts';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
/** コール 1 回分として十分な長さ。これより長い文は受けない（キーの使い過ぎを防ぐ） */
const MAX_TEXT = 600;

async function geminiTts(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) {
    return json({ error: 'GEMINI_API_KEY が未設定です。wrangler secret put GEMINI_API_KEY で設定してください。' }, 503);
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const text = String(body.text ?? '').trim();
  if (!text) return json({ error: 'text is required' }, 400);
  if (text.length > MAX_TEXT) return json({ error: `text は ${MAX_TEXT} 文字までです` }, 413);

  const voiceName = String(body.voiceName || 'Kore');
  const model = String(body.model || env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL);
  if (!/^[a-z0-9.-]{1,80}$/.test(model)) return json({ error: 'model が不正です' }, 400);
  const style = body.styleInstruction ? String(body.styleInstruction).slice(0, 300) : '';
  const promptText = style ? `${style}: ${text}` : text;
  // 生成ごとに声色・口調が変わらないよう温度を固定する（クライアントから指定可）
  const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.15;

  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const post = (withTemperature: boolean) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          ...(withTemperature ? { temperature } : {}),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      }),
    });

  try {
    let res = await post(true);
    // temperature を受け付けないモデルでは 400 になるため、その場合のみ外して再試行
    if (!res.ok && res.status === 400) res = await post(false);
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      return json({ error: `Gemini API error: ${res.status}`, detail }, res.status);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: InlineData; inline_data?: InlineData }[] } }[];
    };
    const part = data.candidates?.[0]?.content?.parts?.[0];
    const inline = part?.inlineData ?? part?.inline_data;
    if (!inline?.data) return json({ error: 'audio data not returned' }, 502);
    const pcm = base64ToBytes(inline.data);
    const rate = Number((inline.mimeType ?? inline.mime_type ?? '').match(/rate=(\d+)/)?.[1] ?? 24000);
    const wav = pcmToWav(pcm, rate);
    return new Response(wav, {
      headers: { 'Content-Type': 'audio/wav', 'X-Gemini-Model': model, 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return json({ error: 'upstream fetch failed', detail: String(err) }, 502);
  }
}

interface InlineData { data?: string; mimeType?: string; mime_type?: string }

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 16-bit / mono PCM を WAV（RIFF）で包む */
function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}
