-- 氏名を姓・名、ふりがなを せい・めい に分けて持つ。検索・名寄せ・出力用に結合した name / kana も引き続き保持する。
-- 所属は「フリー（無所属）」を club_id = NULL で表す（「クラブ無所属」という仮のクラブは廃止）。
ALTER TABLE members ADD COLUMN family_name TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN given_name TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN family_kana TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN given_kana TEXT NOT NULL DEFAULT '';
-- 既存データは「姓 名」の空白で分け、ふりがなは分けられないので姓側に入れておく（事務局が会員編集で直せる）
UPDATE members SET
  family_name = CASE WHEN instr(name, ' ') > 0 THEN substr(name, 1, instr(name, ' ') - 1) ELSE name END,
  given_name  = CASE WHEN instr(name, ' ') > 0 THEN substr(name, instr(name, ' ') + 1) ELSE '' END,
  family_kana = kana
WHERE family_name = '' AND given_name = '';
UPDATE members SET club_id = NULL WHERE club_id = 'club-free';
DELETE FROM clubs WHERE id = 'club-free';
