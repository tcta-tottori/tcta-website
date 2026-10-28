/* 会員ポータル固有の小さなスクリプト。本体の main.js より先に読み、
   本文のブロックに .rv（スクロールで現れる）を付ける。動きそのものは main.js の initReveal が担う。 */
(function () {
  'use strict';
  var body = document.querySelector('.portal-body');
  if (body) {
    var kids = body.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.classList.contains('rv')) continue;
      el.classList.add('rv');
    }
  }

  /* ---------- 郵便番号 → 住所の自動入力 ----------
     7 桁そろったら同一オリジンの /api/v1/postal/<郵便番号> を引き、住所欄が空（または前回自動で入れたまま）なら
     都道府県・市区町村・町域を入れてカーソルを末尾に置く。番地・建物名は続けて打ってもらう。 */
  document.querySelectorAll('input[name="postal"]').forEach(function (postal) {
    var form = postal.form;
    var address = form && form.querySelector('input[name="address"]');
    if (!address) return;
    var hint = document.createElement('span');
    hint.className = 'postal-hint';
    postal.insertAdjacentElement('afterend', hint);
    var last = '';
    address.addEventListener('input', function () { address.dataset.auto = '0'; });
    postal.addEventListener('input', function () {
      var code = postal.value.replace(/\D/g, '');
      if (code.length !== 7 || code === last) return;
      last = code;
      hint.textContent = '住所を検索しています…';
      fetch('/api/v1/postal/' + code).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) { hint.textContent = '該当する住所が見つかりません。手で入力してください。'; return; }
        if (!address.value || address.dataset.auto === '1') {
          address.value = j.address;
          address.dataset.auto = '1';
          address.focus();
          try { address.setSelectionRange(address.value.length, address.value.length); } catch (e) {}
        }
        hint.textContent = j.address + ' を入れました。番地・建物名を続けて入力してください。';
      }).catch(function () { hint.textContent = ''; });
    });
  });

  /* ---------- 生年: 元号を変えたら年の選択肢を切り替える（同じ年を選んだまま表示だけ変わる）----------
     保存するのは西暦の年。元号ごとに「元年〜」の範囲を作り、value には元号内の年数を入れる（サーバーが西暦に直す）。 */
  var ERAS = { seireki: { base: 0, max: 0 }, reiwa: { base: 2018, max: 0 }, heisei: { base: 1988, max: 31 }, showa: { base: 1925, max: 64 }, taisho: { base: 1911, max: 15 } };
  document.querySelectorAll('[data-birth-row]').forEach(function (row) {
    var era = row.querySelector('[data-birth-era]');
    var year = row.querySelector('[data-birth-year]');
    if (!era || !year) return;
    var thisYear = Number(row.getAttribute('data-this-year')) || new Date().getFullYear();
    var prevEra = era.value; // 切り替え前の元号（年の読み替えに使う）
    var westernOf = function (eraKey) { // いま選ばれている年を、その元号で読んで西暦に
      var v = Number(year.value);
      if (!year.value || !isFinite(v)) return null;
      var e = ERAS[eraKey] || ERAS.seireki;
      return e.base + v;
    };
    var build = function (keepWestern) {
      var e = ERAS[era.value] || ERAS.seireki;
      var opts = ['<option value="">—</option>'];
      if (era.value === 'seireki') {
        for (var y = thisYear; y >= 1900; y--) opts.push('<option value="' + y + '">' + y + '年</option>');
      } else {
        var max = e.max || (thisYear - e.base);
        for (var n = max; n >= 1; n--) {
          var w = e.base + n;
          if (w < 1900 || w > thisYear) continue;
          opts.push('<option value="' + n + '">' + (n === 1 ? '元' : n) + '年（' + w + '）</option>');
        }
      }
      year.innerHTML = opts.join('');
      if (keepWestern != null) {
        var want = era.value === 'seireki' ? keepWestern : keepWestern - e.base;
        year.value = String(want);
        if (year.value !== String(want)) year.value = ''; // その元号に無い年
      }
    };
    // 初期表示: 既に年が入っていれば、その年に合う元号を選ぶ
    var initial = westernOf(prevEra);
    if (initial != null) {
      era.value = initial >= 2019 ? 'reiwa' : initial >= 1989 ? 'heisei' : initial >= 1926 ? 'showa' : initial >= 1912 ? 'taisho' : 'seireki';
      prevEra = era.value;
      build(initial);
    }
    era.addEventListener('change', function () {
      var w = westernOf(prevEra);
      prevEra = era.value;
      build(w);
    });
  });

  /* ---------- 所属の「その他」を選んだときだけクラブ名の欄を出す ---------- */
  document.querySelectorAll('select[data-club-select]').forEach(function (sel) {
    var form = sel.form;
    var wrap = form && form.querySelector('[data-club-other-wrap]');
    if (!wrap) return;
    var sync = function (focus) {
      var on = sel.value === '__other__';
      wrap.style.display = on ? '' : 'none';
      if (on && focus) { var inp = wrap.querySelector('input'); if (inp) inp.focus(); }
    };
    sel.addEventListener('change', function () { sync(true); });
    sync(false);
  });
})();
