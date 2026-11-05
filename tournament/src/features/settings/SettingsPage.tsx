// =============================================================================
// 設定ページ
//
// メニュー下部に散らばっていた「同期」「観戦用ページ」「音声」を1か所にまとめ、
// バックアップもこのページに集約する。メニューの下部は協会ロゴとバージョンだけにする。
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Wifi, WifiOff, Loader2, AlertTriangle, Eye, Volume2,
  ExternalLink, Copy, Check, Shield, ChevronRight, ChevronDown,
} from 'lucide-react';
import { useSyncStore, DEFAULT_SERVER_URL, PUBLIC_ROOM } from '../sync/syncStore';
import SyncPanel from '../sync/SyncPanel';
import VoiceSettingsDialog from '../../components/ui/VoiceSettingsDialog';
import BackupPage from '../backup/BackupPage';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { getVoiceSettings } from '../broadcast/voiceConfig';

/**
 * セクションの共通枠（サイトの区画：赤い四角＋英字＋見出し）。
 * 見出しをタップで開閉できる。既定はスマホ=閉じる／PC=開く。
 */
function SectionCard({
  icon, en, title, description, defaultOpen, children,
}: {
  icon: React.ReactNode;
  en: string;
  title: string;
  description: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // 画面幅が変わって既定が変わったら、それに合わせ直す
  useEffect(() => { setOpen(defaultOpen); }, [defaultOpen]);
  return (
    <section className="sk-sec ps-card">
      <button
        onClick={() => setOpen(v => !v)}
        className="sk-sec__head ps-card__head"
        aria-expanded={open}
      >
        <span className="sk-sec__mark" aria-hidden="true" />
        <span className="sk-sec__titles">
          <span className="sk-sec__en">{en}</span>
          <span className="sk-sec__title">{title}</span>
          <span className="sk-sec__lead">{description}</span>
        </span>
        <span className="ps-card__ico" aria-hidden="true">{icon}</span>
        <ChevronDown className={`ps-card__chev ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>
      <div className={`sk-collapse ${open ? 'is-open' : ''}`}>
        <div><div className="sk-sec__body ps-card__body">{children}</div></div>
      </div>
    </section>
  );
}

/** PC（lg以上）かどうか。設定セクションの初期表示を切り替える */
function useIsWide(): boolean {
  const [wide, setWide] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/** 設定を開くボタン（セクション内の主ボタン） */
function OpenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn btn--primary sk-btn sk-btn--lg ps-open">
      <span>{label}</span>
      <ChevronRight className="w-4 h-4 shrink-0 ln-arrow" />
    </button>
  );
}

export default function SettingsPage() {
  // スマホは畳んだ状態、PCは開いた状態を既定にする
  const sectionOpen = useIsWide();
  const [syncOpen, setSyncOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { syncEnabled, connectionState, roomCode, serverUrl, peers, pendingChanges } = useSyncStore();
  const isMixedImported = useMixedStore((s) => s.isImported);
  const isTeamImported = useTeamStore((s) => s.isImported);

  const isConnected = syncEnabled && connectionState === 'connected';
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';
  const isDisconnectedWarn = syncEnabled && connectionState === 'disconnected';

  const syncText = isDisconnectedWarn
    ? `同期が切断されています${pendingChanges > 0 ? `（未送信 ${pendingChanges}件）` : ''}`
    : isConnecting
      ? '接続中…'
      : isConnected
        ? `同期中（この端末を含め ${peers.length + 1}台）${pendingChanges > 0 ? ` / 未送信 ${pendingChanges}件` : ''}`
        : '同期していません（この端末だけで動いています）';

  // 観戦用ページのURL。同期ルームに入っていれば、その部屋を見られるURLにする。
  const publicUrl = useMemo(() => {
    const viewPath = isMixedImported || isTeamImported ? '/view/league' : '/view/draw';
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const qs = new URLSearchParams();
    if (syncEnabled && roomCode) {
      if (roomCode !== PUBLIC_ROOM) qs.set('room', roomCode);
      if (serverUrl && serverUrl !== DEFAULT_SERVER_URL) qs.set('server', serverUrl);
    }
    const q = qs.toString();
    return `${window.location.origin}${base}${viewPath}${q ? `?${q}` : ''}`;
  }, [isMixedImported, isTeamImported, syncEnabled, roomCode, serverUrl]);

  const copyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch {
      // クリップボードが使えない端末向け
      const el = document.createElement('textarea');
      el.value = publicUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const voice = getVoiceSettings();
  const voiceText = voice.engine === 'browser'
    ? '端末内蔵の音声で読み上げます'
    : `Gemini 音声で読み上げます（${voice.voiceName || '既定の声'}）`;

  return (
    <div className="ps-settings">
      <div className="container sk-page ps-settings__page">
        {/* 同期 */}
        <SectionCard
          icon={
            isDisconnectedWarn ? <AlertTriangle className="w-5 h-5 text-primary-500" />
              : isConnecting ? <Loader2 className="w-5 h-5 animate-spin" />
                : isConnected ? <Wifi className="w-5 h-5 text-primary-500" />
                  : <WifiOff className="w-5 h-5" />
          }
          en="SYNC"
          title="同期"
          description="複数の端末で同じ大会データを共有する"
          defaultOpen={sectionOpen}
        >
          <div className={`ps-status ${isDisconnectedWarn ? 'is-warn' : isConnected ? 'is-on' : ''}`}>
            <span className="ps-status__text">{syncText}</span>
            {syncEnabled && roomCode && (
              <span className="ps-status__code">{roomCode}</span>
            )}
          </div>
          <OpenButton label="同期設定を開く" onClick={() => setSyncOpen(true)} />
        </SectionCard>

        {/* 観戦用ページ */}
        <SectionCard
          icon={<Eye className="w-5 h-5" />}
          en="PUBLIC VIEW"
          title="観戦用ページ"
          description="参加者・協会HP向けの読み取り専用ページ"
          defaultOpen={sectionOpen}
        >
          <div className="ps-status ps-status--url">
            <span className="ps-status__label">URL</span>
            <span className="ps-status__url">{publicUrl}</span>
          </div>
          <div className="ps-btn2">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary sk-btn sk-btn--lg"
            >
              <ExternalLink className="w-4 h-4" />
              <span>観戦用ページを開く</span>
            </a>
            <button
              onClick={copyPublicUrl}
              className="btn btn--outline sk-btn sk-btn--lg"
            >
              {copied ? <Check className="w-4 h-4 text-primary-500" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'コピーしました' : 'URLをコピー'}</span>
            </button>
          </div>
          {!syncEnabled && (
            <p className="ps-hint">
              ほかの端末から見てもらうには、上の「同期」を開始してください。
            </p>
          )}
        </SectionCard>

        {/* 音声 */}
        <SectionCard
          icon={<Volume2 className="w-5 h-5" />}
          en="VOICE"
          title="音声（コール読み上げ）"
          description="呼び出しの声・読み上げ方法を選ぶ"
          defaultOpen={sectionOpen}
        >
          <div className="ps-status">
            <span className="ps-status__text">{voiceText}</span>
          </div>
          <OpenButton label="音声設定を開く" onClick={() => setVoiceOpen(true)} />
        </SectionCard>

        {/* バックアップ（バックアップ画面をそのまま取り込む） */}
        <SectionCard
          icon={<Shield className="w-5 h-5" />}
          en="BACKUP"
          title="バックアップ"
          description="大会データをまとめて安全に保存・復元"
          defaultOpen={sectionOpen}
        >
          <BackupPage embedded />
        </SectionCard>
      </div>

      <SyncPanel open={syncOpen} onClose={() => setSyncOpen(false)} />
      <VoiceSettingsDialog open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </div>
  );
}
