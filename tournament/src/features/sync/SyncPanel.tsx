// =============================================
// 同期設定パネル
// ルームの作成・参加、接続設定、接続端末一覧
// =============================================

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Wifi, WifiOff, Monitor, Smartphone,
  Copy, Check, Play, Square, Settings2,
  Users, RefreshCw, AlertCircle, Info, Share2, Globe,
  AlertTriangle, UploadCloud, DownloadCloud,
} from 'lucide-react';
import {
  useSyncStore, generateRoomCode,
  DEFAULT_SERVER_URL, PUBLIC_ROOM, PUBLIC_PUBLISH_ENABLED,
} from './syncStore';
import { syncEngine } from './syncEngine';
import PublicShareDialog from './PublicShareDialog';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SyncPanel({ open, onClose }: Props) {
  const {
    deviceName, serverUrl, connectionState, roomCode,
    peers, syncEnabled, lastSyncAt, error, lastRoomCode,
    deviceId, pendingChanges,
    setDeviceName, setServerUrl,
  } = useSyncStore();

  const [editingServerUrl, setEditingServerUrl] = useState(serverUrl);
  const [editingDeviceName, setEditingDeviceName] = useState(deviceName);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 手動再同期の確認ダイアログ（'push' = この端末を反映 / 'pull' = 他端末を取込）
  const [resyncConfirm, setResyncConfirm] = useState<null | 'push' | 'pull'>(null);

  // インターネット公開を開始（固定の公開ルーム＋既定サーバーでワンタップ配信）
  const handlePublish = useCallback(() => {
    setDeviceName(editingDeviceName);
    setServerUrl(DEFAULT_SERVER_URL);
    const code = PUBLIC_ROOM || generateRoomCode();
    syncEngine.start(code, DEFAULT_SERVER_URL, false);
  }, [editingDeviceName, setDeviceName, setServerUrl]);

  // ルーム作成
  const handleCreateRoom = useCallback(() => {
    const code = generateRoomCode();
    setDeviceName(editingDeviceName);
    setServerUrl(editingServerUrl);
    syncEngine.start(code, editingServerUrl || undefined);
  }, [editingDeviceName, editingServerUrl, setDeviceName, setServerUrl]);

  // ルーム参加
  const handleJoinRoom = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    setDeviceName(editingDeviceName);
    setServerUrl(editingServerUrl);
    syncEngine.start(code, editingServerUrl || undefined);
  }, [joinCode, editingDeviceName, editingServerUrl, setDeviceName, setServerUrl]);

  // 前回のルームに再接続
  const handleRejoin = useCallback(() => {
    if (!lastRoomCode) return;
    setDeviceName(editingDeviceName);
    setServerUrl(editingServerUrl);
    syncEngine.start(lastRoomCode, editingServerUrl || undefined);
  }, [lastRoomCode, editingDeviceName, editingServerUrl, setDeviceName, setServerUrl]);

  // 切断
  const handleDisconnect = useCallback(() => {
    syncEngine.stop();
  }, []);

  // 手動再同期の実行
  const runResync = useCallback(() => {
    if (resyncConfirm === 'push') {
      void syncEngine.forcePushToPeers();
    } else if (resyncConfirm === 'pull') {
      syncEngine.requestLatestFromPeers();
    }
    setResyncConfirm(null);
  }, [resyncConfirm]);

  // ルームコードをコピー
  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomCode]);

  if (!open) return null;

  const isConnected = syncEnabled && connectionState === 'connected';
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';
  // 同期が有効なのに未接続 = 編集が他端末へ届いていない可能性
  const isUnsynced = syncEnabled && connectionState !== 'connected';
  const hasPending = pendingChanges > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center psd-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="psd-panel psd-panel--sm psd-panel--flex">

        {/* ヘッダー */}
        <div className="sdlg__head psd-head">
          <span className="sec-head__mark sdlg__mark" aria-hidden="true" />
          <div className="sdlg__heading">
            <p className="sdlg__eyebrow">SYNC</p>
            <h2 className="sdlg__title">
              {isConnected ? <Wifi className="w-5 h-5 text-primary-600" /> : <WifiOff className="w-5 h-5 text-gray-400" />}
              マルチデバイス同期
            </h2>
            <p className="psd-lead">複数端末でリアルタイム編集</p>
          </div>
          <button
            onClick={onClose}
            className="sdlg__close"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* スクロール可能なコンテンツ */}
        <div className="flex-1 overflow-y-auto psd-body space-y-4">

          {/* 接続中の場合 */}
          {syncEnabled ? (
            <>
              {/* 接続ステータス */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded border ${
                isConnected
                  ? 'bg-gray-50 border-gray-300'
                  : isConnecting
                  ? 'bg-gray-50 border-gray-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full ${
                  isConnected ? 'bg-gray-700 animate-pulse' : isConnecting ? 'bg-gray-400 animate-pulse' : 'bg-red-500'
                }`} />
                <div className="flex-1">
                  <p className={`text-sm font-bold ${
                    isConnected ? 'text-gray-800' : isConnecting ? 'text-gray-500' : 'text-red-700'
                  }`}>
                    {isConnected ? '接続中' : isConnecting ? '接続中...' : '切断'}
                  </p>
                  {lastSyncAt && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      最終同期: {new Date(lastSyncAt).toLocaleTimeString('ja-JP')}
                    </p>
                  )}
                </div>
              </div>

              {/* 切断/未送信の警告バナー */}
              {(isUnsynced || hasPending) && (
                <div className={`flex items-start gap-2 px-4 py-3 rounded border ${
                  isUnsynced ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isUnsynced ? 'text-red-500' : 'text-gray-500'}`} />
                  <div className={`text-[11px] leading-relaxed ${isUnsynced ? 'text-red-700' : 'text-gray-700'}`}>
                    {isUnsynced ? (
                      <>
                        <p className="font-bold mb-0.5">同期が切断されています</p>
                        <p>この端末の編集は、まだ他の端末に反映されていません。電波が戻ると自動で再接続し、未送信の変更を送信します。</p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold mb-0.5">未送信の変更があります</p>
                        <p>接続の回復を待って自動送信します。</p>
                      </>
                    )}
                    {hasPending && (
                      <p className="mt-1 font-bold">未送信の変更: {pendingChanges} 件</p>
                    )}
                  </div>
                </div>
              )}

              {/* ルームコード */}
              <div className="psd-box">
                <p className="psd-label mb-2">ルームコード</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-2xl font-mono font-bold text-gray-800 tracking-[0.3em]">
                    {roomCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="btn btn--outline psd-btn psd-btn--sm"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-primary-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'コピー済' : 'コピー'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  他の端末でこのコードを入力して同じルームに参加できます
                </p>
              </div>

              {/* 観戦用URL発行 */}
              <button
                onClick={() => setShareOpen(true)}
                className="btn btn--primary psd-btn psd-btn--block"
              >
                <Share2 className="w-4 h-4" />
                <span>観戦用URLを発行</span>
              </button>

              {/* 接続中の端末一覧 */}
              <div className="border border-gray-200 rounded overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-bold text-gray-600">
                    接続端末 ({peers.length + 1})
                  </span>
                </div>
                <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {/* 自分自身 */}
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <Monitor className="w-4 h-4 text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">
                        {deviceName} <span className="text-gray-500">(この端末)</span>
                      </p>
                      <p className="text-[10px] text-gray-400">{deviceId.slice(0, 12)}...</p>
                    </div>
                  </div>
                  {/* ピア */}
                  {peers.map((peer) => (
                    <div key={peer.deviceId} className="flex items-center gap-3 px-4 py-2.5">
                      <Smartphone className="w-4 h-4 text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{peer.deviceName}</p>
                        <p className="text-[10px] text-gray-400">
                          最終通信: {new Date(peer.lastSeen).toLocaleTimeString('ja-JP')}
                        </p>
                      </div>
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                    </div>
                  ))}
                  {peers.length === 0 && (
                    <div className="px-4 py-3 text-xs text-gray-400 text-center">
                      他の端末が参加するのを待っています...
                    </div>
                  )}
                </div>
              </div>

              {/* 手動再同期（切断復帰後などの整合用） */}
              <div className="border border-gray-200 rounded p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-[11px] font-bold text-gray-600">手動で同期をそろえる</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  切断から復帰した後などにデータがズレている場合、どちらを正とするか選んで同期できます。
                </p>
                <button
                  onClick={() => setResyncConfirm('push')}
                  className="btn btn--outline psd-btn psd-btn--sm psd-btn--block"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>この端末を最新として全員に反映</span>
                </button>
                <button
                  onClick={() => setResyncConfirm('pull')}
                  className="btn btn--outline psd-btn psd-btn--sm psd-btn--block"
                >
                  <DownloadCloud className="w-3.5 h-3.5" />
                  <span>他端末の最新を取り込む</span>
                </button>
              </div>

              {/* エラー表示 */}
              {error && (
                <div className="flex items-start gap-2 px-4 py-3 rounded text-sm border bg-red-50 text-red-700 border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="flex-1 text-xs">{error}</span>
                </div>
              )}

              {/* 切断ボタン */}
              <button
                onClick={handleDisconnect}
                className="btn btn--outline psd-btn psd-btn--block psd-btn--danger"
              >
                <Square className="w-4 h-4" />
                <span>同期を停止</span>
              </button>
            </>
          ) : (
            <>
              {/* 未接続の場合 */}

              {/* インターネット公開（HP掲載向け・ワンタップ） */}
              {PUBLIC_PUBLISH_ENABLED && (
                <div className="psd-box psd-box--red">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Globe className="w-4 h-4 text-primary-600" />
                    <h3 className="text-xs font-bold text-gray-900">インターネット公開</h3>
                  </div>
                  <p className="text-[10px] text-gray-800 mb-3 leading-relaxed">
                    ボタンひとつで、現在の大会データをインターネットに公開します。
                    観戦者は{PUBLIC_ROOM ? '固定の観戦用URL' : '発行された観戦用URL'}を開くだけで、
                    どこからでもリアルタイムに閲覧できます。
                  </p>
                  <button
                    onClick={handlePublish}
                    className="btn btn--primary psd-btn psd-btn--block"
                  >
                    <Globe className="w-4 h-4" />
                    <span>インターネット公開を開始</span>
                  </button>
                </div>
              )}

              {/* 端末名 */}
              <div>
                <label className="block psd-label mb-1.5">
                  この端末の名前
                </label>
                <input
                  type="text"
                  value={editingDeviceName}
                  onChange={(e) => setEditingDeviceName(e.target.value)}
                  className="w-full px-3 py-2 text-sm psd-input"
                  placeholder="例: 受付iPad"
                />
              </div>

              {/* ルーム作成 */}
              <div className="psd-box">
                <h3 className="text-xs font-bold text-gray-800 mb-2">新しいルームを作成</h3>
                <p className="text-[10px] text-gray-600 mb-3">
                  最初の端末でルームを作成し、他の端末にルームコードを共有します
                </p>
                <button
                  onClick={handleCreateRoom}
                  className="btn btn--primary psd-btn psd-btn--block"
                >
                  <Play className="w-4 h-4" />
                  <span>ルームを作成</span>
                </button>
              </div>

              {/* ルーム参加 */}
              <div className="psd-box">
                <h3 className="text-xs font-bold text-gray-700 mb-2">既存のルームに参加</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 text-sm font-mono tracking-wider psd-input uppercase"
                    placeholder="コードを入力"
                    maxLength={8}
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={joinCode.trim().length < 4}
                    className="btn psd-btn psd-btn--sm psd-btn--ink"
                  >
                    参加
                  </button>
                </div>
              </div>

              {/* 前回のルームに再接続 */}
              {lastRoomCode && (
                <button
                  onClick={handleRejoin}
                  className="btn btn--outline psd-btn psd-btn--sm psd-btn--block"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>前回のルーム ({lastRoomCode}) に再接続</span>
                </button>
              )}

              {/* 詳細設定 */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Settings2 className="w-3 h-3" />
                <span>詳細設定 {showAdvanced ? '▲' : '▼'}</span>
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block psd-label mb-1.5">
                      中継サーバーURL (別端末同期用)
                    </label>
                    <input
                      type="text"
                      value={editingServerUrl}
                      onChange={(e) => setEditingServerUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono psd-input"
                      placeholder="ws://192.168.1.100:8787"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      未設定の場合、同一端末の複数タブ間のみ同期されます
                    </p>
                  </div>
                </div>
              )}

              {/* 説明 */}
              <div className="flex items-start gap-2 sk-note">
                <Info className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />
                <div className="text-[10px] text-gray-800 leading-relaxed">
                  <p className="font-bold mb-0.5">マルチデバイス同期について</p>
                  <p>同じルームに接続した端末間で、エントリー・スコア等のデータがリアルタイムに同期されます。</p>
                  <p className="mt-1">別端末間の同期には中継サーバーが必要です。同一端末の別タブ間はサーバー不要で同期できます。</p>
                </div>
              </div>
            </>
          )}
        </div>

        <PublicShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          roomCode={roomCode}
          serverUrl={serverUrl}
        />

        <ConfirmDialog
          open={resyncConfirm !== null}
          danger
          title={resyncConfirm === 'push' ? 'この端末を全員に反映' : '他端末の最新を取り込む'}
          message={
            resyncConfirm === 'push'
              ? 'この端末のデータを、接続中の全端末へ反映します。\n他端末のデータは、この端末の内容で上書きされます。よろしいですか？'
              : '接続中の他端末から最新データを取り込みます。\nこの端末のデータは、取り込んだ内容で上書きされます。よろしいですか？'
          }
          confirmLabel={resyncConfirm === 'push' ? '全員に反映' : '取り込む'}
          onConfirm={runResync}
          onCancel={() => setResyncConfirm(null)}
        />
      </div>
    </div>,
    document.body
  );
}
