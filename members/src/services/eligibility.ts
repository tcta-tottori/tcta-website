// 大会の参加資格の判定。
// ルールは「いずれかの行を満たせばよく、行の中の協会はすべて必要」の二重配列（migrations/0002 参照）。
// 年度は開催日を各協会の年度切替月で読み替え、その年度の「承認済み」の年度登録があるかで判定する。
import type { Env } from '../env';
import { all } from '../lib/db';
import { fiscalYear } from '../lib/fiscal';
import type { Association, Tournament } from '../types';

export type Rule = string[][];

export function parseRule(t: Pick<Tournament, 'eligibility_json'>): Rule {
  try {
    const r = JSON.parse(t.eligibility_json ?? '[]');
    return Array.isArray(r) ? r.filter((row) => Array.isArray(row) && row.length).map((row) => row.map(String)) : [];
  } catch {
    return [];
  }
}

export interface RuleRow { assocIds: string[]; satisfied: boolean; missing: { id: string; name: string; fy: number }[] }
export interface EligibilityResult {
  ok: boolean;
  /** 条件が無い（誰でも参加できる） */
  open: boolean;
  rows: RuleRow[];
  /** 「○○の2026年度登録が必要です」などの短い説明。ok のときは空 */
  reason: string;
}

/** 人が読める条件文。例: 「鳥取県テニス協会 ＋ 鳥取市テニス協会 の年度登録、または 鳥取市テニス協会 の年度登録」 */
export function describeRule(rule: Rule, assocs: Association[], heldOn?: string): string {
  if (!rule.length) return 'どなたでも参加できます（年度登録は不要）';
  const name = (id: string) => {
    const a = assocs.find((x) => x.id === id);
    if (!a) return id;
    return heldOn ? `${a.name}の${fiscalYear(heldOn, a.fiscal_year_start_month)}年度登録` : `${a.name}の年度登録`;
  };
  return rule.map((row) => row.map(name).join(' ＋ ')).join('、または ');
}

/** 短い表示用（一覧の列など）。協会コードで「市」「県＋市」「市 or 県」のように出す */
export function shortRule(rule: Rule, assocs: Association[]): string {
  if (!rule.length) return '登録不要';
  const code = (id: string) => assocs.find((x) => x.id === id)?.code ?? id;
  return rule.map((row) => row.map(code).join('＋')).join(' or ');
}

export async function checkEligibility(env: Env, memberId: string | null, t: Tournament, assocs: Association[]): Promise<EligibilityResult> {
  const rule = parseRule(t);
  if (!rule.length) return { ok: true, open: true, rows: [], reason: '' };
  const needed = [...new Set(rule.flat())];
  const regs = memberId
    ? await all<{ association_id: string; fiscal_year: number }>(env.DB, `SELECT association_id, fiscal_year FROM registrations WHERE member_id = ? AND status = 'approved' AND association_id IN (${needed.map(() => '?').join(',')})`, memberId, ...needed)
    : [];
  const has = (id: string, fy: number) => regs.some((r) => r.association_id === id && r.fiscal_year === fy);
  const rows: RuleRow[] = rule.map((row) => {
    const missing = row
      .map((id) => {
        const a = assocs.find((x) => x.id === id);
        const fy = fiscalYear(t.held_on, a?.fiscal_year_start_month ?? 4);
        return has(id, fy) ? null : { id, name: a?.name ?? id, fy };
      })
      .filter((x): x is { id: string; name: string; fy: number } => x !== null);
    return { assocIds: row, satisfied: missing.length === 0, missing };
  });
  const ok = rows.some((r) => r.satisfied);
  // 理由は「いちばん足りないものが少ない行」で説明する
  const best = [...rows].sort((a, b) => a.missing.length - b.missing.length)[0];
  const reason = ok ? '' : `${best.missing.map((m) => `${m.name}の${m.fy}年度登録（承認済み）`).join('と')}が必要です`;
  return { ok, open: false, rows, reason };
}

/** 事務局の大会フォームで選ぶ定型。custom は協会コードで自由に書く */
export const RULE_PRESETS: { key: string; label: string; build: (hostId: string, prefId: string | null) => Rule | null }[] = [
  { key: 'host', label: '主催協会の年度登録が必要（他協会の登録だけでは不可）', build: (h) => [[h]] },
  { key: 'pref', label: '県協会の年度登録が必要', build: (_h, p) => (p ? [[p]] : null) },
  { key: 'host_and_pref', label: '県協会 と 主催協会 の両方の年度登録が必要', build: (h, p) => (p ? [[p, h]] : null) },
  { key: 'host_or_pref', label: '県協会 または 主催協会 のどちらかの年度登録があればよい', build: (h, p) => (p ? [[h], [p]] : null) },
  { key: 'none', label: '誰でも参加できる（年度登録は不要）', build: () => [] },
  { key: 'custom', label: '協会コードで指定する（下の欄）', build: () => null },
];

/** 「P+T」「T」のような行（1 行 1 選択肢、行内は + で AND）を協会コードからルールへ */
export function parseCustomRule(text: string, assocs: Association[]): Rule | { error: string } {
  const rows: Rule = [];
  for (const line of text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    const ids: string[] = [];
    for (const tok of line.split(/[+＋\s,]+/).map((s) => s.trim()).filter(Boolean)) {
      const a = assocs.find((x) => x.code.toUpperCase() === tok.toUpperCase() || x.id === tok);
      if (!a) return { error: `協会コード「${tok}」が見つかりません（使えるコード: ${assocs.map((x) => x.code).join(' / ')}）` };
      ids.push(a.id);
    }
    if (ids.length) rows.push(ids);
  }
  return rows;
}

export function ruleToCustomText(rule: Rule, assocs: Association[]): string {
  return rule.map((row) => row.map((id) => assocs.find((x) => x.id === id)?.code ?? id).join('+')).join('\n');
}

export function presetFor(rule: Rule, hostId: string, prefId: string | null): string {
  const j = JSON.stringify(rule);
  for (const p of RULE_PRESETS) {
    const b = p.build(hostId, prefId);
    if (b && JSON.stringify(b) === j) return p.key;
  }
  return rule.length ? 'custom' : 'none';
}
