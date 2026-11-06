// 大会の運営データ（端末の IndexedDB ＋ ミックス・団体戦）をまとめた 1 つの JSON（統合バックアップ）を作る・戻す。
// バックアップの画面（BackupPage.tsx）と、Cloudflare への自動保存（autoSave.ts）で使う。
/* eslint-disable @typescript-eslint/no-explicit-any */
import { exportFullBackup, importFullBackup, validateBackupData } from './backupEngine';

const MIXED_STORAGE_KEY = 'mixed-tournament-storage';
const TEAM_STORAGE_KEY = 'team-tournament-storage';

/** LocalStorageから軽量化したZustand state を取得 */
function extractStoreState(key: string): { state: any; tournamentName: string; tournamentDate: string } | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const state = parsed?.state || parsed;
    return {
      state: { ...state, rawExcelSheets: [] },
      tournamentName: state?.tournamentInfo?.name || '',
      tournamentDate: state?.tournamentInfo?.date || '',
    };
  } catch {
    return null;
  }
}

/** DB + ミックスダブルス + 団体戦を統合した軽量バックアップを生成 */
export async function buildUnifiedBackup() {
  const dbData = await exportFullBackup();
  const mixed = extractStoreState(MIXED_STORAGE_KEY);
  const team = extractStoreState(TEAM_STORAGE_KEY);

  const tournamentName = mixed?.tournamentName || team?.tournamentName || '';
  const tournamentDate = mixed?.tournamentDate || team?.tournamentDate || '';

  return {
    _type: 'unified-backup',
    _version: 3,
    createdAt: new Date().toISOString(),
    tournamentName,
    tournamentDate,
    db: dbData,
    mixed: mixed?.state || null,
    team: team?.state || null,
  };
}

/** 統合バックアップを復元 */
export async function restoreUnifiedBackup(data: any): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  // DB復元
  if (data.db && validateBackupData(data.db)) {
    const result = await importFullBackup(data.db, true);
    imported += result.imported;
    errors.push(...result.errors);
  } else if (data.tables && validateBackupData(data)) {
    // 旧形式（DB onlyバックアップ）のフォールバック
    const result = await importFullBackup(data, true);
    imported += result.imported;
    errors.push(...result.errors);
  }

  // ミックスダブルス復元
  if (data.mixed) {
    try {
      const persistData = { state: data.mixed, version: 4 };
      localStorage.setItem(MIXED_STORAGE_KEY, JSON.stringify(persistData));
      imported += 1;
    } catch (e) {
      errors.push(`ミックスダブルス: ${(e as Error).message}`);
    }
  } else if (data._type === 'mixed-tournament-backup' && data.state) {
    // 旧ミックス単体バックアップのフォールバック
    try {
      const persistData = { state: data.state, version: 4 };
      localStorage.setItem(MIXED_STORAGE_KEY, JSON.stringify(persistData));
      imported += 1;
    } catch (e) {
      errors.push(`ミックスダブルス: ${(e as Error).message}`);
    }
  }

  // 団体戦復元
  if (data.team) {
    try {
      const persistData = { state: data.team, version: 1 };
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(persistData));
      imported += 1;
    } catch (e) {
      errors.push(`団体戦: ${(e as Error).message}`);
    }
  }

  return { imported, errors };
}

/** バックアップデータの形式チェック */
export function isValidBackup(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  // 統合バックアップ
  if (data._type === 'unified-backup') return true;
  // 旧DBバックアップ
  if (data.tables && data.stats) return true;
  // 旧ミックス単体バックアップ
  if (data._type === 'mixed-tournament-backup' && data.state) return true;
  return false;
}

