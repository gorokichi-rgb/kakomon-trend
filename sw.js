'use strict';
/* オフラインでも開けるようにするための仕組み。
   アプリの中身を更新したときは、下の CACHE の番号を1つ上げてください。 */
const CACHE = 'kakomon-v1';
const FILES = ['./', './index.html', './master.js', './core.js', './views.js', './forms.js', './manifest.json', './icon.png', './icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(FILES.map(f => c.add(f).catch(() => { /* 1つ欠けても続ける */ }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (hit) return hit;
    const r = await net;
    return r || (e.request.mode === 'navigate' ? c.match('./index.html') : Response.error());
  }));
});
