// =============================================================================
// 印刷メニュー：リーグ表・審判用紙
//   ・協会の紙の用紙と同じ構成で作る（sheetModel.ts・SheetViews.tsx）
//   ・大会名・種目・チーム名・所属・コート・試合方法などは、プレビューの上で押して直せる
//   ・用紙の大きさは切り替えられる（既定はリーグ表 A4 横・審判用紙 B5 横。種類ごとにこの端末に覚える）
//   ・リーグ表は、空欄（手書き用）か、入っている結果を入れて作る。審判用紙は試合を選んで作る。どちらも空の用紙も足せる
// =============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLiveQuery } from 'dexie-react-hooks';
import { Printer, RefreshCw, Plus, Trash2, Table2, FileText } from 'lucide-react';
import { db, type Match } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { sortEventsByClass } from '../data/eventOrder';
import { siteConfirm } from '../../components/site/siteConfirm';
import {
  SHEET_PAPERS, SHEET_MARGIN, buildLeagueSheet, blankLeagueSheet, buildRefereeSheet, blankRefereeSheet, reiwaDate,
  type SheetPaper, type LeagueSheet, type RefereeSheet,
} from './sheetModel';
import { LeagueSheetView, RefereeSheetView } from './SheetViews';

type Kind = 'league' | 'referee';
const DEFAULT_PAPER: Record<Kind, SheetPaper> = { league: 'a4-landscape', referee: 'b5-landscape' };
const LS_PAPER = (k: Kind) => `sheetPrint.paper.${k}`;
const MM_PX = 96 / 25.4;

function loadPaper(k: Kind): SheetPaper {
  try { const v = localStorage.getItem(LS_PAPER(k)) as SheetPaper | null; if (v && SHEET_PAPERS[v]) return v; } catch { /* */ }
  return DEFAULT_PAPER[k];
}

export default function SheetPrint() {
  const tid = useAppStore((s) => s.currentTournamentId);
  const data = useLiveQuery(async () => {
    if (!tid) return null;
    const tournament = await db.tournaments.where('tournamentId').equals(tid).first();
    const events = sortEventsByClass(await db.events.where('tournamentId').equals(tid).toArray());
    const ids = events.map((e) => e.eventId);
    const [draws, entries, matches, players, courts] = await Promise.all([
      ids.length ? db.draws.where('eventId').anyOf(ids).toArray() : [],
      ids.length ? db.entries.where('eventId').anyOf(ids).toArray() : [],
      ids.length ? db.matches.where('eventId').anyOf(ids).toArray() : [],
      db.players.toArray(),
      db.courts.where('tournamentId').equals(tid).toArray(),
    ]);
    return { tournament, events, draws, entries, matches, players, courts };
  }, [tid]);

  const [kind, setKind] = useState<Kind>('league');
  const [paper, setPaperState] = useState<Record<Kind, SheetPaper>>({ league: loadPaper('league'), referee: loadPaper('referee') });
  const setPaper = (p: SheetPaper) => { setPaperState((x) => ({ ...x, [kind]: p })); try { localStorage.setItem(LS_PAPER(kind), p); } catch { /* */ } };
  const [leagues, setLeagues] = useState<LeagueSheet[]>([]);
  const [referees, setReferees] = useState<RefereeSheet[]>([]);
  const [withResults, setWithResults] = useState(false);
  const [withScore, setWithScore] = useState(false);
  const [pickedLeagues, setPickedLeagues] = useState<Set<string> | null>(null);
  const [refEvent, setRefEvent] = useState<string>('');
  const [pickedMatches, setPickedMatches] = useState<Set<string> | null>(null);
  const [blankN, setBlankN] = useState(4);

  const leagueEvents = useMemo(() => (data?.events ?? []).filter((e) => data?.draws.find((d) => d.eventId === e.eventId)?.drawType === 'roundRobin'), [data]);
  const picked = pickedLeagues ?? new Set(leagueEvents.map((e) => e.eventId));
  const refEvt = (data?.events ?? []).find((e) => e.eventId === refEvent) ?? data?.events[0];
  const refMatches: Match[] = useMemo(() => {
    if (!data || !refEvt) return [];
    return data.matches.filter((m) => m.eventId === refEvt.eventId && m.status !== 'walkover' && (m.player1Name || m.player2Name))
      .sort((a, b) => a.round - b.round || a.matchOrder - b.matchOrder || a.position - b.position);
  }, [data, refEvt]);
  const pickedM = pickedMatches ?? new Set(refMatches.filter((m) => m.status !== 'finished' && m.player1Name && m.player2Name && m.player1Name !== 'BYE' && m.player2Name !== 'BYE').map((m) => m.matchId));

  const makeLeagues = () => {
    if (!data) return;
    setLeagues(leagueEvents.filter((e) => picked.has(e.eventId)).map((e) => buildLeagueSheet(
      data.tournament, e, data.draws.find((d) => d.eventId === e.eventId)!, data.entries.filter((x) => x.eventId === e.eventId),
      data.players, data.matches.filter((m) => m.eventId === e.eventId), data.courts, withResults,
    )));
  };
  const makeReferees = () => {
    if (!data || !refEvt) return;
    const draw = data.draws.find((d) => d.eventId === refEvt.eventId);
    const total = Math.max(1, ...data.matches.filter((m) => m.eventId === refEvt.eventId).map((m) => m.round));
    setReferees(refMatches.filter((m) => pickedM.has(m.matchId)).map((m) => buildRefereeSheet(data.tournament, refEvt, draw, m, total, data.courts, withScore)));
  };
  // 最初に開いたときは、すぐ作っておく
  const builtOnce = useRef<Record<Kind, boolean>>({ league: false, referee: false });
  useEffect(() => {
    if (!data || builtOnce.current[kind]) return;
    builtOnce.current[kind] = true;
    if (kind === 'league') makeLeagues(); else makeReferees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, kind]);

  const rebuild = async () => {
    const edited = kind === 'league' ? leagues.length > 0 : referees.length > 0;
    if (edited && !(await siteConfirm({ title: '用紙を作り直す', message: 'プレビューで直した内容は消えて、大会のデータから作り直します。よろしいですか？', confirmLabel: '作り直す' }))) return;
    if (kind === 'league') makeLeagues(); else makeReferees();
  };

  const p = SHEET_PAPERS[paper[kind]];
  const W = p.w - SHEET_MARGIN * 2, H = p.h - SHEET_MARGIN * 2;
  const sheets = kind === 'league' ? leagues : referees;

  // プレビューの大きさ（横幅に合わせて縮める）
  const wrapRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(800);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, (avail - 2) / (p.w * MM_PX));

  const print = () => {
    if (sheets.length === 0) return;
    const pages = sheets.map((s) => renderToStaticMarkup(
      <div className="page">{kind === 'league'
        ? <LeagueSheetView sheet={s as LeagueSheet} W={W} H={H} editable={false} />
        : <RefereeSheetView sheet={s as RefereeSheet} W={W} H={H} editable={false} />}</div>,
    )).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${kind === 'league' ? 'リーグ表' : '審判用紙'} - ${data?.tournament?.name ?? ''}</title>
<style>@page{size:${p.css};margin:${SHEET_MARGIN}mm;}*{box-sizing:border-box;margin:0;padding:0;}html,body{background:#fff;}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.page{width:${W}mm;height:${H - 0.6}mm;overflow:hidden;page-break-after:always;break-after:page;}
.page:last-child{page-break-after:auto;break-after:auto;}
@media screen{body{background:#888;padding:10mm;}.page{background:#fff;margin:0 auto 10mm;box-shadow:0 2px 10px rgba(0,0,0,.3);outline:${SHEET_MARGIN}mm solid #fff;}}</style>
</head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('印刷の窓を開けませんでした。ポップアップを許可してください。'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const removeSheet = (id: string) => {
    if (kind === 'league') setLeagues((x) => x.filter((s) => s.id !== id)); else setReferees((x) => x.filter((s) => s.id !== id));
  };
  const addBlank = () => {
    if (kind === 'league') setLeagues((x) => [...x, blankLeagueSheet(data?.tournament?.name ?? '', blankN)]);
    else setReferees((x) => [...x, blankRefereeSheet(data?.tournament?.name ?? '', reiwaDate(data?.tournament?.date ?? ''))]);
  };

  if (!tid) return <p className="sp-empty">大会を選ぶと、リーグ表・審判用紙を印刷できます。</p>;

  return (
    <div className="sp">
      {/* 種類 */}
      <div className="sp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={kind === 'league'} className={kind === 'league' ? 'is-on' : ''} onClick={() => setKind('league')}><Table2 className="w-4 h-4" />リーグ表</button>
        <button type="button" role="tab" aria-selected={kind === 'referee'} className={kind === 'referee' ? 'is-on' : ''} onClick={() => setKind('referee')}><FileText className="w-4 h-4" />審判用紙</button>
      </div>

      <div className="sp-controls">
        <label className="sp-field">
          <span>用紙</span>
          <select value={paper[kind]} onChange={(e) => setPaper(e.target.value as SheetPaper)}>
            {Object.entries(SHEET_PAPERS).map(([k, v]) => <option key={k} value={k}>{v.label}{k === DEFAULT_PAPER[kind] ? '（既定）' : ''}</option>)}
          </select>
        </label>

        {kind === 'league' ? (
          <>
            <div className="sp-field sp-field--wide">
              <span>リーグ（{picked.size} / {leagueEvents.length}）</span>
              <div className="sp-checks">
                {leagueEvents.length === 0 && <span className="sp-note">この大会にはリーグ戦の種目がありません。空のリーグ表を足して使えます。</span>}
                {leagueEvents.map((e) => (
                  <label key={e.eventId} className="sp-check">
                    <input type="checkbox" checked={picked.has(e.eventId)} onChange={() => { const s = new Set(picked); if (s.has(e.eventId)) s.delete(e.eventId); else s.add(e.eventId); setPickedLeagues(s); }} />
                    {e.name}
                  </label>
                ))}
              </div>
            </div>
            <label className="sp-check"><input type="checkbox" checked={withResults} onChange={(e) => setWithResults(e.target.checked)} />入っている結果を入れる（外すと手書き用の空欄）</label>
          </>
        ) : (
          <>
            <label className="sp-field">
              <span>種目</span>
              <select value={refEvt?.eventId ?? ''} onChange={(e) => { setRefEvent(e.target.value); setPickedMatches(null); }}>
                {(data?.events ?? []).map((e) => <option key={e.eventId} value={e.eventId}>{e.name}</option>)}
              </select>
            </label>
            <div className="sp-field sp-field--wide">
              <span>試合（{pickedM.size} / {refMatches.length}）<small>まだ終わっていない試合に印を付けています</small></span>
              <div className="sp-checks sp-checks--matches">
                {refMatches.length === 0 && <span className="sp-note">この種目には、まだ組み合わせの決まった試合がありません。空の審判用紙を足して使えます。</span>}
                {refMatches.map((m) => (
                  <label key={m.matchId} className="sp-check">
                    <input type="checkbox" checked={pickedM.has(m.matchId)} onChange={() => { const s = new Set(pickedM); if (s.has(m.matchId)) s.delete(m.matchId); else s.add(m.matchId); setPickedMatches(s); }} />
                    <span className="sp-check__m">{m.player1Name || '（未定）'} 対 {m.player2Name || '（未定）'}</span>
                    {m.status === 'finished' && <small>（終了 {m.score}）</small>}
                  </label>
                ))}
              </div>
            </div>
            <label className="sp-check"><input type="checkbox" checked={withScore} onChange={(e) => setWithScore(e.target.checked)} />入っているスコアを入れる（外すと手書き用の空欄）</label>
          </>
        )}

        <div className="sp-btns">
          <button type="button" className="btn btn--outline sp-btn" onClick={() => void rebuild()}><RefreshCw className="w-4 h-4" />この内容で作り直す</button>
          {kind === 'league' && (
            <select className="sp-blankn" value={blankN} onChange={(e) => setBlankN(Number(e.target.value))} aria-label="空のリーグ表のチーム数">
              {[3, 4, 5, 6, 7, 8].map((k) => <option key={k} value={k}>{k}チーム</option>)}
            </select>
          )}
          <button type="button" className="btn btn--outline sp-btn" onClick={addBlank}><Plus className="w-4 h-4" />空の{kind === 'league' ? 'リーグ表' : '審判用紙'}を足す</button>
          <button type="button" className="btn btn--primary sp-btn" onClick={print} disabled={sheets.length === 0}><Printer className="w-4 h-4" />{sheets.length} 枚を印刷</button>
        </div>
      </div>

      <p className="sp-note">プレビューの文字（大会名・種目・チーム名・所属・コートなど）は、押すと直せます。直した内容のまま印刷されます。用紙：{p.label}（余白 {SHEET_MARGIN}mm）</p>

      <div className="sp-preview" ref={wrapRef}>
        {sheets.length === 0 && <p className="sp-empty">作る用紙を選んで「この内容で作り直す」を押すか、空の用紙を足してください。</p>}
        {sheets.map((s, k) => (
          <div key={s.id} className="sp-item">
          <div className="sp-pagewrap" style={{ width: p.w * MM_PX * scale, height: p.h * MM_PX * scale }}>
            <div className="sp-page" style={{ width: `${p.w}mm`, height: `${p.h}mm`, padding: `${SHEET_MARGIN}mm`, transform: `scale(${scale})` }}>
              {kind === 'league'
                ? <LeagueSheetView sheet={s as LeagueSheet} W={W} H={H} editable onChange={(v) => setLeagues((x) => x.map((y) => (y.id === v.id ? v : y)))} />
                : <RefereeSheetView sheet={s as RefereeSheet} W={W} H={H} editable onChange={(v) => setReferees((x) => x.map((y) => (y.id === v.id ? v : y)))} />}
            </div>
          </div>
            <div className="sp-pagebar">
              <span>{k + 1} / {sheets.length}</span>
              <button type="button" onClick={() => removeSheet(s.id)} aria-label="この用紙を外す"><Trash2 className="w-3.5 h-3.5" />外す</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
