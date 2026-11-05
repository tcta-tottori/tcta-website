import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { Upload, FileSpreadsheet, X, CheckCircle2, RefreshCw } from 'lucide-react';
import type { Player, Event } from '../../db/database';

interface ImportRow {
  rawName: string;
  rawAffiliation: string;
  rawEventName: string;
  matchedPlayerId: string | null;
  matchedEventId: string | null;
  status: 'matched' | 'partial' | 'unmatched';
  selected: boolean;
  points: number;
  // ダブルス用フィールド
  rawPartnerName: string;
  rawPartnerAffiliation: string;
  matchedPartnerId: string | null;
  isDoubles: boolean;
}

interface EntryImportProps {
  onClose: () => void;
}

export default function EntryImport({ onClose }: EntryImportProps) {
  const currentTournamentId = useAppStore(state => state.currentTournamentId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; matched: number; partial: number } | null>(null);

  // マスタデータの取得
  const players = useLiveQuery(() => db.players.toArray()) || [];
  const events = useLiveQuery(
    () => currentTournamentId ? db.events.where('tournamentId').equals(currentTournamentId).toArray() : [],
    [currentTournamentId]
  ) || [];

  // 比較用マップ作成
  const playerMapByName = new Map<string, Player>(players.map(p => [p.name.trim().toLowerCase(), p]));
  const eventMapByName = new Map<string, Event>(events.map(e => [e.name.trim().toLowerCase(), e]));

  // 名前の正規化（スペース除去・小文字化）
  const normalizeName = (name: string) => name.toLowerCase().replace(/[\u3000\s]/g, '');

  // 選手の照合
  const findPlayer = (rawName: string): Player | null => {
    const normalized = normalizeName(rawName);
    const found = Array.from(playerMapByName.entries()).find(
      ([name]) => name.replace(/[\u3000\s]/g, '') === normalized
    );
    return found ? found[1] : null;
  };

  const processExcelData = (buffer: ArrayBuffer) => {
    try {
      setIsProcessing(true);
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

      let startIndex = 0;
      if (rows.length > 0 && Array.isArray(rows[0])) {
        const firstCell = String(rows[0][0] || '').toLowerCase();
        if (firstCell.includes('氏名') || firstCell.includes('名前') || firstCell === 'name') {
          startIndex = 1; // ヘッダースキップ
        }
      }

      const parsedRows: ImportRow[] = [];
      let matchCount = 0;
      let partialCount = 0;

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;

        const rawName = String(row[0]).trim();
        const rawAffiliation = row[1] ? String(row[1]).trim() : '';
        const rawEventName = row[2] ? String(row[2]).trim() : '';
        const rawPartnerName = row[3] ? String(row[3]).trim() : '';
        const rawPartnerAffiliation = row[4] ? String(row[4]).trim() : '';

        if (!rawName) continue;

        // 選手1の照合
        const player1 = findPlayer(rawName);
        const matchedPlayerId = player1?.playerId || null;

        // 種目の照合
        const matchedEvent = eventMapByName.get(rawEventName.toLowerCase()) || null;
        const matchedEventId = matchedEvent?.eventId || null;

        // ダブルス判定: パートナー名があるか、または種目タイプがDoubles
        const isDoubles = !!rawPartnerName || (matchedEvent?.type === 'Doubles');

        // パートナーの照合
        let matchedPartnerId: string | null = null;
        if (isDoubles && rawPartnerName) {
          const partner = findPlayer(rawPartnerName);
          matchedPartnerId = partner?.playerId || null;
        }

        // ポイント計算
        let points = 0;
        if (player1) {
          points += player1.rankings[rawEventName] || 0;
        }
        if (isDoubles && matchedPartnerId) {
          const partner = players.find(p => p.playerId === matchedPartnerId);
          if (partner) {
            points += partner.rankings[rawEventName] || 0;
          }
        }

        // ステータス判定
        let status: 'matched' | 'partial' | 'unmatched';
        if (!matchedPlayerId) {
          status = 'unmatched';
        } else if (isDoubles && rawPartnerName && !matchedPartnerId) {
          status = 'partial';
          partialCount++;
        } else if (!matchedEventId) {
          status = 'partial';
          partialCount++;
        } else {
          status = 'matched';
          matchCount++;
        }

        parsedRows.push({
          rawName,
          rawAffiliation,
          rawEventName,
          matchedPlayerId,
          matchedEventId,
          status,
          selected: true,
          points,
          rawPartnerName,
          rawPartnerAffiliation,
          matchedPartnerId,
          isDoubles,
        });
      }

      setImportRows(parsedRows);
      setSummary({ total: parsedRows.length, matched: matchCount, partial: partialCount });
    } catch (e) {
      console.error(e);
      alert('ファイルの解析に失敗しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
         processExcelData(ev.target.result as ArrayBuffer);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // リセット
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.csv'))) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) processExcelData(ev.target.result as ArrayBuffer);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleRegister = async () => {
    if (!currentTournamentId) return;
    setIsProcessing(true);

    try {
      const toInsert = importRows.filter(r => r.selected);
      let successCount = 0;
      let errorCount = 0;

      for (const row of toInsert) {
        // マッチしていない場合はスキップ
        if (!row.matchedPlayerId || !row.matchedEventId) {
             errorCount++;
             continue;
        }

        // ダブルスでパートナー未照合の場合もスキップ
        if (row.isDoubles && row.rawPartnerName && !row.matchedPartnerId) {
             errorCount++;
             continue;
        }

        // 重複チェック
        const existing = await db.entries.where({
            eventId: row.matchedEventId,
            playerId: row.matchedPlayerId
        }).first();

        if (existing) {
             errorCount++;
             continue;
        }

        await db.entries.add({
             eventId: row.matchedEventId,
             entryId: `EN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
             playerId: row.matchedPlayerId,
             partnerId: row.isDoubles ? (row.matchedPartnerId || undefined) : undefined,
             rankPoint: row.points,
             status: 'active'
        });
        successCount++;
      }

      alert(`${successCount}件のエントリーを登録しました。（失敗/スキップ: ${errorCount}件）`);
      onClose(); // モーダルを閉じる
    } catch (e) {
      console.error(e);
      alert('登録中にエラーが発生しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderStatusBadge = (row: ImportRow) => {
    if (row.status === 'matched' && row.matchedEventId) {
      return <span className="sk-chip ent-imp__chip">一致</span>;
    }
    if (row.status === 'partial') {
      return (
        <span className="sk-chip ent-imp__chip">
          {row.matchedPlayerId && row.isDoubles && !row.matchedPartnerId ? 'パートナー未一致' : '種目不一致'}
        </span>
      );
    }
    return <span className="sk-chip sk-chip--red ent-imp__chip">未登録選手</span>;
  };

  const renderPartnerStatusBadge = (row: ImportRow) => {
    if (!row.isDoubles || !row.rawPartnerName) return null;
    if (row.matchedPartnerId) {
      return <span className="sk-chip ent-imp__chip">一致</span>;
    }
    return <span className="sk-chip sk-chip--red ent-imp__chip">未登録</span>;
  };

  return (
    <div className="ent-imp" data-no-reveal role="dialog" aria-modal="true" aria-label="エントリーデータの一括インポート">
      <div className="ent-imp__panel">

        {/* Header */}
        <div className="sk-sec__head ent-imp__head">
          <span className="sk-sec__mark" aria-hidden="true" />
          <div className="sk-sec__titles">
            <p className="sk-sec__en">Import</p>
            <h2 className="sk-sec__title">
              <FileSpreadsheet className="w-5 h-5" />
              エントリーデータの一括インポート
            </h2>
          </div>
          <button onClick={onClose} className="hub-icon-btn" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="ent-imp__body">
          {!summary ? (
             <div
               className={`ent-imp__drop ${isDragOver ? 'is-over' : ''}`}
               onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
               onDragLeave={() => setIsDragOver(false)}
               onDrop={handleDrop}
             >
               <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
               <Upload className="ent-imp__ico" />
               <h3 className="ent-imp__title">Excel/CSVファイルをアップロード</h3>
               <p className="ent-imp__text">ここへファイルをドラッグ＆ドロップ、または下のボタンから選択</p>
               <button
                 onClick={() => fileInputRef.current?.click()}
                 className="btn btn--primary sk-btn sk-btn--lg"
               >
                 ファイルを選択
               </button>
               <div className="ent-imp__fmt">
                 <p className="ent-imp__fmt-title">【推奨フォーマット】</p>
                 <ul>
                   <li>1列目: 選手名 (必須)</li>
                   <li>2列目: 所属 (任意)</li>
                   <li>3列目: 種目名 (部分一致可, 例: "一般男子S")</li>
                   <li>4列目: パートナー名 (ダブルスの場合)</li>
                   <li>5列目: パートナー所属 (ダブルスの場合)</li>
                 </ul>
               </div>
             </div>
          ) : (
            <div className="ent-imp__result">
               {/* Summary Alert */}
               <div className="sk-note ent-imp__summary">
                 <CheckCircle2 className="w-5 h-5 shrink-0" />
                 <div>
                   <h4 className="ent-imp__sum-title">ファイルの読み込みが完了しました</h4>
                   <p>
                     全 {summary.total} 件中、
                     <strong>{summary.matched} 件</strong> が完全一致、
                     <strong>{summary.partial} 件</strong> が部分一致です。
                   </p>
                 </div>
               </div>

               {/* Table */}
               <div className="sk-table-wrap ent-imp__table">
                   <table className="sk-table">
                     <thead>
                       <tr>
                         <th className="ent-imp__chk">
                           <input type="checkbox"
                             checked={importRows.every(r => r.selected)}
                             onChange={e => setImportRows(importRows.map(r => ({ ...r, selected: e.target.checked })))}
                           />
                         </th>
                         <th>読込氏名</th>
                         <th>パートナー</th>
                         <th>種目（Excel）</th>
                         <th>照合ステータス</th>
                         <th>マスタ氏名・種目ID</th>
                       </tr>
                     </thead>
                     <tbody>
                       {importRows.map((row, idx) => (
                         <tr key={idx} className={row.selected ? '' : 'is-off'}>
                           <td className="ent-imp__chk">
                             <input type="checkbox"
                               checked={row.selected}
                               onChange={e => {
                                 const copy = [...importRows];
                                 copy[idx] = { ...copy[idx], selected: e.target.checked };
                                 setImportRows(copy);
                               }}
                             />
                           </td>
                           <td>
                             <div className="ent-imp__name">{row.rawName}</div>
                             <div className="ent-imp__sub">{row.rawAffiliation}</div>
                           </td>
                           <td>
                             {row.isDoubles && row.rawPartnerName ? (
                               <div>
                                 <div className="ent-imp__name">{row.rawPartnerName}</div>
                                 <div className="ent-imp__sub">{row.rawPartnerAffiliation}</div>
                                 <div className="mt-1">{renderPartnerStatusBadge(row)}</div>
                               </div>
                             ) : row.isDoubles ? (
                               <span className="ent-imp__sub">パートナー未指定</span>
                             ) : (
                               <span className="ent-imp__sub">-</span>
                             )}
                           </td>
                           <td>{row.rawEventName || '-'}</td>
                           <td>
                             {renderStatusBadge(row)}
                           </td>
                           <td className="ent-imp__ids">
                             <div>{row.matchedPlayerId || '-'}</div>
                             {row.isDoubles && row.matchedPartnerId && (
                               <div>Partner: {row.matchedPartnerId}</div>
                             )}
                             <div className="ent-imp__sub">{row.matchedEventId || '-'}</div>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
               </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ent-imp__foot">
          <button
            onClick={onClose}
            className="btn btn--outline sk-btn sk-btn--ghost"
          >
            キャンセル
          </button>
          <button
            onClick={handleRegister}
            disabled={!summary || importRows.filter(r => r.selected).length === 0 || isProcessing}
            className="btn btn--primary sk-btn"
          >
            {isProcessing ? (
               <><RefreshCw className="w-4 h-4 animate-spin" /> 処理中...</>
            ) : (
               <>選択したエントリーを登録</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
