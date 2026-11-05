import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { CalendarDays, Plus, Trash2, MapPin } from 'lucide-react';
import { siteConfirm } from '../../components/site/siteConfirm';
import { SkPage, SkSection, SkEmpty } from '../../components/site/Kit';

export default function CourtSchedule() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const [newCourtName, setNewCourtName] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const courts = useLiveQuery(
    () => currentTournamentId ? db.courts.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  const matches = useLiveQuery(
    () => selectedEventId ? db.matches.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  const sortedCourts = useMemo(() => [...courts].sort((a, b) => a.order - b.order), [courts]);

  const courtMatchMap = useMemo(() => {
    const map: Record<string, typeof matches> = {};
    for (const c of courts) {
      map[c.courtId] = matches
        .filter(m => m.courtId === c.courtId)
        .sort((a, b) => {
          if (a.scheduledTime && b.scheduledTime) {
            const cmp = a.scheduledTime.localeCompare(b.scheduledTime);
            if (cmp !== 0) return cmp;
          }
          return a.matchOrder - b.matchOrder;
        });
    }
    return map;
  }, [courts, matches]);

  const unassignedMatches = useMemo(
    () => matches.filter(m => !m.courtId && m.player1Name && m.player2Name && m.status !== 'walkover')
      .sort((a, b) => a.matchOrder - b.matchOrder),
    [matches]
  );

  // 時間割インポート済みかどうか
  const hasImportedSchedule = useMemo(
    () => matches.some(m => m.scheduledTime && m.courtId),
    [matches]
  );

  const handleAddCourt = async () => {
    if (!newCourtName.trim() || !currentTournamentId) return;
    const courtId = `C-${Date.now()}`;
    await db.courts.add({
      tournamentId: currentTournamentId,
      courtId,
      name: newCourtName.trim(),
      surface: '',
      isAvailable: true,
      currentMatchId: null,
      order: courts.length + 1
    });
    setNewCourtName('');
  };

  const handleDeleteCourt = async (id: number) => {
    if (!(await siteConfirm('このコートを削除しますか？'))) return;
    await db.courts.delete(id);
  };

  const handleToggleAvailable = async (id: number, current: boolean) => {
    await db.courts.update(id, { isAvailable: !current });
  };

  const handleAssignMatch = async (matchId: string, courtId: string) => {
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    await db.matches.update(match.id, { courtId: courtId || null, updatedAt: Date.now() });
  };

  const handleSetTime = async (matchId: string, time: string) => {
    const match = matches.find(m => m.matchId === matchId);
    if (!match?.id) return;
    await db.matches.update(match.id, { scheduledTime: time || null, updatedAt: Date.now() });
  };

  const statusColor: Record<string, string> = {
    waiting: 'op-st--waiting',
    ready: 'op-st--ready',
    playing: 'op-st--playing',
    finished: 'op-st--finished',
    walkover: 'op-st--walkover',
  };

  return (
    <SkPage wide className="op-cs">
      <SkSection
        en="COURTS & SCHEDULE"
        title={<><CalendarDays className="w-5 h-5 op-cs__ico" />コート・時間割</>}
        lead={<>
          コートの登録と試合のコート割り当て・時間管理を行います。
          {hasImportedSchedule && (
            <span className="op-cs__imported">（インポート済みスケジュールあり）</span>
          )}
        </>}
        actions={
          <select
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            className="input sk-input op-cs__select"
            aria-label="種目"
          >
            <option value="">-- 種目を選択 --</option>
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>{e.name}</option>
            ))}
          </select>
        }
      />

      <div className="op-cs__layout">
        {/* 左: コート管理 */}
        <div className="op-cs__side">
          <SkSection en="COURTS" title={<><MapPin className="w-4 h-4 op-cs__ico" />コート管理</>} count={sortedCourts.length ? `${sortedCourts.length}面` : undefined}>
            <div className="op-cs__add">
              <input
                type="text"
                placeholder="コート名 (例: A-1)"
                value={newCourtName}
                onChange={e => setNewCourtName(e.target.value)}
                className="input sk-input"
                onKeyDown={e => e.key === 'Enter' && handleAddCourt()}
              />
              <button
                onClick={handleAddCourt}
                disabled={!newCourtName.trim() || !currentTournamentId}
                className="btn btn--primary sk-btn op-cs__addbtn"
                aria-label="コートを追加"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {sortedCourts.length > 0 ? (
              <ul className="sk-list op-cs__courts">
                {sortedCourts.map(c => (
                  <li key={c.courtId}>
                    <button
                      onClick={() => c.id && handleToggleAvailable(c.id, c.isAvailable)}
                      className={`op-cs__toggle ${c.isAvailable ? 'is-on' : 'is-off'}`}
                      title={c.isAvailable ? '利用可能' : '使用不可'}
                      aria-label={`${c.name}：${c.isAvailable ? '利用可能' : '使用不可'}`}
                    />
                    <span className="op-cs__cname">{c.name}</span>
                    <span className="op-cs__cstate">{c.isAvailable ? '利用可能' : '使用不可'}</span>
                    <button
                      onClick={() => c.id && handleDeleteCourt(c.id)}
                      className="op-ibtn op-cs__del"
                      aria-label={`${c.name}を削除`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="op-cs__none">コートが未登録です</p>
            )}
          </SkSection>

          {/* 未割当試合 */}
          {selectedEventId && unassignedMatches.length > 0 && (
            <SkSection en="UNASSIGNED" title="未割当の試合" count={unassignedMatches.length} flush>
              <ul className="sk-list op-cs__unassigned">
                {unassignedMatches.map(m => (
                  <li key={m.matchId}>
                    <span className="op-cs__no">#{m.matchOrder}</span>
                    <p className="op-cs__vs">{m.player1Name} vs {m.player2Name}</p>
                    <select
                      value={m.courtId || ''}
                      onChange={e => handleAssignMatch(m.matchId, e.target.value)}
                      className="input op-cs__mini"
                      aria-label="コートを割り当てる"
                    >
                      <option value="">割当</option>
                      {sortedCourts.filter(c => c.isAvailable).map(c => (
                        <option key={c.courtId} value={c.courtId}>{c.name}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </SkSection>
          )}
        </div>

        {/* 右: コート別スケジュール */}
        <div className="op-cs__main">
          {sortedCourts.length > 0 && selectedEventId ? (
            <div className="op-cs__grid">
              {sortedCourts.map(c => {
                const courtMatches = courtMatchMap[c.courtId] || [];
                return (
                  <section key={c.courtId} className={`sk-sec op-cs__court ${c.isAvailable ? '' : 'is-off'}`}>
                    <div className="op-cs__court-head">
                      <span className={`op-cs__dot ${c.isAvailable ? 'is-on' : 'is-off'}`} />
                      <h3>{c.name}</h3>
                      <span className="op-cs__count">{courtMatches.length}試合</span>
                    </div>
                    <div className="op-cs__court-body">
                      {courtMatches.length > 0 ? <ul className="sk-list">{courtMatches.map(m => (
                        <li key={m.matchId} className="op-cs__m">
                          <div className="op-cs__m-top">
                            <span className="op-cs__no">#{m.matchOrder}</span>
                            <input
                              type="time"
                              value={m.scheduledTime || ''}
                              onChange={e => handleSetTime(m.matchId, e.target.value)}
                              className="input op-cs__mini op-cs__time"
                              aria-label="開始時刻"
                            />
                            <span className={`op-st ${statusColor[m.status] || ''}`}>
                              {m.status === 'playing' ? '試合中' : m.status === 'finished' ? '終了' : m.status === 'ready' ? '準備完了' : '待機'}
                            </span>
                          </div>
                          <p className="op-cs__vs"><b>{m.player1Name}</b> <span>vs</span> <b>{m.player2Name}</b></p>
                          {m.score && <p className="op-cs__score">{m.score}</p>}
                        </li>
                      ))}</ul> : (
                        <p className="op-cs__none">割り当てなし</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <SkEmpty
              icon={CalendarDays}
              title={sortedCourts.length === 0
                ? '左パネルからコートを登録してください'
                : '種目を選択すると試合のスケジュール管理ができます'
              }
            />
          )}
        </div>
      </div>
    </SkPage>
  );
}
