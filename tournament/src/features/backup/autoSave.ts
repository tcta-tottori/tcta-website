// 運営中のデータを、協会の Cloudflare（データベースのファイル置き場 /api/data/files、種類 backup）へ自動で保存する。
//
//   ・端末の運営データ（受付・試合結果・コートなど）が変わったら、少し待って（DEBOUNCE_MS）まとめて保存する
//   ・前に保存した中身と同じなら送らない。送れなかったら次の変化・次の周期（RETRY_MS）でもう一度
//   ・ファイル名は大会ごとに 1 つ（「自動保存_<大会名>_<日付>.json」）。上書きしていくので、いつも最新の 1 つが残る
//   ・設定 → バックアップの「Cloudflare」の一覧に出るので、別の端末からでもそこから復元できる
//   ・運営データをクリアして最初からやり直すときは、その前の状態を「クリア前_…」として別に残す（saveSnapshot）
import { liveQuery, type Subscription } from 'dexie';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { uploadFile } from './cloudDataApi';
import { buildUnifiedBackup } from './unifiedBackup';

const DEBOUNCE_MS = 8_000;
const RETRY_MS = 60_000;
/** 変化が続いても、これ以上は待たずに保存する */
const MAX_WAIT_MS = 30_000;

export type AutoSaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number; fileName: string }
  | { kind: 'error'; at: number; message: string };

let state: AutoSaveState = { kind: 'idle' };
const listeners = new Set<(s: AutoSaveState) => void>();
function setState(s: AutoSaveState) {
  state = s;
  for (const l of listeners) l(s);
}
export function getAutoSaveState(): AutoSaveState { return state; }
export function subscribeAutoSave(l: (s: AutoSaveState) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** 今の大会の名前と日付（ファイル名に使う）。大会が無ければ null */
async function currentLabel(): Promise<{ name: string; date: string } | null> {
  const mixed = useMixedStore.getState();
  if (mixed.isImported && mixed.tournamentInfo) return { name: mixed.tournamentInfo.name, date: mixed.tournamentInfo.date || '' };
  const team = useTeamStore.getState();
  if (team.isImported && team.tournamentInfo) return { name: team.tournamentInfo.name, date: team.tournamentInfo.date || '' };
  const id = useAppStore.getState().currentTournamentId;
  if (!id) return null;
  const t = await db.tournaments.where('tournamentId').equals(id).first();
  return t ? { name: t.name, date: t.date || '' } : null;
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|\s\u3000]+/g, '').slice(0, 60) || '大会';

/** 中身の比べ方：作った時刻は毎回変わるので除く */
function fingerprint(json: string): string {
  return json.replace(/"createdAt":"[^"]*"/g, '');
}

let lastSaved = '';
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;

async function saveNow(): Promise<void> {
  if (running) { again = true; return; }
  running = true;
  try {
    const label = await currentLabel();
    if (!label) { setState({ kind: 'idle' }); return; }
    const data = await buildUnifiedBackup();
    const json = JSON.stringify(data);
    if (fingerprint(json) === lastSaved) {
      if (state.kind === 'pending') setState(lastOk ?? { kind: 'idle' });
      return;
    }
    setState({ kind: 'saving' });
    const fileName = `自動保存_${safe(label.name)}_${safe((label.date || new Date().toISOString().slice(0, 10)).replace(/[/.]/g, "-"))}.json`;
    await uploadFile('backup', fileName, json, 'application/json');
    lastSaved = fingerprint(json);
    lastOk = { kind: 'saved', at: Date.now(), fileName };
    setState(lastOk);
  } catch (err) {
    setState({ kind: 'error', at: Date.now(), message: (err as Error).message });
    schedule(RETRY_MS);
  } finally {
    running = false;
    if (again) { again = false; schedule(DEBOUNCE_MS); }
  }
}
let lastOk: AutoSaveState | null = null;

let pendingSince = 0;
function schedule(ms = DEBOUNCE_MS) {
  const now = Date.now();
  if (!timer) pendingSince = now;
  if (timer) clearTimeout(timer);
  if (state.kind !== 'saving') setState({ kind: 'pending' });
  // 変化が続いて待ちが延び続けないよう、最初の変化から MAX_WAIT_MS で必ず保存する
  const wait = Math.max(0, Math.min(ms, pendingSince + Math.max(ms, MAX_WAIT_MS) - now));
  timer = setTimeout(() => { timer = null; void saveNow(); }, wait);
}

/** 今すぐ保存する（画面の「今すぐ保存」から） */
export async function saveAutoNow(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  lastSaved = '';
  await saveNow();
}

/**
 * 今の状態を別の名前で残す（運営データをクリアする前など）。自動保存のファイルとは別に残る
 * @param prefix ファイル名の頭（例「クリア前」）
 */
export async function saveSnapshot(prefix: string, name?: string): Promise<string | null> {
  const label = name ? { name, date: '' } : await currentLabel();
  if (!label) return null;
  const data = await buildUnifiedBackup();
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(/[-:]/g, '').replace(' ', '-').slice(0, 13);
  const fileName = `${prefix}_${safe(label.name)}_${stamp}.json`;
  await uploadFile('backup', fileName, JSON.stringify(data), 'application/json');
  return fileName;
}

/**
 * 自動保存を始める（運営画面の骨組み AppLayout から 1 回）。戻り値で止める。
 * 端末の運営データの表と、ミックス・団体戦のストアの変化を見張る
 */
export function startAutoSave(): () => void {
  let first = true;
  let lastSig = '';
  const sub: Subscription = liveQuery(async () => {
    // 変化を知るための軽い目印（件数と、試合・受付の中身）
    const [t, e, en, d, m, c] = await Promise.all([
      db.tournaments.count(), db.events.count(), db.entries.toArray(), db.draws.count(), db.matches.toArray(), db.courts.count(),
    ]);
    return `${t}|${e}|${d}|${c}|${en.length}|${m.length}|${JSON.stringify(en).length}|${JSON.stringify(m).length}`;
  }).subscribe({
    next: (sig) => {
      // 開いた直後の 1 回目は、前に保存した中身と比べるために一度だけ保存を試みる
      if (first) { first = false; lastSig = sig; schedule(DEBOUNCE_MS); return; }
      if (sig === lastSig) return;
      lastSig = sig;
      schedule();
    },
    error: () => { /* 見張りが止まっても運営には影響させない */ },
  });
  const unMixed = useMixedStore.subscribe(() => schedule());
  const unTeam = useTeamStore.subscribe(() => schedule());
  const unApp = useAppStore.subscribe((s, prev) => { if (s.currentTournamentId !== prev.currentTournamentId) { lastSaved = ''; schedule(); } });
  // 画面を閉じる・裏に回るときは、待たずに保存を始める
  const onHide = () => { if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); timer = null; void saveNow(); } };
  document.addEventListener('visibilitychange', onHide);
  return () => {
    sub.unsubscribe();
    unMixed(); unTeam(); unApp();
    document.removeEventListener('visibilitychange', onHide);
    if (timer) { clearTimeout(timer); timer = null; }
  };
}
