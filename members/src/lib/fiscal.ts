// 年度と日付。年度の切替月は協会ごとの設定（既定 4 月。設計書の未決事項）。
const JST_OFFSET = 9 * 60 * 60 * 1000;

/** いまの日本時間を Date で（UTC の値に +9h したもの。getUTC* で読む）。 */
export function jstNow(now = new Date()): Date {
  return new Date(now.getTime() + JST_OFFSET);
}

export function todayJst(now = new Date()): string {
  return jstNow(now).toISOString().slice(0, 10);
}

export function fiscalYear(dateIso: string, startMonth = 4): number {
  const [y, m] = dateIso.slice(0, 10).split('-').map(Number);
  return m >= startMonth ? y : y - 1;
}

export function currentFiscalYear(startMonth = 4, now = new Date()): number {
  return fiscalYear(todayJst(now), startMonth);
}

/** 次年度の「継続登録」ボタンを出す期間（年度切替の 2 か月前から）に入っているか。 */
export function inRenewalWindow(startMonth = 4, now = new Date()): boolean {
  const d = jstNow(now);
  const fy = currentFiscalYear(startMonth, now);
  const switchAt = Date.UTC(fy + 1, startMonth - 1, 1);
  const windowStart = switchAt - 2 * 31 * 24 * 60 * 60 * 1000;
  return d.getTime() >= windowStart;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${y}/${m}/${d}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = jstNow(new Date(iso));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function yen(n: number | null | undefined): string {
  return n == null ? '—' : `${n.toLocaleString('ja-JP')}円`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
