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

/** 日本時間のその日（YYYY-MM-DD）が UTC の ISO 文字列でどの範囲か [開始, 終了)。created_at（UTC）との比較に使う。 */
export function jstDayRange(dayIso: string): [string, string] {
  const start = new Date(dayIso.slice(0, 10) + 'T00:00:00+09:00');
  return [start.toISOString(), new Date(start.getTime() + 86400000).toISOString()];
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 生年月から、ある日（既定は今日・日本時間）の満年齢。日は持たないので誕生月に入ったら 1 つ上がるものとする。
    月が分からなければ [若い方, 上の方] の幅で返す。生年が無ければ null。 */
export function ageAt(year: number | null | undefined, month: number | null | undefined, atIso?: string | null, now = new Date()): number | [number, number] | null {
  if (!year) return null;
  const [ay, am] = (atIso || todayJst(now)).slice(0, 10).split('-').map(Number);
  if (!month) return [ay - year - 1, ay - year];
  return ay - year - (month > am ? 1 : 0);
}

/** 画面に出す年齢の表記（例 "32歳"・"31〜32歳"・"—"） */
export function ageLabel(year: number | null | undefined, month: number | null | undefined, atIso?: string | null, now = new Date()): string {
  const a = ageAt(year, month, atIso, now);
  if (a === null) return '—';
  return Array.isArray(a) ? `${a[0]}〜${a[1]}歳` : `${a}歳`;
}
