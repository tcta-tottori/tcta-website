// 会員マスターの操作。連絡先（メール・電話・住所）は暗号化列に入れ、読むときは必ず decryptContact を通す。
import type { Env } from '../env';
import { all, nextSeq, nowIso, one, run } from '../lib/db';
import { blindIndex, decrypt, encrypt, normalizeEmail } from '../lib/crypto';
import { currentFiscalYear } from '../lib/fiscal';
import { ulid } from '../lib/ulid';
import type { Association, Club, Member } from '../types';

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

export interface Names { familyName: string; givenName: string; familyKana: string; givenKana: string }

/** 表示・検索用の氏名「姓 名」 */
export const composeName = (family: string, given: string) => `${family.trim()} ${given.trim()}`.trim();
/** 名寄せ用のふりがな（せい＋めい、ひらがなに正規化） */
export const composeKana = (family: string, given: string) => normalizeKana(family + given);

export interface NewMember extends Names {
  sex?: string | null; birthYear?: number | null;
  email?: string | null; phone?: string | null; postal?: string | null; address?: string | null;
  clubId?: string | null; homeAssociationId?: string | null; status?: 'active' | 'provisional';
  consented?: boolean;
}

export async function createMember(env: Env, n: NewMember): Promise<Member> {
  const checked = checkNames(n);
  if (typeof checked === 'string') throw new Error(checked);
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
    `INSERT INTO members (id, member_no, name, kana, family_name, given_name, family_kana, given_kana, sex, birth_year, email_hash, email_enc, phone_enc, postal_enc, address_enc,
       club_id, home_association_id, status, consented_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, memberNo, composeName(n.familyName, n.givenName), composeKana(n.familyKana, n.givenKana),
    n.familyName.trim(), n.givenName.trim(), normalizeKana(n.familyKana), normalizeKana(n.givenKana),
    n.sex ?? null, n.birthYear ?? null,
    email ? await blindIndex(env, email) : null, await encrypt(env, email), await encrypt(env, n.phone),
    await encrypt(env, n.postal), await encrypt(env, n.address), n.clubId ?? null, n.homeAssociationId ?? null,
    n.status ?? 'active', n.consented ? now : null, now, now,
  );
  return (await one<Member>(env.DB, 'SELECT * FROM members WHERE id = ?', id))!;
}

export interface MemberUpdate {
  names?: Names; sex?: string | null; birthYear?: number | null; email?: string | null;
  phone?: string | null; postal?: string | null; address?: string | null; clubId?: string | null; status?: string;
}

export async function updateMember(env: Env, id: string, u: MemberUpdate): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v); };
  if (u.names) {
    const checked = checkNames(u.names);
    if (typeof checked === 'string') throw new Error(checked);
    push('family_name', u.names.familyName.trim()); push('given_name', u.names.givenName.trim());
    push('family_kana', normalizeKana(u.names.familyKana)); push('given_kana', normalizeKana(u.names.givenKana));
    push('name', composeName(u.names.familyName, u.names.givenName)); push('kana', composeKana(u.names.familyKana, u.names.givenKana));
  }
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

/** クラブ名からクラブを探し、無ければ作る。空なら null（フリー） */
export async function findOrCreateClub(env: Env, name: string | null | undefined): Promise<string | null> {
  const n = (name ?? '').trim();
  if (!n || n === 'フリー' || n === '無所属') return null;
  const cl = await one<Club>(env.DB, 'SELECT * FROM clubs WHERE name = ?', n);
  if (cl) return cl.id;
  const id = `club-${ulid().toLowerCase()}`;
  await run(env.DB, 'INSERT INTO clubs (id, name, created_at) VALUES (?, ?, ?)', id, n, nowIso());
  return id;
}

/** 所属の選択（フリー／登録済み／その他を手入力）を club_id に直す */
export async function resolveClub(env: Env, sel: string | undefined, other: string | undefined): Promise<string | null> {
  if (!sel || sel === '__free__') return null;
  if (sel === '__other__') return findOrCreateClub(env, other);
  const cl = await one<Club>(env.DB, 'SELECT id FROM clubs WHERE id = ?', sel);
  return cl ? sel : null;
}

/** フォームの 4 欄から Names を組む（足りなければ null） */
/** フォームの 4 欄から Names を組む。足りない・ふりがながひらがなでないときはエラー文を返す */
export function namesFromForm(f: Record<string, string>, prefix = ''): Names | string {
  const k = (x: string) => (prefix ? `${prefix}_${x}` : x);
  return checkNames({ familyName: f[k('family_name')] ?? f[k('family')] ?? '', givenName: f[k('given_name')] ?? f[k('given')] ?? '', familyKana: f[k('family_kana')] ?? '', givenKana: f[k('given_kana')] ?? '' });
}

/** 姓・名・せい・めい がそろっていて、ふりがながひらがなだけか。正しければ（ふりがなを正規化した）Names、だめならエラー文 */
export function checkNames(n: Names): Names | string {
  if (!n.familyName.trim() || !n.givenName.trim() || !n.familyKana.trim() || !n.givenKana.trim()) return '姓・名・せい・めいはすべて入力してください';
  const fk = normalizeKana(n.familyKana);
  const gk = normalizeKana(n.givenKana);
  const bad = [kanaProblem('せい', n.familyKana, fk), kanaProblem('めい', n.givenKana, gk)].filter(Boolean);
  if (bad.length) return `ふりがなはひらがなで入力してください（${bad.join('、')}）`;
  return { ...n, familyKana: fk, givenKana: gk };
}

function kanaProblem(label: string, raw: string, normalized: string): string | null {
  if (isHiraganaKana(normalized)) return null;
  const chars = [...new Set([...normalized].filter((ch) => !KANA_CHAR.test(ch)))].slice(0, 5).join('');
  return `${label}に「${chars || raw}」`;
}

/** ふりがなの表記ゆれを吸収（半角カナ→全角、カタカナ→ひらがな、空白→除去）。 */
export function normalizeKana(s: string): string {
  return s
    .normalize('NFKC')
    .trim()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, '');
}

/** ふりがなに使える文字: ひらがな（小書き・ゔ を含む）と長音符 */
const KANA_CHAR = /^[ぁ-ゖー]$/;
export const isHiraganaKana = (s: string) => /^[ぁ-ゖー]+$/.test(s);

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
