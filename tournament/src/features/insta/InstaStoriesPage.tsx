/**
 * Instagram のストーリーズ告知（設定 → Instagram）。
 * 協会サイトで要項・受付開始／ドロー／結果のお知らせを公開すると、ここに並び、告知画像（1080×1920）が自動でできる。
 * 役員が画像を確かめてから「ストーリーズに出す」を押すと投稿される（worker/insta.ts）。
 * 投稿の鍵（IG_USER_ID・IG_ACCESS_TOKEN）が未設定のあいだは「画像を保存」で手で投稿する。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Send, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { drawStory, loadStoryAssets, storyJpeg, type StoryItem } from './storyCanvas';

type Posted = { media_id: string; posted_at: string; posted_by: string } | null;
type Item = StoryItem & { posted: Posted };

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
    </div>
  );
}

/** Instagram の鍵（アクセストークン）を入れる・外す */
function TokenBox({ configured, account, onChange }: { configured: boolean; account: { username: string; fromDb: boolean } | null; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const send = async (method: 'POST' | 'DELETE') => {
    if (method === 'DELETE' && !window.confirm('Instagram の鍵を外します。投稿のボタンが使えなくなります。よろしいですか？')) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/insta/token', {
        method, credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ token }) : undefined,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setToken(''); setOpen(false);
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
          <p>@{account.username || '（名前不明）'} の鍵が入っています。鍵は 7 日ごとに自動で新しくします（60 日のあいだにこの画面を一度も開かないと切れます）。</p>
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
