// ホーム画面に追加するための最小の Service Worker。
// 画面の骨組み（HTML/CSS/JS）だけを控えておき、API はいつもネットワークに出る。
// オフラインでの編集はしない（はじめはオンライン編集に絞る）。
const CACHE = 'tcta-admin-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/') || url.origin !== location.origin) return;
  // ネットワーク優先。つながらないときだけ控えを使う（古い画面を見続けないため）
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
