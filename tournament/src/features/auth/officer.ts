// 役員ログインの状態（運営画面だけで使う。観戦ページは誰でも開ける）。
//
// 守っているのはサーバー側（Worker）で、運営端末としての同期の接続と音声コールは、ログインしていなければ Worker が断る。
// ここは画面の側の関門で、ログインしていない人には運営画面の代わりにログインの案内を出す。
//   ・開いたときに /api/me で確かめる。前回ログインできていた端末（7 日以内）は、確かめているあいだも画面を出す
//   ・会場で電波が無いときは、前回ログインできていた端末ならそのまま使える（運営を止めない）
//   ・使っている途中で期限が切れたら、画面は止めずに「ログインし直す」の帯だけ出す
import { useSyncExternalStore } from 'react';

export type OfficerStatus =
  | 'checking'      // 確かめている（前回の記録が無い）
  | 'ok'            // ログイン中
  | 'login'         // ログインが必要
  | 'expired'       // 使っている途中で期限が切れた（画面は止めない）
  | 'unconfigured'  // Worker に役員ログインの設定が無い（運営の操作はすべて止まっている）
  | 'offline';      // 確かめられない（電波が無い）。前回の記録も無い

export interface OfficerState {
  status: OfficerStatus;
  email: string | null;
}

const KEY = 'tcta-officer';
const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;
const RECHECK_MS = 10 * 60 * 1000;

function remembered(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { email?: string; at?: number };
    if (!v.email || !v.at || Date.now() - v.at > REMEMBER_MS) return null;
    return v.email;
  } catch {
    return null;
  }
}

function remember(email: string | null): void {
  try {
    if (email) localStorage.setItem(KEY, JSON.stringify({ email, at: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できない環境
  }
}

// Vite の開発サーバー（npm run dev）には Worker が無いので、関門を通す
const DEV_BYPASS = import.meta.env.DEV;

let state: OfficerState = DEV_BYPASS
  ? { status: 'ok', email: 'dev@localhost' }
  : remembered()
    ? { status: 'ok', email: remembered() }
    : { status: 'checking', email: null };
const listeners = new Set<() => void>();
let started = false;
let inflight: Promise<void> | null = null;

function set(next: OfficerState) {
  if (next.status === state.status && next.email === state.email) return;
  state = next;
  for (const l of listeners) l();
}

/** /api/me で確かめ直す */
export function recheckOfficer(): Promise<void> {
  if (DEV_BYPASS) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    const wasOk = state.status === 'ok' || state.status === 'expired';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin', signal: ctrl.signal });
      clearTimeout(timer);
      const body = (await res.json()) as { authenticated?: boolean; email?: string | null; mode?: string };
      if (res.ok && body.authenticated && body.email) {
        remember(body.email);
        set({ status: 'ok', email: body.email });
      } else if (body.mode === 'unconfigured') {
        remember(null);
        set({ status: 'unconfigured', email: null });
      } else {
        remember(null);
        set({ status: wasOk ? 'expired' : 'login', email: wasOk ? state.email : null });
      }
    } catch {
      // 電波が無い・Worker に届かない。前回ログインできていた端末ならそのまま使わせる
      if (state.status === 'checking') set({ status: remembered() ? 'ok' : 'offline', email: remembered() });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function start() {
  if (started || DEV_BYPASS || typeof window === 'undefined') return;
  started = true;
  void recheckOfficer();
  setInterval(() => void recheckOfficer(), RECHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void recheckOfficer();
  });
  window.addEventListener('online', () => void recheckOfficer());
}

export function useOfficer(): OfficerState {
  start();
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}

/** ログイン画面へ（Cloudflare Access）。戻り先は今の画面 */
export function loginHref(): string {
  const back = typeof location === 'undefined' ? '/data' : `${location.pathname}${location.search}`;
  return `/auth/login?return=${encodeURIComponent(back)}`;
}

export function logout(): void {
  remember(null);
  location.href = '/auth/logout';
}
