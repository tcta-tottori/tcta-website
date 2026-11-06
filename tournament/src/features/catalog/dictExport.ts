// 選手・所属の辞書を CSV / Excel に書き出す（DictionaryPage.tsx の「CSV」「Excel」ボタン）。
//   ・書き出すのは、いま画面に出している行（検索・列の絞り込み・並べ替えを掛けたあと）。何も掛けていなければ全件
//   ・CSV は Excel でそのまま開いても文字化けしないよう、先頭に BOM を付けた UTF-8
//   ・ファイル名は「選手_20261107.csv」「所属_20261107.xlsx」の形
import * as XLSX from 'xlsx';
import type { DictAffiliation, DictPlayer } from './catalogApi';

export type DictKind = 'players' | 'affiliations';

const KIND_LABEL: Record<DictKind, string> = { players: '選手', affiliations: '所属' };

/** 表の行（見出しの行 ＋ データの行） */
function table(kind: DictKind, rows: (DictPlayer | DictAffiliation)[]): string[][] {
  if (kind === 'players') {
    return [
      ['氏名', 'ふりがな', '所属', '確認メモ'],
      ...(rows as DictPlayer[]).map((r) => [r.name, r.furigana, r.affiliation ?? '', r.note ?? '']),
    ];
  }
  return [['所属名', 'ふりがな'], ...rows.map((r) => [r.name, r.furigana])];
}

const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

/** CSV の1マス。カンマ・改行・ダブルクォートを含むものは囲む */
const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportDictCsv(kind: DictKind, rows: (DictPlayer | DictAffiliation)[]) {
  const text = table(kind, rows).map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  download(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }), `${KIND_LABEL[kind]}_${stamp()}.csv`);
}

export function exportDictExcel(kind: DictKind, rows: (DictPlayer | DictAffiliation)[]) {
  const ws = XLSX.utils.aoa_to_sheet(table(kind, rows));
  ws['!cols'] = kind === 'players' ? [{ wch: 16 }, { wch: 20 }, { wch: 22 }, { wch: 40 }] : [{ wch: 26 }, { wch: 26 }];
  ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, KIND_LABEL[kind]);
  XLSX.writeFile(wb, `${KIND_LABEL[kind]}_${stamp()}.xlsx`);
}
