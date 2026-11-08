// 試合結果の受け箱（worker/catalog.ts の /api/catalog/<id>/results）から結果を取り込み、運営中の大会の試合に反映する。
//
// 手描きのドロー表（赤ペンで勝ち上がりとスコアを書いたもの）の写真を Claude に渡すと、Claude が読み取って
// この受け箱に「勝った人・負けた人・スコア」を入れる（scripts/catalog.mts results）。運営中の端末は少しおきに取りに来て、
// まだ入っていない結果だけを入れる。途中経過（その時点までの結果）でもよい。
//   ・試合は「種目の名前」と「2 人の名前」で探す（並び・空白の違いは気にしない）
//   ・トーナメントは勝った人を次の回戦へ上げる。上げたことで次の試合が見つかれば、続けてその結果も入れる
//   ・端末の側ですでに別の結果が入っている試合は上書きしない（食い違いとして知らせる）
//   ・エントリーをまだ確定していない種目に結果が届いたら、写真からエントリー受付もする：
//     初戦を W.O で負けた人（ほかに結果が無い人）は欠場にし、残りはそのまま出場として確定（対戦表を作る）してから結果を入れる
import { useEffect, useSyncExternalStore } from 'react';
import { db, type Match } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { confirmEventCore } from '../entry/confirmCore';

export interface InboxMatch { winner: string; loser: string; score: string; note?: string }
export interface InboxEvent { event: string; matches: InboxMatch[] }
export interface InboxDoc { version: string; updatedBy?: string; source?: string; events: InboxEvent[] }

export interface ApplyReport {
  /** 写真の結果からエントリーを確定した種目と、欠場にした人 */
  confirmed?: { event: string; absent: string[] }[];
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
    let matches = await db.matches.where('eventId').equals(evt.eventId).toArray();
    // エントリーをまだ確定していない（対戦表が無い）種目：写真の結果からエントリー受付をして確定する
    if (matches.length === 0 && ie.matches.length > 0) {
      const auto = await autoConfirm(evt.eventId, ie.matches);
      if (auto) {
        report.confirmed = [...(report.confirmed ?? []), { event: evt.name, absent: auto.absent }];
        matches = await db.matches.where('eventId').equals(evt.eventId).toArray();
      }
    }
    const absentNames = await withdrawnNames(evt.eventId);
    const byKey = new Map<string, Match>(matches.map((m) => [`${m.round}|${m.position}`, m]));
    const changed = new Set<Match>();
    // 欠場の人の W.O は、確定で相手が不戦勝になっているので済み
    let pending = ie.matches.filter((r) => !(isWalkover(r) && [...absentNames].some((n) => sideHas(n, r.loser))));

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

/** 種目のエントリーの名前（ダブルスは「A・B」）を出す */
async function entryNames(eventId: string) {
  const entries = await db.entries.where('eventId').equals(eventId).toArray();
  const players = new Map((await db.players.toArray()).map((p) => [p.playerId, p]));
  return entries.map((en) => {
    const p1 = players.get(en.playerId)?.name ?? '';
    const p2 = en.partnerId ? players.get(en.partnerId)?.name ?? '' : '';
    return { entry: en, name: p2 ? `${p1}・${p2}` : p1 };
  });
}

/** 欠場（エントリーを取り消した）人の名前 */
async function withdrawnNames(eventId: string): Promise<Set<string>> {
  return new Set((await entryNames(eventId)).filter((x) => x.entry.status === 'withdrawn').map((x) => x.name));
}

/**
 * 写真の結果から、まだ確定していない種目のエントリー受付をして確定する。
 * 初戦を W.O で負けた人（その結果のほかに名前が出てこない人）は欠場（枠を BYE）にする。
 * 確定できなかったとき（順位別トーナメントの順位待ちなど）は null
 */
async function autoConfirm(eventId: string, results: InboxMatch[]): Promise<{ absent: string[] } | null> {
  const draw = await db.draws.where('eventId').equals(eventId).first();
  if (!draw?.id) return null;
  const named = await entryNames(eventId);
  const appearances = (person: string) => results.filter((r) => keyOf(r.winner) === keyOf(person) || keyOf(r.loser) === keyOf(person)).length;
  const absent: string[] = [];
  const absentIds = new Set<string>();
  for (const r of results) {
    if (!isWalkover(r) || appearances(r.loser) !== 1) continue;
    const en = named.find((x) => x.entry.status === 'active' && sideHas(x.name, r.loser))?.entry;
    if (!en?.id || absentIds.has(en.entryId)) continue;
    await db.entries.update(en.id, { status: 'withdrawn' });
    absentIds.add(en.entryId);
    absent.push(r.loser);
  }
  if (absentIds.size) {
    await db.draws.update(draw.id, { slots: draw.slots.map((s) => (s.entryId && absentIds.has(s.entryId) ? { ...s, isBye: true } : s)), updatedAt: Date.now() });
  }
  const ok = await confirmEventCore(eventId);
  return ok ? { absent } : null;
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
  // 入れられなかった結果（エントリー確定の前で試合がまだ無い・前の回戦が未入力など）があるうちは「読んだ」にせず、
  // 次の回にまた試す（確定して試合ができたら入る）。知らせは、入った試合があるときか、残りの中身が変わったときだけ出す
  if (report.notFound.length === 0) {
    try { localStorage.setItem(seenKey(tournamentId), `${doc.version}@${t.createdAt}`); } catch { /* 無視 */ }
    pendingSig.delete(tournamentId);
  }
  const sig = `${doc.version}|${report.notFound.map((x) => `${x.event}:${x.winner}:${x.loser}`).join(',')}`;
  const repeated = report.notFound.length > 0 && pendingSig.get(tournamentId) === sig;
  if (report.notFound.length > 0) pendingSig.set(tournamentId, sig);
  if (report.applied.length || report.confirmed?.length || ((report.conflicts.length || report.notFound.length) && !repeated)) setReport({ ...report, at: Date.now(), source: doc.source });
}
/** 入れられずに残っている結果の中身（同じ知らせを 20 秒おきに出し直さないため） */
const pendingSig = new Map<string, string>();

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
