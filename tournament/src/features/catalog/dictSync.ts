// 選手・所属のふりがな辞書を、ログインした時点でデータベースから端末に取り込む。
//   ・データベースの版（version）が端末のものと同じなら何もしない（毎回 800 人ぶんを書き直さない）
//   ・端末で足したふりがな（音声コールの画面で直したものなど）は消さずに残し、データベースにある人だけ上書きする
//   ・この端末の選手（大会に入れた人）のふりがなも、辞書に合わせて直す（音声コールは選手のふりがなを読む）
import { useSyncExternalStore } from 'react';
import { db, type AffiliationFurigana } from '../../db/database';
import { fetchDict, type Dict } from './catalogApi';

const VERSION_KEY = 'tcta-dict-version';
const keyOf = (name: string) => name.replace(/[\s\u3000]+/g, '');

export interface DictSyncState {
  status: 'idle' | 'syncing' | 'ok' | 'error' | 'offline';
  version: string;
  players: number;
  affiliations: number;
  at: number | null;
  message: string;
}

let state: DictSyncState = { status: 'idle', version: readVersion(), players: 0, affiliations: 0, at: null, message: '' };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function readVersion(): string {
  try { return localStorage.getItem(VERSION_KEY) ?? ''; } catch { return ''; }
}
function set(next: Partial<DictSyncState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

/** 辞書を端末に書く。戻り値は直した選手の数 */
async function apply(dict: Dict): Promise<number> {
  const now = Date.now();
  let fixed = 0;
  await db.transaction('rw', [db.furiganaDict, db.affiliationFurigana, db.players], async () => {
    await db.furiganaDict.bulkPut(dict.players.map((p) => ({ name: keyOf(p.name), furigana: keyOf(p.furigana), type: 'manual' as const, updatedAt: now })));
    const existing = new Map((await db.affiliationFurigana.toArray()).map((a) => [a.name, a]));
    const rows: AffiliationFurigana[] = dict.affiliations.map((a) => {
      const cur = existing.get(a.name);
      return { ...(cur?.id != null ? { id: cur.id } : {}), name: a.name, furigana: a.furigana, updatedAt: now } as AffiliationFurigana;
    });
    await db.affiliationFurigana.bulkPut(rows);
    const byKey = new Map(dict.players.map((p) => [keyOf(p.name), keyOf(p.furigana)]));
    for (const p of await db.players.toArray()) {
      const f = byKey.get(p.playerId);
      if (f && p.id != null && p.furigana !== f) { await db.players.update(p.id, { furigana: f }); fixed++; }
    }
  });
  return fixed;
}

/** データベースの辞書を取り込む。force なら版が同じでも書き直す */
export function syncDictionary(force = false): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    set({ status: 'syncing', message: '辞書を確かめています' });
    try {
      const dict = await fetchDict();
      const counts = { players: dict.players.length, affiliations: dict.affiliations.length };
      if (!force && dict.version && dict.version === readVersion()) {
        set({ status: 'ok', ...counts, version: dict.version, at: Date.now(), message: '最新です' });
        return;
      }
      const fixed = await apply(dict);
      try { localStorage.setItem(VERSION_KEY, dict.version); } catch { /* 保存できない環境 */ }
      set({ status: 'ok', ...counts, version: dict.version, at: Date.now(), message: fixed ? `取り込みました（この端末の選手 ${fixed} 人のふりがなを直しました）` : '取り込みました' });
    } catch (err) {
      const msg = (err as Error).message;
      set({ status: navigator.onLine ? 'error' : 'offline', message: navigator.onLine ? msg : '電波が無いので、端末に入っている辞書を使います' });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useDictSync(): DictSyncState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}
