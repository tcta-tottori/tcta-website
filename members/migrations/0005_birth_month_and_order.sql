-- 生年に月を加える（日は持たない）。協会に表示順を持たせる（県 → 鳥取市 → 倉吉市 → 米子市）。
ALTER TABLE members ADD COLUMN birth_month INTEGER;
ALTER TABLE associations ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 100;
UPDATE associations SET sort_order = 1 WHERE id = 'tottori-pref';
UPDATE associations SET sort_order = 2 WHERE id = 'tottori-city';
UPDATE associations SET sort_order = 3 WHERE id = 'kurayoshi-city';
UPDATE associations SET sort_order = 4 WHERE id = 'yonago-city';
