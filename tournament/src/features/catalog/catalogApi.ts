// 大会運営のデータベース（worker/catalog.ts）との読み書き。形は /api/schema にも書いてある。
import { loginHref, recheckOfficer } from '../auth/officer';

export type CatalogStatus = 'planned' | 'ready' | 'done';

export interface CatalogEventSummary { name: string; type: 'Singles' | 'Doubles'; drawSize: number; players: number; isRoundRobin: boolean }

export interface CatalogTournament {
  id: string;
  name: string;
  date: string;          // YYYY-MM-DD
  venue: string;
  reserveDate: string;   // YYYY-MM-DD
  reserveVenue: string;
  category: string;
  status: CatalogStatus;
  note: string;
  source: string;
  settings: { courtNames?: string[]; startTime?: string };
  events: CatalogEventSummary[];
  players: number;
  updatedAt: string;
  updatedBy: string;
}

export interface CatalogDrawPlayer { position: number; name: string; affiliation: string; seed?: number; partnerName?: string; partnerAffiliation?: string }
export interface CatalogDrawEvent {
  eventName: string;
  type: 'Singles' | 'Doubles';
  drawSize: number;
  isRoundRobin?: boolean;
  matchFormat?: string;
  players: CatalogDrawPlayer[];
  roundGameRules?: { roundLabel: string; ruleText: string; games: number; matchFormat?: string; heatRuleText?: string; heatGames?: number; heatMatchFormat?: string }[];
  matchTimes?: Record<string, string>;
  roundMatchTimes?: Record<string, string>;
  eventStartTime?: string;
  /** リーグ戦の専用コート（コート名。1〜2面） */
  leagueCourts?: string[];
}
export interface CatalogTournamentFull extends CatalogTournament {
  draw: { events: CatalogDrawEvent[]; earliestStartTime?: string; suggestedCourtCount?: number } | null;
}

export interface CatalogList {
  tournaments: CatalogTournament[];
  dict: { players: number; affiliations: number; version: string };
}

export interface DictPlayer { name: string; furigana: string; affiliation?: string; note?: string }
export interface DictAffiliation { name: string; furigana: string }
export interface Dict { version: string; players: DictPlayer[]; affiliations: DictAffiliation[] }

export class CatalogError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store', signal: ctrl.signal });
    if (res.status === 401) {
      void recheckOfficer();
      throw new CatalogError('役員ログインが切れています。ログインし直してください。', 401);
    }
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new CatalogError(body.error || `データベースの読み書きに失敗しました（${res.status}）`, res.status);
    return body;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new CatalogError('データベースが応答しませんでした（電波を確認してください）', 0);
    if (err instanceof CatalogError) throw err;
    throw new CatalogError('データベースにつながりません（電波を確認してください）', 0);
  } finally {
    clearTimeout(timer);
  }
}

// 最後に読めた一覧を端末に覚えておく（会場で電波が無いときも、一覧と「続きから」は出せるように）
const LIST_CACHE = 'tcta-catalog-list';

export async function fetchCatalog(): Promise<CatalogList> {
  const list = await call<CatalogList>('/api/catalog');
  try { localStorage.setItem(LIST_CACHE, JSON.stringify({ at: Date.now(), list })); } catch { /* 保存できない環境 */ }
  return list;
}

export function cachedCatalog(): { at: number; list: CatalogList } | null {
  try {
    const raw = localStorage.getItem(LIST_CACHE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const fetchTournament = (id: string) => call<CatalogTournamentFull>(`/api/catalog/${encodeURIComponent(id)}`);
export const fetchDict = () => call<Dict>('/api/dict', {}, 30000);

export function putTournament(id: string, body: Omit<CatalogTournamentFull, 'id' | 'events' | 'players' | 'updatedAt' | 'updatedBy'>) {
  return call<CatalogTournament>(`/api/catalog/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

export function putDict(body: { mode: 'merge' | 'replace'; players?: DictPlayer[]; affiliations?: DictAffiliation[]; removePlayers?: string[] }) {
  return call<{ ok: boolean; version: string; total: { players: number; affiliations: number } }>('/api/dict', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

export { loginHref };

// ---------------------------------------------------------------------------
// 表示の手伝い
// ---------------------------------------------------------------------------

const DOW = '日月火水木金土';

/** 2026-11-08 → { md: '11.08', dow: 'SUN', jp: '11月8日（日）', slash: '11/8' } */
export function dateParts(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const en = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
  return {
    md: `${m[2]}.${m[3]}`,
    dow: en,
    jp: `${Number(m[2])}月${Number(m[3])}日（${DOW[d.getDay()]}）`,
    slash: `${Number(m[2])}/${Number(m[3])}`,
    time: d.getTime(),
  };
}

/** 今日の 0 時（端末の時刻） */
export function todayStart(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}
