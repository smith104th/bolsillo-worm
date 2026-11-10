// Bolsillo Worm: carry each other.
import { CONFIG } from './config.js';
import { h, $, store, hoursSince, clamp, timeIn, hourIn, dayIn, hash, isIOS, isStandalone, rand, sleep } from './util.js';
import { Pocket } from './pocket.js';
import { inchesFor } from './worm.js';
import { ITEM_KINDS, FOODS, foodName, TRINKETS, weatherKind, weatherWord, skyFor, KISS_EMOJI, KISS_NAMES, REACTIONS } from './draw.js';
import { toast, icon, sheet, btn, closeAllSheets, onSheets, ICON, confirmBox } from './ui.js';
import { sfx, buzz, unlockAudio } from './feel.js';
import { supabaseBackend } from './backend.js';
import { mockBackend } from './mock.js';
import { onboard, installGate, fmtCode, nice } from './onboarding.js';
import { openItem } from './compose.js';
import { questionFor } from './questions.js';
import { feedSheet, dropSheet, todaySheet, usSheet, peekSheet, settingsSheet } from './sheets.js';
import { Pager } from './pager.js';
import { Shelf, SHELF_BOTTOM } from './shelf.js';
import { SoilPage, SOIL_BG } from './soil.js';

const S = { hole: null, members: [], events: [], slot: 0, online: false, weather: null, planted: new Map(), shelf: new Map(), stashed: new Set(store('stashed') || []) };
const dailyFns = new Set();
const COMPOST_H = 72; // opened things settle into the soil after three days
let backend, pocket, shelf, soil, pager;
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
  dayOf: (iso) => dayIn(S.members.find((m) => m.slot === 0)?.place?.tz || 'UTC', new Date(iso)),
  questionFor(day) {
    const p = S.planted.get(day);
    if (p) return { q: p.question, by: p.from_slot === S.slot ? 'you' : (app.them()?.name || 'them'), mine: p.from_slot === S.slot };
    return { q: questionFor(day, app.seed()), by: null };
  },
  composted: (e) => !!e.opened_at && !e.kept && hoursSince(e.opened_at) > COMPOST_H,
  shelfChanged(e) {
    if (!e?.id) return;
    const prev = S.shelf.get(e.id);
    const ev = { ...(prev || {}), ...e };
    if (ev.kind === 'later' || ev.kept) S.shelf.set(e.id, ev); else S.shelf.delete(e.id);
    const i = S.events.findIndex((x) => x.id === e.id); if (i >= 0) S.events[i] = { ...S.events[i], ...e };
    if (pager?.index === 1) { shelf?.render(); markShelfSeen(); }
    shelfBadge();
  },
  goTo: (i) => { closeAllSheets(); pager?.go(i); },
  loadPlanted,
  seed: () => hash(S.hole?.code || 'bw') % 997,
  defaultUnits: () => (/^en-US/i.test(navigator.language) ? 'mi' : 'km'),
  asItem: (e) => ({ ...e, opened: !!e.opened_at, mine: e.from_slot === S.slot }),
  stash(id) { S.stashed.add(id); store('stashed', [...S.stashed].slice(-500)); app.refreshPocket(); },
  refreshPocket,
  send, feed, mist, knock, ring, react: sendReact, enablePush, enableMotion,
  onDaily: (fn) => dailyFns.add(fn),
  dailyChanged: () => { for (const f of dailyFns) if (f() === false) dailyFns.delete(f); },
  onReact: null,
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
  const pinned = theirs.filter((e) => !e.opened_at && !e.kept); // kept things live on the shelf
  const rest = theirs.filter((e) => e.opened_at && !e.kept && !app.composted(e)).slice(0, Math.max(0, 12 - pinned.length));
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
  shelf = Shelf(app, $('#screen-shelf'));
  soil = SoilPage(app, $('#screen-soil'));
  pager = Pager([$('#screen-pocket'), $('#screen-shelf'), $('#screen-soil')], {
    labels: ['Pocket', 'Shelf', 'Soil'],
    onChange: (i) => {
      sfx.tick();
      if (i === 1) { shelf.show(); markShelfSeen(); } else shelf.hide();
      if (i === 2) soil.show(); else soil.hide();
      if (i === 0) pocket?.start(); else pocket?.stop();
      paintEdges();
    },
  });
  pager.watch($('#screen-shelf'));
  pager.watch($('#screen-soil'));
  pocket = new Pocket($('#pocket'), {
    insets: () => {
      const top = $('#label').getBoundingClientRect().bottom + 14;
      const dock = $('#dock').getBoundingClientRect();
      return { top: Math.max(top, 80), bottom: window.innerHeight - dock.top + 30 };
    },
    onSwipe: (e) => pager?.begin(e),
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
  loadPlanted();
  loadShelf();
  syncPush();
  setTimeout(welcome, 900);
}

async function onVisible() {
  if (document.hidden) { backend.track(false); return; }
  navigator.serviceWorker?.getRegistration?.().then((r) => r?.update()).catch(() => {});
  backend.track(true);
  try {
    const data = await backend.load();
    const hadThem = !!app.them();
    applyData(data); refreshPocket(); loadPlanted(); loadShelf();
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
  // their sky: your gradient by day, warmer at dawn and dusk, deep blue with stars at night
  const alt = params.has('alt') ? +params.get('alt') : null;
  const sky = skyFor(app.them()?.place, new Date(), alt);
  S.sky = sky;
  pocket?.setSky(sky);
  shelf?.setSky(sky);
  document.body.classList.toggle('dark', sky.dark);
  paintEdges();
}

// Safari tints its bars from the page edges: match whatever screen is showing
function paintEdges() {
  const sky = S.sky || { top: '#6FBEFF', bottom: '#EEF6FF' };
  const i = pager?.index || 0;
  const [top, bottom] = i === 2 ? ['#FFFFFF', SOIL_BG] : i === 1 ? [sky.top, SHELF_BOTTOM] : [sky.top, sky.bottom];
  document.documentElement.style.backgroundColor = top;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', top);
  $('#edge-top').style.backgroundColor = top;
  $('#edge-bottom').style.backgroundColor = bottom;
}

const TABS = [
  ['pocket', 'Pocket', () => pager?.go(0)],
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
  const status = S.online ? ['here', 'here now'] : S.asleep ? ['sleep', 'asleep'] : ['', 'away'];
  const meta = [timeIn(them.place?.tz), them.place?.city, w ? `${Math.round(w.temp)}°C ${weatherWord[w.kind] || ''}`.trim() : null].filter(Boolean).join(' · ');
  lab.replaceChildren(...[
    h('div.hd-meta', meta),
    h('div.hd-name', them.worm?.name || 'Worm'),
    h('div.hd-sub', h(`span.dot${status[0] ? '.' + status[0] : ''}`), `${them.name}'s worm · ${status[1]}`),
    S.online ? null : callInBtn(them),
  ].filter(Boolean));
}
// when they're not in the pocket: a little button to buzz them over
function callInBtn(them) {
  const recently = S.calledAt && Date.now() - S.calledAt < 120000;
  return h(`button.callin.glass${recently ? '.sent' : ''}`, {
    type: 'button', disabled: recently,
    onclick: async (e) => {
      e.stopPropagation();
      if (S.asleep && !(await confirmBox(`It's ${timeIn(them.place?.tz)} for ${them.name} and they look asleep. Buzz them anyway?`, 'Buzz them'))) return;
      ring();
    },
  }, icon('ring'), recently ? `Buzzed ${them.name}. Waiting at the hole.` : `Call ${them.name} in`);
}

function renderDockDots() {
  const today = app.today();
  const did = (slot) => S.events.some((e) => e.kind === 'daily' && e.from_slot === slot && e.payload?.day === today);
  const dot = document.querySelector('.tab[data-tab=today] .dot');
  if (dot) dot.hidden = did(S.slot);
}

// Kiss: tap for the emoji tray, hold to charge a kiss (five strengths)
function kissBtn() {
  const dots = h('div.kiss-dots', [1, 2, 3, 4, 5].map(() => h('span')));
  const face = h('div.kiss-face', '💋');
  const meter = h('div.kiss-meter.glass', face, h('div.kiss-name'), dots);
  const tray = h('div.tray.glass', { hidden: true },
    h('div.tray-row', REACTIONS.map((e) => h('button.tray-emo', { type: 'button', onclick: () => { closeTray(); sendReact(e); } }, e))),
    h('div.tray-hint', 'Hold 💋 for a bigger kiss'));
  document.body.append(meter, tray);
  const closeTray = () => { tray.classList.remove('in'); setTimeout(() => { if (!tray.classList.contains('in')) tray.hidden = true; }, 220); };
  const openTray = () => { tray.hidden = false; requestAnimationFrame(() => tray.classList.add('in')); sfx.tick(); };
  document.addEventListener('pointerdown', (e) => { if (!tray.hidden && !tray.contains(e.target) && !b.contains(e.target)) closeTray(); });

  let t0 = 0, level = 0, raf = 0, holdT = 0, charging = false;
  const b = h('button.kissbtn.glass', { type: 'button', 'aria-label': 'Kiss: tap for reactions, hold for a bigger kiss' }, h('span', '💋'));
  const tick = () => {
    const el = (performance.now() - t0) / 1000;
    const lv = Math.min(5, 1 + Math.floor(el / 0.55));
    if (lv !== level) {
      level = lv; buzz(8 + lv * 6); sfx.kiss(1, lv);
      face.textContent = KISS_EMOJI[lv];
      meter.querySelector('.kiss-name').textContent = KISS_NAMES[lv]; meter.dataset.level = lv;
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i < lv));
    }
    face.style.transform = `scale(${0.85 + Math.min(1, el / 2.4) * 0.7}) rotate(${Math.sin(el * 20) * level * 1.5}deg)`;
    raf = requestAnimationFrame(tick);
  };
  b.addEventListener('pointerdown', (e) => {
    if (!app.them()) return toast('Waiting for your person to crawl in.');
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* */ }
    t0 = performance.now(); level = 0; charging = false;
    holdT = setTimeout(() => { charging = true; closeTray(); meter.classList.add('on'); tick(); if (pocket?.worm) pocket.worm.pucker = 3; }, 230);
  });
  const release = () => {
    if (!t0) return;
    clearTimeout(holdT);
    if (!charging) { t0 = 0; tray.hidden ? openTray() : closeTray(); return; }
    cancelAnimationFrame(raf); meter.classList.remove('on');
    const lv = level || 1; t0 = 0; charging = false;
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
  if (await act('ring', {})) {
    backend.nudge('ring'); sfx.chime(); buzz([15, 40, 15]);
    S.calledAt = Date.now(); renderHeader();
    setTimeout(renderHeader, 120500);
    if (pocket) pocket.glow = 1.3;
  }
}

async function sendReact(emoji, extra = {}) {
  if (!app.them()) return;
  if (!extra.to && !extra.day) pocket.sendReaction(emoji);
  sfx.react();
  buzz(10);
  const ev = await act('react', { emoji, ...extra });
  if (ev) backend.nudge('react', { emoji, about: extra.about || null });
  return ev;
}

function upsertEvent(ev) {
  const i = S.events.findIndex((e) => e.id === ev.id);
  if (i >= 0) S.events[i] = { ...S.events[i], ...ev }; else S.events.unshift(ev);
}

async function loadShelf() {
  try {
    const rows = await backend.shelf();
    S.shelf = new Map(rows.map((e) => [e.id, e]));
    if (pager?.index === 1) { shelf?.render(); markShelfSeen(); }
    shelfBadge();
    // capsules whose day has come: say so once
    const today = app.today();
    const told = new Set(store('readyTold') || []);
    const ready = rows.filter((e) => e.kind === 'later' && e.from_slot !== S.slot && !e.opened_at && e.payload?.mode === 'date' && e.payload.on <= today && !told.has(e.id));
    if (ready.length) {
      ready.forEach((e) => told.add(e.id)); store('readyTold', [...told].slice(-200));
      setTimeout(() => toast(`Something on your shelf is ready to open 🎁 Swipe left.`, { tone: 'love', ms: 5000 }), 1800);
    }
  } catch { /* the shelf can wait */ }
}
function markShelfSeen() {
  const seen = new Set(store('shelfSeen') || []);
  for (const e of S.shelf.values()) if (e.from_slot !== S.slot) seen.add(e.id);
  store('shelfSeen', [...seen].slice(-400));
  shelfBadge();
}
function shelfBadge() {
  const seen = new Set(store('shelfSeen') || []);
  const fresh = [...S.shelf.values()].some((e) => e.kind === 'later' && e.from_slot !== S.slot && !e.opened_at && !seen.has(e.id));
  pager?.dots.children[1]?.classList.toggle('new', fresh);
}

async function loadPlanted() {
  try {
    const rows = await backend.planted();
    S.planted = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
    app.dailyChanged();
  } catch { /* the daily question still works */ }
}
function whenDay(day) {
  const n = Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(app.today() + 'T00:00:00Z')) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return n < 7 ? new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) : new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
app.whenDay = whenDay;

// ─────────────────────────────────────────────── realtime
const petToast = throttle((name) => toast(`${name} is petting you`, { tone: 'love', icon: 'heart' }), 25000);
const realtime = {
  status(st) { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setTimeout(() => backend.connect(S.hole.id, S.slot, realtime), 4000); },
  event(ev, type) {
    if (!ev || !ev.id) return;
    const prev = S.events.find((e) => e.id === ev.id);
    upsertEvent(ev);
    const fromThem = ev.from_slot !== S.slot;
    if (ev.kind === 'later' || ev.kept || S.shelf.has(ev.id)) app.shelfChanged(ev);
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
    case 'react':
      pocket.reaction(p.emoji || '❤️');
      sfx.react(); buzz([12, 50, 12]);
      toast(p.about ? `${name} reacted ${p.emoji} to your ${p.about}` : `${name} sent ${p.emoji}`, { tone: 'love' });
      app.onReact?.(ev);
      break;
    case 'feed': toast(`${name} fed you ${foodName(p.food)}. Ñam.`, { icon: 'feed' }); pocket.burst('crumb', pocket.hole.x, pocket.hole.y, 10); break;
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
      app.dailyChanged();
      break;
    case 'tunnel': celebrateTunnel(p); break;
    case 'reunion': toast(`${name} set the countdown${p.note ? `: ${p.note}` : ''}.`); break;
    case 'later':
      toast(p.mode === 'date' ? `${name} wrapped a time capsule for you 🎁 It opens ${whenDay(p.on)}.` : `${name} left you an envelope 💌 Open when ${p.label}.`, { tone: 'love' });
      sfx.chime(); buzz([15, 40, 15]);
      break;
    case 'unsealed':
      toast(p.mode === 'date' ? `${name} unwrapped your time capsule 🎁` : `${name} opened “when ${p.label}” 💌`, { tone: 'love' });
      sfx.chime();
      break;
    case 'plant': toast(`${name} planted a question 🌱 It comes up ${whenDay(p.day)}.`, { tone: 'love' }); sfx.chime(); loadPlanted(); break;
    case 'arrived': toast(`${name} crawled into your pocket.`, { tone: 'love' }); onVisible(); break;
  }
}

function beingKissed(name, level) {
  const layer = h('div.kiss-layer', { onclick: () => layer.remove() });
  const n = [0, 1, 3, 5, 9, 16][level];
  document.body.append(layer);
  pocket.blowKiss(level);
  for (let i = 0; i < n; i++) {
    const big = i === n - 1;
    const s = h('div.stamp', big ? KISS_EMOJI[level] : '💋');
    Object.assign(s.style, { left: big ? '50%' : `${rand(8, 92)}%`, top: big ? '44%' : `${rand(12, 80)}%`, fontSize: big ? `${90 + level * 14}px` : `${rand(34, 64)}px`, transform: `translate(-50%,-50%) rotate(${rand(-25, 25)}deg)`, animationDelay: `${0.35 + i * 0.12}s` });
    layer.append(s);
    setTimeout(() => { buzz(level >= 4 ? 22 : 12); sfx.kiss(level, Math.min(5, 1 + (i % 5))); }, 350 + i * 120);
  }
  layer.append(h('div.kiss-caption.glass', h('span.mono', 'incoming'), h('b', `${name} sent you a ${KISS_NAMES[level]} ${KISS_EMOJI[level]}`)));
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
      h('li', 'When you\'re both in here at once, the hole opens. ', h('b', 'Touch fingertips'), '.'),
      h('li', h('b', 'Swipe left'), ' for your shelf: envelopes for later, photos that open on a date, and everything you keep.')),
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
