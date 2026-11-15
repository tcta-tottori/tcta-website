// =============================================================================
// リーグ表・審判用紙の紙面（プレビューと印刷の両方で使う）。
//   ・editable のときは、文字を押して直せる（contentEditable。離れたときに onChange）
//   ・印刷は同じ部品を renderToStaticMarkup で HTML にして、印刷用の窓に流す（SheetPrint.tsx）
//   ・寸法は用紙の大きさ（余白を除いた幅 W・高さ H、mm）から決める。文字の大きさは
//     基準の用紙（リーグ表は A4 横、審判用紙は B5 横）との比で伸び縮みする
// =============================================================================
import type { CSSProperties, ReactNode } from 'react';
import type { LeagueSheet, RefereeSheet } from './sheetModel';

const FONT = "'BIZ UDPGothic', 'Yu Gothic', 'YuGothic', 'Hiragino Sans', 'Meiryo', sans-serif";
const mm = (v: number) => `${v.toFixed(2)}mm`;

/** 直せる文字。editable でなければただの文字 */
function E({ value, onChange, editable, style, className }: {
  value: string; onChange?: (v: string) => void; editable: boolean; style?: CSSProperties; className?: string;
}) {
  const base: CSSProperties = { whiteSpace: 'pre-line', outline: 'none', ...style };
  if (!editable) return <span className={className} style={base}>{value}</span>;
  return (
    <span
      className={`sp-edit ${className ?? ''}`}
      style={{ ...base, minWidth: '6mm', display: base.display ?? 'inline-block' }}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e) => onChange?.((e.currentTarget.innerText || '').replace(/\n+$/, ''))}
      onKeyDown={(e) => { if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur(); }}
    >{value}</span>
  );
}

const B = '0.35mm solid #000';
const B2 = '0.6mm solid #000';

// -----------------------------------------------------------------------------
// リーグ表
// -----------------------------------------------------------------------------
export function LeagueSheetView({ sheet, W, H, editable, onChange }: {
  sheet: LeagueSheet; W: number; H: number; editable: boolean; onChange?: (s: LeagueSheet) => void;
}) {
  const s = Math.min(W / 281, H / 194);
  const f = (v: number) => mm(v * s);
  const n = sheet.players.length;
  const set = (patch: Partial<LeagueSheet>) => onChange?.({ ...sheet, ...patch });
  const setPlayer = (k: number, patch: Partial<LeagueSheet['players'][number]>) =>
    set({ players: sheet.players.map((p, i) => (i === k ? { ...p, ...patch } : p)) });
  const setCell = (i: number, j: number, v: string) => set({ cells: sheet.cells.map((r, a) => (a === i ? r.map((c, b) => (b === j ? v : c)) : r)) });
  const setArr = (key: 'results' | 'ranks', k: number, v: string) => set({ [key]: sheet[key].map((x, i) => (i === k ? v : x)) } as Partial<LeagueSheet>);

  const headH = 22 * s;
  // 下の欄（試合順・順位の決め方）は行数に合わせる
  const footLines = 2 + sheet.rules.split('\n').length;
  const footH = (footLines * 3.6 * 1.55 + 4) * s;
  const tableH = H - headH - footH;
  const hdrRowH = Math.min(14 * s, tableH * 0.16);
  const rowH = (tableH - hdrRowH) / Math.max(1, n);
  const nameW = W * 0.31;
  const resW = W * 0.10;
  const rankW = W * 0.075;
  const cellW = (W - nameW - resW - rankW) / Math.max(1, n);
  const nameLines = sheet.players.map((p) => p.names.split('\n').length).reduce((a, b) => Math.max(a, b), 1);
  const namePx = Math.min(5 * s, (rowH / (nameLines + 0.6)) / 1.25);

  const td: CSSProperties = { border: B, padding: 0, textAlign: 'center', verticalAlign: 'middle' };
  return (
    <div style={{ width: mm(W), height: mm(H), fontFamily: FONT, color: '#000', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' }}>
      {/* 見出し：種目（大きく）と、右に大会名・試合方式 */}
      <div style={{ height: mm(headH), display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: f(2) }}>
        <E editable={editable} value={sheet.title} onChange={(v) => set({ title: v })} style={{ fontSize: f(11), fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1 }} />
        <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
          <div><E editable={editable} value={sheet.tournament} onChange={(v) => set({ tournament: v })} style={{ fontSize: f(5) }} /></div>
          <div><E editable={editable} value={sheet.format} onChange={(v) => set({ format: v })} style={{ fontSize: f(4.6) }} /></div>
        </div>
      </div>
      {/* 表 */}
      <table style={{ width: mm(W - 0.8), height: mm(tableH), borderCollapse: 'collapse', tableLayout: 'fixed', border: B2 }}>
        <colgroup>
          <col style={{ width: mm(nameW) }} />
          {sheet.players.map((_, j) => <col key={j} style={{ width: mm(cellW) }} />)}
          <col style={{ width: mm(resW) }} />
          <col style={{ width: mm(rankW) }} />
        </colgroup>
        <thead>
          <tr style={{ height: mm(hdrRowH) }}>
            <th style={{ ...td, textAlign: 'left', padding: `0 ${f(3)}`, fontWeight: 400 }}>
              <E editable={editable} value={sheet.league} onChange={(v) => set({ league: v })} style={{ fontSize: f(9), fontWeight: 400, marginRight: f(2) }} />
              <span style={{ fontSize: f(5) }}>リーグ</span>
              <E editable={editable} value={sheet.court} onChange={(v) => set({ court: v })} style={{ fontSize: f(4), float: 'right', marginTop: f(3) }} />
            </th>
            {sheet.players.map((p, j) => (
              <th key={j} style={{ ...td, fontWeight: 400 }}>
                <E editable={editable} value={p.short} onChange={(v) => setPlayer(j, { short: v })} style={{ fontSize: f(Math.min(4, 26 / Math.max(4, p.short.length) )), whiteSpace: 'nowrap' }} />
              </th>
            ))}
            <th style={{ ...td, fontWeight: 400, fontSize: f(4.8), letterSpacing: '0.4em' }}>成績</th>
            <th style={{ ...td, fontWeight: 400, fontSize: f(4.8), letterSpacing: '0.2em' }}>順位</th>
          </tr>
        </thead>
        <tbody>
          {sheet.players.map((p, i) => (
            <tr key={i} style={{ height: mm(rowH) }}>
              <td style={{ ...td, textAlign: 'left', padding: `0 ${f(2)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: f(3) }}>
                  <E editable={editable} value={p.no} onChange={(v) => setPlayer(i, { no: v })} style={{ fontSize: f(4.4), minWidth: f(4), textAlign: 'center' }} />
                  <E editable={editable} value={p.names} onChange={(v) => setPlayer(i, { names: v })} style={{ fontSize: mm(namePx), letterSpacing: '0.35em', lineHeight: 1.25, flex: '1 1 auto' }} />
                  <E editable={editable} value={p.affs} onChange={(v) => setPlayer(i, { affs: v })} style={{ fontSize: mm(namePx * 0.82), lineHeight: 1.25 * (namePx / (namePx * 0.82)), whiteSpace: 'pre-line' }} />
                </div>
              </td>
              {sheet.players.map((_, j) => (
                i === j
                  ? <td key={j} style={{ ...td, background: `linear-gradient(to top right, transparent calc(50% - 0.2mm), #000 calc(50% - 0.2mm), #000 calc(50% + 0.2mm), transparent calc(50% + 0.2mm))` }} />
                  : <td key={j} style={td}><E editable={editable} value={sheet.cells[i]?.[j] ?? ''} onChange={(v) => setCell(i, j, v)} style={{ fontSize: f(5.5), minWidth: f(10), minHeight: f(6) }} /></td>
              ))}
              <td style={td}><E editable={editable} value={sheet.results[i] ?? ''} onChange={(v) => setArr('results', i, v)} style={{ fontSize: f(4.4), minWidth: f(10), minHeight: f(6) }} /></td>
              <td style={td}><E editable={editable} value={sheet.ranks[i] ?? ''} onChange={(v) => setArr('ranks', i, v)} style={{ fontSize: f(6), minWidth: f(6), minHeight: f(6) }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* 下：試合順と順位の決め方 */}
      <div style={{ height: mm(footH), paddingTop: f(2), fontSize: f(3.6), lineHeight: 1.55 }}>
        <div>① <E editable={editable} value={sheet.order} onChange={(v) => set({ order: v })} /><span style={{ marginLeft: f(8) }}><E editable={editable} value={sheet.orderNote} onChange={(v) => set({ orderNote: v })} /></span></div>
        <div>② <E editable={editable} value={sheet.ruleTitle} onChange={(v) => set({ ruleTitle: v })} /></div>
        <div style={{ paddingLeft: f(6) }}><E editable={editable} value={sheet.rules} onChange={(v) => set({ rules: v })} style={{ display: 'block' }} /></div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 審判用紙
// -----------------------------------------------------------------------------
export function RefereeSheetView({ sheet, W, H, editable, onChange }: {
  sheet: RefereeSheet; W: number; H: number; editable: boolean; onChange?: (s: RefereeSheet) => void;
}) {
  const s = Math.min(W / 241, H / 166);
  const f = (v: number) => mm(v * s);
  const sy = H / 166;
  const set = (patch: Partial<RefereeSheet>) => onChange?.({ ...sheet, ...patch });
  const setSide = (k: 'left' | 'right', patch: Partial<RefereeSheet['left']>) => set({ [k]: { ...sheet[k], ...patch } } as Partial<RefereeSheet>);
  const td: CSSProperties = { border: B, padding: `0 ${f(1.5)}`, textAlign: 'center', verticalAlign: 'middle' };
  // 下の表（選手・スコア）の高さ：見出し 15・大会名 7・上の表 45・間 5・下の帯 7（基準の高さ 166 に対して）
  const bottomH = H - (15 + 7 + 45 + 5 + 7) * sy;
  const label = (t: string): ReactNode => <span style={{ fontSize: f(5), letterSpacing: '0.5em', marginRight: '-0.5em' }}>{t}</span>;
  const side = (k: 'left' | 'right') => (
    <td style={{ ...td, textAlign: 'left', padding: `${f(1.5)} ${f(3)}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: f(4) }}>
        <E editable={editable} value={sheet[k].no} onChange={(v) => setSide(k, { no: v })} style={{ fontSize: f(5), minWidth: f(5), textAlign: 'center' }} />
        <E editable={editable} value={sheet[k].names} onChange={(v) => setSide(k, { names: v })} style={{ fontSize: f(6.2), lineHeight: 1.45, flex: '1 1 auto' }} />
        <E editable={editable} value={sheet[k].affs} onChange={(v) => setSide(k, { affs: v })} style={{ fontSize: f(5.2), lineHeight: 1.45 * (6.2 / 5.2) }} />
      </div>
    </td>
  );
  return (
    <div style={{ width: mm(W), height: mm(H), fontFamily: FONT, color: '#000', position: 'relative', overflow: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {/* 見出し */}
      <div style={{ textAlign: 'center', height: mm(15 * sy), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <E editable={editable} value={sheet.title} onChange={(v) => set({ title: v })} style={{ fontSize: f(11), fontWeight: 700, letterSpacing: '0.6em', marginRight: '-0.6em' }} />
      </div>
      <div style={{ height: mm(7 * sy), display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', fontSize: f(4) }}>
        <span />
        <span>（<E editable={editable} value={sheet.tournament} onChange={(v) => set({ tournament: v })} />）</span>
        <span style={{ textAlign: 'right' }}><E editable={editable} value={sheet.date} onChange={(v) => set({ date: v })} /></span>
      </div>
      {/* 種目・回戦・コート・試合方法・開始時間 */}
      <table style={{ width: 'calc(100% - 0.8mm)', borderCollapse: 'collapse', tableLayout: 'fixed', border: B2 }}>
        <colgroup><col style={{ width: '19%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13.5%' }} /><col style={{ width: '25.5%' }} /><col style={{ width: '13.5%' }} /><col style={{ width: '15.5%' }} /></colgroup>
        <tbody>
          <tr style={{ height: mm(21 * sy) }}>
            <td style={td}>{label('種目')}</td>
            <td colSpan={3} style={td}><E editable={editable} value={sheet.event} onChange={(v) => set({ event: v })} style={{ fontSize: f(6), lineHeight: 1.15, letterSpacing: '0.25em' }} /></td>
            <td style={td}><span style={{ fontSize: f(5) }}>回戦</span></td>
            <td style={td}><E editable={editable} value={sheet.round} onChange={(v) => set({ round: v })} style={{ fontSize: f(6.2) }} /></td>
          </tr>
          <tr style={{ height: mm(24 * sy) }}>
            <td style={td}><span style={{ fontSize: f(4.6) }}>コートNo.</span></td>
            <td style={td}><E editable={editable} value={sheet.court} onChange={(v) => set({ court: v })} style={{ fontSize: f(11) }} /></td>
            <td style={td}><span style={{ fontSize: f(4.6) }}>試合方法</span></td>
            <td style={td}><E editable={editable} value={sheet.method} onChange={(v) => set({ method: v })} style={{ fontSize: f(4.4), lineHeight: 1.2 }} /></td>
            <td style={td}><span style={{ fontSize: f(4.6) }}>開始時間</span></td>
            <td style={td}><E editable={editable} value={sheet.start} onChange={(v) => set({ start: v })} style={{ fontSize: f(6.5), minWidth: f(14), minHeight: f(6) }} /></td>
          </tr>
        </tbody>
      </table>
      <div style={{ height: mm(5 * sy) }} />
      {/* 選手・スコア */}
      <table style={{ width: 'calc(100% - 0.8mm)', height: mm(bottomH), borderCollapse: 'collapse', tableLayout: 'fixed', border: B2 }}>
        <colgroup><col style={{ width: '19%' }} /><col style={{ width: '40.5%' }} /><col style={{ width: '40.5%' }} /></colgroup>
        <tbody>
          <tr style={{ height: mm(bottomH * 0.48) }}>
            <td style={td}>{label('選手氏名')}</td>
            {side('left')}
            {side('right')}
          </tr>
          <tr style={{ height: mm(bottomH * 0.52) }}>
            <td style={td}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: mm(bottomH * 0.52 - 2), paddingTop: f(6), paddingBottom: f(2) }}>
                {label('スコア')}
                <span style={{ fontSize: f(4.6) }}>（TB）</span>
              </div>
            </td>
            <td colSpan={2} style={{ ...td, position: 'relative' }}>
              <E editable={editable} value={sheet.score} onChange={(v) => set({ score: v })} style={{ fontSize: f(9), minWidth: f(40), minHeight: f(10) }} />
              {!sheet.score && <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', fontSize: f(8), pointerEvents: 'none' }}>－</span>}
              <span aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: f(2), transform: 'translateX(-50%)', fontSize: f(4.6), letterSpacing: '1.6em', pointerEvents: 'none' }}>（ ）</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ textAlign: 'right', fontSize: f(3.8), paddingTop: f(1.2) }}>
        <E editable={editable} value={sheet.footer} onChange={(v) => set({ footer: v })} />
      </div>
    </div>
  );
}
