import CloudflareLogo from './CloudflareLogo';
import SiteDialog from '../site/SiteDialog';
import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

/** 大会データの置き場（Cloudflare）のアイコン */
function CloudDataIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return <CloudflareLogo className={className} />;
}

export interface LoadingStep {
  label: string;
  status: 'waiting' | 'loading' | 'done' | 'error';
  detail?: string;
}

interface DriveLoadingModalProps {
  open: boolean;
  title: string;
  steps: LoadingStep[];
  progress?: number; // 0-100 の進捗率
  result?: { success: boolean; message: string; details?: string[] } | null;
  onClose?: () => void;
  /** タイムアウト（ms）。進捗が一定時間変化しない場合エラーを出して閉じる。0で無効。デフォルト8000ms */
  timeoutMs?: number;
  /** タイムアウト時に呼ばれるコールバック */
  onTimeout?: () => void;
}

export default function DriveLoadingModal({ open, title, steps, progress, result, onClose, timeoutMs = 8000, onTimeout }: DriveLoadingModalProps) {
  // 8秒タイムアウト: progressが変化しないまま8秒経過 → onTimeout → 自動閉じ
  const lastProgressRef = useRef<number>(0);
  const lastChangeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || !!result || timeoutMs <= 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    // 進捗が変化したら時刻リセット
    if (progress !== lastProgressRef.current) {
      lastProgressRef.current = progress ?? 0;
      lastChangeRef.current = Date.now();
    }
    timerRef.current = setInterval(() => {
      if (Date.now() - lastChangeRef.current > timeoutMs) {
        if (timerRef.current) clearInterval(timerRef.current);
        onTimeout?.();
      }
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [open, progress, result, timeoutMs, onTimeout]);

  // open時にタイムスタンプリセット
  useEffect(() => {
    if (open) {
      lastProgressRef.current = 0;
      lastChangeRef.current = Date.now();
    }
  }, [open]);

  if (!open) return null;

  const isFinished = !!result;

  return (
    <SiteDialog
      open
      eyebrow={isFinished ? (result!.success ? 'COMPLETE' : 'NOTICE') : 'LOADING'}
      title={title}
      danger={isFinished && !result!.success}
      onClose={isFinished ? onClose : undefined}
      actions={isFinished && onClose ? <button className="btn btn--primary sdlg__btn" onClick={onClose}>閉じる</button> : undefined}
    >
      <div className="sdlg-src"><CloudDataIcon className="w-4 h-4" /><span>Cloudflare</span></div>
      {typeof progress === 'number' && (
        <div className="sdlg-progress">
          <div className="sdlg-progress__head"><span>進み具合</span><span className="sdlg-progress__num">{Math.round(progress)}%</span></div>
          <div className="sdlg-progress__bar"><div className="sdlg-progress__fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>
        </div>
      )}
      <ul className="sdlg-steps">
        {steps.map((step, i) => (
          <li key={i} className={`sdlg-step is-${step.status}`}>
            <span className="sdlg-step__ico">
              {step.status === 'waiting' && <span className="dot" />}
              {step.status === 'loading' && <span className="sdlg-spin" />}
              {step.status === 'done' && <CheckCircle2 />}
              {step.status === 'error' && <AlertCircle />}
            </span>
            <span>{step.label}{step.detail && <span className="sdlg-step__detail">{step.detail}</span>}</span>
          </li>
        ))}
      </ul>
      {result && (
        <div className={`sdlg-result ${result.success ? '' : 'is-error'}`} role="status">
          {result.message}
          {result.details && result.details.length > 0 && <ul>{result.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
        </div>
      )}
    </SiteDialog>
  );
}
