// 対戦表で選手の枠をタップしたときの確認ダイアログ（エントリー受付）。
//   ・未受付：「エントリー完了」で受付して閉じる
//   ・受付済：「受付を取り消す」
//   ・欠場（DEF）にする／欠場を取り消す（復元）
//   ・選手を変更：氏名・所属（ダブルスは相方も）を直して保存。ドロー・対戦表・時間割の名前も入れ替わる
import { useState } from 'react';
import { Ban, Check, Loader2, Pencil, RotateCcw, UserCheck, Undo2 } from 'lucide-react';
import SiteDialog from '../../components/site/SiteDialog';

export type SlotChange = { name: string; affiliation: string; partnerName: string; partnerAffiliation: string };

export default function EntrySlotDialog({ open, eventName, position, seed, doubles, current, state, locked, onClose, onCheckIn, onUncheck, onWithdraw, onRestore, onChange }: {
  open: boolean;
  eventName: string;
  position: number;
  seed: number;
  doubles: boolean;
  current: SlotChange;
  state: 'none' | 'checked' | 'def';
  /** 種目が確定済み（対戦表ができている） */
  locked: boolean;
  onClose: () => void;
  onCheckIn: () => void;
  onUncheck: () => void;
  onWithdraw: () => Promise<void>;
  onRestore: () => Promise<void>;
  onChange: (next: SlotChange) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SlotChange>(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<void>, close = true) => {
    setBusy(true); setErr('');
    try { await fn(); if (close) onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const save = () => {
    if (!form.name.trim() || (doubles && !form.partnerName.trim())) { setErr(doubles ? '2 人の氏名を入れてください' : '氏名を入れてください'); return; }
    void run(() => onChange(form));
  };
  const label = state === 'checked' ? '受付済' : state === 'def' ? '欠場（DEF）' : '未受付';

  return (
    <SiteDialog
      open={open}
      title={editing ? '選手を変更' : 'エントリーの確認'}
      eyebrow={`${eventName} ・ ${position} 番${seed > 0 ? ` ・ 第${seed}シード` : ''}`}
      onClose={busy ? undefined : onClose}
      closable
      size="sm"
      actions={editing ? (
        <>
          <button className="btn btn--outline" onClick={() => { setEditing(false); setForm(current); setErr(''); }} disabled={busy}>やめる</button>
          <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}変更を保存</button>
        </>
      ) : state === 'def' ? (
        <>
          <button className="btn btn--outline" onClick={onClose} disabled={busy}>閉じる</button>
          <button className="btn btn--primary" onClick={() => void run(onRestore)} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}欠場を取り消す</button>
        </>
      ) : state === 'checked' ? (
        <>
          <button className="btn btn--outline" onClick={() => { onUncheck(); onClose(); }} disabled={busy}><Undo2 className="w-4 h-4" />受付を取り消す</button>
          <button className="btn btn--primary" onClick={onClose} disabled={busy}>閉じる</button>
        </>
      ) : (
        <>
          <button className="btn btn--outline" onClick={onClose} disabled={busy}>キャンセル</button>
          <button className="btn btn--primary" onClick={() => { onCheckIn(); onClose(); }} disabled={busy}><UserCheck className="w-4 h-4" />エントリー完了</button>
        </>
      )}
    >
      {editing ? (
        <div className="esd-form">
          <label className="esd-form__f"><span>{doubles ? '選手 1 の氏名' : '氏名'}</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例 鳥取 太郎" autoFocus /></label>
          <label className="esd-form__f"><span>所属</span>
            <input className="input" value={form.affiliation} onChange={(e) => setForm({ ...form, affiliation: e.target.value })} placeholder="例 フリー" /></label>
          {doubles && (
            <>
              <label className="esd-form__f"><span>選手 2 の氏名</span>
                <input className="input" value={form.partnerName} onChange={(e) => setForm({ ...form, partnerName: e.target.value })} placeholder="例 鳥取 花子" /></label>
              <label className="esd-form__f"><span>所属</span>
                <input className="input" value={form.partnerAffiliation} onChange={(e) => setForm({ ...form, partnerAffiliation: e.target.value })} /></label>
            </>
          )}
          <p className="esd-note">姓と名の間に空白を入れてください。ドロー・対戦表・時間割の名前も入れ替わります{locked ? '（確定済みの種目は、まだ始まっていない試合の名前を入れ替えます）' : ''}。</p>
        </div>
      ) : (
        <div className="esd">
          <p className="esd__name">{current.name}{doubles && current.partnerName && <><br />{current.partnerName}</>}</p>
          <p className="esd__aff">{[current.affiliation, doubles && current.partnerAffiliation !== current.affiliation ? current.partnerAffiliation : ''].filter(Boolean).join(' / ')}</p>
          <p className={`esd__state is-${state}`}>{label}</p>
          {state === 'none' && <p className="esd__q">この{doubles ? 'ペア' : '選手'}のエントリーを完了しますか？</p>}
          <div className="esd__more">
            <button className="btn btn--outline esd__mbtn" onClick={() => { setForm(current); setEditing(true); }} disabled={busy}><Pencil className="w-4 h-4" />選手を変更</button>
            {state !== 'def' && (
              <button className="btn btn--outline esd__mbtn esd__mbtn--def" onClick={() => void run(onWithdraw)} disabled={busy}><Ban className="w-4 h-4" />欠場（DEF）</button>
            )}
          </div>
        </div>
      )}
      {err && <p className="esd-err" role="alert">{err}</p>}
    </SiteDialog>
  );
}
