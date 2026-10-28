-- 会員本人からの「登録情報の削除依頼」。退会ボタンの代わり。事務局（協会管理）が確認して削除を実行する。
CREATE TABLE deletion_requests (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'done' | 'withdrawn'（本人と相談して取り下げ）
  handled_by TEXT,
  handled_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX deletion_requests_status ON deletion_requests(status);
