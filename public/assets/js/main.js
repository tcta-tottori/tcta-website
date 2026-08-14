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

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sessionStorage.setItem('tcta-splash', 'done'); } catch (e) {}
      splash.classList.add('is-out');
      // ここで初めてヒーローの登場アニメーションが動き出す
      root.classList.remove('splash-on');
      setTimeout(function () {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 700);
    }

    // 保険。映像が届かない・再生されない場合でも、ここで必ず本文へ進む。
    // このスクリプトは defer なので、外部CSSの読み込みが遅いと実行自体が遅れる。
    // そのときは映像が先に進んでいるので、残り時間を見て掛け直す。
    function armFallback() {
      clearTimeout(timer);
      var left = 3.4;
      if (video && isFinite(video.duration) && video.duration > 0) {
        left = Math.max(0, video.duration - video.currentTime);
      }
      timer = setTimeout(finish, (left + 1) * 1000);
    }
    armFallback();

    if (video) {
      // 実行が遅れて、すでに再生し終えていた場合はすぐ幕を上げる
      if (video.ended) { finish(); return; }

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

  /* ---------- 追従する見出し（表示域が長いセクション） ----------
     見出しが画面上部に貼り付いている間だけ .is-pinned を付ける。
     貼り付く前から地の色を敷いてしまうと、背後の大きな英字が隠れてしまうため。 */
  function initStickyHeads() {
    var heads = document.querySelectorAll('.section--sticky-head > .container > .sec-bar, .section--sticky-head > .container > .sec-head');
    if (!heads.length || !('IntersectionObserver' in window)) return;

    heads.forEach(function (head) {
      // sticky の停止位置より 1px 上に判定線を引き、そこを越えたら「貼り付いた」とみなす
      var top = parseFloat(getComputedStyle(head).top) || 0;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          head.classList.toggle('is-pinned', e.intersectionRatio < 1);
        });
      }, { threshold: [1], rootMargin: '-' + (top + 1) + 'px 0px 0px 0px' });
      io.observe(head);
    });
  }

  /* ---------- リンク集の流れ ----------
     いつも一定の速さで流しておくが、指でなぞる・ホイールを回すなど
     触られたらそのぶん素直に動かし、手が離れて7秒ほど経ったらまた流し出す。
     カードは中身が2組並んでいるので、半分進んだところで戻せば継ぎ目なく回る。 */
  function initMarquee() {
    var view = document.querySelector('.marquee');
    var track = view && view.querySelector('.marquee__track');
    if (!view || !track || reduceMotion) return;

    var SPEED = 50;       // px/秒
    var RESUME = 7000;    // 触ったあと、また流れ出すまで
    var half = 0;
    var holdUntil = 0;    // この時刻まではこちらから動かさない
    var hovering = false;
    var onScreen = true;
    var last = 0;

    var measure = function () { half = track.scrollWidth / 2; };
    measure();
    window.addEventListener('resize', measure);

    // 触られたら止める。ホイールも指も同じ扱い。
    var hold = function () { holdUntil = performance.now() + RESUME; };
    ['pointerdown', 'touchstart', 'wheel'].forEach(function (ev) {
      view.addEventListener(ev, hold, { passive: true });
    });
    // マウスを乗せているあいだは止め、離れたらすぐ戻す
    view.addEventListener('mouseenter', function () { hovering = true; });
    view.addEventListener('mouseleave', function () { hovering = false; });

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
        view.scrollLeft += SPEED * dt;
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

  /* ---------- ヘッダー（スクロールで影・モバイルメニュー） ---------- */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    // 透過ヘッダー（トップ）はモバイルだけ追従したままなので、
    // 写真から抜けたら白背景に戻せるよう、こちらでも .hsh を付け外しする。
    var overlay = header.classList.contains('site-header--overlay');
    var onScroll = function () {
      header.classList.toggle('hsh', window.scrollY > (overlay ? 40 : 100));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var toggle = document.querySelector('.hamburger');
    var menu = document.getElementById('mobile-nav');
    if (!toggle || !menu) return;

    var setOpen = function (open) {
      if (open) {
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

    // 初期表示：TODAY の線を左に置く。
    // scroll-padding のぶんだけ手前を空けるので、左には終了した大会の端が覗き、
    // 線のすぐ右に直近の大会が1枚まるごと入り、その次の大会が右端で少し切れる。
    var marker = track.querySelector('[data-carousel-today]');
    if (marker) {
      var place = function () {
        var pad = parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
        track.scrollLeft = Math.max(0, marker.offsetLeft - pad);
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
    initStickyHeads();
    initMarquee();
    initHeader();
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
