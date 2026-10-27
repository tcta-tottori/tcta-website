-- 参加資格を「どの協会の年度登録が必要か」の組み合わせで持つ。
-- eligibility_json: [["tottori-city"], ["tottori-pref"]] のような「いずれかの行を満たせばよい（行の中はすべて必要）」の形。
--   []                                   … 誰でも参加できる（登録不要）
--   [["tottori-city"]]                   … 鳥取市登録が必要（県登録だけでは不可）
--   [["tottori-pref"]]                   … 県登録が必要
--   [["tottori-pref","tottori-city"]]     … 県登録 と 鳥取市登録 の両方が必要
--   [["tottori-city"],["tottori-pref"]]  … 鳥取市登録 または 県登録
--   [["yonago-city"]]                    … 米子市登録が必要
-- partner_rule: 'same' = ペアも同じ条件 / 'none' = 代表だけ判定
ALTER TABLE tournaments ADD COLUMN eligibility_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE tournaments ADD COLUMN partner_rule TEXT NOT NULL DEFAULT 'same';
UPDATE tournaments SET eligibility_json = '[["' || association_id || '"]]' WHERE requires_registration = 1;
