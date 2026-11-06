// エントリー受付：順位別トーナメントの欄（placement.ts）。
//   ・枠ごとに「B1位」などの見出しと、今のリーグの順位で入るペアの見込み（リーグの結果が入るたびに変わる）
//   ・リーグが終わっていない・同率（くじ引き）の枠には注意を出す
//   ・「順位を反映して組む」で見込みのペアを枠に入れる。確定までは何度でも組み直せる（あたりは「あたり修正」でも直せる）
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ListOrdered, Loader2 } from 'lucide-react';
import { applyPlacement, previewPlacement } from '../draw/placement';

export default function PlacementPanel({ eventId, filled, confirmed, ask }: {
  eventId: string;
  /** 枠にもう選手が入っている */
  filled: boolean;
  /** 対戦表ができている（確定済み） */
  confirmed: boolean;
  ask: (o: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}) {
  const rows = useLiveQuery(() => previewPlacement(eventId), [eventId]) ?? [];
  const [busy, setBusy] = useState(false);
  const problems = rows.filter((r) => r.problem);
  const ready = rows.filter((r) => r.entry).length;

  const run = async () => {
    const msg = [
      `リーグの今の順位で ${ready} 枠にペアを入れます。`,
      problems.length ? `\n注意のある枠が ${problems.length} 件あります：\n${problems.map((r) => `・${r.label}：${r.problem}`).join('\n')}\n（入れたあと「あたり修正」で直せます）` : '',
      filled ? '\n前に組んだ内容は入れ替わります。' : '',
    ].join('');
    if (!(await ask({ title: filled ? '順位を反映して組み直す' : '順位を反映して組む', message: msg, confirmLabel: filled ? '組み直す' : '組む' }))) return;
    setBusy(true);
    try {
      const r = await applyPlacement(eventId);
      await ask({ title: '組みました', message: `${r.filled} 枠にペアを入れました。受付をして「確定」を押すと対戦表ができます。`, confirmLabel: 'OK' });
    } catch (e) {
      await ask({ title: '組めませんでした', message: (e as Error).message, confirmLabel: 'OK', danger: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plc">
      <div className="plc__head">
        <ListOrdered className="w-4 h-4" />
        <p className="plc__title">順位別トーナメント<small>{filled ? '組みずみ' : 'リーグの順位待ち'}</small></p>
      </div>
      <p className="plc__lead">
        {confirmed ? '確定済みです。組み直すときは「解除」してから。'
          : filled ? 'リーグの結果が変わったときは、もう一度押すと組み直せます。'
          : 'リーグが終わったら「順位を反映して組む」を押してください。今の順位での見込みを下に出しています。'}
      </p>
      <ol className="plc__rows">
        {rows.map((r) => (
          <li key={r.position} className={`plc__row ${r.problem ? 'is-warn' : ''}`}>
            <span className="plc__pos">{r.position}</span>
            <span className="plc__label">{r.label}</span>
            <span className="plc__name">{r.name || '—'}</span>
            {r.problem && <span className="plc__prob"><AlertTriangle className="w-3.5 h-3.5" />{r.problem}</span>}
          </li>
        ))}
      </ol>
      {!confirmed && (
        <button className="btn btn--primary plc__btn" onClick={() => void run()} disabled={busy || ready === 0}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListOrdered className="w-4 h-4" />}
          {filled ? '順位を反映して組み直す' : '順位を反映して組む'}
        </button>
      )}
    </div>
  );
}
