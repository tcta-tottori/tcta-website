// エントリー受付の「対戦表」表示。協会サイトに載るドロー表と同じ形で描き、選手の枠をタップして受付する。
//   ・トーナメント：8 枠以上は左右に分け、両側から中央の決勝へ線が伸びる（左山 1〜N/2、右山 N/2+1〜N）。
//     4 枠以下は左に縦 1 列。1 回戦の時刻はその試合の線の横に出す
//   ・リーグ：①②③… を横に並べた表（サイトのプログラムと同じ）と、その下に試合順
//   ・枠の色：受付済＝墨の塗り＋チェック、DEF＝赤の取り消し線、未受付＝白。BYE は灰色で押せない
//   ・ズーム・全体表示・全画面は ZoomPan.tsx
import { Check } from 'lucide-react';
import ZoomPan from './ZoomPan';
import { generateLeagueMatchOrder } from '../draw/rebuildMatches';

export type SheetSlot = {
  position: number;
  seed: number;
  isBye: boolean;
  hasEntry: boolean;
  name: string;
  partner: string;
  affiliation: string;
  state: 'none' | 'checked' | 'def';
  /** 順位別トーナメントの枠の見出し（例 B1位）。選手が入るまで出す */
  label?: string;
};

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯';

// 寸法（px）。ズームで拡大して読むので、等倍でもはっきり読める大きさにする
const NAME_W = 236;
const ROUND_W = 34;
const CENTER_W = 44;
const PAD = 16;

export default function EntrySheet({ eventName, drawSize, isLeague, doubles, slots, matchTimes, leagueCourts, onTap, fill = false }: {
  /** 親の高さいっぱいに広げる（全画面の対戦表） */
  fill?: boolean;
  eventName: string;
  drawSize: number;
  isLeague: boolean;
  doubles: boolean;
  slots: SheetSlot[];
  /** 1 回戦の時刻 { 上側の枠番号: "HH:MM" } */
  matchTimes?: Record<number | string, string>;
  leagueCourts?: string[];
  onTap: (position: number) => void;
}) {
  const byPos = new Map(slots.map((s) => [s.position, s]));
  const rowH = doubles ? 58 : 44;

  if (isLeague) {
    const list = slots.filter((s) => s.hasEntry).sort((a, b) => a.position - b.position);
    // PC はサイトのプログラムと同じ横 1 列。スマホは縦 1 列（全体表示でも読める大きさに）
    const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
    const cols = narrow ? 1 : list.length;
    const lines = Math.ceil(list.length / cols);
    const cellW = 260, labelW = narrow ? 96 : 120, headH = 34;
    const width = PAD * 2 + labelW + cellW * cols + 4;
    const height = PAD * 2 + headH + rowH * lines + 18 + 40;
    const order = generateLeagueMatchOrder(list.length).map(([a, b]) => `${CIRCLED[a] ?? a + 1}-${CIRCLED[b] ?? b + 1}`).join('  ');
    return (
      <ZoomPan width={width} height={height} label={`${eventName}の対戦表`} fill={fill}>
        <div className="esh" style={{ width, height, padding: PAD }}>
          <p className="esh__title" style={{ height: headH }}>{eventName}</p>
          <div className={`esh-league ${narrow ? 'is-narrow' : ''}`} style={{ gridTemplateColumns: `${labelW}px repeat(${cols}, ${cellW}px)`, gridTemplateRows: `repeat(${lines}, ${rowH}px)` }}>
            <div className="esh-league__label" style={{ gridRow: `1 / span ${lines}` }}>
              <b>リーグ</b>
              {leagueCourts?.length ? <small>No.{leagueCourts.join('・')}コート</small> : null}
            </div>
            {list.map((s, i) => <SlotBox key={s.position} s={s} no={CIRCLED[i] ?? String(i + 1)} h={rowH} onTap={onTap} />)}
          </div>
          <p className="esh-league__order">試合順：{order}</p>
        </div>
      </ZoomPan>
    );
  }

  const size = Math.max(2, drawSize);
  const split = size >= 8;
  const perSide = split ? size / 2 : size;
  const rounds = Math.round(Math.log2(perSide)); // 片側の回戦数
  const headH = 34;
  const sideW = NAME_W + ROUND_W * rounds;
  const width = PAD * 2 + (split ? sideW * 2 + CENTER_W : sideW + 30);
  const height = PAD * 2 + headH + perSide * rowH;
  const top0 = PAD + headH;
  const yOf = (i: number) => top0 + i * rowH + rowH / 2; // 片側の i 番目（0 始まり）の枠の中心

  /** 片側の線（right=true は右山。線は中央へ向かう） */
  const lines = (offset: number, right: boolean) => {
    const out: React.ReactNode[] = [];
    let ys = Array.from({ length: perSide }, (_, i) => yOf(i));
    const x0 = right ? width - PAD - NAME_W : PAD + NAME_W;
    const dir = right ? -1 : 1;
    for (let r = 1; r <= rounds; r++) {
      const xa = x0 + dir * ROUND_W * (r - 1), xb = x0 + dir * ROUND_W * r;
      const next: number[] = [];
      for (let k = 0; k < ys.length; k += 2) {
        const a = ys[k], b = ys[k + 1];
        out.push(<path key={`${offset}-${r}-${k}`} d={`M${xa} ${a}H${xb}M${xa} ${b}H${xb}M${xb} ${a}V${b}`} />);
        const mid = (a + b) / 2;
        next.push(mid);
        if (r === 1) {
          const t = matchTimes?.[offset + k + 1];
          if (t) out.push(<text key={`t-${offset}-${k}`} x={xb + dir * 4} y={mid - 4} textAnchor={right ? 'end' : 'start'} className="esh__time">{t}</text>);
        }
      }
      ys = next;
    }
    return { out, y: ys[0], x: x0 + dir * ROUND_W * rounds };
  };

  const left = lines(0, false);
  const right = split ? lines(perSide, true) : null;

  return (
    <ZoomPan width={width} height={height} label={`${eventName}の対戦表`} fill={fill}>
      <div className="esh" style={{ width, height }}>
        <p className="esh__title" style={{ position: 'absolute', left: PAD, top: PAD, height: headH }}>{eventName}<small>{size} ドロー</small></p>
        <svg className="esh__lines" width={width} height={height} aria-hidden="true">
          {left.out}
          {right?.out}
          {right ? <path d={`M${left.x} ${left.y}H${right.x}`} /> : <path d={`M${left.x} ${left.y}H${left.x + 24}`} />}
        </svg>
        {Array.from({ length: size }, (_, i) => {
          const pos = i + 1;
          const isRight = split && pos > perSide;
          const idx = isRight ? pos - perSide - 1 : pos - 1;
          const s: SheetSlot = byPos.get(pos) ?? { position: pos, seed: 0, isBye: true, hasEntry: false, name: '', partner: '', affiliation: '', state: 'none' };
          return (
            <div key={pos} className={`esh__cell ${isRight ? 'is-right' : ''}`} style={{ left: isRight ? width - PAD - NAME_W : PAD, top: top0 + idx * rowH, width: NAME_W, height: rowH }}>
              <SlotBox s={s} no={String(pos)} h={rowH} onTap={onTap} />
            </div>
          );
        })}
      </div>
    </ZoomPan>
  );
}

function SlotBox({ s, no, h, onTap }: { s: SheetSlot; no: string; h: number; onTap: (p: number) => void }) {
  if (!s.hasEntry) {
    return (
      <div className={`esh-slot is-bye ${s.label ? 'is-src' : ''}`} style={{ height: h }}>
        <span className="esh-slot__no">{no}</span>
        <span className="esh-slot__body"><span className="esh-slot__name">{s.label ? s.label : s.isBye ? 'BYE' : '—'}</span></span>
      </div>
    );
  }
  return (
    <button type="button" className={`esh-slot is-${s.state}`} style={{ height: h }} onClick={() => onTap(s.position)}
      aria-label={`${no}番 ${s.name}${s.partner ? `・${s.partner}` : ''}（${s.state === 'checked' ? '受付済' : s.state === 'def' ? '欠場' : '未受付'}）`}>
      <span className="esh-slot__no">{no}</span>
      {s.seed > 0 && <span className="esh-slot__seed">{s.seed}</span>}
      <span className="esh-slot__body">
        <span className="esh-slot__name">{s.name}{s.partner && <><br />{s.partner}</>}</span>
        {s.affiliation && <span className="esh-slot__aff">{s.affiliation}</span>}
      </span>
      <span className="esh-slot__mark" aria-hidden="true">{s.state === 'checked' ? <Check className="w-4 h-4" /> : s.state === 'def' ? 'DEF' : ''}</span>
    </button>
  );
}
