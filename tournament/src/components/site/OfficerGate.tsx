// 運営画面の関門。役員としてログインしていなければ、運営画面の代わりにログインの案内を出す。
// 本当の守りは Worker 側（運営端末としての同期の接続・音声コールは、ログインしていなければ断る）。
import type { ReactNode } from 'react';
import { LogIn, Eye, WifiOff, ShieldAlert } from 'lucide-react';
import { useOfficer, loginHref } from '../../features/auth/officer';
import { SiteHeader, PageHead, SiteFooter, SITE_URL } from './SiteChrome';

export default function OfficerGate({ children }: { children: ReactNode }) {
  const officer = useOfficer();
  if (officer.status === 'ok' || officer.status === 'expired') return <>{children}</>;

  const body = (() => {
    switch (officer.status) {
      case 'checking':
        return <p className="text-sm text-gray-500">役員ログインを確かめています…</p>;
      case 'unconfigured':
        return (
          <>
            <h2 className="officer-gate__title"><ShieldAlert className="w-5 h-5" />役員ログインが未設定です</h2>
            <p>この大会運営システムは、役員だけが使えるようにしてあります。ただ、ログインのしくみ（Cloudflare Access）の設定がまだ入っていないため、いまは誰もログインできません。</p>
            <p className="note">システムの担当の方へ: tournament/README.md の「役員ログイン」の手順で設定してください。それまでのあいだも、観戦ページは使えます。</p>
          </>
        );
      case 'offline':
        return (
          <>
            <h2 className="officer-gate__title"><WifiOff className="w-5 h-5" />ログインを確かめられません</h2>
            <p>インターネットにつながっていないため、役員かどうかを確かめられません。この端末で一度ログインしておけば、会場で電波が無いときも続けて使えます。</p>
            <p className="note">つながる場所で、もう一度開いてください。</p>
          </>
        );
      default:
        return (
          <>
            <h2 className="officer-gate__title"><LogIn className="w-5 h-5" />役員の方はログインしてください</h2>
            <p>この画面（大会運営システム）は、協会の役員だけが使えます。登録したメールアドレスを入れると、6 桁の確認コードがメールで届きます。パスワードはいりません。</p>
            <p className="note">一度ログインした端末は 7 日間そのまま使えます。大会の結果やドローを見たい方は、観戦ページをご覧ください。</p>
          </>
        );
    }
  })();

  return (
    <div className="app-shell">
      <SiteHeader
        homeTo="/view"
        tag="大会運営"
        tagEm="SYSTEM"
        items={[]}
        contact={{ label: '観戦ページ', to: '/view' }}
        menuOpen={false}
        onToggleMenu={() => {}}
        hideMenu
      />
      <main id="main" className="app-main">
        <PageHead crumbs={[{ label: '協会サイト', href: SITE_URL }, { label: '大会運営' }]} en="OFFICERS ONLY" ghost="LOGIN" title="役員ログイン" />
        <div className="app-page app-page--gray app-page--pad min-h-[60vh]">
          <div className="site-container">
            <div className="panel officer-gate fu">
              {body}
              <div className="officer-gate__actions">
                {(officer.status === 'login' || officer.status === 'offline') && (
                  <a className="btn btn--primary" href={loginHref()}>役員としてログイン <span className="aw">→</span></a>
                )}
                <a className="btn btn--outline" href="/view"><span className="inline-flex items-center gap-2"><Eye className="w-4 h-4" />観戦ページを見る</span></a>
              </div>
            </div>
          </div>
        </div>
        <SiteFooter
          note={<>大会運営システム（役員用）</>}
          columns={<>
            <div><a className="fw fw--head" href="/view">観戦ページ</a></div>
            <div><a className="fw fw--head" href={SITE_URL} target="_blank" rel="noopener noreferrer">協会サイト ↗</a></div>
          </>}
        />
      </main>
    </div>
  );
}

/** 使っている途中で期限が切れたときの帯（画面は止めない） */
export function OfficerExpiredBar() {
  const officer = useOfficer();
  if (officer.status !== 'expired') return null;
  return (
    <div className="officer-expired" role="alert">
      <span>役員ログインの期限が切れました。同期と音声コールを続けるには、ログインし直してください（入力した内容は端末に残っています）。</span>
      <a href={loginHref()}>ログインし直す →</a>
    </div>
  );
}
