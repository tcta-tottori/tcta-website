// ドロー画面：リーグの順位で選手が決まる種目（決勝トーナメント・決勝リーグ・順位決定戦。placement.ts）の欄。
//   ・枠ごとに「B1位」などの見出しと、今のリーグの順位で入る選手の見込み（リーグの結果が入るたびに変わる）
//   ・リーグが終わっていない・同率（くじ引き）の枠には注意を出す
//   ・「順位を反映して組む」で見込みの選手を枠に入れ、そのまま対戦表を作る（受付は無いので、エントリー受付には出さない）
//   ・結果をまだ入れていなければ、何度でも組み直せる（あたりは「あたり修正」でも直せる）
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ListOrdered, Loader2 } from 'lucide-react';
import { db } from '../../db/database';
import { siteAlert, siteConfirm } from '../../components/site/siteConfirm';
import { applyPlacement, previewPlacement } from './placement';
import { rebuildEventMatches } from './rebuildMatches';
import { reflowScheduleAfterConfirm } from '../schedule/reflowAfterConfirm';

export default function PlacementPanel({ eventId }: { eventId: string }) {
  const rows = useLiveQuery(() => previewPlacement(eventId), [eventId]) ?? [];
  const state = useLiveQuery(async () => {
    const draw = await db.draws.where('eventId').equals(eventId).first();
    const matches = await db.matches.where('eventId').equals(eventId).toArray();
    const real = (n?: string | null) => !!n && n !== 'BYE';
    return {
      filled: !!draw?.slots.some((s) => s.entryId),
      built: matches.length > 0,
      // 結果が入った・試合を始めた試合がある（組み直すと消えてしまうので、組み直させない）
      started: matches.some((m) => real(m.player1Name) && real(m.player2Name) && (!!m.score || m.status === 'playing' || m.status === 'finished')),
    };
  }, [eventId]);
  const filled = state?.filled ?? false;
  const built = state?.built ?? false;
  const started = state?.started ?? false;
  const [busy, setBusy] = useState(false);
  const problems = rows.filter((r) => r.problem);
  const ready = rows.filter((r) => r.entry).length;

  const run = async () => {
    const msg = [
      `リーグの今の順位で ${ready} 枠に選手を入れて、対戦表を作ります。`,
      problems.length ? `\n注意のある枠が ${problems.length} 件あります：\n${problems.map((r) => `・${r.label}：${r.problem}`).join('\n')}\n（入れたあと「あたり修正」で直せます）` : '',
      filled ? '\n前に組んだ内容は入れ替わります。' : '',
    ].join('');
    if (!(await siteConfirm({ title: filled ? '順位を反映して組み直す' : '順位を反映して組む', message: msg, confirmLabel: filled ? '組み直す' : '組む' }))) return;
    setBusy(true);
    try {
      // 組み直すときは、前の対戦表を消してから（試合を始める前だけ。ボタンもそのときだけ押せる）
      if (built) {
        const ids = (await db.matches.where('eventId').equals(eventId).primaryKeys()) as number[];
        await db.matches.bulkDelete(ids);
      }
      const r = await applyPlacement(eventId);
      await rebuildEventMatches(eventId);
      await reflowScheduleAfterConfirm();
      await siteAlert(`${r.filled} 枠に選手を入れて、対戦表を作りました。対戦順・ドローから試合を進められます。`, '組みました');
    } catch (e) {
      await siteAlert((e as Error).message, '組めませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plc">
      <div className="plc__head">
        <ListOrdered className="w-4 h-4" />
        <p className="plc__title">リーグの順位で組む種目<small>{built ? '組みずみ' : 'リーグの順位待ち'}</small></p>
      </div>
      <p className="plc__lead">
        {started ? '試合が始まっているので、組み直せません。あたりが違うときは「あたり修正」で直してください。'
          : built ? 'リーグの結果が変わったときは、もう一度押すと組み直せます（試合を始める前まで）。'
          : 'リーグが終わったら「順位を反映して組む」を押してください。受付は要りません。今の順位での見込みを下に出しています。'}
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
      {!started && (
        <button className="btn btn--primary plc__btn" onClick={() => void run()} disabled={busy || ready === 0}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListOrdered className="w-4 h-4" />}
          {built ? '順位を反映して組み直す' : '順位を反映して組む'}
        </button>
      )}
    </div>
  );
}
