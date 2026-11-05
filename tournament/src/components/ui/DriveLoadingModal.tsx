import CloudflareLogo from './CloudflareLogo';
import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

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

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" onClick={isFinished ? onClose : undefined} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden m-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#e8f0fe] to-[#d2e3fc] px-5 py-4 flex items-center gap-3">
          <div className="relative">
            <CloudDataIcon className="w-7 h-7" />
            {!isFinished && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-gray-500 rounded-full drive-modal-pulse" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
            <p className="text-[11px] text-gray-500">Cloudflare</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {!isFinished && (
            /* ローディングアニメーション — Driveアイコン中央 + C字型カラーアーク回転 */
            <div className="flex justify-center py-4">
              <div className="relative w-20 h-20">
                {/* C字型リング（SVG）— 形状の回転とカラーの回転を分離 */}
                <svg className="absolute inset-0 w-full h-full drive-ring-shape" viewBox="0 0 80 80">
                  <defs>
                    {/* カラーグラデーション（別速度で回転） */}
                    <linearGradient id="driveArcGrad" gradientTransform="rotate(0)" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="80" y2="80">
                      <stop offset="0%" stopColor="#4285F4" />
                      <stop offset="25%" stopColor="#34A853" />
                      <stop offset="50%" stopColor="#FBBC04" />
                      <stop offset="75%" stopColor="#EA4335" />
                      <stop offset="100%" stopColor="#4285F4" />
                    </linearGradient>
                  </defs>
                  {/* 背景用の薄いリング */}
                  <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" strokeWidth="6" opacity="0.3" />
                </svg>
                {/* カラーC字アーク — 別速度で回転 */}
                <svg className="absolute inset-0 w-full h-full drive-ring-colors" viewBox="0 0 80 80">
                  <circle
                    cx="40" cy="40" r="32"
                    fill="none"
                    stroke="url(#driveArcGrad)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray="150 51"
                  />
                </svg>
                {/* 中央のアイコン */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="drive-icon-pulse">
                    <CloudDataIcon className="w-8 h-8" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 進捗バー */}
          {typeof progress === 'number' && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500">進捗</span>
                <span className="text-sm font-bold text-[#1a73e8]">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, progress))}%`,
                    background: progress >= 100
                      ? 'linear-gradient(90deg, #34a853, #34a853)'
                      : 'linear-gradient(90deg, #1a73e8, #8e24aa)',
                  }}
                />
              </div>
            </div>
          )}

          {/* ステップ表示 */}
          <div className="space-y-2.5 mt-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {/* アイコン */}
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {step.status === 'waiting' && (
                    <span className="w-2 h-2 rounded-full bg-gray-200" />
                  )}
                  {step.status === 'loading' && (
                    <span className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-[#1a73e8] drive-modal-spin" />
                  )}
                  {step.status === 'done' && (
                    <CheckCircle2 className="w-4.5 h-4.5 text-primary-500" />
                  )}
                  {step.status === 'error' && (
                    <AlertCircle className="w-4.5 h-4.5 text-red-500" />
                  )}
                </div>
                {/* テキスト */}
                <div className="min-w-0 flex-1">
                  <span className={`text-sm ${
                    step.status === 'loading' ? 'text-gray-800 font-medium' :
                    step.status === 'done' ? 'text-gray-800' :
                    step.status === 'error' ? 'text-red-600' :
                    'text-gray-400'
                  }`}>
                    {step.label}
                  </span>
                  {step.detail && (
                    <span className="text-[11px] text-gray-400 ml-2">{step.detail}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 結果メッセージ */}
          {result && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              result.success
                ? 'bg-primary-50 text-gray-900 border border-primary-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <div className="flex items-start gap-2">
                {result.success
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                }
                <div>
                  <p className="font-medium">{result.message}</p>
                  {result.details && result.details.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs opacity-90">
                      {result.details.map((d, idx) => <li key={idx}>{d}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 閉じるボタン — 完了時のみ */}
        {isFinished && (
          <div className="px-5 pb-4">
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-bold text-white bg-[#1a73e8] rounded-lg hover:bg-[#1557b0] transition-colors"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
