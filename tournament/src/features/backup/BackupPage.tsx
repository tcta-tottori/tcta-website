import CloudflareLogo from '../../components/ui/CloudflareLogo';
import { useState, useCallback, useRef, useEffect } from 'react';
import { buildUnifiedBackup, restoreUnifiedBackup, isValidBackup } from './unifiedBackup';
import { useMixedStore } from '../mixed/mixedStore';
import {
  getSavedClientId,
  isTokenValid as gdriveIsTokenValid,
  getSavedToken,
  uploadBackupJson,
  listBackupFiles,
  downloadBackupFile,
  type CloudDataFile,
} from './cloudDataApi';
import {
  HardDrive,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileJson,
  Shield,
  Trophy,
  Calendar,
} from 'lucide-react';
import { siteConfirm } from '../../components/site/siteConfirm';
import { getAutoSaveState, saveAutoNow, subscribeAutoSave, type AutoSaveState } from './autoSave';

/** 大会データの置き場（Cloudflare）のアイコン */
const CloudLogo = ({ size = 20 }: { size?: number }) => <CloudflareLogo className="shrink-0" style={{ width: size, height: size }} />;

/** 自動保存の様子（最後に保存した時刻・今すぐ保存） */
function AutoSaveStatus() {
  const [st, setSt] = useState<AutoSaveState>(getAutoSaveState);
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeAutoSave(setSt), []);
  const time = (t: number) => new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const text = st.kind === 'saved' ? `${time(st.at)} に保存しました（${st.fileName}）`
    : st.kind === 'saving' ? '保存しています…'
    : st.kind === 'pending' ? '変更を保存する準備をしています…'
    : st.kind === 'test' ? 'テストモードの大会なので、自動保存はしていません'
    : st.kind === 'error' ? `${time(st.at)} に保存できませんでした（${st.message}）。少しあとにもう一度試します`
    : '運営中の大会があると、変わるたびに自動で保存します';
  return (
    <section className={`ps-auto ${st.kind === 'error' ? 'is-error' : ''}`} aria-live="polite">
      <div className="ps-auto__main">
        <p className="ps-auto__title"><span className={`ps-auto__dot ps-auto__dot--${st.kind}`} />自動保存（Cloudflare）</p>
        <p className="ps-auto__text">{text}</p>
        <p className="ps-auto__note">運営中のデータは、変わるたびに Cloudflare に自動で保存されます。下の一覧の「自動保存_…」から、別の端末でも復元できます。</p>
      </div>
      <button type="button" className="btn btn--outline sk-btn sk-btn--sm" disabled={busy || st.kind === 'saving'}
        onClick={async () => { setBusy(true); try { await saveAutoNow(); } finally { setBusy(false); } }}>
        {busy || st.kind === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}今すぐ保存
      </button>
    </section>
  );
}

interface BackupPageProps {
  /** 設定ページの1セクションとして埋め込むとき（見出し・背景を出さない） */
  embedded?: boolean;
}

export default function BackupPage({ embedded = false }: BackupPageProps = {}) {
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cloudflare（大会データの置き場）
  const [driveStatus, setDriveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [driveFiles, setDriveFiles] = useState<CloudDataFile[]>([]);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const isGdriveConnected = !!getSavedClientId() && gdriveIsTokenValid();
  const mixedStore = useMixedStore();
  const tournamentName = mixedStore.tournamentInfo?.name || '';

  // ================================================================
  // エクスポート
  // ================================================================
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const data = await buildUnifiedBackup();
      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: 'application/json' });

      const name = data.tournamentName || '大会バックアップ';
      const date = data.tournamentDate || new Date().toISOString().slice(0, 10);
      const filename = `${name}_${date}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const sizeKB = (json.length / 1024).toFixed(1);
      setStatus({ type: 'success', message: `バックアップを保存しました（${sizeKB} KB / ${filename}）` });
    } catch (err) {
      setStatus({ type: 'error', message: `エクスポートに失敗しました: ${(err as Error).message}` });
    } finally {
      setIsExporting(false);
    }
  }, []);

  // ================================================================
  // インポート
  // ================================================================
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsImporting(true);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!isValidBackup(parsed)) {
        setStatus({ type: 'error', message: 'バックアップファイルの形式が正しくありません。' });
        setIsImporting(false);
        return;
      }

      const confirmed = await siteConfirm(
        `このバックアップを復元しますか？\n\n` +
        `ファイル: ${file.name}\n` +
        (parsed.tournamentName ? `大会名: ${parsed.tournamentName}\n` : '') +
        (parsed.createdAt ? `作成日時: ${new Date(parsed.createdAt).toLocaleString('ja-JP')}\n` : '') +
        `\n※ 既存データはすべて上書きされます。復元後ページがリロードされます。`
      );
      if (!confirmed) {
        setIsImporting(false);
        return;
      }

      const result = await restoreUnifiedBackup(parsed);
      if (result.errors.length > 0) {
        setStatus({ type: 'error', message: `復元完了（${result.imported}件）。エラー: ${result.errors.join(', ')}` });
        setIsImporting(false);
      } else {
        // 復元成功 → リロードしてストアを再hydrate
        window.location.reload();
      }
    } catch (err) {
      setStatus({ type: 'error', message: `インポートに失敗しました: ${(err as Error).message}` });
      setIsImporting(false);
    }
  }, []);

  // ================================================================
  // Cloudflare（大会データの置き場）
  // ================================================================
  const handleDriveUpload = useCallback(async () => {
    setIsUploading(true);
    setDriveStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('役員ログインが切れています。ログインし直してください。');

      const data = await buildUnifiedBackup();
      const json = JSON.stringify(data);
      const name = data.tournamentName || '大会バックアップ';
      const date = data.tournamentDate || new Date().toISOString().slice(0, 10);
      const filename = `${name}_${date}.json`;

      await uploadBackupJson(token, filename, json);
      setDriveStatus({ type: 'success', message: `アップロードしました（${filename}）` });
      handleDriveListFiles();
    } catch (err) {
      setDriveStatus({ type: 'error', message: `アップロードに失敗しました: ${(err as Error).message}` });
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDriveListFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    setDriveStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('役員ログインが切れています。ログインし直してください。');
      const files = await listBackupFiles(token);
      setDriveFiles(files);
      if (files.length === 0) {
        setDriveStatus({ type: 'success', message: 'バックアップファイルはありません。' });
      }
    } catch (err) {
      setDriveStatus({ type: 'error', message: `ファイル一覧の取得に失敗しました: ${(err as Error).message}` });
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  const handleDriveRestore = useCallback(async (file: CloudDataFile) => {
    const confirmed = await siteConfirm(
      `このバックアップを復元しますか？\n\nファイル名: ${file.name}\n更新日時: ${new Date(file.modifiedTime).toLocaleString('ja-JP')}\n\n※ 既存データはすべて上書きされます。復元後ページがリロードされます。`
    );
    if (!confirmed) return;

    setIsDownloading(file.id);
    setDriveStatus(null);
    try {
      const token = getSavedToken();
      if (!token) throw new Error('役員ログインが切れています。ログインし直してください。');
      const json = await downloadBackupFile(token, file.id);
      const parsed = JSON.parse(json);

      if (!isValidBackup(parsed)) {
        setDriveStatus({ type: 'error', message: 'バックアップファイルの形式が正しくありません。' });
        return;
      }

      const result = await restoreUnifiedBackup(parsed);
      if (result.errors.length > 0) {
        setDriveStatus({ type: 'error', message: `復元完了（${result.imported}件）。エラー: ${result.errors.join(', ')}` });
        setIsDownloading(null);
      } else {
        window.location.reload();
      }
    } catch (err) {
      setDriveStatus({ type: 'error', message: `復元に失敗しました: ${(err as Error).message}` });
      setIsDownloading(null);
    }
  }, []);

  // ================================================================
  // レンダリング
  // ================================================================
  return (
    <div className={embedded ? 'ps-backup ps-backup--embedded' : 'ps-backup'}>
      <div className={embedded ? 'ps-backup__stack' : 'container sk-page ps-backup__stack'}>
        {/* ヘッダー（設定ページに埋め込むときは設定側の見出しを使う。単独のときも見出しは AppLayout が出す） */}

        {/* 現在の大会情報カード */}
        {tournamentName && (
          <div className="ps-current">
            <Trophy className="ps-current__ico" />
            <div className="ps-current__body">
              <p className="ps-current__label">現在の大会</p>
              <p className="ps-current__name">{tournamentName}</p>
              {mixedStore.tournamentInfo?.date && (
                <p className="ps-current__date">
                  <Calendar className="w-3 h-3" />
                  {mixedStore.tournamentInfo.date}
                </p>
              )}
            </div>
          </div>
        )}

        {/* データ内容 説明 */}
        <div className="ps-includes">
          <p className="ps-includes__label">バックアップに含まれるデータ</p>
          <div className="ps-includes__chips">
            {['エントリー', '予選リーグ', '決勝トーナメント', '選手情報', 'ふりがな', '試合結果'].map(item => (
              <span key={item} className="sk-chip">{item}</span>
            ))}
          </div>
        </div>

        {/* ローカル保存 */}
        <section className="ps-sub">
          <div className="ps-sub__head">
            <HardDrive className="ps-sub__ico" />
            <div className="ps-sub__titles">
              <h3 className="ps-sub__title">ローカル保存</h3>
              <p className="ps-sub__lead">お使いの端末にJSONファイルとして保存</p>
            </div>
          </div>
          <div className="ps-sub__body">
            <div className="ps-btn2">
              <button
                onClick={handleExport}
                disabled={isExporting || isImporting}
                className="btn btn--primary sk-btn sk-btn--lg"
              >
                {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                <span>バックアップ保存</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isExporting || isImporting}
                className="btn btn--outline sk-btn sk-btn--lg"
              >
                {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                <span>バックアップ復元</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
            </div>

            {status && (
              <div className={`ps-msg ${status.type === 'success' ? '' : 'is-error'}`}>
                {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span className="flex-1">{status.message}</span>
              </div>
            )}
          </div>
        </section>

        {/* 運営中のデータの自動保存（autoSave.ts） */}
        <AutoSaveStatus />

        {/* Cloudflare（大会データの置き場） */}
        <section className="ps-sub">
          <div className="ps-sub__head">
            <CloudLogo size={22} />
            <div className="ps-sub__titles">
              <h3 className="ps-sub__title">Cloudflare</h3>
              <p className="ps-sub__lead">協会の Cloudflare に保管。役員ならどの端末からでも復元できます</p>
            </div>
            {isGdriveConnected && (
              <span className="sk-chip sk-chip--red ps-live">
                <span className="ps-live__dot" />
                接続中
              </span>
            )}
          </div>
          <div className="ps-sub__body">
            {!isGdriveConnected ? (
              <div className="sk-note sk-note--red ps-msg-row">
                <AlertCircle className="w-5 h-5 shrink-0 text-primary-600" />
                <div>
                  <div className="font-bold">役員ログインが必要です</div>
                  <div className="text-xs text-gray-700 mt-0.5">画面上部の「ログインし直す」からログインしてください</div>
                </div>
              </div>
            ) : (
              <>
                <div className="ps-btn2">
                  <button
                    onClick={handleDriveUpload}
                    disabled={isUploading || isDownloading !== null}
                    className="btn sk-btn sk-btn--gray sk-btn--lg"
                  >
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span>Cloudflare に保存</span>
                  </button>

                  <button
                    onClick={handleDriveListFiles}
                    disabled={isLoadingFiles || isUploading || isDownloading !== null}
                    className="btn btn--outline sk-btn sk-btn--lg"
                  >
                    {isLoadingFiles ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    <span>ファイル一覧を更新</span>
                  </button>
                </div>

                {driveFiles.length > 0 && (
                  <div className="ps-files">
                    <div className="ps-files__head">
                      <CloudLogo size={14} />
                      <span>保存済みバックアップ ({driveFiles.length}件)</span>
                    </div>
                    <div className="ps-files__list">
                      {driveFiles.map(file => (
                        <div key={file.id} className="ps-files__row">
                          <FileJson className="w-4 h-4 text-gray-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{file.name}</div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                              <span>{new Date(file.modifiedTime).toLocaleString('ja-JP')}</span>
                              {file.size && <><span>•</span><span>{(Number(file.size) / 1024).toFixed(1)} KB</span></>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDriveRestore(file)}
                            disabled={isDownloading !== null || isUploading}
                            className="btn btn--outline sk-btn sk-btn--sm shrink-0"
                          >
                            {isDownloading === file.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            復元
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {driveStatus && (
                  <div className={`ps-msg ${driveStatus.type === 'success' ? '' : 'is-error'}`}>
                    {driveStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="flex-1">{driveStatus.message}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* フッター注意書き */}
        <div className="ps-foot">
          <Shield className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
          <p>バックアップには大会の全データが含まれます。復元すると現在のデータは上書きされるのでご注意ください。</p>
        </div>
      </div>
    </div>
  );
}
