/* 会員ポータル固有の小さなスクリプト。本体の main.js より先に読み、
   本文のブロックに .rv（スクロールで現れる）を付ける。動きそのものは main.js の initReveal が担う。 */
(function () {
  'use strict';
  var body = document.querySelector('.portal-body');
  if (!body) return;
  var kids = body.children;
  for (var i = 0; i < kids.length; i++) {
    var el = kids[i];
    if (el.classList.contains('rv')) continue;
    el.classList.add('rv');
  }
})();
