// Service worker test: runs docs/sw.js in a sandbox with a fake notification tray, cache and clients.
// npm run test:sw
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(process.argv[2], 'utf8');
const scope = 'https://smith104th.github.io/bolsillo-worm/';
const store = new Map();
const caches = {
  async open(name) { if (!store.has(name)) store.set(name, new Map()); const m = store.get(name);
    return { match: async (u) => (m.has(String(u)) ? new Response(m.get(String(u))) : undefined), put: async (u, r) => m.set(String(u.url || u), await r.text()), addAll: async () => {} }; },
  keys: async () => [...store.keys()], delete: async (k) => store.delete(k),
};
let tray = [], badge = null, windows = [], opened = [], messages = [];
const handlers = {};
const self = {
  registration: {
    scope,
    showNotification: async (title, o) => { tray = tray.filter((n) => n.tag !== o.tag); tray.push({ title, ...o, close() { tray = tray.filter((x) => x !== this); } }); },
    getNotifications: async ({ tag } = {}) => tray.filter((n) => !tag || n.tag === tag),
  },
  clients: { matchAll: async () => windows, openWindow: async (u) => opened.push(u), claim: async () => {} },
  navigator: { setAppBadge: async (n) => { badge = n; } },
  addEventListener: (t, f) => { handlers[t] = f; },
  skipWaiting: () => {},
};
vm.runInNewContext(src, { self, caches, Response, URL, location: new URL(scope), fetch: () => Promise.reject(new Error('offline')), console });
const push = async (d) => { let p; handlers.push({ data: { json: () => d }, waitUntil: (x) => { p = x; } }); await p; };
const click = async (n) => { let p; handlers.notificationclick({ notification: n, waitUntil: (x) => { p = x; } }); await p; };
const state = async () => JSON.parse((await (await caches.open('bw-state')).match(new URL('./__bw-state', scope).href)?.then?.((r) => r.text())) || (await (async () => { const r = await (await caches.open('bw-state')).match(new URL('./__bw-state', scope).href); return r ? r.text() : '{}'; })()));
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) fails++; };

// the page wrote the badge and their name before going to the background
await (await caches.open('bw-state')).put(new URL('./__bw-state', scope).href, new Response(JSON.stringify({ badge: 2, name: 'Luz' })));

// background: three kisses fold into one
await push({ kind: 'kiss', title: 'Luz sent you a piquito 😗', body: '💋', tag: 'kiss-1' });
ok(tray.length === 1 && tray[0].title === 'Luz sent you a piquito 😗', 'first kiss reads like before');
await push({ kind: 'kiss', title: 'Luz sent you a beso 😘', body: '💋💋💋', tag: 'kiss-2' });
await push({ kind: 'kiss', title: 'Luz sent you a BESAZO 😍', body: '💋💋💋💋💋', tag: 'kiss-3' });
let k = tray.filter((n) => n.tag === 'kiss');
ok(k.length === 1, 'one kiss notification in the tray');
ok(k[0].title === 'Luz sent you 3 kisses 💋' && k[0].body === '😗 😘 😍', `grouped: "${k[0].title}" / "${k[0].body}"`);
ok(k[0].renotify === true, 'it still buzzes');

// reactions group, emoji with variation selector kept
await push({ kind: 'react', title: 'Luz reacted 🥰', body: 'To your note.', tag: 'r1' });
await push({ kind: 'react', title: 'Luz sent you ❤️', body: 'Through the hole.', tag: 'r2' });
const r = tray.filter((n) => n.tag === 'react');
ok(r.length === 1 && r[0].title === 'Luz sent you 2 reactions' && r[0].body === '🥰 ❤️', `reactions: "${r[0]?.title}" / "${r[0]?.body}"`);

// knocks group
await push({ kind: 'knock', title: 'Knock knock', body: 'Luz is thinking about you.', tag: 'n1' });
await push({ kind: 'knock', title: 'Knock knock', body: 'Luz is thinking about you.', tag: 'n2' });
const kn = tray.filter((n) => n.tag === 'knock');
ok(kn.length === 1 && kn[0].title === 'Luz knocked 2 times', `knocks: "${kn[0]?.title}"`);

// notes and photos stay separate and bump the badge; envelopes and dailies don't
await push({ kind: 'note', title: 'Luz slipped a note in your pocket', body: 'hola', tag: 'note-1' });
await push({ kind: 'photo', title: 'A polaroid fell into your pocket', body: 'From Luz.', tag: 'photo-1' });
await push({ kind: 'later', title: 'Luz left you an envelope 💌', body: 'Open when you miss me.', tag: 'later-1' });
await push({ kind: 'daily', title: 'Luz answered', body: 'Buried', tag: 'daily-1' });
ok(badge === 4 && (await state()).badge === 4, `badge 2 + note + photo = ${badge}`);
ok(tray.some((n) => n.tag === 'note-1') && tray.some((n) => n.tag === 'photo-1'), 'note and photo are their own notifications');

// where taps go
const go = (tag) => tray.find((n) => n.tag === tag)?.data?.go;
await push({ kind: 'plant', title: 'p', body: '', tag: 'plant-1' });
await push({ kind: 'unsealed', title: 'u', body: '', tag: 'uns-1' });
await push({ kind: 'reunion', title: 'c', body: '', tag: 'reu-1' });
ok(go('later-1') === 'shelf' && go('uns-1') === 'shelf-from' && go('daily-1') === 'today' && go('plant-1') === 'soil' && go('reu-1') === 'us' && go('note-1') === 'pocket' && go('kiss') === 'pocket',
  `targets: later=${go('later-1')} unsealed=${go('uns-1')} daily=${go('daily-1')} plant=${go('plant-1')} reunion=${go('reu-1')} note=${go('note-1')} kiss=${go('kiss')}`);

// tap with the app closed: opens at the right screen
await click(tray.find((n) => n.tag === 'later-1'));
ok(opened.at(-1) === './#go=shelf', `cold tap opens ${opened.at(-1)}`);
// tap with the app in the background: focus it and tell it where to go
windows = [{ visibilityState: 'hidden', focus: async function () { return this; }, postMessage: (m) => messages.push(m) }];
await click(tray.find((n) => n.tag === 'daily-1'));
ok(messages.at(-1)?.type === 'bw-go' && messages.at(-1)?.to === 'today' && opened.length === 1, `warm tap posts ${JSON.stringify(messages.at(-1))}`);
// focus fails: fall back to opening a window
windows = [{ visibilityState: 'hidden', focus: async () => { throw new Error('nope'); }, postMessage: () => {} }];
await click(tray.find((n) => n.tag === 'plant-1'));
ok(opened.at(-1) === './#go=soil', 'focus failure falls back to openWindow');

// swiping the grouped kiss away restarts the count
tray.find((n) => n.tag === 'kiss').close();
windows = [];
await push({ kind: 'kiss', title: 'Luz sent you a besito 😙', body: '💋💋', tag: 'kiss-9' });
k = tray.filter((n) => n.tag === 'kiss');
ok(k.length === 1 && k[0].title === 'Luz sent you a besito 😙', `after a swipe: "${k[0]?.title}"`);

// while they're looking at the app: no stacking, no badge bump
windows = [{ visibilityState: 'visible' }];
const b0 = badge;
await push({ kind: 'kiss', title: 'Luz sent you a beso 😘', body: '💋💋💋', tag: 'kiss-10' });
await push({ kind: 'note', title: 'Luz slipped a note in your pocket', body: 'x', tag: 'note-2' });
k = tray.filter((n) => n.tag === 'kiss');
ok(k[0].title === 'Luz sent you a beso 😘' && badge === b0, `visible: "${k[0].title}", badge ${badge}`);

// no name stored yet: still reads fine
await (await caches.open('bw-state')).put(new URL('./__bw-state', scope).href, new Response('{}'));
windows = [];
await push({ kind: 'kiss', title: 'X sent you a beso 😘', body: '', tag: 'a' });
await push({ kind: 'kiss', title: 'X sent you a beso 😘', body: '', tag: 'b' });
ok(tray.find((n) => n.tag === 'kiss').title === 'Your person sent you 2 kisses 💋', 'falls back to "Your person"');

// a new version doesn't wipe the shared state
await caches.open('bw-old');
let p; handlers.activate({ waitUntil: (x) => { p = x; } }); await p;
ok(store.has('bw-state') && !store.has('bw-old'), 'activate keeps bw-state, drops old caches');

// a push with nothing readable still shows something
let pp; handlers.push({ data: { json: () => { throw new Error('bad'); }, text: () => 'hi' }, waitUntil: (x) => { pp = x; } }); await pp;
ok(tray.some((n) => n.title === 'Bolsillo Worm' && n.body === 'hi'), 'unreadable push still shows');

console.log(fails ? `\n${fails} failed` : '\nall good');
process.exit(fails ? 1 : 0);
