// 運営をはじめる前の確認（/data/review/<id>）。
//   ・ドローの当たり方（1 回戦の組と、2 回戦で当たる相手）を種目ごとに見る
//   ・名前・所属・シード・ふりがなの抜けなど、気をつける所を自動で並べる（drawCheck.ts）
//   ・その場で直せる：枠の入れ替え・選手の移動・名前と所属とシードの修正・空きにする・1 回戦の時刻・ふりがなの追加・大会の情報
//   ・保存するとデータベースに書く（ほかの端末にも同じ内容が届く）。「この内容で運営をはじめる」で端末に入れてエントリー受付へ
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertOctagon, AlertTriangle, ArrowLeft, ArrowLeftRight, ArrowRight, Check, Info, Loader2, Pencil, Save, Trash2, X } from 'lucide-react';
import { db } from '../../db/database';
import { toHalfwidth } from '../../lib/halfwidth';
import { siteConfirm } from '../../components/site/siteConfirm';
import {
  dateParts, fetchTournament, putDict, putTournament,
  type CatalogDrawEvent, type CatalogDrawPlayer, type CatalogTournamentFull,
} from './catalogApi';
import { checkDraw, pairsOf, secondRoundOpponent, type DrawIssue, type IssueLevel } from './drawCheck';
import { importToDevice, localCopyOf } from './deviceImport';
import { syncDictionary } from './dictSync';

const KANA = /^[ぁ-ゖー\s\u3000]+$/;
const LEVEL: Record<IssueLevel, { label: string; Icon: typeof Info }> = {
  error: { label: '直さないと運営できません', Icon: AlertOctagon },
  warn: { label: '直したほうがよい所', Icon: AlertTriangle },
  info: { label: '念のため見ておく所', Icon: Info },
};

interface Meta { name: string; date: string; venue: string; courts: number; startTime: string }

export default function ReviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [t, setT] = useState<CatalogTournamentFull | null>(null);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<CatalogDrawEvent[]>([]);
  const [meta, setMeta] = useState<Meta>({ name: '', date: '', venue: '', courts: 16, startTime: '09:00' });
  const [dirty, setDirty] = useState(false);
  const [ev, setEv] = useState(0);
  const [pick, setPick] = useState<number | null>(null);      // 入れ替え元の枠
  const [editing, setEditing] = useState<number | null>(null); // 直している枠
  const [focus, setFocus] = useState<number | null>(null);     // 問題の一覧から飛んだ枠
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const [onlyMatches, setOnlyMatches] = useState(false); // 1 回戦の試合だけ（不戦勝・空きの組を隠す）

  useEffect(() => {
    let alive = true;
    fetchTournament(id).then((full) => {
      if (!alive) return;
      setT(full);
      setDraft(structuredClone(full.draw?.events ?? []));
      setMeta({
        name: full.name, date: full.date, venue: full.venue,
        courts: full.settings.courtNames?.length || 16, startTime: full.settings.startTime || full.draw?.earliestStartTime || '09:00',
      });
    }).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [id]);

  // 端末の辞書（ログイン時にデータベースから取り込んだもの）
  const dictSets = useLiveQuery(async () => ({
    players: new Set((await db.furiganaDict.toArray()).map((d) => d.name)),
    affiliations: new Set((await db.affiliationFurigana.toArray()).map((a) => a.name)),
  }), [], { players: new Set<string>(), affiliations: new Set<string>() });

  const issues = useMemo(() => checkDraw(draft, dictSets), [draft, dictSets]);
  const counts = useMemo(() => ({
    error: issues.filter((i) => i.level === 'error').length,
    warn: issues.filter((i) => i.level === 'warn').length,
    info: issues.filter((i) => i.level === 'info').length,
  }), [issues]);

  const update = useCallback((fn: (evs: CatalogDrawEvent[]) => void) => {
    setDraft((cur) => { const next = structuredClone(cur); fn(next); return next; });
    setDirty(true);
  }, []);

  /** 枠 a と b を入れ替える（片方が空きなら移す） */
  const swap = (a: number, b: number) => update((evs) => {
    const e = evs[ev];
    for (const p of e.players) {
      if (p.position === a) p.position = b;
      else if (p.position === b) p.position = a;
    }
    e.players.sort((x, y) => x.position - y.position);
    setFlash(`${a} 番と ${b} 番を入れ替えました`);
  });
  const onSlot = (pos: number) => {
    if (pick == null) return;
    if (pick !== pos) swap(pick, pos);
    setPick(null);
  };

  const save = async (): Promise<CatalogTournamentFull | null> => {
    if (!t) return null;
    setBusy('保存しています');
    try {
      const courtNames = Array.from({ length: Math.max(1, Math.min(64, meta.courts || 16)) }, (_, i) => String(i + 1));
      const body = {
        name: meta.name.trim() || t.name, date: meta.date, venue: meta.venue, reserveDate: t.reserveDate, reserveVenue: t.reserveVenue,
        category: t.category, status: 'ready' as const, note: t.note, source: t.source,
        settings: { courtNames, startTime: meta.startTime || '09:00' },
        draw: { ...(t.draw ?? {}), events: draft },
      };
      await putTournament(t.id, body);
      const full = await fetchTournament(t.id);
      setT(full);
      setDraft(structuredClone(full.draw?.events ?? []));
      setDirty(false);
      setFlash('データベースに保存しました（ほかの端末にも同じ内容が届きます）');
      return full;
    } catch (e) {
      setFlash(`保存できませんでした：${(e as Error).message}`);
      return null;
    } finally {
      setBusy('');
    }
  };

  const start = async () => {
    if (!t) return;
    if (counts.error > 0 && !(await siteConfirm({ title: '直していない所があります', message: `「直さないと運営できません」が ${counts.error} 件あります。このまま運営をはじめますか？`, confirmLabel: 'このまま進む', danger: true }))) return;
    const local = await localCopyOf(t.id);
    if (local && !(await siteConfirm({ title: '大会を入れ直す', message: `この端末の「${t.name}」の運営データ（受付・試合結果）を消して、確認した内容で入れ直します。`, confirmLabel: '入れ直す', danger: true }))) return;
    const full = dirty ? await save() : t;
    if (!full) return;
    setBusy('端末に入れています');
    try {
      await importToDevice(full, (p) => setBusy(p.label));
      navigate('/entry');
    } catch (e) {
      setFlash(`入れられませんでした：${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  // 運営をはじめずに大会選択へ戻る（データベースにも端末にも何も書かない）
  const cancel = async () => {
    if (dirty && !(await siteConfirm({ title: 'キャンセル', message: '直した所はまだ保存していません。保存せずに大会選択へ戻りますか？', confirmLabel: '保存せずに戻る', danger: true }))) return;
    navigate('/data');
  };

  const addFurigana = async (name: string, furigana: string, affiliation?: string) => {
    await putDict({ mode: 'merge', players: [{ name: toHalfwidth(name), furigana, ...(affiliation ? { affiliation } : {}) }] });
    await syncDictionary(true);
    setFlash(`${name}（${furigana}）を辞書に入れました`);
  };

  const jump = (i: DrawIssue) => {
    setEv(i.event);
    if (i.position) {
      setFocus(i.position);
      setTimeout(() => document.getElementById(`slot-${i.event}-${i.position}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    }
  };

  if (err) return <div className="hub"><div className="container hub__inner"><div className="hub-note hub-note--warn">{err}</div><Link to="/data" className="btn btn--outline">大会選択へ戻る</Link></div></div>;
  if (!t) return <div className="hub"><div className="container hub__inner"><div className="hub-empty"><Loader2 className="hub-empty__ico animate-spin" /><p className="hub-empty__title">読み込んでいます</p></div></div></div>;

  const d = dateParts(meta.date);
  const e = draft[ev];
  const evIssues = (i: number) => issues.filter((x) => x.event === i && x.level !== 'info').length;

  return (
    <div className="hub rvw">
      <div className="container hub__inner">
        <Link to="/data" className="rvw__back"><ArrowLeft className="w-4 h-4" />大会選択へ戻る</Link>

        {/* ---- 大会の情報 ---- */}
        <section className="rvw-head">
          <div className="rvw-head__main">
            {d && <span className="date-chip date-chip--card"><span className="date-chip__md">{d.md}</span><span className="date-chip__dow">{d.dow}</span></span>}
            <div>
              <p className="rvw-head__eyebrow">CHECK BEFORE START</p>
              <h2 className="rvw-head__title">{meta.name}</h2>
              <p className="rvw-head__meta">{meta.venue} ・ {draft.length} 種目・{draft.reduce((s, x) => s + x.players.length, 0)} 人</p>
            </div>
          </div>
          <div className="rvw-counts">
            {(['error', 'warn', 'info'] as const).map((lv) => (
              <span key={lv} className={`rvw-count rvw-count--${lv} ${counts[lv] > 0 ? 'is-on' : ''}`}><b>{counts[lv]}</b>{lv === 'error' ? '要修正' : lv === 'warn' ? '要確認' : '参考'}</span>
            ))}
          </div>
        </section>

        <details className="rvw-meta">
          <summary>大会の情報を直す（大会名・期日・会場・コート数・開始時刻）</summary>
          <div className="rvw-meta__grid">
            <label>大会名<input className="input" value={meta.name} onChange={(x) => { setMeta({ ...meta, name: x.target.value }); setDirty(true); }} /></label>
            <label>期日<input className="input" type="date" value={meta.date} onChange={(x) => { setMeta({ ...meta, date: x.target.value }); setDirty(true); }} /></label>
            <label>会場<input className="input" value={meta.venue} onChange={(x) => { setMeta({ ...meta, venue: x.target.value }); setDirty(true); }} /></label>
            <label>使うコート数<input className="input" type="number" min={1} max={64} value={meta.courts} onChange={(x) => { setMeta({ ...meta, courts: Number(x.target.value) }); setDirty(true); }} /></label>
            <label>最初の試合<input className="input" type="time" value={meta.startTime} onChange={(x) => { setMeta({ ...meta, startTime: x.target.value }); setDirty(true); }} /></label>
          </div>
        </details>

        {flash && <div className="hub-note" role="status">{flash}<button className="rvw-x" onClick={() => setFlash('')} aria-label="閉じる"><X className="w-4 h-4" /></button></div>}

        {/* ---- 気をつける所 ---- */}
        {issues.length === 0 ? (
          <div className="hub-note"><Check className="w-4 h-4 inline" /> 気になる所は見つかりませんでした。</div>
        ) : (
          <section className="rvw-issues">
            {(['error', 'warn', 'info'] as const).filter((lv) => counts[lv] > 0).map((lv) => {
              const { label, Icon } = LEVEL[lv];
              return (
                <details key={lv} className={`rvw-issues__group rvw-issues__group--${lv}`} open={lv !== 'info'}>
                  <summary><Icon className="w-4 h-4" />{label}<small>{counts[lv]}</small></summary>
                  <ul>
                    {issues.filter((i) => i.level === lv).map((i, n) => (
                      <li key={n} className="rvw-issue">
                        <button className="rvw-issue__go" onClick={() => jump(i)}>
                          <span className="rvw-issue__ev">{draft[i.event]?.eventName}{i.position ? ` ${i.position}番` : ''}</span>
                          <span className="rvw-issue__msg">{i.message}</span>
                        </button>
                        {i.kind === 'furigana' && i.player && <FuriganaFix name={i.player} onSave={addFurigana} />}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </section>
        )}

        {/* ---- 種目 ---- */}
        <div className="hub-filter rvw-tabs" role="tablist" aria-label="種目">
          {draft.map((x, i) => (
            <button key={i} role="tab" aria-selected={ev === i} className={`hub-filter__btn ${ev === i ? 'is-on' : ''}`} onClick={() => { setEv(i); setPick(null); setEditing(null); }}>
              {x.eventName}<small>{x.players.length}人</small>{evIssues(i) > 0 && <span className="rvw-tabs__dot" aria-label={`${evIssues(i)} 件`} />}
            </button>
          ))}
        </div>

        {e && (
          <section className="rvw-draw" aria-label={`${e.eventName}のドロー`}>
            <label className="dict-check rvw-only"><input type="checkbox" checked={onlyMatches} onChange={(x) => setOnlyMatches(x.target.checked)} />1 回戦の試合だけ表示（不戦勝・空きの組を隠す）</label>
            <p className="rvw-draw__meta">{e.type === 'Doubles' ? 'ダブルス' : 'シングルス'} ・ {e.drawSize} 枠 ・ {e.roundGameRules?.map((r) => `${r.roundLabel} ${r.ruleText}`).join(' / ') || e.matchFormat}</p>
            {pick != null && (
              <div className="rvw-pickbar" role="status">
                <ArrowLeftRight className="w-4 h-4" /><span>{pick} 番と入れ替える枠を押してください（空きの枠なら移します）</span>
                <button className="btn btn--outline rvw-pickbar__btn" onClick={() => setPick(null)}>やめる</button>
              </div>
            )}
            <ol className="rvw-pairs">
              {pairsOf(e).filter((x) => !onlyMatches || (x.top && x.bottom)).map(({ k, top, bottom }) => {
                const time = e.matchTimes?.[String(2 * k - 1)] ?? '';
                const both = !!(top && bottom);
                return (
                  <li key={k} className={`rvw-pair ${both ? 'is-match' : top || bottom ? 'is-bye' : 'is-empty'}`}>
                    <div className="rvw-pair__head">
                      <span className="rvw-pair__label">{both ? `1回戦 第${k}試合` : top || bottom ? '不戦勝' : '空き'}</span>
                      {both && (
                        <label className="rvw-pair__time">開始
                          <input type="time" value={time} onChange={(x) => update((evs) => { const m = { ...(evs[ev].matchTimes ?? {}) }; if (x.target.value) m[String(2 * k - 1)] = x.target.value; else delete m[String(2 * k - 1)]; evs[ev].matchTimes = m; })} />
                        </label>
                      )}
                    </div>
                    {[2 * k - 1, 2 * k].map((pos) => {
                      const p = pos === 2 * k - 1 ? top : bottom;
                      return (
                        <Slot
                          key={pos}
                          id={`slot-${ev}-${pos}`}
                          pos={pos}
                          player={p}
                          doubles={e.type === 'Doubles'}
                          issues={issues.filter((i) => i.event === ev && i.position === pos)}
                          picking={pick != null}
                          picked={pick === pos}
                          focus={focus === pos}
                          editing={editing === pos}
                          onPick={() => setPick(pos)}
                          onTarget={() => onSlot(pos)}
                          onEdit={() => setEditing(pos)}
                          onCancel={() => setEditing(null)}
                          onSave={(np) => { update((evs) => { const x = evs[ev]; x.players = x.players.filter((q) => q.position !== pos); x.players.push({ ...np, position: pos }); x.players.sort((a, b) => a.position - b.position); }); setEditing(null); }}
                          onRemove={async () => { if (p && await siteConfirm({ title: '空きにする', message: `${pos} 番の ${p.name} をドローから外して空きにします。`, confirmLabel: '空きにする', danger: true })) update((evs) => { evs[ev].players = evs[ev].players.filter((q) => q.position !== pos); }); }}
                        />
                      );
                    })}
                    {e.drawSize >= 4 && (top || bottom) && <p className="rvw-pair__next">2 回戦の相手：{secondRoundOpponent(e, k)}</p>}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>

      {/* ---- 下の操作の帯 ---- */}
      <div className="rvw-bar">
        <div className="container rvw-bar__inner">
          <span className="rvw-bar__state">{busy ? <><Loader2 className="w-4 h-4 animate-spin" />{busy}</> : dirty ? '直した所はまだ保存していません' : 'データベースの内容と同じです'}</span>
          <div className="rvw-bar__btns">
            <button className="btn btn--outline rvw-bar__btn" onClick={() => void save()} disabled={!dirty || !!busy}><Save className="w-4 h-4" />保存</button>
            <button className="btn btn--primary rvw-bar__btn rvw-bar__btn--start" onClick={() => void start()} disabled={!!busy}>{dirty ? '保存して運営をはじめる' : 'この内容で運営をはじめる'}<ArrowRight className="w-4 h-4" /></button>
            {/* キャンセル：運営をはじめずに大会選択へ戻る。直した所が保存されていなければ、捨ててよいか聞く */}
            <button className="btn btn--outline rvw-bar__btn rvw-bar__btn--cancel" onClick={() => void cancel()} disabled={!!busy}><X className="w-4 h-4" />キャンセル</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slot({ id, pos, player, doubles, issues, picking, picked, focus, editing, onPick, onTarget, onEdit, onCancel, onSave, onRemove }: {
  id: string; pos: number; player: CatalogDrawPlayer | null; doubles: boolean; issues: DrawIssue[];
  picking: boolean; picked: boolean; focus: boolean; editing: boolean;
  onPick: () => void; onTarget: () => void; onEdit: () => void; onCancel: () => void; onSave: (p: CatalogDrawPlayer) => void; onRemove: () => void;
}) {
  const worst = issues.find((i) => i.level === 'error') ?? issues.find((i) => i.level === 'warn');
  const cls = `rvw-slot ${player ? '' : 'is-bye'} ${picked ? 'is-picked' : ''} ${picking && !picked ? 'is-target' : ''} ${focus ? 'is-focus' : ''} ${worst ? `has-${worst.level}` : ''}`;

  if (editing) return <SlotForm id={id} cls={cls} pos={pos} player={player} doubles={doubles} onCancel={onCancel} onSave={onSave} />;

  return (
    <div id={id} className={cls} onClick={picking ? onTarget : undefined} role={picking ? 'button' : undefined} tabIndex={picking ? 0 : undefined}>
      <span className="rvw-slot__pos">{pos}</span>
      {player ? (
        <div className="rvw-slot__who">
          <span className="rvw-slot__name">{player.seed ? <span className="rvw-seed">{player.seed}</span> : null}{player.name}</span>
          <span className="rvw-slot__aff">{player.affiliation || '所属なし'}</span>
          {doubles && player.partnerName && <span className="rvw-slot__partner">{player.partnerName}<small>{player.partnerAffiliation}</small></span>}
          {worst && <span className={`rvw-slot__issue rvw-slot__issue--${worst.level}`}>{worst.message}</span>}
        </div>
      ) : (
        <div className="rvw-slot__who"><span className="rvw-slot__bye">空き（BYE）</span></div>
      )}
      {!picking && (
        <div className="rvw-slot__acts">
          <button className="hub-icon-btn" onClick={onPick} title="入れ替え・移動" aria-label={`${pos} 番を入れ替える`}><ArrowLeftRight className="w-4 h-4" /></button>
          <button className="hub-icon-btn" onClick={onEdit} title={player ? '直す' : '選手を入れる'} aria-label={`${pos} 番を直す`}><Pencil className="w-4 h-4" /></button>
          {player && <button className="hub-icon-btn" onClick={onRemove} title="空きにする" aria-label={`${pos} 番を空きにする`}><Trash2 className="w-4 h-4" /></button>}
        </div>
      )}
    </div>
  );
}

/** 枠を直す（開いたときの中身で始める） */
function SlotForm({ id, cls, pos, player, doubles, onCancel, onSave }: {
  id: string; cls: string; pos: number; player: CatalogDrawPlayer | null; doubles: boolean; onCancel: () => void; onSave: (p: CatalogDrawPlayer) => void;
}) {
  const [f, setF] = useState(() => ({
    name: player?.name ?? '', affiliation: player?.affiliation ?? '', seed: player?.seed ? String(player.seed) : '',
    partnerName: player?.partnerName ?? '', partnerAffiliation: player?.partnerAffiliation ?? '',
  }));
  const submit = () => {
    const name = toHalfwidth(f.name.trim().replace(/\s+/g, ' '));
    if (!name) return;
    onSave({
      position: pos, name, affiliation: toHalfwidth(f.affiliation.trim(), { space: true }),
      ...(Number(f.seed) > 0 ? { seed: Number(f.seed) } : {}),
      ...(doubles && f.partnerName.trim() ? { partnerName: toHalfwidth(f.partnerName.trim().replace(/\s+/g, ' ')), partnerAffiliation: toHalfwidth(f.partnerAffiliation.trim(), { space: true }) } : {}),
    });
  };
  return (
    <div id={id} className={`${cls} is-editing`}>
      <span className="rvw-slot__pos">{pos}</span>
      <div className="rvw-slot__form">
        <label>氏名<input className="input" value={f.name} placeholder="姓 名（間に空白）" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>所属<input className="input" value={f.affiliation} onChange={(e) => setF({ ...f, affiliation: e.target.value })} /></label>
        <label className="rvw-slot__seed">シード<input className="input" type="number" min={0} value={f.seed} onChange={(e) => setF({ ...f, seed: e.target.value })} /></label>
        {doubles && <>
          <label>相方の氏名<input className="input" value={f.partnerName} onChange={(e) => setF({ ...f, partnerName: e.target.value })} /></label>
          <label>相方の所属<input className="input" value={f.partnerAffiliation} onChange={(e) => setF({ ...f, partnerAffiliation: e.target.value })} /></label>
        </>}
        <div className="rvw-slot__formbtns">
          <button className="btn btn--outline rvw-slot__fbtn" onClick={onCancel}>やめる</button>
          <button className="btn btn--primary rvw-slot__fbtn" onClick={submit}>この枠に反映</button>
        </div>
      </div>
    </div>
  );
}

function FuriganaFix({ name, onSave }: { name: string; onSave: (name: string, furigana: string) => Promise<void> }) {
  const [v, setV] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'bad'>('idle');
  if (state === 'done') return <span className="rvw-fix__done"><Check className="w-4 h-4" />入れました</span>;
  return (
    <span className="rvw-fix">
      <input className="input" value={v} placeholder="ふりがな（例 とっとり たろう）" onChange={(e) => { setV(e.target.value); setState('idle'); }} />
      <button className="btn btn--outline rvw-fix__btn" disabled={state === 'busy'} onClick={async () => {
        const f = v.trim().replace(/\s+/g, '\u3000');
        if (!KANA.test(f)) { setState('bad'); return; }
        setState('busy');
        try { await onSave(name, f); setState('done'); } catch { setState('bad'); }
      }}>{state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : '辞書に入れる'}</button>
      {state === 'bad' && <small className="rvw-fix__err">ひらがなで入れてください</small>}
    </span>
  );
}

