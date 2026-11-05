// 選手・所属のふりがな（データベースの辞書）を見る・直す。
//   ・開いたときにデータベースから読む（電波が無いときは端末に入っている辞書を出す）
//   ・ふりがなはその場で直せる。直すとデータベースに書き、ほかの端末にも次のログインで届く
//   ・今の大会の選手でふりがなが無い人を上に出す（音声コールで読めない人）
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Check, Loader2, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { fetchDict, putDict, type Dict, type DictPlayer } from './catalogApi';
import { syncDictionary, useDictSync } from './dictSync';

type Tab = 'players' | 'affiliations';
const keyOf = (name: string) => name.replace(/[\s\u3000]+/g, '');
const KANA = /^[ぁ-ゖー\s\u3000]+$/;
const PAGE = 120;

export default function DictionaryPage() {
  const sync = useDictSync();
  const [dict, setDict] = useState<Dict | null>(null);
  const [source, setSource] = useState<'db' | 'device'>('db');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [tab, setTab] = useState<Tab>('players');
  const [q, setQ] = useState('');
  const [onlyNote, setOnlyNote] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    try {
      setDict(await fetchDict());
      setSource('db');
      setState('ok');
    } catch {
      // 電波が無い：端末の辞書を出す
      const [fd, af] = await Promise.all([db.furiganaDict.toArray(), db.affiliationFurigana.toArray()]);
      setDict({ version: '', players: fd.map((d) => ({ name: d.name, furigana: d.furigana })), affiliations: af.map((a) => ({ name: a.name, furigana: a.furigana })) });
      setSource('device');
      setState('error');
    }
  }, []);
  // load は読み終わってから state を変える（同期では変えない）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // 今の大会の選手でふりがなの無い人
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);
  const missing = useLiveQuery(async () => {
    if (!currentTournamentId) return [];
    const events = await db.events.where('tournamentId').equals(currentTournamentId).toArray();
    const entries = events.length ? await db.entries.where('eventId').anyOf(events.map((e) => e.eventId)).toArray() : [];
    const ids = new Set(entries.flatMap((e) => [e.playerId, e.partnerId].filter(Boolean) as string[]));
    const players = await db.players.toArray();
    return players.filter((p) => ids.has(p.playerId) && !p.furigana);
  }, [currentTournamentId, sync.version], []);

  const save = useCallback(async (p: DictPlayer) => {
    await putDict({ mode: 'merge', players: [p] });
    setDict((d) => d && ({ ...d, players: [...d.players.filter((x) => keyOf(x.name) !== keyOf(p.name)), p].sort((a, b) => a.furigana.localeCompare(b.furigana, 'ja')) }));
    setFlash(`${p.name}（${p.furigana}）を保存しました`);
    await syncDictionary(true);
  }, []);
  const saveAff = useCallback(async (a: { name: string; furigana: string }) => {
    await putDict({ mode: 'merge', affiliations: [a] });
    setDict((d) => d && ({ ...d, affiliations: [...d.affiliations.filter((x) => x.name !== a.name), a].sort((x, y) => x.furigana.localeCompare(y.furigana, 'ja')) }));
    setFlash(`${a.name}（${a.furigana}）を保存しました`);
    await syncDictionary(true);
  }, []);

  const rows = useMemo(() => {
    if (!dict) return [];
    const nq = keyOf(q);
    const src = tab === 'players' ? dict.players : dict.affiliations;
    return src.filter((r) => {
      if (onlyNote && tab === 'players' && !(r as DictPlayer).note) return false;
      if (!nq) return true;
      return keyOf(r.name).includes(nq) || keyOf(r.furigana).includes(nq) || (tab === 'players' && keyOf((r as DictPlayer).affiliation ?? '').includes(nq));
    });
  }, [dict, q, tab, onlyNote]);
  const noteCount = dict?.players.filter((p) => p.note).length ?? 0;

  return (
    <div className="hub">
      <div className="container hub__inner">
        <p className="hub__lead">
          協会の大会運営データベースの辞書です。ログインした時点でこの端末に取り込み、音声コール・名簿の読みに使います。
          読みはその場で直せて、直すとほかの端末にも届きます。まとめて直すときは Claude に頼めます。
        </p>

        <div className="hub__bar">
          <div className="hub-filter" role="tablist" aria-label="辞書の種類">
            <button role="tab" aria-selected={tab === 'players'} className={`hub-filter__btn ${tab === 'players' ? 'is-on' : ''}`} onClick={() => { setTab('players'); setLimit(PAGE); }}>選手 <small>{dict?.players.length ?? '…'}</small></button>
            <button role="tab" aria-selected={tab === 'affiliations'} className={`hub-filter__btn ${tab === 'affiliations' ? 'is-on' : ''}`} onClick={() => { setTab('affiliations'); setLimit(PAGE); }}>所属 <small>{dict?.affiliations.length ?? '…'}</small></button>
          </div>
          <div className="hub__sync">
            <span className="hub-chip">{sync.status === 'syncing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {source === 'device' ? '端末の辞書を表示中' : sync.version ? `端末に取り込みずみ（${new Date(sync.version).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 版）` : '取り込み待ち'}
            </span>
            <button className="hub-icon-btn" onClick={() => { setState('loading'); void load(); void syncDictionary(true); }} title="読み直す" aria-label="読み直す">
              <RefreshCw className={`w-4 h-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {state === 'error' && <div className="hub-note hub-note--warn">データベースにつながらないので、この端末に入っている辞書を表示しています（直すことはできません）。</div>}
        {flash && <div className="hub-note" role="status">{flash}</div>}

        {tab === 'players' && (missing?.length ?? 0) > 0 && source === 'db' && (
          <section className="hub-missing">
            <p className="hub-missing__title"><AlertTriangle className="w-4 h-4" />今の大会で、ふりがなの無い選手 {missing!.length} 人</p>
            <ul className="dict-list">
              {missing!.map((p) => (
                <DictRow key={p.playerId} name={p.name} furigana="" sub={p.affiliation} editing onSave={(f) => save({ name: p.name, furigana: f, affiliation: p.affiliation })} />
              ))}
            </ul>
          </section>
        )}

        <div className="dict-tools">
          <label className="dict-search">
            <Search className="w-4 h-4" />
            <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder={tab === 'players' ? '氏名・ふりがな・所属で探す' : '所属名・ふりがなで探す'} />
            {q && <button onClick={() => { setQ(''); setLimit(PAGE); }} aria-label="消す"><X className="w-4 h-4" /></button>}
          </label>
          {tab === 'players' && noteCount > 0 && (
            <label className="dict-check"><input type="checkbox" checked={onlyNote} onChange={(e) => { setOnlyNote(e.target.checked); setLimit(PAGE); }} />要確認だけ（{noteCount}）</label>
          )}
          {source === 'db' && <AddRow tab={tab} onAdd={(n, f, a) => (tab === 'players' ? save({ name: n, furigana: f, affiliation: a }) : saveAff({ name: n, furigana: f }))} />}
        </div>

        {!dict ? (
          <div className="hub-empty"><Loader2 className="hub-empty__ico animate-spin" /><p className="hub-empty__title">読み込んでいます</p></div>
        ) : rows.length === 0 ? (
          <div className="hub-empty"><p className="hub-empty__title">見つかりません</p></div>
        ) : (
          <>
            <p className="dict-count">{rows.length} 件{rows.length > limit ? `（${limit} 件まで表示）` : ''}</p>
            <ul className="dict-list">
              {rows.slice(0, limit).map((r) => (
                <DictRow
                  key={r.name}
                  name={r.name}
                  furigana={r.furigana}
                  sub={tab === 'players' ? (r as DictPlayer).affiliation : undefined}
                  note={tab === 'players' ? (r as DictPlayer).note : undefined}
                  readOnly={source !== 'db'}
                  onSave={(f) => (tab === 'players' ? save({ ...(r as DictPlayer), furigana: f, note: '' }) : saveAff({ name: r.name, furigana: f }))}
                />
              ))}
            </ul>
            {rows.length > limit && <button className="btn btn--outline dict-more" onClick={() => setLimit((l) => l + PAGE)}>さらに表示</button>}
          </>
        )}
      </div>
    </div>
  );
}

function DictRow({ name, furigana, sub, note, readOnly, editing: startEditing, onSave }: {
  name: string; furigana: string; sub?: string; note?: string; readOnly?: boolean; editing?: boolean; onSave: (f: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(!!startEditing);
  const [value, setValue] = useState(furigana);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setValue(furigana); }, [furigana]);
  const commit = async () => {
    const v = value.trim().replace(/\s+/g, '\u3000');
    if (!v || !KANA.test(v)) { setErr('ひらがなで入れてください（姓と名の間に空白）'); return; }
    setBusy(true); setErr('');
    try { await onSave(v); setEditing(false); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <li className={`dict-row ${note ? 'dict-row--note' : ''}`}>
      <div className="dict-row__main">
        <span className="dict-row__name">{name}</span>
        {sub && <span className="dict-row__sub">{sub}</span>}
      </div>
      {editing ? (
        <div className="dict-row__edit">
          <input className="input" value={value} autoFocus={!startEditing} placeholder="ふりがな" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape' && !startEditing) setEditing(false); }} />
          <button className="btn btn--primary dict-row__btn" onClick={commit} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '保存'}</button>
          {!startEditing && <button className="btn btn--outline dict-row__btn" onClick={() => { setEditing(false); setValue(furigana); setErr(''); }}>やめる</button>}
        </div>
      ) : (
        <div className="dict-row__read">
          <span className="dict-row__kana">{furigana}</span>
          {!readOnly && <button className="hub-icon-btn" onClick={() => setEditing(true)} aria-label={`${name} のふりがなを直す`}><Pencil className="w-3.5 h-3.5" /></button>}
        </div>
      )}
      {note && !editing && <p className="dict-row__note"><AlertTriangle className="w-3.5 h-3.5" />{note}</p>}
      {err && <p className="dict-row__err">{err}</p>}
    </li>
  );
}

function AddRow({ tab, onAdd }: { tab: Tab; onAdd: (name: string, furigana: string, aff: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [furi, setFuri] = useState('');
  const [aff, setAff] = useState('');
  const [err, setErr] = useState('');
  if (!open) return <button className="btn btn--outline dict-add" onClick={() => setOpen(true)}><Plus className="w-4 h-4" />{tab === 'players' ? '選手を足す' : '所属を足す'}</button>;
  const submit = async () => {
    const f = furi.trim().replace(/\s+/g, '\u3000');
    if (!name.trim() || !KANA.test(f)) { setErr('名前と、ひらがなのふりがなを入れてください'); return; }
    try { await onAdd(name.trim().replace(/\s+/g, '\u3000'), f, aff.trim()); setName(''); setFuri(''); setAff(''); setErr(''); setOpen(false); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="dict-addform">
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tab === 'players' ? '氏名（例 鳥取 太郎）' : '所属名'} />
      <input className="input" value={furi} onChange={(e) => setFuri(e.target.value)} placeholder="ふりがな（例 とっとり たろう）" />
      {tab === 'players' && <input className="input" value={aff} onChange={(e) => setAff(e.target.value)} placeholder="所属（任意）" />}
      <button className="btn btn--primary" onClick={submit}>保存</button>
      <button className="btn btn--outline" onClick={() => setOpen(false)}>やめる</button>
      {err && <p className="dict-row__err">{err}</p>}
    </div>
  );
}
