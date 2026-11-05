// =============================================================================
// マニュアル用の「画面の写し」
//
// 今の運営画面（協会サイトと同じ見た目）を小さく描いて、どこを押せばよいかを示す。
// 画像ではなく部品で描いているので、画面の意匠を変えたらこのファイルを直せば追従できる。
// 見た目は styles/pages/manual-view.css の .mm-*。名前・所属はすべて架空の例。
// =============================================================================

import {
  Menu, ChevronLeft, ChevronRight, ChevronDown, Eye, Image as ImageIcon, SlidersHorizontal,
  Trophy, ArrowRight, ClipboardCheck, ListChecks, MapPin, Users, ArrowLeftRight, Pencil,
  Search, Volume2, Check, Plus, Lock, Download, X,
} from 'lucide-react';
import { SYSTEM_LOGO } from '../../components/site/SiteChrome';

export type Device = 'mobile' | 'pc';


/** 説明と対応させる番号（赤い四角） */
export function Marker({ n, className = '' }: { n: number; className?: string }) {
  return <span className={`mm-mk ${className}`} aria-label={`説明 ${n}`}>{n}</span>;
}

/** 画面の写しの外枠（見出し＋番号の説明つき） */
export function ScreenFigure({
  title, en, children, points,
}: {
  title: string;
  en?: string;
  children: React.ReactNode;
  points?: { n: number; text: string }[];
}) {
  return (
    <figure className="mm-fig">
      <figcaption className="mm-fig__cap">
        {en && <span className="mm-fig__en">{en}</span>}
        <span className="mm-fig__title">{title}</span>
      </figcaption>
      <div className="mm-fig__stage" aria-hidden="true">
        <div className="mm-fig__inner">{children}</div>
      </div>
      {points && points.length > 0 && (
        <ol className="mm-fig__points">
          {points.map(p => (
            <li key={p.n}>
              <Marker n={p.n} />
              <span>{p.text}</span>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}

// ─── 共通の小さな部品 ───────────────────────────────────────────────

/** サイトの見出し（赤い四角 → 英字 → 日本語） */
function MiniHead({ en, title, right }: { en: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="mm-sec__head">
      <span className="mm-sec__mark" />
      <span className="mm-sec__titles">
        <span className="mm-sec__en">{en}</span>
        <span className="mm-sec__title">{title}</span>
      </span>
      {right}
    </div>
  );
}

/** 画面の上（サイトのヘッダー）。PC は横並びのメニュー、スマホは三本線 */
function MiniHeader({ device, active = 0, marks = false, dark = false }: { device: Device; active?: number; marks?: boolean; dark?: boolean }) {
  const items = ['大会準備', '大会進行', '配信', '選手・所属', '印刷', '設定'];
  return (
    <div className={`mm-hd ${dark ? 'mm-hd--dark' : ''}`}>
      <img
        className="mm-hd__logo"
        src={dark ? SYSTEM_LOGO.white : SYSTEM_LOGO.src}
        alt=""
        width={SYSTEM_LOGO.width}
        height={SYSTEM_LOGO.height}
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
      />
      {device === 'pc' ? (
        <>
          <span className="mm-hd__nav">
            {items.map((it, i) => (
              <span key={it} className={`mm-hd__item ${i === active ? 'is-on' : ''}`}>
                {it}
                {marks && i === 0 && <Marker n={1} className="mm-mk--abs mm-mk--tr" />}
              </span>
            ))}
          </span>
          <span className="mm-hd__cta">観戦ページ{marks && <Marker n={3} className="mm-mk--abs mm-mk--tr" />}</span>
        </>
      ) : (
        <span className="mm-hd__burger"><Menu size={14} />{marks && <Marker n={1} className="mm-mk--abs mm-mk--tr" />}</span>
      )}
    </div>
  );
}

/** 画面の見出し（パンくず・英字・日本語） */
function MiniPageHead({ en, title }: { en: string; title: string }) {
  return (
    <div className="mm-ph">
      <span className="mm-ph__en"><i />{en}</span>
      <span className="mm-ph__title">{title}</span>
      <span className="mm-ph__ghost">{en}</span>
    </div>
  );
}

function Btn({ children, kind = 'primary', className = '' }: { children: React.ReactNode; kind?: 'primary' | 'outline' | 'gray' | 'ink'; className?: string }) {
  return <span className={`mm-btn mm-btn--${kind} ${className}`}>{children}</span>;
}

// ─── メニュー ────────────────────────────────────────────────────────

/** メニューの開き方（PC＝上のメニュー＋画面の切り替え / スマホ＝三本線で黒地のメニュー） */
export function MenuMockup({ device }: { device: Device }) {
  if (device === 'pc') {
    return (
      <div className="mm-win mm-win--pc">
        <MiniHeader device="pc" marks />
        <MiniPageHead en="SELECT" title="大会選択" />
        <div className="mm-tabs">
          <span className="mm-tabs__item is-on">大会選択</span>
          <span className="mm-tabs__item">エントリー</span>
          <Marker n={2} className="mm-mk--abs mm-mk--tl" />
        </div>
        <div className="mm-body mm-body--blank">選んだ画面がここに出ます</div>
      </div>
    );
  }
  const items = ['大会選択', '選手・所属', 'エントリー', '対戦順', 'タイムテーブル', 'ドロー', 'ダッシュボード', 'ライブ配信', '印刷', '設定'];
  return (
    <div className="mm-win mm-win--sp">
      <MiniHeader device="mobile" marks dark />
      <div className="mm-spnav">
        {items.map((it, i) => (
          <span key={it} className={`mm-spnav__item ${i === 3 ? 'is-on' : ''}`}>{it}</span>
        ))}
        <span className="mm-spnav__item mm-spnav__item--sub">観戦ページ<Marker n={3} className="mm-mk--abs mm-mk--tr" /></span>
        <span className="mm-spnav__item mm-spnav__item--sub">協会サイト</span>
        <Marker n={2} className="mm-mk--abs mm-mk--tl" />
      </div>
    </div>
  );
}

// ─── 大会選択 ────────────────────────────────────────────────────────

/** 大会選択（データベースの大会がカードで並ぶ） */
export function HubMockup({ device }: { device: Device }) {
  const card = (
    <div className="mm-tcard is-hot">
      <div className="mm-tcard__top">
        <span className="mm-date"><b>11.08</b><i>SUN</i></span>
        <span className="mm-badge">運営できる</span>
      </div>
      <span className="mm-tcard__title">鳥取県テニス選手権 シングルス</span>
      <span className="mm-tcard__line"><ListChecks size={10} />一般男子S・男子45歳以上S…</span>
      <span className="mm-tcard__line"><MapPin size={10} />ヤマタスポーツパーク</span>
      <span className="mm-rel">
        <Btn className="mm-btn--block">確認して運営をはじめる<ArrowRight size={10} /></Btn>
        <Marker n={2} className="mm-mk--abs mm-mk--tr" />
      </span>
      <span className="mm-rel">
        <Btn kind="gray" className="mm-btn--block"><ClipboardCheck size={10} />ドローを確認・修正</Btn>
        <Marker n={3} className="mm-mk--abs mm-mk--tr" />
      </span>
    </div>
  );
  return (
    <div className={`mm-win ${device === 'pc' ? 'mm-win--pc' : 'mm-win--sp'}`}>
      <MiniHeader device={device} />
      <MiniPageHead en="SELECT" title="大会選択" />
      <div className="mm-body">
        <div className="mm-row mm-rel">
          <span className="mm-seg"><span className="is-on">これから</span><span>終わった大会</span><span>すべて</span></span>
          <Marker n={1} className="mm-mk--abs mm-mk--tl" />
        </div>
        {device === 'pc' ? (
          <div className="mm-cards">
            {card}
            <div className="mm-tcard">
              <div className="mm-tcard__top">
                <span className="mm-date"><b>11.22</b><i>SUN</i></span>
                <span className="mm-badge">運営できる</span>
              </div>
              <span className="mm-tcard__title">市民大会 ダブルス</span>
              <span className="mm-tcard__line"><ListChecks size={10} />一般男子D・一般女子D</span>
              <span className="mm-tcard__line"><MapPin size={10} />市営コート</span>
              <Btn className="mm-btn--block">確認して運営をはじめる<ArrowRight size={10} /></Btn>
              <Btn kind="gray" className="mm-btn--block"><ClipboardCheck size={10} />ドローを確認・修正</Btn>
            </div>
          </div>
        ) : card}
      </div>
    </div>
  );
}

// ─── 確認・修正 ──────────────────────────────────────────────────────

function ReviewSlot({ no, name, aff, seed, bye }: { no: number; name: string; aff?: string; seed?: number; bye?: boolean }) {
  return (
    <div className={`mm-slot ${bye ? 'is-bye' : ''}`}>
      <span className="mm-slot__no">{no}</span>
      <span className="mm-slot__name">
        {seed && <i className="mm-seed">{seed}</i>}
        {bye ? '空き（BYE）' : name}
        {aff && <small>{aff}</small>}
      </span>
      <span className="mm-ibtn"><ArrowLeftRight size={9} /></span>
      <span className="mm-ibtn"><Pencil size={9} /></span>
    </div>
  );
}

/** ドローの確認・修正（はじめる前に当たり方・名前・所属を直す） */
export function ReviewMockup({ device }: { device: Device }) {
  return (
    <div className={`mm-win ${device === 'pc' ? 'mm-win--pc' : 'mm-win--sp'}`}>
      <MiniHeader device={device} />
      <MiniPageHead en="CHECK" title="ドロー確認" />
      <div className="mm-body">
        <div className="mm-panel mm-panel--accent mm-rel">
          <span className="mm-date"><b>11.08</b><i>SUN</i></span>
          <span className="mm-panel__titles">
            <span className="mm-sec__en">CHECK BEFORE START</span>
            <span className="mm-panel__title">鳥取県テニス選手権 シングルス</span>
          </span>
          <span className="mm-counts"><span><b>0</b>要修正</span><span><b>1</b>要確認</span></span>
          <Marker n={1} className="mm-mk--abs mm-mk--tr" />
        </div>
        <div className="mm-row mm-rel">
          <span className="mm-seg mm-seg--scroll"><span className="is-on">一般男子S</span><span>男子45歳以上S</span><span>一般女子S</span></span>
          <Marker n={2} className="mm-mk--abs mm-mk--tl" />
        </div>
        <div className="mm-panel mm-panel--list mm-rel">
          <span className="mm-panel__cap">1回戦 第1試合</span>
          <ReviewSlot no={1} name="山田 太郎" aff="○○クラブ" seed={1} />
          <ReviewSlot no={2} name="" bye />
          <span className="mm-panel__cap">1回戦 第2試合</span>
          <ReviewSlot no={3} name="佐藤 次郎" aff="△△高校" />
          <ReviewSlot no={4} name="鈴木 三郎" aff="□□ＴＣ" />
          <Marker n={3} className="mm-mk--abs mm-mk--slot" />
        </div>
        <span className="mm-rel mm-start">
          <Btn className="mm-btn--block mm-btn--lg">運営をはじめる<ArrowRight size={11} /></Btn>
          <Marker n={4} className="mm-mk--abs mm-mk--tr" />
        </span>
      </div>
    </div>
  );
}

// ─── 選手・所属 ──────────────────────────────────────────────────────

/** 選手・所属（ふりがな辞書） */
export function DictMockup({ device }: { device: Device }) {
  const rows = [
    { k: '山田 太郎', r: 'やまだ たろう', a: '○○クラブ' },
    { k: '佐藤 次郎', r: 'さとう じろう', a: '△△高校', warn: true },
    { k: '鈴木 三郎', r: 'すずき さぶろう', a: '□□ＴＣ' },
  ];
  return (
    <div className={`mm-win ${device === 'pc' ? 'mm-win--pc' : 'mm-win--sp'}`}>
      <MiniHeader device={device} active={3} />
      <MiniPageHead en="PLAYERS" title="選手・所属" />
      <div className="mm-body">
        <div className="mm-row mm-rel">
          <span className="mm-seg"><span className="is-on">選手 <small>804</small></span><span>所属 <small>129</small></span></span>
          <Marker n={1} className="mm-mk--abs mm-mk--tl" />
        </div>
        <div className="mm-row">
          <span className="mm-input"><Search size={10} />氏名・ふりがな・所属で探す</span>
          <Btn kind="outline"><Plus size={10} />選手を足す</Btn>
        </div>
        <div className="mm-table">
          <div className="mm-table__th"><span>漢字</span><span>ふりがな</span>{device === 'pc' && <span>所属</span>}<span /></div>
          {rows.map((r, i) => (
            <div key={r.k} className={`mm-table__tr ${r.warn ? 'is-warn' : ''}`}>
              <b>{r.k}</b><span>{r.r}</span>{device === 'pc' && <span className="mm-muted">{r.a}</span>}
              <span className="mm-rel mm-ibtn"><Pencil size={9} />{i === 0 && <Marker n={2} className="mm-mk--abs mm-mk--tr" />}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── エントリー受付 ──────────────────────────────────────────────────

/** エントリー受付（種目ごとに受付して確定） */
export function EntryMockup({ device }: { device: Device }) {
  const players = [
    { no: 1, n: '山田 太郎', a: '○○クラブ', on: true },
    { no: 2, n: '佐藤 次郎', a: '△△高校', on: true },
    { no: 3, n: '鈴木 三郎', a: '□□ＴＣ', on: false },
    { no: 4, n: '高橋 四郎', a: 'フリー', on: false, def: true },
  ];
  return (
    <div className={`mm-win ${device === 'pc' ? 'mm-win--pc' : 'mm-win--sp'}`}>
      <MiniHeader device={device} />
      <MiniPageHead en="ENTRY" title="エントリー" />
      <div className="mm-body">
        <div className="mm-panel mm-panel--sec">
          <MiniHead
            en="EVENT"
            title="一般男子シングルス"
            right={(
              <span className="mm-row mm-row--tight mm-rel">
                <Btn kind="outline"><Users size={10} />全員受付</Btn>
                <Btn><Lock size={10} />確定</Btn>
                <Marker n={2} className="mm-mk--abs mm-mk--tr" />
              </span>
            )}
          />
          <div className="mm-plist mm-rel">
            {players.map(p => (
              <div key={p.no} className={`mm-plist__row ${p.def ? 'is-def' : ''}`}>
                <span className="mm-slot__no">{p.no}</span>
                <span className="mm-slot__name">{p.n}<small>{p.a}</small></span>
                {p.def ? <span className="mm-chip mm-chip--red">欠場</span> : (
                  <span className={`mm-check ${p.on ? 'is-on' : ''}`}>{p.on && <Check size={9} />}受付</span>
                )}
              </div>
            ))}
            <Marker n={1} className="mm-mk--abs mm-mk--slot" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 対戦順 ──────────────────────────────────────────────────────────

/** 対戦順（次の試合・コート投入・音声コール） */
export function OrderMockup({ device }: { device: Device }) {
  return (
    <div className={`mm-win ${device === 'pc' ? 'mm-win--pc' : 'mm-win--sp'}`}>
      <MiniHeader device={device} active={1} />
      <MiniPageHead en="ORDER OF PLAY" title="対戦順" />
      <div className="mm-body">
        <div className="mm-order">
          <div className="mm-order__row is-playing">
            <span className="mm-court"><small>コート</small>3</span>
            <span className="mm-order__vs"><b>山田 太郎</b><i>vs</i><b>佐藤 次郎</b></span>
            <span className="mm-chip mm-chip--red">試合中</span>
          </div>
          <div className="mm-order__row mm-rel">
            <span className="mm-court is-empty"><small>次</small>1</span>
            <span className="mm-order__vs"><b>鈴木 三郎</b><i>vs</i><b>高橋 四郎</b></span>
            <span className="mm-row mm-row--tight mm-rel">
              <span className="mm-ibtn mm-ibtn--red mm-rel"><Volume2 size={10} /><Marker n={2} className="mm-mk--abs mm-mk--tr" /></span>
              <Btn>コートに入れる</Btn>
            </span>
            <Marker n={1} className="mm-mk--abs mm-mk--tl" />
          </div>
          <div className="mm-order__row">
            <span className="mm-court is-empty"><small>次</small>2</span>
            <span className="mm-order__vs"><b>伊藤 五郎</b><i>vs</i><b>渡辺 六郎</b></span>
            <span className="mm-chip">待機</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ドロー ──────────────────────────────────────────────────────────

/** ドロー画面の上部（種目の切り替え・進み具合・表示する回戦・結果画像・修正） */
export function DrawHeaderMockup() {
  return (
    <div className="mm-win mm-win--bar">
      <div className="mm-dh">
        <ChevronLeft size={13} className="mm-muted" />
        <span className="mm-dh__title mm-rel">
          <Trophy size={11} className="mm-red" />男子ダブルスＡ級<ChevronDown size={11} className="mm-muted" />
          <Marker n={1} className="mm-mk--abs mm-mk--tr" />
        </span>
        <ChevronRight size={13} className="mm-muted" />
      </div>
      <span className="mm-dh__rule">8ゲームマッチ（8-8タイブレーク）</span>
      <div className="mm-dh__prog mm-rel">
        <span className="mm-prog"><i style={{ width: '83%' }} /></span>
        <span className="mm-dh__num">5/6 (83%)</span>
        <Marker n={2} className="mm-mk--abs mm-mk--tr" />
      </div>
      <div className="mm-row mm-row--between">
        <span className="mm-stepper mm-rel">
          <ChevronLeft size={11} /><Eye size={10} className="mm-muted" /><b>ALL 1R〜</b><ChevronRight size={11} />
          <Marker n={3} className="mm-mk--abs mm-mk--tl" />
        </span>
        <span className="mm-row mm-row--tight">
          <span className="mm-ibtn mm-ibtn--lg mm-rel"><ImageIcon size={12} /><Marker n={4} className="mm-mk--abs mm-mk--tr" /></span>
          <span className="mm-ibtn mm-ibtn--lg mm-rel"><SlidersHorizontal size={12} /><Marker n={5} className="mm-mk--abs mm-mk--tr" /></span>
        </span>
      </div>
    </div>
  );
}

/** ドロー表の1枠（番号＋ペア2行＋所属） */
function DrawSlot({ no, a, b, affA, affB, w = 150 }: {
  no: number; a: string; b: string; affA?: string; affB?: string; w?: number;
}) {
  return (
    <div className="mm-dslot" style={{ width: w }}>
      <span className="mm-dslot__no">{no}</span>
      <span className="mm-dslot__names"><b>{a}</b><b>{b}</b></span>
      {(affA || affB) && <span className="mm-dslot__aff"><i>{affA}</i><i>{affB}</i></span>}
    </div>
  );
}

/** ドロー表の枠の見かた（番号・氏名・所属・スコア・勝ち上がり） */
export function DrawCardMockup() {
  return (
    <div className="mm-draw">
      <div className="mm-abs" style={{ left: 0, top: 0 }}><DrawSlot no={1} a="山田 太郎" b="鈴木 次郎" affA="○○クラブ" affB="△△高校" /></div>
      <div className="mm-abs" style={{ left: 0, top: 74 }}><DrawSlot no={2} a="佐藤 三郎" b="高橋 四郎" affA="□□ＴＣ" affB="フリー" /></div>
      <svg className="mm-abs" style={{ inset: 0 }} width="300" height="132">
        <path d="M 150 23 L 172 23 L 172 60" fill="none" stroke="var(--red)" strokeWidth="2.6" />
        <path d="M 150 97 L 172 97 L 172 60" fill="none" stroke="var(--gray-300)" strokeWidth="1.4" />
        <path d="M 172 60 L 196 60" fill="none" stroke="var(--red)" strokeWidth="2.6" />
        <text x="177" y="55" fill="var(--red)" fontSize="18" fontWeight={700} fontFamily="var(--flt)">8</text>
        <text x="177" y="80" fill="var(--gray-500)" fontSize="18" fontWeight={700} fontFamily="var(--flt)">5</text>
      </svg>
      <div className="mm-abs" style={{ left: 196, top: 37 }}><DrawSlot no={1} a="山田 太郎" b="鈴木 次郎" w={104} /></div>
      <span className="mm-abs" style={{ left: -6, top: -20 }}><Marker n={1} /></span>
      <span className="mm-abs" style={{ left: 52, top: -20 }}><Marker n={2} /></span>
      <span className="mm-abs" style={{ left: 128, top: -20 }}><Marker n={3} /></span>
      <span className="mm-abs" style={{ left: 192, top: 84 }}><Marker n={4} /></span>
      <span className="mm-abs" style={{ left: 286, top: 26 }}><Marker n={5} /></span>
    </div>
  );
}

/** 進行中の試合の枠（コート番号つき）とスコア入力の入口 */
export function MatchCardMockup({ device }: { device: Device }) {
  return (
    <div className="mm-live mm-rel">
      <div className="mm-live__card">
        <span className="mm-court mm-court--tall"><small>コート</small>3</span>
        <span className="mm-live__names">
          <span><i>1</i><b>山田 太郎</b><b>鈴木 次郎</b></span>
          <span><i>2</i><b>佐藤 三郎</b><b>高橋 四郎</b></span>
        </span>
      </div>
      <span className="mm-live__hint">{device === 'pc' ? 'クリック' : 'タップ'}</span>
      <span className="mm-abs" style={{ left: -6, top: -8 }}><Marker n={1} /></span>
      <span className="mm-abs" style={{ left: 120, top: -8 }}><Marker n={2} /></span>
    </div>
  );
}

// ─── 設定・結果画像 ──────────────────────────────────────────────────

/** 設定ページ（区画ごとに開閉。スマホは畳んだ状態、PC は開いた状態で表示） */
export function SettingsMockup({ device }: { device: Device }) {
  const rows = [
    { en: 'SYNC', title: '同期' },
    { en: 'PUBLIC', title: '観戦用ページ' },
    { en: 'VOICE', title: '音声（コール読み上げ）' },
    { en: 'BACKUP', title: 'バックアップ' },
  ];
  const open = device === 'pc';
  return (
    <div className={`mm-stack ${device === 'pc' ? 'mm-stack--pc' : ''}`}>
      {rows.map((r, i) => (
        <div key={r.title} className="mm-panel mm-panel--sec">
          <MiniHead
            en={r.en}
            title={r.title}
            right={(
              <span className="mm-rel mm-toggle">
                <ChevronDown size={12} className={open && i === 0 ? '' : 'is-closed'} />
                {i === 0 && <Marker n={1} className="mm-mk--abs mm-mk--tr" />}
              </span>
            )}
          />
          {open && i === 0 && (
            <div className="mm-panel__body">
              <span className="mm-note">同期していません（この端末だけで動いています）</span>
              <Btn className="mm-btn--block">同期設定を開く<ChevronRight size={10} /></Btn>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 結果画像のプレビュー（表示幅・保存） */
export function ResultPreviewMockup({ device }: { device: Device }) {
  return (
    <div className={`mm-win ${device === 'pc' ? 'mm-win--pc' : 'mm-win--sp'}`}>
      <div className="mm-rp__bar">
        <span className="mm-rp__title"><span className="mm-sec__mark" />男子ダブルスＡ級 結果プレビュー</span>
        <span className="mm-row mm-row--tight">
          <span className="mm-ibtn mm-ibtn--red mm-rel"><Download size={10} /><Marker n={2} className="mm-mk--abs mm-mk--tr" /></span>
          <span className="mm-ibtn"><X size={10} /></span>
        </span>
      </div>
      <div className="mm-rp__range mm-rel">
        表示幅
        <span className="mm-range"><i style={{ left: '40%' }} /></span>
        <span className="mm-muted">70%</span>
        <Marker n={1} className="mm-mk--abs mm-mk--tl" />
      </div>
      <div className="mm-body mm-body--blank">結果画像のプレビュー</div>
    </div>
  );
}
