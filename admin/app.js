/* 鳥取市テニス協会 サイト更新アプリ（協会専用）
 *
 * 1ファイルの小さな SPA。画面は URL の # で切り替える。
 *   #/            ホーム（下書きの状態・近道）
 *   #/events      大会の一覧（年度ごと）
 *   #/event/<slug> 大会の編集（状態・結果画像・写真・PDF・成績）
 *   #/news        お知らせの一覧
 *   #/news/<i>    お知らせの編集（new で新規）
 *   #/preview     公開前の見え方
 *   #/publish     公開
 *   #/history     公開の履歴と「元に戻す」
 *
 * データの読み書きはすべて /api/（worker/src/api.js）。保存は「下書き」に入り、
 * 「公開」で GitHub に1コミットとして書き込まれ、数分で公開サイトに反映される。
 */
(function () {
  'use strict';

  /* ---------- API ---------- */
  const api = {
    async call(method, path, body, isForm) {
      const res = await fetch('/api' + path, {
        method,
        credentials: 'same-origin',
        headers: isForm || !body ? {} : { 'Content-Type': 'application/json' },
        body: isForm ? body : body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* 本文なし */ }
      if (res.status === 401 && path !== '/login') { state.me = null; go('#/login'); throw new Error('ログインしてください'); }
      if (!res.ok) throw new Error((data && data.error) || `エラー（${res.status}）`);
      return data;
    },
    get: (p) => api.call('GET', p),
    post: (p, b) => api.call('POST', p, b),
    put: (p, b) => api.call('PUT', p, b),
    del: (p) => api.call('DELETE', p),
    upload: (p, form) => api.call('POST', p, form, true),
  };

  /* ---------- 状態 ---------- */
  const state = { me: null, site: '', data: null, loading: false };
  const $app = document.getElementById('app');
  const $tab = document.getElementById('tabbar');
  const $draftbar = document.getElementById('draftbar');
  const $topRight = document.getElementById('top-right');

  const SECTIONS = [
    { key: 'result', label: '結果', hint: '種目ごとの結果表（ドロー・リーグ表）。1枚ずつ、種目名を付けて追加します。' },
    { key: 'photo', label: '写真', hint: '当日の写真。表彰の写真を結果の順に並べると見やすくなります。' },
    { key: 'draw', label: 'ドロー', hint: '組み合わせ。訂正版は後ろに足して「B級 修正ドロー」などと名前を付けます。' },
    { key: 'outline', label: '要項', hint: '募集要項。PDF も一緒に置けます。' },
    { key: 'entry', label: '申込用紙', hint: '' },
  ];
  const STATUS = { open: '受付中', soon: 'まもなく受付', closed: '受付終了', done: '終了' };
  const STATUS_BADGE = { open: 'badge--open', soon: 'badge--muted', closed: 'badge--muted', done: 'badge--muted' };
  const CATEGORY = { tournament: '大会', result: '結果', junior: 'ジュニア', info: 'お知らせ' };
  const PAGES = [
    ['index.html', 'トップ'], ['tournaments.html', '大会情報'], ['results.html', '大会結果'], ['club.html', 'クラブ対抗戦'],
    ['lesson.html', '水曜テニス教室'], ['tennis-day.html', 'イベント情報（テニス祭り）'], ['about.html', '協会について'],
    ['membership.html', '入会案内'], ['links.html', 'リンク集'],
  ];
  const NENDO = (n) => `令和${Number(n) - 2018}年度`;

  /* ---------- 小道具 ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (i < vals.length ? (vals[i] instanceof Raw ? vals[i].s : esc(vals[i])) : ''), '');
  class Raw { constructor(s) { this.s = s; } }
  const raw = (s) => new Raw(s);
  const go = (hash) => { location.hash = hash; };
  const fmtTime = (t) => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const today = () => { const d = new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };

  let toastTimer;
  function toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' toast--error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 2500);
  }

  async function busy(btn, fn) {
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try { await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.innerHTML = label; }
  }

  async function loadData() {
    state.data = await api.get('/data');
    renderDraftbar();
  }

  /** 大会（events.json の1件）に、大会一覧（schedule.json）の名前・日程を重ねる */
  function eventInfo(ev) {
    const sch = ev.no ? (state.data.schedule[ev.nendo] || []).find((t) => t.no === ev.no) : null;
    return { ...ev, sch, name: sch ? sch.name : ev.slug, event: sch ? sch.event : '', label: sch ? sch.label : '', status: sch ? sch.status : null };
  }
  const eventBySlug = (slug) => state.data.events.events.find((e) => e.slug === slug);
  const uploadFor = (src) => (state.data.draft?.uploads || []).find((u) => u.path === 'public/' + src);
  const imgUrl = (src) => { const u = uploadFor(src); return u ? `/api/draft/upload/${u.id}` : state.site + src; };

  function renderDraftbar() {
    const d = state.data?.draft;
    if (!d) { $draftbar.hidden = true; return; }
    $draftbar.hidden = false;
    $draftbar.innerHTML = h`<span>下書き <b>${d.log.length}件</b>（${d.editor}・${fmtTime(d.editedAt)}）</span><a href="#/publish">公開へ →</a>`;
  }

  /* ---------- 画像の縮小 ----------
     書類（要項・ドロー・結果）は長辺 1800px、写真は 1400px に縮めてから送る。
     WebP に変換できる端末では WebP、できない端末（古い iPhone など）は JPEG。 */
  function resizeImage(file, isPhoto) {
    const max = isPhoto ? 1400 : 1800;
    const quality = isPhoto ? 0.74 : 0.82;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const hh = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = hh;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
        ctx.drawImage(img, 0, 0, w, hh);
        canvas.toBlob((blob) => {
          if (blob && blob.type === 'image/webp') return resolve({ blob, w, h: hh, ext: 'webp' });
          canvas.toBlob((jpg) => jpg ? resolve({ blob: jpg, w, h: hh, ext: 'jpg' }) : reject(new Error('画像を変換できませんでした')), 'image/jpeg', quality);
        }, 'image/webp', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を開けませんでした')); };
      img.src = url;
    });
  }

  /* ---------- 画面 ---------- */
  const views = {};

  views.login = () => {
    $tab.hidden = true; $draftbar.hidden = true; $topRight.innerHTML = '';
    $app.innerHTML = h`
      <form class="login card" id="login-form">
        <img class="login__logo" src="icons/icon-192.png" alt="">
        <h1 class="page-title" style="text-align:center">サイト更新</h1>
        <p class="page-sub" style="text-align:center">鳥取市テニス協会 公式サイト（協会専用）</p>
        <label class="field"><span class="field__label">名前</span><input class="input" name="name" autocomplete="username" required autocapitalize="off"></label>
        <label class="field"><span class="field__label">パスワード</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
        <div id="login-error"></div>
        <div class="btnrow"><button class="btn btn--primary btn--block" type="submit">ログイン</button></div>
      </form>`;
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      await busy(f.querySelector('button'), async () => {
        const r = await api.post('/login', { name: f.name.value, password: f.password.value });
        state.me = r.name; state.site = r.site;
        await loadData();
        go('#/');
      });
    });
  };

  views.home = () => {
    const d = state.data.draft;
    $app.innerHTML = h`
      <h1 class="page-title">ホーム</h1>
      <p class="page-sub">公開サイト：<a href="${state.site}" target="_blank" rel="noopener" style="text-decoration:underline">${state.site}</a></p>
      <div class="hero">
        ${d ? raw(h`
          <div class="hero__status"><span class="hero__dot hero__dot--draft"></span>公開していない変更が ${d.log.length} 件あります</div>
          <ul class="hero__log">${raw(d.log.map((l) => h`<li>${l}</li>`).join(''))}</ul>
          <div class="btnrow"><a class="btn btn--primary" href="#/preview">プレビューして公開へ</a><button class="btn btn--outline" id="discard">下書きを捨てる</button></div>
        `) : raw(h`
          <div class="hero__status"><span class="hero__dot"></span>公開ずみ。編集中の変更はありません</div>
          <p class="note">大会やお知らせを編集すると、ここに「下書き」としてたまります。まとめて公開できます。</p>
        `)}
      </div>
      <div class="quick">
        <a href="#/events">🏆 大会<small>結果・写真・PDF・受付状態</small></a>
        <a href="#/news">📣 お知らせ<small>投稿・中止や延期の掲示</small></a>
        <a href="#/preview">👁 プレビュー<small>公開前に見え方を確かめる</small></a>
        <a href="#/history">↩ 履歴<small>公開の記録と「元に戻す」</small></a>
      </div>
      <p class="note">ホーム画面に追加しておくと、アプリのように開けます（iPhone は共有 → ホーム画面に追加、Android はメニュー → ホーム画面に追加）。</p>`;
    document.getElementById('discard')?.addEventListener('click', async (e) => {
      if (!confirm('下書きの変更をすべて捨てます。よろしいですか？')) return;
      await busy(e.target, async () => { await api.del('/draft'); await loadData(); render(); toast('下書きを捨てました'); });
    });
  };

  views.events = () => {
    const years = Object.keys(state.data.schedule).filter((k) => /^\d{4}$/.test(k)).sort((a, b) => b.localeCompare(a));
    const extras = state.data.events.events.filter((e) => !e.no);
    $app.innerHTML = h`
      <h1 class="page-title">大会</h1>
      <p class="page-sub">大会を選ぶと、受付状態の変更と、結果・写真・PDF の追加ができます。</p>
      ${raw(years.map((nendo) => h`
        <section class="sec">
          <h2 class="sec__title">${NENDO(nendo)}<span class="count">${nendo}</span></h2>
          <ul class="list">${raw(state.data.schedule[nendo].map((t) => {
            const ev = state.data.events.events.find((e) => e.nendo === nendo && e.no === t.no);
            const changed = state.data.draft?.log.some((l) => l.includes(t.name)) || (ev && state.data.draft?.uploads.some((u) => u.slug === ev.slug));
            const sub = [t.label, t.event, ev ? `結果${ev.sections.result?.images.length || 0}・写真${ev.sections.photo?.images.length || 0}` : 'ページ未作成'].filter(Boolean).join('　');
            return h`<li><button class="row ${t.status === 'done' ? 'row--muted' : ''}" data-go="${ev ? '#/event/' + ev.slug : '#/newevent/' + nendo + '/' + t.no}">
              <span class="row__date">${t.date.slice(5).replace('-', '.')}</span>
              <span class="row__main"><span class="row__title">${t.name}</span><span class="row__sub">${sub}</span></span>
              <span class="badge ${STATUS_BADGE[t.status]}">${STATUS[t.status]}</span>${changed ? raw('<span class="badge badge--draft">下書き</span>') : ''}
              <span class="row__arrow">›</span></button></li>`;
          }).join(''))}</ul>
        </section>`).join(''))}
      ${extras.length ? raw(h`<section class="sec"><h2 class="sec__title">協会主催以外の大会</h2><ul class="list">${raw(extras.map((e) => h`<li><button class="row" data-go="#/event/${e.slug}"><span class="row__main"><span class="row__title">${e.slug}</span><span class="row__sub">${NENDO(e.nendo)}</span></span><span class="row__arrow">›</span></button></li>`).join(''))}</ul></section>`) : ''}`;
  };

  views.newevent = (nendo, no) => {
    const t = (state.data.schedule[nendo] || []).find((x) => x.no === no);
    if (!t) return go('#/events');
    const r = Number(nendo) - 2018;
    $app.innerHTML = h`
      <a class="back" href="#/events">‹ 大会の一覧</a>
      <h1 class="page-title">${t.name}</h1>
      <p class="page-sub">${t.label}　${t.event}</p>
      <div class="card">
        <p>この大会のページはまだありません。ページを作ると、要項・ドロー・結果・写真を載せられるようになります。</p>
        <label class="field"><span class="field__label">ページの名前（URL の一部）</span><input class="input" id="slug" value="r${r}-${t.name.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12) || 'no' + no}" pattern="[a-z0-9-]{3,40}"><span class="field__hint">英小文字・数字・ハイフン。例：r8-enetopia → event-r8-enetopia.html</span></label>
        <div class="btnrow btnrow--end"><button class="btn btn--primary" id="create">ページを作る</button></div>
      </div>`;
    document.getElementById('create').addEventListener('click', async (e) => {
      const slug = document.getElementById('slug').value.trim();
      await busy(e.target, async () => { await api.post('/draft/event', { nendo, no, slug }); await loadData(); go('#/event/' + slug); toast('ページを作りました（公開するまでサイトには出ません）'); });
    });
  };

  let eventTab = 'result';
  views.event = (slug) => {
    const ev = eventBySlug(slug);
    if (!ev) return go('#/events');
    const info = eventInfo(ev);
    const sec = ev.sections[eventTab] || { images: [], pdfs: [] };
    const sdef = SECTIONS.find((s) => s.key === eventTab);
    const winners = (state.data.winners[slug]?.categories) || [];
    $app.innerHTML = h`
      <a class="back" href="#/events">‹ 大会の一覧</a>
      <h1 class="page-title">${info.name}</h1>
      <p class="page-sub">${info.label}　${info.event}　<a href="${state.site}event-${slug}.html" target="_blank" rel="noopener" style="text-decoration:underline">公開ページを見る ↗</a></p>

      ${info.sch ? raw(h`<div class="card">
        <h2 class="sec__title"><span class="en">STATUS</span>受付状態</h2>
        <div class="grid2">
          <label class="field" style="margin-top:0"><span class="field__label">状態</span><select class="select" id="st-status">${raw(Object.entries(STATUS).map(([k, v]) => h`<option value="${k}" ${k === info.sch.status ? 'selected' : ''}>${v}</option>`).join(''))}</select></label>
          <label class="field" style="margin-top:0"><span class="field__label">締切</span><input class="input" id="st-due" value="${info.sch.due}"></label>
        </div>
        <label class="field"><span class="field__label">補足（予備日の注記など）</span><input class="input" id="st-note" value="${info.sch.spareNote || ''}"><span class="field__hint">「荒天中止」「1/3・1/9 ほか全5日」のように。空欄でも可。</span></label>
        <div class="btnrow btnrow--end"><button class="btn btn--sm" id="st-save">状態を保存</button></div>
      </div>`) : ''}

      <div class="subtabs" role="tablist">${raw(SECTIONS.map((s) => h`<button type="button" class="${s.key === eventTab ? 'is-active' : ''}" data-tab="${s.key}">${s.label}<span class="n">${(ev.sections[s.key]?.images.length || 0) + (ev.sections[s.key]?.pdfs.length || 0)}</span></button>`).join(''))}</div>

      <section class="sec" style="margin-top:12px">
        <h2 class="sec__title">${sdef.label}<span class="count">${sec.images.length}枚</span></h2>
        ${sdef.hint ? raw(h`<p class="note" style="margin:0">${sdef.hint}</p>`) : ''}
        <div class="thumbs" id="thumbs">${raw(sec.images.map((im, i) => h`
          <div class="thumb ${uploadFor(im.src) ? 'thumb--draft' : ''}" data-src="${im.src}">
            <img src="${imgUrl(im.src)}" alt="" loading="lazy">
            <div class="thumb__cap" title="${im.label || ''}">${i + 1}. ${im.label || ''}</div>
            <div class="thumb__tools">
              <button type="button" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="前へ">‹</button>
              <button type="button" data-move="1" ${i === sec.images.length - 1 ? 'disabled' : ''} aria-label="後ろへ">›</button>
              <button type="button" class="del" data-del aria-label="外す">×</button>
            </div>
          </div>`).join(''))}</div>
        <label class="addbox" id="addbox">＋ ${eventTab === 'photo' ? '写真' : '画像・PDF'}を追加<input type="file" id="file" multiple accept="${eventTab === 'photo' ? 'image/*' : 'image/*,application/pdf'}"></label>
        <div class="progress" id="progress" hidden><div></div></div>
        ${eventTab !== 'photo' ? raw(h`<label class="field"><span class="field__label">追加する画像の名前（種目名など）</span><input class="input" id="label" placeholder="${eventTab === 'result' ? '例：男子シングルスA級' : '例：1ページ目'}"><span class="field__hint">複数枚をまとめて選んだときは、名前のあとに 1・2・3… が付きます。</span></label>`) : ''}
        ${sec.pdfs.length ? raw(h`<ul class="pdfs">${raw(sec.pdfs.map((p) => h`<li><span class="tag">PDF</span><span class="name">${p.label}</span><span>${p.kb}KB</span>${uploadFor(p.src) ? raw('<span class="badge badge--draft">下書き</span>') : ''}</li>`).join(''))}</ul>`) : ''}
      </section>

      ${eventTab === 'result' ? raw(h`<section class="sec">
        <h2 class="sec__title"><span class="en">WINNERS</span>成績（優勝・準優勝）<span class="count">大会結果の一覧とトップの大会カードに使います</span></h2>
        <div class="card">
          <div class="whead"><span>種目</span><span>優勝</span><span>準優勝</span><span></span></div>
          <div id="wrows">${raw(winners.map((c) => winnerRow(c)).join(''))}</div>
          <div class="btnrow"><button class="btn btn--outline btn--sm" id="w-add">＋ 種目を足す</button><button class="btn btn--sm" id="w-save" style="margin-left:auto">成績を保存</button></div>
        </div>
      </section>`) : ''}`;

    // 受付状態
    document.getElementById('st-save')?.addEventListener('click', async (e) => {
      await busy(e.target, async () => {
        await api.put('/draft/schedule', { nendo: ev.nendo, no: ev.no, status: document.getElementById('st-status').value, due: document.getElementById('st-due').value, spareNote: document.getElementById('st-note').value });
        await loadData(); render(); toast('状態を下書きに保存しました');
      });
    });
    // 節の切り替え
    $app.querySelectorAll('.subtabs button').forEach((b) => b.addEventListener('click', () => { eventTab = b.dataset.tab; render(); }));
    // 並べ替え・削除
    document.getElementById('thumbs').addEventListener('click', async (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const srcs = [...document.querySelectorAll('#thumbs .thumb')].map((t) => t.dataset.src);
      const src = btn.closest('.thumb').dataset.src;
      const i = srcs.indexOf(src);
      if (btn.dataset.del !== undefined) {
        if (!confirm('この画像をページから外します。よろしいですか？')) return;
        srcs.splice(i, 1);
      } else {
        const j = i + Number(btn.dataset.move);
        [srcs[i], srcs[j]] = [srcs[j], srcs[i]];
      }
      try { await api.put(`/draft/event/${slug}/order`, { section: eventTab, srcs }); await loadData(); render(); } catch (err) { toast(err.message, true); }
    });
    // 追加
    document.getElementById('file').addEventListener('change', async (e) => {
      const files = [...e.target.files]; if (!files.length) return;
      const box = document.getElementById('addbox'); const prog = document.getElementById('progress');
      const base = document.getElementById('label')?.value.trim() || '';
      box.classList.add('is-busy'); prog.hidden = false;
      let done = 0;
      try {
        for (const f of files) {
          const form = new FormData();
          const label = files.length > 1 && base ? `${base} ${done + 1}` : base;
          if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
            form.append('file', f, f.name);
          } else {
            const r = await resizeImage(f, eventTab === 'photo');
            form.append('file', r.blob, `${f.name.replace(/\.[^.]+$/, '')}.${r.ext}`);
            form.append('w', r.w); form.append('h', r.h);
          }
          form.append('slug', slug); form.append('section', eventTab); form.append('label', label);
          await api.upload('/draft/upload', form);
          done++; prog.firstElementChild.style.width = `${Math.round((done / files.length) * 100)}%`;
        }
        toast(`${done}件を下書きに追加しました`);
      } catch (err) { toast(err.message, true); }
      await loadData(); render();
    });
    // 成績
    document.getElementById('w-add')?.addEventListener('click', () => { document.getElementById('wrows').insertAdjacentHTML('beforeend', winnerRow({ category: '', places: [] })); });
    document.getElementById('wrows')?.addEventListener('click', (e) => { if (e.target.dataset.wdel !== undefined) e.target.closest('.wrow').remove(); });
    document.getElementById('w-save')?.addEventListener('click', async (e) => {
      const categories = [...document.querySelectorAll('#wrows .wrow')].map((r) => ({
        category: r.querySelector('[name=category]').value,
        places: [['優勝', r.querySelector('[name=win]').value], ['準優勝', r.querySelector('[name=second]').value]].filter(([, n]) => n.trim()).map(([award, name]) => ({ award, name })),
      }));
      await busy(e.target, async () => { await api.put(`/draft/winners/${slug}`, { categories }); await loadData(); render(); toast('成績を下書きに保存しました'); });
    });
  };
  const winnerRow = (c) => h`<div class="wrow">
    <input class="input" name="category" value="${c.category}" placeholder="男子シングルスA級">
    <input class="input" name="win" value="${c.places.find((p) => p.award === '優勝')?.name || ''}" placeholder="○○ 選手">
    <input class="input" name="second" value="${c.places.find((p) => p.award === '準優勝')?.name || ''}" placeholder="（任意）">
    <button type="button" class="iconbtn" data-wdel aria-label="この種目を消す">×</button></div>`;

  views.news = () => {
    const items = state.data.news;
    $app.innerHTML = h`
      <h1 class="page-title">お知らせ</h1>
      <p class="page-sub">トップページの「お知らせ」に出ます。中止・延期は「目立たせる」を付けると全ページ上部の赤い帯にも出ます。</p>
      <div class="btnrow" style="margin:0 0 12px"><a class="btn btn--primary" href="#/news/new">＋ 新しく投稿</a></div>
      <ul class="list">${raw(items.map((n, i) => h`<li><button class="row" data-go="#/news/${i}">
        <span class="row__date">${n.date.slice(5)}</span>
        <span class="row__main"><span class="row__title">${n.title}</span><span class="row__sub">${n.date.slice(0, 4)}年　${CATEGORY[n.category] || n.category}　→ ${n.href}</span></span>
        ${n.important ? raw('<span class="badge badge--open">重要</span>') : ''}<span class="row__arrow">›</span></button></li>`).join(''))}</ul>`;
  };

  // お知らせ専用ページの id（写真の置き場所とページ名 news-<id>.html に使う）。作った日＋乱数。
  const newNewsId = () => today().replace(/\./g, '') + '-' + Math.random().toString(36).slice(2, 6);
  const hasNewsPage = (n) => !!(n.id && (n.body || n.images?.length));

  views.newsEdit = (idx) => {
    const isNew = idx === 'new';
    const n = isNew ? { date: today(), category: 'tournament', title: '', href: '', important: false } : state.data.news[Number(idx)];
    if (!n) return go('#/news');
    const id = n.id || newNewsId();
    let imgs = (n.images || []).map((im) => ({ ...im }));
    const hrefs = [...PAGES, ...state.data.events.events.map((e) => [`event-${e.slug}.html`, `大会：${eventInfo(e).name}（${eventInfo(e).event || e.slug}）`])];
    const linkNow = hasNewsPage(n) ? (n.link || '') : n.href;
    $app.innerHTML = h`
      <a class="back" href="#/news">‹ お知らせの一覧</a>
      <h1 class="page-title">${isNew ? '新しく投稿' : 'お知らせの編集'}</h1>
      <form class="card" id="news-form">
        <label class="field" style="margin-top:0"><span class="field__label">日付</span><input class="input" name="date" value="${n.date}" placeholder="2026.10.08" pattern="\\d{4}\\.\\d{2}\\.\\d{2}" required><span class="field__hint">2026.10.08 の形。2週間以内のものに NEW が付きます。</span></label>
        <label class="field"><span class="field__label">分類</span><select class="select" name="category">${raw(Object.entries(CATEGORY).map(([k, v]) => h`<option value="${k}" ${k === n.category ? 'selected' : ''}>${v}</option>`).join(''))}</select></label>
        <label class="field"><span class="field__label">タイトル</span><input class="input" name="title" value="${n.title}" maxlength="80" required placeholder="例：第31回エネトピア杯テニス大会のドローを公開しました"><span class="field__hint">「〜しました」「〜します」の形で。例：中止します／延期します／受付をはじめました</span></label>
        <label class="field"><span class="field__label">本文（任意）</span><textarea class="textarea" name="body" rows="8" maxlength="5000" placeholder="例：10月11日（日）に行った「2026テニス祭り鳥取」の様子をお届けします。&#10;&#10;ご参加いただいた皆さま、ありがとうございました。">${n.body || ''}</textarea><span class="field__hint">本文か写真を入れると、このお知らせ専用のページができます。空行で段落を分けます。https://… や tennis-day.html はリンクになります。</span></label>
        <div class="field"><span class="field__label">写真（任意）<span class="count" id="nimg-count"></span></span>
          <div class="thumbs" id="nthumbs"></div>
          <label class="addbox" id="naddbox">＋ 写真を追加<input type="file" id="nfile" multiple accept="image/*"></label>
          <div class="progress" id="nprogress" hidden><div></div></div>
        </div>
        <label class="field"><span class="field__label" id="link-label"></span><select class="select" name="href"><option value="">（なし）</option>${raw(hrefs.map(([v, l]) => h`<option value="${v}" ${v === linkNow ? 'selected' : ''}>${l}</option>`).join(''))}</select><span class="field__hint" id="link-hint"></span></label>
        <label class="check"><input type="checkbox" name="important" ${n.important ? 'checked' : ''}><span><b>目立たせる（中止・延期など）</b><small>全ページの上部に赤い帯で出ます。落ち着いたら外してください。</small></span></label>
        <div class="btnrow"><button type="button" class="btn btn--outline btn--sm" id="news-pv">ページの見え方を確かめる</button></div>
        <iframe class="preview-frame" id="news-pv-frame" title="お知らせページのプレビュー" hidden></iframe>
        <div class="btnrow btnrow--end">${isNew ? '' : raw('<button type="button" class="btn btn--danger" id="news-del">消す</button>')}<button class="btn btn--primary" type="submit">下書きに保存</button></div>
      </form>`;
    const f = document.getElementById('news-form');
    const pageWanted = () => !!(f.body.value.trim() || imgs.length);
    const syncLink = () => {
      const page = pageWanted();
      document.getElementById('link-label').textContent = page ? '関連ページ（任意）' : 'リンク先';
      document.getElementById('link-hint').textContent = page
        ? `一覧から押すと、このお知らせのページ（news-${id}.html）が開きます。ここで選んだページへのボタンが本文の下に付きます。`
        : '一覧から押したときに開くページ。本文か写真を入れたときは、このお知らせ専用のページになります。';
      document.getElementById('news-pv').hidden = !page;
      if (!page) document.getElementById('news-pv-frame').hidden = true;
    };
    const renderThumbs = () => {
      document.getElementById('nimg-count').textContent = imgs.length ? `${imgs.length}枚` : '';
      document.getElementById('nthumbs').innerHTML = imgs.map((im, i) => h`
        <div class="thumb ${uploadFor(im.src) ? 'thumb--draft' : ''}" data-i="${i}">
          <img src="${imgUrl(im.src)}" alt="" loading="lazy">
          <div class="thumb__tools">
            <button type="button" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="前へ">‹</button>
            <button type="button" data-move="1" ${i === imgs.length - 1 ? 'disabled' : ''} aria-label="後ろへ">›</button>
            <button type="button" class="del" data-del aria-label="外す">×</button>
          </div>
        </div>`).join('');
      syncLink();
    };
    renderThumbs();
    f.body.addEventListener('input', syncLink);
    document.getElementById('nthumbs').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const i = Number(btn.closest('.thumb').dataset.i);
      if (btn.dataset.del !== undefined) imgs.splice(i, 1);
      else { const j = i + Number(btn.dataset.move); [imgs[i], imgs[j]] = [imgs[j], imgs[i]]; }
      renderThumbs();
    });
    document.getElementById('nfile').addEventListener('change', async (e) => {
      const files = [...e.target.files]; if (!files.length) return;
      const box = document.getElementById('naddbox'); const prog = document.getElementById('nprogress');
      box.classList.add('is-busy'); prog.hidden = false;
      let done = 0;
      try {
        for (const file of files) {
          const r = await resizeImage(file, true);
          const form = new FormData();
          form.append('file', r.blob, `${file.name.replace(/\.[^.]+$/, '')}.${r.ext}`);
          form.append('w', r.w); form.append('h', r.h); form.append('id', id);
          const res = await api.upload('/draft/news-image', form);
          imgs.push(res.item);
          done++; prog.firstElementChild.style.width = `${Math.round((done / files.length) * 100)}%`;
        }
        toast(`${done}枚を追加しました。「下書きに保存」で確定します`);
      } catch (err) { toast(err.message, true); }
      // 下書きの uploads が増えたので読み直す（サムネイルの表示に使う）。フォームの入力はそのまま。
      try { await loadData(); } catch (err) { /* 表示だけなので無視 */ }
      box.classList.remove('is-busy'); prog.hidden = true; prog.firstElementChild.style.width = '0';
      e.target.value = '';
      renderThumbs();
    });
    const readItem = () => {
      const page = pageWanted();
      const body = f.body.value.trim();
      return {
        date: f.date.value.trim(), category: f.category.value, title: f.title.value.trim(), important: f.important.checked,
        id, ...(body ? { body } : {}), ...(imgs.length ? { images: imgs } : {}),
        href: page ? `news-${id}.html` : f.href.value,
        ...(page && f.href.value ? { link: f.href.value } : {}),
      };
    };
    document.getElementById('news-pv').addEventListener('click', () => {
      const fr = document.getElementById('news-pv-frame');
      fr.hidden = false; fr.srcdoc = newsPageDoc(readItem());
    });
    const save = async (btn, items, log) => busy(btn, async () => { await api.put('/draft/news', { items, log }); await loadData(); go('#/news'); toast('下書きに保存しました'); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = readItem();
      if (!item.href) return toast('リンク先を選ぶか、本文・写真を入れてください', true);
      if (!hasNewsPage(item)) delete item.id;
      const items = [...state.data.news];
      if (isNew) items.unshift(item); else items[Number(idx)] = item;
      save(f.querySelector('[type=submit]'), items, `${isNew ? 'お知らせを投稿' : 'お知らせを修正'}：${item.title}${item.important ? '（重要）' : ''}`);
    });
    document.getElementById('news-del')?.addEventListener('click', (e) => {
      if (!confirm('このお知らせを消します。よろしいですか？')) return;
      const items = state.data.news.filter((_, i) => i !== Number(idx));
      save(e.target, items, `お知らせを削除：${n.title}`);
    });
  };

  /** お知らせ専用ページの見え方（src/pages/news-[id].astro と同じ組み方） */
  function newsPageDoc(n) {
    const css = `<link rel="stylesheet" href="${state.site}assets/css/style.css"><base href="${state.site}"><style>body{padding:16px}.rv,.fu{opacity:1!important;transform:none!important;animation:none!important}</style>`;
    const linkify = (line) => line.split(/(https?:\/\/[^\s<>「」（）]+|[a-z0-9-]+\.html(?:#[\w-]+)?)/g).map((t, i) => (i % 2 ? `<a href="${esc(t)}">${esc(t)}</a>` : esc(t))).join('');
    const paras = (n.body || '').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${p.trim().split('\n').map(linkify).join('<br>')}</p>`).join('');
    const imgs = n.images || [];
    const gallery = imgs.length ? `<section class="esec" style="margin-top:48px"><div class="esec__head"><h2 class="sub-head" style="margin-bottom:0">写真</h2><span class="gallery__count">${imgs.length}枚</span></div><div class="gallery">${imgs.map((im) => `<a class="gallery__item"><img src="${imgUrl(im.src)}" width="${im.w}" height="${im.h}"></a>`).join('')}</div></section>` : '';
    const link = n.link ? `<a class="btn btn--outline" style="margin-top:48px">関連ページを見る <span class="aw">→</span></a>` : '';
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${css}</head><body><div class="container container--narrow"><p class="page-title__en" style="margin:16px 0 0">${esc(n.date)}</p><h1 class="page-title" style="margin-top:8px">${esc(n.title)}</h1><div class="prose" style="margin-top:32px">${paras}</div>${gallery}${link}</div></body></html>`;
  }

  /* プレビュー：公開サイトの CSS を読み込んだ iframe に、サイトと同じ組み方で中身を流し込む */
  let previewPick = 'top';
  views.preview = () => {
    const changedSlugs = [...new Set((state.data.draft?.uploads || []).map((u) => u.slug).filter(Boolean))];
    const picks = [['top', 'トップ（お知らせ）'], ...changedSlugs.map((s) => [s, eventInfo(eventBySlug(s)).name])];
    if (!picks.some(([k]) => k === previewPick)) previewPick = 'top';
    $app.innerHTML = h`
      <h1 class="page-title">プレビュー</h1>
      <p class="page-sub">下書きを反映した見え方です（実際の公開ページとは細部が異なることがあります）。</p>
      <div class="preview-pick">${raw(picks.map(([k, l]) => h`<button type="button" class="btn btn--sm ${k === previewPick ? '' : 'btn--outline'}" data-pick="${k}">${l}</button>`).join(''))}</div>
      <iframe class="preview-frame" id="pv" title="プレビュー"></iframe>
      <div class="btnrow"><a class="btn btn--primary btn--block" href="#/publish">この内容で公開へ →</a></div>`;
    $app.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { previewPick = b.dataset.pick; render(); }));
    document.getElementById('pv').srcdoc = previewDoc(previewPick);
  };
  function previewDoc(pick) {
    const css = `<link rel="stylesheet" href="${state.site}assets/css/style.css"><base href="${state.site}"><style>body{padding:16px}.rv{opacity:1!important;transform:none!important}</style>`;
    const important = state.data.news.filter((n) => n.important).slice(0, 3);
    const notice = important.length ? `<div class="notice-bar"><div class="container notice-bar__inner"><span class="notice-bar__label">重要</span><ul class="notice-bar__list">${important.map((n) => `<li><a class="notice-bar__link"><span class="notice-bar__date">${esc(n.date.slice(5))}</span><span class="notice-bar__title">${esc(n.title)}</span></a></li>`).join('')}</ul></div></div>` : '';
    if (pick === 'top') {
      const rows = state.data.news.slice(0, 6).map((n) => `<li><a class="news-row"><span class="news-row__date"><span class="news-row__day">${esc(n.date.slice(5))}</span><span class="news-row__year">${esc(n.date.slice(0, 4))}</span></span><span class="news-row__flag">${isFresh(n.date) ? '<span class="news-new">NEW</span>' : ''}</span><span class="news-row__title">${esc(n.title)}</span></a></li>`).join('');
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${css}</head><body>${notice}<div class="container" style="margin-top:24px"><h2 class="sec-head__title">お知らせ</h2><ul class="news-list" style="margin-top:16px">${rows}</ul></div></body></html>`;
    }
    const ev = eventBySlug(pick);
    const secs = ['result', 'photo', 'draw', 'outline', 'entry'].filter((k) => ev.sections[k] && (ev.sections[k].images.length || ev.sections[k].pdfs.length));
    const body = secs.map((k) => {
      const s = ev.sections[k]; const label = SECTIONS.find((x) => x.key === k).label;
      const imgs = k === 'photo'
        ? `<div class="gallery">${s.images.map((im) => `<a class="gallery__item"><img src="${imgUrl(im.src)}" width="${im.w}" height="${im.h}"></a>`).join('')}</div>`
        : `<div class="sheets">${s.images.map((im) => `<a class="sheet ${im.w > im.h ? 'sheet--wide' : ''}"><img src="${imgUrl(im.src)}" width="${im.w}" height="${im.h}"><span class="sheet__cap">${esc(im.label || label)}</span></a>`).join('')}</div>`;
      const pdfs = s.pdfs.length ? `<ul class="mt-32">${s.pdfs.map((p) => `<li><a class="dl-item"><span class="dl-item__type">PDF</span><span class="dl-item__text"><span class="dl-item__title">${esc(p.label)}</span><span class="dl-item__note">${p.kb}KB</span></span></a></li>`).join('')}</ul>` : '';
      return `<section class="esec" style="margin-top:48px"><div class="esec__head"><h2 class="sub-head" style="margin-bottom:0">${label}</h2>${s.images.length ? `<span class="gallery__count">${s.images.length}枚</span>` : ''}</div>${imgs}${pdfs}</section>`;
    }).join('');
    const winners = state.data.winners[pick]?.categories || [];
    const wtable = winners.length ? `<section class="esec" style="margin-top:48px"><h2 class="sub-head">成績</h2><div class="deflist mt-24">${winners.map((c) => `<div class="deflist__row"><div class="deflist__key">${esc(c.category)}</div><div class="deflist__val"><ul class="place-list">${c.places.map((p) => `<li><span class="place-list__award">${esc(p.award)}</span><span class="place-list__name">${esc(p.name)}</span></li>`).join('')}</ul></div></div>`).join('')}</div></section>` : '';
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${css}</head><body>${notice}<div class="container container--narrow"><h1 class="page-title" style="margin-top:16px">${esc(eventInfo(ev).name)}</h1>${wtable}${body}</div></body></html>`;
  }
  const isFresh = (date) => { const [y, m, d] = date.split('.').map(Number); return (Date.now() - new Date(y, m - 1, d)) / 86400000 < 14; };

  views.publish = () => {
    const d = state.data.draft;
    if (!d) {
      $app.innerHTML = h`<h1 class="page-title">公開</h1><div class="card"><p>公開する変更はありません。</p><div class="btnrow"><a class="btn btn--outline" href="#/history">公開の履歴を見る</a></div></div>`;
      return;
    }
    $app.innerHTML = h`
      <h1 class="page-title">公開</h1>
      <p class="page-sub">公開すると、数分で公式サイトに反映されます。間違えても「履歴」から元に戻せます。</p>
      <div class="card">
        <h2 class="sec__title">公開する変更<span class="count">${d.log.length}件</span></h2>
        <ul class="hero__log">${raw(d.log.map((l) => h`<li>${l}</li>`).join(''))}</ul>
        ${d.uploads.length ? raw(h`<p class="note">追加するファイル：${d.uploads.length}件（${Math.round(d.uploads.reduce((n, u) => n + u.kb, 0) / 1024 * 10) / 10}MB）</p>`) : ''}
        <label class="field"><span class="field__label">ひとことメモ（履歴に残ります）</span><input class="input" id="pub-msg" placeholder="${d.log[0]}"></label>
        <div class="btnrow btnrow--end"><a class="btn btn--outline" href="#/preview">プレビュー</a><button class="btn btn--primary" id="pub">公開する</button></div>
      </div>
      <div id="pub-progress"></div>`;
    document.getElementById('pub').addEventListener('click', async (e) => {
      if (!confirm('公式サイトに公開します。よろしいですか？')) return;
      const btn = e.target; btn.disabled = true;
      const box = document.getElementById('pub-progress');
      const steps = (now, done, failed) => {
        const names = ['保存（GitHub に書き込み）', '公開処理（ビルド）', '公開サイトに反映'];
        box.innerHTML = `<div class="card" style="margin-top:12px"><ul class="steps">${names.map((n, i) => `<li class="${i < done ? 'is-done' : i === now ? 'is-now' : ''}"><span class="mark">${i < done ? '✓' : i === now ? (failed ? '!' : '<span class="spin"></span>') : ''}</span>${n}</li>`).join('')}</ul></div>`;
      };
      steps(0, 0);
      try {
        const r = await api.post('/publish', { message: document.getElementById('pub-msg').value });
        await loadData();
        steps(1, 1);
        const started = Date.now();
        const poll = async () => {
          const s = await api.get(`/publish/${r.sha}`);
          if (s.state === 'done') {
            steps(3, 3);
            box.insertAdjacentHTML('beforeend', `<div class="ok">公開が完了しました。<a href="${esc(state.site)}" target="_blank" rel="noopener" style="text-decoration:underline">公式サイトを開く ↗</a>（ブラウザに古い表示が残るときは再読み込みしてください）</div><div class="btnrow"><a class="btn btn--outline" href="#/history">履歴（元に戻す）</a><a class="btn" href="#/">ホームへ</a></div>`);
            return;
          }
          if (s.state === 'failed') {
            steps(1, 1, true);
            box.insertAdjacentHTML('beforeend', `<div class="error">公開処理が失敗しました。保存は済んでいるので、しばらくして「履歴」から確認するか、管理者に連絡してください。${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">詳細 ↗</a>` : ''}</div>`);
            return;
          }
          if (Date.now() - started > 15 * 60000) { box.insertAdjacentHTML('beforeend', '<div class="error">公開処理に時間がかかっています。しばらくしてから公式サイトを確かめてください。</div>'); return; }
          setTimeout(poll, 6000);
        };
        setTimeout(poll, 4000);
      } catch (err) {
        steps(0, 0, true);
        box.insertAdjacentHTML('beforeend', `<div class="error">${esc(err.message)}</div>`);
        btn.disabled = false;
      }
    });
  };

  views.history = async () => {
    $app.innerHTML = '<h1 class="page-title">履歴</h1><p class="page-sub">読み込み中…</p>';
    const { items } = await api.get('/history');
    $app.innerHTML = h`
      <h1 class="page-title">履歴</h1>
      <p class="page-sub">管理アプリからの公開の記録です。「元に戻す」は、その公開で変えたファイルを直前の状態に戻して公開し直します。</p>
      ${items.length ? raw(h`<ul class="list">${raw(items.map((it) => h`<li><div class="row" style="align-items:flex-start">
        <span class="row__main"><span class="row__title">${it.summary}</span><span class="row__sub">${fmtTime(it.at)}　${it.editor}　${it.files.length}ファイル　<code>${it.sha.slice(0, 7)}</code>${it.reverted ? raw('　<span class="badge badge--muted">取り消しずみ</span>') : ''}</span>
          ${it.log.length ? raw(h`<ul class="hero__log">${raw(it.log.map((l) => h`<li>${l}</li>`).join(''))}</ul>`) : ''}</span>
        ${!it.reverted && !it.isRevert ? raw(h`<button class="btn btn--danger btn--sm" data-revert="${it.sha}">元に戻す</button>`) : ''}
      </div></li>`).join(''))}</ul>`) : raw('<div class="card"><p>まだ公開の記録はありません。</p></div>')}`;
    $app.querySelectorAll('[data-revert]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('この公開を取り消して、直前の状態に戻します。よろしいですか？（取り消し自体も履歴に残ります）')) return;
      await busy(b, async () => { await api.post('/revert', { sha: b.dataset.revert }); toast('元に戻す公開をはじめました。数分で反映されます'); render(); });
    }));
  };

  /* ---------- ルーター ---------- */
  function render() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const [r, a, b] = parts;
    if (!state.me) return views.login();
    $tab.hidden = false;
    $topRight.innerHTML = h`<span>${state.me}</span><button class="btn btn--outline btn--sm" id="logout">ログアウト</button>`;
    document.getElementById('logout').addEventListener('click', async () => { await api.post('/logout'); state.me = null; go('#/login'); });
    const tabKey = { '': 'home', events: 'events', event: 'events', newevent: 'events', news: 'news', preview: 'preview', publish: 'publish' }[r] || '';
    $tab.querySelectorAll('a').forEach((x) => x.classList.toggle('is-active', x.dataset.tab === tabKey));
    renderDraftbar();
    window.scrollTo(0, 0);
    if (r === '' || r === 'login') return views.home();
    if (r === 'events') return views.events();
    if (r === 'event') return views.event(a);
    if (r === 'newevent') return views.newevent(a, b);
    if (r === 'news') return a === undefined ? views.news() : views.newsEdit(a);
    if (r === 'preview') return views.preview();
    if (r === 'publish') return views.publish();
    if (r === 'history') return views.history();
    return views.home();
  }
  window.addEventListener('hashchange', render);
  $app.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

  (async () => {
    try {
      const me = await api.get('/me');
      state.me = me.name; state.site = me.site;
      await loadData();
    } catch (e) { state.me = null; }
    render();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
