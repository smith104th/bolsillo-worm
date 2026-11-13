// Bolsillo Worm service worker: keeps the pocket working offline and delivers buzzes.
const VERSION = '7cc7cf6d';
const CACHE = `bw-${VERSION}`;
const SHELL = [
  './', './index.html', `./app.js?v=${VERSION}`, `./styles.css?v=${VERSION}`, './manifest.webmanifest',
  './fonts/geist.woff2', './fonts/geist-mono.woff2',
  './icons/icon-192.png', './icons/badge-96.png', './design/deck.json?v=6f9988ce',
];
// Design Tinder photos (Wikimedia), kept across versions; the newest 150 stay
const DESIGN = 'bw-design';

// A little state shared with the page (src/badge.js): the home-screen badge count,
// their name, and running counts for pushes that group into one notification.
// Lives in its own cache so new versions don't wipe it.
const STATE = 'bw-state';
const STATE_URL = new URL('./__bw-state', self.registration.scope).href;
async function readState() {
  try { const r = await (await caches.open(STATE)).match(STATE_URL); return r ? await r.json() : {}; } catch { return {}; }
}
async function writeState(s) {
  try { await (await caches.open(STATE)).put(STATE_URL, new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json' } })); } catch { /* */ }
}

// Things that land in the pocket count toward the badge on the icon.
const ITEMS = ['note', 'doodle', 'photo', 'whisper', 'wiggle', 'song', 'trinket'];
// Repeat kisses, reactions and knocks fold into one notification with a count.
const GROUPED = ['kiss', 'react', 'knock'];
// Where a tap on the notification takes you.
const WHERE = { later: 'shelf', unsealed: 'shelf-from', daily: 'today', plant: 'soil', reunion: 'us', house: 'house', hq: 'house' };

const lastEmoji = (t) => (String(t || '').match(/(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}\p{Emoji_Modifier}]*)\s*$/u) || [])[1] || null;

function groupedText(kind, g, name) {
  const who = name || 'Your person';
  const emo = g.emo.length ? g.emo.join(' ') : null;
  if (kind === 'kiss') return { title: `${who} sent you ${g.n} kisses 💋`, body: emo || '💋'.repeat(Math.min(5, g.n)) };
  if (kind === 'react') return { title: `${who} sent you ${g.n} reactions`, body: emo || '❤️' };
  return { title: `${who} knocked ${g.n} times`, body: 'Still thinking about you.' };
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== STATE && k !== 'bw-media' && k !== DESIGN) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && url.hostname === 'upload.wikimedia.org') { e.respondWith(designPhoto(req)); return; }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Only the app's own page is kept for offline; other pages on the site (/house/, /deck/) load normally.
    const scope = new URL(self.registration.scope).pathname;
    if (url.pathname !== scope && url.pathname !== `${scope}index.html`) return;
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});

async function designPhoto(req) {
  const c = await caches.open(DESIGN);
  const hit = await c.match(req.url);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') {
    await c.put(req.url, r.clone()).catch(() => {});
    c.keys().then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - 150)).map((k) => c.delete(k)))).catch(() => {});
  }
  return r;
}

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'Bolsillo Worm', body: e.data?.text() }; }
  e.waitUntil(onPush(data));
});

async function onPush(data) {
  const kind = data.kind || 'poke';
  let title = data.title || 'Something moved in your pocket';
  let body = data.body || '';
  let tag = data.tag || kind;
  const st = await readState();
  let looking = false;
  try { looking = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).some((c) => c.visibilityState === 'visible'); } catch { /* */ }

  if (GROUPED.includes(kind)) {
    tag = kind;
    const groups = st.groups || (st.groups = {});
    let g = groups[kind] || { n: 0, emo: [] };
    // start the count over if they're looking at the app or swiped the last one away
    if (looking) g = { n: 0, emo: [] };
    else {
      try {
        if (self.registration.getNotifications && !(await self.registration.getNotifications({ tag })).length) g = { n: 0, emo: [] };
      } catch { /* keep counting */ }
    }
    g.n += 1;
    const emo = kind === 'knock' ? null : lastEmoji(data.title);
    if (emo) g.emo = [...g.emo, emo].slice(-10);
    groups[kind] = g;
    if (g.n > 1) ({ title, body } = groupedText(kind, g, st.name));
  }

  // the page keeps the badge exact while it's open; in the background, count new things here
  if (ITEMS.includes(kind) && !looking) {
    st.badge = (st.badge || 0) + 1;
    try { await self.navigator.setAppBadge?.(st.badge); } catch { /* */ }
  }
  await writeState(st);

  const vibrate = kind === 'kiss' ? [60, 60, 60, 60, 160] : kind === 'knock' ? [40, 90, 40] : [30, 60, 30];
  await self.registration.showNotification(title, {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    tag,
    renotify: true,
    vibrate,
    data: { go: WHERE[kind] || 'pocket' },
  });
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const go = e.notification.data?.go || 'pocket';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (!('focus' in c)) continue;
      try { const w = await c.focus(); (w || c).postMessage({ type: 'bw-go', to: go }); return; } catch { /* try the next one */ }
    }
    return self.clients.openWindow(`./#go=${go}`);
  })());
});
