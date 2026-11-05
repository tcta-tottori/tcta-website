import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { sortEventsByClass } from '../data/eventOrder';
import { useAppStore } from '../../stores/appStore';
import { DrawEngine } from './DrawEngine';
import type { DrawEntry } from './DrawEngine';
import { Dices, Save, RefreshCw, Users } from 'lucide-react';
import { SkPage, SkSection, SkEmpty } from '../../components/site/Kit';

export default function DrawGenerator() {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const setCurrentTournamentId = useAppStore(state => state.setCurrentTournamentId);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [generatedDraw, setGeneratedDraw] = useState<{ draw: DrawEntry[], drawSize: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const rawEvents = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];
  // クラスは「男子→女子」「アルファベット→年齢」の順に並べる
  const events = useMemo(() => sortEventsByClass(rawEvents), [rawEvents]);

  const entries = useLiveQuery(
    () => selectedEventId ? db.entries.where('eventId').equals(selectedEventId).toArray() : [],
    [selectedEventId]
  ) || [];

  const players = useLiveQuery(() => db.players.toArray()) || [];

  const currentEvent = useMemo(() => events.find(e => e.eventId === selectedEventId), [events, selectedEventId]);
  const activeEntries = useMemo(() => entries.filter(e => e.status === 'active'), [entries]);

  const savedDraw = useLiveQuery(
    () => selectedEventId ? db.draws.where('eventId').equals(selectedEventId).first() : undefined,
    [selectedEventId]
  );

  const handleGenerateDraw = () => {
    if (!currentEvent || activeEntries.length === 0) return;

    const playersForDraw = activeEntries.map(entry => {
      const p1 = players.find(p => p.playerId === entry.playerId);
      const isDoubles = !!entry.partnerId;
      const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;

      const name = isDoubles && p1 && p2 ? `${p1.name} / ${p2.name}` : (p1?.name || 'Unknown');
      const furigana = isDoubles && p1 && p2 ? `${p1.furigana} / ${p2.furigana}` : (p1?.furigana || '');

      let affiliation = p1?.affiliation || '';
      if (isDoubles && p2 && p2.affiliation && p2.affiliation !== p1?.affiliation) {
        affiliation = `${p1?.affiliation} / ${p2.affiliation}`;
      }

      return {
        entryId: entry.entryId,
        playerId: entry.playerId,
        name,
        furigana,
        affiliation,
        points: entry.rankPoint || 0,
        id: p1?.id,
        rankings: p1?.rankings || {},
        isManual: p1?.isManual || false,
      };
    });

    const result = DrawEngine.generateDraw(playersForDraw as unknown as Parameters<typeof DrawEngine.generateDraw>[0]);
    setGeneratedDraw(result);
  };

  const handleSaveDraw = async () => {
    if (!selectedEventId || !generatedDraw) return;
    setIsSaving(true);
    try {
      const existing = await db.draws.where('eventId').equals(selectedEventId).first();

      const drawData = {
        eventId: selectedEventId,
        drawSize: generatedDraw.drawSize,
        slots: generatedDraw.draw.map(d => ({
          position: d.position,
          entryId: d.entryId,
          seed: d.seed,
          isBye: d.isBye
        })),
        updatedAt: Date.now()
      };

      if (existing && existing.id) {
        await db.draws.update(existing.id, drawData);
      } else {
        await db.draws.add(drawData);
      }

      alert('ドローを保存しました。');
      setGeneratedDraw(null);
    } catch (error) {
      console.error('ドロー保存エラー:', error);
      alert('保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInsertTestData = async () => {
    try {
      const tId = currentTournamentId || 'T-TEST-001';
      const eId = 'E-MS-TEST';
      await db.events.put({
        tournamentId: tId,
        eventId: eId,
        name: '[テスト] 男子シングルス',
        type: 'Singles',
        gameRules: { sets: 1, games: 6, deuce: true, tiebreakPoint: 7 }
      });

      const testPlayers = [];
      const testEntries = [];
      for(let i=1; i<=12; i++) {
        const team = i <= 4 ? 'A-Team' : (i <= 8 ? 'B-Team' : 'C-Team');
        const pId = `P-TEST-${i}`;
        testPlayers.push({
          playerId: pId,
          name: `テスト選手 ${i}`,
          furigana: `テストセンシュ ${i}`,
          affiliation: team,
          rankings: { [eId]: 1000 - i * 10 },
          isManual: false
        });
        testEntries.push({
          eventId: eId,
          entryId: `EN-TEST-${i}`,
          playerId: pId,
          rankPoint: 1000 - i * 10,
          status: 'active' as const
        });
      }
      await db.players.bulkPut(testPlayers);
      await db.entries.bulkPut(testEntries);

      setCurrentTournamentId(tId);

      alert('テスト用データを投入しました！対象種目プルダウンから「[テスト] 男子シングルス」を選択してください。');
      setSelectedEventId(eId);
    } catch(err) {
      console.error(err);
      alert('テストデータ投入失敗');
    }
  };

  return (
    <SkPage className="ent-draw">
      <SkSection
        en="Draw Lot"
        title="抽選・ドロー作成"
        accent
        lead="対象種目を選択し、シード配置・同所属分離を考慮したドローを自動生成します。"
        actions={import.meta.env.DEV ? (
          <button
            onClick={handleInsertTestData}
            className="btn btn--outline sk-btn sk-btn--sm"
            title="テスト用データをDBに投入"
          >
            [DEBUG] テストデータ投入
          </button>
        ) : undefined}
      >
        <div className="ent-draw__pick">
          <label className="sk-field ent-draw__field">
            対象種目
            <select
              value={selectedEventId}
              onChange={e => {
                setSelectedEventId(e.target.value);
                setGeneratedDraw(null);
              }}
              className="input sk-input"
            >
              <option value="">-- 種目を選択 --</option>
              {events.map(e => (
                <option key={e.eventId} value={e.eventId}>{e.name} ({e.type})</option>
              ))}
            </select>
          </label>
          {selectedEventId && currentEvent && (
            <div className="ent-draw__status">
              <span className="ent-draw__count">
                <Users className="w-4 h-4" />
                有効エントリー数 <b>{activeEntries.length}</b><small>組</small>
              </span>
              {savedDraw ? (
                <span className="sk-chip sk-chip--red"><Save className="w-3.5 h-3.5" />保存済みドローあり</span>
              ) : (
                <span className="sk-chip">未抽選</span>
              )}
            </div>
          )}
        </div>
        {selectedEventId && currentEvent && (
          <div className="sk-btns ent-draw__btns">
            <button
              onClick={handleGenerateDraw}
              disabled={activeEntries.length === 0}
              className="btn btn--primary sk-btn sk-btn--lg"
            >
              <RefreshCw className="w-4 h-4" />
              {savedDraw || generatedDraw ? '再抽選を実行' : '抽選を実行する'}
            </button>

            {(generatedDraw || savedDraw) && (
              <button
                onClick={handleSaveDraw}
                disabled={!generatedDraw || isSaving}
                className="btn btn--outline sk-btn sk-btn--lg"
              >
                <Save className="w-4 h-4" />
                {isSaving ? '保存中...' : '確定して保存'}
              </button>
            )}
          </div>
        )}
      </SkSection>

      {selectedEventId && currentEvent ? (
        generatedDraw ? (
          <SkSection en="Preview" title="ドロー生成プレビュー" count={`サイズ ${generatedDraw.drawSize}`} flush>
            <div className="sk-table-wrap">
              <table className="sk-table ent-draw__table">
                <thead>
                  <tr>
                    <th className="ent-draw__no">No.</th>
                    <th>シード</th>
                    <th>選手名 / ペア名</th>
                    <th>所属</th>
                    <th className="ent-draw__pt">ポイント</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedDraw.draw.map((d, index) => {
                    const isMatchBottom = index % 2 === 1;

                    return (
                      <tr
                        key={index}
                        className={`${d.isBye ? 'is-bye' : ''} ${isMatchBottom ? 'is-pair-end' : ''}`}
                      >
                        <td className="ent-draw__no">{d.position}</td>
                        <td>
                          {d.seed > 0 ? <span className="ent-seed">{d.seed}</span> : null}
                        </td>
                        <td className="ent-draw__name">
                          {d.isBye ? 'BYE' : d.name}
                        </td>
                        <td className="ent-draw__aff">{d.affiliation}</td>
                        <td className="ent-draw__pt">{d.isBye ? '-' : (d.points > 0 ? d.points : 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SkSection>
        ) : (
          <SkEmpty
            icon={Dices}
            title="ドローを作成しましょう"
            text="「抽選を実行する」ボタンを押すと、JTAルールに則ったシード配置・BYE均等分散と、同所属分離を自動計算したドロー表が生成されます。"
          />
        )
      ) : (
        <SkEmpty icon={Dices} title="上部のドロップダウンから対象種目を選択してください" />
      )}
    </SkPage>
  );
}
