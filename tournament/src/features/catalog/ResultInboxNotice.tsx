// 受け箱（手描きのドロー表から読み取った結果など）を取り込んだときに、画面の下に出すお知らせ（resultInbox.ts）
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { dismissInboxReport, useInboxReport } from './resultInbox';

export default function ResultInboxNotice() {
  const r = useInboxReport();
  const [open, setOpen] = useState(false);
  if (!r) return null;
  const issues = [...r.conflicts.map((x) => ({ ...x, kind: '食い違い' })), ...r.notFound.map((x) => ({ ...x, kind: '入れられない' }))];
  return (
    <div className={`inbox-note ${issues.length ? 'is-warn' : ''}`} role="status">
      <div className="inbox-note__head">
        {issues.length ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
        <p className="inbox-note__title">
          {r.source ? `${r.source}から` : '届いた結果から'} {r.applied.length} 試合を反映しました
          {issues.length > 0 && <small>（入れられなかった {issues.length} 件）</small>}
        </p>
        <button type="button" className="inbox-note__more" onClick={() => setOpen((v) => !v)}>{open ? '閉じる' : '中身'}</button>
        <button type="button" className="inbox-note__x" onClick={dismissInboxReport} aria-label="閉じる"><X className="w-4 h-4" /></button>
      </div>
      {open && (
        <ul className="inbox-note__list">
          {r.applied.map((a, i) => <li key={`a${i}`}><b>{a.event}</b> {a.winner} が {a.loser} に {a.score}</li>)}
          {issues.map((a, i) => <li key={`i${i}`} className="is-warn"><b>{a.kind}</b> {a.event}：{a.winner} 対 {a.loser}（{a.reason}）</li>)}
        </ul>
      )}
    </div>
  );
}
