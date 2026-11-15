// ログインした運営端末どうしの自動の共有。
//   ・役員としてログインし、大会を選んでいる運営端末は、何もしなくても同じ部屋（HP 掲載用の固定の部屋 PUBLIC_ROOM）に入る。
//     ほかの端末で入れた受付・試合結果・コートは数秒でこの端末にも入る（syncEngine の変更の配信）
//   ・はじめて入る端末（大会が入っていないスマホなど）は、運営中の端末から大会ごと受け取る
//   ・すでに大会が入っている端末どうしは、同じ大会で新しい方のデータだけを受け取る（古い端末で上書きしない。syncEngine.applyFullSnapshot）
//   ・テストモードの大会は共有しない（観戦ページにも出ないように）。手で別の部屋に入っているときは触らない
// 同じ部屋の中身は観戦ページ（HP の「速報」）にもそのまま出る。
import { useEffect } from 'react';
import { syncEngine } from './syncEngine';
import { DEFAULT_SERVER_URL, PUBLIC_ROOM } from './syncStore';

let autoStarted = false;

export function useAutoSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      // 自動で入った部屋だけ出る（手で入った部屋は、その端末の設定のまま）
      if (autoStarted && syncEngine.isActive() && syncEngine.currentRoom() === PUBLIC_ROOM && !syncEngine.isViewerMode()) syncEngine.stop();
      autoStarted = false;
      return;
    }
    if (syncEngine.isActive()) return; // すでにどこかの部屋に入っている
    syncEngine.start(PUBLIC_ROOM, DEFAULT_SERVER_URL || undefined, false);
    autoStarted = true;
  }, [enabled]);
}
