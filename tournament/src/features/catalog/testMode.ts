// テストモード：大会選択の「テストモードで試す」から端末に入れた大会。
//   ・運営中のデータを Cloudflare に自動保存しない（autoSave.ts）
//   ・テスト用のスコア自動入力（全試合を 8-4 / 6-4 で終了 など）が使える
// 通常の「運営をはじめる」から入れた大会では、テスト用のスコア入力は出さない。
// 印は端末の大会の記録（db.tournaments の isTest）に持つので、画面を開き直しても続く。
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';

/** 今の大会がテストモードか（画面用） */
export function useIsTestMode(): boolean {
  const id = useAppStore((s) => s.currentTournamentId);
  return useLiveQuery(async () => (id ? !!(await db.tournaments.where('tournamentId').equals(id).first())?.isTest : false), [id]) ?? false;
}

/** 今の大会がテストモードか（画面の外から） */
export async function isTestModeNow(): Promise<boolean> {
  const id = useAppStore.getState().currentTournamentId;
  if (!id) return false;
  return !!(await db.tournaments.where('tournamentId').equals(id).first())?.isTest;
}
