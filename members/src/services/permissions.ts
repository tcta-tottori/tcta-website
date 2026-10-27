// ロール別権限（設計書 §7.1 の表）。「住所・電話・メール」を見られるのは協会管理だけ。
import type { Admin, Payment, Tournament } from '../types';

export const canViewPii = (a: Admin) => a.role === 'assoc_admin';
export const canEditMembers = (a: Admin) => a.role === 'assoc_admin';
export const canApproveRegistration = (a: Admin) => a.role === 'assoc_admin';
export const canExportMembers = (a: Admin) => a.role === 'assoc_admin';
export const canImport = (a: Admin) => a.role === 'assoc_admin';
export const canManageAdmins = (a: Admin) => a.role === 'sysadmin';
export const canCreateTournament = (a: Admin) => a.role === 'assoc_admin' || a.role === 'sysadmin';

export function ownsTournament(a: Admin, t: Tournament): boolean {
  if (a.role === 'sysadmin') return true;
  if (a.role === 'assoc_admin') return a.association_id === t.association_id;
  if (a.role === 'tournament') return (JSON.parse(a.tournament_ids_json) as string[]).includes(t.id);
  return false;
}

export function canViewTournament(a: Admin, t: Tournament): boolean {
  if (ownsTournament(a, t)) return true;
  return a.role === 'viewer' && a.association_id === t.association_id;
}

/** 消込できるか。協会管理＝自協会の全支払、大会運営＝担当大会のエントリー分、ショップ＝現金のみ。 */
export function canConfirmPayment(a: Admin, p: Payment, tournament?: Tournament | null): boolean {
  if (a.role === 'assoc_admin') return a.association_id === p.association_id;
  if (a.role === 'shop') return p.method === 'cash';
  if (a.role === 'tournament') return p.kind === 'entry' && !!tournament && ownsTournament(a, tournament);
  return false;
}

/** 会員一覧の協会スコープ（sysadmin は設定専用で名簿を見ない）。 */
export function memberScope(a: Admin): string | null {
  return a.role === 'assoc_admin' || a.role === 'viewer' ? a.association_id : null;
}
