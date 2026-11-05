// 表の列ごとの絞り込み（Excel のフィルターと同じ考え方）。選手・所属の辞書で使う。
//   ・列の見出しを押すと、その列の絞り込みの窓が開く（並べ替え・文字で絞る・頭文字の行・値を選ぶ）
//   ・掛かっている条件は見出しの下に札で並び、1 つずつ外せる
//   ・値を選ぶ列（所属など）の件数は、ほかの列の条件を掛けたあとの数（今の表に何件残るか）
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Check, ChevronDown, Filter, Search, X } from 'lucide-react';

import {
  KANA_ROWS, NONE, applyColumnFilters, clearColumn, isColumnActive, norm,
  type ColumnDef, type ColumnFilterState,
} from './columnFilter';

/** 列の見出しの行（押すと絞り込みの窓が開く） */
export function ColumnHeader<Row>({ cols, rows, filters, onChange, className = '' }: {
  cols: ColumnDef<Row>[];
  rows: Row[];
  filters: ColumnFilterState;
  onChange: (f: ColumnFilterState) => void;
  className?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={wrap} className={`colf ${className}`} role="row">
      {cols.map((c) => {
        const active = isColumnActive(c.key, filters);
        const sorted = filters.sort?.key === c.key ? filters.sort.dir : null;
        return (
          <div key={c.key} className={`colf__cell colf__cell--${c.key}`} role="columnheader" aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}>
            <button
              className={`colf__btn ${active ? 'is-active' : ''} ${open === c.key ? 'is-open' : ''}`}
              onClick={() => setOpen((o) => (o === c.key ? null : c.key))}
              aria-expanded={open === c.key}
              aria-haspopup="dialog"
            >
              <span className="colf__label">{c.label}</span>
              {sorted && (sorted === 'asc' ? <ArrowDownAZ className="colf__sort" aria-label="昇順" /> : <ArrowUpAZ className="colf__sort" aria-label="降順" />)}
              {active ? <Filter className="colf__ico" aria-label="絞り込み中" /> : <ChevronDown className="colf__ico" aria-hidden="true" />}
            </button>
            {open === c.key && (
              <ColumnPanel col={c} cols={cols} rows={rows} filters={filters} onChange={onChange} onClose={() => setOpen(null)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ColumnPanel<Row>({ col, cols, rows, filters, onChange, onClose }: {
  col: ColumnDef<Row>; cols: ColumnDef<Row>[]; rows: Row[]; filters: ColumnFilterState; onChange: (f: ColumnFilterState) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  // 値の一覧（ほかの列の条件を掛けたあとの件数）
  const values = useMemo(() => {
    if (!col.pick) return [];
    const base = applyColumnFilters(rows, cols, { ...filters, sort: null }, col.key);
    const m = new Map<string, number>();
    for (const r of base) { const v = col.value(r) || NONE; m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
  }, [col, cols, rows, filters]);
  const shown = q ? values.filter(([v]) => norm(v).includes(norm(q))) : values;
  const picked = filters.picks[col.key];
  const isPicked = (v: string) => !picked || picked.includes(v);
  const setPicks = (next: string[] | null) => onChange({ ...filters, picks: { ...filters.picks, [col.key]: next } });
  const toggle = (v: string) => {
    const cur = picked ?? values.map(([x]) => x);
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    setPicks(next.length === values.length ? null : next);
  };

  return (
    <div className="colf__panel" role="dialog" aria-label={`${col.label}の絞り込み`}>
      <div className="colf__panel-head">
        <span className="sec-head__mark" aria-hidden="true" />
        <p className="colf__panel-title">{col.label}<small>FILTER</small></p>
        <button className="colf__x" onClick={onClose} aria-label="閉じる"><X className="w-4 h-4" /></button>
      </div>

      {col.sortable && (
        <div className="colf__group">
          <p className="colf__glabel">並べ替え</p>
          <div className="colf__seg">
            {(['asc', 'desc'] as const).map((d) => {
              const on = filters.sort?.key === col.key && filters.sort.dir === d;
              return (
                <button key={d} className={`colf__segbtn ${on ? 'is-on' : ''}`} onClick={() => onChange({ ...filters, sort: on ? null : { key: col.key, dir: d } })}>
                  {d === 'asc' ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}{d === 'asc' ? '昇順' : '降順'}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!col.options && (
        <div className="colf__group">
          <p className="colf__glabel">文字で絞る</p>
          <label className="colf__search">
            <Search className="w-4 h-4" />
            <input className="input" value={filters.text[col.key] ?? ''} placeholder={`${col.label}に含む文字`} onChange={(e) => onChange({ ...filters, text: { ...filters.text, [col.key]: e.target.value } })} />
          </label>
        </div>
      )}

      {col.kanaHead && (
        <div className="colf__group">
          <p className="colf__glabel">頭文字</p>
          <div className="colf__kana">
            {KANA_ROWS.map((r) => {
              const on = filters.head[col.key] === r.key;
              return <button key={r.key} className={`colf__kanabtn ${on ? 'is-on' : ''}`} onClick={() => onChange({ ...filters, head: { ...filters.head, [col.key]: on ? null : r.key } })} aria-pressed={on}>{r.label}</button>;
            })}
          </div>
        </div>
      )}

      {col.options && (
        <div className="colf__group">
          <div className="colf__seg colf__seg--col">
            {[{ value: '', label: 'すべて' }, ...col.options].map((o) => {
              const on = (filters.option[col.key] ?? '') === o.value;
              return <button key={o.value || 'all'} className={`colf__segbtn ${on ? 'is-on' : ''}`} onClick={() => onChange({ ...filters, option: { ...filters.option, [col.key]: o.value || null } })}>{on && <Check className="w-4 h-4" />}{o.label}</button>;
            })}
          </div>
        </div>
      )}

      {col.pick && (
        <div className="colf__group">
          <div className="colf__glabel-row">
            <p className="colf__glabel">値を選ぶ<small>{values.length} 種類</small></p>
            <span className="colf__links">
              <button onClick={() => setPicks(null)}>すべて</button>
              <button onClick={() => setPicks([])}>外す</button>
            </span>
          </div>
          {values.length > 8 && (
            <label className="colf__search colf__search--sm">
              <Search className="w-4 h-4" />
              <input className="input" value={q} placeholder="一覧から探す" onChange={(e) => setQ(e.target.value)} />
            </label>
          )}
          <ul className="colf__list">
            {shown.map(([v, n]) => (
              <li key={v}>
                <label className="colf__opt">
                  <input type="checkbox" checked={isPicked(v)} onChange={() => toggle(v)} />
                  <span className="colf__opt-label">{v}</span>
                  <span className="colf__opt-n">{n}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="colf__none">見つかりません</li>}
          </ul>
        </div>
      )}

      <div className="colf__panel-foot">
        <button className="btn btn--outline colf__foot-btn" onClick={() => onChange(clearColumn(filters, col.key))} disabled={!isColumnActive(col.key, filters)}>この列を解除</button>
        <button className="btn btn--primary colf__foot-btn" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
