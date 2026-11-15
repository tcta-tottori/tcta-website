// 設定：24 時間パスワード（メールのコードのほかの、役員ログインの入り方）。worker/passAuth.ts
//   ・メールでログインした役員が「発行」を押すと、24 時間だけ使えるパスワードを作る（前のパスワードは使えなくなる）
//   ・発行したパスワードはこの画面に 1 度だけ出す（サーバーにはハッシュしか残らないので、あとから見直せない）
//   ・「取り消す」で、そのパスワードと、それでログインしている端末をすぐ切る
//   ・パスワードでログインした人は、状態を見るだけ（発行・取り消しはできない）
import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, KeyRound, Loader2 } from 'lucide-react';
import { siteConfirm, siteAlert } from '../../components/site/siteConfirm';

interface Status { active: boolean; expiresAt: number | null; createdAt: number | null; createdBy: string | null; sessions: number; canIssue: boolean }

const fmt = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function PassLoginCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ password: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/pass', { cache: 'no-store', credentials: 'same-origin' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStatus(body as Status);
      setError(null);
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'インターネットにつながっていないため確かめられません');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const issue = async () => {
    const ok = await siteConfirm({
      title: '24 時間パスワードを発行',
      message: `24 時間だけ使えるログイン用のパスワードを作ります。${status?.active ? '\n今のパスワードは使えなくなり、それでログインしている端末も切れます。' : ''}\nパスワードを知っている人は、だれでも運営の画面に入れます。渡す相手に気をつけてください。`,
      confirmLabel: '発行する',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/pass', { method: 'POST', credentials: 'same-origin' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setIssued(body);
      await load();
    } catch (e) {
      await siteAlert((e as Error).message, '発行できませんでした');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    const ok = await siteConfirm({
      title: 'パスワードを取り消す',
      message: '今の 24 時間パスワードを使えなくします。それでログインしている端末も、すぐに運営の操作ができなくなります。',
      confirmLabel: '取り消す',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/pass', { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setIssued(null);
      await load();
    } catch (e) {
      await siteAlert((e as Error).message, '取り消せませんでした');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!issued) return;
    try { await navigator.clipboard.writeText(issued.password); } catch { /* コピーできない端末は手で写す */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) return <p className="ps-hint">{error}</p>;
  if (!status) return <p className="ps-hint"><Loader2 className="w-4 h-4 inline animate-spin" /> 確かめています…</p>;

  return (
    <div className="pass-card">
      <div className={`ps-status ${status.active ? 'is-on' : ''}`}>
        <span className="ps-status__text">
          {status.active && status.expiresAt
            ? `使えるパスワードがあります（${fmt(status.expiresAt)} まで・ログイン中 ${status.sessions} 台）`
            : '使えるパスワードはありません'}
        </span>
      </div>
      {status.active && status.createdBy && <p className="ps-hint">発行：{status.createdBy}（{status.createdAt ? fmt(status.createdAt) : ''}）</p>}

      {issued && (
        <div className="pass-card__issued">
          <span className="pass-card__label">発行したパスワード（この画面を閉じると二度と表示されません）</span>
          <span className="pass-card__pw">{issued.password}</span>
          <span className="pass-card__until">{fmt(issued.expiresAt)} まで使えます</span>
          <button type="button" className="btn btn--outline sk-btn" onClick={() => void copy()}>
            {copied ? <Check className="w-4 h-4 text-primary-500" /> : <Copy className="w-4 h-4" />}<span>{copied ? 'コピーしました' : 'パスワードをコピー'}</span>
          </button>
        </div>
      )}

      {status.canIssue ? (
        <div className="ps-btn2">
          <button type="button" className="btn btn--primary sk-btn sk-btn--lg" onClick={() => void issue()} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}<span>{status.active ? '新しく発行し直す' : 'パスワードを発行する'}</span>
          </button>
          {status.active && (
            <button type="button" className="btn btn--outline sk-btn sk-btn--lg" onClick={() => void revoke()} disabled={busy}><span>取り消す</span></button>
          )}
        </div>
      ) : (
        <p className="ps-hint">パスワードの発行・取り消しは、メールの確認コードでログインした役員だけができます。</p>
      )}
      <p className="ps-hint">メールアドレスを登録していない手伝いの方などに渡します。ログイン画面の「24 時間パスワードでログイン」に入れると、発行から 24 時間だけ運営の画面を使えます。</p>
    </div>
  );
}
