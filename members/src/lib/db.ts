// D1 の薄い補助。SQL はすべてプリペアドステートメント（設計書 §7.3 インジェクション対策）。
export const nowIso = () => new Date().toISOString();

export async function one<T = Record<string, unknown>>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  const row = await db.prepare(sql).bind(...params).first<T>();
  return row ?? null;
}

export async function all<T = Record<string, unknown>>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const { results } = await db.prepare(sql).bind(...params).all<T>();
  return results ?? [];
}

export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

/** 会員番号・領収書番号の連番。RETURNING で読むので同時実行でも重複しない。 */
export async function nextSeq(db: D1Database, key: string): Promise<number> {
  await run(db, 'INSERT OR IGNORE INTO sequences (key, value) VALUES (?, 0)', key);
  const row = await one<{ value: number }>(db, 'UPDATE sequences SET value = value + 1 WHERE key = ? RETURNING value', key);
  return row!.value;
}
