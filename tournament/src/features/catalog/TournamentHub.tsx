// 大会を選ぶ（運営画面の入口）。
//
// ログインすると、Cloudflare の大会運営のデータベースにある大会が、協会サイトの大会情報と同じカードで並ぶ。
// 「運営をはじめる」を押すと、その大会（種目・ドロー・時刻・シード）が端末に入り、時間割も作ってエントリー受付に進む。
// ふりがな・所属の辞書はログインした時点で自動で取り込む（dictSync.ts）。ファイルを選ぶ操作は無い。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, BookOpen, ClipboardCheck, Bot, FileSpreadsheet, ListChecks, Loader2, MapPin, RefreshCw, RotateCcw, Users, FlaskConical } from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import { useOfficer } from '../auth/officer';
import { parseDrawExcel } from '../data/drawExcelParser';
import { cachedCatalog, dateParts, fetchCatalog, fetchTournament, putTournament, todayStart, type CatalogList, type CatalogTournament } from './catalogApi';
import { importToDevice, switchToLocal } from './deviceImport';
import { saveSnapshot } from '../backup/autoSave';
import { syncDictionary, useDictSync } from './dictSync';
import { drawEntry } from './fromExcel';
import CloudflareLogo from '../../components/ui/CloudflareLogo';
import { siteConfirm } from '../../components/site/siteConfirm';

type Filter = 'upcoming' | 'past' | 'all';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ready: { label: '運営できる', cls: 'badge--open' },
  planned: { label: 'ドロー未登録', cls: 'hub-badge--plan' },
  done: { label: '終了', cls: 'badge--muted' },
};

export default function TournamentHub() {
  const navigate = useNavigate();
  const officer = useOfficer();
  const dict = useDictSync();
  const currentTournamentId = useAppStore((s) => s.currentTournamentId);
  const [list, setList] = useState<CatalogList | null>(() => cachedCatalog()?.list ?? null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [busy, setBusy] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const localTournaments = useLiveQuery(() => db.tournaments.toArray(), [], []);

  const load = useCallback(async () => {
    try {
      setList(await fetchCatalog());
      setLoadState('ok');
    } catch (err) {
      setLoadError((err as Error).message);
      setLoadState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const localByCatalog = useMemo(() => {
    const m = new Map<string, { tournamentId: string; catalogUpdatedAt?: string; isTest?: boolean }>();
    for (const t of localTournaments ?? []) if (t.catalogId) m.set(t.catalogId, t);
    return m;
  }, [localTournaments]);

  const today = todayStart();
  const visible = useMemo(() => {
    const ts = (list?.tournaments ?? []).filter((t) => t.status !== 'planned' || t.date);
    const time = (t: CatalogTournament) => dateParts(t.date)?.time ?? Infinity;
    // これから：ドローを入れた（運営できる）大会だけ。日程だけの大会は「すべて」で見る
    if (filter === 'upcoming') return ts.filter((t) => time(t) >= today && t.status === 'ready').sort((a, b) => time(a) - time(b));
    if (filter === 'past') return ts.filter((t) => time(t) < today || t.status === 'done').sort((a, b) => time(b) - time(a));
    return [...ts].sort((a, b) => time(a) - time(b));
  }, [list, filter, today]);

  // 今日か、いちばん近い「運営できる」大会
  const next = useMemo(() => visible.find((t) => t.status === 'ready'), [visible]);
  const groups = useMemo(() => [{ key: 'all', title: '', items: visible }].filter((g) => g.items.length > 0), [visible]);

  const start = useCallback(async (t: CatalogTournament, mode: 'fresh' | 'resume' | 'direct' | 'test') => {
    setError(null);
    const local = localByCatalog.get(t.id);
    try {
      if (mode === 'resume' && local) {
        setBusy({ id: t.id, label: '切り替えています' });
        await switchToLocal(local.tournamentId);
      } else if (mode === 'test') {
        if (!(await siteConfirm({
          title: 'テストモードで試す',
          message: `「${t.name}」をテスト用に端末に入れて、エントリーから動きを試します。\n\n・運営中のデータは Cloudflare に自動保存しません\n・対戦順やデータ管理から、テスト用のスコアを自動で入れられます\n${local ? '\n※ この端末の今の運営データは消えます。' : ''}`,
          confirmLabel: 'テストモードではじめる',
        }))) return;
        setBusy({ id: t.id, label: 'テスト用に読み込んでいます' });
        const full = await fetchTournament(t.id);
        await importToDevice(full, (p) => setBusy({ id: t.id, label: p.label }), { test: true });
      } else if (mode === 'fresh') {
        // はじめる前に、ドロー・当たり方・名前を確認する画面へ（そこで直してから端末に入れる）
        navigate(`/data/review/${encodeURIComponent(t.id)}`);
        return;
      } else {
        if (local && !(await siteConfirm({
          title: '運営データをクリアして最初から',
          message: `この端末の「${t.name}」の運営データ（受付・試合結果・コート）を消して、データベースの内容で最初からやり直します。\n\n消す前の状態は Cloudflare に「クリア前_…」として残します（設定 → バックアップから戻せます）。`,
          confirmLabel: 'クリアして最初から', danger: true,
        }))) return;
        if (local) {
          setBusy({ id: t.id, label: '今の状態を保存しています' });
          try { await saveSnapshot('クリア前', t.name); } catch (err) {
            if (!(await siteConfirm({ title: '保存できませんでした', message: `今の状態を Cloudflare に残せませんでした（${(err as Error).message}）。このままクリアしますか？`, confirmLabel: 'クリアする', danger: true }))) return;
          }
        }
        setBusy({ id: t.id, label: '大会を読み込んでいます' });
        const full = await fetchTournament(t.id);
        await importToDevice(full, (p) => setBusy({ id: t.id, label: p.label }), { test: !!local?.isTest });
      }
      navigate('/entry');
    } catch (err) {
      setError({ id: t.id, message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }, [localByCatalog, navigate]);

  return (
    <div className="hub">
      <div className="container hub__inner">
        {/* ---- 見出し ---- */}
        <p className="hub__lead">
          協会の大会運営データベースにある大会です。「確認して運営をはじめる」を押すと、ドローの当たり方・名前・所属を確かめて直す画面になり、そこからこの端末に入れてエントリー受付に進みます。
        </p>

        <div className="hub__bar">
          <div className="hub-filter" role="tablist" aria-label="大会の絞り込み">
            {([['upcoming', 'これから'], ['past', '終わった大会'], ['all', 'すべて']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={`hub-filter__btn ${filter === k ? 'is-on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          <div className="hub__sync">
            <span className="hub-chip hub-chip--cf" title="大会とふりがな辞書は Cloudflare のデータベース（D1）に置いています">
              <CloudflareLogo className="w-4 h-4" /><span>Cloudflare</span>
            </span>
            <DictChip players={dict.players || list?.dict.players || 0} affiliations={dict.affiliations || list?.dict.affiliations || 0} status={dict.status} />
            <button className="hub-icon-btn" onClick={() => { setLoadState('loading'); void load(); void syncDictionary(); }} title="データベースから読み直す" aria-label="データベースから読み直す">
              <RefreshCw className={`w-4 h-4 ${loadState === 'loading' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loadState === 'error' && (
          <div className="hub-note hub-note--warn" role="status">
            {loadError}{list ? '\u3000前に読めた一覧を表示しています。' : ''}
          </div>
        )}

        {/* ---- 大会のカード ---- */}
        {!list && loadState === 'loading' ? (
          <ul className="tl__cards" aria-busy="true">
            {[0, 1, 2].map((i) => <li key={i} className="tl__card"><div className="tcard hub-card hub-card--skeleton" /></li>)}
          </ul>
        ) : visible.length === 0 ? (
          <div className="hub-empty">
            <ListChecks className="hub-empty__ico" />
            <p className="hub-empty__title">{filter === 'upcoming' ? 'ドローの入ったこれからの大会はありません' : '大会がありません'}</p>
            <p className="hub-empty__text">日程だけの大会は「すべて」で見られます。Claude に「○○大会のドローを入れて」と頼むか、下の「Excel から入れる」で登録できます。</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.key} className="hub-group">
              {g.title && <h3 className="hub-group__title">{g.title}<small>{g.items.length}</small></h3>}
              <ul className="tl__cards">
                {g.items.map((t) => {
              const local = localByCatalog.get(t.id);
              const isCurrent = !!local && local.tournamentId === currentTournamentId;
              const stale = !!local && !!local.catalogUpdatedAt && local.catalogUpdatedAt < t.updatedAt;
              return (
                <li key={t.id} className="tl__card">
                  <HubCard
                    t={t}
                    highlight={t.id === next?.id}
                    isCurrent={isCurrent}
                    onDevice={!!local}
                    stale={stale}
                    busy={busy?.id === t.id ? busy.label : null}
                    disabled={!!busy}
                    error={error?.id === t.id ? error.message : null}
                    onStart={() => start(t, 'fresh')}
                    onResume={() => start(t, 'resume')}
                    onReset={() => start(t, 'direct')}
                    onTest={() => start(t, 'test')}
                    isTest={!!local?.isTest}
                  />
                </li>
              );
            })}
              </ul>
            </section>
          ))
        )}

        {/* ---- 辞書・登録のしかた ---- */}
        <div className="hub-grid">
          <Link to="/dict" className="hub-panel hub-panel--link">
            <BookOpen className="hub-panel__ico" />
            <div className="hub-panel__body">
              <p className="hub-panel__title">選手・所属のふりがな</p>
              <p className="hub-panel__text">
                {dict.status === 'syncing' ? 'データベースから取り込んでいます…' : `選手 ${dict.players || list?.dict.players || 0} 人・所属 ${dict.affiliations || list?.dict.affiliations || 0} 件。ログインした時点で自動で取り込み、音声コールと表示に使います。`}
              </p>
            </div>
            <ArrowRight className="hub-panel__go" />
          </Link>
          <ExcelUpload existing={list?.tournaments ?? []} onDone={load} disabled={!officer.email} />
          <div className="hub-panel">
            <Bot className="hub-panel__ico" />
            <div className="hub-panel__body">
              <p className="hub-panel__title">AI から入れる・直す</p>
              <p className="hub-panel__text">
                Claude に「県選ダブルスのドローを入れて」「○○さんのふりがなを直して」と頼むと、このデータベースに直接書きます。
                形は <a href="/api/schema" target="_blank" rel="noopener noreferrer">/api/schema</a>。
              </p>
            </div>
          </div>
        </div>

        <p className="hub__foot">
          ミックスダブルス・団体戦の Excel や、端末に残っている大会の整理は <Link to="/data-tools">データ管理</Link> から。
        </p>
      </div>
    </div>
  );
}

function DictChip({ players, affiliations, status }: { players: number; affiliations: number; status: string }) {
  const label = status === 'syncing' ? '辞書を取り込み中' : status === 'error' ? '辞書を取り込めませんでした' : status === 'offline' ? '端末の辞書を使用中' : `辞書 ${players} 人・${affiliations} 所属`;
  return (
    <Link to="/dict" className={`hub-chip ${status === 'error' ? 'hub-chip--warn' : ''}`} title="選手・所属のふりがな">
      {status === 'syncing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </Link>
  );
}

function HubCard({ t, highlight, isCurrent, onDevice, stale, busy, disabled, error, onStart, onResume, onReset, onTest, isTest }: {
  t: CatalogTournament; highlight: boolean; isCurrent: boolean; onDevice: boolean; stale: boolean;
  busy: string | null; disabled: boolean; error: string | null; onStart: () => void; onResume: () => void; onReset: () => void; onTest: () => void; isTest: boolean;
}) {
  const d = dateParts(t.date);
  const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.planned;
  const isToday = !!d && d.time === todayStart();
  const variant = t.status === 'done' || (d && d.time < todayStart()) ? 'past' : highlight ? (isToday ? 'open' : 'soon') : '';
  const events = t.events.length > 0 ? t.events.map((e) => e.name.replace(/シングルス|ダブルス/, (m) => (m === 'シングルス' ? 'S' : 'D'))).join('・') : t.category || '—';
  return (
    <article className={`tcard hub-card ${variant ? `tcard--${variant}` : ''} tcard--nolink`} aria-busy={!!busy}>
      <div className="tcard__body">
        <div className="hub-card__top">
          {d ? (
            <span className="date-chip date-chip--card hub-card__date">
              <span className="date-chip__md">{d.md}</span>
              <span className="date-chip__dow">{d.dow}</span>
            </span>
          ) : <span className="date-chip date-chip--card hub-card__date"><span className="date-chip__md">未定</span></span>}
          <span className="tcard__status">
            <span className={`badge ${badge.cls}`}>{isToday && t.status === 'ready' ? '本日開催' : badge.label}</span>
            {isCurrent && <span className="hub-card__here">{isTest ? 'この端末でテスト中' : 'この端末で運営中'}</span>}
          </span>
        </div>
        <div className="tcard__head"><h3 className="tcard__title">{t.name}</h3></div>
        <div className="tcard__foot">
          <div className="tcard__info" data-len="long">
            <div className="tcard__text">
              <p className="tcard__event"><ListChecks className="tcard__ico" /><span className="tcard__line">{events}</span></p>
              <p className="tcard__venue"><MapPin className="tcard__ico" /><span className="tcard__line">{t.venue || '会場未定'}</span></p>
              {t.players > 0 && <p className="tcard__venue"><Users className="tcard__ico" /><span className="tcard__line">{t.events.length} 種目・{t.players} 人</span></p>}
            </div>
          </div>
        </div>
        {t.note && <p className="hub-card__note">{t.note}</p>}
        {error && <p className="hub-card__error" role="alert">{error}</p>}
        <div className="hub-card__btns">
          {busy ? (
            <span className="btn btn--primary hub-card__btn is-busy"><Loader2 className="w-4 h-4 animate-spin" />{busy}</span>
          ) : t.status !== 'ready' && t.status !== 'done' ? (
            <span className="btn tl-btn tl-btn--off hub-card__btn" aria-disabled="true">ドロー未登録</span>
          ) : onDevice ? (
            <>
              <button className="btn btn--primary hub-card__btn" onClick={onResume} disabled={disabled}>{isCurrent ? 'エントリーへ' : '続きから'}<ArrowRight className="w-4 h-4" /></button>
              <button className={`btn btn--outline hub-card__btn ${stale ? 'is-stale' : ''}`} onClick={onStart} disabled={disabled} title="確認してから入れ直す">{stale ? '更新あり・入れ直す' : '入れ直す'}</button>
            </>
          ) : (
            <button className="btn btn--primary hub-card__btn" onClick={onStart} disabled={disabled}>確認して運営をはじめる<ArrowRight className="w-4 h-4" /></button>
          )}
        </div>
        {(t.status === 'ready' || t.status === 'done') && !busy && (
          <Link to={`/data/review/${encodeURIComponent(t.id)}`} className="btn hub-card__btn hub-card__btn--gray"><ClipboardCheck className="w-4 h-4" />ドローを確認・修正</Link>
        )}
        {(t.status === 'ready' || t.status === 'done') && !busy && (
          <button type="button" className="btn hub-card__btn hub-card__btn--test" onClick={onTest} disabled={disabled}><FlaskConical className="w-4 h-4" />テストモードで試す</button>
        )}
        {(t.status === 'ready' || t.status === 'done') && !busy && onDevice && (
          <div className="hub-card__links">
            {onDevice && (
              <button type="button" className="hub-card__reset" onClick={onReset} disabled={disabled}><RotateCcw className="w-3.5 h-3.5" />{isTest ? 'テストのデータをクリアして最初から' : '運営データをクリアして最初から'}</button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Excel のドロー表を読んで、データベースに入れる（端末に直接ではなく、まずデータベースへ。ほかの端末からも選べる） */
function ExcelUpload({ existing, onDone, disabled }: { existing: CatalogTournament[]; onDone: () => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message: string }>({ kind: 'idle', message: '' });
  const onFile = async (file: File) => {
    setState({ kind: 'busy', message: `「${file.name}」を読んでいます` });
    try {
      const parsed = parseDrawExcel(await file.arrayBuffer(), file.name);
      if (parsed.events.length === 0) throw new Error('ドローの種目が読み取れませんでした。ミックス・団体戦は「データ管理」から取り込んでください。');
      const { id, body, matched } = drawEntry(parsed, existing, { sourceName: file.name });
      const ok = await siteConfirm({
        title: matched ? `「${matched.name}」に入れる` : '新しい大会として入れる',
        message: `${body.name}（${body.date || '日付不明'}）\n${body.draw!.events.map((e) => `・${e.eventName} ${e.players.length}人`).join('\n')}\n\n` +
          (matched ? '大会日程のこの大会に重ねて、運営できる大会にします。' : '大会日程に同じ日の大会が無いので、新しい大会として入れます。'),
        confirmLabel: 'データベースに入れる',
        danger: false,
      });
      if (!ok) { setState({ kind: 'idle', message: '' }); return; }
      await putTournament(id, body);
      setState({ kind: 'ok', message: `${body.name} を入れました。上の一覧から「運営をはじめる」を押してください。` });
      onDone();
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  };
  return (
    <div className="hub-panel">
      <FileSpreadsheet className="hub-panel__ico" />
      <div className="hub-panel__body">
        <p className="hub-panel__title">Excel から入れる</p>
        <p className="hub-panel__text">
          ドロー表（.xlsx）をデータベースに入れます。大会日程の同じ日の大会に重なり、ほかの端末からも選べるようになります。
        </p>
        <input ref={input} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
        <button className="btn btn--outline hub-panel__btn" onClick={() => input.current?.click()} disabled={disabled || state.kind === 'busy'}>
          {state.kind === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}ドロー表を選ぶ
        </button>
        {state.message && <p className={`hub-panel__msg ${state.kind === 'error' ? 'is-error' : ''}`} role="status">{state.message}</p>}
      </div>
    </div>
  );
}
