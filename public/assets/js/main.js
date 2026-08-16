/*!
 * 鳥取市テニス協会 公式サイト — 共通スクリプト
 * すべての機能は「その要素がページにあるときだけ」動きます。
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- オープニング（全画面の映像） ----------
     出すかどうかは Base.astro の <head> 内スクリプトが決め済み（html.splash-on）。
     ここは「必ず幕を上げる」ことに責任を持つ。再生完了・読み込み失敗・
     自動再生の拒否（省電力モードなど）・時間切れのどれでも本文へ進める。 */
  function initSplash() {
    var root = document.documentElement;
    if (!root.classList.contains('splash-on')) return;

    var splash = document.querySelector('.splash');
    if (!splash) { root.classList.remove('splash-on'); return; }

    var video = splash.querySelector('video');
    var timer;
    var done = false;
    // 溶かし始めを終わりより少し手前に取り、映像＋切り替えでちょうど6秒に収める。
    // 映像の終盤はロゴが静止しているため、早めに始めても見た目は変わらない。
    var LEAD = .6;

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sessionStorage.setItem('tcta-splash', 'done'); } catch (e) {}
      splash.classList.add('is-out');
      // ここで初めてヒーローの登場アニメーションが動き出す
      root.classList.remove('splash-on');
      // 溶け終わってから取り除く（CSS の .splash.is-out の 0.8 秒に合わせる）
      setTimeout(function () {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 900);
    }

    // 保険。映像が届かない・再生されない場合でも、ここで必ず本文へ進む。
    // このスクリプトは defer なので、外部CSSの読み込みが遅いと実行自体が遅れる。
    // そのときは映像が先に進んでいるので、残り時間を見て掛け直す。
    function armFallback() {
      clearTimeout(timer);
      var left = 3.4;
      if (video && isFinite(video.duration) && video.duration > 0) {
        left = Math.max(0, video.duration - video.currentTime - LEAD);
      }
      timer = setTimeout(finish, (left + 1) * 1000);
    }
    armFallback();

    if (video) {
      // 実行が遅れて、すでに再生し終えていた場合はすぐ幕を上げる
      if (video.ended) { finish(); return; }

      // 終わり際まで来たら、再生完了を待たずに溶かし始める
      video.addEventListener('timeupdate', function () {
        if (isFinite(video.duration) && video.duration > 0 &&
            video.currentTime >= video.duration - LEAD) finish();
      });
      video.addEventListener('ended', finish);
      video.addEventListener('error', finish);
      video.addEventListener('loadedmetadata', armFallback);
      video.addEventListener('playing', armFallback);

      var playing = video.play();
      if (playing && typeof playing.catch === 'function') playing.catch(finish);
    }

    splash.addEventListener('click', finish);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish();
    });
  }

  /* ---------- スクロール連動フェード（.rv） ---------- */
  function initReveal() {
    // .ghost（見出し右の大きな英字）も同じ仕組みで、右からスライドインさせる
    var targets = document.querySelectorAll('.rv, .ghost');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window) || reduceMotion) return; // そのまま表示

    document.body.classList.add('jsrv');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('on');
          io.unobserve(e.target);
        }
      });
      // 閾値は 0（＋下端マージン）にしておく。割合で判定すると、
      // 一覧表のように画面より背の高い要素が永久に表示されないことがある。
    }, { threshold: 0, rootMargin: '0px 0px -60px 0px' });

    requestAnimationFrame(function () {
      targets.forEach(function (el) { io.observe(el); });
    });
  }

  /* ---------- リンク集の流れ ----------
     いつも一定の速さで流しておくが、指でなぞる・ホイールを回すなど
     触られたらそのぶん素直に動かし、手が離れて3秒ほど経ったらまた流し出す。
     カードは中身が2組並んでいるので、半分進んだところで戻せば継ぎ目なく回る。 */
  function initMarquee() {
    if (reduceMotion) return;
    Array.prototype.forEach.call(document.querySelectorAll('.marquee'), startMarquee);
  }

  /* 1段ぶんを流す。data-marquee-dir が 1 なら右から左、-1 なら左から右。 */
  function startMarquee(view) {
    var track = view.querySelector('.marquee__track');
    if (!track) return;

    var SPEED = 50;       // px/秒
    var RESUME = 3000;    // 触ったあと、また流れ出すまで
    var dir = Number(view.getAttribute('data-marquee-dir')) || 1;
    var half = 0;
    var holdUntil = 0;    // この時刻まではこちらから動かさない
    var hovering = false;
    var onScreen = true;
    var last = 0;

    var measure = function () {
      half = track.scrollWidth / 2;
      // 左へ流す段は、巻き戻せるよう後半の先頭から始める
      if (dir < 0 && view.scrollLeft < 1) view.scrollLeft = half;
    };
    measure();
    window.addEventListener('resize', measure);

    // 触られたら止める。ホイールも指も同じ扱い。
    var hold = function () { holdUntil = performance.now() + RESUME; };
    ['pointerdown', 'touchstart', 'wheel'].forEach(function (ev) {
      view.addEventListener(ev, hold, { passive: true });
    });
    /* マウスを乗せているあいだは止め、離れたらすぐ戻す。
       ただしバナーを別タブで開くと、そのまま離れて mouseleave が来ないことがある。
       止まったままになるので、画面を離れた・戻ってきた時点でも必ず解除する。 */
    var release = function () { hovering = false; };
    view.addEventListener('mouseenter', function () { hovering = true; });
    ['mouseleave', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      view.addEventListener(ev, release, { passive: true });
    });
    window.addEventListener('blur', release);
    window.addEventListener('focus', release);
    window.addEventListener('pageshow', function () { release(); holdUntil = 0; });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { release(); holdUntil = 0; }
    });

    // 画面の外にあるあいだは動かさない
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
      }, { threshold: 0 }).observe(view);
    }

    var tick = function (now) {
      var dt = (now - last) / 1000;
      last = now;
      // タブを離れていた等で間が空いたフレームは、飛ばさず捨てる
      if (dt > 0 && dt < .1 && onScreen && !hovering && now >= holdUntil) {
        view.scrollLeft += SPEED * dt * dir;
      }
      // 端に来たら半分ぶん入れ替える（見た目は同じなので継ぎ目が出ない）
      if (half > 0) {
        if (view.scrollLeft >= half) view.scrollLeft -= half;
        else if (view.scrollLeft < 1) view.scrollLeft += half;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(function (now) { last = now; requestAnimationFrame(tick); });
  }

  /* ---------- 押したときの波紋 ----------
     端末まかせの青い網掛けの代わりに、押した所へ赤い雫を落として広げる。
     押せるものだけに付け、要素からはみ出さないよう .ripple-host で刈り込む。 */
  // 押せるものだけ。遷移先のない <a>（結果待ちのカードなど）や、
  // マーキーの複製（aria-hidden の span）には出さない。
  var RIPPLE_SEL = 'a[href], button:not([disabled]), [role="button"]';

  /* 指を置いてから、これだけ動かなければ「押した」とみなす。
     スワイプの出だしでも pointerdown は必ず来るので、待たずに出すと
     一覧をなぞっただけで波紋が出てしまう。 */
  var TAP_SLOP = 10;    // px。これを超えて動いたらスワイプ扱い
  var TAP_WAIT = 90;    // ms。押しっぱなしならこの時間で出す

  function showRipple(host, cx, cy) {
    // 波紋は押した所を中心に、要素の隅まで届く大きさにする
    var box = host.getBoundingClientRect();
    var x = cx - box.left;
    var y = cy - box.top;
    var far = Math.max(x, box.width - x);
    var tall = Math.max(y, box.height - y);
    var size = Math.hypot(far, tall) * 2;

    host.classList.add('ripple-host');
    if (getComputedStyle(host).position === 'static') host.classList.add('ripple-host--rel');
    var drop = document.createElement('span');
    drop.className = 'ripple';
    drop.style.setProperty('--r', size + 'px');
    drop.style.setProperty('--x', x + 'px');
    drop.style.setProperty('--y', y + 'px');
    drop.addEventListener('animationend', function () {
      if (drop.parentNode) drop.parentNode.removeChild(drop);
    });
    host.appendChild(drop);
  }

  function initRipple() {
    if (reduceMotion) return;

    var wait = null;   // 出すかどうかを決めかねている状態
    var clear = function () {
      if (wait) clearTimeout(wait.timer);
      wait = null;
    };

    document.addEventListener('pointerdown', function (e) {
      var host = e.target.closest(RIPPLE_SEL);
      if (!host || host.closest('[aria-hidden="true"]')) return;
      clear();

      // マウスはなぞって画面を送らないので、そのまま出す
      if (e.pointerType === 'mouse') { showRipple(host, e.clientX, e.clientY); return; }

      wait = { host: host, x: e.clientX, y: e.clientY };
      wait.timer = setTimeout(function () {
        if (!wait) return;
        showRipple(wait.host, wait.x, wait.y);
        wait = null;
      }, TAP_WAIT);
    }, { passive: true });

    // 少しでも動いたらスワイプ。出さずに取りやめる。
    document.addEventListener('pointermove', function (e) {
      if (!wait) return;
      if (Math.hypot(e.clientX - wait.x, e.clientY - wait.y) > TAP_SLOP) clear();
    }, { passive: true });

    // 待っているあいだに指が離れたら、短いタップなのでその場で出す
    document.addEventListener('pointerup', function (e) {
      if (!wait) return;
      if (Math.hypot(e.clientX - wait.x, e.clientY - wait.y) <= TAP_SLOP) {
        showRipple(wait.host, wait.x, wait.y);
      }
      clear();
    }, { passive: true });

    // ブラウザが画面送りに切り替えたら取りやめる
    document.addEventListener('pointercancel', clear, { passive: true });
    window.addEventListener('scroll', clear, { passive: true });
  }

  /* ---------- リンクのバナー（押している間だけ赤枠） ----------
     タッチではホバーが押したあとも残るので、押し下げと離しで自前に付け外しする。 */
  function initPressed() {
    var pressed = null;
    var off = function () {
      if (pressed) pressed.classList.remove('is-pressed');
      pressed = null;
    };
    var from = null;
    document.addEventListener('pointerdown', function (e) {
      var card = e.target.closest('.link-card--compact');
      if (!card) return;
      off();
      from = { x: e.clientX, y: e.clientY };
      pressed = card;
      card.classList.add('is-pressed');
    }, { passive: true });
    // なぞって流しているだけのときは枠を消す（バナーは横に動かせるため）
    document.addEventListener('pointermove', function (e) {
      if (!pressed || !from) return;
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > TAP_SLOP) off();
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      document.addEventListener(ev, off, { passive: true });
    });
    // ページを動かしたら外す。capture で拾うとマーキーの自動送りにも
    // 反応してしまい、押した瞬間に消えるので window で受けること。
    window.addEventListener('scroll', off, { passive: true });
  }

  /* ---------- 全画面表示（お知らせ・大会情報） ----------
     VIEW ALL で開き、右上の × か Esc で閉じる。開いている間は背面を止める。 */
  function initFullPanel(id, openSel, closeSel) {
    var panel = document.getElementById(id);
    if (!panel) return;

    var openers = document.querySelectorAll(openSel);
    var closer = panel.querySelector(closeSel);
    var last = null;

    var setOpen = function (open) {
      panel.hidden = !open;
      document.body.classList.toggle('is-locked', open);
      Array.prototype.forEach.call(openers, function (b) {
        b.setAttribute('aria-expanded', String(open));
      });
      if (open) {
        panel.scrollTop = 0;
        // 開くたびに並び直しの動きを流し直す
        panel.querySelectorAll('[style*="--i"]').forEach(function (el) {
          el.style.animation = 'none';
          void el.offsetWidth;
          el.style.animation = '';
        });
        if (closer) closer.focus();
      } else if (last) {
        last.focus();
      }
    };

    Array.prototype.forEach.call(openers, function (b) {
      b.addEventListener('click', function () { last = b; setOpen(true); });
    });
    if (closer) closer.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) setOpen(false);
    });
  }

  /* ---------- 大会カレンダーの月送り ----------
     月ぶんのマス目は全部書き出してあるので、出す1枚を切り替えるだけ。 */
  function initCalendar() {
    var root = document.querySelector('[data-calendar]');
    if (!root) return;

    var months = root.querySelectorAll('[data-cal-month]');
    var prev = root.querySelector('[data-cal-prev]');
    var next = root.querySelector('[data-cal-next]');
    var label = root.querySelector('[data-cal-label]');
    var count = root.querySelector('[data-cal-count]');
    if (!months.length || !prev || !next) return;

    var at = 0;
    var show = function (i) {
      at = Math.min(Math.max(i, 0), months.length - 1);
      for (var j = 0; j < months.length; j++) months[j].hidden = j !== at;
      var m = months[at];
      if (label) {
        label.innerHTML = '<span class="cal__num">' + m.getAttribute('data-month') + '</span>' +
          '<span class="cal__meta"><span class="cal__en">' + m.getAttribute('data-en') + '</span>' +
          '<span class="cal__year">' + m.getAttribute('data-year') + '</span></span>';
      }
      if (count) count.textContent = m.getAttribute('data-count');
      prev.disabled = at === 0;
      next.disabled = at === months.length - 1;
    };

    prev.addEventListener('click', function () { show(at - 1); });
    next.addEventListener('click', function () { show(at + 1); });
    show(0);
  }

  /* ---------- コート案内の地図 ----------
     ボタンを押したら、その施設の埋め込みに差し替える。 */
  function initCourtMap() {
    var root = document.querySelector('[data-cmap]');
    if (!root) return;

    var frame = root.querySelector('[data-cmap-frame]');
    var name = root.querySelector('[data-cmap-name]');
    var link = root.querySelector('[data-cmap-link]');
    var tabs = root.querySelectorAll('[data-cmap-tab]');
    if (!frame || !tabs.length) return;

    // 読み終わってから出す（読み込み中は下敷きが見える）
    var ready = function () { frame.classList.add('is-ready'); };
    frame.addEventListener('load', ready);
    if (frame.complete) ready();

    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-pressed', String(on));
        });
        frame.src = tab.getAttribute('data-embed');
        if (name) name.textContent = tab.getAttribute('data-name');
        if (link) link.href = tab.getAttribute('data-link');
      });
    });
  }

  /* ---------- フッターの四角（スクロールで動かす） ----------
     漂う動きは CSS の transform、こちらは translate に書き込むので打ち消し合わない。
     フッターが画面を通り過ぎるあいだの進み具合を、そのまま上下の量にしている。 */
  function initFooterDeco() {
    var deco = document.querySelector('.footer-deco');
    if (!deco || reduceMotion) return;

    var RANGE = 140;   // 端から端までで動かす量（px）
    var ticking = false;

    var place = function () {
      ticking = false;
      var box = deco.getBoundingClientRect();
      var span = window.innerHeight + box.height;
      if (span <= 0) return;
      // 下から入ってくるとき 0、抜け切るとき 1
      var seen = (window.innerHeight - box.top) / span;
      seen = Math.min(Math.max(seen, 0), 1);
      deco.style.setProperty('--sy', ((seen - .5) * RANGE).toFixed(1) + 'px');
    };
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(place);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    place();
  }

  /* ---------- TODAY の日付（見ている時点の日本時間） ----------
     ビルド時の日付を書き出してあるので、JS が動く環境だけ今日の日付に差し替える。 */
  function initToday() {
    var el = document.querySelector('.today-marker__date');
    if (!el) return;
    try {
      el.textContent = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date()).replace(/\//g, '.');
    } catch (e) { /* 対応していない環境では、書き出したままの日付を使う */ }
  }

  /* ---------- ヘッダー（スクロールで出し入れ・モバイルメニュー） ---------- */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    var toggle = document.querySelector('.hamburger');
    var menu = document.getElementById('mobile-nav');

    /* 下へ読み進めているあいだは引っ込め、上へ戻したら出す。
       ・ページ上部（ヘッダー1枚ぶん）では常に出しておく
       ・行きつ戻りつでちらつかないよう、少し動くまでは向きを変えない
       ・モバイルメニューを開いているあいだは引っ込めない（閉じるボタンが消えるため） */
    var THRESHOLD = 8;
    var lastY = window.scrollY;
    var onScroll = function () {
      var y = window.scrollY;
      header.classList.toggle('hsh', y > 100);

      var menuOpen = toggle && toggle.getAttribute('aria-expanded') === 'true';
      if (menuOpen || y <= header.offsetHeight) {
        header.classList.remove('site-header--hidden');
      } else if (Math.abs(y - lastY) > THRESHOLD) {
        header.classList.toggle('site-header--hidden', y > lastY);
      }
      if (Math.abs(y - lastY) > THRESHOLD) lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (!toggle || !menu) return;

    var setOpen = function (open) {
      if (open) {
        // 開くときは必ずヘッダーを出しておく（閉じるボタンが画面から消えないように）
        header.classList.remove('site-header--hidden');
        // ヘッダー（通知バーの有無で高さが変わる）の真下から始める
        menu.style.paddingTop = (header.getBoundingClientRect().bottom + 24) + 'px';
      }
      toggle.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
      document.body.classList.toggle('is-locked', open);
      menu.setAttribute('aria-hidden', String(!open));
    };

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024 && toggle.getAttribute('aria-expanded') === 'true') setOpen(false);
    });

    setOpen(false);
  }

  /* ---------- 大会カルーセル ---------- */
  function initCarousel() {
    var track = document.querySelector('[data-carousel]');
    if (!track) return;

    /* 止まる位置の左余白。scroll-padding は calc のまま返ってきて読めないので、
       実際に px で返る padding と、覗かせ幅の変数から組み立てる。 */
    var padStart = function () {
      var cs = getComputedStyle(track);
      return (parseFloat(cs.paddingInlineStart) || 0) +
             (parseFloat(cs.getPropertyValue('--carousel-peek')) || 0);
    };

    var step = function () {
      var card = track.querySelector('.tcard');
      if (!card) return 320;
      var gap = parseFloat(getComputedStyle(track).columnGap || '24') || 24;
      return card.getBoundingClientRect().width + gap;
    };

    document.querySelectorAll('[data-carousel-prev]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        track.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });
    document.querySelectorAll('[data-carousel-next]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        track.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });

    /* いま何枚目を見ているかを点で示す。押すとその大会まで送る。 */
    var dots = document.querySelectorAll('[data-cdot]');
    if (dots.length) {
      var cards = track.querySelectorAll('.tcard');
      var mark = function () {
        // 左端にいちばん近いカードを「いま見ている1枚」とみなす
        var here = track.scrollLeft + padStart();
        var near = 0;
        var best = Infinity;
        for (var i = 0; i < cards.length; i++) {
          var d = Math.abs(cards[i].offsetLeft - here);
          if (d < best) { best = d; near = i; }
        }
        for (var j = 0; j < dots.length; j++) dots[j].classList.toggle('is-active', j === near);
      };
      track.addEventListener('scroll', mark, { passive: true });
      window.addEventListener('resize', mark);
      Array.prototype.forEach.call(dots, function (dot, i) {
        dot.addEventListener('click', function () {
          if (!cards[i]) return;
          track.scrollTo({ left: Math.max(0, cards[i].offsetLeft - padStart()), behavior: reduceMotion ? 'auto' : 'smooth' });
        });
      });
      mark();
    }

    // 初期表示：TODAY の線を左に置く。
    // scroll-padding のぶんだけ手前を空けるので、左には終了した大会の端が覗き、
    // 線のすぐ右に直近の大会が1枚まるごと入り、その次の大会が右端で少し切れる。
    var marker = track.querySelector('[data-carousel-today]');
    if (marker) {
      var place = function () {
        track.scrollLeft = Math.max(0, marker.offsetLeft - padStart());
      };
      place();
      window.addEventListener('load', place);
      window.addEventListener('resize', place);
    }
  }

  /* ---------- 一覧のフィルタチップ（大会情報ページ） ---------- */
  function initFilters() {
    var groups = document.querySelectorAll('[data-filter-group]');
    if (!groups.length) return;

    groups.forEach(function (group) {
      var targetSel = group.getAttribute('data-filter-target');
      var rows = document.querySelectorAll(targetSel + ' [data-tags]');
      var empty = document.querySelector(targetSel + '-empty');

      group.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;

        group.querySelectorAll('.chip').forEach(function (c) {
          var active = c === chip;
          c.classList.toggle('is-active', active);
          c.setAttribute('aria-pressed', String(active));
        });

        var key = chip.getAttribute('data-filter');
        var shown = 0;
        rows.forEach(function (row) {
          var match = key === 'all' || (' ' + row.getAttribute('data-tags') + ' ').indexOf(' ' + key + ' ') > -1;
          row.hidden = !match;
          if (match) shown++;
        });
        if (empty) empty.hidden = shown !== 0;
      });
    });
  }

  /* ---------- 年度タブ（大会結果ページ など） ---------- */
  function initTabs() {
    var lists = document.querySelectorAll('[role="tablist"]');
    if (!lists.length) return;

    lists.forEach(function (list) {
      var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));

      var select = function (tab) {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', String(on));
          t.tabIndex = on ? 0 : -1;
          var panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = !on;
        });
      };

      list.addEventListener('click', function (e) {
        var tab = e.target.closest('[role="tab"]');
        if (tab) select(tab);
      });

      list.addEventListener('keydown', function (e) {
        var i = tabs.indexOf(document.activeElement);
        if (i < 0) return;
        var next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
        if (next < 0) return;
        e.preventDefault();
        var target = tabs[(next + tabs.length) % tabs.length];
        target.focus();
        select(target);
      });
    });
  }

  /* ---------- お問い合わせフォーム ---------- */
  function initForm() {
    var form = document.querySelector('[data-validate]');
    if (!form) return;

    var done = document.querySelector('[data-form-done]');

    var showError = function (field, message) {
      var box = form.querySelector('[data-error-for="' + field.name + '"]');
      field.setAttribute('aria-invalid', 'true');
      if (box) {
        box.textContent = '⚠ ' + message;
        box.classList.add('is-shown');
      }
    };

    var clearError = function (field) {
      var box = form.querySelector('[data-error-for="' + field.name + '"]');
      field.removeAttribute('aria-invalid');
      if (box) box.classList.remove('is-shown');
    };

    var validate = function (field) {
      var value = (field.value || '').trim();

      if (field.type === 'checkbox') {
        if (field.required && !field.checked) {
          showError(field, '同意が必要です。');
          return false;
        }
      } else if (field.required && !value) {
        showError(field, field.getAttribute('data-label') + 'を入力してください。');
        return false;
      } else if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        showError(field, 'メールアドレスの形式が正しくありません（@を含む形式で入力してください）。');
        return false;
      }
      clearError(field);
      return true;
    };

    var fields = Array.prototype.slice.call(form.querySelectorAll('input, textarea, select'));
    fields.forEach(function (field) {
      field.addEventListener('blur', function () { validate(field); });
      field.addEventListener('input', function () {
        if (field.getAttribute('aria-invalid') === 'true') validate(field);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstBad = null;
      fields.forEach(function (field) {
        if (!validate(field) && !firstBad) firstBad = field;
      });

      if (firstBad) {
        firstBad.focus();
        firstBad.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        return;
      }

      // 実サーバー接続前のプロトタイプ動作：送信完了画面を表示
      form.hidden = true;
      if (done) {
        done.classList.add('is-shown');
        done.setAttribute('tabindex', '-1');
        done.focus();
        done.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  }

  function init() {
    initSplash();
    initReveal();
    initMarquee();
    initHeader();
    initRipple();
    initPressed();
    initFullPanel('news-all', '[data-news-open]', '[data-news-close]');
    initFullPanel('tournaments-all', '[data-tall-open]', '[data-tall-close]');
    initCourtMap();
    initCalendar();
    initFooterDeco();
    initToday();
    initCarousel();
    initFilters();
    initTabs();
    initForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
