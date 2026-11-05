/**
 * 大会データの置き場（Cloudflare D1）との読み書き。
 *
 * GitHub Pages 版は Google ドライブの共有フォルダ「鳥取テニス協会バックアップ/大会運営システム」から
 * Excel を読んでいた。Cloudflare 版はそれをやめ、Worker の /api/data/files（worker/data.ts）から読む。
 * フォルダは種類（kind）に置き換わる:
 *   大会一覧 → tournament、時間割 → schedule、ふりがな一覧 → furigana、所属一覧 → affiliation、
 *   バックアップ → backup、大会結果 → result
 *
 * 「接続」は役員ログインのこと（Worker が Cookie の証明を毎回確かめる）。Google のログインは要らない。
 * 画面側の呼び出しを変えずに済むよう、関数の名前と形は Google ドライブ版（googleDriveApi.ts）と同じにしてある。
 * token 引数は使わない（互換のため残している）。
 */
// token・mimeType の引数は Google ドライブ版と同じ呼び方のまま使えるように残している（中では使わない）
/* eslint-disable @typescript-eslint/no-unused-vars */
import { getOfficerState, loginHref, recheckOfficer } from '../auth/officer';

export type DataKind = 'tournament' | 'schedule' | 'furigana' | 'affiliation' | 'backup' | 'result';

export interface CloudDataFile {
  id: string;
  name: string;
  size: string;
  modifiedTime: string;
  mimeType: string;
  updatedBy?: string;
}



const API = '/api/data/files';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXCEL_RE = /\.(xlsx|xls|xlsm)$/i;

/** 応答が無く待ち続けないよう、30 秒で打ち切る */
async function call(input: string, init: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, credentials: 'same-origin', cache: 'no-store', signal: ctrl.signal });
    if (res.status === 401) {
      void recheckOfficer();
      throw new Error('役員ログインが切れています。画面上部の「ログインし直す」からログインしてください。');
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `Cloudflare のデータの読み書きに失敗しました (${res.status})`);
    }
    return res;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Cloudflare が ${Math.round(timeoutMs / 1000)} 秒応答しませんでした（電波を確認してください）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 種類ごとのファイルの一覧（新しい順） */
export async function listFiles(kind: DataKind): Promise<CloudDataFile[]> {
  const res = await call(`${API}?kind=${kind}`);
  const body = (await res.json()) as { files: CloudDataFile[] };
  return body.files;
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const res = await call(`${API}/${encodeURIComponent(fileId)}`, {}, 60000);
  return res.arrayBuffer();
}

/** 同じ種類・同じ名前があれば上書き */
export async function uploadFile(kind: DataKind, fileName: string, body: ArrayBuffer | string, mimeType: string): Promise<CloudDataFile> {
  const res = await call(
    `${API}?kind=${kind}&name=${encodeURIComponent(fileName)}`,
    { method: 'PUT', headers: { 'Content-Type': mimeType }, body },
    60000,
  );
  return ((await res.json()) as { file: CloudDataFile }).file;
}

export async function deleteFile(fileId: string): Promise<void> {
  await call(`${API}/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}

const excelOnly = (files: CloudDataFile[]) => files.filter((f) => EXCEL_RE.test(f.name) || f.mimeType.includes('spreadsheet') || f.mimeType.includes('excel'));

// ================================================================
// 「接続」＝役員ログイン（Google ドライブ版と同じ名前の関数）
// ================================================================

function loggedIn(): boolean {
  return getOfficerState().status === 'ok';
}

/** 役員ログイン中なら空でない値を返す（Google ドライブ版のアクセストークンの代わり） */
export function getSavedToken(): string {
  return loggedIn() ? 'officer' : '';
}

export function isTokenValid(): boolean {
  return loggedIn();
}

/** Google ドライブ版のクライアント ID の代わり。常に空でない値 */
export function getSavedClientId(): string {
  return 'cloudflare';
}

/** ログインしていなければ、ログインの画面へ移る */
export async function connectWithDefaultClientId(): Promise<string> {
  await recheckOfficer();
  if (loggedIn()) return 'officer';
  location.href = loginHref();
  throw new Error('役員ログインの画面に移ります');
}

/** ログイン中の役員のメールアドレス */
export async function getUserEmail(_token?: string): Promise<string> {
  return getOfficerState().email ?? '';
}

export function revokeToken(_token?: string): void { /* 役員ログインのログアウトはフッターの「ログアウト」 */ }
export function clearToken(): void { /* 何もしない */ }
export function clearFolderCache(): void { /* 何もしない */ }
export async function loadGisScript(): Promise<void> { /* Google のスクリプトは使わない */ }
/** Google ドライブ版はフォルダのリンクを返していた。Cloudflare 版は開く画面が無いので空 */
export async function getSharedFolderLink(_token?: string): Promise<string> {
  return '';
}

// ================================================================
// ふりがな一覧・所属一覧
// ================================================================

async function latestExcel(kind: DataKind): Promise<{ data: ArrayBuffer; fileName: string } | null> {
  const file = excelOnly(await listFiles(kind))[0];
  if (!file) return null;
  return { data: await downloadFile(file.id), fileName: file.name };
}

export function downloadFuriganaExcel(_token?: string) {
  return latestExcel('furigana');
}

export function downloadAffiliationExcel(_token?: string) {
  return latestExcel('affiliation');
}

export async function uploadFuriganaExcel(_token: string, fileName: string, xlsxBuffer: ArrayBuffer): Promise<void> {
  await uploadFile('furigana', fileName, xlsxBuffer, XLSX_MIME);
}

export async function uploadAffiliationExcel(_token: string, fileName: string, xlsxBuffer: ArrayBuffer): Promise<void> {
  await uploadFile('affiliation', fileName, xlsxBuffer, XLSX_MIME);
}

// ================================================================
// 時間割・大会一覧（大会日程表とドロー Excel）
// ================================================================

export async function listScheduleExcelFiles(_token?: string): Promise<CloudDataFile[]> {
  return excelOnly(await listFiles('schedule'));
}

export function downloadScheduleExcel(_token: string, fileId: string, _mimeType?: string): Promise<ArrayBuffer> {
  return downloadFile(fileId);
}

export async function uploadScheduleExcel(_token: string, fileName: string, xlsxBuffer: ArrayBuffer): Promise<void> {
  await uploadFile('schedule', fileName, xlsxBuffer, XLSX_MIME);
}

export async function listTournamentExcelFiles(_token?: string): Promise<CloudDataFile[]> {
  return excelOnly(await listFiles('tournament'));
}

export function downloadTournamentExcel(_token: string, fileId: string, _mimeType?: string): Promise<ArrayBuffer> {
  return downloadFile(fileId);
}

// ================================================================
// バックアップ・大会結果
// ================================================================

export async function uploadBackupJson(_token: string, fileName: string, jsonString: string): Promise<void> {
  await uploadFile('backup', fileName, jsonString, 'application/json');
}

export async function listBackupFiles(_token?: string): Promise<CloudDataFile[]> {
  return (await listFiles('backup')).filter((f) => f.name.toLowerCase().endsWith('.json') || f.mimeType === 'application/json');
}

export async function downloadBackupFile(_token: string, fileId: string): Promise<string> {
  return new TextDecoder().decode(await downloadFile(fileId));
}

export async function uploadResultFile(_token: string, fileName: string, data: Blob | ArrayBuffer, mimeType: string): Promise<void> {
  await uploadFile('result', fileName, data instanceof Blob ? await data.arrayBuffer() : data, mimeType);
}

export function listResultFiles(_token?: string): Promise<CloudDataFile[]> {
  return listFiles('result');
}
