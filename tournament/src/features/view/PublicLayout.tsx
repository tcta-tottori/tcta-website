import { useState, useMemo, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Trophy, Swords, Radio, Network, ClipboardList, RefreshCw, Activity, BarChart2, Calendar, MapPin } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../mixed/mixedStore';
import { useTeamStore } from '../team/teamStore';
import { usePublicSync } from './usePublicSync';
import { SiteHeader, MobileNav, PageHead, StatusBar, SiteFooter, SITE_URL, type NavLinkItem } from '../../components/site/SiteChrome';

/**
 * 参加者・HP訪問者向け公開ビューのレイアウト（読み取り専用）。
 * 個人戦・団体戦/ミックスとも操作画面と同じヘッダー＋流れる表示＋
 * ハンバーガーメニュー（タブ）で統一する。表示するタブだけを大会種別で切り替える。
 * - 個人戦: ライブスコア / ドロー / 対戦順 / ダッシュボード
 * - 団体戦/ミックス: 予選リーグ / 決勝トーナメント / LIVE
 */
export default function PublicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const sync = usePublicSync();

  const mixedInfo = useMixedStore(s => s.tournamentInfo);
  const teamInfo = useTeamStore(s => s.tournamentInfo);
  const groupInfo = mixedInfo || teamInfo;
  const isGroup = !!groupInfo;

  // 団体戦/ミックスの流れる表示用データ
  const mixedLeagues = useMixedStore(s => s.leagues);
  const mixedLeagueMatches = useMixedStore(s => s.leagueMatches);
  const mixedBrackets = useMixedStore(s => s.brackets);
  const teamLeagues = useTeamStore(s => s.leagues);
  const teamLeagueMatches = useTeamStore(s => s.leagueMatches);
  const teamBrackets = useTeamStore(s => s.brackets);

  // 個人戦: 同期で受信した選択中大会
  const currentTournamentId = useAppStore(s => s.currentTournamentId);
  const matchDuration = useAppStore(s => s.scheduleConfig.matchDuration);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  // ルート変更時にメニューを閉じる
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // 運営端末が大会を選択していない状態でスナップショットが届くこともあるため、
  // 選択中大会が無ければ DB にある最新の大会にフォールバックする。
  // （これが無いとデータを受信済みでも「受信を待っています」のままになる）
  const individualTournament = useLiveQuery(async () => {
    if (isGroup) return undefined;
    if (currentTournamentId) {
      return db.tournaments.where('tournamentId').equals(currentTournamentId).first();
    }
    // 大会が選ばれていなければ DB 内の最新の大会を採用する
    const all = await db.tournaments.toArray();
    if (all.length === 0) return undefined;
    return all.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  }, [isGroup, currentTournamentId]);

  const activeTournamentId = individualTournament?.tournamentId || '';

  const events = useLiveQuery(
    () => (!isGroup && activeTournamentId
      ? db.events.where('tournamentId').equals(activeTournamentId).toArray()
      : []),
    [isGroup, activeTournamentId]
  ) || [];
  const eventIds = useMemo(() => events.map(e => e.eventId).sort().join(','), [events]);
  const allMatches = useLiveQuery(async () => {
    const ids = eventIds.split(',').filter(Boolean);
    if (ids.length === 0) return [];
    return db.matches.where('eventId').anyOf(ids).toArray();
  }, [eventIds]) || [];
  const courts = useLiveQuery(
    () => (!isGroup && activeTournamentId
      ? db.courts.where('tournamentId').equals(activeTournamentId).toArray()
      : []),
    [isGroup, activeTournamentId]
  ) || [];

  // 観戦端末では appStore の選択中大会が未設定のことがある。
  // 実際に表示している大会に合わせておくと、配下のページ
  // （ドロー・対戦順・ダッシュボード）も同じ大会を参照できる。
  useEffect(() => {
    if (isGroup || currentTournamentId || !activeTournamentId) return;
    useAppStore.setState({ currentTournamentId: activeTournamentId });
  }, [isGroup, activeTournamentId, currentTournamentId]);

  // 個人戦なのに団体戦用ルート(league/bracket)に居る場合はドローへ寄せる
  useEffect(() => {
    if (!isGroup && individualTournament &&
        (location.pathname.endsWith('/league') || location.pathname.endsWith('/bracket'))) {
      navigate(`/view/draw${location.search}`, { replace: true });
    }
  }, [isGroup, individualTournament, location.pathname, location.search, navigate]);

  // 団体戦/ミックスなのに個人戦用ルートに居る場合は予選リーグへ寄せる
  useEffect(() => {
    if (isGroup && /\/(draw|order|livescore)$/.test(location.pathname)) {
      navigate(`/view/league${location.search}`, { replace: true });
    }
  }, [isGroup, location.pathname, location.search, navigate]);

  // 個人戦の流れる表示（本アプリと同じ内容）
  const individualTickerItems = useMemo(() => {
    const items: string[] = [];
    if (allMatches.length === 0 && courts.length === 0) return items;
    const playing = allMatches.filter(m => m.status === 'playing');
    const finished = allMatches.filter(m => m.status === 'finished');
    const total = allMatches.filter(m => m.status !== 'walkover').length;
    if (total > 0) {
      const pct = Math.round((finished.length / total) * 100);
      items.push(`進捗: ${finished.length}/${total}試合完了 (${pct}%)`);
    }
    if (courts.length > 0) {
      const availCourts = courts.filter(c => c.isAvailable);
      const playingCourts = availCourts.filter(c => allMatches.some(m => m.courtId === c.courtId && m.status === 'playing'));
      const emptyCourts = availCourts.length - playingCourts.length;
      items.push(`${playingCourts.length}/${availCourts.length}コート使用中 | ${emptyCourts}コート空き`);
    }
    if (playing.length > 0) items.push(`${playing.length}試合進行中`);
    const limitMs = (matchDuration || 40) * 60 * 1000;
    for (const m of playing.filter(m => m.updatedAt && (now - m.updatedAt) > limitMs)) {
      const court = courts.find(c => c.courtId === m.courtId);
      const elapsed = Math.floor((now - (m.updatedAt || now)) / 60000);
      items.push(`⚠ ${court?.name || m.courtId} 時間超過(${elapsed}分) ${m.player1Name} vs ${m.player2Name}`);
    }
    return items;
  }, [allMatches, courts, matchDuration, now]);

  // 団体戦/ミックスの流れる表示（操作画面と同じ内容）
  const groupTickerItems = useMemo(() => {
    if (!isGroup) return [];
    const isMixed = !!mixedInfo;
    const leagues: { leagueId: string }[] = isMixed ? mixedLeagues : teamLeagues;
    const leagueMatches: { leagueId: string; status: string }[] = isMixed ? mixedLeagueMatches : teamLeagueMatches;
    const brackets: { matches: { status: string }[] }[] = isMixed ? mixedBrackets : teamBrackets;
    const unit = isMixed ? '試合' : '対戦';
    if (leagueMatches.length === 0) return [];

    const items: string[] = [];
    const finished = leagueMatches.filter(m => m.status === 'finished').length;
    const total = leagueMatches.length;
    items.push(`予選リーグ: ${finished}/${total}${unit}完了 (${Math.round((finished / total) * 100)}%)`);

    const isLeagueComplete = (leagueId: string) => {
      const lm = leagueMatches.filter(m => m.leagueId === leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    };
    const completedLeagues = leagues.filter(l => isLeagueComplete(l.leagueId));
    if (completedLeagues.length > 0) {
      items.push(`${completedLeagues.length}/${leagues.length}リーグ完了 (${completedLeagues.map(l => l.leagueId.trim()).join(',')})`);
    }

    // 全リーグ完了時のみ決勝トーナメントの進捗を表示（未完了時は旧データの可能性）
    const allLeaguesComplete = leagues.every(l => isLeagueComplete(l.leagueId));
    if (brackets.length > 0 && allLeaguesComplete) {
      const bFinished = brackets.reduce((sum, b) => sum + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
      const bTotal = brackets.reduce((sum, b) => sum + b.matches.length, 0);
      items.push(`決勝トーナメント: ${bFinished}/${bTotal}${unit}完了`);
    }
    return items;
  }, [isGroup, mixedInfo, mixedLeagues, mixedLeagueMatches, mixedBrackets, teamLeagues, teamLeagueMatches, teamBrackets]);

  // ============================ 操作画面と同じヘッダー＋タブ（ハンバーガー） ============================
  const info = isGroup
    ? groupInfo!
    : individualTournament
      ? { name: individualTournament.name, date: individualTournament.date, venue: individualTournament.venue }
      : null;
  const tournamentName = info?.name?.replace(/\(.*?\)|（.*?）/g, '').trim() || '';
  const tickerItems = isGroup ? groupTickerItems : individualTickerItems;

  const menuItems = isGroup
    ? [
        { path: '/view/league', label: '予選リーグ', en: 'LEAGUE', icon: Swords },
        { path: '/view/bracket', label: '決勝トーナメント', en: 'FINALS', icon: Trophy },
        { path: '/view/live', label: 'ダッシュボード', en: 'DASHBOARD', icon: BarChart2 },
      ]
    : [
        { path: '/view/livescore', label: 'ライブスコア', en: 'LIVE SCORE', icon: Activity },
        { path: '/view/draw', label: 'ドロー', en: 'DRAW', icon: Network },
        { path: '/view/order', label: '対戦順', en: 'ORDER OF PLAY', icon: ClipboardList },
        { path: '/view/live', label: 'ダッシュボード', en: 'DASHBOARD', icon: Radio },
      ];
  const current = menuItems.find(mi => location.pathname.startsWith(mi.path)) || menuItems[0];
  // 観戦 URL の ?room= / ?server= は画面を移っても持ち回る
  const navItems: NavLinkItem[] = menuItems.map(mi => ({
    key: mi.path, label: mi.label, to: `${mi.path}${location.search}`, active: mi === current,
  }));
  const live = sync.connectionState === 'connected';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">本文へスキップ</a>

      {/* ヘッダー（協会サイトと同じ。右上の赤いブロックは協会サイトへ） */}
      <SiteHeader
        homeTo={`/view${location.search}`}
        tag="観戦"
        tagEm="LIVE"
        items={navItems}
        contact={{ label: '協会サイト', href: SITE_URL }}
        aux={sync.hasRoom ? <SyncBadge sync={sync} /> : null}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen(v => !v)}
      />

      {/* 大会の状況（大会名・進捗・コート・時間超過） */}
      <StatusBar
        label={live ? 'LIVE' : 'WAIT'}
        live={live}
        lead={tournamentName || '観戦用ページ'}
        items={tickerItems}
      />

      {/* スマホ: 黒地のメニュー */}
      <MobileNav
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        groups={[{ label: 'LIVE', items: navItems }]}
        foot={
          <div className="mobile-nav__foot-row">
            <a className="mobile-nav__foot-link" href={SITE_URL} target="_blank" rel="noopener noreferrer">協会サイト ↗</a>
            <a className="mobile-nav__foot-link" href={`${SITE_URL}tournaments.html`} target="_blank" rel="noopener noreferrer">大会情報 ↗</a>
          </div>
        }
      />

      {/* コンテンツ */}
      <main id="main" className="app-main">
        <PageHead
          key={`head-${current.path}`}
          crumbs={[{ label: '協会サイト', href: SITE_URL }, { label: '観戦', to: `/view${location.search}` }, { label: current.label }]}
          en={current.en}
          title={tournamentName || current.label}
          lead={info ? (
            <>
              <span className="page-lead__item page-lead__name">{current.label}</span>
              {info.date && <span className="page-lead__item"><Calendar className="w-3.5 h-3.5" />{info.date}</span>}
              {info.venue && <span className="page-lead__item"><MapPin className="w-3.5 h-3.5" />{info.venue}</span>}
            </>
          ) : undefined}
        />
        <div className="app-page app-page--gray min-h-[60vh]">
          {!info ? (
            <div className="site-container">
              <WaitingCard sync={sync} />
            </div>
          ) : (
            <div key={location.pathname} className="page-enter min-h-full pb-12">
              {isGroup ? (
                <div className="max-w-7xl w-full mx-auto px-3 md:px-4 py-4">
                  <Outlet />
                </div>
              ) : (
                <Outlet />
              )}
            </div>
          )}
        </div>
        <SiteFooter
          note={<>大会の進み具合を、会場の外からも。<br />結果は運営の入力と同時に反映されます。</>}
          columns={<>
            <div>
              {navItems.slice(0, 2).map(it => <Link key={it.key} className="fw fw--head" to={it.to!}>{it.label}</Link>)}
            </div>
            <div>
              {navItems.slice(2).map(it => <Link key={it.key} className="fw fw--head" to={it.to!}>{it.label}</Link>)}
            </div>
            <div>
              <a className="fw fw--head fw--head-tight" href={SITE_URL} target="_blank" rel="noopener noreferrer">協会サイト ↗</a>
              <a className="fw fw--sub" href={`${SITE_URL}tournaments.html`} target="_blank" rel="noopener noreferrer">大会情報</a>
              <a className="fw fw--sub" href={`${SITE_URL}results.html`} target="_blank" rel="noopener noreferrer">大会結果</a>
            </div>
            <div>
              <a className="fw fw--head" href={`${SITE_URL}membership.html`} target="_blank" rel="noopener noreferrer">入会案内 ↗</a>
            </div>
          </>}
        />
      </main>
    </div>
  );
}

/**
 * データ待ち画面。
 * 待つだけだと復帰できないことがあるため、手動の再読み込みを用意する。
 */
function WaitingCard({ sync }: { sync: ReturnType<typeof usePublicSync> }) {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = () => {
    setRetrying(true);
    sync.refresh();
    setTimeout(() => setRetrying(false), 1500);
  };

  // 中継サーバーが未設定のビルドでは、そもそも他端末のデータを受け取れない。
  // 観戦者には「待てば映る」と誤解させず、運営側の設定漏れだと分かる文言にする。
  if (!sync.serverConfigured) {
    return (
      <div className="panel wait-panel">
        <h2 className="wait-panel__title">観戦用の配信が有効になっていません。</h2>
        <p>中継の接続先が見つからないため、運営端末の大会データを受信できません。</p>
        <p className="note">運営の方へ: この URL（Cloudflare 版）の Worker が配備されているか確認してください。</p>
      </div>
    );
  }

  return (
    <div className="panel wait-panel">
      <h2 className="wait-panel__title">
        {sync.connectionState === 'connected'
          ? '運営端末からのデータを待っています'
          : sync.connectionState === 'disconnected'
            ? '中継に接続できていません'
            : '運営端末のルームに接続しています'}
      </h2>
      <p>
        {sync.connectionState === 'connected'
          ? '運営端末で大会データを読み込み、設定の「インターネット公開を開始」を押すと自動で表示されます。'
          : '運営端末で大会データが読み込まれ、同期が始まると自動で表示されます。'}
      </p>
      <p className="note">ルーム: <code>{sync.roomCode}</code></p>
      <button onClick={handleRetry} disabled={retrying} className="btn btn--outline" style={{ marginTop: 16 }}>
        <span className="inline-flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />再読み込み</span>
      </button>
    </div>
  );
}

function SyncBadge({ sync }: { sync: ReturnType<typeof usePublicSync> }) {
  const connected = sync.connectionState === 'connected';
  const connecting = sync.connectionState === 'connecting' || sync.connectionState === 'reconnecting';
  const label = connected ? 'ライブ受信中' : connecting ? '接続中' : sync.serverConfigured ? '切断' : 'ローカル同期';
  return (
    <span className={`sync-chip ${connected ? 'sync-chip--on' : connecting ? 'sync-chip--wait' : ''}`} title={`ルーム: ${sync.roomCode}`}>
      <i aria-hidden="true" /><span>{label}</span>
    </span>
  );
}
