/**
 * Instagram のストーリーズ告知の画像（1080×1920）を canvas に描く。
 * 見た目は協会の告知画像（tcta-insta-taikai の型）と同じ：左上に協会ロゴ、写真を斜めに切って白へぼかし、
 * 大会名、黒い帯の見出し、赤い帯に大きな日付、情報の行、四角の飾り（赤い立体・白い立体・薄いピンク・赤い枠・赤い点）。
 *
 * 文字はすべて y=285〜1635（フィードの 4:5 で切り抜いても入る範囲）に収め、上下の帯には飾りと「プロフィールのリンクから」だけを置く。
 *
 *   要項・受付開始 … 赤い帯は「申込締切」の日付。行は 日程・会場・種目
 *   ドロー        … 赤い帯は「開催日」。行は 日程・会場・種目
 *   結果          … 写真は種目ごとの優勝者を横に並べる。赤い帯は「開催日」。行は種目ごとの優勝者
 */

export type StoryKind = 'outline' | 'draw' | 'result';

export interface StoryItem {
  key: string;
  kind: StoryKind;
  date: string;
  title: string;
  url: string | null;
  event: {
    slug: string; name: string; nendoLabel: string; date: string; label: string; place: string;
    event: string; due: string; spareDate: string; spareNote: string; status: string;
  } | null;
  winners: { category: string; places: { award: string; name: string }[] }[];
  photos: { src: string | null; category: string; caption: string | null }[];
  sheet: { src: string | null; w?: number; h?: number } | null;
  cover: string | null;
}

export const STORY_W = 1080;
export const STORY_H = 1920;

const RED = '#e1141e';
const INK = '#111111';
const FF = '"Noto Sans JP", "Hiragino Sans", sans-serif';
const WD = ['日', '月', '火', '水', '木', '金', '土'];

const font = (weight: number, px: number) => `${weight} ${px}px ${FF}`;

/** 画像を読み込む（協会サイトの画像は、この Worker の中継を通して読む。canvas を書き出せるように） */
export function loadImage(src: string, proxy = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = proxy && /^https?:/.test(src) ? `/api/insta/proxy?u=${encodeURIComponent(src)}` : src;
  });
}

/** 'YYYY-MM-DD' → { y, m, d, w } */
function ymd(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, w: WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

/** 申込締切（「11/13」の形）を、開催日の年で 'YYYY-MM-DD' に。年をまたぐときは前の年。読めなければ null */
export function dueIso(due: string, date: string): string | null {
  const m = String(due ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})/);
  if (!m || !date) return null;
  const [y, em] = date.split('-').map(Number);
  const month = Number(m[1]);
  const year = month > em ? y - 1 : y;
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

/** 令和の年 */
const reiwa = (y: number) => `令和${y - 2018}年`;

/** 文字の幅に収まる大きさ（max から下げていく） */
function fitPx(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number): number {
  for (let px = max; px > min; px -= 2) {
    ctx.font = font(weight, px);
    if (ctx.measureText(text).width <= width) return px;
  }
  return min;
}

/** 長い大会名を 2 行に分ける（「 」や「・」「（」の前で、なるべく半分に近いところ） */
function splitTitle(name: string): [string, string] {
  const mid = name.length / 2;
  let best = -1;
  for (let i = 1; i < name.length; i++) {
    if (/[ \u3000・（(]/.test(name[i]) || /[杯会戦]/.test(name[i - 1])) {
      if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
    }
  }
  if (best < 0) best = Math.ceil(mid);
  return [name.slice(0, best).trim(), name.slice(best).trim()];
}

// ---- 飾りの四角 ----
type Deco = 'cubeR' | 'cubeW' | 'glass' | 'line' | 'lineW' | 'dots' | 'dotsW';
function deco(ctx: CanvasRenderingContext2D, kind: Deco, x: number, y: number, w: number, h: number, rotDeg: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotDeg * Math.PI) / 180);
  const L = -w / 2, T = -h / 2;
  if (kind === 'cubeR' || kind === 'cubeW') {
    ctx.shadowColor = kind === 'cubeR' ? 'rgba(120,0,0,.28)' : 'rgba(0,0,0,.18)';
    ctx.shadowBlur = 10; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 7;
    const g = ctx.createLinearGradient(L, T, L + w, T + h);
    if (kind === 'cubeR') { g.addColorStop(0, '#ff3b3b'); g.addColorStop(.45, RED); g.addColorStop(1, '#b30d14'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(.6, '#f3f3f3'); g.addColorStop(1, '#e2e2e2'); }
    ctx.fillStyle = g;
    ctx.fillRect(L, T, w, h);
  } else if (kind === 'glass') {
    ctx.fillStyle = 'rgba(245,120,120,.30)';
    ctx.fillRect(L, T, w, h);
    ctx.strokeStyle = 'rgba(240,110,110,.45)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(L, T, w, h);
  } else if (kind === 'line' || kind === 'lineW') {
    ctx.strokeStyle = kind === 'line' ? RED : 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5;
    ctx.strokeRect(L, T, w, h);
  } else {
    ctx.fillStyle = kind === 'dots' ? RED : 'rgba(255,255,255,.7)';
    for (let yy = T + 11; yy < T + h; yy += 22) for (let xx = L + 11; xx < L + w; xx += 22) {
      ctx.beginPath(); ctx.arc(xx, yy, 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** 画像を枠いっぱいに切り抜いて描く（object-fit: cover。縦の位置は posY 0〜1） */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, posY = 0.3) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) * posY;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export interface StoryAssets {
  logo: HTMLImageElement | null;
  /** 結果は優勝者の写真（種目の順）、それ以外は1枚（当日の写真か、ドロー・要項の画像） */
  photos: HTMLImageElement[];
  /** 写真が資料（ドロー・要項の画像）か。資料は上の方を見せる */
  isSheet: boolean;
}

/** 画像に使うものを読み込む */
export async function loadStoryAssets(item: StoryItem): Promise<StoryAssets> {
  const logo = await loadImage('/logo-tcta.png', false);
  if (item.kind === 'result') {
    const srcs = item.photos.map((p) => p.src).filter((s): s is string => !!s).slice(0, 5);
    const imgs = (await Promise.all(srcs.map((s) => loadImage(s)))).filter((i): i is HTMLImageElement => !!i);
    if (imgs.length) return { logo, photos: imgs, isSheet: false };
  }
  const src = item.cover ?? item.sheet?.src ?? null;
  const img = src ? await loadImage(src) : null;
  return { logo, photos: img ? [img] : [], isSheet: !item.cover && !!item.sheet?.src };
}

/** ストーリーズの画像を描く */
export function drawStory(canvas: HTMLCanvasElement, item: StoryItem, assets: StoryAssets) {
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext('2d')!;
  const e = item.event;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  ctx.textBaseline = 'alphabetic';

  // 上の帯（ストーリーズだけに見える）の飾り
  deco(ctx, 'cubeW', 120, 120, 120, 120, -12);
  deco(ctx, 'glass', 300, 60, 110, 110, 14);
  deco(ctx, 'cubeR', 470, 170, 40, 40, 12);
  deco(ctx, 'dots', 560, 70, 180, 120, 14, .7);
  deco(ctx, 'line', 800, 150, 80, 80, 14);
  deco(ctx, 'cubeR', 930, 60, 96, 96, 16);
  deco(ctx, 'glass', -30, 20, 90, 90, 10);

  // 結果は優勝者の行が多い（最大5行）ので、写真を低くして下を詰める
  const dy = item.kind === 'result' ? -80 : 0;
  // 写真（y 396〜916。下を斜めに切って白へぼかす）
  const PY = 396, PH = 520 + dy;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, PY + 24); ctx.lineTo(STORY_W, PY); ctx.lineTo(STORY_W, PY + PH - 24); ctx.lineTo(0, PY + PH); ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, PY, STORY_W, PH);
  const n = assets.photos.length;
  if (n > 1) {
    const gap = 8, w = (STORY_W - gap * (n - 1)) / n;
    assets.photos.forEach((img, i) => drawCover(ctx, img, i * (w + gap), PY, w, PH, 0.35));
  } else if (n === 1) {
    drawCover(ctx, assets.photos[0], 0, PY, STORY_W, PH, assets.isSheet ? 0 : 0.35);
  }
  const fade = ctx.createLinearGradient(0, PY, 0, PY + PH);
  fade.addColorStop(.66, 'rgba(255,255,255,0)');
  fade.addColorStop(1, 'rgba(255,255,255,.92)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, PY, STORY_W, PH);
  ctx.restore();

  // 結果は、写真の下に種目の名前を小さく入れる
  if (item.kind === 'result' && n > 1) {
    const gap = 8, w = (STORY_W - gap * (n - 1)) / n;
    item.photos.slice(0, n).forEach((p, i) => {
      const label = shortCategory(p.category);
      ctx.font = font(700, n >= 5 ? 17 : 20);
      const tw = ctx.measureText(label).width;
      const x = i * (w + gap) + (w - tw) / 2 - 8;
      ctx.fillStyle = RED;
      ctx.fillRect(x, PY + PH - 92, tw + 16, n >= 5 ? 28 : 32);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 8, PY + PH - 92 + (n >= 5 ? 21 : 24));
    });
  }

  // ヘッダーの飾りとロゴ
  deco(ctx, 'glass', 330, 300, 50, 50, 12);
  deco(ctx, 'cubeR', 404, 346, 20, 20, 14);
  deco(ctx, 'dots', 470, 300, 130, 66, 12, .7);
  deco(ctx, 'cubeW', 650, 326, 30, 30, -8);
  deco(ctx, 'line', 740, 300, 40, 40, 12);
  if (assets.logo) {
    const w = 210, h = (assets.logo.naturalHeight / assets.logo.naturalWidth) * w;
    ctx.drawImage(assets.logo, 64, 306, w, h);
  }
  ctx.fillStyle = INK;
  ctx.font = font(500, 14);
  ctx.textAlign = 'right';
  ctx.fillText('P L A Y', STORY_W - 64, 326);
  ctx.fillText('B E Y O N D .', STORY_W - 64, 350);
  ctx.textAlign = 'left';
  ctx.fillStyle = RED;
  ctx.fillRect(STORY_W - 64 - 52, 360, 52, 3);

  // 小見出し・年度・大会名
  const eyebrow = { outline: 'E N T R Y', draw: 'D R A W', result: 'R E S U L T S' }[item.kind];
  ctx.fillStyle = RED;
  ctx.fillRect(66, 938 + dy, 60, 4);
  ctx.fillStyle = INK;
  ctx.font = font(500, 14);
  ctx.fillText(`${eyebrow}   ·   T O T T O R I   T E N N I S`, 146, 945 + dy);
  ctx.font = font(700, 36);
  ctx.fillText(e?.nendoLabel ?? '', 64, 1000 + dy);
  const name = e?.name ?? item.title;
  let titleBottom: number;
  const px1 = fitPx(ctx, name, 700, 72, 54, 952);
  ctx.font = font(700, px1);
  if (ctx.measureText(name).width <= 952) {
    ctx.fillText(name, 60, 1078 + dy);
    titleBottom = 1078 + dy;
  } else {
    const [a, b] = splitTitle(name);
    const px2 = Math.min(fitPx(ctx, a, 700, 64, 40, 952), fitPx(ctx, b, 700, 64, 40, 952));
    ctx.font = font(700, px2);
    ctx.fillText(a, 60, 1048 + dy);
    ctx.fillText(b, 60, 1048 + dy + px2 * 1.12);
    titleBottom = 1048 + dy + px2 * 1.12;
  }

  // 黒い帯の見出し
  const cta = { outline: '出場者募集', draw: 'ドロー公開', result: '大会結果' }[item.kind];
  const ctaY = titleBottom + 26;
  ctx.font = font(700, 28);
  const ctaW = Math.max(300, ctx.measureText(cta).width + 120);
  ctx.fillStyle = INK;
  ctx.fillRect(66, ctaY, ctaW, 54);
  ctx.fillStyle = '#fff';
  ctx.fillText(spaced(cta), 100, ctaY + 37);
  ctx.font = font(400, 28);
  ctx.fillText('→', 66 + ctaW - 54, ctaY + 37);
  deco(ctx, 'cubeR', 900, ctaY - 6, 64, 64, 14);
  deco(ctx, 'line', 760, ctaY + 6, 44, 44, 16);
  deco(ctx, 'dots', 560, ctaY + 4, 140, 48, 0, .6);

  // 赤い帯の大きな日付
  const bandY = ctaY + 78;
  const bandIso = item.kind === 'outline' && e ? dueIso(e.due, e.date) : e?.date ?? null;
  const bandLabel = item.kind === 'outline' ? ['申込', '締切', 'DEADLINE'] : ['開催', '日', 'DATE'];
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(0, bandY + 18); ctx.lineTo(STORY_W, bandY); ctx.lineTo(STORY_W, bandY + 218); ctx.lineTo(0, bandY + 236); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.strokeRect(66, bandY + 52, 124, 134);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  if (bandLabel[1].length === 1) {
    ctx.font = font(700, 30); ctx.fillText(bandLabel[0] + bandLabel[1], 128, bandY + 128);
  } else {
    ctx.font = font(700, 32); ctx.fillText(bandLabel[0], 128, bandY + 106); ctx.fillText(bandLabel[1], 128, bandY + 144);
  }
  ctx.font = font(500, 12); ctx.fillText(bandLabel[2].split('').join(' '), 128, bandY + 172);
  ctx.textAlign = 'left';
  if (bandIso) {
    const d = ymd(bandIso);
    ctx.font = font(700, 28);
    ctx.fillText(reiwa(d.y), 230, bandY + 66);
    let x = 222;
    const big = (t: string) => { ctx.font = font(700, 150); ctx.fillText(t, x, bandY + 200); x += ctx.measureText(t).width - 4; };
    const unit = (t: string) => { ctx.font = font(700, 56); ctx.fillText(t, x + 4, bandY + 200); x += ctx.measureText(t).width + 10; };
    big(String(d.m)); unit('月'); big(String(d.d)); unit('日');
    ctx.font = font(700, 52);
    const ww = ctx.measureText(d.w).width + 20;
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 8, bandY + 112, ww, 70);
    ctx.fillStyle = RED; ctx.fillText(d.w, x + 18, bandY + 166);
  } else {
    ctx.font = font(700, 56);
    ctx.fillText(e?.label || e?.due || '', 230, bandY + 160);
  }
  deco(ctx, 'dotsW', 900, bandY + 38, 130, 90, 14);
  deco(ctx, 'lineW', 960, bandY + 148, 40, 40, 14);

  // 情報の行
  let rowY = bandY + 256;
  const rows: [string, string, string?][] = [];
  if (item.kind === 'result') {
    for (const w of item.winners.slice(0, 5)) {
      const champ = w.places.find((p) => /優勝/.test(p.award)) ?? w.places[0];
      if (champ) rows.push([shortCategory(w.category), `${champ.award}\u3000${champ.name.replace(/\s*(選手|ペア)$/, '')}`, /・/.test(champ.name) ? 'ペア' : '選手']);
    }
  } else if (e) {
    const d = ymd(e.date);
    rows.push(['日程', `${d.m}月${d.d}日（${d.w}）`, e.spareDate ? `予備日 ${fmtShort(e.spareDate)}` : '']);
    rows.push(['会場', e.place]);
    if (e.event) rows.push(['種目', e.event]);
  }
  const rowH = rows.length > 4 ? 52 : 58;
  // 結果は種目名が長い（「男子45歳以上シングルス」）ので、種目の欄を広くする
  const sepX = item.kind === 'result' ? 420 : 262;
  for (const [label, value, small] of rows.slice(0, 5)) {
    ctx.fillStyle = RED;
    ctx.fillRect(66, rowY + rowH / 2 - 6, 12, 12);
    ctx.fillStyle = '#444';
    ctx.font = font(500, 18);
    if (item.kind === 'result') ctx.font = font(700, fitPx(ctx, label, 700, 21, 15, sepX - 110));
    const lb = fitText(ctx, label, sepX - 110);
    ctx.fillText(lb, 96, rowY + rowH / 2 + 7);
    ctx.fillStyle = '#ddd'; ctx.fillRect(sepX, rowY + 14, 1.5, rowH - 28);
    ctx.fillStyle = INK;
    const vx = sepX + 26;
    const vpx = fitPx(ctx, value, 700, 24, 16, (small ? 900 - 160 : 980) - vx);
    ctx.font = font(700, vpx);
    ctx.fillText(value, vx, rowY + rowH / 2 + 8);
    if (small) {
      const vw = ctx.measureText(value).width;
      ctx.font = font(400, 17); ctx.fillStyle = '#444';
      ctx.fillText(small, vx + vw + 14, rowY + rowH / 2 + 8);
    }
    ctx.fillStyle = '#e4e4e4';
    ctx.fillRect(52, rowY + rowH - 1, 976, 1.5);
    rowY += rowH;
  }

  // 下の帯（ストーリーズだけに見える）
  ctx.fillStyle = INK;
  ctx.font = font(700, 26);
  const pre = { outline: '詳細・申込方法は ', draw: 'ドロー・詳細は ', result: '結果表・写真は ' }[item.kind];
  ctx.fillText(pre, 66, 1690);
  let fx = 66 + ctx.measureText(pre).width;
  ctx.fillStyle = RED; ctx.fillText('プロフィールのリンク', fx, 1690); fx += ctx.measureText('プロフィールのリンク').width;
  ctx.fillStyle = INK; ctx.fillText(' から ▶', fx, 1690);
  ctx.fillStyle = RED; ctx.fillRect(66, 1762, 52, 3);
  ctx.fillStyle = INK; ctx.font = font(500, 13);
  ctx.fillText('T O T T O R I   T E N N I S   A S S O C I A T I O N', 140, 1768);
  deco(ctx, 'cubeR', 880, 1720, 100, 100, 14);
  deco(ctx, 'glass', 760, 1790, 90, 90, -12);
  deco(ctx, 'line', 660, 1720, 56, 56, 12);
  deco(ctx, 'cubeW', 120, 1820, 60, 60, -10);
  deco(ctx, 'dots', 300, 1800, 200, 90, 12, .6);
  deco(ctx, 'cubeR', 560, 1850, 30, 30, 16);
  deco(ctx, 'glass', -24, 1790, 80, 80, 14);
}

/** 「一般男子シングルス」→ そのまま。「男子ダブルス45歳以上」などもそのまま（長いものだけ詰める） */
function shortCategory(c: string): string {
  return String(c ?? '').replace(/\s+/g, '');
}
/** 'YYYY-MM-DD' → '11月28日（土）' */
function fmtShort(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = ymd(iso.slice(0, 10));
  return `${d.m}月${d.d}日（${d.w}）`;
}
/** 見出しの字間を少しあける */
function spaced(s: string): string {
  return s.split('').join(' ');
}
/** 幅に収まらなければ末尾を「…」にする */
function fitText(ctx: CanvasRenderingContext2D, s: string, width: number): string {
  if (ctx.measureText(s).width <= width) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > width) t = t.slice(0, -1);
  return t + '…';
}

/** canvas を JPEG に */
export function storyJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), 'image/jpeg', 0.92));
}
