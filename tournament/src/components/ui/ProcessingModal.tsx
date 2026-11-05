import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import SiteDialog from '../site/SiteDialog';

export interface ProcessingStep {
  label: string;
  status: 'waiting' | 'loading' | 'done' | 'error';
  detail?: string;
}

interface ProcessingModalProps {
  open: boolean;
  title: string;
  steps: ProcessingStep[];
  progress?: number;
  result?: { success: boolean; message: string } | null;
  onClose?: () => void;
  timeoutMs?: number;
  onTimeout?: () => void;
}

export default function ProcessingModal({ open, title, steps, progress, result, onClose, timeoutMs = 15000, onTimeout }: ProcessingModalProps) {
  const lastProgressRef = useRef<number>(0);
  const lastChangeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || !!result || timeoutMs <= 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
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

  useEffect(() => {
    if (open) {
      lastProgressRef.current = 0;
      lastChangeRef.current = Date.now();
    }
  }, [open]);

  if (!open) return null;

  const isFinished = !!result;

  // 見た目は協会サイトの決まりのポップアップ（SiteDialog）。読み込み中の並びは DriveLoadingModal と同じ部品（.sdlg-steps など）
  return (
    <SiteDialog
      open
      title={title}
      eyebrow={isFinished ? 'DONE' : 'PROCESSING'}
      onClose={isFinished ? onClose : undefined}
      actions={isFinished ? (
        <button onClick={onClose} className="btn btn--primary sdlg__btn">閉じる</button>
      ) : undefined}
    >
      <p className="sdlg-src"><Lock className="w-3.5 h-3.5" />{isFinished ? '完了' : '処理中...'}</p>

      {/* Progress bar */}
      {typeof progress === 'number' && !isFinished && (
        <div className="sdlg-progress">
          <div className="sdlg-progress__head">
            <span>進捗</span>
            <span className="sdlg-progress__num">{Math.round(progress)}%</span>
          </div>
          <div className="sdlg-progress__bar">
            <div className="sdlg-progress__fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        </div>
      )}

      {/* Steps */}
      <ul className="sdlg-steps">
        {steps.map((step, i) => (
          <li key={i} className={`sdlg-step is-${step.status}`}>
            <span className="sdlg-step__ico">
              {step.status === 'waiting' && <span className="dot" />}
              {step.status === 'loading' && <span className="sdlg-spin" />}
              {step.status === 'done' && <CheckCircle2 />}
              {step.status === 'error' && <AlertCircle />}
            </span>
            <span>
              {step.label}
              {step.detail && <span className="sdlg-step__detail">{step.detail}</span>}
            </span>
          </li>
        ))}
      </ul>

      {/* Result */}
      {result && (
        <div className={`sdlg-result ${result.success ? '' : 'is-error'}`}>
          {result.message}
        </div>
      )}
      {!isFinished && <div className="h-5" />}
    </SiteDialog>
  );
}
