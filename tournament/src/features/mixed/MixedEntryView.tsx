import { useMixedStore } from './mixedStore';
import { leagueBadgeStyle } from './leagueColors';
import MixedImportView from './MixedImportView';
import { MapPin, Pencil, ArrowRightLeft, UserCheck, Users, CheckCircle, AlertTriangle, Search, X } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { MixedTeam, TournamentInfo } from './types';
import { siteConfirm } from '../../components/site/siteConfirm';
import { SkSection } from '../../components/site/Kit';

/** インライン編集セル */
function EditableCell({ value, onSave, className = '' }: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value);

  if (editing) {
    return (
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onBlur={() => { onSave(input); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(input); setEditing(false); }
          if (e.key === 'Escape') { setInput(value); setEditing(false); }
        }}
        className="w-full px-1.5 py-0.5 border border-primary-400 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setInput(value); setEditing(true); }}
      className={`cursor-pointer hover:bg-primary-50 px-1 py-0.5 rounded transition-colors ${className}`}
      title="クリックで編集"
    >
      {value || <span className="text-gray-300 italic text-xs">-</span>}
    </span>
  );
}

/** リーグ移動ドロップダウン */
function MoveToLeagueSelect({ team, leagues, onMove }: {
  team: MixedTeam;
  leagues: { leagueId: string }[];
  onMove: (teamId: string, targetLeagueId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const otherLeagues = leagues.filter(l => l.leagueId !== team.leagueId);

  if (!open) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-primary-50 rounded-lg transition-colors"
        title="リーグ移動"
      >
        <ArrowRightLeft size={13} />
      </button>
    );
  }

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <select
        autoFocus
        className="text-xs border border-primary-400 rounded-lg px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
        onChange={async e => {
          // 確認ダイアログを待つ間にイベントの値が変わらないよう、先に取り出しておく
          const leagueId = e.target.value;
          // 確認ダイアログが出るとフォーカスが外れて閉じるので、先に閉じておく
          setOpen(false);
          if (leagueId) {
            if (await siteConfirm(`${team.teamName} を ${leagueId}リーグに移動しますか？\n（該当リーグの試合データはリセットされます）`)) {
              onMove(team.teamId, leagueId);
            }
          }
        }}
        onBlur={() => setOpen(false)}
        defaultValue=""
      >
        <option value="">移動先...</option>
        {otherLeagues.map(l => (
          <option key={l.leagueId} value={l.leagueId}>{l.leagueId}リーグ</option>
        ))}
      </select>
    </div>
  );
}

/** Entry / DEF 個別ボタン */
function EntryDefButtons({ status, onSetStatus, size = 'normal' }: {
  status: 'none' | 'entry' | 'def';
  onSetStatus: (s: 'none' | 'entry' | 'def') => void;
  size?: 'normal' | 'small';
}) {
  const base = size === 'small'
    ? 'px-3 py-1.5 text-[11px] min-w-[48px] min-h-[34px]'
    : 'px-3.5 py-1.5 text-xs min-w-[52px] min-h-[36px]';
  return (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => onSetStatus(status === 'entry' ? 'none' : 'entry')}
        className={`${base} rounded-lg font-bold transition-all active:scale-95 ${
          status === 'entry'
            ? 'bg-primary-500 text-white hover:bg-primary-600'
            : 'bg-white text-gray-400 hover:bg-primary-50 hover:text-gray-700 border border-gray-200 hover:border-primary-300'
        }`}
      >
        Entry
      </button>
      <button
        onClick={() => onSetStatus(status === 'def' ? 'none' : 'def')}
        className={`${base} rounded-lg font-bold transition-all active:scale-95 ${
          status === 'def'
            ? 'bg-gray-600 text-white hover:bg-gray-700'
            : 'bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600 border border-gray-200 hover:border-gray-300'
        }`}
      >
        DEF
      </button>
    </div>
  );
}

/** チームセルの背景色（PC） */
function cellBg(status: 'none' | 'entry' | 'def'): string {
  if (status === 'entry') return 'bg-primary-50/80';
  if (status === 'def') return 'bg-gray-100/80';
  return 'bg-white';
}

/** スマホの行背景色 */
function rowBg(status: 'none' | 'entry' | 'def'): string {
  if (status === 'entry') return 'bg-primary-50/50';
  if (status === 'def') return 'bg-gray-100/60';
  return '';
}

/** リーグバッジカラー（サイトのトンマナに合わせ、全リーグ共通の無彩色） */
const LEAGUE_COLORS = [
  { from: 'from-gray-600', to: 'to-gray-700', light: 'from-gray-50 to-white', border: 'border-gray-200' },
];

export default function MixedEntryView() {
  const { leagues, allTeams, isImported, updateCourtName, updateTeamPlayer, setTeamStatus, setLeagueAllStatus, setAllTeamsStatus, moveTeamToLeague, tournamentInfo, updateGameRule } = useMixedStore();
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtInput, setCourtInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // スクロールで検索窓を閉じる
  useEffect(() => {
    if (!searchOpen) return;
    const handleScroll = () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        if (searchQuery === '') setSearchOpen(false);
      }, 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => { window.removeEventListener('scroll', handleScroll); if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, [searchOpen, searchQuery]);

  // 検索フィルタ
  const matchesSearch = useCallback((team: MixedTeam, league: { leagueId: string }) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      team.male.name.toLowerCase().includes(q) ||
      team.female.name.toLowerCase().includes(q) ||
      team.male.affiliation.toLowerCase().includes(q) ||
      team.female.affiliation.toLowerCase().includes(q) ||
      String(team.pairNumber).includes(q) ||
      league.leagueId.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  if (!isImported) {
    return <MixedImportView />;
  }

  const allEntry = allTeams.length > 0 && allTeams.every(t => t.status === 'entry');
  const totalEntry = allTeams.filter(t => t.status === 'entry').length;
  const totalDef = allTeams.filter(t => t.status === 'def').length;

  return (
    <div className="tm-page">
      {/* ヘッダー統計バー (sticky) */}
      <div className="tm-bar">
        <button
          onClick={() => setAllTeamsStatus(allEntry ? 'none' : 'entry')}
          className={`btn sk-btn sk-btn--sm ${allEntry ? 'btn--primary' : 'btn--outline'}`}
        >
          <Users size={15} />
          {allEntry ? '全員Entry解除' : '全員Entry'}
        </button>
        {/* 統計 */}
        <div className="tm-bar__chips">
          <span className="sk-chip">
            <Users size={12} />
            {allTeams.length}ペア / {leagues.length}リーグ
          </span>
          {totalEntry > 0 && (
            <span className="sk-chip sk-chip--red">
              <CheckCircle size={12} />
              Entry {totalEntry}
            </span>
          )}
          {totalDef > 0 && (
            <span className="sk-chip sk-chip--ink">
              <AlertTriangle size={12} />
              DEF {totalDef}
            </span>
          )}
        </div>
        <span className="tm-bar__grow" />
        {/* 検索 */}
        {searchOpen ? (
          <div className="tm-search">
            <Search size={14} className="shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="名前・所属・番号・リーグで検索..."
              autoFocus
            />
            <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }} className="p-0.5 text-gray-400 hover:text-gray-600" aria-label="検索を閉じる">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 100); }}
            className="btn btn--outline sk-btn sk-btn--sm"
          >
            <Search size={12} />
            検索
          </button>
        )}
      </div>

      {/* ゲームルール設定 */}
      <GameRuleConfig leagues={leagues} tournamentInfo={tournamentInfo} updateGameRule={updateGameRule} />

      {/* リーグ一覧 */}
      <div className="flex flex-col gap-3 sm:gap-4">
        {leagues.map((league, leagueIdx) => {
          const entryCount = league.teams.filter(t => t.status === 'entry').length;
          const defCount = league.teams.filter(t => t.status === 'def').length;
          const leagueAllEntry = league.teams.length > 0 && league.teams.every(t => t.status === 'entry');
          const colors = LEAGUE_COLORS[leagueIdx % LEAGUE_COLORS.length];
          const filteredTeams = searchQuery ? league.teams.filter(t => matchesSearch(t, league)) : league.teams;
          if (searchQuery && filteredTeams.length === 0) return null;

          return (
            <div key={league.leagueId} className="tm-league">
              {/* リーグヘッダー — スマホ用 */}
              <div className="flex sm:hidden tm-league__head">
                <span className="tm-league__badge" style={leagueBadgeStyle(league.leagueId, leagues.length)}>
                  {league.leagueId.trim()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="tm-league__title">
                    {league.leagueId.trim()} リーグ
                    <small>{league.teams.length}ペア</small>
                    {entryCount > 0 && (
                      <span className="sk-chip sk-chip--red">
                        {entryCount}
                      </span>
                    )}
                    {defCount > 0 && (
                      <span className="sk-chip sk-chip--ink">
                        DEF {defCount}
                      </span>
                    )}
                  </h3>
                  {editingCourtId === league.leagueId ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin size={11} className="text-gray-400 shrink-0" />
                      <input
                        type="text"
                        value={courtInput}
                        onChange={e => setCourtInput(e.target.value)}
                        onBlur={() => { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }
                          if (e.key === 'Escape') setEditingCourtId(null);
                        }}
                        className="px-1.5 py-0.5 text-xs border border-primary-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 w-28"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingCourtId(league.leagueId); setCourtInput(league.courtName); }}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mt-0.5"
                    >
                      <MapPin size={11} />
                      {league.courtName || '(コート未設定)'}
                      <Pencil size={9} className="opacity-40" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setLeagueAllStatus(league.leagueId, leagueAllEntry ? 'none' : 'entry')}
                  className={`btn sk-btn sk-btn--sm shrink-0 ${leagueAllEntry ? 'btn--primary' : 'btn--outline'}`}
                >
                  <UserCheck size={12} />
                  {leagueAllEntry ? '解除' : '全Entry'}
                </button>
              </div>

              {/* PC: ドロー表横1行スタイル */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: filteredTeams.length * 210 + 130 }}>
                  <tbody>
                    <tr>
                      {/* リーグ名+コート列 */}
                      <td className="border border-gray-200 px-3 py-3 align-middle text-center bg-white" style={{ minWidth: 120 }}>
                        <div className="tm-league__badge mx-auto mb-1.5" style={leagueBadgeStyle(league.leagueId, leagues.length)}>
                          {league.leagueId.trim()}
                        </div>
                        <div className="font-bold text-sm text-gray-700 mb-1">{league.leagueId.trim()} リーグ</div>
                        {editingCourtId === league.leagueId ? (
                          <div className="flex items-center justify-center gap-1 mb-1.5">
                            <input
                              type="text"
                              value={courtInput}
                              onChange={e => setCourtInput(e.target.value)}
                              onBlur={() => { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { updateCourtName(league.leagueId, courtInput); setEditingCourtId(null); }
                                if (e.key === 'Escape') setEditingCourtId(null);
                              }}
                              className="px-1.5 py-0.5 text-xs border border-primary-400 rounded-lg focus:outline-none w-20 text-center"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingCourtId(league.leagueId); setCourtInput(league.courtName); }}
                            className="flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mb-1.5 mx-auto"
                          >
                            <MapPin size={10} />
                            {league.courtName || '(コート未設定)'}
                          </button>
                        )}
                        <button
                          onClick={() => setLeagueAllStatus(league.leagueId, leagueAllEntry ? 'none' : 'entry')}
                          className={`btn sk-btn sk-btn--sm ${leagueAllEntry ? 'btn--primary' : 'btn--outline'}`}
                        >
                          <UserCheck size={10} />
                          {leagueAllEntry ? '解除' : '全Entry'}
                        </button>
                      </td>
                      {/* チーム列 */}
                      {filteredTeams.map((team) => {
                        const st = team.status || 'none';
                        const isDef = st === 'def';
                        return (
                          <td
                            key={team.teamId}
                            className={`border border-gray-200 px-3 py-2 align-top ${cellBg(st)} transition-all`}
                            style={{ minWidth: 200 }}
                          >
                            {/* 番号バッジ */}
                            <div className="flex items-start gap-2">
                              <div className="shrink-0 mt-0.5">
                                <span className={`w-7 h-7 tm-flat ${colors.from} ${colors.to} text-white text-xs font-bold rounded-full flex items-center justify-center`}>
                                  {team.pairNumber}
                                </span>
                              </div>
                              <div className={`flex-1 min-w-0 ${isDef ? 'opacity-40 line-through' : ''}`}>
                                {/* 男子 */}
                                <div className="flex items-baseline gap-1.5 leading-relaxed">
                                  <EditableCell
                                    value={team.male.name}
                                    onSave={v => updateTeamPlayer(team.teamId, 'maleName', v)}
                                    className="text-sm font-bold text-gray-800 whitespace-nowrap"
                                  />
                                  <EditableCell
                                    value={team.male.affiliation}
                                    onSave={v => updateTeamPlayer(team.teamId, 'maleAffiliation', v)}
                                    className="text-[11px] text-gray-400 whitespace-nowrap"
                                  />
                                </div>
                                {/* 女子 */}
                                <div className="flex items-baseline gap-1.5 leading-relaxed">
                                  <EditableCell
                                    value={team.female.name}
                                    onSave={v => updateTeamPlayer(team.teamId, 'femaleName', v)}
                                    className="text-sm font-bold text-gray-800 whitespace-nowrap"
                                  />
                                  <EditableCell
                                    value={team.female.affiliation}
                                    onSave={v => updateTeamPlayer(team.teamId, 'femaleAffiliation', v)}
                                    className="text-[11px] text-gray-400 whitespace-nowrap"
                                  />
                                </div>
                              </div>
                            </div>
                            {/* ステータスインジケーター + 操作ボタン */}
                            <div className="flex items-center gap-1.5 mt-2 justify-end">
                              <EntryDefButtons status={st} onSetStatus={s => setTeamStatus(team.teamId, s)} />
                              <MoveToLeagueSelect team={team} leagues={leagues} onMove={moveTeamToLeague} />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* スマホ: リスト表示 */}
              <div className="sm:hidden divide-y divide-gray-100">
                {filteredTeams.map((team) => {
                  const st = team.status || 'none';
                  const isDef = st === 'def';
                  return (
                    <div key={team.teamId} className={`flex items-center gap-2 px-2 py-2 ${rowBg(st)}`}>
                      {/* ペア番号 */}
                      <span className={`w-6 h-6 tm-flat ${colors.from} ${colors.to} text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0`}>
                        {team.pairNumber}
                      </span>
                      {/* 名前+所属 */}
                      <div className={`flex-1 min-w-0 ${isDef ? 'opacity-40' : ''}`}>
                        <div className="flex gap-0">
                          <div className="w-[80px] shrink-0 pr-1.5">
                            <div className="text-[13px] font-bold text-gray-800 truncate leading-tight">{team.male.name}</div>
                            <div className="text-[13px] font-bold text-gray-800 truncate leading-tight">{team.female.name}</div>
                          </div>
                          <div className="w-px bg-gray-200 shrink-0 self-stretch" />
                          <div className="flex-1 min-w-0 pl-1.5">
                            <div className="text-[10px] text-gray-400 truncate leading-[1.4rem]">{team.male.affiliation}</div>
                            <div className="text-[10px] text-gray-400 truncate leading-[1.4rem]">{team.female.affiliation}</div>
                          </div>
                        </div>
                      </div>
                      {/* ボタン */}
                      <div className="flex items-center gap-1 shrink-0">
                        <EntryDefButtons status={st} onSetStatus={s => setTeamStatus(team.teamId, s)} size="small" />
                        <MoveToLeagueSelect team={team} leagues={leagues} onMove={moveTeamToLeague} />
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ゲームルール設定コンポーネント */
function GameRuleConfig({ leagues, tournamentInfo, updateGameRule }: {
  leagues: { leagueId: string; teams: MixedTeam[] }[];
  tournamentInfo: TournamentInfo | null;
  updateGameRule: (teamCount: number, rule: string) => void;
}) {

  // リーグのチーム数別にグルーピング
  const teamCountGroups = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const l of leagues) {
      const count = l.teams.length;
      if (!map.has(count)) map.set(count, []);
      map.get(count)!.push(l.leagueId);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [leagues]);

  const gameRules = tournamentInfo?.gameRules || {};

  // デフォルトルール候補
  const defaultRules: Record<number, string> = {
    4: 'ノーアド・6ゲームマッチ（6-6タイブレーク）',
    5: '6ゲーム先取（ノーアド）',
  };

  return (
    <SkSection
      en="Game rules"
      title="ゲームルール設定"
      count={teamCountGroups.length > 0 ? teamCountGroups.map(([count, ids]) => `${count}チーム: ${ids.length}リーグ`).join('、') : undefined}
      collapsible
      defaultOpen={false}
    >
        <div className="space-y-3">
          <p className="text-[10px] text-gray-500">チーム数ごとにゲームルールを設定します。スコア入力画面に反映されます。</p>

          {teamCountGroups.map(([teamCount, leagueIds]) => (
            <div key={teamCount} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-700">{teamCount}チームリーグ</span>
                <span className="text-[10px] text-gray-400">({leagueIds.join(', ')}リーグ)</span>
              </div>
              <input
                type="text"
                value={gameRules[teamCount] ?? defaultRules[teamCount] ?? ''}
                onChange={e => updateGameRule(teamCount, e.target.value)}
                placeholder={`${teamCount}チームリーグのゲームルール`}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none"
              />
            </div>
          ))}

          {/* よく使うルールのプリセット */}
          <div className="pt-2 border-t border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1.5">プリセット</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                'ノーアド・6ゲームマッチ（6-6タイブレーク）',
                '6ゲーム先取（ノーアド）',
                'ノーアド・8ゲームマッチ（8-8タイブレーク）',
                '4ゲームマッチ（4-4タイブレーク）',
              ].map(preset => (
                <button
                  key={preset}
                  onClick={() => {
                    // 最初の未設定グループに適用
                    const unset = teamCountGroups.find(([c]) => !gameRules[c]);
                    if (unset) updateGameRule(unset[0], preset);
                  }}
                  className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded text-gray-600 hover:bg-primary-50 hover:border-primary-300 hover:text-gray-800 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
    </SkSection>
  );
}
