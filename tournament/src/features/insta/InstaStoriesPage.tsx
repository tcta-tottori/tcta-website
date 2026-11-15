/**
 * Instagram のストーリーズ告知（設定 → Instagram）。
 * 協会サイトで要項・受付開始／ドロー／結果のお知らせを公開すると、ここに並び、告知画像（1080×1920）が自動でできる。
 * 役員が画像を確かめてから「ストーリーズに出す」を押すと投稿される（worker/insta.ts）。
 * 投稿の鍵（IG_USER_ID・IG_ACCESS_TOKEN）が未設定のあいだは「画像を保存」で手で投稿する。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Send, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { drawFeed, drawSlide, drawStory, feedCaption, feedPlan, feedSources, loadImage, loadStoryAssets, storyJpeg, storySlides, type StoryItem } from './storyCanvas';

type Posted = { media_id: string; posted_at: string; posted_by: string } | null;
type Item = StoryItem & { posted: Posted; postedSlides?: { key: string; posted_at: string }[] };

const KIND_LABEL: Record<StoryItem['kind'], string> = { outline: '要項・受付開始', draw: 'ドロー', result: '結果' };

export default function InstaStoriesPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [configured, setConfigured] = useState(false);
  const [account, setAccount] = useState<{ username: string; fromDb: boolean } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/insta/stories', { credentials: 'same-origin', cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setConfigured(!!body.configured);
      setAccount(body.account ?? null);
      setItems(body.items);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }, []);

  useEffect(() => { void document.fonts?.load('700 40px "Noto Sans JP"').finally(load); }, [load]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="bg-white rounded border border-gray-200 p-4 text-sm text-gray-700 space-y-2">
        <p>
          協会サイトで <b>要項・受付開始／ドロー／結果</b> のお知らせを公開すると、ここに並び、ストーリーズの告知画像が自動でできます（30日以内のもの）。
          画像を確かめてから「ストーリーズに出す」を押してください。押すとすぐフォロワーに届き、取り消せません。
        </p>
        {configured ? (
          <p className="flex items-center gap-1 text-green-700"><CheckCircle2 className="w-4 h-4" />Instagram{account?.username ? `（@${account.username}）` : ''}への投稿の準備ができています。</p>
        ) : (
          <p className="flex items-start gap-1 text-amber-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            Instagram の鍵がまだ入っていないため、投稿のボタンは使えません。下の「Instagram の鍵」で入れるか、「画像を保存」で保存して Instagram のアプリから手で投稿してください。
          </p>
        )}
        <TokenBox configured={configured} account={account} onChange={() => { setItems(null); void load(); }} />
        <button type="button" onClick={() => { setItems(null); void load(); }} className="inline-flex items-center gap-1 text-primary-700 hover:underline">
          <RefreshCw className="w-4 h-4" />読み直す
        </button>
      </div>

      {error && <p className="text-sm text-red-700">読み込めませんでした：{error}</p>}
      {items === null && <p className="text-sm text-gray-500">お知らせを読み込んでいます…</p>}
      {items && items.length === 0 && !error && <p className="text-sm text-gray-500">30日以内に、ストーリーズにするお知らせはありません。</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items?.map((it) => <StoryCard key={it.key} item={it} configured={configured} onPosted={load} />)}
      </div>

      {/* 結果は、決勝の結果表 → 入賞者の写真を 1 枚ずつ大きくした続きのストーリーズも作る */}
      {items?.filter((it) => storySlides(it).length > 0).map((it) => (
        <SlideSeries key={`${it.key}-slides`} item={it} configured={configured} onPosted={load} />
      ))}
    </div>
  );
}

/** Instagram の鍵（アクセストークン）を入れる・外す */
function TokenBox({ configured, account, onChange }: { configured: boolean; account: { username: string; fromDb: boolean } | null; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [userId, setUserId] = useState('');
  const [needId, setNeedId] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const send = async (method: 'POST' | 'DELETE') => {
    if (method === 'DELETE' && !window.confirm('Instagram の鍵を外します。投稿のボタンが使えなくなります。よろしいですか？')) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/insta/token', {
        method, credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ token, userId }) : undefined,
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.needUserId) setNeedId(true);
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setToken(''); setUserId(''); setNeedId(false); setOpen(false);
      onChange();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="border-t border-gray-100 pt-2">
      <summary className="cursor-pointer font-bold text-gray-700">Instagram の鍵</summary>
      <div className="mt-2 space-y-2">
        {configured && account?.fromDb && (
          <p>@{account.username || '（名前不明）'} の鍵が入っています。鍵が切れたら（投稿のときに「鍵が無効」と出たら）、開発者ページでトークンを作り直して入れ直してください。</p>
        )}
        {configured && account && !account.fromDb && <p>Worker の秘密に鍵が入っています。</p>}
        <p className="text-xs text-gray-500">
          Meta の開発者向けページ（Instagram API・Instagram ログイン）で @tottori.city.tennis のアクセストークンを作り、ここに貼ってください。
          作り方は大会運営システムの README の「Instagram のストーリーズ告知」にあります。鍵はこのシステムのデータベースにだけ置き、画面には出しません。
        </p>
        <div className="flex gap-2">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="アクセストークンを貼る" autoComplete="off"
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm" />
          <button type="button" disabled={busy || token.trim().length < 20} onClick={() => send('POST')}
            className="px-3 py-1.5 text-xs font-bold text-white bg-primary-600 rounded disabled:opacity-40">{busy ? '確かめています…' : '入れる'}</button>
        </div>
        {(needId || userId) && (
          <div className="space-y-1">
            <p className="text-xs text-gray-600">
              Instagram のアカウント ID：開発者ページの「API setup with Unified login」の一覧で、tottori.city.tennis の名前の下に出ている数字（1784… で始まる）です。
            </p>
            <input inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="例 17841…（数字）"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
          </div>
        )}
        {configured && account?.fromDb && (
          <button type="button" disabled={busy} onClick={() => send('DELETE')} className="text-xs text-red-700 hover:underline">鍵を外す</button>
        )}
        {msg && <p className="text-xs text-red-700">{msg}</p>}
      </div>
    </details>
  );
}

function StoryCard({ item, configured, onPosted }: { item: Item; configured: boolean; onPosted: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    void loadStoryAssets(item).then((assets) => {
      if (!alive || !canvasRef.current) return;
      drawStory(canvasRef.current, item, assets);
      setReady(true);
    });
    return () => { alive = false; };
  }, [item]);

  const save = async () => {
    if (!canvasRef.current) return;
    const blob = await storyJpeg(canvasRef.current);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ストーリーズ_${item.event?.name ?? 'お知らせ'}_${KIND_LABEL[item.kind]}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const post = async () => {
    if (!canvasRef.current) return;
    const again = !!item.posted;
    if (!window.confirm(`${again ? 'もう一度' : ''}この画像を Instagram のストーリーズに出します。すぐフォロワーに届き、取り消せません。よろしいですか？`)) return;
    setBusy(true); setMsg('');
    try {
      const blob = await storyJpeg(canvasRef.current);
      const res = await fetch(`/api/insta/post?key=${encodeURIComponent(item.key)}${again ? '&again=1' : ''}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/jpeg' }, body: blob,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setMsg('ストーリーズに出しました');
      onPosted();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col">
      <div className="bg-gray-100 flex justify-center p-3">
        <canvas ref={canvasRef} className="w-[216px] h-[384px] bg-white shadow" aria-label={`${item.title} のストーリーズ画像`} />
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white bg-primary-600 px-2 py-0.5 rounded-sm">{KIND_LABEL[item.kind]}</span>
          <span className="text-xs text-gray-500">{item.date.replace(/-/g, '.')}</span>
        </div>
        <p className="font-bold text-gray-800 leading-snug">{item.title}</p>
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-primary-700 inline-flex items-center gap-1 hover:underline">
            サイトのページ<ExternalLink className="w-3 h-3" />
          </a>
        )}
        {item.posted && (
          <p className="text-xs text-green-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {new Date(item.posted.posted_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} にストーリーズに出しました
          </p>
        )}
        {msg && <p className={`text-xs ${/出しました/.test(msg) ? 'text-green-700' : 'text-red-700'}`}>{msg}</p>}
        <div className="mt-auto flex gap-2">
          <button type="button" disabled={!ready} onClick={save} className="flex-1 inline-flex items-center justify-center gap-1 py-2 text-xs font-bold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
            <Download className="w-4 h-4" />画像を保存
          </button>
          <button type="button" disabled={!ready || !configured || busy} onClick={post} className="flex-1 inline-flex items-center justify-center gap-1 py-2 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-40">
            <Send className="w-4 h-4" />{busy ? '投稿中…' : item.posted ? 'もう一度出す' : 'ストーリーズに出す'}
          </button>
        </div>
      </div>
    </div>
  );
}


/**
 * 結果の続き。
 *   フィードの投稿（カルーセル・4:5・10 枚まで）… 表紙（大会名・開催日・会場・「大会結果」）→ トーナメントごとに「結果表 → 優勝者の写真」（feedPlan）
 *   ストーリーズ（9:16）                     … 決勝の結果表 → 入賞者の写真を 1 枚ずつ（key#番号 で記録）
 */
function SlideSeries({ item, configured, onPosted }: { item: Item; configured: boolean; onPosted: () => void }) {
  const [fmt, setFmt] = useState<'feed' | 'story'>('feed');
  const tab = (v: 'feed' | 'story', label: string) => (
    <button type="button" onClick={() => setFmt(v)}
      className={`px-3 py-1.5 text-xs font-bold border ${fmt === v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}>{label}</button>
  );
  return (
    <div className="bg-white rounded border border-gray-200 p-3 space-y-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-white bg-primary-600 px-2 py-0.5 rounded-sm">結果・決勝の表と入賞者の写真</span>
        <span className="font-bold text-gray-800">{item.event?.name ?? item.title}</span>
      </div>
      <div className="flex">{tab('feed', 'フィードの投稿（カルーセル）')}{tab('story', 'ストーリーズ')}</div>
      {fmt === 'feed' ? <FeedSeries item={item} configured={configured} onPosted={onPosted} /> : <StorySeries item={item} configured={configured} onPosted={onPosted} />}
    </div>
  );
}

function saveCanvases(canvases: (HTMLCanvasElement | null)[], name: (i: number) => string) {
  return (async () => {
    for (let k = 0; k < canvases.length; k++) {
      const c = canvases[k];
      if (!c) continue;
      const blob = await storyJpeg(c);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name(k);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
}

/** フィードの投稿：表紙 → トーナメントごとに結果表と優勝者の写真（10 枚まで） */
function FeedSeries({ item, configured, onPosted }: { item: Item; configured: boolean; onPosted: () => void }) {
  const plan = feedPlan(item);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [caption, setCaption] = useState(() => feedCaption(item));
  const feedKey = `${item.key}#feed`;
  const feedPosted = (item.postedSlides ?? []).find((p) => p.key === feedKey) ?? null;

  useEffect(() => {
    let alive = true;
    setReady(false);
    void (async () => {
      const logo = await loadImage('/logo-tcta.png', false);
      const srcs = feedSources(item, plan);
      const loaded = await Promise.all(srcs.map((s) => loadImage(s)));
      if (!alive) return;
      const imgs = new Map(srcs.map((s, i) => [s, loaded[i]]));
      plan.forEach((s, i) => { const c = refs.current[i]; if (c) drawFeed(c, item, s, imgs, logo, i + 1, plan.length); });
      setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const label = (i: number) => {
    const s = plan[i];
    return s.type === 'cover' ? '表紙' : s.type === 'sheet' ? s.label : s.type === 'sheets2' ? s.items.map((x) => x.label).join('／') : (s.caption ?? '写真');
  };

  const post = async () => {
    const again = !!feedPosted;
    if (!window.confirm(`${again ? 'もう一度' : ''}この ${plan.length} 枚を、1 つの投稿（カルーセル）として Instagram のフィードに出します。すぐフォロワーに届きます。よろしいですか？`)) return;
    setBusy(true); setMsg('投稿しています…（1 分ほどかかることがあります）');
    try {
      const fd = new FormData();
      fd.append('caption', caption);
      for (let i = 0; i < plan.length; i++) {
        const c = refs.current[i];
        if (c) fd.append('image', await storyJpeg(c), `${i + 1}.jpg`);
      }
      const res = await fetch(`/api/insta/carousel?key=${encodeURIComponent(feedKey)}${again ? '&again=1' : ''}`, { method: 'POST', credentials: 'same-origin', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setMsg('フィードに投稿しました');
      onPosted();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-xs text-gray-500">
        表紙（大会名・開催日・会場）→ トーナメントごとに結果表と優勝者の写真の順で、1 つの投稿にまとめます（{plan.length} 枚。Instagram は 10 枚まで）。
        {feedPosted ? `　${new Date(feedPosted.posted_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} に投稿しました。` : ''}
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {plan.map((_, i) => (
          <div key={i} className="shrink-0 flex flex-col items-center gap-1 w-[176px]">
            <canvas ref={(el) => { refs.current[i] = el; }} className="w-[176px] h-[220px] bg-white shadow border border-gray-100" aria-label={`${i + 1} 枚目 ${label(i)}`} />
            <span className="text-[11px] text-gray-600 text-center leading-tight line-clamp-2">{i + 1}. {label(i)}</span>
          </div>
        ))}
      </div>
      <label className="block">
        <span className="text-xs font-bold text-gray-700">投稿の本文</span>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={10} maxLength={2200}
          className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-xs leading-relaxed" />
      </label>
      {msg && <p className={`text-xs ${/しました$|投稿しています/.test(msg) ? 'text-green-700' : 'text-red-700'}`}>{msg}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!ready} onClick={() => void saveCanvases(refs.current.slice(0, plan.length), (k) => `投稿_${item.event?.name ?? 'お知らせ'}_結果_${String(k + 1).padStart(2, '0')}.jpg`)}
          className="flex-1 inline-flex items-center justify-center gap-1 py-2 text-xs font-bold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
          <Download className="w-4 h-4" />画像を保存
        </button>
        <button type="button" disabled={!ready || !configured || busy || plan.length < 2} onClick={() => void post()}
          className="flex-1 inline-flex items-center justify-center gap-1 py-2 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-40">
          <Send className="w-4 h-4" />{busy ? '投稿中…' : feedPosted ? 'もう一度フィードに投稿' : 'フィードに投稿'}
        </button>
      </div>
    </>
  );
}

/** ストーリーズ：決勝の結果表 → 入賞者の写真を 1 枚ずつ */
function StorySeries({ item, configured, onPosted }: { item: Item; configured: boolean; onPosted: () => void }) {
  const slides = storySlides(item);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const slideKey = (i: number) => `${item.key}#${String(i + 1).padStart(2, '0')}`;
  const postedKeys = new Set((item.postedSlides ?? []).map((p) => p.key));
  const postedCount = slides.filter((_, i) => postedKeys.has(slideKey(i))).length;

  useEffect(() => {
    let alive = true;
    setReady(false);
    void (async () => {
      const logo = await loadImage('/logo-tcta.png', false);
      const imgs = await Promise.all(slides.map((s) => loadImage(s.src)));
      if (!alive) return;
      slides.forEach((s, i) => { const c = refs.current[i]; if (c) drawSlide(c, item, s, imgs[i], logo, i + 1, slides.length, 'story'); });
      setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const postAll = async () => {
    const todo = slides.map((_, i) => i).filter((i) => !postedKeys.has(slideKey(i)));
    if (todo.length === 0) { setMsg('すべて出しています'); return; }
    if (!window.confirm(`決勝の結果表・入賞者の写真 ${todo.length} 枚を、この並びの順にストーリーズに出します。すぐフォロワーに届き、取り消せません。よろしいですか？`)) return;
    setBusy(true); setMsg('');
    let done = 0;
    try {
      for (const i of todo) {
        setMsg(`${done + 1} / ${todo.length} 枚目を出しています…`);
        const c = refs.current[i];
        if (!c) continue;
        const res = await fetch(`/api/insta/post?key=${encodeURIComponent(slideKey(i))}`, {
          method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/jpeg' }, body: await storyJpeg(c),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(`${i + 1} 枚目：${body.error || `HTTP ${res.status}`}`);
        done++;
      }
      setMsg(`${done} 枚をストーリーズに出しました`);
    } catch (e) {
      setMsg(`${(e as Error).message}（${done} 枚は出しました。もう一度押すと、残りから出します）`);
    } finally {
      setBusy(false);
      onPosted();
    }
  };

  return (
    <>
      <p className="text-xs text-gray-500">決勝の結果表 → 入賞者の写真を 1 枚ずつ、並びの順にストーリーズに出します（{slides.length} 枚）。{postedCount > 0 ? `${postedCount} 枚は出しました。` : ''}</p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {slides.map((s, i) => (
          <div key={i} className="shrink-0 flex flex-col items-center gap-1">
            <canvas ref={(el) => { refs.current[i] = el; }} className="w-[162px] h-[288px] bg-white shadow border border-gray-100" aria-label={`${i + 1} 枚目 ${s.type === 'sheet' ? s.label : s.caption ?? ''}`} />
            <span className={`text-[11px] ${postedKeys.has(slideKey(i)) ? 'text-green-700' : 'text-gray-500'}`}>
              {i + 1}. {s.type === 'sheet' ? '決勝の表' : (s.caption ?? '写真').split(/\s/)[0]}{postedKeys.has(slideKey(i)) ? '（出しました）' : ''}
            </span>
          </div>
        ))}
      </div>
      {msg && <p className={`text-xs ${/しました$|出しています/.test(msg) && !/：/.test(msg) ? 'text-green-700' : 'text-red-700'}`}>{msg}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!ready} onClick={() => void saveCanvases(refs.current.slice(0, slides.length), (k) => `ストーリーズ_${item.event?.name ?? 'お知らせ'}_結果_${String(k + 1).padStart(2, '0')}.jpg`)}
          className="flex-1 inline-flex items-center justify-center gap-1 py-2 text-xs font-bold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
          <Download className="w-4 h-4" />まとめて保存
        </button>
        <button type="button" disabled={!ready || !configured || busy || postedCount === slides.length} onClick={() => void postAll()}
          className="flex-1 inline-flex items-center justify-center gap-1 py-2 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-40">
          <Send className="w-4 h-4" />{busy ? '投稿中…' : postedCount === slides.length ? 'すべて出しました' : postedCount > 0 ? '残りをストーリーズに出す' : 'まとめてストーリーズに出す'}
        </button>
      </div>
    </>
  );
}
