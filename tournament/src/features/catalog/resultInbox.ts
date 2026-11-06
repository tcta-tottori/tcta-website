// 試合結果の受け箱（worker/catalog.ts の /api/catalog/<id>/results）から結果を取り込み、運営中の大会の試合に反映する。
//
// 手描きのドロー表（赤ペンで勝ち上がりとスコアを書いたもの）の写真を Claude に渡すと、Claude が読み取って
// この受け箱に「勝った人・負けた人・スコア」を入れる（scripts/catalog.mts results）。運営中の端末は少しおきに取りに来て、
// まだ入っていない結果だけを入れる。途中経過（その時点までの結果）でもよい。
//   ・試合は「種目の名前」と「2 人の名前」で探す（並び・空白の違いは気にしない）
//   ・トーナメントは勝った人を次の回戦へ上げる。上げたことで次の試合が見つかれば、続けてその結果も入れる
//   ・端末の側ですでに別の結果が入っている試合は上書きしない（食い違いとして知らせる）
import { useEffect, useSyncExternalStore } from 'react';
import { db, type Match } from '../../db/database';
import { useAppStore } from '../../stores/appStore';

export interface InboxMatch { winner: string; loser: string; score: string; note?: string }
export interface InboxEvent { event: string; matches: InboxMatch[] }
export interface InboxDoc { version: string; updatedBy?: string; source?: string; events: InboxEvent[] }

export interface ApplyReport {
  applied: { event: string; winner: string; loser: string; score: string }[];
  conflicts: { event: string; winner: string; loser: string; reason: string }[];
  notFound: { event: string; winner: string; loser: string; reason: string }[];
}

const keyOf = (s: string) => (s ?? '').replace(/[\s\u3000]+/g, '');

/** その人の名前が、試合の片側（シングルスの名前・ダブルスの「A・B」）に入っているか */
function sideHas(sideName: string, person: string): boolean {
  const side = keyOf(sideName), p = keyOf(person);
  if (!side || !p) return false;
  if (side === p) return true;
  // ダブルス：「北畠史基・渕上雅博」「北畠／渕上」など。どちらかの名前で合えばよい
  return side.split(/[・/／,，&＆]/).some((x) => x && (x === p || p.split(/[・/／,，&＆]/).includes(x)));
}

/** スコアを、勝った人から見た形から「1 側から見た形」に直す（8-3 → 3-8。RET などの印は残す） */
export function orientScore(score: string, winnerIsP1: boolean): string {
  const s = (score ?? '').trim();
  if (winnerIsP1 || !s) return s;
  return s.replace(/(\d+)\s*[-ー－–]\s*(\d+)(\(\d+\))?/g, (_m, a, b, tb) => `${b}-${a}${tb ?? ''}`);
}

const isWalkover = (r: InboxMatch) => /^(w\.?\s*o\.?|walk\s*over|不戦|棄権前|def)/i.test((r.note || r.score || '').trim()) && !/\d/.test(r.score || '');

/** 結果を端末の試合に入れる */
export async function applyInbox(tournamentId: string, doc: InboxDoc): Promise<ApplyReport> {
  const report: ApplyReport = { applied: [], conflicts: [], notFound: [] };
  const events = await db.events.where('tournamentId').equals(tournamentId).toArray();
  const now = Date.now();
  const touchedCourts = new Set<string>();

  for (const ie of doc.events) {
    const ek = keyOf(ie.event);
    const evt = events.find((e) => keyOf(e.name) === ek)
      ?? events.find((e) => keyOf(e.name).includes(ek) || ek.includes(keyOf(e.name)));
    if (!evt) {
      for (const r of ie.matches) report.notFound.push({ event: ie.event, winner: r.winner, loser: r.loser, reason: '種目が見つかりません' });
      continue;
    }
    const matches = await db.matches.where('eventId').equals(evt.eventId).toArray();
    const byKey = new Map<string, Match>(matches.map((m) => [`${m.round}|${m.position}`, m]));
    const changed = new Set<Match>();
    let pending = [...ie.matches];

    // 勝ち上がりで次の試合の 2 人がそろうので、入れられるものが無くなるまで繰り返す
    for (let pass = 0; pass < 12 && pending.length > 0; pass++) {
      const rest: InboxMatch[] = [];
      let progressed = false;
      for (const r of pending) {
        const m = matches.find((x) =>
          (sideHas(x.player1Name, r.winner) && sideHas(x.player2Name, r.loser)) ||
          (sideHas(x.player2Name, r.winner) && sideHas(x.player1Name, r.loser)));
        if (!m) { rest.push(r); continue; }
        const winnerIsP1 = sideHas(m.player1Name, r.winner);
        const winnerId = winnerIsP1 ? m.player1EntryId : m.player2EntryId;
        const wo = isWalkover(r);
        const score = wo ? '' : orientScore(r.score, winnerIsP1) + (r.note && !wo && !r.score.includes(r.note) ? ` ${r.note}` : '');
        if (m.status === 'finished' || m.status === 'walkover') {
          if (m.winnerEntryId && m.winnerEntryId !== winnerId) {
            report.conflicts.push({ event: evt.name, winner: r.winner, loser: r.loser, reason: `端末では ${winnerIsP1 ? m.player2Name : m.player1Name} の勝ちになっています` });
          }
          // 同じ結果がすでに入っている（前に取り込んだ）
          continue;
        }
        m.status = wo ? 'walkover' : 'finished';
        m.score = score;
        m.winnerEntryId = winnerId;
        m.updatedAt = now;
        if (m.courtId) touchedCourts.add(m.courtId);
        changed.add(m);
        report.applied.push({ event: evt.name, winner: r.winner, loser: r.loser, score: score || 'W.O' });
        progressed = true;

        // 勝った人を次の回戦へ
        const next = byKey.get(`${m.round + 1}|${Math.ceil(m.position / 2)}`);
        if (next && next.status !== 'finished' && next.status !== 'walkover') {
          const name = winnerIsP1 ? m.player1Name : m.player2Name;
          const aff = winnerIsP1 ? m.player1Affiliation : m.player2Affiliation;
          if (m.position % 2 === 1) { next.player1EntryId = winnerId; next.player1Name = name; next.player1Affiliation = aff; }
          else { next.player2EntryId = winnerId; next.player2Name = name; next.player2Affiliation = aff; }
          next.updatedAt = now;
          changed.add(next);
        }
      }
      pending = rest;
      if (!progressed) break;
    }
    for (const r of pending) {
      const known = matches.some((x) => sideHas(x.player1Name, r.winner) || sideHas(x.player2Name, r.winner));
      report.notFound.push({ event: evt.name, winner: r.winner, loser: r.loser, reason: known ? 'その 2 人の試合がまだ組まれていません（前の回戦の結果が無いなど）' : '名前が見つかりません' });
    }
    if (changed.size) await db.matches.bulkPut([...changed]);
  }

  // 終わった試合が入っていたコートを空ける
  if (touchedCourts.size) {
    const courts = await db.courts.where('tournamentId').equals(tournamentId).toArray();
    for (const c of courts) if (c.id != null && touchedCourts.has(c.courtId) && c.currentMatchId) await db.courts.update(c.id, { currentMatchId: null });
  }
  return report;
}

// ---------------------------------------------------------------------------
// 運営中に少しおきに取りに来る（AppLayout から）
// ---------------------------------------------------------------------------
const POLL_MS = 20_000;
const seenKey = (tid: string) => `tcta.resultInbox.${tid}`;

let lastReport: (ApplyReport & { at: number; source?: string }) | null = null;
const listeners = new Set<() => void>();
function setReport(r: typeof lastReport) { lastReport = r; for (const l of listeners) l(); }
export function useInboxReport() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => lastReport);
}
export function dismissInboxReport() { setReport(null); }

async function pollOnce(tournamentId: string): Promise<void> {
  const t = await db.tournaments.where('tournamentId').equals(tournamentId).first();
  if (!t?.catalogId) return;
  const res = await fetch(`/api/catalog/${encodeURIComponent(t.catalogId)}/results`, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) return;
  const doc = (await res.json()) as InboxDoc;
  if (!doc.version || !doc.events?.length) return;
  let seen = '';
  try { seen = localStorage.getItem(seenKey(tournamentId)) ?? ''; } catch { /* 無視 */ }
  // 端末に大会を入れ直したら（作った時刻が新しい）、前の結果も入れ直す
  if (seen && seen >= doc.version && seen.endsWith(`@${t.createdAt}`)) return;
  const report = await applyInbox(tournamentId, doc);
  try { localStorage.setItem(seenKey(tournamentId), `${doc.version}@${t.createdAt}`); } catch { /* 無視 */ }
  if (report.applied.length || report.conflicts.length || report.notFound.length) setReport({ ...report, at: Date.now(), source: doc.source });
}

/** 運営中の大会について、受け箱の結果を取り込み続ける */
export function useResultInbox(enabled: boolean): void {
  const tid = useAppStore((s) => s.currentTournamentId);
  useEffect(() => {
    if (!enabled || !tid) return;
    let stop = false;
    const tick = () => { if (!stop && document.visibilityState === 'visible') void pollOnce(tid).catch(() => {}); };
    tick();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { stop = true; clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [enabled, tid]);
}
