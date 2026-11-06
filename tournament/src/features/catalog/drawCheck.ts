// 運営をはじめる前のドローの確認（ReviewPage.tsx）。ドローの形・当たり方・名前・所属を見て、気をつける所を並べる。
//   error … このままだと運営できない・試合が正しく作られない
//   warn  … 直したほうがよい（音声コールで読めない、同じ人が 2 回いる など）
//   info  … 念のため見ておく（同じ所属どうしが 1 回戦で当たる など）
import type { CatalogDrawEvent, CatalogDrawPlayer } from './catalogApi';
import { hasFullwidth } from '../../lib/halfwidth';

export type IssueLevel = 'error' | 'warn' | 'info';
export interface DrawIssue {
  level: IssueLevel;
  /** 種目の番号（draft.events の添字） */
  event: number;
  /** 枠番号（あれば） */
  position?: number;
  /** 何についてか（名前・所属・ドロー…） */
  kind: 'shape' | 'name' | 'furigana' | 'affiliation' | 'seed' | 'pairing' | 'time' | 'duplicate';
  message: string;
  /** その場で直すための選手名（ふりがなの追加など） */
  player?: string;
}

const keyOf = (name: string) => (name ?? '').replace(/[\s\u3000]+/g, '');
const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

/** 1 回戦の組（枠 2k-1 と 2k）。k は 1 から */
export function pairsOf(ev: CatalogDrawEvent): { k: number; top: CatalogDrawPlayer | null; bottom: CatalogDrawPlayer | null }[] {
  const byPos = new Map(ev.players.map((p) => [p.position, p]));
  const out = [];
  for (let k = 1; k * 2 <= ev.drawSize; k++) out.push({ k, top: byPos.get(2 * k - 1) ?? null, bottom: byPos.get(2 * k) ?? null });
  return out;
}

/** 1 回戦の組 k の勝者（または不戦勝で上がる人）が 2 回戦で当たる相手の説明 */
export function secondRoundOpponent(ev: CatalogDrawEvent, k: number): string {
  if (ev.drawSize < 4) return '';
  const pairs = pairsOf(ev);
  const other = pairs[(k - 1) ^ 1];
  if (!other) return '';
  const a = other.top, b = other.bottom;
  if (a && b) return `${a.name} と ${b.name} の勝者`;
  if (a || b) return (a ?? b)!.name;
  return '相手なし（不戦勝）';
}

export function checkDraw(
  events: CatalogDrawEvent[],
  dict: { players: Set<string>; affiliations: Set<string> },
): DrawIssue[] {
  const issues: DrawIssue[] = [];
  const seenAcross = new Map<string, { name: string; evs: string[] }>();

  events.forEach((ev, ei) => {
    const add = (i: Omit<DrawIssue, 'event'>) => issues.push({ ...i, event: ei });
    if (!ev.isRoundRobin && !isPow2(ev.drawSize)) add({ level: 'error', kind: 'shape', message: `ドローの枠数 ${ev.drawSize} が 2・4・8・16… ではありません` });
    // 順位別トーナメント：枠の元のリーグがあるか・その順位がいるかだけを見る（選手はリーグの順位が決まってから入る）
    if (ev.sources?.length) {
      for (const src of ev.sources) {
        const lg = events.find((x) => x.eventName === src.league);
        if (!lg) add({ level: 'error', kind: 'shape', position: src.position, message: `${src.position} 番の枠の元のリーグ「${src.league}」がありません` });
        else if (src.rank > lg.players.length) add({ level: 'warn', kind: 'shape', position: src.position, message: `${src.position} 番の枠：「${src.league}」は ${lg.players.length} チームなので ${src.rank} 位がいません` });
      }
      return;
    }
    if (ev.players.length === 0) add({ level: 'error', kind: 'shape', message: '選手がいません' });
    if (ev.players.length === 1) add({ level: 'warn', kind: 'shape', message: '選手が 1 人だけです（試合が成立しません）' });

    // 同じ人が同じ種目に 2 回
    const inEvent = new Map<string, number[]>();
    for (const p of ev.players) {
      const names = [p.name, p.partnerName].filter(Boolean) as string[];
      for (const n of names) {
        const k = keyOf(n);
        inEvent.set(k, [...(inEvent.get(k) ?? []), p.position]);
        const cur = seenAcross.get(k);
        seenAcross.set(k, { name: cur?.name ?? n, evs: [...new Set([...(cur?.evs ?? []), ev.eventName])] });
      }
    }
    for (const [, pos] of inEvent) if (pos.length > 1) add({ level: 'warn', kind: 'duplicate', position: pos[1], message: `同じ選手が ${pos.join('・')} 番の枠にいます` });

    // 名前・ふりがな・所属
    for (const p of ev.players) {
      for (const [n, aff] of [[p.name, p.affiliation], ...(p.partnerName ? [[p.partnerName, p.partnerAffiliation ?? '']] : [])] as [string, string][]) {
        if (!/[\s\u3000]/.test(n.trim())) add({ level: 'warn', kind: 'name', position: p.position, player: n, message: `「${n}」の姓と名の間に空白がありません` });
        if (hasFullwidth(n)) add({ level: 'info', kind: 'name', position: p.position, player: n, message: `「${n}」に全角の英数字があります（保存すると半角になります）` });
        if (!dict.players.has(keyOf(n))) add({ level: 'warn', kind: 'furigana', position: p.position, player: n, message: `「${n}」のふりがなが辞書にありません（音声コールで読めません）` });
        if (!aff) add({ level: 'warn', kind: 'affiliation', position: p.position, player: n, message: `「${n}」の所属が空です` });
        else if (!dict.affiliations.has(aff)) add({ level: 'info', kind: 'affiliation', position: p.position, player: n, message: `所属「${aff}」の読みが辞書にありません` });
      }
    }

    if (ev.isRoundRobin) return;

    // シード
    const seeds = ev.players.filter((p) => p.seed && p.seed > 0);
    const bySeed = new Map<number, CatalogDrawPlayer[]>();
    for (const p of seeds) bySeed.set(p.seed!, [...(bySeed.get(p.seed!) ?? []), p]);
    for (const [s, ps] of bySeed) if (ps.length > 1) add({ level: 'warn', kind: 'seed', position: ps[1].position, message: `シード ${s} が ${ps.map((p) => p.name).join('・')} の ${ps.length} 人にあります` });
    const s1 = bySeed.get(1)?.[0], s2 = bySeed.get(2)?.[0];
    if (s1 && s1.position !== 1) add({ level: 'info', kind: 'seed', position: s1.position, message: `第 1 シードの ${s1.name} が 1 番の枠ではありません（${s1.position} 番）` });
    if (s2 && s2.position !== ev.drawSize) add({ level: 'info', kind: 'seed', position: s2.position, message: `第 2 シードの ${s2.name} が最後（${ev.drawSize} 番）の枠ではありません（${s2.position} 番）` });

    // 1 回戦の当たり方
    const times = ev.matchTimes ?? {};
    const pairs = pairsOf(ev);
    let real = 0, timed = 0;
    for (const { k, top, bottom } of pairs) {
      if (!top && !bottom) {
        // 2 回戦の相手も空きなら、その山は誰もいない（ドローが大きすぎる）。片方だけなら相手は不戦勝
        const other = pairs[(k - 1) ^ 1];
        if (ev.drawSize >= 4 && other && (other.top || other.bottom)) add({ level: 'warn', kind: 'pairing', position: 2 * k - 1, message: `${2 * k - 1}・${2 * k} 番が両方空きです（${(other.top ?? other.bottom)!.name} は 2 回戦も不戦勝になります）` });
        continue;
      }
      if (top && bottom) {
        real++;
        if (times[String(2 * k - 1)]) timed++;
        if (top.affiliation && top.affiliation === bottom.affiliation && top.affiliation !== 'フリー') {
          add({ level: 'info', kind: 'pairing', position: top.position, message: `1 回戦で同じ所属（${top.affiliation}）どうしが当たります：${top.name} 対 ${bottom.name}` });
        }
        if (top.seed && bottom.seed) add({ level: 'warn', kind: 'pairing', position: top.position, message: `1 回戦でシードどうしが当たります：${top.name}（${top.seed}）対 ${bottom.name}（${bottom.seed}）` });
      }
    }
    if (real > 0 && timed === 0) add({ level: 'info', kind: 'time', message: '1 回戦の開始時刻がありません（時間割は使うコートと開始時刻から自動で作ります）' });
    else if (real > timed && timed > 0) add({ level: 'info', kind: 'time', message: `1 回戦 ${real} 試合のうち ${real - timed} 試合に開始時刻がありません` });
  });

  // 複数の種目に出る人（年齢別と一般の掛け持ちなど）
  for (const { name, evs } of seenAcross.values()) {
    if (evs.length > 1) {
      const ei = Math.max(0, events.findIndex((e) => e.eventName === evs[1]));
      issues.push({ level: 'info', kind: 'duplicate', event: ei, player: name, message: `${name} が ${evs.join('・')} の ${evs.length} 種目に出ています（時間が重ならないか確かめてください）` });
    }
  }
  const order: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level] || a.event - b.event || (a.position ?? 0) - (b.position ?? 0));
}
