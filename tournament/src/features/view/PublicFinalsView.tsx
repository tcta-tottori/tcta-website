import CourtBracketPage from '../court-bracket/CourtBracketPage';

/**
 * 決勝トーナメント公開ビュー（個人戦）
 * リーグの順位で組む順位別トーナメントなど、トーナメントの種目だけを「ドロー」と同じ画面で読み取り専用に見せる。
 * リーグとトーナメントの両方がある大会（会長杯など）のとき、観戦ページのメニューに出る（PublicLayout）。
 */
export default function PublicFinalsView() {
  return <CourtBracketPage enableScoreInput={false} only="tournament" />;
}
