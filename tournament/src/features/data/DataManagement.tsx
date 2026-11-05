import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileSpreadsheet, ChevronDown, ChevronRight, Trash2, AlertTriangle, Trophy, Calendar, MapPin, Pencil, Users, Eraser, FlaskConical } from 'lucide-react';
import DataImport from './DrawMeetingImport';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useMixedStore } from '../mixed/mixedStore';
import MixedExcelViewer from '../mixed/MixedExcelViewer';
import { useTeamStore } from '../team/teamStore';
import { fillTestScores } from '../score/testScoreFiller';

/** 予備日を含む文字列から選択肢を生成 */
function parseReserveDayOptions(value: string, type: 'date' | 'venue'): string[] {
  if (!value) return [];
  const options: string[] = [];
  if (type === 'date') {
    // "令和8年4月5日（日）予備日4月11日（土）" → ["令和8年4月5日（日）", full original]
    const mainDate = value.split(/予備日[：:]?/)[0].trim();
    if (mainDate && mainDate !== value) {
      options.push(mainDate);
      options.push(value); // 元のフルテキストも選択肢に
    }
  } else {
    // "ヤマタスポーツパーク（予備日千代テニス場）" → ["ヤマタスポーツパーク", full original]
    const mainVenue = value.replace(/[（(]予備日[^）)]*[）)]/g, '').split(/予備日/)[0].trim();
    if (mainVenue && mainVenue !== value) {
      options.push(mainVenue);
      options.push(value);
    }
  }
  return options;
}

/** ミックス大会情報表示・編集セクション */
function MixedTournamentInfoSection() {
  const { tournamentInfo, updateTournamentInfo, leagues, allTeams } = useMixedStore();
  const [editingField, setEditingField] = useState<'name' | 'date' | 'venue' | null>(null);
  const [editValue, setEditValue] = useState('');

  if (!tournamentInfo) return null;

  const startEdit = (field: 'name' | 'date' | 'venue') => {
    setEditingField(field);
    setEditValue(tournamentInfo[field]);
  };

  const saveEdit = () => {
    if (editingField) {
      updateTournamentInfo(editingField, editValue);
      setEditingField(null);
    }
  };

  const hasReserveDate = /予備日/.test(tournamentInfo.date);
  const hasReserveVenue = /予備日/.test(tournamentInfo.venue);
  const dateOptions = parseReserveDayOptions(tournamentInfo.date, 'date');
  const venueOptions = parseReserveDayOptions(tournamentInfo.venue, 'venue');

  const entryCount = allTeams.filter(t => t.status === 'entry').length;
  const defCount = allTeams.filter(t => t.status === 'def').length;

  return (
    <section className="sk-sec">
      <div className="sk-sec__head">
        <span className="sk-sec__mark" aria-hidden="true" />
        <div className="sk-sec__titles">
          <p className="sk-sec__en">MIXED TOURNAMENT</p>
          <h2 className="sk-sec__title">ミックス大会情報</h2>
        </div>
      </div>
      <div className="sk-sec__body ps-info">
        {/* 大会名 */}
        <div className="ps-info__row">
          <Trophy className="ps-info__ico" />
          <div className="flex-1 min-w-0">
            <div className="ps-info__label">大会名</div>
            {editingField === 'name' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="input sk-input"
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit('name')} className="ps-info__edit ps-info__edit--name">
                {tournamentInfo.name}
                <Pencil size={10} className="opacity-40" />
              </button>
            )}
          </div>
        </div>

        {/* 日付 */}
        <div className="ps-info__row">
          <Calendar className="ps-info__ico" />
          <div className="flex-1 min-w-0">
            <div className="ps-info__label">開催日</div>
            {editingField === 'date' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="input sk-input"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => startEdit('date')} className="ps-info__edit">
                  {tournamentInfo.date || '(未設定)'}
                  <Pencil size={10} className="opacity-40" />
                </button>
                {hasReserveDate && dateOptions.length > 0 && (
                  <select
                    onChange={e => { if (e.target.value) updateTournamentInfo('date', e.target.value); }}
                    defaultValue=""
                    className="ps-info__select"
                  >
                    <option value="" disabled>予備日を除去...</option>
                    {dateOptions.map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 会場 */}
        <div className="ps-info__row">
          <MapPin className="ps-info__ico" />
          <div className="flex-1 min-w-0">
            <div className="ps-info__label">会場</div>
            {editingField === 'venue' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="input sk-input"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => startEdit('venue')} className="ps-info__edit">
                  {tournamentInfo.venue || '(未設定)'}
                  <Pencil size={10} className="opacity-40" />
                </button>
                {hasReserveVenue && venueOptions.length > 0 && (
                  <select
                    onChange={e => { if (e.target.value) updateTournamentInfo('venue', e.target.value); }}
                    defaultValue=""
                    className="ps-info__select"
                  >
                    <option value="" disabled>予備日を除去...</option>
                    {venueOptions.map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 統計 */}
        <div className="ps-info__row">
          <Users className="ps-info__ico" />
          <div className="flex-1">
            <div className="ps-info__label">参加状況</div>
            <div className="text-sm text-gray-700">
              {allTeams.length}ペア / {leagues.length}リーグ
              {entryCount > 0 && <span className="text-gray-700 ml-2">Entry {entryCount}</span>}
              {defCount > 0 && <span className="text-primary-500 ml-2">DEF {defCount}</span>}
            </div>
          </div>
        </div>

        {/* ルール */}
        {tournamentInfo.rules.length > 0 && (
          <div className="sk-note ps-info__rules">
            <div className="ps-info__label">ゲームルール</div>
            <div className="text-xs text-gray-800">
              {tournamentInfo.rules.map((r, i) => <div key={i}>{r}</div>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** 団体戦 大会情報表示・編集セクション */
function TeamTournamentInfoSection() {
  const { tournamentInfo, updateTournamentInfo, leagues, allTeams } = useTeamStore();
  const [editingField, setEditingField] = useState<'name' | 'date' | 'venue' | null>(null);
  const [editValue, setEditValue] = useState('');

  if (!tournamentInfo) return null;

  const startEdit = (field: 'name' | 'date' | 'venue') => {
    setEditingField(field);
    setEditValue(tournamentInfo[field]);
  };

  const saveEdit = () => {
    if (editingField) {
      updateTournamentInfo(editingField, editValue);
      setEditingField(null);
    }
  };

  const entryCount = allTeams.filter(t => t.status === 'entry').length;
  const defCount = allTeams.filter(t => t.status === 'def').length;

  return (
    <section className="sk-sec">
      <div className="sk-sec__head">
        <span className="sk-sec__mark" aria-hidden="true" />
        <div className="sk-sec__titles">
          <p className="sk-sec__en">TEAM TOURNAMENT</p>
          <h2 className="sk-sec__title">団体戦 大会情報</h2>
        </div>
      </div>
      <div className="sk-sec__body ps-info">
        {/* 大会名 */}
        <div className="ps-info__row">
          <Trophy className="ps-info__ico" />
          <div className="flex-1 min-w-0">
            <div className="ps-info__label">大会名</div>
            {editingField === 'name' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="input sk-input"
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit('name')} className="ps-info__edit ps-info__edit--name">
                {tournamentInfo.name}
                <Pencil size={10} className="opacity-40" />
              </button>
            )}
          </div>
        </div>

        {/* 日付 */}
        <div className="ps-info__row">
          <Calendar className="ps-info__ico" />
          <div className="flex-1 min-w-0">
            <div className="ps-info__label">開催日</div>
            {editingField === 'date' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="input sk-input"
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit('date')} className="ps-info__edit">
                {tournamentInfo.date || '(未設定)'}
                <Pencil size={10} className="opacity-40" />
              </button>
            )}
          </div>
        </div>

        {/* 会場 */}
        <div className="ps-info__row">
          <MapPin className="ps-info__ico" />
          <div className="flex-1 min-w-0">
            <div className="ps-info__label">会場</div>
            {editingField === 'venue' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                className="input sk-input"
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit('venue')} className="ps-info__edit">
                {tournamentInfo.venue || '(未設定)'}
                <Pencil size={10} className="opacity-40" />
              </button>
            )}
          </div>
        </div>

        {/* 統計 */}
        <div className="ps-info__row">
          <Users className="ps-info__ico" />
          <div className="flex-1">
            <div className="ps-info__label">参加状況</div>
            <div className="text-sm text-gray-700">
              {allTeams.length}チーム / {leagues.length}リーグ
              {entryCount > 0 && <span className="text-gray-600 ml-2">Entry {entryCount}</span>}
              {defCount > 0 && <span className="text-primary-500 ml-2">DEF {defCount}</span>}
            </div>
          </div>
        </div>

        {/* ルール */}
        {tournamentInfo.rules.length > 0 && (
          <div className="sk-note ps-info__rules">
            <div className="ps-info__label">ゲームルール</div>
            <div className="text-xs text-gray-800">
              {tournamentInfo.rules.map((r, i) => <div key={i}>{r}</div>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function DataManagement() {
  const isMixedImported = useMixedStore(s => s.isImported);
  const isTeamImported = useTeamStore(s => s.isImported);

  // セクション開閉状態
  const [dataImportOpen, setDataImportOpen] = useState(false);

  // 全データリセット用
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // シート別クリア用
  const [pendingClear, setPendingClear] = useState<null | { title: string; message: string; run: () => void | Promise<void> }>(null);
  const [clearDoneLabel, setClearDoneLabel] = useState<string | null>(null);
  const drawCount = useLiveQuery(() => db.draws.count(), [], 0);
  const matchCount = useLiveQuery(() => db.matches.count(), [], 0);
  const hasDrawData = (drawCount ?? 0) > 0 || (matchCount ?? 0) > 0;

  // テスト用スコア一括入力（運営画面のみ・観戦用ページには出さない）
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [showTestScoreConfirm, setShowTestScoreConfirm] = useState(false);
  const [testScoreRunning, setTestScoreRunning] = useState(false);
  const [testScoreResult, setTestScoreResult] = useState<string | null>(null);
  const hasIndividualMatches = (matchCount ?? 0) > 0 && !isTeamImported && !isMixedImported;

  const handleFillTestScores = useCallback(async () => {
    setShowTestScoreConfirm(false);
    if (!currentTournamentId) return;
    setTestScoreRunning(true);
    setTestScoreResult(null);
    try {
      const res = await fillTestScores(currentTournamentId);
      setTestScoreResult(
        res.filledCount === 0
          ? 'スコアを入力できる試合がありませんでした。エントリーを確定してからお試しください。'
          : `${res.eventCount}種目・${res.filledCount}試合にテストスコアを入力しました（${res.details.map(d => `${d.eventName} ${d.filled}`).join(' / ')}）`,
      );
    } catch (err) {
      console.error('テストスコア入力に失敗:', err);
      setTestScoreResult(`テストスコアの入力に失敗しました: ${(err as Error).message}`);
    } finally {
      setTestScoreRunning(false);
    }
  }, [currentTournamentId]);

  const runPendingClear = useCallback(async () => {
    if (!pendingClear) return;
    const label = pendingClear.title;
    try {
      await pendingClear.run();
      setClearDoneLabel(label);
      setTimeout(() => setClearDoneLabel(null), 3000);
    } catch (err) {
      console.error('Sheet clear failed:', err);
    }
    setPendingClear(null);
  }, [pendingClear]);

  // クリア対象（読み込まれているデータに応じて表示）
  const clearItems = [
    isTeamImported && {
      key: 'team-bracket',
      label: '団体戦：決勝トーナメント',
      desc: '順位トーナメントの試合・結果を削除（予選リーグ・チームは保持）',
      message: '団体戦の決勝トーナメント（順位トーナメント）のデータを削除します。\n\n予選リーグの結果・チーム構成は保持されます。\nこの操作は取り消せません。',
      run: () => useTeamStore.getState().clearBrackets(),
    },
    isTeamImported && {
      key: 'team-league',
      label: '団体戦：予選リーグ結果',
      desc: '予選リーグのスコアをすべて消去（対戦表・チームは保持）',
      message: '団体戦の予選リーグの結果（スコア）をすべて削除します。\n\n対戦表・チーム構成は保持されます。\nこの操作は取り消せません。',
      run: () => useTeamStore.getState().clearLeagueResults(),
    },
    isMixedImported && {
      key: 'mixed-bracket',
      label: 'ミックス：決勝トーナメント',
      desc: '決勝トーナメントの試合・結果を削除（予選リーグは保持）',
      message: 'ミックスの決勝トーナメントのデータを削除します。\n\n予選リーグの結果は保持されます。\nこの操作は取り消せません。',
      run: () => useMixedStore.getState().clearBrackets(),
    },
    isMixedImported && {
      key: 'mixed-league',
      label: 'ミックス：予選リーグ結果',
      desc: '予選リーグのスコアをすべて消去（対戦表は保持）',
      message: 'ミックスの予選リーグの結果（スコア）をすべて削除します。\n\n対戦表は保持されます。\nこの操作は取り消せません。',
      run: () => useMixedStore.getState().clearLeagueResults(),
    },
    hasDrawData && {
      key: 'draws',
      label: 'シングルス/ダブルス：対戦表・試合結果',
      desc: 'ドロー（対戦表）と試合結果を削除（エントリー・選手は保持）',
      message: 'シングルス/ダブルスの対戦表（ドロー）と試合結果を削除します。\n\nエントリー・選手データは保持されます。\nこの操作は取り消せません。',
      run: async () => {
        await db.transaction('rw', [db.draws, db.matches], async () => {
          await db.draws.clear();
          await db.matches.clear();
        });
      },
    },
  ].filter(Boolean) as { key: string; label: string; desc: string; message: string; run: () => void | Promise<void> }[];

  // 全データリセット
  const handleResetAll = useCallback(async () => {
    setShowResetConfirm(false);
    try {
      await db.transaction('rw', [db.tournaments, db.players, db.events, db.entries, db.draws, db.matches, db.courts], async () => {
        await db.tournaments.clear();
        await db.players.clear();
        await db.events.clear();
        await db.entries.clear();
        await db.draws.clear();
        await db.matches.clear();
        await db.courts.clear();
      });
      // Zustand store リセット
      useAppStore.getState().setCurrentTournamentId(null);
      useAppStore.getState().setImportedSchedule([]);
      useAppStore.getState().setScheduleFileName('');
      useAppStore.getState().setScheduleSlots([]);
      useAppStore.getState().setAllScheduleMatches([]);
      // ミックス大会データもリセット
      useMixedStore.getState().resetAll();
      // 団体戦データもリセット
      useTeamStore.getState().resetAll();
      setResetDone(true);
      setTimeout(() => setResetDone(false), 3000);
    } catch (err) {
      console.error('Reset failed:', err);
    }
  }, []);


  return (
    <div className="container sk-page ps-data">
      {/* ミックス大会情報 */}
      {isMixedImported && <MixedTournamentInfoSection />}

      {/* Excelデータビューア */}
      {isMixedImported && <MixedExcelViewer />}

      {/* 団体戦 大会情報 */}
      {isTeamImported && <TeamTournamentInfoSection />}

      {/* 大会データ読込パネル（Excelボタン方式） */}
      <section className="sk-sec ps-card">
        <button
          onClick={() => setDataImportOpen(!dataImportOpen)}
          className="sk-sec__head ps-card__head"
          aria-expanded={dataImportOpen}
        >
          <span className="sk-sec__mark" aria-hidden="true" />
          <span className="sk-sec__titles">
            <span className="sk-sec__en">EXCEL IMPORT</span>
            <span className="sk-sec__title">Excel から端末に直接取り込む</span>
            <span className="sk-sec__lead">ミックスダブルス・団体戦・時間割の Excel など。ふつうの大会は「大会選択」から</span>
          </span>
          <span className="ps-card__ico" aria-hidden="true"><FileSpreadsheet /></span>
          {dataImportOpen
            ? <ChevronDown className="ps-card__chev is-open" aria-hidden="true" />
            : <ChevronRight className="ps-card__chev is-open" aria-hidden="true" />}
        </button>
        {dataImportOpen && (
          <div className="sk-sec__body ps-data__import">
            <DataImport externalTournamentExcel={null} externalScheduleExcel={null} wizardAutoImport={null} />
          </div>
        )}
      </section>

      {/* テスト用スコア一括入力（動作確認用・観戦用ページには表示しない） */}
      {hasIndividualMatches && (
        <section className="sk-sec">
          <div className="sk-sec__head">
            <span className="sk-sec__mark" aria-hidden="true" />
            <div className="sk-sec__titles">
              <p className="sk-sec__en">TEST SCORE</p>
              <h2 className="sk-sec__title">テスト用スコア一括入力</h2>
              <p className="sk-sec__lead">
                全種目（トーナメント・リーグ）の試合に 8-4 / 6-4 のスコアを決勝まで入力します。動作確認用で、既存のスコアは上書きされます。
              </p>
            </div>
            <div className="sk-sec__actions ps-data__act">
              <button
                onClick={() => setShowTestScoreConfirm(true)}
                disabled={testScoreRunning || !currentTournamentId}
                className="btn btn--outline sk-btn"
              >
                <FlaskConical className="w-4 h-4" />
                {testScoreRunning ? '入力中...' : 'テストスコア入力'}
              </button>
            </div>
          </div>
          {testScoreResult && (
            <div className="sk-sec__body">
              <p className="ps-msg">{testScoreResult}</p>
            </div>
          )}
        </section>
      )}

      {/* シート別データクリア */}
      {clearItems.length > 0 && (
        <section className="sk-sec">
          <div className="sk-sec__head">
            <span className="sk-sec__mark" aria-hidden="true" />
            <div className="sk-sec__titles">
              <p className="sk-sec__en">CLEAR BY SHEET</p>
              <h2 className="sk-sec__title">シート別データクリア</h2>
              <p className="sk-sec__lead">決勝トーナメントなど、区分ごとにデータを個別に削除できます</p>
            </div>
            <Eraser className="ps-data__headico" aria-hidden="true" />
          </div>
          <div className="sk-sec__body">
            <ul className="ps-clear">
              {clearItems.map(item => (
                <li key={item.key} className="ps-clear__item">
                  <div className="ps-clear__text">
                    <p className="ps-clear__label">{item.label}</p>
                    <p className="ps-clear__desc">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => setPendingClear({ title: item.label, message: item.message, run: item.run })}
                    className="btn btn--outline sk-btn sk-btn--sm ps-clear__btn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    クリア
                  </button>
                </li>
              ))}
            </ul>
            {clearDoneLabel && (
              <p className="ps-msg ps-data__done">「{clearDoneLabel}」をクリアしました</p>
            )}
          </div>
        </section>
      )}

      {/* 全データリセット */}
      <section className="sk-sec ps-danger">
        <div className="sk-sec__head">
          <span className="sk-sec__mark" aria-hidden="true" />
          <div className="sk-sec__titles">
            <p className="sk-sec__en">RESET ALL</p>
            <h2 className="sk-sec__title">全データリセット</h2>
            <p className="sk-sec__lead">大会・エントリー・対戦表・試合結果・コート設定・時間割をすべて削除します</p>
          </div>
          <div className="sk-sec__actions ps-data__act">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="btn btn--outline sk-btn ps-danger__btn"
            >
              <AlertTriangle className="w-4 h-4" />
              リセット
            </button>
          </div>
        </div>
        {resetDone && (
          <div className="sk-sec__body">
            <p className="ps-msg">全データをリセットしました</p>
          </div>
        )}
      </section>

      {/* リセット確認ダイアログ */}
      <ConfirmDialog
        open={showResetConfirm}
        title="全データリセット"
        message={"以下のデータをすべて削除します：\n\n・大会情報\n・選手データ\n・エントリー\n・ドロー・対戦表\n・試合結果\n・コート設定\n・時間割\n\nふりがな・所属辞書は保持されます。\nこの操作は取り消せません。"}
        danger
        confirmLabel="リセット実行"
        onConfirm={handleResetAll}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* テストスコア入力の確認ダイアログ */}
      <ConfirmDialog
        open={showTestScoreConfirm}
        title="テスト用スコアを入力"
        message={"全種目（トーナメント・リーグ）の試合に、決勝までテスト用のスコアを入力します。\n\n・スコアは 8-4 / 6-4（種目のゲーム数に応じて）\n・トーナメントは勝者を次の回戦へ繰り上げます\n・既存のスコア・勝敗はすべて上書きされます\n\n動作確認用の機能です。実際の大会データがある場合は実行しないでください。"}
        danger
        confirmLabel="入力する"
        onConfirm={handleFillTestScores}
        onCancel={() => setShowTestScoreConfirm(false)}
      />

      {/* シート別クリア確認ダイアログ */}
      <ConfirmDialog
        open={pendingClear !== null}
        title={pendingClear ? `${pendingClear.title} をクリア` : ''}
        message={pendingClear?.message ?? ''}
        danger
        confirmLabel="クリア実行"
        onConfirm={runPendingClear}
        onCancel={() => setPendingClear(null)}
      />
    </div>
  );
}
