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
      var norm = (postal.value.normalize ? postal.value.normalize('NFKC') : postal.value).replace(/\D/g, '').slice(0, 7);
      if (norm !== postal.value) postal.value = norm;
      var code = norm;
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

  /* ---------- 郵便番号がわからないとき: 都道府県 → 市区町村 → 町域 と選んで探す ----------
     同一オリジンの /api/v1/address/cities・/towns を引く。選んだ町域の郵便番号と住所を欄に入れる。 */
  var PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
  document.querySelectorAll('input[name="postal"]').forEach(function (postal) {
    var form = postal.form;
    var address = form && form.querySelector('input[name="address"]');
    if (!address) return;
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'zip-toggle';
    toggle.textContent = '郵便番号がわからない方は住所から探す';
    toggle.setAttribute('aria-expanded', 'false');
    var box = document.createElement('div');
    box.className = 'zip-search';
    box.hidden = true;
    box.innerHTML = '<p class="zip-search__title">住所から郵便番号を探す</p>'
      + '<ol class="zip-search__steps">'
      + '<li><label>① 都道府県 <select data-zip-pref><option value="">選んでください</option>' + PREFS.map(function (p) { return '<option' + (p === '鳥取県' ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label></li>'
      + '<li><label>② 市区町村 <select data-zip-city disabled><option value="">—</option></select></label></li>'
      + '<li><label>③ 町域 <input type="search" data-zip-filter placeholder="町名の一部で絞り込み" disabled><select data-zip-town size="6" disabled></select></label></li>'
      + '</ol><p class="zip-search__msg mute" role="status"></p>';
    var anchor = postal.parentElement && postal.parentElement.tagName === 'LABEL' ? postal.parentElement : postal;
    var hintP = anchor.nextElementSibling && anchor.nextElementSibling.matches('p.mute') ? anchor.nextElementSibling : anchor;
    hintP.insertAdjacentElement('afterend', toggle);
    toggle.insertAdjacentElement('afterend', box);
    var pref = box.querySelector('[data-zip-pref]');
    var city = box.querySelector('[data-zip-city]');
    var filter = box.querySelector('[data-zip-filter]');
    var town = box.querySelector('[data-zip-town]');
    var msg = box.querySelector('.zip-search__msg');
    var towns = [];
    var esc = function (v) { return String(v).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
    var loadCities = function () {
      city.innerHTML = '<option value="">—</option>'; city.disabled = true;
      town.innerHTML = ''; town.disabled = true; filter.disabled = true; filter.value = '';
      if (!pref.value) return;
      msg.textContent = '市区町村を読み込んでいます…';
      fetch('/api/v1/address/cities?pref=' + encodeURIComponent(pref.value)).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) { msg.textContent = j.error || '読み込めませんでした'; return; }
        city.innerHTML = '<option value="">選んでください</option>' + j.cities.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
        city.disabled = false; msg.textContent = '';
      }).catch(function () { msg.textContent = '読み込めませんでした。時間をおいて試してください。'; });
    };
    var paintTowns = function () {
      var q = filter.value.trim();
      var list = towns.filter(function (t) { return !q || t.town.indexOf(q) >= 0 || t.postal.indexOf(q.replace(/\D/g, '') || '@') === 0; });
      town.innerHTML = list.map(function (t) { return '<option value="' + t.postal + '|' + esc(t.town) + '">' + esc(t.town || '（町域なし）') + '　〒' + t.postal.slice(0, 3) + '-' + t.postal.slice(3) + '</option>'; }).join('');
      msg.textContent = list.length ? list.length + ' 件。町域を選ぶと郵便番号と住所を入れます。' : '該当する町域がありません。';
    };
    var loadTowns = function () {
      town.innerHTML = ''; town.disabled = true; filter.disabled = true; filter.value = '';
      if (!city.value) return;
      msg.textContent = '町域を読み込んでいます…';
      fetch('/api/v1/address/towns?pref=' + encodeURIComponent(pref.value) + '&city=' + encodeURIComponent(city.value)).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) { msg.textContent = j.error || '読み込めませんでした'; return; }
        towns = j.towns; town.disabled = false; filter.disabled = false; paintTowns();
      }).catch(function () { msg.textContent = '読み込めませんでした。時間をおいて試してください。'; });
    };
    var pick = function () {
      if (!town.value) return;
      var parts = town.value.split('|');
      postal.value = parts[0];
      address.value = pref.value + city.value + (parts[1] || '');
      address.dataset.auto = '1';
      postal.dispatchEvent(new Event('change'));
      var done = form.querySelector('.postal-hint');
      if (done) done.textContent = '〒' + parts[0] + '　' + address.value + ' を入れました。番地・建物名を続けて入力してください。';
      box.hidden = true; toggle.setAttribute('aria-expanded', 'false');
      address.focus();
      try { address.setSelectionRange(address.value.length, address.value.length); } catch (e) {}
    };
    toggle.addEventListener('click', function () {
      box.hidden = !box.hidden;
      toggle.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      if (!box.hidden && city.disabled && pref.value) loadCities();
    });
    pref.addEventListener('change', loadCities);
    city.addEventListener('change', loadTowns);
    filter.addEventListener('input', paintTowns);
    town.addEventListener('change', pick);
    town.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); pick(); } });
  });

  /* ---------- 生年月ピッカー ----------
     元のプルダウン（年・月）はフォーム送信用に残して隠し、代わりにボタンを出す。
     押すと画面の中央にダイアログを開き、① 生まれた年 → ② 生まれた月 の順に選んで「決定」で入れる。
     年は元号ごとの一覧（西暦・和暦・年齢を 1 行に）。値が空なら 30 歳前後の年を真ん中に見せる（勝手には選ばない）。 */
  var eraOf = function (y) {
    if (y >= 2019) return ['令和', y - 2018];
    if (y >= 1989) return ['平成', y - 1988];
    if (y >= 1926) return ['昭和', y - 1925];
    return ['大正', y - 1911];
  };
  var wareki = function (y) { var e = eraOf(y); return e[0] + (e[1] === 1 ? '元' : e[1]) + '年'; };
  var ageOf = function (y, m) { var d = new Date(); return d.getFullYear() - y - (m > d.getMonth() + 1 ? 1 : 0); }; // 誕生月に入ったら 1 つ上がる
  var ageThisYear = function (y) { return new Date().getFullYear() - y; };
  document.querySelectorAll('[data-birth]').forEach(function (box, idx) {
    var ySel = box.querySelector('[data-birth-year]');
    var mSel = box.querySelector('[data-birth-month]');
    if (!ySel || !mSel) return;
    var form = ySel.form;
    var defYear = Number(box.getAttribute('data-default-year')) || new Date().getFullYear() - 30;
    var years = [];
    for (var k = 0; k < ySel.options.length; k++) if (ySel.options[k].value) years.push(Number(ySel.options[k].value));
    var required = ySel.required;
    ySel.required = false; mSel.required = false; // 隠したまま必須だと送信時に止まるので JS で確かめる
    box.classList.add('is-enhanced');
    var ageOut = box.querySelector('[data-birth-age]');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'birth__btn';
    btn.setAttribute('aria-haspopup', 'dialog');
    box.querySelector('.birth__label').insertAdjacentElement('afterend', btn);

    // ダイアログは body 直下に置く（本文のアニメーションの影響を受けずに画面中央に固定するため）
    var dlg = document.createElement('div');
    dlg.className = 'bp';
    dlg.hidden = true;
    dlg.innerHTML = '<div class="bp__backdrop" data-close></div>'
      + '<div class="bp__dialog" role="dialog" aria-modal="true" aria-labelledby="bp-title-' + idx + '" tabindex="-1"></div>';
    document.body.appendChild(dlg);
    var panel = dlg.querySelector('.bp__dialog');

    var paint = function () {
      var y = Number(ySel.value), m = Number(mSel.value);
      if (y && m) btn.innerHTML = '<span class="birth__val">' + y + '年 ' + m + '月 <small>（' + wareki(y) + '）</small></span><span class="birth__chg">変更</span>';
      else btn.innerHTML = '<span class="birth__ph">生まれた年と月を選ぶ</span><span class="birth__chg">選ぶ</span>';
      btn.classList.toggle('is-empty', !(y && m));
      if (ageOut) ageOut.innerHTML = y && m ? '現在の年齢 <b>満' + ageOf(y, m) + '歳</b>' : '';
    };

    var step = 'year', py = 0, pm = 0; // 選んでいる途中の値（「決定」までは元の欄に入れない）
    var render = function () {
      var h = [];
      h.push('<div class="bp__head"><p class="bp__title" id="bp-title-' + idx + '">生年月を選ぶ</p><button type="button" class="bp__x" data-close aria-label="閉じる"></button></div>');
      h.push('<ol class="bp__steps">'
        + '<li class="' + (step === 'year' ? 'is-on' : 'is-done') + '"><button type="button" data-go="year"><span>1</span>生まれた年<b>' + (py ? py + '年' : '未選択') + '</b></button></li>'
        + '<li class="' + (step === 'month' ? 'is-on' : '') + '"><button type="button" data-go="month"' + (py ? '' : ' disabled') + '><span>2</span>生まれた月<b>' + (pm ? pm + '月' : '未選択') + '</b></button></li></ol>');
      if (step === 'year') {
        var groups = [];
        years.forEach(function (yy) {
          var e = eraOf(yy)[0];
          if (!groups.length || groups[groups.length - 1].era !== e) groups.push({ era: e, ys: [] });
          groups[groups.length - 1].ys.push(yy);
        });
        h.push('<div class="bp__jump" role="group" aria-label="元号で探す">' + groups.map(function (g) { return '<button type="button" data-jump="' + g.era + '">' + g.era + '</button>'; }).join('') + '</div>');
        h.push('<div class="bp__cols" aria-hidden="true"><span>西暦</span><span>和暦</span><span>今年の年齢</span></div>');
        h.push('<div class="bp__body" data-years>');
        groups.forEach(function (g) {
          h.push('<p class="bp__era" data-era="' + g.era + '">' + g.era + '</p>');
          g.ys.forEach(function (yy) {
            h.push('<button type="button" class="bp__row' + (yy === py ? ' is-on' : '') + (yy === defYear && !py ? ' is-hint' : '') + '" data-y="' + yy + '">'
              + '<b>' + yy + '年</b><span>' + wareki(yy) + '</span><span>' + ageThisYear(yy) + '歳' + (yy === defYear && !py ? '<em>目安</em>' : '') + '</span></button>');
          });
        });
        h.push('</div>');
      } else {
        h.push('<div class="bp__body bp__body--month"><p class="bp__lead"><b>' + py + '年（' + wareki(py) + '）</b>生まれ。月を選んでください。</p><div class="bp__months">');
        for (var mm = 1; mm <= 12; mm++) h.push('<button type="button" class="bp__m' + (mm === pm ? ' is-on' : '') + '" data-m="' + mm + '">' + mm + '<small>月</small></button>');
        h.push('</div></div>');
      }
      h.push('<div class="bp__foot"><p class="bp__sum">' + (py && pm ? py + '年' + pm + '月生まれ<span>満' + ageOf(py, pm) + '歳</span>' : py ? py + '年生まれ<span>次に月を選んでください</span>' : '<span>まず生まれた年を選んでください</span>') + '</p>'
        + '<button type="button" class="bp__ok" data-ok' + (py && pm ? '' : ' disabled') + '>決定</button></div>');
      panel.innerHTML = h.join('');
      if (step === 'year') {
        var list = panel.querySelector('[data-years]');
        var target = panel.querySelector('[data-y="' + (py || defYear) + '"]');
        if (list && target) list.scrollTop = target.offsetTop - list.clientHeight / 2 + target.offsetHeight / 2;
      }
    };
    var open = function () {
      py = Number(ySel.value) || 0; pm = Number(mSel.value) || 0;
      step = py && !pm ? 'month' : 'year';
      dlg.hidden = false;
      document.documentElement.classList.add('bp-lock');
      render();
      panel.focus();
    };
    var close = function () {
      dlg.hidden = true;
      document.documentElement.classList.remove('bp-lock');
      btn.focus();
    };
    btn.addEventListener('click', open);
    dlg.addEventListener('click', function (e) {
      var t = e.target.closest('[data-close],button');
      if (!t) return;
      if (t.hasAttribute('data-close')) { close(); return; }
      if (t.hasAttribute('data-ok')) {
        ySel.value = String(py); mSel.value = String(pm);
        box.classList.remove('is-invalid');
        paint(); close(); return;
      }
      if (t.getAttribute('data-go')) { step = t.getAttribute('data-go'); render(); return; }
      if (t.getAttribute('data-jump')) {
        var list = panel.querySelector('[data-years]');
        var head = panel.querySelector('[data-era="' + t.getAttribute('data-jump') + '"]');
        if (list && head) list.scrollTo({ top: head.offsetTop, behavior: 'smooth' });
        return;
      }
      if (t.getAttribute('data-y')) { py = Number(t.getAttribute('data-y')); step = 'month'; render(); return; }
      if (t.getAttribute('data-m')) { pm = Number(t.getAttribute('data-m')); render(); var ok = panel.querySelector('[data-ok]'); if (ok) ok.focus(); }
    });
    dlg.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    if (form && required) form.addEventListener('submit', function (e) {
      if (ySel.value && mSel.value) return;
      e.preventDefault();
      box.classList.add('is-invalid');
      btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    paint();
  });

  /* ---------- ふりがな欄はひらがなだけ ----------
     IME で変換している途中（isComposing）は触らない。確定したら、カタカナ・半角カナはひらがなに直し、
     それ以外の文字（漢字・英数字・記号）は取り除いて、何を取り除いたかを欄の下に出す。 */
  var toHira = function (s) {
    s = s.normalize ? s.normalize('NFKC') : s;
    return s.replace(/[\u30a1-\u30f6]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0x60); });
  };
  document.querySelectorAll('input[data-kana]').forEach(function (inp) {
    var note = document.createElement('span');
    note.className = 'kana-note';
    note.setAttribute('role', 'status');
    inp.insertAdjacentElement('afterend', note);
    var composing = false;
    var clean = function () {
      var before = inp.value;
      var hira = toHira(before).replace(/[\s\u3000]+/g, '');
      var removed = hira.replace(/[\u3041-\u3096\u30fc]/g, '');
      var after = hira.replace(/[^\u3041-\u3096\u30fc]/g, '');
      if (after !== before) {
        inp.value = after;
        try { inp.setSelectionRange(after.length, after.length); } catch (e) {}
      }
      note.textContent = removed ? 'ひらがな以外（' + removed.slice(0, 8) + '）は入力できません' : '';
      inp.classList.toggle('is-kana-error', !!removed);
    };
    inp.addEventListener('compositionstart', function () { composing = true; });
    inp.addEventListener('compositionend', function () { composing = false; clean(); });
    inp.addEventListener('input', function (e) { if (!composing && !e.isComposing) clean(); });
    inp.addEventListener('blur', clean);
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
