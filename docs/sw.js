// Bolsillo Worm service worker: keeps the pocket working offline and delivers buzzes.
const VERSION = '09ba72ef';
const CACHE = `bw-${VERSION}`;
const SHELL = [
  './', './index.html', `./app.js?v=${VERSION}`, `./styles.css?v=${VERSION}`, './manifest.webmanifest',
  './fonts/geist.woff2', './fonts/geist-mono.woff2',
  './icons/icon-192.png', './icons/badge-96.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'Bolsillo Worm', body: e.data?.text() }; }
  const kind = data.kind || 'poke';
  const vibrate = kind === 'kiss' ? [60, 60, 60, 60, 160] : kind === 'knock' ? [40, 90, 40] : [30, 60, 30];
  e.waitUntil(self.registration.showNotification(data.title || 'Something moved in your pocket', {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    tag: data.tag || kind,
    renotify: true,
    vibrate,
    data: { url: './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  })());
});
