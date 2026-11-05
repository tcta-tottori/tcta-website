import CourtBracketPage from '../court-bracket/CourtBracketPage';

/**
 * ドロー公開ビュー（個人戦）
 * 運営用の「ドロー」画面（CourtBracketPage）を読み取り専用で再利用する。
 * enableScoreInput=false によりスコア入力は無効（観戦者は閲覧のみ）。
 */
export default function PublicDrawView() {
  // 運営画面の「ドロー」と同じく、画面の中（main）をそのままスクロールさせる（高さを決め打ちにしない）
  return <CourtBracketPage enableScoreInput={false} />;
}
