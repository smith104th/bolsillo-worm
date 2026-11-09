// Bolsillo Worm: carry each other.
import { CONFIG } from './config.js';
import { h, $, store, hoursSince, clamp, timeIn, hourIn, dayIn, hash, isIOS, isStandalone, rand, sleep } from './util.js';
import { Pocket } from './pocket.js';
import { inchesFor } from './worm.js';
import { ITEM_KINDS, FOODS, TRINKETS, weatherKind, weatherWord, lipsSVG, skyFor } from './draw.js';
import { toast, icon, sheet, btn, closeAllSheets, onSheets, ICON } from './ui.js';
import { sfx, buzz, unlockAudio } from './feel.js';
import { supabaseBackend } from './backend.js';
import { mockBackend } from './mock.js';
import { onboard, installGate, fmtCode, nice } from './onboarding.js';
import { openItem } from './compose.js';
import { feedSheet, dropSheet, todaySheet, usSheet, peekSheet, settingsSheet, KISS_NAMES } from './sheets.js';

const S = { hole: null, members: [], events: [], slot: 0, online: false, weather: null, stashed: new Set(store('stashed') || []) };
let backend, pocket;
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo') || !String(CONFIG.supabaseUrl).startsWith('https');

const app = {
  S,
  get backend() { return backend; },
  get pocket() { return pocket; },
  me: () => S.members.find((m) => m.slot === S.slot),
  them: () => S.members.find((m) => m.slot !== S.slot),
  slot: () => S.slot,
  today: () => dayIn(S.members.find((m) => m.slot === 0)?.place?.tz || 'UTC'),
  seed: () => hash(S.hole?.code || 'bw') % 997,
  defaultUnits: () => (/^en-US/i.test(navigator.language) ? 'mi' : 'km'),
  asItem: (e) => ({ ...e, opened: !!e.opened_at, mine: e.from_slot === S.slot }),
  stash(id) { S.stashed.add(id); store('stashed', [...S.stashed].slice(-500)); app.refreshPocket(); },
  refreshPocket,
  send, feed, mist, knock, ring, enablePush, enableMotion,
  onDailyChange: null,
};

// ─────────────────────────────────────────────── boot
boot().catch((e) => fatal(e));

async function boot() {
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('./sw.js').catch(() => {});
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__bwInstallPrompt = e; });
  const hashCode = (location.hash.match(/join=([A-Z0-9-]+)/i) || [])[1];
  if (hashCode) { store('pendingCode', hashCode.replace(/-/g, '').toUpperCase()); history.replaceState(null, '', location.pathname + location.search); }

  backend = DEMO ? mockBackend() : supabaseBackend(CONFIG);
  window.__bw = { backend, app };
  if (!DEMO) await installGate(store('pendingCode'));
  await backend.init();
  let data = await backend.load();
  if (!data.hole) {
    if (DEMO && !params.has('onboard')) {
      await backend.create('Manu', { name: 'Fideo', color: 'lombriz', pattern: 'rings', acc: 'beanie' }, { city: 'Buenos Aires', country: 'Argentina', lat: -34.6, lon: -58.38, tz: 'America/Argentina/Buenos_Aires' });
    } else {
      await onboard(backend, { code: store('pendingCode') });
      store('pendingCode', null);
    }
    data = await backend.load();
  }
  $('#onboard').hidden = true;
  enterPocket(data);
}

function fatal(e) {
  console.error(e);
  const root = $('#onboard'); root.hidden = false;
  root.replaceChildren(h('div.ob-card', h('h1', 'The pocket is stuck'), h('p.lede', nice(e)), btn('Try again', () => location.reload(), 'primary')));
}

// ─────────────────────────────────────────────── state
function applyData({ hole, members, events }) {
  S.hole = hole; S.members = members;
  S.events = events.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const mine = members.find((m) => m.user_id === backend.userId);
  if (mine) S.slot = mine.slot;
}

function pocketItems() {
  const theirs = S.events.filter((e) => ITEM_KINDS.includes(e.kind) && e.from_slot !== S.slot && !S.stashed.has(e.id));
  const pinned = theirs.filter((e) => !e.opened_at || e.kept);
  const rest = theirs.filter((e) => e.opened_at && !e.kept).slice(0, Math.max(0, 12 - pinned.length));
  return [...pinned, ...rest].slice(0, 22).map(app.asItem);
}

function refreshPocket() {
  if (!pocket) return;
  pocket.syncItems(pocketItems());
  const them = app.them(), me = app.me();
  if (them) {
    pocket.setTheirWorm(them.worm, inchesFor(them.love));
    const fresh = S.events.filter((e) => e.kind === 'kiss' && e.from_slot === S.slot && hoursSince(e.created_at) < 24).length;
    pocket.setMarks(fresh);
    pocket.setNeeds({ hungry: clamp(hoursSince(them.fed_at) / 36, 0, 1), dry: clamp(hoursSince(them.misted_at) / 30, 0, 1) });
  }
  if (me) pocket.setMyWorm(me.worm, inchesFor(me.love));
  if (them && !S.weather && !S.weatherLoading && Date.now() - (S.weatherAt || 0) > 120000) loadWeather();
  updateSky();
  renderHeader();
  renderDockDots();
  $('#waiting').hidden = !!them;
}

// ─────────────────────────────────────────────── the pocket
function enterPocket(data) {
  applyData(data);
  $('#app').hidden = false;
  buildChrome();
  pocket = new Pocket($('#pocket'), {
    insets: () => {
      const top = $('#label').getBoundingClientRect().bottom + 14;
      const dock = $('#dock').getBoundingClientRect();
      return { top: Math.max(top, 80), bottom: window.innerHeight - dock.top + 8 };
    },
    onPet: throttle(() => act('pet', {}), 4000),
    onBoop: throttle(() => act('boop', {}), 2500),
    onOpenItem: (it) => openItem(app, it),
    onFinger: throttle((n, down) => { if (S.online) backend.send(n && down ? { t: 'f', x: +n.x.toFixed(3), y: +n.y.toFixed(3), d: 1 } : { t: 'f', d: 0 }); }, 45, true),
    onKnot: () => { if (S.slot === 0) act('touch', {}); toast('Fingertips touched.', { tone: 'love', icon: 'heart' }); },
  });
  refreshPocket();
  pocket.start();
  updateAsleep();

  backend.connect(S.hole.id, S.slot, realtime);
  if (store('motion') || !(window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission)) enableMotion(false);

  setInterval(() => { if (!document.hidden) backend.updateMe({}).catch(() => {}); }, 120000);
  setInterval(() => { updateSky(); renderHeader(); updateAsleep(); refreshNeeds(); }, 30000);
  loadWeather(); setInterval(loadWeather, 20 * 60000);
  document.addEventListener('visibilitychange', onVisible);
  backend.updateMe({}).catch(() => {});
  syncPush();
  setTimeout(welcome, 900);
}

async function onVisible() {
  if (document.hidden) { backend.track(false); return; }
  backend.track(true);
  try {
    const data = await backend.load();
    const hadThem = !!app.them();
    applyData(data); refreshPocket();
    if (!hadThem && app.them()) toast(`${app.them().name} crawled in.`, { tone: 'love' });
    if (backend.channelState && backend.channelState() !== 'joined') backend.connect(S.hole.id, S.slot, realtime);
  } catch { /* offline: keep what we have */ }
}

function refreshNeeds() {
  const them = app.them(); if (!them || !pocket) return;
  pocket.setNeeds({ hungry: clamp(hoursSince(them.fed_at) / 36, 0, 1), dry: clamp(hoursSince(them.misted_at) / 30, 0, 1) });
}

function updateAsleep() {
  const them = app.them(); if (!them || !pocket) return;
  const hr = hourIn(them.place?.tz);
  const night = hr >= 23 || hr < 7;
  const asleep = !S.online && night && hoursSince(them.seen_at) > 0.25;
  pocket.setAsleep(asleep);
  S.asleep = asleep;
}

// ─────────────────────────────────────────────── chrome: header + glass tab bar
function updateSky() {
  const them = app.them();
  const hour = them ? hourIn(them.place?.tz) : new Date().getHours();
  const sky = skyFor(hour, S.weather?.kind || 'clear');
  if (S.sky?.key !== sky.key) {
    S.sky = sky;
    pocket?.setSky(sky);
    document.body.classList.toggle('dark', sky.dark);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', sky.stops[0]);
  }
}

const TABS = [
  ['pocket', 'Pocket', () => {}],
  ['feed', 'Feed', () => (app.them() ? feedSheet(app) : waitToast())],
  ['drop', 'Drop', () => (app.them() ? dropSheet(app) : waitToast())],
  ['today', 'Today', () => todaySheet(app)],
  ['us', 'Us', () => usSheet(app)],
];
const waitToast = () => { toast('Waiting for your person to crawl in.'); setTab('pocket'); };
function setTab(name) { document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name)); }

function buildChrome() {
  $('#label').onclick = () => app.them() && peekSheet(app);
  $('#peek').replaceChildren(icon('peek'));
  $('#peek').onclick = () => (app.them() ? peekSheet(app) : waitToast());
  const bar = h('div.tabbar.glass', TABS.map(([id, label, fn]) =>
    h(`button.tab${id === 'pocket' ? '.on' : ''}`, { type: 'button', 'data-tab': id, 'aria-label': label, onclick: () => { sfx.tick(); closeAllSheets(); setTab(id); fn(); } },
      icon(id === 'pocket' ? 'pocket' : id === 'drop' ? 'drop' : id), h('span.lbl', label), id === 'today' ? h('span.dot', { hidden: true }) : null)));
  $('#dock').replaceChildren(bar, kissBtn());
  onSheets((n) => { if (n === 0) setTab('pocket'); });
  const code = S.hole?.code;
  $('#waiting').replaceChildren(h('div.waiting-card',
    h('span.mono.small.muted', 'YOUR POCKET IS EMPTY'),
    h('h2', 'Waiting for your person'),
    h('p', 'Send them the link. When they crawl in, their worm lands right here.'),
    h('div.code', fmtCode(code)),
    btn([icon('share'), ' Send the link'], async () => {
      const url = `${location.origin}${location.pathname}#join=${code}`;
      const text = `Crawl into my pocket 🪱 Install Bolsillo Worm, then use code ${fmtCode(code)}`;
      try { if (navigator.share) await navigator.share({ title: 'Bolsillo Worm', text, url }); else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Link copied.'); } } catch { /* */ }
    }, 'primary')));
}

function renderHeader() {
  const them = app.them(), lab = $('#label');
  if (!them) { lab.replaceChildren(h('div.hd-meta', h('span.dot'), 'AN EMPTY POCKET'), h('div.hd-name', 'Bolsillo'), h('div.hd-sub', 'Your person isn\'t here yet')); return; }
  const w = S.weather;
  const status = S.online ? ['here', 'Here now'] : S.asleep ? ['sleep', 'Asleep'] : ['', 'Away'];
  const meta = [status[1], timeIn(them.place?.tz), them.place?.city, w ? `${Math.round(w.temp)}°C ${weatherWord[w.kind] || ''}`.trim() : null].filter(Boolean).join(' · ');
  lab.replaceChildren(
    h('div.hd-meta', h(`span.dot${status[0] ? '.' + status[0] : ''}`), meta),
    h('div.hd-name', them.worm?.name || 'Worm'),
    h('div.hd-sub', `${them.name}'s worm, in your pocket`),
  );
}
function renderDockDots() {
  const today = app.today();
  const did = (slot) => S.events.some((e) => e.kind === 'daily' && e.from_slot === slot && e.payload?.day === today);
  const dot = document.querySelector('.tab[data-tab=today] .dot');
  if (dot) dot.hidden = did(S.slot);
}

// Kiss: hold to charge, five strengths
function kissBtn() {
  const dots = h('div.kiss-dots', [1, 2, 3, 4, 5].map(() => h('span')));
  const meter = h('div.kiss-meter.glass', h('div.kiss-lips', { html: lipsSVG('#FF2D55') }), h('div.kiss-name'), dots);
  document.body.append(meter);
  let t0 = 0, level = 0, raf = 0;
  const b = h('button.kissbtn.glass', { type: 'button', 'aria-label': 'Kiss (hold for a bigger one)', html: ICON.kissFill });
  const tick = () => {
    const el = (performance.now() - t0) / 1000;
    const lv = Math.min(5, 1 + Math.floor(el / 0.55));
    if (lv !== level) {
      level = lv; buzz(8 + lv * 6); sfx.tick();
      meter.querySelector('.kiss-name').textContent = KISS_NAMES[lv]; meter.dataset.level = lv;
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i < lv));
    }
    meter.querySelector('.kiss-lips').style.transform = `scale(${0.8 + Math.min(1, el / 2.4) * 0.9}) rotate(${Math.sin(el * 20) * level}deg)`;
    raf = requestAnimationFrame(tick);
  };
  b.addEventListener('pointerdown', (e) => {
    if (!app.them()) return toast('Waiting for your person to crawl in.');
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* */ }
    t0 = performance.now(); level = 0; meter.classList.add('on'); tick();
    if (pocket?.worm) pocket.worm.pucker = 3;
  });
  const release = () => {
    if (!t0) return;
    cancelAnimationFrame(raf); meter.classList.remove('on');
    const lv = level || 1; t0 = 0;
    kiss(lv);
  };
  b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  return b;
}

// ─────────────────────────────────────────────── doing things
async function act(kind, payload, media = null, mime = null) {
  try {
    const ev = await backend.act(kind, payload, media, mime);
    if (ev) upsertEvent(ev);
    return ev;
  } catch (e) { console.warn(e); toast(nice(e)); return null; }
}

async function send(kind, payload, extra = {}, media = null, mime = null) {
  const ev = await act(kind, payload, media, mime);
  if (!ev) return false;
  pocket.sendIntoHole(kind, payload);
  backend.nudge(kind, extra);
  toast(`Dropped into ${app.them()?.name || 'their'}'s pocket.`, { icon: 'drop' });
  return true;
}

function kiss(level) {
  pocket.kissFly(level);
  act('kiss', { level });
  backend.nudge('kiss', { level });
  if (level >= 4) buzz([20, 40, 20, 40, 60]);
}

const feedNudge = throttle((food) => backend.nudge('feed', { food: FOODS[food] }), 3600 * 1000);
function feed(kind) {
  pocket.dropFood(kind);
  act('feed', { food: kind });
  feedNudge(kind);
}
function mist() { pocket.mist(); act('mist', {}); }
async function knock() {
  if (await act('knock', {})) { backend.nudge('knock'); sfx.knock(); buzz([30, 80, 30]); toast('Knocked.'); }
}
async function ring() {
  if (await act('ring', {})) { backend.nudge('ring'); toast(`Called. ${app.them()?.name || 'They'} will get a buzz.`); }
}

function upsertEvent(ev) {
  const i = S.events.findIndex((e) => e.id === ev.id);
  if (i >= 0) S.events[i] = { ...S.events[i], ...ev }; else S.events.unshift(ev);
}

// ─────────────────────────────────────────────── realtime
const petToast = throttle((name) => toast(`${name} is petting you`, { tone: 'love', icon: 'heart' }), 25000);
const realtime = {
  status(st) { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setTimeout(() => backend.connect(S.hole.id, S.slot, realtime), 4000); },
  event(ev, type) {
    if (!ev || !ev.id) return;
    const prev = S.events.find((e) => e.id === ev.id);
    upsertEvent(ev);
    const fromThem = ev.from_slot !== S.slot;
    if (type === 'INSERT' && !prev) react(ev, fromThem);
    else if (type === 'UPDATE' && fromThem && (ev.kind === 'pet' || ev.kind === 'boop') && (ev.payload?.n || 1) > (prev?.payload?.n || 1)) react(ev, true);
    refreshPocket();
  },
  member(row, type) {
    if (type === 'INSERT' || type === 'DELETE') { onVisible(); return; }
    const i = S.members.findIndex((m) => m.slot === row.slot);
    if (i >= 0) S.members[i] = { ...S.members[i], ...row }; else S.members.push(row);
    refreshPocket(); updateAsleep();
  },
  hole(row) { S.hole = { ...S.hole, ...row }; },
  ready: throttle(() => onVisible(), 3000),
  presence(state) {
    const online = !!state[String(1 - S.slot)]?.length;
    if (online !== S.online) {
      S.online = online;
      pocket.setLive(online && !!app.them());
      if (online && app.them()) { toast(`${app.them().name} is in the pocket. Touch fingertips.`, { tone: 'love' }); buzz([15, 50, 15]); sfx.chime(); }
      updateAsleep(); renderHeader();
    }
  },
  live(p) { if (p?.t === 'f') pocket.setTheirFinger(p); },
};

function react(ev, fromThem) {
  const name = app.them()?.name || 'They';
  const p = ev.payload || {};
  if (!fromThem) {
    if (ev.kind === 'tunnel') celebrateTunnel(p);
    return;
  }
  switch (ev.kind) {
    case 'pet': case 'boop':
      petToast(name); buzz(12);
      pocket.burst('heart', pocket.hole.x, pocket.hole.y, 4);
      break;
    case 'kiss': beingKissed(name, p.level || 1); break;
    case 'feed': toast(`${name} fed you ${FOODS[p.food] || 'a crumb'}. Ñam.`, { icon: 'feed' }); pocket.burst('crumb', pocket.hole.x, pocket.hole.y, 10); break;
    case 'mist': toast(`${name} misted you. Fresh.`, { icon: 'mist' }); pocket.burst('drop', pocket.hole.x, pocket.hole.y, 12); break;
    case 'knock': pocket.knocked(); sfx.knock(); buzz([40, 90, 40]); toast(`Knock knock. ${name} is thinking of you.`, { icon: 'knock' }); break;
    case 'ring': toast(`${name} is waiting at the hole.`, { icon: 'ring', tone: 'love' }); buzz([20, 60, 20]); break;
    case 'note': case 'doodle': case 'photo': case 'whisper': case 'wiggle': case 'trinket': {
      const words = { note: 'slipped a note into your pocket', doodle: 'drew you something', photo: 'dropped a polaroid in', whisper: 'whispered something', wiggle: 'sent a wiggle', trinket: `found you ${TRINKETS[p.what] || 'something'}` };
      pocket.addItem(app.asItem(ev), true);
      toast(`${name} ${words[ev.kind]}.`, { tone: 'love' });
      sfx.chime(); buzz([15, 40, 15]);
      if (ev.kind === 'wiggle' && p.pattern) setTimeout(() => { buzz(p.pattern); pocket.wiggle(p.pattern); }, 900);
      break;
    }
    case 'daily':
      toast(p.both ? `Today's ${p.part === 'photo' ? 'photos are' : 'answers are'} up. Go look.` : `${name} ${p.part === 'photo' ? 'posted today\'s photo' : 'answered today\'s question'}. Yours unlocks it.`, { icon: 'today' });
      app.onDailyChange?.();
      break;
    case 'tunnel': celebrateTunnel(p); break;
    case 'reunion': toast(`${name} set the countdown${p.note ? `: ${p.note}` : ''}.`); break;
    case 'arrived': toast(`${name} crawled into your pocket.`, { tone: 'love' }); onVisible(); break;
  }
}

function beingKissed(name, level) {
  const layer = h('div.kiss-layer', { onclick: () => layer.remove() });
  const n = [0, 1, 3, 5, 9, 16][level];
  document.body.append(layer);
  pocket.blowKiss(level);
  for (let i = 0; i < n; i++) {
    const s = h('div.stamp', { html: lipsSVG(level >= 4 ? '#E0123F' : '#FF2D55') });
    const big = level === 5 && i === n - 1;
    Object.assign(s.style, { left: big ? '50%' : `${rand(8, 92)}%`, top: big ? '46%' : `${rand(12, 82)}%`, width: big ? '58vw' : `${rand(16, 30)}vw`, transform: `translate(-50%,-50%) rotate(${rand(-30, 30)}deg)`, animationDelay: `${0.35 + i * 0.12}s` });
    layer.append(s);
    setTimeout(() => { buzz(level >= 4 ? 22 : 12); sfx.kiss(level); }, 350 + i * 120);
  }
  layer.append(h('div.kiss-caption.glass', h('span.mono', 'incoming'), h('b', `${name} sent you a ${KISS_NAMES[level]}`)));
  setTimeout(() => layer.classList.add('out'), 2600 + n * 120);
  setTimeout(() => layer.remove(), 3400 + n * 120);
}

function celebrateTunnel(p) {
  toast(`You dug all the way through. ${p.km ? Number(p.km).toLocaleString() + ' km of tunnel.' : ''}`, { tone: 'love', ms: 6000 });
  pocket.burst('heart', pocket.W / 2, pocket.H / 2, 30); pocket.flash = 1; sfx.knot(); buzz([40, 60, 40, 60, 200]);
}

// ─────────────────────────────────────────────── weather on their side
async function loadWeather() {
  const pl = app.them()?.place;
  if (!pl?.lat) return;
  S.weatherLoading = true; S.weatherAt = Date.now();
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pl.lat}&longitude=${pl.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`);
    const j = await r.json();
    const c = j.current;
    S.weather = { temp: c.temperature_2m, code: c.weather_code, kind: weatherKind(c.weather_code), day: !!c.is_day };
    pocket.setWeather(S.weather.kind, S.weather.day);
    updateSky();
    renderHeader();
  } catch { /* the pocket stays dry */ } finally { S.weatherLoading = false; }
}

// ─────────────────────────────────────────────── permissions
let motionOn = false;
async function enableMotion(ask) {
  const DOE = window.DeviceOrientationEvent;
  if (!DOE) { if (ask) toast('No tilt sensor here.'); return; }
  if (typeof DOE.requestPermission === 'function') {
    if (!ask) return;
    try { if ((await DOE.requestPermission()) !== 'granted') return toast('Tilt is off.'); } catch { return; }
    try { await DeviceMotionEvent.requestPermission?.(); } catch { /* */ }
  }
  store('motion', true);
  if (motionOn) { if (ask) toast('Tilt is on.'); return; }
  motionOn = true;
  const R = Math.PI / 180;
  window.addEventListener('deviceorientation', (e) => { if (e.beta == null) return; pocket.setTilt(Math.sin(clamp(e.gamma, -60, 60) * R), Math.sin(clamp(e.beta, -80, 80) * R)); });
  let lastJolt = 0;
  window.addEventListener('devicemotion', (e) => {
    const a = e.acceleration; if (!a || a.x == null) return;
    const m = Math.hypot(a.x, a.y, a.z);
    if (m > 18 && performance.now() - lastJolt > 600) { lastJolt = performance.now(); pocket.jolt(Math.min(2, m / 18)); sfx.squish(); }
  });
  if (ask) toast('Tilt is on. Try it.');
}

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
async function enablePush() {
  if (DEMO) return toast('Not in demo mode.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return toast(isIOS() && !isStandalone() ? 'Add it to your Home Screen first, then open it from there.' : 'This browser can\'t do notifications.');
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications are off. You can allow them in your phone settings.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    const key = await backend.vapidKey();
    if (sub && store('vapid') && store('vapid') !== key) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    store('vapid', key);
    const json = sub.toJSON();
    await backend.updateMe({ push: json });
    const me = app.me(); if (me) me.push = json;
    toast('Notifications on. You\'ll feel it when something lands.');
  } catch (e) { toast('Couldn\'t turn on notifications: ' + (e.message || e)); }
}
async function syncPush() {
  if (DEMO || !('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && sub.endpoint !== app.me()?.push?.endpoint) await backend.updateMe({ push: sub.toJSON() });
    if (!sub) await enablePush();
  } catch { /* */ }
}

function welcome() {
  if (store('welcomed')) return;
  store('welcomed', true);
  const canPush = !DEMO && 'Notification' in window && Notification.permission === 'default';
  const needsTilt = window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function';
  const them = app.them();
  const s = sheet('Welcome to the pocket', [
    h('ul.howto',
      h('li', h('b', 'Stroke'), ` ${them ? them.worm?.name || 'the worm' : 'the worm'} to pet it. `, h('b', 'Tap'), ' its head to boop.'),
      h('li', h('b', 'Hold'), ' the kiss button. Longer hold, bigger kiss.'),
      h('li', h('b', 'Feed'), ' it crumbs and mist it so it doesn\'t dry out.'),
      h('li', h('b', 'Today'), ': one photo and one answer each. Buried until you both dig.'),
      h('li', 'When you\'re both in here at once, the hole opens. ', h('b', 'Touch fingertips'), '.')),
    canPush ? btn('Turn on notifications', async () => { await enablePush(); }, 'primary') : null,
    needsTilt ? btn('Let the pocket feel tilt', () => enableMotion(true), 'ghost') : null,
    btn('Got it', () => s.close(), canPush ? 'ghost' : 'primary'),
  ]);
}

// ─────────────────────────────────────────────── helpers
function throttle(fn, ms, trailing = false) {
  let last = 0, timer = null, lastArgs;
  return (...args) => {
    const now = Date.now(); lastArgs = args;
    if (now - last >= ms) { last = now; fn(...args); }
    else if (trailing && !timer) timer = setTimeout(() => { timer = null; last = Date.now(); fn(...lastArgs); }, ms - (now - last));
  };
}

window.__bwDebug = { S, app, sleep };
