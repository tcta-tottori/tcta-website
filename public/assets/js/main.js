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
      // 閾値は 0 にしておく。割合で判定すると、一覧表のように画面より背の高い要素が永久に表示されないことがある。
      // 出すタイミングは、要素の上端が画面の下から 1/7（≒14.3%）の線より上に来たとき（画面の 6/7 より上に入ったら出す）。
    }, { threshold: 0, rootMargin: '0px 0px -14.3% 0px' });

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
      if (host.classList.contains('mobile-nav__link')) return; // メニューの行は波紋ではなく、文字が赤くなって光る（.is-tapped）
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
  /* opts.title … { from: セレクタ, to: セレクタ }：開くとき、ページにある節の見出し（from の中の英語と日本語）と
     全画面の上部の見出し（to の中の同じもの）を同一ページのビュートランジションでつなぎ、見出しだけをその場所から
     画面の上部へ滑らかに移してから、行をメニューと同じく見出しの下から順に出す（対応ブラウザのみ）。
     見出しの入れ物（div）は display: contents で箱が無いので、中の .sec-head__eyebrow と .sec-head__title に名前を付ける。
     開いている間は、収まり切らない側（下、送ったあとは上も）の端を白く透かし、端まで送ると透かしを消す（.is-top / .is-bottom） */
  /* コート案内の行（トップと全画面の一覧）を押したとき。写真と施設名に名前を付けてからそのまま移動し、
     コート案内のページ（courts.html#<施設>）で同じ施設の写真・名前につなぐ（ページ間ビュートランジション。Base.astro の pagereveal）。
     sessionStorage の印に施設の id を入れて「コート案内の行から」と伝える */
  function initCourtLinks() {
    var canVT = !reduceMotion && ('onpageswap' in window) && window.CSS && CSS.supports && CSS.supports('view-transition-name', 'x');
    if (!canVT) return;
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a.court-item[href*="courts.html#"]');
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      var id = a.getAttribute('href').split('#')[1];
      if (!id) return;
      try { sessionStorage.setItem('tcta-court-vt', id); } catch (x) { return; }
      var img = a.querySelector('.court-item__photo img');
      var name = a.querySelector('.sch-item__title');
      if (img) img.style.viewTransitionName = 'court-photo';
      if (name) name.style.viewTransitionName = 'court-name';
    });
  }

  /* クラブ対抗戦の年度のアコーディオン（details.champ）。ひらくときは中身の .panel-item が CSS の動きで
     見出しの裏から順に滑り出す。閉じるときは逆の動き（.is-closing）を流してから閉じる */
  function initChampAccordion() {
    document.querySelectorAll('details.champ').forEach(function (d) {
      var sum = d.querySelector('summary');
      var body = d.querySelector('.champ__body');
      if (!sum || !body) return;
      var closing = null;
      sum.addEventListener('click', function (e) {
        if (!d.open || reduceMotion || !body.querySelector('.panel-item')) return; // ひらくときはそのまま
        e.preventDefault();
        if (closing) return;
        body.classList.add('is-closing');
        closing = setTimeout(function () {
          body.classList.remove('is-closing');
          d.open = false;
          closing = null;
        }, 450);
      });
    });
  }

  /* 横に 1 行で並べる列（.hscroll。大会結果の年度・地図の施設）。はみ出しの有無と位置を class で付け、
     CSS が端の透かしと「scroll →」の案内を出し分ける */
  function initHScroll() {
    document.querySelectorAll('[data-hscroll]').forEach(function (box) {
      var track = box.querySelector('.hscroll__track');
      if (!track) return;
      var update = function () {
        var over = track.scrollWidth > track.clientWidth + 1;
        box.classList.toggle('is-overflow', over);
        box.classList.toggle('is-start', track.scrollLeft <= 1);
        box.classList.toggle('is-end', track.scrollLeft >= track.scrollWidth - track.clientWidth - 1);
      };
      track.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      if (window.ResizeObserver) new ResizeObserver(update).observe(track);
      update();
    });
  }

  function initFullPanel(id, openSel, closeSel, opts) {
    var panel = document.getElementById(id);
    if (!panel) return;

    var openers = document.querySelectorAll(openSel);
    var closer = panel.querySelector(closeSel);
    var last = null;

    // 上下の端の透かし（CSS の .news-all__fade）。はみ出しの有無と位置で付け外す
    var head = panel.querySelector('.news-all__head, .tall__head');
    var fades = function () {
      if (head) panel.style.setProperty('--panel-head', Math.round(head.getBoundingClientRect().height) + 'px');
      var over = panel.scrollHeight > panel.clientHeight + 1;
      panel.classList.toggle('is-top', !over || panel.scrollTop <= 1);
      panel.classList.toggle('is-bottom', !over || panel.scrollTop >= panel.scrollHeight - panel.clientHeight - 1);
    };
    panel.addEventListener('scroll', fades, { passive: true });
    window.addEventListener('resize', fades);

    var closing = null;
    var finishClose = function () {
      panel.classList.remove('is-vt');
      closing = null;
      panel.classList.remove('is-closing');
      panel.hidden = true;
      document.body.classList.remove('is-locked');
      if (last) last.focus();
    };
    var setOpen = function (open) {
      Array.prototype.forEach.call(openers, function (b) {
        b.setAttribute('aria-expanded', String(open));
      });
      if (open) {
        if (closing) { clearTimeout(closing); closing = null; }
        var doOpen = function () {
          panel.classList.remove('is-closing');
          panel.hidden = false;
          document.body.classList.add('is-locked');
          panel.scrollTop = 0;
          // 開くたびに項目の動き（見出しの下から順に滑り出す）を流し直す
          panel.querySelectorAll('[style*="--i"]').forEach(function (el) {
            el.style.animation = 'none';
            void el.offsetWidth;
            el.style.animation = '';
          });
          if (closer) closer.focus();
          fades();
        };
        var from = opts && opts.title && !reduceMotion ? document.querySelector(opts.title.from) : null;
        var to = from ? panel.querySelector(opts.title.to) : null;
        var moves = [];
        if (from && to) {
          [['.sec-head__eyebrow', 'panel-eyebrow'], ['.sec-head__title', 'panel-title']].forEach(function (m) {
            var a = from.querySelector(m[0]), c = to.querySelector(m[0]);
            if (a && c) moves.push([a, c, m[1]]);
          });
        }
        if (moves.length && document.startViewTransition) {
          // 見出しだけを移す。名前は「前」はページの見出しだけ、「後」は全画面の見出しだけに付ける（同時に付けると重複で止まる）。
          // .is-vt は閉じるまで残す（行の滑り出しを見出しが移り終わるまで遅らせる。外すと動きが最初から流れ直す）
          panel.classList.add('is-vt');
          moves.forEach(function (m) { m[0].style.viewTransitionName = m[2]; });
          var done = function () { moves.forEach(function (m) { m[1].style.viewTransitionName = ''; }); };
          var vt = document.startViewTransition(function () {
            moves.forEach(function (m) { m[0].style.viewTransitionName = ''; m[1].style.viewTransitionName = m[2]; });
            doOpen();
          });
          vt.finished.then(done, done);
        } else {
          doOpen();
        }
      } else if (!panel.hidden && !closing) {
        // 閉じるときは逆の動き（下から順に見出しの下へ戻る）を流してから隠す。動きを減らす設定ならすぐ隠す
        if (reduceMotion || !panel.querySelector('.panel-item')) { finishClose(); return; }
        panel.classList.add('is-closing');
        closing = setTimeout(finishClose, 520);
      }
    };

    Array.prototype.forEach.call(openers, function (b) {
      b.addEventListener('click', function () { last = b; setOpen(true); });
    });
    if (closer) closer.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden && !closing) setOpen(false);
    });
  }

  /* ---------- 画像の全画面表示（写真・要項・ドロー・結果・規約） ----------
     .gallery__item / .sheet の画像リンクを、別タブではなくその場で全画面に開く。
     同じ升目（.gallery / .sheets）の中は ← → やスワイプで前後に送れる。
     紙もの（ドロー表など）は画像をタップすると原寸に切り替わり、指で動かして読める。 */
  function initLightbox() {
    var links = Array.prototype.slice.call(
      document.querySelectorAll('a.gallery__item[href], a.sheet[href]')
    ).filter(function (a) { return /\.(webp|jpe?g|png|gif|avif)$/i.test(a.getAttribute('href')); });
    if (!links.length) return;

    var box = document.createElement('div');
    box.className = 'lightbox';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', '画像の拡大表示');
    box.innerHTML =
      '<div class="lightbox__bar">' +
        '<span class="lightbox__count" data-lb-count></span>' +
        '<span class="lightbox__cap" data-lb-cap></span>' +
        '<button type="button" class="lightbox__btn lightbox__close" data-lb-close aria-label="閉じる">×</button>' +
      '</div>' +
      '<button type="button" class="lightbox__btn lightbox__nav lightbox__nav--prev" data-lb-prev aria-label="前の画像">‹</button>' +
      '<div class="lightbox__stage" data-lb-stage><img class="lightbox__img" alt="" data-lb-img></div>' +
      '<button type="button" class="lightbox__btn lightbox__nav lightbox__nav--next" data-lb-next aria-label="次の画像">›</button>' +
      '<p class="lightbox__hint" data-lb-hint>画像をタップすると原寸で表示します</p>';
    document.body.appendChild(box);

    var img = box.querySelector('[data-lb-img]');
    var stage = box.querySelector('[data-lb-stage]');
    var count = box.querySelector('[data-lb-count]');
    var cap = box.querySelector('[data-lb-cap]');
    var prevBtn = box.querySelector('[data-lb-prev]');
    var nextBtn = box.querySelector('[data-lb-next]');
    var group = [];
    var index = 0;
    var opener = null;

    var captionOf = function (a) {
      var c = a.querySelector('.sheet__cap');
      if (c) return c.textContent.replace(/[↗⤢]/g, '').trim();
      var im = a.querySelector('img');
      return im ? im.getAttribute('alt') || '' : '';
    };

    var show = function (i) {
      index = (i + group.length) % group.length;
      var a = group[index];
      box.classList.remove('is-zoomed');
      img.src = a.getAttribute('href');
      img.alt = captionOf(a);
      cap.textContent = captionOf(a);
      count.textContent = group.length > 1 ? (index + 1) + ' / ' + group.length : '';
      prevBtn.hidden = nextBtn.hidden = group.length < 2;
      stage.scrollTop = 0;
      stage.scrollLeft = 0;
    };

    var open = function (a) {
      var root = a.closest('.gallery, .sheets');
      group = root ? links.filter(function (l) { return root.contains(l); }) : [a];
      opener = a;
      box.hidden = false;
      document.body.classList.add('is-locked');
      show(group.indexOf(a));
      box.querySelector('[data-lb-close]').focus();
    };

    var close = function () {
      box.hidden = true;
      box.classList.remove('is-zoomed');
      document.body.classList.remove('is-locked');
      img.removeAttribute('src');
      if (opener) opener.focus();
    };

    links.forEach(function (a) {
      a.removeAttribute('target');
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // 新しいタブで開きたい人はそのまま
        e.preventDefault();
        open(a);
      });
    });

    box.querySelector('[data-lb-close]').addEventListener('click', close);
    prevBtn.addEventListener('click', function () { show(index - 1); });
    nextBtn.addEventListener('click', function () { show(index + 1); });

    // 画像をタップすると原寸に。余白をタップすると閉じる。
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      var zoomIn = !box.classList.contains('is-zoomed');
      if (zoomIn && img.naturalWidth <= stage.clientWidth && img.naturalHeight <= stage.clientHeight) return;
      // タップした場所が拡大後も中央に来るようにする
      var rect = img.getBoundingClientRect();
      var rx = (e.clientX - rect.left) / rect.width;
      var ry = (e.clientY - rect.top) / rect.height;
      box.classList.toggle('is-zoomed', zoomIn);
      if (zoomIn) {
        stage.scrollLeft = img.offsetWidth * rx - stage.clientWidth / 2;
        stage.scrollTop = img.offsetHeight * ry - stage.clientHeight / 2;
      }
    });
    stage.addEventListener('click', function (e) { if (e.target === stage) close(); });

    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === 'ArrowRight') show(index + 1);
    });

    // スワイプで前後へ（原寸表示中はスクロールに譲る）
    var sx = null, sy = null;
    stage.addEventListener('touchstart', function (e) {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (sx === null || box.classList.contains('is-zoomed')) return;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      sx = sy = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(dx < 0 ? index + 1 : index - 1);
    }, { passive: true });
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

    // 今日（日本時間）のマスを点滅させ、今月（無ければその次の月）から出す。描いたページが残っていても合うように、見た時点で付け直す
    var today = null;
    try {
      today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {}
    var start = parseInt(root.getAttribute('data-cal-initial') || '0', 10) || 0;
    if (today) {
      root.querySelectorAll('.cal__cell.is-today').forEach(function (c) { c.classList.remove('is-today'); c.removeAttribute('aria-current'); });
      var cell = root.querySelector('.cal__cell[data-date="' + today + '"]');
      if (cell) { cell.classList.add('is-today'); cell.setAttribute('aria-current', 'date'); }
      var ym = today.slice(0, 7), found = -1;
      for (var k = 0; k < months.length; k++) { if ((months[k].getAttribute('data-key') || '') >= ym) { found = k; break; } }
      start = found < 0 ? months.length - 1 : found;
    }
    show(start);
  }

  /* ---------- コート案内の地図 ----------
     Leaflet で自前に描く。タイルは OpenStreetMap の標準版を CSS でグレーに落とし、
     テニスコートの面（court-shapes.json）を赤く塗って、その重心にピンとラベルを置く。
     施設のボタンを押すとそのコート全体が入る範囲に寄り、「すべて」で全施設を一望する。
     Leaflet（CDN）は defer で読むので、window の load を待ってから始める。 */
  function initCourtMap() {
    var root = document.querySelector('[data-cmap]');
    if (!root) return;
    var el = root.querySelector('[data-cmap-map]');
    var name = root.querySelector('[data-cmap-name]');
    var link = root.querySelector('[data-cmap-link]');
    var tabs = root.querySelectorAll('[data-cmap-tab]');
    var allTab = root.querySelector('[data-cmap-all]');
    var locateBtn = root.querySelector('[data-cmap-locate]');
    var msg = root.querySelector('[data-cmap-msg]');
    var photo = root.querySelector('[data-cmap-photo]');
    var photoImg = root.querySelector('[data-cmap-photo-img]');
    var badges = root.querySelector('[data-cmap-badges]');
    var frame = root.querySelector('.cmap__frame');
    if (!el || !tabs.length) return;

    var courts;
    try { courts = JSON.parse(el.getAttribute('data-courts') || '[]'); } catch (e) { courts = []; }
    if (!courts.length) return;

    // 主会場（courts.js の main: true）。「すべて」ではこの施設を赤く、最前面に出す
    var mainIndex = 0;
    for (var m = 0; m < courts.length; m++) if (courts[m].main) { mainIndex = m; break; }

    // 位置情報が使えない環境（対応していない、HTTP）では「現在地」を出さない
    var canLocate = !!(navigator.geolocation && (window.isSecureContext !== false));
    if (locateBtn && !canLocate) locateBtn.hidden = true;

    function start() {
      if (!window.L) return;
      var L = window.L;
      /* 誤操作防止：指で操作する端末では、1本指はページのスクロールに使い、地図は2本指で動かす・拡大縮小する
         （dragging を切ると Leaflet が touch-action: pan-x pan-y にするので、1本指のスクロールはページへ通る。
         2本指は touchZoom が拡大縮小と移動を受け持つ）。1本指でなぞったときは「2本の指で地図を動かせます」を一瞬出す。
         マウスの端末は、ドラッグで動かし、ホイールではページをスクロールする（scrollWheelZoom: false）。 */
      var touchFirst = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      var map = L.map(el, {
        zoomControl: false,
        scrollWheelZoom: false,      // ページのスクロールを奪わない
        dragging: !touchFirst,
        attributionControl: true,
      });
      if (touchFirst && frame) {
        var hint = document.createElement('div');
        hint.className = 'cmap__hint';
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = '2本の指で地図を動かせます';
        frame.appendChild(hint);
        var hx = 0, hy = 0, hintTimer = null;
        var showHint = function () {
          hint.classList.add('is-on');
          clearTimeout(hintTimer);
          hintTimer = setTimeout(function () { hint.classList.remove('is-on'); }, 1400);
        };
        el.addEventListener('touchstart', function (e) {
          if (e.touches.length === 1) { hx = e.touches[0].clientX; hy = e.touches[0].clientY; }
          else { clearTimeout(hintTimer); hint.classList.remove('is-on'); }  // 2本指になったら案内を消す
        }, { passive: true });
        el.addEventListener('touchmove', function (e) {
          if (e.touches.length !== 1) return;
          if (Math.abs(e.touches[0].clientX - hx) + Math.abs(e.touches[0].clientY - hy) > 12) showHint();
        }, { passive: true });
      }
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      /* 下地は2種類。標準は航空写真（国土地理院の全国最新写真。鍵なしで使え、コートの区画まで見える）。
         「地図」に切り替えると OpenStreetMap の標準版（色は CSS でグレーに落とす）。
         国土地理院のタイルは 18 までなので、19 では 18 を拡大して出す。 */
      var layers = {
        photo: L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {
          attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
          maxZoom: 19, maxNativeZoom: 18, className: 'ctile-photo',
        }),
        map: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19, className: 'ctile-map',
        }),
      };
      var layerBtns = root.querySelectorAll('[data-cmap-layer]');
      var currentLayer = null;
      function setLayer(kind) {
        if (!layers[kind] || kind === currentLayer) return;
        if (currentLayer) map.removeLayer(layers[currentLayer]);
        layers[kind].addTo(map);
        currentLayer = kind;
        Array.prototype.forEach.call(layerBtns, function (b) {
          var on = b.getAttribute('data-cmap-layer') === kind;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
      }
      Array.prototype.forEach.call(layerBtns, function (b) {
        b.addEventListener('click', function () { setLayer(b.getAttribute('data-cmap-layer')); });
      });
      setLayer('photo');

      var allBounds = L.latLngBounds([]);
      var venues = courts.map(function (c, i) {
        var bounds = L.latLngBounds(c.bounds);
        allBounds.extend(bounds);
        // 敷地（薄い赤）→ コート1面ずつ（赤）の順に重ねる
        var area = c.area ? L.polygon(c.area, { className: 'carea', interactive: false }).addTo(map) : null;
        var pitches = L.layerGroup(c.courts.map(function (ring) {
          return L.polygon(ring, { className: 'ccourt', interactive: false });
        })).addTo(map);
        var icon = L.divIcon({
          className: 'cpin-wrap',
          html: '<span class="cpin"><span class="cpin__ring"></span><span class="cpin__dot"></span></span>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        var marker = L.marker([c.lat, c.lng], { icon: icon, title: c.name }).addTo(map);
        marker.bindTooltip(c.name, {
          permanent: true, direction: 'top', offset: [0, -12],
          className: 'cpin-label' + (i === mainIndex ? ' is-main' : ''),
        });
        marker.on('click', function () { select(i); });
        return { bounds: bounds, area: area, pitches: pitches, marker: marker };
      });
      // 主会場のラベルは、他の施設のラベルより後ろに描く（＝前に出る）。CSS の z-index と二重の保険
      (function () {
        var tt = venues[mainIndex].marker.getTooltip();
        var ttEl = tt && tt.getElement();
        if (ttEl && ttEl.parentNode) ttEl.parentNode.appendChild(ttEl);
      })();

      var current = 0;        // 見ている施設の番号。「すべて」は -1
      var located = null;     // 現在地 { latlng, dot, acc }。出していないときは null

      function setActive(i) {
        Array.prototype.forEach.call(tabs, function (t, k) {
          var on = k === i;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-pressed', String(on));
        });
        if (allTab) {
          allTab.classList.toggle('is-active', i < 0);
          allTab.setAttribute('aria-pressed', String(i < 0));
        }
        // 選んだ施設のボタンが列の外に隠れていたら、見える位置まで列を送る（地図のピンから選んだときなど）
        var tab = i >= 0 && tabs[i];
        if (tab && tab.parentNode && tab.parentNode.scrollWidth > tab.parentNode.clientWidth) {
          var tr = tab.parentNode, r = tab.getBoundingClientRect(), tb = tr.getBoundingClientRect(), dx = 0;
          if (r.left < tb.left) dx = r.left - tb.left - 12; else if (r.right > tb.right) dx = r.right - tb.right + 12;
          if (dx) tr.scrollTo({ left: tr.scrollLeft + dx, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
        // 地図の上の見た目。「すべて」のときは主会場を赤くして最前面に（他のラベルに隠れないように）
        var lit = i < 0 ? mainIndex : i;
        venues.forEach(function (v, k) {
          var on = k === lit;
          var w = v.marker.getElement();
          if (w) w.classList.toggle('is-active', on);
          var tt = v.marker.getTooltip() && v.marker.getTooltip().getElement();
          if (tt) tt.classList.toggle('is-active', on);
          v.marker.setZIndexOffset(on ? 1000 : k === mainIndex ? 500 : 0);
        });
      }

      // 寄せる範囲。現在地を出していて、その範囲から 30km 以内なら現在地も入れる（遠いときは施設だけ）
      var NEAR_M = 30000;
      function withLocation(bounds) {
        if (!located) return bounds;
        // 複製してから広げる（L.latLngBounds(既存の範囲) は同じものを返すので、そのまま extend すると
        // 施設の範囲が書き換わり、現在地を消したあともその範囲のままになってしまう）
        var b = L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast());
        if (b.getCenter().distanceTo(located.latlng) > NEAR_M) return b;
        return b.extend(located.latlng);
      }
      function go(bounds, opts, animate) {
        if (animate === false) map.fitBounds(bounds, opts);
        else map.flyToBounds(bounds, Object.assign({ duration: 0.9 }, opts));
      }

      // 左上の施設の写真（右にサーフェス・面数）。写真の無い施設と「すべて」では隠す
      function showPhoto(c) {
        if (!photo) return;
        unzoomPhoto();
        if (c && c.image) {
          if (photoImg) photoImg.src = c.image;
          photo.hidden = false;
        } else photo.hidden = true;
      }
      /* 地図の下のバッジ：屋内（画像）→ サーフェス（画像があれば画像）→ 面数 → 設備（夜間照明は濃い黄色） */
      function showBadges(c) {
        if (!badges) return;
        badges.textContent = '';
        if (!c) return;
        var add = function (text, cls) {
          var s = document.createElement('span'); s.className = 'badge' + (cls ? ' ' + cls : ''); s.textContent = text; badges.appendChild(s);
        };
        var addImg = function (b, alt) {
          var im = document.createElement('img');
          im.className = 'badge badge--img'; im.src = b.img; im.alt = alt; im.width = b.w; im.height = b.h; im.decoding = 'async';
          badges.appendChild(im);
        };
        if (c.badge) {
          if (c.badge.indoor) addImg(c.badge.indoor, c.badge.indoor.alt);
          addImg(c.badge, c.surface || '');
        } else if (c.surface) add(c.surface);
        if (c.faces) add(c.faces + '面');
        (c.features || []).forEach(function (f) { add(f, /^夜間照明/.test(f) ? 'badge--light' : ''); });
      }
      /* 写真のタップ：地図の枠の中いっぱい（余白 12px）まで滑らかに拡大し、しばらくして元に戻る。もう一度押せばすぐ戻る */
      var zoomTimer = null;
      function unzoomPhoto() {
        if (!photo) return;
        if (zoomTimer) { clearTimeout(zoomTimer); zoomTimer = null; }
        photo.classList.remove('is-zoomed');
        photo.style.transform = '';
      }
      function zoomPhoto() {
        if (!photo || !frame) return;
        if (photo.classList.contains('is-zoomed')) { unzoomPhoto(); return; }
        var fr = frame.getBoundingClientRect();
        var pr = photo.getBoundingClientRect();
        var M = 12;
        var s = Math.min((fr.width - M * 2) / pr.width, (fr.height - M * 2) / pr.height);
        if (s <= 1.05) return;
        // 拡大後に枠の真ん中へ来るよう、左上基点のずれを足す
        var tx = (fr.width - pr.width * s) / 2 - (pr.left - fr.left);
        var ty = (fr.height - pr.height * s) / 2 - (pr.top - fr.top);
        photo.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + s + ')';
        photo.classList.add('is-zoomed');
        zoomTimer = setTimeout(unzoomPhoto, 3000);
      }
      if (photo) photo.addEventListener('click', zoomPhoto);
      // 寄せるときの余白。コート全体が真ん中に、まわりに少し余裕がある程度。
      // 左上は写真の分だけ余計に空け、写真でコートが隠れないようにする
      var PAD = 40;
      function padding() {
        var ph = photo && !photo.hidden ? photo.getBoundingClientRect().height : 0;
        return { paddingTopLeft: [PAD, PAD + Math.round(ph * 0.6)], paddingBottomRight: [PAD, PAD] };
      }

      // 施設を1つ選ぶ：そのコート全体が真ん中に入る範囲に寄る（タイルの最大 19 まで寄ってよい）
      function select(i, animate) {
        current = i;
        setActive(i);
        var c = courts[i];
        if (name) name.textContent = c.name;
        if (link) link.href = tabs[i].getAttribute('data-link');
        showPhoto(c);
        showBadges(c);
        go(withLocation(venues[i].bounds), Object.assign({ maxZoom: 19 }, padding()), animate);
      }

      // すべて：全施設が入る範囲を出す
      function showAll(animate) {
        current = -1;
        setActive(-1);
        showPhoto(null);
        showBadges(null);
        if (name) name.textContent = '利用コート ' + courts.length + '施設';
        if (link) link.href = 'https://www.google.com/maps/search/?api=1&query=' + courts[mainIndex].lat + ',' + courts[mainIndex].lng;
        go(withLocation(allBounds), { padding: [48, 48] }, animate);
      }
      function refit() { if (current < 0) showAll(); else select(current); }

      /* 現在地。押すと位置情報の許可を求め、許可されれば青い点（精度の円つき）を出して、
         見ている施設と現在地が両方入る範囲に寄る。もう一度押すと消す。 */
      function say(text) { if (msg) msg.textContent = text || ''; }
      function clearLocation() {
        if (!located) return;
        map.removeLayer(located.dot);
        map.removeLayer(located.acc);
        located = null;
        locateBtn.classList.remove('is-active');
        locateBtn.setAttribute('aria-pressed', 'false');
        say('');
      }
      function showLocation(pos) {
        var latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
        var radius = Math.min(pos.coords.accuracy || 0, 2000);
        if (located) {
          located.latlng = latlng;
          located.dot.setLatLng(latlng);
          located.acc.setLatLng(latlng).setRadius(radius);
        } else {
          located = {
            latlng: latlng,
            acc: L.circle(latlng, { radius: radius, className: 'cloc-acc', interactive: false }).addTo(map),
            dot: L.circleMarker(latlng, { radius: 7, className: 'cloc', interactive: false }).addTo(map),
          };
          located.dot.bindTooltip('現在地', { direction: 'bottom', offset: [0, 8], className: 'cpin-label' });
        }
        locateBtn.classList.add('is-active');
        locateBtn.setAttribute('aria-pressed', 'true');
        // 見ている施設から遠い（30km より先）ときは、施設だけに寄せたままにして一言添える
        var base = L.latLngBounds(current < 0 ? allBounds : venues[current].bounds);
        if (base.getCenter().distanceTo(latlng) > NEAR_M) {
          say('現在地は地図の範囲の外です（' + Math.round(base.getCenter().distanceTo(latlng) / 1000) + 'km）。');
        } else {
          say('');
          refit();
        }
      }
      var GEO_MSG = {
        1: '位置情報の利用が許可されていません。ブラウザの設定で許可してください。',
        2: '現在地を取得できませんでした。',
        3: '現在地の取得に時間がかかりすぎました。もう一度お試しください。',
      };
      function locate() {
        if (located) { clearLocation(); refit(); return; }
        locateBtn.classList.add('is-busy');
        say('現在地を取得しています…');
        navigator.geolocation.getCurrentPosition(
          function (pos) { locateBtn.classList.remove('is-busy'); showLocation(pos); },
          function (err) {
            locateBtn.classList.remove('is-busy');
            say(GEO_MSG[err && err.code] || GEO_MSG[2]);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      }

      Array.prototype.forEach.call(tabs, function (tab, i) {
        tab.addEventListener('click', function () { select(i); });
      });
      if (allTab) allTab.addEventListener('click', function () { showAll(); });
      if (locateBtn && canLocate) locateBtn.addEventListener('click', locate);

      select(0, false);
      el.classList.add('is-ready');
      // 隠れた状態で測られた幅がずれていたときのために、一度だけ測り直して寄せ直す
      setTimeout(function () { map.invalidateSize(); select(0, false); }, 300);
    }

    if (window.L) start();
    else window.addEventListener('load', start);
  }

  /* ---------- フッターの四角（スクロールで動かす） ----------
     漂う動きは CSS の transform、こちらは translate に書き込むので打ち消し合わない。
     フッターが画面を通り過ぎるあいだの進み具合を、そのまま上下の量にしている。 */
  function initFooterDeco() {
    var deco = document.querySelector('.footer-deco');
    if (!deco || reduceMotion) return;

    // 端から端までで動かす量（px）。四角ごとの --depth（0.2〜1.7）を掛けるので、
    // 手前の大きな四角はこの数値より大きく、奥の小さな四角は控えめに動く。
    var RANGE = 260;
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

    /* ページを移るときの切り替え（ページ間ビュートランジション）が使えるか。
       使えるときは、メニューを開いているあいだだけ写しの名前（view-transition-name）を付けておく（style.css 参照） */
    var VT_KEY = 'tcta-mn-vt';
    var canVT = !reduceMotion && ('onpageswap' in window) && window.CSS && CSS.supports && CSS.supports('view-transition-name', 'x');
    var band = menu.querySelector('.mobile-nav__band');
    var items = menu.querySelectorAll('.mobile-nav__item');
    var nameFor = function (open) {
      if (!canVT) return;
      header.style.viewTransitionName = open ? 'site-header' : '';
      menu.style.viewTransitionName = open ? 'mn-sheet' : '';
      if (band) band.style.viewTransitionName = open ? 'mn-band' : '';
      Array.prototype.forEach.call(items, function (el, i) { el.style.viewTransitionName = open ? 'mn-item-' + i : ''; });
    };
    var setOpen = function (open) {
      if (open) {
        // 前回押した行の印（赤く光った状態）を消し、黒に戻していた「今のページ」の行を赤に戻す
        menu.querySelectorAll('.mobile-nav__link.is-tapped').forEach(function (l) { l.classList.remove('is-tapped'); });
        menu.querySelectorAll('.mobile-nav__link[data-was-active]').forEach(function (l) { l.classList.add('is-active'); l.removeAttribute('data-was-active'); });
        // 開くときは必ずヘッダーを出しておく（閉じるボタンが画面から消えないように）
        header.classList.remove('site-header--hidden');
        // ヘッダー（通知バーの有無で高さが変わる）の下端に合わせる。項目はここから下へ滑り出す（style.css の .mobile-nav__item）
        menu.style.paddingTop = header.getBoundingClientRect().bottom + 'px';
      }
      nameFor(open);
      toggle.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
      document.body.classList.toggle('is-locked', open);
      menu.setAttribute('aria-hidden', String(!open));
    };

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    /* メニューのリンクを押したとき。
       ・ページ間ビュートランジションが使えるブラウザ：閉じずにそのまま移動を始める。ブラウザは次のページが描ける状態に
         なるまでこのページ（メニューが開いたまま）を見せ続け、描けるようになったら次のページの上で閉じる動きを流す
         （Base.astro の pagereveal と style.css の ::view-transition-*）。sessionStorage の印で「メニューから」と伝える。
       ・使えないブラウザ：閉じる動きを流し切ってから移動する。押した時点で prefetch を始めておく。
       別タブ・修飾キー付き・ページ内リンクはそのまま。動きを減らす設定ならすぐ移動する。 */
    var closeMs = function () {
      var cs = getComputedStyle(menu);
      var sec = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : (/ms$/.test(v) ? n / 1000 : n); };
      // 閉じ終わるのは、最後（いちばん上）の行：遅れの最大（--mn-stagger）＋その行の戻る時間（--mn-out-short）
      var last = sec(cs.getPropertyValue('--mn-out-short')) || sec(cs.getPropertyValue('--mn-out'));
      return Math.round((sec(cs.getPropertyValue('--mn-stagger')) + last) * 1000) || 500;
    };
    menu.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      // 押した行の文字を赤にして、その瞬間に一瞬光らせる（style.css の .mobile-nav__link.is-tapped）。
      // 同時に、赤くしてあった「今のページ」の行は黒に戻す（色の transition で同じタイミングで変わる）
      if (a.classList.contains('mobile-nav__link')) {
        menu.querySelectorAll('.mobile-nav__link.is-tapped').forEach(function (l) { if (l !== a) l.classList.remove('is-tapped'); });
        menu.querySelectorAll('.mobile-nav__link.is-active').forEach(function (l) { if (l !== a) { l.classList.remove('is-active'); l.setAttribute('data-was-active', '1'); } });
        a.classList.remove('is-tapped'); void a.offsetWidth; a.classList.add('is-tapped');
      }
      var href = a.getAttribute('href') || '';
      var plain = href && href.charAt(0) !== '#' && a.target !== '_blank'
        && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0;
      if (!plain || reduceMotion) { setOpen(false); return; }
      if (canVT) {
        try { sessionStorage.setItem(VT_KEY, '1'); } catch (x) {}
        return; // 閉じない。そのまま移動（次のページが準備できるまでこの画面にとどまる）
      }
      e.preventDefault();
      var pre = document.createElement('link');
      pre.rel = 'prefetch'; pre.href = a.href; pre.as = 'document';
      document.head.appendChild(pre);
      setOpen(false);
      setTimeout(function () { window.location.href = a.href; }, closeMs());
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

  /* ---------- 種目のピクトグラムの動き ----------
     カード1枚ずつ（.evicon ごと）に画面に入った瞬間を見て、そのとき一度だけ動かす（CSS の .evicon.is-on）。
     カルーセルを横に送って初めて見えたカードも、全件表示を開いて見えたカードも、そのときに動く。
     IntersectionObserver は横スクロールの中の見え方（枠で切れている分）も含めて判定する。 */
  function initEventIcons() {
    var icons = document.querySelectorAll('.evicon');
    if (!icons.length || reduceMotion) return;
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(icons, function (el) { el.classList.add('is-on'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-on');
        io.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    Array.prototype.forEach.call(icons, function (el) { io.observe(el); });
  }

  function init() {
    initSplash();
    initReveal();
    initEventIcons();
    initMarquee();
    initHeader();
    initRipple();
    initPressed();
    initHScroll();
    initChampAccordion();
    initFullPanel('news-all', '[data-news-open]', '[data-news-close]', { title: { from: '#news .sec-head__row > div', to: '.news-all__head > div' } });
    initFullPanel('tournaments-all', '[data-tall-open]', '[data-tall-close]');
    initFullPanel('court-all', '[data-court-open]', '[data-court-close]', { title: { from: '#courts .sec-head__row > div', to: '.news-all__head > div' } });
    initCourtLinks();
    initCourtMap();
    initCalendar();
    initFooterDeco();
    initToday();
    initCarousel();
    initFilters();
    initTabs();
    initForm();
    initLightbox();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
