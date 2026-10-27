-- 会員登録・大会エントリー一元管理システム 初期スキーマ（設計書 §4 データモデル）
-- 「人」は members だけに置き、協会・年度・大会との関係は紐づけテーブルで持つ。
-- 住所・電話・メールは Workers 側で列暗号化して *_enc に入れる（鍵は Secrets の DATA_KEY）。

CREATE TABLE associations (
  id TEXT PRIMARY KEY,                 -- 'tottori-city' など
  code TEXT NOT NULL UNIQUE,           -- 会員番号の接頭辞（T / P / K / Y）
  name TEXT NOT NULL,
  annual_fee INTEGER NOT NULL DEFAULT 0,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 4,  -- 年度の切替月（未決事項。既定 4 月）
  reg_note TEXT,                       -- 年度登録の案内
  bank_info TEXT,                      -- 振込先
  paypay_info TEXT,                    -- PayPay の送金先
  stripe_account TEXT,                 -- 協会ごとの Stripe アカウント（表示用メモ）
  created_at TEXT NOT NULL
);

CREATE TABLE clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,                 -- ULID（推測不能）
  member_no TEXT UNIQUE,               -- 表示用の会員番号（例 T-26-0123）
  name TEXT NOT NULL,
  kana TEXT NOT NULL,
  sex TEXT,                            -- 'male' | 'female' | 'other' | NULL
  birth_year INTEGER,                  -- 年齢区分の判定に必要な「生年」のみ（最小保有）
  email_hash TEXT UNIQUE,              -- 検索用の盲検索インデックス（HMAC）
  email_enc TEXT,
  phone_enc TEXT,
  postal_enc TEXT,
  address_enc TEXT,
  club_id TEXT REFERENCES clubs(id),
  home_association_id TEXT REFERENCES associations(id),
  club_manager INTEGER NOT NULL DEFAULT 0,   -- 1 = 自クラブの「クラブ管理」ロール
  status TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'provisional'（仮会員: 本人未確認） | 'withdrawn'
  withdrawn_at TEXT,
  contacts_purged_at TEXT,                   -- 退会 2 年後に連絡先を削除した日時
  merged_into TEXT REFERENCES members(id),   -- 名寄せで結合された先（取り消し可能）
  consented_at TEXT,                         -- 共同利用規程への同意日時
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX members_kana ON members(kana);
CREATE INDEX members_club ON members(club_id);

CREATE TABLE registrations (          -- 年度登録（どの協会に・どの年度に登録したか）
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  association_id TEXT NOT NULL REFERENCES associations(id),
  fiscal_year INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',  -- 'general' | 'student' | 'junior' | 'senior'
  fee INTEGER NOT NULL,
  payment_id TEXT REFERENCES payments(id),
  status TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'approved' | 'rejected'
  source TEXT NOT NULL DEFAULT 'web',        -- 'web' | 'shop' | 'club' | 'import'
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(member_id, association_id, fiscal_year)
);

CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  association_id TEXT NOT NULL REFERENCES associations(id),   -- 主催協会
  name TEXT NOT NULL,
  held_on TEXT NOT NULL,
  venue TEXT,
  entry_start TEXT NOT NULL,
  entry_end TEXT NOT NULL,
  eligibility TEXT,
  requires_registration INTEGER NOT NULL DEFAULT 1,  -- 1 = 主催協会の当年度登録が必要
  events_json TEXT NOT NULL,            -- [{code,name,classes[],fee,teamSize}]
  payment_methods_json TEXT NOT NULL,   -- ['stripe','bank','paypay','cash']
  unpaid_policy TEXT NOT NULL DEFAULT 'hold',  -- 締切時に支払待ちを 'cancel' か 'hold'（事務局判断）
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'open' | 'closed'
  created_at TEXT NOT NULL
);

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  event_code TEXT NOT NULL,
  class TEXT,
  member_id TEXT NOT NULL REFERENCES members(id),          -- 代表
  partner_member_id TEXT REFERENCES members(id),           -- ペア（会員 ID で持つ）
  source TEXT NOT NULL DEFAULT 'web',                      -- 'web' | 'shop' | 'club'
  payment_id TEXT REFERENCES payments(id),
  status TEXT NOT NULL DEFAULT 'pending_payment',          -- 'pending_payment' | 'confirmed' | 'cancelled'
  created_by TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT
);
CREATE INDEX entries_tournament ON entries(tournament_id);
CREATE INDEX entries_member ON entries(member_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                   -- 'registration' | 'entry'
  association_id TEXT NOT NULL REFERENCES associations(id),  -- 支払先の協会（資金は協会ごと）
  payer_member_id TEXT REFERENCES members(id),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,                 -- 'stripe' | 'bank' | 'paypay' | 'cash'
  external_id TEXT,                     -- Stripe の Checkout Session ID など
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'paid' | 'refunded' | 'cancelled'
  paid_at TEXT,
  confirmed_by TEXT,                    -- 'stripe:webhook' か 管理者メール
  receipt_no TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX payments_status ON payments(status);

CREATE TABLE admins (                   -- Cloudflare Access のグループに対応する事務局アカウント
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  association_id TEXT REFERENCES associations(id),
  role TEXT NOT NULL,                   -- 'sysadmin' | 'assoc_admin' | 'tournament' | 'viewer' | 'shop'
  tournament_ids_json TEXT NOT NULL DEFAULT '[]',   -- 大会運営ロールの担当大会
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE audit_log (                -- 個人情報の閲覧・出力・更新・削除をすべて記録（削除不可）
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor_type TEXT NOT NULL,             -- 'member' | 'admin' | 'shop' | 'system' | 'api'
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  before_json TEXT,
  after_json TEXT,
  ip TEXT
);
CREATE INDEX audit_log_at ON audit_log(at);
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TABLE magic_links (              -- メールのログインリンク（15 分有効・1 回限り）
  token_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  email_enc TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                   -- 'member' | 'signup' | 'admin'
  subject TEXT NOT NULL,                -- member.id / admin.id / 暗号化メール（signup）
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE api_tokens (               -- 大会運営アプリ（GitHub Pages）向けの読み取り専用トークン
  token_hash TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  label TEXT,
  expires_at TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TABLE merge_candidates (         -- 名寄せの候補（自動結合はせず事務局が確定）
  id TEXT PRIMARY KEY,
  keep_member_id TEXT NOT NULL REFERENCES members(id),
  dup_member_id TEXT NOT NULL REFERENCES members(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'merged' | 'dismissed'
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sequences (key TEXT PRIMARY KEY, value INTEGER NOT NULL);

CREATE TABLE reminders_sent (key TEXT PRIMARY KEY, at TEXT NOT NULL);

CREATE TABLE mail_outbox (              -- 開発モードの送信箱（Email Sending が無いときの代わり）
  id TEXT PRIMARY KEY,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
