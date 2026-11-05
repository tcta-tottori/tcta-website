// window.confirm / window.alert の代わり（協会サイトの決まりのポップアップ。SiteDialog.tsx）
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import SiteDialog from './SiteDialog';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

function mount<T>(render: (done: (v: T) => void) => ReactNode): Promise<T> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: T) => {
      resolve(v);
      // 閉じる動きを待ってから片付ける
      setTimeout(() => { root.unmount(); host.remove(); }, 0);
    };
    root.render(render(done));
  });
}

/** 確認のポップアップ。「はい」なら true */
export function siteConfirm(opts: ConfirmOptions | string): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
  const danger = o.danger ?? /削除|消し|消え|リセット|取り消|上書き|終了|クリア/.test(o.message + (o.title ?? ''));
  return mount<boolean>((done) => (
    <SiteDialog
      open
      eyebrow={danger ? 'CAUTION' : 'CONFIRM'}
      title={o.title ?? (danger ? '確認してください' : '確認')}
      danger={danger}
      onClose={() => done(false)}
      actions={<>
        <button className="btn btn--outline sdlg__btn" onClick={() => done(false)}>{o.cancelLabel ?? 'やめる'}</button>
        <button className="btn btn--primary sdlg__btn" onClick={() => done(true)}>{o.confirmLabel ?? (danger ? '実行する' : 'OK')}</button>
      </>}
    >
      <p className="sdlg__msg">{o.message}</p>
    </SiteDialog>
  ));
}

/** お知らせのポップアップ（OK で閉じる） */
export function siteAlert(message: string, title?: string): Promise<void> {
  const isError = /失敗|できません|見つかりません|ありません|エラー/.test(message);
  return mount<void>((done) => (
    <SiteDialog
      open
      eyebrow={isError ? 'NOTICE' : 'INFORMATION'}
      title={title ?? (isError ? 'うまくいきませんでした' : 'お知らせ')}
      danger={isError}
      onClose={() => done()}
      actions={<button className="btn btn--primary sdlg__btn" onClick={() => done()}>OK</button>}
    >
      <p className="sdlg__msg">{message}</p>
    </SiteDialog>
  ));
}

/** 画面の alert() をサイトのポップアップに置き換える（main.tsx で 1 回だけ呼ぶ）。alert の後ろの処理は止めずに進む */
export function installSiteAlert(): void {
  if (typeof window === 'undefined') return;
  window.alert = (message?: unknown) => { void siteAlert(String(message ?? '')); };
}
