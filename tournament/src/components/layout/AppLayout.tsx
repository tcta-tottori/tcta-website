import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Database, Users, Dices, Trophy, Swords,
  ClipboardList, CalendarClock, BarChart2,
  HelpCircle, Settings, Network, Radio, Printer, MapPin, Calendar, BookOpen, Wrench, ClipboardCheck,
  Camera,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useMixedStore } from '../../features/mixed/mixedStore';
import { useTeamStore } from '../../features/team/teamStore';
import { useSyncStore } from '../../features/sync/syncStore';
import BulkCallOverlay from '../ui/BulkCallOverlay';
import VoiceLoadingIndicator from '../ui/VoiceLoadingIndicator';
import { callTts } from '../../features/broadcast/callTts';
import {
  SiteHeader, MobileNav, PageHead, AppTabs, StatusBar, SiteFooter, SITE_URL, SYSTEM_LOGO, type NavLinkItem,
} from '../site/SiteChrome';
import { OfficerExpiredBar } from '../site/OfficerGate';
import { useSiteReveal } from '../site/useSiteReveal';
import { useOfficer, logout } from '../../features/auth/officer';
import { syncDictionary } from '../../features/catalog/dictSync';
import { startAutoSave } from '../../features/backup/autoSave';
import TestModeBar, { TestEndButton, TestModeLine } from '../../features/catalog/TestModeBar';
import { useIsTestMode } from '../../features/catalog/testMode';
import ResultInboxNotice from '../../features/catalog/ResultInboxNotice';
import { useResultInbox } from '../../features/catalog/resultInbox';

interface MainTab {
  id: string;
  path: string;
  label: string;
  /** ページ見出しの赤い英字と、背景の大きな英字 */
  en: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** タブ・メニューに出さない画面（ドロー確認など、ほかの画面から開くもの） */
  hidden?: boolean;
}

const ALL_MAIN_TABS: MainTab[] = [
  { id: 'S-01', path: '/data', label: '大会選択', en: 'SELECT', icon: Database },
  { id: 'S-01r', path: '/data/review', label: 'ドロー確認', en: 'CHECK', icon: ClipboardCheck, hidden: true },
  { id: 'S-01b', path: '/dict', label: '選手・所属', en: 'PLAYERS', icon: BookOpen },
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
  { id: 'S-13', path: '/data-tools', label: 'データ管理', en: 'DATA TOOLS', icon: Wrench },
  // 協会サイトのお知らせから、Instagram のストーリーズ告知の画像を作って投稿する（大会データが無くても使う）
  { id: 'S-14', path: '/insta', label: 'Instagram', en: 'INSTAGRAM', icon: Camera },
];

/**
 * ヘッダーのナビ（サイトと同じく横一列）に出すまとまり。
 * 画面が13あってサイトのナビ（7項目）に収まらないため、作業の段階ごとに 5 つに束ね、
 * まとまりの中の画面はページ見出しの下のタブで切り替える（会員ポータルの事務局画面と同じ作り）。
 */
const NAV_GROUPS: { key: string; label: string; en: string; paths: string[] }[] = [
  { key: 'prep', label: '大会選択', en: 'SELECT', paths: ['/data', '/data/review'] },
  // 試合の当日に使う画面（受付から対戦順・時間割・ドロー・スコア・状況・配信まで）は 1 つのまとまりにする
  { key: 'run', label: '大会進行', en: 'OPERATION', paths: ['/entry', '/draw-lot', '/draw-table', '/referee', '/schedule-sheet', '/court-bracket', '/score', '/dashboard', '/broadcast'] },
  { key: 'print', label: '印刷', en: 'PRINT', paths: ['/print'] },
  // 選手・所属（ふりがな辞書）はデータ管理と並べて、設定のまとまりに入れる
  { key: 'settings', label: '設定', en: 'SETTINGS', paths: ['/settings', '/data-tools', '/dict', '/manual', '/insta'] },
];

/**
 * 画面いっぱいを使うページ。フッターを出さず、ページの中身が残りの高さを埋める
 * （印刷は左右 2 列を画面の高さで並べる作りのため）。
 */
const FILL_PATHS = ['/print'];

/** 見出しを小さくして、中身（ドロー表）をできるだけ上から見せるページ */
const COMPACT_PATHS = ['/court-bracket'];

/** 抽選・ドロー表タブを非表示にするパス */
const DRAW_TAB_PATHS = ['/draw-lot', '/draw-table'];

/** ミックスダブルス/団体戦 読込時に非表示にするパス */
const MIXED_HIDDEN_PATHS = ['/referee', '/schedule-sheet', '/draw-lot', '/court-bracket'];

export default function AppLayout() {
  const isTest = useIsTestMode();
  const location = useLocation();
  const navigate = useNavigate();
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
  const [menuOpen, setMenuOpen] = useState(false);
  // 本文が少し下がったらヘッダーに影（サイトの .hsh）
  const [scrolled, setScrolled] = useState(false);
  const syncState = useSyncStore((s) => s.connectionState);
  const syncRoom = useSyncStore((s) => s.roomCode);
  const officer = useOfficer();
  // サイトと同じ「見えてきたら浮き上がって出る」動き（main の中がスクロールするので main を基準に）
  const mainRef = useRef<HTMLElement>(null);
  useSiteReveal(mainRef, location.pathname);

  // ログインした時点で、選手・所属のふりがな辞書をデータベースから取り込む（版が同じなら何もしない）
  useEffect(() => {
    if (officer.status === 'ok') void syncDictionary();
  }, [officer.status]);

  // 試合結果の受け箱（手描きのドロー表を Claude が読み取った結果など）を少しおきに取りに行き、運営中の試合に反映する
  useResultInbox(officer.status === 'ok');

  // 運営中のデータを Cloudflare に自動で保存する（変わったら少し待ってまとめて保存）
  useEffect(() => {
    if (officer.status !== 'ok') return;
    return startAutoSave();
  }, [officer.status]);

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
      return tabs.filter(t => ['/data', '/data/review', '/dict', '/print', '/manual', '/settings', '/data-tools', '/insta'].includes(t.path));
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
    // いちばん長く一致する画面（/data/review は /data より先）
    () => [...allTabs].sort((a, b) => b.path.length - a.path.length).find(t => location.pathname.startsWith(t.path))
      ?? [...ALL_MAIN_TABS].sort((a, b) => b.path.length - a.path.length).find(t => location.pathname.startsWith(t.path)),
    [allTabs, location.pathname]
  );
  const visibleGroups = useMemo(
    () => NAV_GROUPS
      // まとまりの中の画面は NAV_GROUPS に書いた順に並べる（最初の画面がまとまりの入口）
      .map(g => ({ ...g, tabs: g.paths.flatMap(p => allTabs.filter(t => t.path === p)) }))
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
  // 隠れた画面（ドロー確認）はタブに出さず、開いているあいだは「大会選択」を選んだ状態にする
  const tabItems: NavLinkItem[] = (currentGroup?.tabs ?? []).filter(t => !t.hidden).map(t => ({
    key: t.id, label: t.label, to: t.path, icon: t.icon, active: t === currentTab || (!!currentTab?.hidden && t.path === '/data'),
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
  const compact = COMPACT_PATHS.some(p => location.pathname.startsWith(p));
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

  // スマホのメニュー：サイトと同じ 2 列の並び。項目はまとまりの数だけにし、中に画面が複数あるもの（大会進行・設定）は
  // 押すとメニューの中で開いて画面を選ぶ。あとに観戦ページ・協会サイト・ログアウト
  const mobileItems: NavLinkItem[] = [
    ...visibleGroups.map(g => {
      const subs = g.tabs.filter(t => !t.hidden);
      return {
        key: g.key, label: g.label, to: g.tabs[0].path, active: g === currentGroup,
        ...(subs.length > 1 ? { children: subs.map(t => ({ key: t.id, label: t.label, to: t.path, active: t === currentTab })) } : {}),
      };
    }),
    { key: 'view', label: '観戦ページ', href: '/view' },
    { key: 'site', label: '協会サイト', href: SITE_URL },
    ...(officer.email ? [{ key: 'logout', label: 'ログアウト', onClick: logout }] : []),
  ];

  const live = activeTickerItems.some(t => t.includes('進行中'));
  // 大会が無いのに試合の画面（受付・対戦順・時間割・ドロー・スコア・配信）を開いたら、大会選択へ戻す
  //（運営データを消したあとに、前の画面が残って見えないように）
  const needsTournament = !hasTournament && !['/data', '/dict', '/print', '/manual', '/settings', '/data-tools', '/insta', '/backup'].some(p => location.pathname === p || location.pathname.startsWith(`${p}/`));
  useEffect(() => { if (needsTournament) navigate('/data', { replace: true }); }, [needsTournament, navigate]);

  const statusBar = (place: 'top' | 'main') => hasTournament ? (
    <StatusBar place={place} label={live ? 'LIVE' : 'NOW'} live={live} lead={displayName || '大会運営システム'} items={activeTickerItems} />
  ) : null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">本文へスキップ</a>

      {/* ===== ヘッダー（協会サイトと同じ。右上の赤いブロックは観戦ページ） ===== */}
      <SiteHeader
        homeTo="/data"
        logo={SYSTEM_LOGO}
        brand={isTest ? <TestModeLine /> : undefined}
        items={navItems}
        contact={{ label: '観戦ページ', href: '/view', external: true }}
        aux={syncChip}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen(v => !v)}
        scrolled={scrolled}
      />

      {/* ===== 役員ログインの期限切れ（画面は止めずに知らせる） ===== */}
      <OfficerExpiredBar />

      {/* ===== テストモードの帯（自動保存しない・テスト用のスコア入力が使える） ===== */}
      <TestModeBar />

      {/* ===== 受け箱の結果を反映したお知らせ（画面の下） ===== */}
      <ResultInboxNotice />

      {/* ===== 大会の状況（PC はヘッダーの直下に固定） ===== */}
      {statusBar('top')}

      {/* ===== スマホ: 黒地のメニュー（サイトと同じ） ===== */}
      <MobileNav open={menuOpen} onClose={closeMenu} items={mobileItems} liteExtra={<TestEndButton onDone={closeMenu} />} />

      <main
        ref={mainRef}
        id="main"
        className={`app-main ${fill ? 'app-main--fill' : ''} ${compact ? 'app-main--compact' : ''}`}
        onScroll={(e) => { const y = (e.currentTarget as HTMLElement).scrollTop > 24; if (y !== scrolled) setScrolled(y); }}
      >
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
              <span className="app-lead__item app-lead__name">{displayName}</span>
              {meta?.date && <span className="app-lead__item"><Calendar className="w-3.5 h-3.5" />{meta.date}</span>}
              {meta?.venue && <span className="app-lead__item"><MapPin className="w-3.5 h-3.5" />{meta.venue}</span>}
            </>
          ) : undefined}
        />
        <AppTabs items={tabItems} label={`${currentGroup?.label ?? ''}の画面`} />
        {/* 大会の状況（スマホはタブの下。PC はヘッダーの直下） */}
        {statusBar('main')}

        {/* ページの中身（ページ遷移アニメーション） */}
        <div key={location.pathname} className={`app-page app-page--gray page-enter ${fill ? '' : 'min-h-[60vh]'}`}>
          <Outlet />
        </div>

        {!fill && (
          <SiteFooter
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
                <a className="fw fw--head" href={SITE_URL} target="_blank" rel="noopener noreferrer">協会サイト</a>
              </div>
            </>}
            utils={<>
              <a className="fw" href="/view" target="_blank" rel="noopener noreferrer">観戦ページ</a>
              {officer.email && (
                <button className="fw app-ver" onClick={logout} title="役員ログインを終える">ログアウト<small>{officer.email}</small></button>
              )}
            </>}
          />
        )}
      </main>

      {/* 一斉コール フローティングオーバーレイ */}
      <BulkCallOverlay />

      {/* コール音声の準備中を知らせるグローバルインジケータ */}
      <VoiceLoadingIndicator />
    </div>
  );
}
