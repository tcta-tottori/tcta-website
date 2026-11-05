// =============================================
// 観戦用URL発行ダイアログ
// 現在のルーム/サーバー情報を埋め込んだ URL を生成し、
// クリップボードコピー用に表示する
// =============================================

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Share2, Info, ExternalLink } from 'lucide-react';
import { DEFAULT_SERVER_URL, PUBLIC_ROOM } from './syncStore';

interface Props {
  open: boolean;
  onClose: () => void;
  roomCode: string;
  serverUrl: string;
}

/**
 * 現在のオリジン + アプリのベースパス + /view/league を組み立てる。
 * ルーム/サーバーがビルド埋め込みの既定値と同じ場合はクエリを省略し、
 * HP に貼りっぱなしにできる短い固定URLを返す。
 */
function buildPublicUrl(roomCode: string, serverUrl: string): string {
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (roomCode && roomCode !== PUBLIC_ROOM) qs.set('room', roomCode);
  if (serverUrl && serverUrl !== DEFAULT_SERVER_URL) qs.set('server', serverUrl);
  const q = qs.toString();
  return `${origin}${base}/view/league${q ? `?${q}` : ''}`;
}

export default function PublicShareDialog({ open, onClose, roomCode, serverUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => buildPublicUrl(roomCode, serverUrl), [roomCode, serverUrl]);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 古いブラウザ対応
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const share = async () => {
    if (!canShare) return;
    try {
      await navigator.share({
        title: '大会観戦用URL',
        text: '予選リーグ・決勝トーナメント・LIVE を観戦できます',
        url,
      });
    } catch {
      // ユーザーがキャンセルした場合は無視
    }
  };

  const effectiveServer = serverUrl || DEFAULT_SERVER_URL;
  const noServerWarning = !effectiveServer;
  // 既定サーバー & 固定公開ルームでの配信なら、URL は貼りっぱなしにできる固定URL
  const isFixedUrl = !!effectiveServer && (!PUBLIC_ROOM || roomCode === PUBLIC_ROOM);

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center psd-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="psd-panel psd-panel--sm psd-panel--flex">
        <div className="sdlg__head psd-head">
          <span className="sec-head__mark sdlg__mark" aria-hidden="true" />
          <div className="sdlg__heading">
            <p className="sdlg__eyebrow">SHARE</p>
            <h2 className="sdlg__title"><Share2 className="w-5 h-5 text-primary-600" />観戦用URLを発行</h2>
            <p className="psd-lead">参加者・HP掲載向けのURLを共有します</p>
          </div>
          <button onClick={onClose} className="sdlg__close" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto psd-body space-y-4">
          {noServerWarning && (
            <div className="flex items-start gap-2 sk-note sk-note--red">
              <Info className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
              <div className="text-[11px] text-gray-800 leading-relaxed">
                <p className="font-bold mb-0.5">中継サーバー未設定</p>
                <p>
                  別端末からの観戦にはWebSocket中継サーバーが必要です。
                  同期設定の「詳細設定」からサーバーURLを入力してください。
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="psd-label mb-2">
              ルームコード
            </p>
            <div className="flex items-center gap-2 psd-box">
              <span className="flex-1 text-xl font-mono font-bold text-gray-800 tracking-[0.3em]">
                {roomCode || '未接続'}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="psd-label">
                観戦用URL
              </p>
              {isFixedUrl && (
                <span className="sk-chip sk-chip--red">
                  固定URL・HP貼りっぱなしOK
                </span>
              )}
            </div>
            <div className="psd-box">
              <p className="text-xs font-mono text-gray-800 break-all leading-relaxed">
                {url}
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={copy}
                disabled={!roomCode}
                className="btn btn--primary psd-btn psd-btn--sm psd-btn--grow"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>コピー済</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>URLをコピー</span>
                  </>
                )}
              </button>
              {canShare && (
                <button
                  onClick={share}
                  disabled={!roomCode}
                  className="btn btn--outline psd-btn psd-btn--sm"
                >
                  <Share2 className="w-4 h-4" />
                  <span>共有</span>
                </button>
              )}
              <a
                href={roomCode ? url : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={`btn btn--outline psd-btn psd-btn--sm ${
                  !roomCode ? 'pointer-events-none opacity-40' : ''
                }`}
              >
                <ExternalLink className="w-4 h-4" />
                <span>開く</span>
              </a>
            </div>
          </div>

          <div className="flex items-start gap-2 sk-note">
            <Info className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />
            <div className="text-[11px] text-gray-800 leading-relaxed">
              <p className="font-bold mb-0.5">使い方</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>このURLをHPやSNSに掲載、もしくはQRコードに変換して案内できます</li>
                <li>アクセスした端末は読み取り専用で、予選リーグ・決勝トーナメント・LIVEを閲覧できます</li>
                <li>運営端末でスコア等を更新すると、観戦側にもリアルタイム反映されます</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
