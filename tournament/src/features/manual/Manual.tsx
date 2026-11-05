// =============================================================================
// マニュアル
//
// 画面の写し（ManualScreens）を交えて、実際の操作にそって説明する。
// 協会サイトの案内ページと同じ組み方：左に目次（PC は貼り付き・スマホは開閉）、右に区画。
// スマホ／PCで操作が変わるところは端末の切り替えで出し分ける。
// 見た目は styles/pages/manual-view.css の .mn-*。
// =============================================================================

import { useEffect, useState } from 'react';
import {
  Database, Users, ClipboardList, CalendarClock, Network, BarChart2, Radio, Printer, Settings,
  Image as ImageIcon, Volume2, Smartphone, Monitor, ChevronDown, Lightbulb, AlertTriangle,
  Wifi, Shield, LogIn, ClipboardCheck, BookOpen, ArrowRight, List,
} from 'lucide-react';
import {
  type Device, ScreenFigure, MenuMockup, HubMockup, ReviewMockup, DictMockup, EntryMockup, OrderMockup,
  DrawHeaderMockup, DrawCardMockup, SettingsMockup, ResultPreviewMockup, MatchCardMockup,
} from './ManualScreens';

// ─── 端末ごとに言い回しが変わる文 ───────────────────────────────────

type DeviceText = { mobile: string; pc: string };
const t = (v: string | DeviceText, d: Device) => (typeof v === 'string' ? v : v[d]);
const MENU: DeviceText = { mobile: '右上の三本線 →', pc: '上のメニューの' };

// ─── 当日の流れ ─────────────────────────────────────────────────────

interface FlowStep {
  icon: React.ElementType;
  title: string;
  timing: string;
  body: string | DeviceText;
}

const FLOW_STEPS: FlowStep[] = [
  {
    icon: LogIn, title: '役員ログインする', timing: '前日〜当日の朝',
    body: '運営画面を開くと役員ログインの案内が出ます。登録したメールアドレスを入れると、6 桁の確認コードがメールで届きます。一度ログインした端末は 7 日間そのまま使えます。選手・所属のふりがな辞書は、ログインした時点で自動で取り込まれます。',
  },
  {
    icon: Database, title: '大会を選ぶ', timing: '前日〜当日の朝',
    body: '「大会選択」に、協会の大会運営データベースにある大会がカードで並びます。当日の大会のカードの「確認して運営をはじめる」を押します。',
  },
  {
    icon: ClipboardCheck, title: 'ドローを確認・修正する', timing: '前日〜当日の朝',
    body: '「ドロー確認」の画面で、種目ごとに当たり方・名前・所属を確かめます。間違いはその場で入れ替え・修正できます。直すべき所・念のため見ておく所は上に件数で出ます。',
  },
  {
    icon: ArrowRight, title: '運営をはじめる', timing: '受付の前',
    body: '確認が済んだら「運営をはじめる」を押します。大会（種目・ドロー・時刻・シード）がこの端末に入り、時間割も作られて、エントリー受付の画面に進みます。',
  },
  {
    icon: Wifi, title: '複数の端末で使うなら同期する', timing: '大会開始前',
    body: '「設定」→「同期」でルームを作り、ほかの端末は同じコードで参加します。以後スコアや進行が全端末にそのまま反映されます。1 台だけで運営するなら設定は不要です。',
  },
  {
    icon: Users, title: 'エントリーを受け付ける', timing: '受付〜開始前',
    body: '「エントリー」で来た人を受付し、当日の欠場を反映します。種目ごとに「確定」すると、その種目の試合が対戦順に並びます。',
  },
  {
    icon: ClipboardList, title: '対戦順を見て呼び出す', timing: '試合中',
    body: {
      mobile: '「対戦順」に次の試合が並びます。行をタップするとコート投入や音声コールができます。',
      pc: '「対戦順」に次の試合が並びます。行を選ぶとコート投入や音声コールができます。まとめてコールする一斉呼び出しもここからです。',
    },
  },
  {
    icon: Network, title: 'ドローでスコアを入れる', timing: '試合中',
    body: {
      mobile: '「ドロー」で種目を選び、試合の枠をタップしてスコアを入力します。勝者は自動で次の回戦に進みます。',
      pc: '「ドロー」で種目を選び、試合の枠をクリックしてスコアを入力します。勝者は自動で次の回戦に進みます。',
    },
  },
  {
    icon: ImageIcon, title: '結果画像を出す', timing: '種目の終了ごと',
    body: '種目の全試合が終わると、ドロー画面の上部に画像アイコンが出ます。押すとその場でプレビューでき、JPEG で保存できます。',
  },
  {
    icon: Shield, title: 'バックアップを取る', timing: '大会の前後',
    body: '「設定」→「バックアップ」から、端末に JSON で保存するか Cloudflare へ保存します。当日の朝と終了後を目安に。',
  },
];

// ─── 機能ごとの使い方 ───────────────────────────────────────────────

interface FeatureSection {
  id: string;
  icon: React.ElementType;
  title: string;
  summary: string;
  steps: (string | DeviceText)[];
  tips?: string[];
}

const FEATURES: FeatureSection[] = [
  {
    id: 'hub', icon: Database, title: '大会選択',
    summary: '協会のデータベースにある大会を選んで運営をはじめる',
    steps: [
      '「これから」「終わった大会」「すべて」で絞り込めます。「これから」にはドローの入った大会だけが出ます（日程だけの大会は「すべて」で見られます）。',
      '「確認して運営をはじめる」で確認・修正の画面に進み、そこから端末に入れます。',
      '「ドローを確認・修正」（灰色のボタン）は、端末に入れずにドローだけを見直したいときに使います。',
      'すでにこの端末に入っている大会は「続きから」「入れ直す」になります。データベースが新しくなっていると「更新あり・入れ直す」と出ます。',
      'ドロー表の Excel は「Excel から入れる」でデータベースに入れられます。ミックスダブルス・団体戦の Excel は「データ管理」から取り込みます。',
    ],
    tips: ['入れ直すと、この端末の受付・試合結果は消えて最新の内容に置き換わります。'],
  },
  {
    id: 'review', icon: ClipboardCheck, title: 'ドロー確認（確認・修正）',
    summary: '運営をはじめる前に、当たり方・名前・所属を直す',
    steps: [
      '上の数字は「要修正」「要確認」「参考」の件数です。押すとその場所が開きます。',
      '種目のタブを切り替えて、1 回戦の組み合わせを確かめます。「1 回戦の試合だけ表示」で不戦勝・空きの組を隠せます。',
      '行の右のボタンで、入れ替え・名前の修正・取り消しができます。',
      '大会名・期日・会場・コート数・開始時刻は「大会の情報を直す」で直せます。',
      '最後に「運営をはじめる」で端末に入れて、エントリー受付に進みます。',
    ],
  },
  {
    id: 'dict', icon: BookOpen, title: '選手・所属',
    summary: 'ふりがな辞書（音声コール・名簿の読み）',
    steps: [
      'メニューの「選手・所属」で開きます。協会のデータベースの辞書で、ログインした時点でこの端末に取り込まれます。',
      '「選手」「所属」を切り替え、氏名・ふりがな・所属で探せます。',
      '鉛筆のボタンで読みを直せます。直すとほかの端末にも届きます。「要確認」の印は読みが分からない人です。',
    ],
    tips: ['音声コールで読み間違いがあったら、ここでふりがなを直してください。'],
  },
  {
    id: 'entry', icon: Users, title: 'エントリー',
    summary: '受付・欠場（棄権／不戦勝）の処理と種目の確定',
    steps: [
      '種目ごとに出場者とドロー番号を確認し、来た人を受付します。「全員受付」でまとめて受付もできます。',
      '当日欠場は欠場にします。相手はそのまま次の回戦へ進みます。',
      '種目ごとに「確定」すると試合が対戦順に並びます。「全種目確定」でまとめて確定できます。',
      '氏名の誤りは、ドロー画面の修正メニュー →「名前の修正」からも直せます。直すと対戦表・結果画像にも反映されます。',
    ],
  },
  {
    id: 'referee', icon: ClipboardList, title: '対戦順',
    summary: '次に行う試合の一覧・コート投入・音声コール',
    steps: [
      '空きコートに入れられる試合が上に並びます。',
      {
        mobile: '試合をタップ →「コートに入れる」でコートを選びます。呼び出しは同じ画面の音声ボタンから。',
        pc: '試合を選び「コートに入れる」でコートを選びます。呼び出しは同じ画面の音声ボタンから。複数試合をまとめて呼ぶ一斉コールも使えます。',
      },
      '読み上げの声や速さは「設定」→「音声」で変えられます。',
    ],
    tips: ['読み間違いがあるときは「選手・所属」でふりがなを直してください。'],
  },
  {
    id: 'schedule', icon: CalendarClock, title: 'タイムテーブル',
    summary: 'コート×時間帯に試合を並べた予定表',
    steps: [
      '開始時刻と 1 試合の想定時間を決めると、全試合が自動で並びます。',
      '並べ替えたあとは Excel に出して印刷・掲示できます。',
    ],
    tips: ['タイムテーブルは目安です。実際の進行は「対戦順」と「ドロー」で管理します。'],
  },
  {
    id: 'draw', icon: Network, title: 'ドロー（試合の進行）',
    summary: 'トーナメント表の確認・スコア入力・あたりの修正',
    steps: [
      '上部で種目を切り替えます。左右の矢印か、種目名を押して一覧から選べます。',
      '「ALL 1R〜」の左右で表示する回戦を絞れます。決着した回戦は自動で省かれ、押すと戻せます。',
      {
        mobile: '対戦中の枠をタップするとスコア入力が開きます。勝者は自動で次の回戦へ進みます。',
        pc: '対戦中の枠をクリックするとスコア入力が開きます。勝者は自動で次の回戦へ進みます。',
      },
      '右上の設定アイコンから「あたりの修正」「名前の修正」「ゲームルールの変更」ができます。',
      'リーグ戦の種目は星取表で表示され、セルから直接スコアを入れられます。',
    ],
    tips: [
      '勝ち上がりの線は赤、スコアは勝った側が赤・負けた側がグレーです。',
      'ダブルスはペアを 1 人ずつ 2 行に分け、所属もその行の右に出ます。',
    ],
  },
  {
    id: 'live', icon: BarChart2, title: 'ダッシュボード / ライブ配信',
    summary: '進行状況の把握と、1 ポイントごとの配信',
    steps: [
      'ダッシュボードでは進捗・コートの使用状況・時間超過の警告をまとめて見られます。',
      'ライブ配信はコートサイドの端末で開き、選手名を押すだけでポイントが進みます。観戦ページにそのまま流れます。',
    ],
  },
  {
    id: 'print', icon: Printer, title: '印刷',
    summary: '賞状・審判用紙などの印刷',
    steps: [
      '賞状は優勝・準優勝などの候補から選ぶか、手入力でも作れます。',
      '大会を選んでいなくても印刷だけは使えます。',
    ],
  },
  {
    id: 'settings', icon: Settings, title: '設定',
    summary: '同期・観戦用ページ・音声・バックアップ',
    steps: [
      '同期：ルームを作る／参加する。同じルームの端末どうしでデータが揃います。',
      '観戦用ページ：参加者・協会 HP 向けの読み取り専用ページ。URL をコピーして配れます。',
      '音声：読み上げのエンジン（端末内蔵／Gemini）・声・速さを選べます。',
      'バックアップ：端末に JSON で保存、または Cloudflare へ保存・復元します（役員ならどの端末からでも）。',
      'データ管理：ミックスダブルス・団体戦の Excel の取り込みや、端末に残っている大会の整理。',
    ],
    tips: ['復元すると今のデータは上書きされます。先に今のデータを保存してから実行してください。'],
  },
];

// ─── 困ったとき ─────────────────────────────────────────────────────

const TROUBLES: { problem: string; solution: string }[] = [
  { problem: '「大会選択」に大会が出てこない', solution: '「これから」にはドローの入った大会だけが出ます。「すべて」に切り替えるか、右の読み直しボタンを押してください。ドローがまだなら「Excel から入れる」で入れられます。' },
  { problem: 'メニューに「抽選」「ドロー表」が出てこない', solution: 'ミックスダブルス・団体戦の種目があるときだけ出ます。個人戦は「ドロー」で進行します。' },
  { problem: 'メニューに「エントリー」や「対戦順」が無い', solution: 'まだ大会を端末に入れていません。「大会選択」で大会を選び、確認して「運営をはじめる」を押してください。' },
  { problem: 'スコアを入れても次の回戦に進まない', solution: '勝者が未確定のままになっていないか確認してください。スコア入力画面で勝者を選び直せます。' },
  { problem: '結果画像のアイコンが出ない', solution: 'その種目の全試合が終わると出ます。途中の状態では表示されません。' },
  { problem: '音声が鳴らない・読み間違える', solution: '端末の音量とマナーモードを確認してください。読みは「選手・所属」のふりがなで直せます。' },
  { problem: '他の端末に反映されない', solution: '「設定」→「同期」で、両方の端末が同じルームコードに接続されているか確認してください。' },
  { problem: 'ログインを求められて先に進めない', solution: '役員として登録したメールアドレスでログインしてください。会場で電波が無いときも、一度ログインした端末なら続けて使えます。' },
  { problem: 'データが消えた', solution: 'ブラウザの履歴消去やシークレットモードだとデータが残りません。通常のブラウザで使い、こまめにバックアップを取ってください。大会そのものはデータベースにあるので、「大会選択」から入れ直せます。' },
];

const FAQS: { q: string; a: string | DeviceText }[] = [
  { q: '当日の欠場はどう処理しますか？', a: '「エントリー」で欠場にします。相手はそのまま次の回戦に進みます。' },
  { q: 'あたり（組み合わせ）を入れ替えたい', a: {
    mobile: '運営をはじめる前なら「ドロー確認」で入れ替えます。はじめたあとは、ドロー画面の設定アイコン →「あたりの修正」で、入れ替えたい枠を 2 つタップします。保存するまで反映されません。',
    pc: '運営をはじめる前なら「ドロー確認」で入れ替えます。はじめたあとは、ドロー画面の設定アイコン →「あたりの修正」で、入れ替えたい枠を 2 つクリックします。保存するまで反映されません。',
  } },
  { q: '選手名を間違えて登録した', a: 'はじめる前なら「ドロー確認」で、はじめたあとはドロー画面の設定アイコン →「名前の修正」で直せます。対戦表・結果画像にも反映されます。' },
  { q: 'ふりがなはどこで直しますか？', a: 'メニューの「選手・所属」です。直すとほかの端末にも届き、音声コールの読みが変わります。' },
  { q: '観戦用ページは誰でも見られますか？', a: 'URL を知っている人が見られます。ログインは不要で、読み取り専用なので見た人が結果を変えることはできません。' },
  { q: '結果画像の横幅を変えたい', a: 'プレビュー上部の「表示幅」を動かすと、トーナメント表の横幅が変わります。既定は 70% で、変えた設定は次回も引き継がれます。' },
  { q: '別の大会に切り替えたい', a: '「大会選択」で別の大会を選びます。前の大会も端末に残るので、カードの「続きから」で戻れます。' },
];

// ─── 目次 ───────────────────────────────────────────────────────────

const TOC = [
  { id: 'mn-start', en: 'QUICK START', label: 'まずはこれだけ' },
  { id: 'mn-flow', en: 'FLOW', label: '大会当日の流れ' },
  { id: 'mn-screens', en: 'SCREENS', label: '画面の見かた' },
  { id: 'mn-features', en: 'HOW TO', label: '画面ごとの使い方' },
  { id: 'mn-trouble', en: 'TROUBLE', label: '困ったとき' },
  { id: 'mn-faq', en: 'FAQ', label: 'よくある質問' },
  { id: 'mn-voice', en: 'VOICE & LIVE', label: '音声コールと配信' },
];

/** 見えている区画を目次で示す */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = ids.map(id => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: '-20% 0px -70% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

// ─── 部品 ───────────────────────────────────────────────────────────

function Section({ id, en, title, lead, children }: { id: string; en: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mn-sec rv" aria-labelledby={`${id}-h`}>
      <div className="mn-sec__head">
        <span className="mn-sec__mark" aria-hidden="true" />
        <p className="mn-sec__en">{en}</p>
        <h2 id={`${id}-h`} className="mn-sec__title">{title}</h2>
        {lead && <p className="mn-sec__lead">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

function Accordion({
  icon: Icon, title, summary, open, onToggle, children,
}: {
  icon: React.ElementType; title: string; summary: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`mn-acc ${open ? 'is-open' : ''}`}>
      <button onClick={onToggle} className="mn-acc__btn" aria-expanded={open}>
        <Icon className="mn-acc__ico" />
        <span className="mn-acc__titles">
          <span className="mn-acc__title">{title}</span>
          <span className="mn-acc__sum">{summary}</span>
        </span>
        <ChevronDown className="mn-acc__chev" />
      </button>
      <div className={`sk-collapse ${open ? 'is-open' : ''}`}>
        <div><div className="mn-acc__body">{children}</div></div>
      </div>
    </div>
  );
}

// ─── 本体 ───────────────────────────────────────────────────────────

export default function Manual() {
  // 端末の切り替え。初期値は今見ている画面の幅で決める。
  const [device, setDevice] = useState<Device>(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches ? 'pc' : 'mobile'
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setDevice(mq.matches ? 'pc' : 'mobile');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const [openFeature, setOpenFeature] = useState<string | null>('hub');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocIds] = useState(() => TOC.map(x => x.id));
  const active = useActiveSection(tocIds);

  const isPc = device === 'pc';
  const tap = isPc ? 'クリック' : 'タップ';

  return (
    <div className="container mn">
      {/* はじめに＋端末の切り替え */}
      <div className="mn-intro">
        <p className="mn-intro__lead">
          実際の画面にそって、大会当日の使い方を説明します。流れは
          <b>ログイン → 大会選択 → 確認・修正 → 運営をはじめる → エントリー受付</b>
          です。選手・所属のふりがなは、メニューの「選手・所属」でいつでも直せます。
        </p>
        <div className="mn-intro__dev">
          <div className="hub-filter" role="tablist" aria-label="説明する端末">
            {([
              { id: 'mobile' as const, label: 'スマホ', icon: Smartphone },
              { id: 'pc' as const, label: 'パソコン', icon: Monitor },
            ]).map(o => (
              <button
                key={o.id}
                role="tab"
                aria-selected={device === o.id}
                onClick={() => setDevice(o.id)}
                className={`hub-filter__btn mn-dev__btn ${device === o.id ? 'is-on' : ''}`}
              >
                <o.icon className="w-4 h-4" />{o.label}
              </button>
            ))}
          </div>
          <p className="mn-intro__note">{isPc ? 'パソコンでの操作を表示しています。' : 'スマホでの操作を表示しています。'}</p>
        </div>
      </div>

      <div className="mn-layout">
        {/* 目次（PC は貼り付き、スマホは開閉） */}
        <nav className={`mn-toc ${tocOpen ? 'is-open' : ''}`} aria-label="目次">
          <button className="mn-toc__head" onClick={() => setTocOpen(v => !v)} aria-expanded={tocOpen}>
            <List className="w-4 h-4" />
            <span className="mn-toc__en">CONTENTS</span>
            <span className="mn-toc__ja">目次</span>
            <ChevronDown className="mn-toc__chev" />
          </button>
          <div className={`sk-collapse mn-toc__wrap ${tocOpen ? 'is-open' : ''}`}>
            <div>
              <ol className="mn-toc__list">
                {TOC.map((x, i) => (
                  <li key={x.id}>
                    <a
                      href={`#${x.id}`}
                      className={`mn-toc__link ${active === x.id ? 'is-on' : ''}`}
                      aria-current={active === x.id ? 'true' : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        // スマホは目次を畳んでから（畳む動きで位置がずれないように）移る
                        if (tocOpen) { setTocOpen(false); window.setTimeout(() => jump(x.id), 380); } else jump(x.id);
                      }}
                    >
                      <span className="mn-toc__no">{String(i + 1).padStart(2, '0')}</span>
                      <span>{x.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </nav>

        <div className="mn-content">
          {/* 1. まずはこれだけ */}
          <Section id="mn-start" en="QUICK START" title="まずはこれだけ" lead="この 3 つができれば大会は回せます。">
            <ol className="steps mn-steps">
              <li className="step">
                <h3 className="step__title">大会を選んではじめる</h3>
                <p className="step__text">{t(MENU, device)}「大会選択」で当日の大会の「確認して運営をはじめる」。ドローを確かめて「運営をはじめる」。</p>
              </li>
              <li className="step">
                <h3 className="step__title">受付して確定する</h3>
                <p className="step__text">「エントリー」で来た人を受付し、種目ごとに「確定」。</p>
              </li>
              <li className="step">
                <h3 className="step__title">ドローで進行する</h3>
                <p className="step__text">「対戦順」でコートに入れ、「ドロー」の枠を{tap}してスコアを入れる。</p>
              </li>
            </ol>
          </Section>

          {/* 2. 当日の流れ */}
          <Section id="mn-flow" en="FLOW" title="大会当日の流れ" lead="上から順に進めれば運営できます。">
            <ol className="mn-flow">
              {FLOW_STEPS.map((s, i) => (
                <li key={s.title} className="mn-flow__item">
                  <span className="mn-flow__no">{String(i + 1).padStart(2, '0')}</span>
                  <div className="mn-flow__body">
                    <div className="mn-flow__head">
                      <s.icon className="mn-flow__ico" />
                      <h3 className="mn-flow__title">{s.title}</h3>
                      <span className="sk-chip">{s.timing}</span>
                    </div>
                    <p className="mn-flow__text">{t(s.body, device)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          {/* 3. 画面の見かた */}
          <Section
            id="mn-screens"
            en="SCREENS"
            title="画面の見かた"
            lead={isPc ? 'パソコンの画面で説明します。番号は下の説明と対応しています。' : 'スマホの画面で説明します。番号は下の説明と対応しています。'}
          >
            <div className="mn-figs">
              <ScreenFigure
                en="MENU"
                title={isPc ? 'メニュー（画面の上に並びます）' : 'メニュー（右上の三本線で開きます）'}
                points={[
                  { n: 1, text: isPc ? '上のメニューで「大会準備」「大会進行」などのまとまりを選びます。' : '三本線を押すと黒地のメニューが開きます。もう一度押すと閉じます。' },
                  { n: 2, text: isPc ? 'まとまりの中の画面は、見出しの下のタブで切り替えます。' : 'メニューには画面が 2 列で並びます。押すとその画面に移ります。' },
                  { n: 3, text: '観戦ページ（参加者向けの読み取り専用ページ）を別のタブで開きます。' },
                ]}
              >
                <MenuMockup device={device} />
              </ScreenFigure>

              <ScreenFigure
                en="SELECT"
                title="大会選択"
                points={[
                  { n: 1, text: '「これから」「終わった大会」「すべて」で絞り込みます。' },
                  { n: 2, text: '「確認して運営をはじめる」で確認・修正の画面に進みます。' },
                  { n: 3, text: '「ドローを確認・修正」は、端末に入れずにドローだけを見直すときに使います。' },
                ]}
              >
                <HubMockup device={device} />
              </ScreenFigure>

              <ScreenFigure
                en="CHECK"
                title="ドロー確認（確認・修正）"
                points={[
                  { n: 1, text: '直すべき所（要修正）・念のため見ておく所（要確認）の件数。' },
                  { n: 2, text: '種目のタブ。押すとその種目のドローに切り替わります。' },
                  { n: 3, text: '行の右のボタンで入れ替え・名前の修正ができます。' },
                  { n: 4, text: '確認が済んだら「運営をはじめる」。端末に入り、エントリー受付に進みます。' },
                ]}
              >
                <ReviewMockup device={device} />
              </ScreenFigure>

              <ScreenFigure
                en="PLAYERS"
                title="選手・所属（ふりがな辞書）"
                points={[
                  { n: 1, text: '「選手」「所属」を切り替えます。数字は登録数です。' },
                  { n: 2, text: '鉛筆のボタンで読みを直します。直すとほかの端末にも届きます。' },
                ]}
              >
                <DictMockup device={device} />
              </ScreenFigure>

              <ScreenFigure
                en="ENTRY"
                title="エントリー受付"
                points={[
                  { n: 1, text: `来た人の「受付」を${tap}します。欠場の人は欠場にします。` },
                  { n: 2, text: '「全員受付」でまとめて受付、「確定」でその種目の試合が対戦順に並びます。' },
                ]}
              >
                <EntryMockup device={device} />
              </ScreenFigure>

              <ScreenFigure
                en="ORDER OF PLAY"
                title="対戦順"
                points={[
                  { n: 1, text: '次に入れられる試合。「コートに入れる」で空いているコートを選びます。' },
                  { n: 2, text: '音声ボタンで選手を呼び出します。' },
                ]}
              >
                <OrderMockup device={device} />
              </ScreenFigure>

              <ScreenFigure
                en="DRAW"
                title="ドロー画面の上部"
                points={[
                  { n: 1, text: '種目名。左右の矢印で切り替え、名前を押すと一覧から選べます。' },
                  { n: 2, text: 'その種目の進み具合（終わった試合数）。' },
                  { n: 3, text: '表示する回戦。「ALL 1R〜」から右で先の回戦だけに絞れます。押すと自動に戻ります。' },
                  { n: 4, text: '結果画像。種目の全試合が終わると出ます。' },
                  { n: 5, text: 'あたり・名前・ゲームルールの修正メニュー。' },
                ]}
              >
                <DrawHeaderMockup />
              </ScreenFigure>

              <ScreenFigure
                en="DRAW"
                title="ドロー表の枠の見かた"
                points={[
                  { n: 1, text: 'ドロー番号（ペアの真ん中に区切って出ます）。' },
                  { n: 2, text: 'ダブルスはペアを 1 人ずつ 2 行で表示します。' },
                  { n: 3, text: '所属。2 人で違うときはそれぞれの行に出ます。' },
                  { n: 4, text: 'スコア。勝った側が赤、負けた側がグレーです。' },
                  { n: 5, text: '勝ち上がりの線は赤くなり、勝者が次の回戦へ進みます。' },
                ]}
              >
                <DrawCardMockup />
              </ScreenFigure>

              <ScreenFigure
                en="SCORE"
                title={`試合中の枠（${tap}でスコア入力）`}
                points={[
                  { n: 1, text: '入っているコート番号。試合中は枠が赤くなります。' },
                  { n: 2, text: `枠を${tap}するとスコア入力が開きます。` },
                ]}
              >
                <MatchCardMockup device={device} />
              </ScreenFigure>

              <ScreenFigure
                en="SETTINGS"
                title={isPc ? '設定ページ（開いた状態で表示されます）' : '設定ページ（畳んだ状態で表示されます）'}
                points={[
                  { n: 1, text: isPc ? '見出しの右の矢印で畳めます。' : '見出しの右の矢印で開きます。使う項目だけ開いてください。' },
                ]}
              >
                <SettingsMockup device={device} />
              </ScreenFigure>

              <ScreenFigure
                en="RESULT"
                title="結果画像のプレビュー"
                points={[
                  { n: 1, text: '表示幅でトーナメント表の横幅を調整できます（既定は 70%。リーグ戦では出ません）。' },
                  { n: 2, text: '保存ボタンで JPEG として端末に保存します。' },
                ]}
              >
                <ResultPreviewMockup device={device} />
              </ScreenFigure>
            </div>
          </Section>

          {/* 4. 機能ごとの使い方 */}
          <Section id="mn-features" en="HOW TO" title="画面ごとの使い方" lead="見出しを押すと開きます。">
            <div className="mn-accs">
              {FEATURES.map(f => (
                <Accordion
                  key={f.id}
                  icon={f.icon}
                  title={f.title}
                  summary={f.summary}
                  open={openFeature === f.id}
                  onToggle={() => setOpenFeature(openFeature === f.id ? null : f.id)}
                >
                  <ol className="mn-num">
                    {f.steps.map((s, i) => (
                      <li key={i}>
                        <span className="mn-num__n">{i + 1}</span>
                        <span>{t(s, device)}</span>
                      </li>
                    ))}
                  </ol>
                  {f.tips && f.tips.length > 0 && (
                    <div className="sk-note sk-note--red mn-tips">
                      {f.tips.map((tip, i) => (
                        <p key={i}><Lightbulb className="w-4 h-4" /><span>{tip}</span></p>
                      ))}
                    </div>
                  )}
                </Accordion>
              ))}
            </div>
          </Section>

          {/* 5. 困ったとき */}
          <Section id="mn-trouble" en="TROUBLE" title="困ったとき" lead="よくあるつまずきと直し方です。">
            <ul className="mn-trouble">
              {TROUBLES.map((tr, i) => (
                <li key={i}>
                  <p className="mn-trouble__q"><AlertTriangle className="w-4 h-4" />{tr.problem}</p>
                  <p className="mn-trouble__a">{tr.solution}</p>
                </li>
              ))}
            </ul>
          </Section>

          {/* 6. よくある質問 */}
          <Section id="mn-faq" en="FAQ" title="よくある質問">
            <div className="mn-faq">
              {FAQS.map((f, i) => (
                <div key={i} className={`mn-faq__item ${openFaq === i ? 'is-open' : ''}`}>
                  <button className="mn-faq__q" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                    <span className="mn-faq__mark">Q.</span>
                    <span className="mn-faq__text">{f.q}</span>
                    <ChevronDown className="mn-acc__chev" />
                  </button>
                  <div className={`sk-collapse ${openFaq === i ? 'is-open' : ''}`}>
                    <div>
                      <p className="mn-faq__a"><span className="mn-faq__mark mn-faq__mark--a">A.</span><span>{t(f.a, device)}</span></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 7. 音声・配信の補足 */}
          <Section id="mn-voice" en="VOICE & LIVE" title="音声コールと配信について">
            <ul className="mn-points">
              <li><Radio className="w-4 h-4" />ライブ配信はコートサイドの端末で開き、選手名を押すだけでポイントが進みます。</li>
              <li><Volume2 className="w-4 h-4" />読み上げは端末内蔵の音声が既定です。より自然な声にしたいときは「設定」→「音声」で切り替えます。読みは「選手・所属」のふりがなを使います。</li>
              <li><Wifi className="w-4 h-4" />同期していないと、ほかの端末や観戦ページには反映されません。</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
