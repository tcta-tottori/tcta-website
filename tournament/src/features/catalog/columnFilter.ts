// 表の列ごとの絞り込みの決まり（ColumnFilters.tsx の画面と、絞り込み・並べ替えの計算）
export type SortDir = 'asc' | 'desc';

/** 列の決まり */
export interface ColumnDef<Row> {
  key: string;
  label: string;
  /** 文字で絞る・並べ替えに使う値 */
  value: (r: Row) => string;
  /** 頭文字の行（あ行・か行…）で絞れる（ふりがなの列） */
  kanaHead?: boolean;
  /** 値の一覧から選んで絞る（所属など）。空の値は「（なし）」 */
  pick?: boolean;
  /** 決まった選択肢から 1 つ選ぶ（確認の列など）。value(r) がこの値になる */
  options?: { value: string; label: string }[];
  /** 並べ替えできる */
  sortable?: boolean;
}

export interface ColumnFilterState {
  text: Record<string, string>;
  head: Record<string, string | null>;
  picks: Record<string, string[] | null>;   // null = すべて
  option: Record<string, string | null>;    // null = すべて
  sort: { key: string; dir: SortDir } | null;
}

export const emptyFilters = (): ColumnFilterState => ({ text: {}, head: {}, picks: {}, option: {}, sort: null });

export const norm = (s: string) => s.normalize('NFKC').replace(/[\s\u3000]+/g, '').toLowerCase();

/** あ行〜わ行（濁点・半濁点・小さい字も同じ行） */
export const KANA_ROWS: { key: string; label: string; chars: string }[] = [
  { key: 'あ', label: 'あ', chars: 'あいうえおぁぃぅぇぉゔ' },
  { key: 'か', label: 'か', chars: 'かきくけこがぎぐげご' },
  { key: 'さ', label: 'さ', chars: 'さしすせそざじずぜぞ' },
  { key: 'た', label: 'た', chars: 'たちつてとだぢづでどっ' },
  { key: 'な', label: 'な', chars: 'なにぬねの' },
  { key: 'は', label: 'は', chars: 'はひふへほばびぶべぼぱぴぷぺぽ' },
  { key: 'ま', label: 'ま', chars: 'まみむめも' },
  { key: 'や', label: 'や', chars: 'やゆよゃゅょ' },
  { key: 'ら', label: 'ら', chars: 'らりるれろ' },
  { key: 'わ', label: 'わ', chars: 'わをんゎ' },
];
export function kanaRowOf(s: string): string | null {
  const c = (s ?? '').trim().charAt(0);
  return KANA_ROWS.find((r) => r.chars.includes(c))?.key ?? null;
}

export const NONE = '（なし）';

/** 1 つの列の条件を満たすか */
function passes<Row>(c: ColumnDef<Row>, r: Row, f: ColumnFilterState): boolean {
  const v = c.value(r) ?? '';
  const t = f.text[c.key];
  if (t && !norm(v).includes(norm(t))) return false;
  const h = f.head[c.key];
  if (h && kanaRowOf(v) !== h) return false;
  const p = f.picks[c.key];
  if (p && !p.includes(v || NONE)) return false;
  const o = f.option[c.key];
  if (o && v !== o) return false;
  return true;
}

/** 全部の列の条件を掛け、並べ替えた行 */
export function applyColumnFilters<Row>(rows: Row[], cols: ColumnDef<Row>[], f: ColumnFilterState, exceptKey?: string): Row[] {
  const out = rows.filter((r) => cols.every((c) => c.key === exceptKey || passes(c, r, f)));
  if (f.sort) {
    const c = cols.find((x) => x.key === f.sort!.key);
    if (c) {
      const sign = f.sort.dir === 'asc' ? 1 : -1;
      out.sort((a, b) => sign * (c.value(a) || '￿').localeCompare(c.value(b) || '￿', 'ja'));
    }
  }
  return out;
}

export function isColumnActive(key: string, f: ColumnFilterState): boolean {
  return !!(f.text[key] || f.head[key] || f.picks[key] || f.option[key]);
}

/** 掛かっている条件の札（見出しの下） */
export function activeChips<Row>(cols: ColumnDef<Row>[], f: ColumnFilterState): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];
  for (const c of cols) {
    const parts: string[] = [];
    if (f.text[c.key]) parts.push(`「${f.text[c.key]}」を含む`);
    if (f.head[c.key]) parts.push(`${f.head[c.key]}行`);
    const p = f.picks[c.key];
    if (p) parts.push(p.length === 1 ? p[0] : `${p[0]} ほか ${p.length - 1}`);
    const o = f.option[c.key];
    if (o) parts.push(c.options?.find((x) => x.value === o)?.label ?? o);
    if (parts.length) chips.push({ key: c.key, label: `${c.label}: ${parts.join('・')}` });
  }
  return chips;
}

export function clearColumn(f: ColumnFilterState, key: string): ColumnFilterState {
  return {
    ...f,
    text: { ...f.text, [key]: '' },
    head: { ...f.head, [key]: null },
    picks: { ...f.picks, [key]: null },
    option: { ...f.option, [key]: null },
  };
}

