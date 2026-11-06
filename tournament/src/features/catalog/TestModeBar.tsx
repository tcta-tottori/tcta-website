// テストモードの大会を開いているあいだ、画面の上に出す帯（testMode.ts）。
// 「テストを終える」で、テスト用に入れた運営データを端末から消して大会選択に戻る。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Loader2 } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { siteConfirm } from '../../components/site/siteConfirm';
import { useIsTestMode } from './testMode';
import { removeLocalTournament } from './deviceImport';

export default function TestModeBar() {
  const testMode = useIsTestMode();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!testMode) return null;
  const end = async () => {
    if (!(await siteConfirm({ title: 'テストを終える', message: 'テスト用に入れた運営データ（受付・試合結果）を、この端末から消して大会選択に戻ります。', confirmLabel: 'テストを終える', danger: true }))) return;
    setBusy(true);
    try {
      const id = useAppStore.getState().currentTournamentId;
      if (id) await removeLocalTournament(id);
      useAppStore.getState().setCurrentTournamentId(null);
      navigate('/data');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="test-bar" role="status">
      <div className="container test-bar__inner">
        <span className="test-bar__label"><FlaskConical className="w-3.5 h-3.5" />TEST</span>
        <p className="test-bar__text">テストモード：Cloudflare に自動保存しません。対戦順・データ管理からテスト用のスコアを自動で入れられます。</p>
        <button type="button" className="test-bar__btn" onClick={end} disabled={busy}>
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}テストを終える
        </button>
      </div>
    </div>
  );
}
