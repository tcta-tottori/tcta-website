// =============================================================================
// 選手名の修正ポップアップ
//
// エントリー確定後（対戦表を作ったあと）でも、ドロー画面から氏名・ふりがな・所属を
// 直せるようにするためのダイアログ。取り込んだドロー表の誤字や、当日の選手変更に使う。
// 保存すると選手マスタと、対戦表に写してある名前の両方を更新する。
// =============================================================================

import { useState } from 'react';
import { UserPen, X } from 'lucide-react';
import type { Player } from '../../db/database';
import { updatePlayerProfile } from '../../features/draw/playerNameEdit';

export interface PlayerNameTarget {
  /** ドロー番号（表示用） */
  drawNumber?: number;
  /** 修正対象の選手（ダブルスは2人） */
  players: Player[];
}

interface Props {
  target: PlayerNameTarget;
  onClose: () => void;
  /** 保存後に呼ばれる（対戦表の再読込などに使う） */
  onSaved?: () => void;
}

type Form = { playerId: string; name: string; furigana: string; affiliation: string };

export default function PlayerNameDialog({ target, onClose, onSaved }: Props) {
  const [forms, setForms] = useState<Form[]>(
    target.players.map(p => ({
      playerId: p.playerId,
      name: p.name,
      furigana: p.furigana || '',
      affiliation: p.affiliation || '',
    })),
  );
  const [saving, setSaving] = useState(false);

  const patch = (i: number, next: Partial<Form>) =>
    setForms(prev => prev.map((f, idx) => (idx === i ? { ...f, ...next } : f)));

  const handleSave = async () => {
    if (forms.some(f => !f.name.trim())) {
      alert('氏名を入力してください。');
      return;
    }
    setSaving(true);
    try {
      await updatePlayerProfile(forms);
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center psd-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="psd-panel psd-panel--sm psd-panel--flex" onClick={e => e.stopPropagation()}>
        <div className="sdlg__head psd-head">
          <span className="sec-head__mark sdlg__mark" aria-hidden="true" />
          <div className="sdlg__heading">
            <p className="sdlg__eyebrow">PLAYER</p>
            <h3 className="sdlg__title"><UserPen className="w-5 h-5 text-primary-600" />選手名の修正</h3>
            <p className="psd-lead">
              {target.drawNumber ? `ドロー番号 ${target.drawNumber}` : 'エントリー確定後でも修正できます'}
            </p>
          </div>
          <button onClick={onClose} className="sdlg__close" aria-label="閉じる">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="psd-body space-y-3 max-h-[60vh] overflow-auto">
          {forms.map((f, i) => (
            <div key={f.playerId} className="psd-box space-y-2">
              {forms.length > 1 && (
                <div className="text-[10px] font-bold text-gray-500">{i === 0 ? '選手1' : '選手2（ペア）'}</div>
              )}
              <div>
                <label className="text-[10px] text-gray-500 font-medium">氏名</label>
                <input
                  type="text"
                  value={f.name}
                  onChange={e => patch(i, { name: e.target.value })}
                  placeholder="山田 太郎"
                  className="w-full text-sm px-2.5 py-1.5 psd-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">ふりがな（コール用）</label>
                  <input
                    type="text"
                    value={f.furigana}
                    onChange={e => patch(i, { furigana: e.target.value })}
                    placeholder="やまだ たろう"
                    className="w-full text-sm px-2.5 py-1.5 psd-input"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium">所属</label>
                  <input
                    type="text"
                    value={f.affiliation}
                    onChange={e => patch(i, { affiliation: e.target.value })}
                    placeholder="◯◯テニスクラブ"
                    className="w-full text-sm px-2.5 py-1.5 psd-input"
                  />
                </div>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-gray-500 leading-snug">
            保存すると、ドロー・対戦表・コールの表示がすべて新しい名前に変わります
            （同じ選手が出ている他の種目にも反映されます）。
          </p>
        </div>

        <div className="psd-actions psd-actions--line">
          <button
            onClick={onClose}
            className="btn btn--outline psd-btn"
          >
            キャンセル
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="btn btn--primary psd-btn"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
