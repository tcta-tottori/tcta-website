// ズーム・移動できる表示枠（エントリー受付の「対戦表」で使う）。
//   ・スマホ：2 本指でピンチして拡大・縮小、1 本指で動かす。2 回タップでその場所を拡大／全体に戻す
//   ・PC：Ctrl（Mac は ⌘）＋ホイールで拡大・縮小、ドラッグで動かす
//   ・右上のボタン：縮小・拡大・全体表示・全画面
//   ・動かしたあとに指を離しても、中のボタン（選手の枠）は押されない（タップだけが押せる）
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minimize, Minus, Plus, Scan } from 'lucide-react';

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
const TAP_SLOP = 8; // これより動いたらタップではなくドラッグ

type View = { s: number; x: number; y: number };

export default function ZoomPan({ width, height, children, label }: {
  /** 中身の実寸（px） */
  width: number;
  height: number;
  children: ReactNode;
  /** 読み上げ用の名前 */
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  useLayoutEffect(() => { viewRef.current = view; }, [view]);
  const moved = useRef(false);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  // 全体が収まる倍率
  const fitScale = vp.w && vp.h ? Math.min(vp.w / width, vp.h / height, 1.2) : 1;

  const clamp = useCallback((v: View): View => {
    const s = Math.min(MAX_SCALE, Math.max(Math.min(MIN_SCALE, fitScale), v.s));
    const cw = width * s, ch = height * s;
    // 中身が枠より小さいときは中央、大きいときは端が枠の中に来ないようにする
    const x = cw <= vp.w ? (vp.w - cw) / 2 : Math.min(0, Math.max(vp.w - cw, v.x));
    const y = ch <= vp.h ? (vp.h - ch) / 2 : Math.min(0, Math.max(vp.h - ch, v.y));
    return { s, x, y };
  }, [fitScale, width, height, vp.w, vp.h]);

  const fit = useCallback(() => setView(clamp({ s: fitScale, x: 0, y: 0 })), [clamp, fitScale]);

  /** 枠の中の点 (px, py) を動かさずに倍率を変える */
  const zoomAt = useCallback((ns: number, px: number, py: number) => {
    const v = viewRef.current;
    const s = Math.min(MAX_SCALE, Math.max(Math.min(MIN_SCALE, fitScale), ns));
    const cx = (px - v.x) / v.s, cy = (py - v.y) / v.s;
    setView(clamp({ s, x: px - cx * s, y: py - cy * s }));
  }, [clamp, fitScale]);

  // 枠の大きさ
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setVp({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 大きさが変わったら（はじめて開いたとき・全画面の出入り・種目の切り替え）全体表示に
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fit(); }, [vp.w, vp.h, width, height, full]); // eslint-disable-line react-hooks/exhaustive-deps

  // 全画面のあいだは Esc で戻る・裏の画面を動かさない
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [full]);

  // Ctrl / ⌘ ＋ホイールで拡大・縮小（ふつうのホイールはページを送る）
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && !full) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(viewRef.current.s * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      else setView((v) => clamp({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, clamp, full]);

  // 指・マウスで動かす／2 本指でピンチ
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const pts = new Map<number, { x: number; y: number }>();
    const start = { x: e.clientX, y: e.clientY };
    pts.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    moved.current = false;
    let base = { v: viewRef.current, pts: new Map(pts) };
    const rebase = () => { base = { v: viewRef.current, pts: new Map(pts) }; };

    const onMove = (ev: PointerEvent) => {
      if (!pts.has(ev.pointerId) && pts.size >= 2) return;
      pts.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
      if (pts.size !== base.pts.size) rebase();
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > TAP_SLOP || pts.size > 1) moved.current = true;
      if (!moved.current) return;
      const cur = [...pts.values()], was = [...base.pts.values()];
      if (cur.length >= 2 && was.length >= 2) {
        const d0 = Math.hypot(was[0].x - was[1].x, was[0].y - was[1].y) || 1;
        const d1 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
        const m0 = { x: (was[0].x + was[1].x) / 2, y: (was[0].y + was[1].y) / 2 };
        const m1 = { x: (cur[0].x + cur[1].x) / 2, y: (cur[0].y + cur[1].y) / 2 };
        const s = Math.min(MAX_SCALE, Math.max(Math.min(MIN_SCALE, fitScale), base.v.s * (d1 / d0)));
        const cx = (m0.x - base.v.x) / base.v.s, cy = (m0.y - base.v.y) / base.v.s;
        setView(clamp({ s, x: m1.x - cx * s, y: m1.y - cy * s }));
      } else if (cur.length === 1 && was.length === 1) {
        setView(clamp({ s: base.v.s, x: base.v.x + cur[0].x - was[0].x, y: base.v.y + cur[0].y - was[0].y }));
      }
    };
    const onUp = (ev: PointerEvent) => {
      pts.delete(ev.pointerId);
      if (pts.size > 0) { rebase(); return; }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      // 2 回タップ（枠の外の何もない所）：その場所を拡大／拡大中なら全体に戻す
      if (!moved.current && !(ev.target as HTMLElement).closest?.('button')) {
        const now = Date.now();
        const p = { x: ev.clientX - r.left, y: ev.clientY - r.top };
        const lt = lastTap.current;
        if (lt && now - lt.t < 320 && Math.hypot(lt.x - p.x, lt.y - p.y) < 30) {
          lastTap.current = null;
          if (viewRef.current.s > fitScale * 1.3) fit();
          else zoomAt(Math.max(1, fitScale * 2.2), p.x, p.y);
        } else lastTap.current = { t: now, ...p };
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const center = () => ({ x: vp.w / 2, y: vp.h / 2 });
  const pct = Math.round(view.s * 100);

  return (
    <div className={`zp ${full ? 'is-full' : ''}`}>
      <div className="zp__tools" role="toolbar" aria-label="表示の大きさ">
        <button type="button" className="zp__btn" onClick={() => zoomAt(view.s / 1.4, center().x, center().y)} aria-label="縮小"><Minus className="w-4 h-4" /></button>
        <span className="zp__pct" aria-live="polite">{pct}%</span>
        <button type="button" className="zp__btn" onClick={() => zoomAt(view.s * 1.4, center().x, center().y)} aria-label="拡大"><Plus className="w-4 h-4" /></button>
        <button type="button" className="zp__btn zp__btn--txt" onClick={fit} aria-label="全体を表示"><Scan className="w-4 h-4" /><span>全体</span></button>
        <button type="button" className="zp__btn" onClick={() => setFull((f) => !f)} aria-label={full ? '全画面をやめる' : '全画面で表示'}>
          {full ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
      <div
        ref={box}
        className="zp__box"
        role="group"
        aria-label={label}
        onPointerDown={onPointerDown}
        // ドラッグ・ピンチのあとは中のボタンを押さない
        onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } }}
        style={full ? undefined : { height: `min(72dvh, ${Math.max(220, Math.round(height * Math.min(1, (vp.w || width) / width)) + 16)}px)` }}
      >
        <div className="zp__content" style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
          {children}
        </div>
      </div>
      <p className="zp__hint">{full ? '2 本指で拡大・縮小、1 本指で移動。Esc か右上のボタンで戻る' : 'ピンチで拡大・縮小、ドラッグで移動、2 回タップで拡大／全体。選手をタップで受付'}</p>
    </div>
  );
}
