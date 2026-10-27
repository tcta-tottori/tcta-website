// IP 単位のレート制限（設計書 §7.3: 登録 5 回/時、ログインリンク 3 回/15 分）。D1 に窓を持つ単純な固定窓。
import { one, run } from './db';

export async function rateLimit(db: D1Database, key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const row = await one<{ count: number; window_start: number }>(db, 'SELECT count, window_start FROM rate_limits WHERE key = ?', key);
  if (!row || now - row.window_start >= windowSec) {
    await run(db, 'INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)', key, now);
    return true;
  }
  if (row.count >= limit) return false;
  await run(db, 'UPDATE rate_limits SET count = count + 1 WHERE key = ?', key);
  return true;
}
