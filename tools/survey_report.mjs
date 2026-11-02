#!/usr/bin/env node
// アンケートの回答を読み出して、集計を Markdown で出す（Claude Code や手元の端末から使う）。
//
//   SURVEY_READ_KEY=<鍵> node tools/survey_report.mjs              … 集計と全件のご意見を表示
//   SURVEY_READ_KEY=<鍵> node tools/survey_report.mjs --csv out.csv … CSV（Excel 用）も保存
//   SURVEY_READ_KEY=<鍵> node tools/survey_report.mjs --json        … 届いたままの JSON を表示
//   オプション：--survey <番号>（前のアンケート）、--base <URL>（既定は https://tottori-city-tennis.com）
//
// 鍵は docs/survey.md を参照（リポジトリには置かない）。読み出しの口は /api/survey-results。
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const key = process.env.SURVEY_READ_KEY;
if (!key) {
  console.error('SURVEY_READ_KEY（アンケートの鍵）を環境変数に入れてください。docs/survey.md を参照。');
  process.exit(1);
}
const base = String(opt('--base') || process.env.SURVEY_BASE || 'https://tottori-city-tennis.com').replace(/\/$/, '');
const survey = opt('--survey');
const q = (extra = {}) => {
  const p = new URLSearchParams({ ...(survey ? { survey } : {}), ...extra });
  const s = p.toString();
  return `${base}/api/survey-results${s ? `?${s}` : ''}`;
};
const get = async (url) => {
  const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
  if (res.status === 401) throw new Error('鍵が違います（401）');
  if (!res.ok) throw new Error(`読み出せませんでした（${res.status}）`);
  return res;
};

const data = await (await get(q())).json();

if (opt('--json')) {
  console.log(JSON.stringify(data, null, 2));
} else {
  const lines = [];
  const bar = (n, max) => '█'.repeat(max ? Math.round((n / max) * 20) : 0);
  const table = (title, obj) => {
    const max = Math.max(0, ...Object.values(obj));
    lines.push(`### ${title}`, '', '| 項目 | 件数 | |', '|---|---:|---|');
    for (const [k, v] of Object.entries(obj)) lines.push(`| ${k} | ${v} | ${bar(v, max)} |`);
    lines.push('');
  };
  lines.push(`## ${data.survey.title}（${data.survey.id}）`, '', `受付期間：${data.survey.period}`, `回答数：**${data.count}件**`, '');
  lines.push(`### 見やすさ・使いやすさ（5段階）`, '', `平均：**${data.rating.avg ?? '—'}**`, '');
  table('使いやすさの内訳', data.rating.dist);
  table('ご意見の種類', data.byKind);
  table('ご意見のあるページ', data.byPage);
  table('回答者の立場', data.byRole);
  table('ふだん見る端末', data.byDevice);
  lines.push('### ご意見（届いた順）', '');
  for (const r of data.responses) {
    lines.push(`#### No.${r.id}　${r.at}　使いやすさ ${r.rating}`);
    const meta = [r.kinds.join('・'), r.pages.length ? `ページ：${r.pages.join('・')}` : '', r.role, r.device, r.name ? `お名前：${r.name}` : ''].filter(Boolean);
    lines.push(`- ${meta.join('｜')}`);
    if (r.place) lines.push(`- 場所：${r.place}`);
    lines.push('', r.body.split('\n').map((l) => `> ${l}`).join('\n'), '');
  }
  console.log(lines.join('\n'));
}

const csvPath = opt('--csv');
if (csvPath) {
  const out = typeof csvPath === 'string' ? csvPath : `survey-${data.survey.id}.csv`;
  writeFileSync(out, Buffer.from(await (await get(q({ format: 'csv' }))).arrayBuffer()));
  console.error(`CSV を保存しました：${out}`);
}
