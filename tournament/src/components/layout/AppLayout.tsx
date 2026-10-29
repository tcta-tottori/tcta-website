import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Database, Users, Dices, Trophy, Swords,
  ClipboardList, CalendarClock, BarChart2,
  HelpCircle, Settings, Network, Radio, Printer, MapPin, Calendar,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../../features/mixed/mixedStore';
import { useTeamStore } from '../../features/team/teamStore';
import { useSyncStore } from '../../features/sync/syncStore';
import VersionInfoModal from '../ui/VersionInfoModal';
import BulkCallOverlay from '../ui/BulkCallOverlay';
import VoiceLoadingIndicator from '../ui/VoiceLoadingIndicator';
import { callTts } from '../../features/broadcast/callTts';
import {
  SiteHeader, MobileNav, PageHead, AppTabs, StatusBar, SiteFooter, SITE_URL, type NavLinkItem,
} from '../site/SiteChrome';

interface MainTab {
  id: string;
  path: string;
  label: string;
  /** ページ見出しの赤い英字と、背景の大きな英字 */
  en: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

const ALL_MAIN_TABS: MainTab[] = [
  { id: 'S-01', path: '/data', label: 'データ', en: 'DATA', icon: Database },
  { id: 'S-02', path: '/entry', label: 'エントリー', en: 'ENTRY', icon: Users },

  { id: 'S-04', path: '/draw-lot', label: '抽選', en: 'DRAW LOT', icon: Dices },
  { id: 'S-05', path: '/draw-table', label: 'ドロー表', en: 'DRAW', icon: Swords },
  { id: 'S-06', path: '/referee', label: '対戦順', en: 'ORDER OF PLAY', icon: ClipboardList },
  { id: 'S-06b', path: '/schedule-sheet', label: 'タイムテーブル', en: 'TIMETABLE', icon: CalendarClock },
  { id: 'S-07', path: '/score', label: 'スコア', en: 'SCORE', icon: Trophy },
  { id: 'S-07b', path: '/court-bracket', label: 'ドロー', en: 'DRAW', icon: Network },
  { id: 'S-09', path: '/dashboard', label: 'ダッシュボード', en: 'DASHBOARD', icon: BarChart2 },
  { id: 'S-09b', path: '/broadcast', label: 'ライブ配信', en: 'LIVE', icon: Radio },
  { id: 'S-10', path: '/print', label: '印刷', en: 'PRINT', icon: Printer },
  { id: 'S-11', path: '/manual', label: 'マニュアル', en: 'MANUAL', icon: HelpCircle },
  // 同期・観戦用ページ・音声・バックアップは設定ページに集約している
  { id: 'S-12', path: '/settings', label: '設定', en: 'SETTINGS', icon: Settings },
];

/**
 * ヘッダーのナビ（サイトと同じく横一列）に出すまとまり。
 * 画面が13あってサイトのナビ（7項目）に収まらないため、作業の段階ごとに束ね、
 * まとまりの中の画面はページ見出しの下のタブで切り替える（会員ポータルの事務局画面と同じ作り）。
 */
const NAV_GROUPS: { key: string; label: string; en: string; paths: string[] }[] = [
  { key: 'prep', label: '大会準備', en: 'PREPARATION', paths: ['/data', '/entry', '/draw-lot', '/draw-table'] },
  { key: 'run', label: '大会進行', en: 'OPERATION', paths: ['/referee', '/schedule-sheet', '/court-bracket', '/score'] },
  { key: 'live', label: '配信', en: 'LIVE', paths: ['/dashboard', '/broadcast'] },
  { key: 'print', label: '印刷', en: 'PRINT', paths: ['/print'] },
  { key: 'manual', label: 'マニュアル', en: 'MANUAL', paths: ['/manual'] },
  { key: 'settings', label: '設定', en: 'SETTINGS', paths: ['/settings'] },
];

/**
 * 画面いっぱいを使うページ。フッターを出さず、ページの中身が残りの高さを埋める
 * （印刷は左右 2 列を画面の高さで並べる作りのため）。
 */
const FILL_PATHS = ['/print'];

/** 抽選・ドロー表タブを非表示にするパス */
const DRAW_TAB_PATHS = ['/draw-lot', '/draw-table'];

/** ミックスダブルス/団体戦 読込時に非表示にするパス */
const MIXED_HIDDEN_PATHS = ['/referee', '/schedule-sheet', '/draw-lot', '/court-bracket'];

export default function AppLayout() {
  const location = useLocation();
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);
  const isMixedImported = useMixedStore((s) => s.isImported);
  const mixedTournamentInfo = useMixedStore((s) => s.tournamentInfo);
  const mixedLeagueMatches = useMixedStore((s) => s.leagueMatches);
  const mixedLeagues = useMixedStore((s) => s.leagues);
  const mixedBrackets = useMixedStore((s) => s.brackets);
  const isTeamImported = useTeamStore((s) => s.isImported);
  const teamTournamentInfo = useTeamStore((s) => s.tournamentInfo);
  const teamLeagueMatches = useTeamStore((s) => s.leagueMatches);
  const teamLeagues = useTeamStore((s) => s.leagues);
  const teamBrackets = useTeamStore((s) => s.brackets);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const syncState = useSyncStore((s) => s.connectionState);
  const syncRoom = useSyncStore((s) => s.roomCode);

  // モバイルの自動再生制約対策: 最初のユーザー操作でオーディオをアンロックする
  useEffect(() => {
    const unlock = () => { callTts.unlockAudio(); };
    document.addEventListener('click', unlock, { once: true, capture: true });
    document.addEventListener('touchstart', unlock, { once: true, capture: true });
    return () => {
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    };
  }, []);

  // 現在の大会情報を取得
  const tournament = useLiveQuery(
    () => currentTournamentId
      ? db.tournaments.where('tournamentId').equals(currentTournamentId).first()
      : undefined,
    [currentTournamentId]
  );
  const matchDuration = useAppStore((s) => s.scheduleConfig.matchDuration);
  const [now, setNow] = useState(Date.now());

  // Tick every 15 seconds for ticker updates
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // 現在の大会に紐づく種目を取得
  const events = useLiveQuery(
    () =>
      currentTournamentId
        ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
        : [],
    [currentTournamentId]
  );

  // 全試合データ取得
  const eventIds = useMemo(() => (events ?? []).map(e => e.eventId).sort().join(','), [events]);
  const allMatches = useLiveQuery(async () => {
    const ids = eventIds.split(',').filter(Boolean);
    if (ids.length === 0) return [];
    return db.matches.where('eventId').anyOf(ids).toArray();
  }, [eventIds]) || [];

  // コートデータ取得
  const courts = useLiveQuery(
    () => currentTournamentId ? db.courts.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  // ティッカー用リアルタイムステータス
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    if (allMatches.length === 0 && courts.length === 0) return items;

    const playing = allMatches.filter(m => m.status === 'playing');
    // 不戦勝(BYE)は実際に行う試合ではないので進捗の分母・完了数から除外する
    const finished = allMatches.filter(m => m.status === 'finished');
    const total = allMatches.filter(m => m.status !== 'walkover').length;

    // 進捗
    if (total > 0) {
      const pct = Math.round((finished.length / total) * 100);
      items.push(`進捗: ${finished.length}/${total}試合完了 (${pct}%)`);
    }

    // コート状況
    if (courts.length > 0) {
      const availCourts = courts.filter(c => c.isAvailable);
      const playingCourts = availCourts.filter(c =>
        allMatches.some(m => m.courtId === c.courtId && m.status === 'playing')
      );
      const emptyCourts = availCourts.length - playingCourts.length;
      items.push(`${playingCourts.length}/${availCourts.length}コート使用中 | ${emptyCourts}コート空き`);
    }

    // 試合中
    if (playing.length > 0) {
      items.push(`${playing.length}試合進行中`);
    }

    // 時間超過コート
    const limitMs = matchDuration * 60 * 1000;
    const overMatches = playing.filter(m => m.updatedAt && (now - m.updatedAt) > limitMs);
    for (const m of overMatches) {
      const court = courts.find(c => c.courtId === m.courtId);
      const elapsed = Math.floor((now - (m.updatedAt || now)) / 60000);
      const courtLabel = court?.name || m.courtId;
      items.push(`⚠ ${courtLabel} 時間超過(${elapsed}分) ${m.player1Name} vs ${m.player2Name}`);
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatches, courts, matchDuration, now]);

  // ミックスダブルス用ティッカー
  const mixedTickerItems = useMemo(() => {
    if (!isMixedImported || mixedLeagueMatches.length === 0) return [];
    const items: string[] = [];
    const finished = mixedLeagueMatches.filter(m => m.status === 'finished').length;
    const total = mixedLeagueMatches.length;
    const pct = Math.round((finished / total) * 100);
    items.push(`予選リーグ: ${finished}/${total}試合完了 (${pct}%)`);

    // リーグごとの進捗
    const completedLeagues = mixedLeagues.filter(l => {
      const lm = mixedLeagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
    if (completedLeagues.length > 0) {
      items.push(`${completedLeagues.length}/${mixedLeagues.length}リーグ完了 (${completedLeagues.map(l => l.leagueId.trim()).join(',')})`);
    }

    // 全リーグ完了時のみブラケット情報を表示（未完了時は旧データの可能性）
    const allLeaguesComplete = mixedLeagues.every(l => {
      const lm = mixedLeagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
    if (mixedBrackets.length > 0 && allLeaguesComplete) {
      const bracketFinished = mixedBrackets.reduce((sum, b) => sum + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
      const bracketTotal = mixedBrackets.reduce((sum, b) => sum + b.matches.length, 0);
      items.push(`決勝トーナメント: ${bracketFinished}/${bracketTotal}試合完了`);
    }

    return items;
  }, [isMixedImported, mixedLeagueMatches, mixedLeagues, mixedBrackets]);

  // 団体戦用ティッカー
  const teamTickerItems = useMemo(() => {
    if (!isTeamImported || teamLeagueMatches.length === 0) return [];
    const items: string[] = [];
    const finished = teamLeagueMatches.filter(m => m.status === 'finished').length;
    const total = teamLeagueMatches.length;
    const pct = Math.round((finished / total) * 100);
    items.push(`予選リーグ: ${finished}/${total}対戦完了 (${pct}%)`);

    const completedLeagues = teamLeagues.filter(l => {
      const lm = teamLeagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
    if (completedLeagues.length > 0) {
      items.push(`${completedLeagues.length}/${teamLeagues.length}リーグ完了 (${completedLeagues.map(l => l.leagueId.trim()).join(',')})`);
    }

    const allLeaguesComplete = teamLeagues.every(l => {
      const lm = teamLeagueMatches.filter(m => m.leagueId === l.leagueId);
      return lm.length > 0 && lm.every(m => m.status === 'finished');
    });
    if (teamBrackets.length > 0 && allLeaguesComplete) {
      const bracketFinished = teamBrackets.reduce((sum, b) => sum + b.matches.filter(m => m.status === 'finished' || m.status === 'bye').length, 0);
      const bracketTotal = teamBrackets.reduce((sum, b) => sum + b.matches.length, 0);
      items.push(`決勝トーナメント: ${bracketFinished}/${bracketTotal}対戦完了`);
    }

    return items;
  }, [isTeamImported, teamLeagueMatches, teamLeagues, teamBrackets]);

  // ミックス読込時は対戦順・タイムテーブル等を非表示
  const allTabs = useMemo(() => {
    let tabs: MainTab[] = ALL_MAIN_TABS;

    // 大会データ未読み込み時: データ・印刷・マニュアル・設定のみ表示
    if (!currentTournamentId && !isMixedImported && !isTeamImported) {
      // 賞状印刷は大会データが無くても（手入力で）使えるので常に出す
      return tabs.filter(t => ['/data', '/print', '/manual', '/settings'].includes(t.path));
    }

    // ミックスダブルス or 団体戦 読込時: 不要なタブを非表示 + ラベル変更
    if (isMixedImported || isTeamImported) {
      tabs = tabs.filter((t) => !MIXED_HIDDEN_PATHS.includes(t.path));
      tabs = tabs.map(t => {
        if (t.path === '/draw-table') return { ...t, label: '予選リーグ' };
        if (t.path === '/score') return { ...t, label: '決勝トーナメント' };
        return t;
      });
    } else {
      // 通常モード（個人戦）: スコアは廃止し、ドロー画面で入力する
      tabs = tabs.filter((t) => t.path !== '/score');
      // ミックス/団体戦の種目がなければ抽選・ドロー表タブを非表示
      const hasDrawEvents = (events ?? []).some(
        (e) =>
          /ミックス|団体|mixed|team/i.test(e.name) ||
          /ミックス|団体|mixed|team/i.test(e.type || '')
      );
      if (!hasDrawEvents) {
        tabs = tabs.filter((t) => !DRAW_TAB_PATHS.includes(t.path));
      }
    }
    return tabs;
  }, [events, isMixedImported, isTeamImported]);


  // 現在のページ（タブ）と、それが入っているまとまり
  // 大会を読み込む前など、メニューに出していない画面を直接開いたときも見出しは正しく出す
  const currentTab = useMemo(
    () => allTabs.find(t => location.pathname.startsWith(t.path))
      ?? ALL_MAIN_TABS.find(t => location.pathname.startsWith(t.path)),
    [allTabs, location.pathname]
  );
  const visibleGroups = useMemo(
    () => NAV_GROUPS
      .map(g => ({ ...g, tabs: allTabs.filter(t => g.paths.includes(t.path)) }))
      .filter(g => g.tabs.length > 0),
    [allTabs]
  );
  const currentGroup = visibleGroups.find(g => currentTab && g.paths.includes(currentTab.path));

  const navItems: NavLinkItem[] = visibleGroups.map(g => ({
    key: g.key,
    label: g.label,
    to: g.tabs[0].path,
    active: g === currentGroup,
  }));
  const tabItems: NavLinkItem[] = (currentGroup?.tabs ?? []).map(t => ({
    key: t.id, label: t.label, to: t.path, icon: t.icon, active: t === currentTab,
  }));
  const mobileGroups = visibleGroups.map(g => ({
    label: g.en,
    items: g.tabs.map(t => ({ key: t.id, label: t.label, to: t.path, active: t === currentTab })),
  }));

  // 表示中の大会（個人戦・ミックス・団体戦）
  const displayName = isMixedImported && mixedTournamentInfo
    ? mixedTournamentInfo.name.replace(/\(.*?\)|（.*?）/g, '')
    : isTeamImported && teamTournamentInfo
      ? teamTournamentInfo.name.replace(/\(.*?\)|（.*?）/g, '')
      : tournament?.name.replace(/\(.*?\)|（.*?）/g, '') || '';
  const meta = isMixedImported && mixedTournamentInfo
    ? { date: mixedTournamentInfo.date, venue: mixedTournamentInfo.venue }
    : isTeamImported && teamTournamentInfo
      ? { date: teamTournamentInfo.date, venue: teamTournamentInfo.venue }
      : tournament ? { date: tournament.date, venue: tournament.venue } : null;
  const activeTickerItems = isMixedImported ? mixedTickerItems : isTeamImported ? teamTickerItems : tickerItems;
  const hasTournament = !!(currentTournamentId || isMixedImported || isTeamImported);

  const fill = FILL_PATHS.some(p => location.pathname.startsWith(p));
  const pageLabel = currentTab?.label || '大会運営システム';
  const pageEn = currentTab?.en || 'TOURNAMENT';

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // パス変更時にメニューを閉じる
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const syncChip = syncRoom && syncState !== 'disconnected' ? (
    <Link
      to="/settings"
      className={`sync-chip ${syncState === 'connected' ? 'sync-chip--on' : 'sync-chip--wait'}`}
      title={`同期ルーム ${syncRoom}`}
    >
      <i aria-hidden="true" /><span>{syncState === 'connected' ? `同期中 ${syncRoom}` : '再接続中'}</span>
    </Link>
  ) : null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">本文へスキップ</a>

      {/* ===== ヘッダー（協会サイトと同じ。右上の赤いブロックは観戦ページ） ===== */}
      <SiteHeader
        homeTo="/data"
        tag="大会運営"
        tagEm="SYSTEM"
        items={navItems}
        contact={{ label: '観戦ページ', href: '/view' }}
        aux={syncChip}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen(v => !v)}
      />

      {/* ===== 大会の状況（大会名・進捗・コート・時間超過）。読み込み中だけ出す ===== */}
      {hasTournament && (
        <StatusBar
          label={activeTickerItems.some(t => t.includes('進行中')) ? 'LIVE' : 'NOW'}
          live={activeTickerItems.some(t => t.includes('進行中'))}
          lead={displayName || '大会運営システム'}
          items={activeTickerItems}
        />
      )}

      {/* ===== スマホ: 黒地のメニュー ===== */}
      <MobileNav
        open={menuOpen}
        onClose={closeMenu}
        groups={mobileGroups}
        foot={
          <div className="mobile-nav__foot-row">
            <a className="mobile-nav__foot-link" href="/view" target="_blank" rel="noopener noreferrer" onClick={closeMenu}>観戦ページ ↗</a>
            <a className="mobile-nav__foot-link" href={SITE_URL} target="_blank" rel="noopener noreferrer" onClick={closeMenu}>協会サイト ↗</a>
            <button className="mobile-nav__foot-link" onClick={() => { closeMenu(); setVersionModalOpen(true); }}>Ver 2.4 · {__BUILD_TIMESTAMP__}</button>
          </div>
        }
      />

      <main id="main" className={`app-main ${fill ? 'app-main--fill' : ''}`}>
        <PageHead
          key={`head-${currentTab?.path ?? location.pathname}`}
          crumbs={[
            { label: '大会運営', to: '/data' },
            ...(currentGroup && currentGroup.tabs.length > 1 ? [{ label: currentGroup.label, to: currentGroup.tabs[0].path }] : []),
            { label: pageLabel },
          ]}
          en={pageEn}
          title={pageLabel}
          lead={displayName ? (
            <>
              <span className="page-lead__item page-lead__name">{displayName}</span>
              {meta?.date && <span className="page-lead__item"><Calendar className="w-3.5 h-3.5" />{meta.date}</span>}
              {meta?.venue && <span className="page-lead__item"><MapPin className="w-3.5 h-3.5" />{meta.venue}</span>}
            </>
          ) : undefined}
        />
        <AppTabs items={tabItems} label={`${currentGroup?.label ?? ''}の画面`} />

        {/* ページの中身（ページ遷移アニメーション） */}
        <div key={location.pathname} className={`app-page app-page--gray page-enter ${fill ? '' : 'min-h-[60vh]'}`}>
          <Outlet />
        </div>

        {!fill && (
          <SiteFooter
            note={<>大会運営システム<br />エントリー・ドロー・対戦順・スコア・観戦配信</>}
            columns={<>
              {visibleGroups.slice(0, 3).map(g => (
                <div key={g.key}>
                  <Link className={`fw fw--head ${g.tabs.length > 1 ? 'fw--head-tight' : ''}`} to={g.tabs[0].path}>{g.label}</Link>
                  {g.tabs.length > 1 && g.tabs.map(t => <Link key={t.id} className="fw fw--sub" to={t.path}>{t.label}</Link>)}
                </div>
              ))}
              <div>
                {visibleGroups.slice(3).map(g => (
                  <Link key={g.key} className="fw fw--head" to={g.tabs[0].path}>{g.label}</Link>
                ))}
                <a className="fw fw--head" href={SITE_URL} target="_blank" rel="noopener noreferrer">協会サイト ↗</a>
              </div>
            </>}
            utils={<>
              <a className="fw" href="/view" target="_blank" rel="noopener noreferrer">観戦ページを開く ↗</a>
              <button className="fw site-footer__ver" onClick={() => setVersionModalOpen(true)}>
                Ver 2.4<small>{__BUILD_TIMESTAMP__}</small>
              </button>
            </>}
          />
        )}
      </main>

      {/* バージョン情報モーダル */}
      <VersionInfoModal open={versionModalOpen} onClose={() => setVersionModalOpen(false)} />

      {/* 一斉コール フローティングオーバーレイ */}
      <BulkCallOverlay />

      {/* コール音声の準備中を知らせるグローバルインジケータ */}
      <VoiceLoadingIndicator />
    </div>
  );
}
