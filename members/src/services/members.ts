// 会員マスターの操作。連絡先（メール・電話・住所）は暗号化列に入れ、読むときは必ず decryptContact を通す。
import type { Env } from '../env';
import { all, nextSeq, nowIso, one, run } from '../lib/db';
import { blindIndex, decrypt, encrypt, normalizeEmail } from '../lib/crypto';
import { currentFiscalYear } from '../lib/fiscal';
import { ulid } from '../lib/ulid';
import type { Association, Member } from '../types';

export interface Contact { email: string | null; phone: string | null; postal: string | null; address: string | null }

export async function decryptContact(env: Env, m: Member): Promise<Contact> {
  return {
    email: await decrypt(env, m.email_enc),
    phone: await decrypt(env, m.phone_enc),
    postal: await decrypt(env, m.postal_enc),
    address: await decrypt(env, m.address_enc),
  };
}

export async function findMemberByEmail(env: Env, email: string): Promise<Member | null> {
  const h = await blindIndex(env, normalizeEmail(email));
  return one<Member>(env.DB, 'SELECT * FROM members WHERE email_hash = ? AND merged_into IS NULL', h);
}

export async function getMember(env: Env, id: string): Promise<Member | null> {
  const m = await one<Member>(env.DB, 'SELECT * FROM members WHERE id = ?', id);
  // 名寄せで結合済みなら結合先を返す
  if (m?.merged_into) return getMember(env, m.merged_into);
  return m;
}

/** 会員番号 T-26-0123（協会コード・年度下 2 桁・連番）。 */
export async function issueMemberNo(env: Env, assoc: Association): Promise<string> {
  const fy = currentFiscalYear(assoc.fiscal_year_start_month);
  const seq = await nextSeq(env.DB, `member_no:${assoc.code}:${fy}`);
  return `${assoc.code}-${String(fy).slice(-2)}-${String(seq).padStart(4, '0')}`;
}

export interface NewMember {
  name: string; kana: string; sex?: string | null; birthYear?: number | null;
  email?: string | null; phone?: string | null; postal?: string | null; address?: string | null;
  clubId?: string | null; homeAssociationId?: string | null; status?: 'active' | 'provisional';
  consented?: boolean;
}

export async function createMember(env: Env, n: NewMember): Promise<Member> {
  const id = ulid();
  const now = nowIso();
  let memberNo: string | null = null;
  if (n.homeAssociationId) {
    const assoc = await one<Association>(env.DB, 'SELECT * FROM associations WHERE id = ?', n.homeAssociationId);
    if (assoc) memberNo = await issueMemberNo(env, assoc);
  }
  const email = n.email ? normalizeEmail(n.email) : null;
  await run(
    env.DB,
    `INSERT INTO members (id, member_no, name, kana, sex, birth_year, email_hash, email_enc, phone_enc, postal_enc, address_enc,
       club_id, home_association_id, status, consented_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, memberNo, n.name.trim(), normalizeKana(n.kana), n.sex ?? null, n.birthYear ?? null,
    email ? await blindIndex(env, email) : null, await encrypt(env, email), await encrypt(env, n.phone),
    await encrypt(env, n.postal), await encrypt(env, n.address), n.clubId ?? null, n.homeAssociationId ?? null,
    n.status ?? 'active', n.consented ? now : null, now, now,
  );
  return (await one<Member>(env.DB, 'SELECT * FROM members WHERE id = ?', id))!;
}

export interface MemberUpdate {
  name?: string; kana?: string; sex?: string | null; birthYear?: number | null; email?: string | null;
  phone?: string | null; postal?: string | null; address?: string | null; clubId?: string | null; status?: string;
}

export async function updateMember(env: Env, id: string, u: MemberUpdate): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v); };
  if (u.name !== undefined) push('name', u.name.trim());
  if (u.kana !== undefined) push('kana', normalizeKana(u.kana));
  if (u.sex !== undefined) push('sex', u.sex);
  if (u.birthYear !== undefined) push('birth_year', u.birthYear);
  if (u.email !== undefined) {
    const e = u.email ? normalizeEmail(u.email) : null;
    push('email_hash', e ? await blindIndex(env, e) : null);
    push('email_enc', await encrypt(env, e));
  }
  if (u.phone !== undefined) push('phone_enc', await encrypt(env, u.phone));
  if (u.postal !== undefined) push('postal_enc', await encrypt(env, u.postal));
  if (u.address !== undefined) push('address_enc', await encrypt(env, u.address));
  if (u.clubId !== undefined) push('club_id', u.clubId);
  if (u.status !== undefined) push('status', u.status);
  push('updated_at', nowIso());
  params.push(id);
  await run(env.DB, `UPDATE members SET ${sets.join(', ')} WHERE id = ?`, ...params);
}

/** ふりがなの表記ゆれを吸収（カタカナ→ひらがな、全角空白→除去）。 */
export function normalizeKana(s: string): string {
  return s
    .trim()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, '');
}

export interface MemberBrief { id: string; member_no: string | null; name: string; kana: string; club_name: string | null; status: string }

/** 氏名・ふりがな・会員番号で検索（個人情報の列は返さない）。 */
export async function searchMembers(env: Env, q: string, limit = 20): Promise<MemberBrief[]> {
  const like = `%${q.trim()}%`;
  const kana = `%${normalizeKana(q)}%`;
  return all<MemberBrief>(
    env.DB,
    `SELECT m.id, m.member_no, m.name, m.kana, c.name AS club_name, m.status
       FROM members m LEFT JOIN clubs c ON c.id = m.club_id
      WHERE m.merged_into IS NULL AND m.status <> 'withdrawn'
        AND (m.name LIKE ? OR m.kana LIKE ? OR m.member_no = ?)
      ORDER BY m.kana LIMIT ?`,
    like, kana, q.trim(), limit,
  );
}

/** 名寄せ: 氏名＋ふりがなが一致する既存レコード。 */
export async function findSameNameMembers(env: Env, name: string, kana: string, excludeId?: string): Promise<Member[]> {
  return all<Member>(
    env.DB,
    `SELECT * FROM members WHERE merged_into IS NULL AND name = ? AND kana = ? AND id <> ? ORDER BY created_at`,
    name.trim(), normalizeKana(kana), excludeId ?? '',
  );
}

export async function hasApprovedRegistration(env: Env, memberId: string, associationId: string, fiscalYear: number): Promise<boolean> {
  const r = await one(env.DB, `SELECT 1 AS ok FROM registrations WHERE member_id = ? AND association_id = ? AND fiscal_year = ? AND status = 'approved'`, memberId, associationId, fiscalYear);
  return Boolean(r);
}
