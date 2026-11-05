import LiveDashboard from '../live/LiveDashboard';

/**
 * LIVE公開ビュー
 * 既存の LiveDashboard を読み取り専用で再利用する。
 * LiveDashboard 自体が編集UIを含まないため、そのまま表示できる（左右の余白は LiveDashboard 側に任せる）。
 */
export default function PublicLiveView() {
  return (
    <LiveDashboard />
  );
}
