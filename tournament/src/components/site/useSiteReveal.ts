// 協会サイトと同じ「スクロールして見えてきたら、下から少し浮き上がって出る」動き（サイトの main.js の initReveal）を、
// 運営画面・観戦ページの全部の画面にかける。
//   ・ページ見出しの右の大きな英字（.ghost）は右からすべり込む（サイトの CSS の body.jsrv .ghost）
//   ・.rv を付けたまとまりは浮き上がって出る（見出しの文字はスラッシュが抜けて黒くなる）
//   ・画面の中身の区画（ページのいちばん外の箱の子）・大会のカード・辞書の行などは、1 枚ずつ少しずらして浮き上がる（.rv-in）
// サイトと違い、運営画面は文書全体ではなく main の中がスクロールするので、main を見張り役の基準にする。
// あとから描かれる部分（データの読み込み後・タブの切り替え）も MutationObserver で拾う。
// 動きを減らす設定・軽量モード（html.is-lite）では何もしない（そのまま表示）。
import { useEffect, type RefObject } from 'react';

/** 1 枚ずつ浮き上がらせるもの（ページのいちばん外の箱の子に加えて） */
const ITEMS = [
  '.tl__card', '.hub-panel', '.dict-row', '.hub-group__title', '.hub-missing', '.hub-empty',
  '.app-panel', '.rlist > li', '.pdfbtn',
].join(', ');
/** 動かさないもの（貼り付く操作欄・ポップアップ・画面いっぱいの図・印刷） */
const SKIP = '.sticky, [class*="sticky"], .fixed, .sdlg, [data-no-reveal], .app-main--fill, .status-bar';

export function useSiteReveal(rootRef: RefObject<HTMLElement | null>, key: string): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || document.documentElement.classList.contains('is-lite')) return;
    document.body.classList.add('jsrv');

    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver((entries) => {
      let k = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        if (el.classList.contains('rv-in')) el.style.setProperty('--rvi', String(Math.min(k++, 8)));
        el.classList.add('on');
        io.unobserve(el);
      }
    }, { root, threshold: 0, rootMargin: '0px 0px -8% 0px' });

    const watch = (el: Element, cls?: string) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (cls) el.classList.add(cls);
      io.observe(el);
    };

    const scan = () => {
      root.querySelectorAll('.ghost, .rv').forEach((el) => watch(el));
      const page = root.querySelector('.app-page');
      const candidates: Element[] = [];
      if (page) {
        // ページの中身のいちばん外の箱の子（区画・カード）。中身が 1 つの箱だけのときは、その中の子まで下りる
        let box: Element | null = page.firstElementChild;
        for (let depth = 0; box && box.children.length === 1 && depth < 3; depth++) box = box.firstElementChild;
        if (box) candidates.push(...Array.from(box.children));
      }
      candidates.push(...Array.from(root.querySelectorAll(ITEMS)));
      for (const el of candidates) {
        if (seen.has(el) || el.closest(SKIP) || el.matches(SKIP)) continue;
        const h = el as HTMLElement;
        // 中身の無い箱・ひとまとまりの大きすぎる図（画面 3 枚ぶんより高い）は動かさない
        if (!h.offsetHeight || h.offsetHeight > window.innerHeight * 3) { seen.add(el); continue; }
        // カードや行を含む区画は、区画ごとではなく中のカード・行を 1 枚ずつ動かす（サイトの一覧と同じ）
        if (h.querySelector(ITEMS)) { seen.add(el); continue; }
        // 入れ子（すでに動かす箱の中の箱）は、外側だけを動かす
        if (h.parentElement?.closest('.rv-in')) { seen.add(el); continue; }
        watch(el, 'rv-in');
      }
    };

    // 浮き上がりが終わったら animation を外す（transform の動きが残ったままだと、中の position: fixed の
    // ポップアップがその箱を基準にずれて出るため）
    const onEnd = (e: AnimationEvent) => {
      const el = e.target as HTMLElement;
      if (e.animationName === 'rv-in-up' && el.classList.contains('rv-in')) el.classList.add('rv-done');
    };
    root.addEventListener('animationend', onEnd);
    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; scan(); }); };
    scan();
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true });
    // 万一見張りが届かなかった分（画面の外で消えた箱など）は 2.5 秒で出しておく（隠れたままにしない）
    const safety = window.setTimeout(() => {
      root.querySelectorAll('.rv-in:not(.on), .rv:not(.on), .ghost:not(.on)').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('on');
      });
    }, 2500);
    return () => { root.removeEventListener('animationend', onEnd); io.disconnect(); mo.disconnect(); cancelAnimationFrame(raf); clearTimeout(safety); };
  }, [rootRef, key]);
}
