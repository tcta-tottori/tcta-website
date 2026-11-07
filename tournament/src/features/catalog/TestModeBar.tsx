// テストモードの大会を開いているあいだ、ヘッダーの下に出す 1 行の帯（testMode.ts）。
//   ・「TEST」の札と説明を 1 行で。説明が 1 行に収まらない幅では、横に流す（軽量モード・動きを減らす設定では流さず省略）
//   ・「テストを終える」はスマホではメニューの軽量モードの横（TestEndButton。AppLayout.tsx が MobileNav に渡す）。
//     PC はメニュー（三本線）が無いので、帯の右端に小さく置く
import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Loader2 } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { siteConfirm } from '../../components/site/siteConfirm';
import { useIsTestMode } from './testMode';
import { removeLocalTournament } from './deviceImport';

const TEXT = 'テストモード：Cloudflare に自動保存しません。対戦順・データ管理からテスト用のスコアを自動で入れられます。';

export default function TestModeBar() {
  const testMode = useIsTestMode();
  const box = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  // 1 行に収まるかを見る（幅が変わるたびに）
  useLayoutEffect(() => {
    if (!testMode) return;
    const check = () => { if (box.current && txt.current) setOverflow(txt.current.scrollWidth > box.current.clientWidth + 1); };
    check();
    const ro = new ResizeObserver(check);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [testMode]);

  if (!testMode) return null;
  return (
    <div className="test-bar" role="status">
      <div className="container test-bar__inner">
        <span className="test-bar__label"><FlaskConical className="w-3.5 h-3.5" />TEST</span>
        <div ref={box} className={`test-bar__mq ${overflow ? 'is-run' : ''}`}>
          <span className="test-bar__track">
            <span ref={txt} className="test-bar__text">{TEXT}</span>
            {overflow && <span className="test-bar__text" aria-hidden="true">{TEXT}</span>}
          </span>
        </div>
        <span className="test-bar__end"><TestEndButton /></span>
      </div>
    </div>
  );
}

/** メニューの軽量モードの横に置く「テストを終える」。テスト用に入れた運営データを端末から消して大会選択に戻る */
export function TestEndButton({ onDone }: { onDone?: () => void }) {
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
      onDone?.();
      navigate('/data');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="test-end" onClick={() => void end()} disabled={busy}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}テストを終える
    </button>
  );
}
