// =============================================================================
// リーグ表・審判用紙の紙面（HTML の文字列）と、印刷（PDF で保存）の窓を開く道具。
// 大会のページから開く「リーグ表・審判用紙」（src/pages/sheets.html.astro）で使う。
// 紙面は大会運営システムの印刷（tournament/src/features/print/SheetViews.tsx）と同じ構成にそろえる。
//   ・寸法は用紙の余白を除いた幅 W・高さ H（mm）から決め、文字の大きさは基準の用紙（リーグ表 A4 横・審判用紙 B5 横）との比で伸び縮みする
// =============================================================================

export interface SheetPlayer {
  /** 氏名（ダブルスは 2 行） */
  names: string;
  /** 所属（ダブルスは 2 行） */
  affs: string;
  /** 対戦の列の見出し（姓。ダブルスは「谷口・近藤」） */
  short: string;
}

export interface LeagueSheetData {
  title: string;      // 男子A級シングルス
  league: string;     // A
  court: string;      // No.8 コート
  tournament: string; // 第41回鳥取市長杯テニス大会
  format: string;     // 6ゲームマッチ・ノーアド（6-6タイブレーク）
  players: SheetPlayer[];
  order: string;      // ①-② ③-④ …
  orderNote: string;  // 1番目の選手が進行管理をお願いします。
  rules: string[];    // 順位の決め方（1 行ずつ）
}

export interface RefereeSide { no: string; names: string; affs: string }
export interface RefereeSheetData {
  tournament: string;
  date: string;   // 令和8年11月23日
  event: string;  // 男子A級シングルス\nAリーグ
  round: string;  // リーグ戦
  court: string;
  method: string; // 6ゲームマッチ\nノーアド\n(6-6タイブレーク)
  left: RefereeSide;
  right: RefereeSide;
}

export const PAPERS: Record<string, { label: string; w: number; h: number }> = {
  'a4-landscape': { label: 'A4 横', w: 297, h: 210 },
  'a4-portrait': { label: 'A4 縦', w: 210, h: 297 },
  'b5-landscape': { label: 'B5 横', w: 257, h: 182 },
  'b5-portrait': { label: 'B5 縦', w: 182, h: 257 },
  'b4-landscape': { label: 'B4 横', w: 364, h: 257 },
  'a3-landscape': { label: 'A3 横', w: 420, h: 297 },
};
const MARGIN = 8;
const FONT = "'BIZ UDPGothic','Yu Gothic','YuGothic','Hiragino Sans','Meiryo',sans-serif";
const B = '0.35mm solid #000';
const B2 = '0.6mm solid #000';
const mm = (v: number) => `${v.toFixed(2)}mm`;
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** 改行を <br> に */
const br = (s: string) => esc(s).replace(/\n/g, '<br>');

export const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

/** リーグの試合順（大会運営システムの generateLeagueMatchOrder と同じ） */
export function matchOrder(k: number): [number, number][] {
  if (k === 3) return [[0, 1], [1, 2], [0, 2]];
  if (k === 4) return [[0, 1], [2, 3], [0, 2], [1, 3], [1, 2], [0, 3]];
  if (k === 5) return [[0, 1], [2, 3], [0, 4], [1, 2], [3, 4], [0, 2], [1, 3], [2, 4], [0, 3], [1, 4]];
  const out: [number, number][] = [];
  const odd = k % 2 !== 0, total = odd ? k + 1 : k;
  const rot = Array.from({ length: total - 1 }, (_, i) => i + 1);
  for (let r = 0; r < total - 1; r++) {
    if (rot[0] < k) out.push([0, rot[0]]);
    for (let i = 1; i <= (total - 2) / 2; i++) {
      const a = rot[i], b = rot[total - 1 - i];
      if (a < k && b < k) out.push([Math.min(a, b), Math.max(a, b)]);
    }
    rot.unshift(rot.pop()!);
  }
  return out;
}

/** 'YYYY-MM-DD' → 令和8年11月23日 */
export function reiwaDate(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `令和${Number(m[1]) - 2018}年${Number(m[2])}月${Number(m[3])}日` : String(iso ?? '');
}

/** 「男子A級シングルス Aリーグ」→ ['男子A級シングルス', 'A']（「決勝リーグ」→ ['…', '決勝']） */
export function splitLeagueName(name: string): [string, string] {
  const t = String(name).trim();
  const m = t.match(/^(.*?)[\s　]*([A-ZＡ-Ｚa-z0-9０-９]+)\s*リーグ$/);
  if (m) return [m[1].trim(), m[2].normalize('NFKC')];
  const m2 = t.match(/^(.*?)[\s　]+(\S*)リーグ$/);
  if (m2) return [m2[1].trim(), m2[2]];
  return [t, ''];
}

// -----------------------------------------------------------------------------
// リーグ表（基準 A4 横：余白を除いて 281×194mm）
// -----------------------------------------------------------------------------
export function leagueSheetHtml(d: LeagueSheetData, W: number, H: number): string {
  const s = Math.min(W / 281, H / 194);
  const f = (v: number) => mm(v * s);
  const n = Math.max(1, d.players.length);
  const headH = 22 * s;
  const footLines = 2 + d.rules.length + (n >= 6 ? 1 : 0);
  const footH = (footLines * 3.6 * 1.55 + 4) * s;
  const tableH = H - headH - footH;
  const hdrRowH = Math.min(14 * s, tableH * 0.16);
  const rowH = (tableH - hdrRowH) / n;
  const nameW = W * 0.31, resW = W * 0.10, rankW = W * 0.075;
  const cellW = (W - nameW - resW - rankW) / n;
  const nameLines = d.players.reduce((a, p) => Math.max(a, p.names.split('\n').length), 1);
  const namePx = Math.min(5 * s, (rowH / (nameLines + 0.6)) / 1.25);
  const td = `border:${B};padding:0;text-align:center;vertical-align:middle;`;
  const pct = (v: number) => `${(v / W * 100).toFixed(3)}%`;
  const head = `<tr style="height:${mm(hdrRowH)}"><th style="${td}text-align:left;padding:0 ${f(3)};font-weight:400"><span style="font-size:${f(9)};margin-right:${f(2)}">${esc(d.league)}</span><span style="font-size:${f(5)}">リーグ</span><span style="font-size:${f(4)};float:right;margin-top:${f(3)}">${esc(d.court)}</span></th>${
    d.players.map((p) => `<th style="${td}font-weight:400"><span style="font-size:${f(Math.min(4, 26 / Math.max(4, p.short.length)))};white-space:nowrap">${esc(p.short)}</span></th>`).join('')
  }<th style="${td}font-weight:400;font-size:${f(4.8)};letter-spacing:.4em">成績</th><th style="${td}font-weight:400;font-size:${f(4.8)};letter-spacing:.2em">順位</th></tr>`;
  const rows = d.players.map((p, i) => `<tr style="height:${mm(rowH)}"><td style="${td}text-align:left;padding:0 ${f(2)}"><div style="display:flex;align-items:center;gap:${f(3)}"><span style="font-size:${f(4.4)};min-width:${f(4)};text-align:center">${i + 1}</span><span style="font-size:${mm(namePx)};letter-spacing:.35em;line-height:1.25;flex:1 1 auto">${br(p.names)}</span><span style="font-size:${mm(namePx * 0.82)};line-height:${(1.25 / 0.82).toFixed(3)}">${br(p.affs)}</span></div></td>${
    d.players.map((_, j) => (i === j
      ? `<td style="${td}background:linear-gradient(to top right,transparent calc(50% - .2mm),#000 calc(50% - .2mm),#000 calc(50% + .2mm),transparent calc(50% + .2mm))"></td>`
      : `<td style="${td}"></td>`)).join('')
  }<td style="${td}"></td><td style="${td}"></td></tr>`).join('');
  return `<div class="sheet" style="width:${mm(W)};height:${mm(H)};font-family:${FONT};color:#000;overflow:hidden;box-sizing:border-box">
    <div style="height:${mm(headH)};display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:${f(2)}">
      <span style="font-size:${f(11)};font-weight:700;line-height:1">${esc(d.title)}</span>
      <span style="text-align:right;line-height:1.25"><span style="display:block;font-size:${f(5)}">${esc(d.tournament)}</span><span style="display:block;font-size:${f(4.6)}">${esc(d.format)}</span></span>
    </div>
    <div style="width:${mm(W)};height:${mm(tableH)};box-sizing:border-box;border:${B2};border-radius:${f(3)};overflow:hidden">
      <table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;border-style:hidden">
        <colgroup><col style="width:${pct(nameW)}">${d.players.map(() => `<col style="width:${pct(cellW)}">`).join('')}<col style="width:${pct(resW)}"><col style="width:${pct(rankW)}"></colgroup>
        <thead>${head}</thead><tbody>${rows}</tbody>
      </table>
    </div>
    <div style="height:${mm(footH)};padding-top:${f(2)};font-size:${f(3.6)};line-height:1.55">
      <div>① 試合順：${esc(d.order)}<span style="margin-left:${f(8)}">${esc(d.orderNote)}</span></div>
      <div>② リーグ戦の順位決定方法</div>
      ${d.rules.map((r, k) => `<div style="padding-left:${f(6)}">（${k + 1}）${esc(r)}</div>`).join('')}
    </div>
  </div>`;
}

// -----------------------------------------------------------------------------
// 審判用紙（基準 B5 横：余白を除いて 241×166mm）
// -----------------------------------------------------------------------------
export function refereeSheetHtml(d: RefereeSheetData, W: number, H: number): string {
  const s = Math.min(W / 241, H / 166);
  const f = (v: number) => mm(v * s);
  const sy = H / 166;
  const td = `border:${B};padding:0 ${f(1.5)};text-align:center;vertical-align:middle;`;
  const bottomH = H - (15 + 7 + 45 + 5 + 7) * sy;
  const label = (t: string) => `<span style="font-size:${f(5)};letter-spacing:.5em;margin-right:-.5em">${t}</span>`;
  const side = (x: RefereeSide) => `<td style="${td}text-align:left;padding:${f(1.5)} ${f(3)}"><div style="display:flex;align-items:center;gap:${f(4)}"><span style="font-size:${f(5)};min-width:${f(5)};text-align:center">${esc(x.no)}</span><span style="font-size:${f(6.2)};line-height:1.45;flex:1 1 auto">${br(x.names)}</span><span style="font-size:${f(5.2)};line-height:${(1.45 * 6.2 / 5.2).toFixed(3)}">${br(x.affs)}</span></div></td>`;
  return `<div class="sheet" style="width:${mm(W)};height:${mm(H)};font-family:${FONT};color:#000;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column">
    <div style="height:${mm(15 * sy)};display:flex;align-items:center;justify-content:center"><span style="font-size:${f(11)};font-weight:700;letter-spacing:.6em;margin-right:-.6em">審判用紙</span></div>
    <div style="height:${mm(7 * sy)};display:grid;grid-template-columns:1fr auto 1fr;align-items:center;font-size:${f(4)}"><span></span><span>${d.tournament ? `（${esc(d.tournament)}）` : ''}</span><span style="text-align:right">${esc(d.date)}</span></div>
    <table style="width:calc(100% - .8mm);border-collapse:collapse;table-layout:fixed;border:${B2}">
      <colgroup><col style="width:19%"><col style="width:13%"><col style="width:13.5%"><col style="width:25.5%"><col style="width:13.5%"><col style="width:15.5%"></colgroup>
      <tbody>
        <tr style="height:${mm(21 * sy)}"><td style="${td}">${label('種目')}</td><td colspan="3" style="${td}"><span style="font-size:${f(6)};line-height:1.15;letter-spacing:.25em">${br(d.event)}</span></td><td style="${td}"><span style="font-size:${f(5)}">回戦</span></td><td style="${td}"><span style="font-size:${f(6.2)}">${esc(d.round)}</span></td></tr>
        <tr style="height:${mm(24 * sy)}"><td style="${td}"><span style="font-size:${f(4.6)}">コートNo.</span></td><td style="${td}"><span style="font-size:${f(11)}">${esc(d.court)}</span></td><td style="${td}"><span style="font-size:${f(4.6)}">試合方法</span></td><td style="${td}"><span style="font-size:${f(4.4)};line-height:1.2">${br(d.method)}</span></td><td style="${td}"><span style="font-size:${f(4.6)}">開始時間</span></td><td style="${td}"></td></tr>
      </tbody>
    </table>
    <div style="height:${mm(5 * sy)}"></div>
    <table style="width:calc(100% - .8mm);height:${mm(bottomH)};border-collapse:collapse;table-layout:fixed;border:${B2}">
      <colgroup><col style="width:19%"><col style="width:40.5%"><col style="width:40.5%"></colgroup>
      <tbody>
        <tr style="height:${mm(bottomH * 0.48)}"><td style="${td}">${label('選手氏名')}</td>${side(d.left)}${side(d.right)}</tr>
        <tr style="height:${mm(bottomH * 0.52)}"><td style="${td}"><div style="display:flex;flex-direction:column;justify-content:space-between;height:${mm(bottomH * 0.52 - 2)};padding-top:${f(6)};padding-bottom:${f(2)}">${label('スコア')}<span style="font-size:${f(4.6)}">（TB）</span></div></td>
          <td colspan="2" style="${td}position:relative"><span style="position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font-size:${f(8)}">－</span><span style="position:absolute;left:50%;bottom:${f(2)};transform:translateX(-50%);font-size:${f(4.6)};letter-spacing:1.6em">（ ）</span></td></tr>
      </tbody>
    </table>
    <div style="text-align:right;font-size:${f(3.8)};padding-top:${f(1.2)}">鳥取市テニス協会</div>
  </div>`;
}

/** 紙面（1 枚ずつ）を、印刷の窓に並べて印刷画面を出す（印刷画面で「PDF に保存」を選ぶとダウンロードになる） */
export function openPrint(title: string, paperKey: string, pages: ((W: number, H: number) => string)[]): boolean {
  const p = PAPERS[paperKey] ?? PAPERS['a4-landscape'];
  const W = p.w - MARGIN * 2, H = p.h - MARGIN * 2 - 0.6; // 0.6mm は端数で 2 枚目に溢れないための余り
  const body = pages.map((fn) => `<div class="pg">${fn(W, H)}</div>`).join('');
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${p.w}mm ${p.h}mm;margin:${MARGIN}mm;}*{box-sizing:border-box;margin:0;padding:0;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.pg{break-after:page;page-break-after:always;}.pg:last-child{break-after:auto;page-break-after:auto;}@media screen{body{background:#e5e7eb;padding:12px;}.pg{width:${p.w}mm;padding:${MARGIN}mm;margin:0 auto 12px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15);}}</style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open(); win.document.write(html); win.document.close();
  return true;
}
