// Design Tinder: the page between Soil and the House. Five iconic chairs, lamps, pieces of
// furniture, houses and buildings a day, the same five for both of you. Swipe right to love,
// left to pass. Their swipe on a card stays hidden until you've swiped it yourself (the server
// only hands it over then, see wh_ds_state). Missed days carry over for a week, so you both
// end up judging the same things, which is what the agreement numbers and the stats run on.
// The deck: src/design/deck.txt (tags for the stats), photos from Wikimedia (photos.txt).
// Look (Manu, Nov 12): white page, every corner square, color-blocked cards with ruled cells.
import { h, store, hash, seeded, dayNumber, clamp } from './util.js';
import { sheet, toast } from './ui.js';
import { buzz, sfx } from './feel.js';
import { offlineError } from './cache.js';

const DECK = __DECK__;   // ./design/deck.json?v=<hash>, set by build.mjs
const PER_DAY = 5;       // cards dealt a day
const CATCH_UP = 6;      // days a missed card stays in your pile
const PILE_MAX = 15;

const KIND = { chair: 'Chair', lamp: 'Lamp', furniture: 'Furniture', house: 'House', building: 'Building' };
const KINDS = { chair: 'Chairs', lamp: 'Lamps', furniture: 'Furniture', house: 'Houses', building: 'Buildings' };
// each kind gets its own color block (bold palette + The Gund orange for lamps)
const COLORS = {
  chair: ['#FFD84A', '#0B0B0C'], lamp: ['#FF5B36', '#0B0B0C'], furniture: ['#A3E6EC', '#1546A8'],
  house: ['#FFC8D7', '#D90042'], building: ['#0F7A4E', '#FFD84A'],
};
const GROUP = { chair: 'chair', lamp: 'object', furniture: 'object', house: 'house', building: 'building' };
const svg = (d, w = 24, sw = 2.2) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="square" stroke-linejoin="miter">${d}</svg>`;
const HEART = (w) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}"><path fill="currentColor" d="M12 21 3.6 12.6A5 5 0 0 1 12 6.3a5 5 0 0 1 8.4 6.3Z"/></svg>`;
const ICONS = {
  nope: svg('<path d="M6 6l12 12M18 6 6 18"/>', 22, 2.6),
  love: HEART(22),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>', 22, 2.2),
  info: svg('<path d="M12 5v14M5 12h14"/>', 18, 2.4),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>', 18, 2.4),
  matches: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" opacity=".5" d="M8.5 19.5 2.7 13.7A3.6 3.6 0 0 1 8.5 9.2a3.6 3.6 0 0 1 5.8 4.5Z"/><path fill="currentColor" d="M15.5 17.5 9.7 11.7a3.6 3.6 0 0 1 5.8-4.5 3.6 3.6 0 0 1 5.8 4.5Z"/></svg>`,
};
const svgEl = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };

// ── the deck ────────────────────────────────────────────────
let deckLoad = null;
export function loadDeck() {
  deckLoad ??= fetch(new URL(DECK, location.href)).then((r) => { if (!r.ok) throw new Error(`deck_${r.status}`); return r.json(); })
    .catch((e) => { deckLoad = null; throw e; });
  return deckLoad;
}

// The order cards are dealt in, the same on both phones (seeded by the pocket). Each edition is
// shuffled on its own and appended, so adding an edition later never moves a card already dealt.
// Kinds are spread evenly through it, so a day isn't five buildings.
export function dealOrder(deck, seed) {
  const out = [];
  deck.editions.forEach((ed, k) => {
    const groups = {};
    for (const c of ed) (groups[GROUP[c.kind]] ||= []).push(c);
    const keyed = [];
    for (const [g, list] of Object.entries(groups)) {
      const r = seeded(hash(`${seed}:${k}:${g}`));
      const a = [...list];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      a.forEach((c, i) => keyed.push([(i + 0.15 + r() * 0.7) / a.length, c]));
    }
    keyed.sort((x, y) => x[0] - y[0]);
    out.push(...keyed.map((x) => x[1]));
  });
  return out;
}

export const yearText = (c) => (c.year < 0 ? `c. ${-c.year} BC` : c.circa ? `c. ${c.year}` : String(c.year));
const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const weekday = (day, opt = 'long') => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: opt, timeZone: 'UTC' });
const shortDate = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const colorVars = (c) => ({ '--bg': COLORS[c.kind][0], '--fg': COLORS[c.kind][1] });

// ── what the stats group cards by ──
export const eraOf = (y) => (y < 1850 ? 'Before 1850' : y < 1918 ? 'Turn of the century' : y < 1945 ? 'Interwar' : y < 1976 ? 'Mid-century' : y < 2000 ? 'Late 20th century' : 'Contemporary');
const MATS = [
  ['Cane and rattan', /cane|rattan|paper cord|webbing/], ['Paper', /paper|washi|cardboard/], ['Wood', /wood|oak|teak|walnut|beech|birch|ash\b|maple|ply|jacaranda|huanghuali|timber|rosewood|hickory/],
  ['Glass', /glass/], ['Plastic', /plastic|poly|fiberglass|acrylic|pvc|abs|methacrylate|resin/], ['Leather', /leather/],
  ['Fabric', /fabric|wool|cotton|foam|rope|aramid|bead/], ['Concrete', /concrete/], ['Stone', /stone|marble|limestone|sandstone|quartzite|onyx|travertine|rock/],
  ['Brick and clay', /brick|clay|terracotta|mud|tile|ceramic|porcelain/], ['Plaster', /stucco|plaster|harl/],
  ['Steel', /steel|chrome|iron|galvan/], ['Aluminum', /alumin/], ['Brass and copper', /brass|copper|bronze|gilded|gold/], ['Metal', /zinc|titanium|metal|nickel/],
];
export const matsOf = (c) => [...new Set(c.materials.map((m) => (MATS.find(([, re]) => re.test(m.toLowerCase())) || [])[0]).filter(Boolean))];

// one person's taste over a list of { c, me, them }: who = 'me' | 'them'
export function taste(list, who) {
  const loved = list.filter((x) => x[who]).map((x) => x.c);
  const top = (vals) => {
    const n = new Map();
    for (const v of vals.flat()) n.set(v, (n.get(v) || 0) + 1);
    let best = null; for (const [v, k] of n) if (!best || k > best[1]) best = [v, k];
    return best;
  };
  const side = (key, a, b) => {
    if (!loved.length) return null;
    const k = loved.filter((c) => c[key] === a).length / loved.length;
    return k >= 0.5 ? [cap(a), k] : [cap(b), 1 - k];
  };
  return {
    n: list.length, loved: loved.length,
    rate: list.length ? loved.length / list.length : null,
    kind: top(loved.map((c) => KINDS[c.kind])),
    era: top(loved.map((c) => eraOf(c.year))),
    style: top(loved.map((c) => c.style)),
    material: top(loved.map(matsOf)),
    country: top(loved.map((c) => c.country)),
    form: side('form', 'organic', 'geometric'),
    palette: side('palette', 'color', 'neutral'),
    feel: side('feel', 'minimal', 'expressive'),
  };
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const pct = (k) => `${Math.round(k * 100)}%`;

function infoBack(c) {
  const place = c.kind === 'house' || c.kind === 'building' ? [c.at, c.country].filter(Boolean).join(', ') : c.country;
  const maker = c.kind !== 'house' && c.kind !== 'building' && c.at ? c.at : null;
  return h('div.dt-back',
    h('h2.dt-name', c.name),
    h('p.dt-by', c.by),
    h('dl.dt-facts',
      h('dt', 'Year'), h('dd', yearText(c)),
      h('dt', c.kind === 'house' || c.kind === 'building' ? 'Where' : 'From'), h('dd', place),
      maker ? [h('dt', 'Made by'), h('dd', maker)] : null,
      h('dt', 'Style'), h('dd', c.style),
      h('dt', 'Materials'), h('dd', c.materials.join(', '))),
    h('p.dt-note', c.note),
    h('a.dt-credit', { href: c.source, target: '_blank', rel: 'noopener' }, `Photo: ${c.credit || 'Wikimedia Commons'}`));
}

function img(c, cls = '') {
  const i = h(`img${cls}`, { alt: '', draggable: false, decoding: 'async' });
  i.crossOrigin = 'anonymous';
  i.src = c.img;
  return i;
}
function prefetch(cards) {
  for (const c of cards) { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.src = c.img; }
}

// ── the page ────────────────────────────────────────────────
export function DesignPage(app, root) {
  let deck = null, order = [], byId = new Map();
  let st = store('dsState') || null; // { today, started, mine, theirs, pending } from the server
  const mine = new Map(), theirs = new Map(), pending = new Set();
  const history = []; // swipes this visit, newest last, for the rewind button
  let front = null;   // a card brought back by rewind goes on top
  let busy = false, visible = false, failed = null, rising = false;

  const them = () => app.them()?.name || 'Them';
  const seed = () => app.S.hole?.id || 'bw';

  const count = h('span.dt-count');
  const matchesBtn = h('button.dt-matches', { type: 'button', 'aria-label': 'Matches', onclick: () => matchesSheet() }, svgEl(ICONS.matches), count);
  const crumb = h('span.dt-crumb');
  const meta = h('span.dt-meta');
  const stage = h('div.dt-stage');
  const cell = (cls, label, icon, fn) => h(`button.dt-act.${cls}`, { type: 'button', 'aria-label': label, onclick: fn }, svgEl(icon), h('span', cls === 'undo' ? 'UNDO LAST' : label.toUpperCase()));
  const nope = cell('nope', 'Pass', ICONS.nope, () => swipeTop(false));
  const undoBtn = cell('undo', 'Take it back', ICONS.undo, () => undo());
  const love = cell('love', 'Love', ICONS.love, () => swipeTop(true));
  const actions = h('div.dt-actions', nope, undoBtn, love);
  root.replaceChildren(
    h('header.dt-head', h('h1.dt-title', 'Design', h('br'), 'Tinder'), matchesBtn),
    h('div.dt-rule', crumb, meta),
    stage, actions);

  function applyState(s) {
    st = s;
    mine.clear(); theirs.clear(); pending.clear();
    for (const x of s.mine || []) mine.set(x.item, { liked: x.liked, day: String(x.day).slice(0, 10) });
    for (const x of s.theirs || []) theirs.set(x.item, x.liked);
    for (const x of s.pending || []) pending.add(x);
    // swipes still waiting for a signal count as made
    for (const o of store('dsOutbox') || []) {
      if (o.undo) mine.delete(o.item); else mine.set(o.item, { liked: o.liked, day: o.day });
    }
  }
  if (st) applyState(st);

  async function load() {
    try {
      if (!deck) {
        deck = await loadDeck();
        byId = new Map(deck.editions.flat().map((c) => [c.id, c]));
      }
      order = dealOrder(deck, seed());
      failed = null;
    } catch (e) { console.warn('design deck', e); failed = 'deck'; render(); return; }
    await flushOutbox();
    try {
      const s = await app.backend.dsState();
      store('dsState', s);
      applyState(s);
    } catch (e) { console.warn('design state', e); if (!st) failed = 'state'; }
    render();
  }

  // ── dealing ──
  const started = () => String(st?.started || app.today()).slice(0, 10);
  const dayIndex = () => Math.max(0, dayNumber(app.today()) - dayNumber(started()));
  const dealtOn = (i) => order.slice(i * PER_DAY, (i + 1) * PER_DAY).map((c, k) => ({ c, i, k, day: addDays(started(), i) }));
  function pile() {
    const i = dayIndex();
    const out = dealtOn(i).filter((x) => !mine.has(x.c.id));
    for (let j = i - 1; j >= Math.max(0, i - CATCH_UP) && out.length < PILE_MAX; j--) out.push(...dealtOn(j).filter((x) => !mine.has(x.c.id)));
    if (front) {
      const k = out.findIndex((x) => x.c.id === front);
      if (k > 0) out.unshift(...out.splice(k, 1));
    }
    return out.slice(0, PILE_MAX);
  }
  const loves = () => [...theirs].filter(([id, t]) => t && mine.get(id)?.liked).length;

  // ── drawing ──
  function render() {
    undoBtn.disabled = !history.length;
    crumb.textContent = `No. ${String(dayIndex() + 1).padStart(2, '0')} · ${shortDate(app.today()).toUpperCase()}`;
    const m = loves(); count.textContent = m ? String(m) : '';
    if (failed === 'deck' || (!deck && !st)) {
      meta.textContent = '';
      stage.replaceChildren(h('div.dt-empty', h('p', failed === 'deck' ? 'The deck needs a signal the first time.' : 'Shuffling the deck…')));
      nope.disabled = love.disabled = true;
      return;
    }
    if (!deck) return;
    const today = dealtOn(dayIndex());
    const p = pile();
    const left = p.filter((x) => x.i === dayIndex()).length;
    const earlier = p.length - left;
    meta.textContent = !today.length ? 'DECK DONE'
      : left ? `${left} LEFT${earlier ? ` + ${earlier} EARLIER` : ''}`
      : earlier ? `${earlier} FROM EARLIER` : 'ALL FIVE DONE';
    nope.disabled = love.disabled = !p.length;
    actions.classList.toggle('done', !p.length);
    if (!p.length) { stage.replaceChildren(donePanel(today)); return; }
    const W = stage.clientWidth || window.innerWidth - 32, H = stage.clientHeight || window.innerHeight * 0.6;
    const cards = p.slice(0, 2).map((x, k) => cardEl(x, W, H, k));
    if (rising) cards[0].classList.add('rise');
    rising = false;
    stage.replaceChildren(...cards.reverse());
    prefetch(p.slice(2, 7).map((x) => x.c));
  }

  // A card: a colored block with a ruled header bar, the kind in big type, and a white frame
  // holding the photo (full width, its own shape, never padded with blur) and the text under it.
  // The context line shows; who made it, when and where open with + (the text grows, the photo shrinks).
  function cardEl(x, W, H, depth) {
    const c = x.c;
    const today = x.i === dayIndex();
    const label = today ? 'TODAY\'S FIVE' : `FROM ${weekday(x.day).toUpperCase()}`;
    const tags = [];
    if (pending.has(c.id)) tags.push(h('span.dt-tag.them', `${them().toUpperCase()} SWIPED`));
    const toggle = h('button.dt-cell.dt-plus', { type: 'button', 'aria-label': 'About this one' }, svgEl(ICONS.info));
    // photo height: its natural shape across the frame, leaving room for the bars and the text
    const frameW = W - 8 - 2 * 14 - 6;
    const room = H - 8 - 46 - 64 - 14 - 8 - 112;
    const picH = Math.round(clamp(frameW * (c.h / c.w), Math.min(150, room), room));
    const pic = h('div.dt-pic', { style: { height: `${picH}px` } }, img(c, '.dt-img'),
      h('span.dt-stamp.love', 'LOVE'), h('span.dt-stamp.nope', 'NOPE'));
    const about = h('div.dt-about', h('div.dt-front', h('span.dt-label', 'About this one:'), h('p', c.note)), infoBack(c));
    const el = h(`div.dt-card${depth ? '.next' : ''}`, { 'data-nopager': '', style: colorVars(c) },
      h('div.dt-cbar', h('span.dt-cbar-label', label), h('span.dt-cell.dt-num', `${x.k + 1}/5`), toggle),
      h('div.dt-chead', h('h2.dt-kind', KIND[c.kind]), h('div.dt-tags', tags)),
      h('div.dt-frame', pic, about));
    const flip = () => {
      const on = !el.classList.contains('open');
      el.classList.toggle('open', on);
      toggle.replaceChildren(svgEl(on ? ICONS.close : ICONS.info));
      pic.style.height = on ? `${Math.round(Math.min(picH, room * 0.36))}px` : `${picH}px`;
      about.scrollTop = 0;
    };
    toggle.addEventListener('click', flip);
    about.addEventListener('click', (e) => { if (!el.classList.contains('open') && !e.target.closest('a')) flip(); });
    if (!depth) drag(el, x);
    return el;
  }

  function drag(el, x) {
    let s = null;
    const W = () => el.offsetWidth || window.innerWidth;
    const stamp = (dx) => {
      el.querySelector('.dt-stamp.love').style.opacity = clamp(dx / 90, 0, 1);
      el.querySelector('.dt-stamp.nope').style.opacity = clamp(-dx / 90, 0, 1);
    };
    el.addEventListener('pointerdown', (e) => {
      if (busy || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button, a') || (el.classList.contains('open') && e.target.closest('.dt-about'))) return;
      s = { id: e.pointerId, x: e.clientX, y: e.clientY, hist: [{ x: e.clientX, t: performance.now() }], moved: false };
      try { el.setPointerCapture(e.pointerId); } catch { /* */ }
      el.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) < 4) return;
      s.moved = true;
      el.style.transform = `translate3d(${dx}px, ${dy * 0.3}px, 0) rotate(${(dx / W()) * 14}deg)`;
      stamp(dx);
      s.hist.push({ x: e.clientX, t: performance.now() }); if (s.hist.length > 6) s.hist.shift();
    });
    const end = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      const a = s.hist[0], z = s.hist[s.hist.length - 1];
      const v = (z.x - a.x) / Math.max(16, z.t - a.t);
      const moved = s.moved;
      s = null;
      if (dx > W() * 0.3 || (v > 0.55 && dx > 30)) return commit(x, true, el, dy);
      if (dx < -W() * 0.3 || (v < -0.55 && dx < -30)) return commit(x, false, el, dy);
      el.style.transition = 'transform 0.42s cubic-bezier(.2,1.4,.4,1)';
      el.style.transform = '';
      stamp(0);
      if (!moved) el.style.transition = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function swipeTop(liked) {
    if (busy) return;
    const p = pile(); if (!p.length) return;
    const el = stage.querySelector('.dt-card:not(.next)');
    if (el) el.querySelector(`.dt-stamp.${liked ? 'love' : 'nope'}`).style.opacity = 1;
    commit(p[0], liked, el, 0);
  }

  async function commit(x, liked, el, dy = 0) {
    busy = true;
    const id = x.c.id;
    if (front === id) front = null;
    mine.set(id, { liked, day: x.day });
    history.push(x);
    buzz(8);
    if (el) {
      const W = el.offsetWidth || window.innerWidth;
      el.style.transition = 'transform 0.34s cubic-bezier(.3,.6,.5,1)';
      el.style.transform = `translate3d(${liked ? W * 1.5 : -W * 1.5}px, ${dy * 0.3 + 30}px, 0) rotate(${liked ? 22 : -22}deg)`;
    }
    setTimeout(() => { busy = false; rising = true; render(); }, el ? 250 : 0);
    try {
      const r = await app.backend.dsSwipe(id, x.day, liked);
      pending.delete(id);
      if (r?.theirs != null) { theirs.set(id, r.theirs); reveal(x.c, liked, r.theirs); }
      saveCopy();
      count.textContent = loves() ? String(loves()) : '';
    } catch (e) {
      if (offlineError(e)) { queueOut({ item: id, day: x.day, liked }); return; }
      console.warn('swipe', e);
      mine.delete(id); history.pop();
      toast('Couldn\'t save that swipe. Try again.');
      render();
    }
  }

  async function undo() {
    if (busy) return;
    const x = history.pop(); if (!x) return;
    const id = x.c.id;
    mine.delete(id);
    if (theirs.has(id)) { theirs.delete(id); pending.add(id); }
    front = id;
    render();
    const el = stage.querySelector('.dt-card:not(.next)');
    if (el) {
      el.style.transition = 'none';
      el.style.transform = 'translate3d(0, -30px, 0)'; el.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'transform 0.36s cubic-bezier(.2,1.3,.4,1), opacity 0.2s'; el.style.transform = ''; el.style.opacity = ''; }));
    }
    try { await app.backend.dsUndo(id); saveCopy(); } catch (e) { if (offlineError(e)) queueOut({ item: id, undo: true }); }
  }

  function reveal(c, me, they) {
    const n = them();
    if (me && they) return matchMoment(c);
    toast(me ? `${n} passed on this one.` : they ? `${n} loved this one.` : `${n} passed too.`);
  }

  function matchMoment(c) {
    sfx.chime(); buzz([14, 70, 14]);
    const box = h('div.dt-match', { role: 'status' },
      h('div.dt-match-card',
        h('div.dt-match-bar', h('span', 'IT\'S A MATCH'), svgEl(HEART(16))),
        h('div.dt-match-pic', img(c)),
        h('h2', c.name),
        h('p', `You and ${them()} both love it.`)));
    const close = () => { box.classList.remove('in'); setTimeout(() => box.remove(), 300); };
    box.addEventListener('click', close);
    document.body.append(box);
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('in')));
    setTimeout(close, 2400);
  }

  // offline: swipes wait on the phone and go out on the next visit with a signal
  function queueOut(o) {
    const q = (store('dsOutbox') || []).filter((x) => x.item !== o.item);
    q.push(o); store('dsOutbox', q.slice(-100));
  }
  async function flushOutbox() {
    const q = store('dsOutbox') || [];
    while (q.length) {
      const o = q[0];
      try { if (o.undo) await app.backend.dsUndo(o.item); else await app.backend.dsSwipe(o.item, o.day, o.liked); }
      catch (e) { if (offlineError(e)) break; console.warn('swipe dropped', o, e); }
      q.shift(); store('dsOutbox', q);
    }
  }
  function saveCopy() {
    if (!st) return;
    store('dsState', {
      ...st,
      mine: [...mine].map(([item, v]) => ({ item, day: v.day, liked: v.liked })),
      theirs: [...theirs].map(([item, liked]) => ({ item, liked })),
      pending: [...pending],
    });
  }

  const mark = (v) => (v == null ? h('i.wait', '–') : v ? h('i.yes', svgEl(HEART(13))) : h('i.no', svgEl(svg('<path d="M6 6l12 12M18 6 6 18"/>', 13, 3))));

  // ── when today's are done ──
  function donePanel(today) {
    if (!today.length) {
      return h('div.dt-done', h('h2', 'That\'s the', h('br'), 'whole deck.'), h('p.dt-done-sub', 'NEW CARDS ARE ON THE WAY'),
        h('button.dt-wide', { type: 'button', onclick: () => matchesSheet() }, 'SEE MATCHES', svgEl(HEART(16))));
    }
    const n = them();
    const waiting = today.filter((x) => !theirs.has(x.c.id)).length;
    return h('div.dt-done',
      h('h2', 'Done for', h('br'), 'today.'),
      h('p.dt-done-sub', waiting ? `${n.toUpperCase()} HASN'T SWIPED ${waiting === today.length ? 'YET' : `${waiting} YET`} · NEW FIVE TOMORROW` : 'NEW FIVE TOMORROW'),
      h('div.dt-five', today.map((x) => h('button.dt-mini', { type: 'button', style: colorVars(x.c), onclick: () => cardSheet(x.c) },
        h('div.dt-mini-pic', h('img', { crossOrigin: 'anonymous', src: x.c.img, alt: '' })),
        h('div.dt-mini-row', h('span', 'You'), mark(mine.get(x.c.id)?.liked)),
        h('div.dt-mini-row', h('span', n), mark(theirs.get(x.c.id)))))),
      h('button.dt-wide', { type: 'button', onclick: () => matchesSheet() }, 'SEE MATCHES', svgEl(HEART(16))));
  }

  // ── matches ──
  function both() {
    return [...theirs].filter(([id]) => mine.has(id) && byId.has(id))
      .map(([id, t]) => ({ c: byId.get(id), me: mine.get(id).liked, them: t }));
  }
  function matchesSheet() {
    if (!deck) return;
    const n = them();
    const list = both();
    const agree = list.filter((x) => x.me === x.them).length;
    const loved = list.filter((x) => x.me && x.them), split = list.filter((x) => x.me !== x.them), passed = list.filter((x) => !x.me && !x.them);
    const grid = (items, tag) => h('div.dt-grid', items.map((x) => h('button.dt-tile', { type: 'button', style: colorVars(x.c), onclick: () => cardSheet(x.c) },
      h('div.dt-tile-pic', h('img', { crossOrigin: 'anonymous', loading: 'lazy', src: x.c.img, alt: '' })),
      h('b', x.c.name), h('span', tag ? tag(x) : KIND[x.c.kind].toUpperCase()))));
    const section = (label, items, tag, empty) => h('section.dt-sec',
      h('div.dt-sec-bar', h('span', label), h('b', String(items.length))),
      items.length ? grid(items, tag) : h('p.dt-sec-empty', empty));
    sheet('Matches', [
      h('div.dt-hero',
        h('div.dt-hero-bar', h('span', 'YOU AGREE ON'), h('span', `${list.length} SHARED`)),
        h('div.dt-hero-num', list.length ? `${Math.round((agree / list.length) * 100)}%` : '0%'),
        h('p', list.length ? `${agree} of the ${list.length} cards you've both swiped.` : `Once you and ${n} have both swiped a card, it lands here.`)),
      statsTable(list),
      section('BOTH LOVE', loved, null, 'Nothing yet. Keep swiping.'),
      section('SPLIT', split, (x) => (x.me ? 'YOU LOVED IT' : `${n.toUpperCase()} LOVED IT`), 'No disagreements yet.'),
      section('BOTH PASS', passed, null, 'Nothing you both passed on yet.'),
    ], { tall: true, quiet: true, className: 'dt-sheet' });
  }

  // Taste profiles as a table of stats, over the cards you've both swiped (so it's a fair comparison)
  function statsTable(list) {
    const n = them();
    const head = h('div.dt-sec-bar', h('span', 'TASTE PROFILES'), h('b', String(list.length)));
    if (!list.length) return h('section.dt-sec', head, h('p.dt-sec-empty', 'Stats start with the first card you\'ve both swiped.'));
    const a = taste(list, 'me'), b = taste(list, 'them');
    const top = (t) => (t ? t[0] : '–');
    const side = (t) => (t ? `${t[0]} ${pct(t[1])}` : '–');
    const words = (t) => [t.era, t.form, t.material].map((x) => x?.[0]).filter(Boolean).join(' · ') || 'Nothing loved yet';
    // where you agree and split, by kind (2 shared cards or more)
    const byKind = new Map();
    for (const x of list) { const k = byKind.get(x.c.kind) || [0, 0]; k[0]++; if (x.me === x.them) k[1]++; byKind.set(x.c.kind, k); }
    const kinds = [...byKind].filter(([, k]) => k[0] >= 2).map(([kind, k]) => [KINDS[kind], k[1] / k[0]]).sort((p, q) => q[1] - p[1]);
    const rows = [
      ['Love rate', a.rate == null ? '–' : pct(a.rate), b.rate == null ? '–' : pct(b.rate)],
      ['Loves', String(a.loved), String(b.loved)],
      ['Kind', top(a.kind), top(b.kind)],
      ['Era', top(a.era), top(b.era)],
      ['Style', top(a.style), top(b.style)],
      ['Shapes', side(a.form), side(b.form)],
      ['Color', side(a.palette), side(b.palette)],
      ['Feel', side(a.feel), side(b.feel)],
      ['Material', top(a.material), top(b.material)],
      ['Country', top(a.country), top(b.country)],
    ];
    return h('section.dt-sec',
      head,
      h('div.dt-prof',
        h('div', h('span', 'YOU'), h('b', words(a))),
        h('div', h('span', n.toUpperCase()), h('b', words(b)))),
      h('table.dt-stats',
        h('thead', h('tr', h('th', ''), h('th', 'You'), h('th', n))),
        h('tbody', rows.map(([k, x, y]) => h('tr', h('th', k), h('td', x), h('td', y))))),
      kinds.length ? h('table.dt-stats.two', h('tbody',
        h('tr', h('th', 'Agree most on'), h('td', `${kinds[0][0]} ${pct(kinds[0][1])}`)),
        kinds.length > 1 ? h('tr', h('th', 'Split most on'), h('td', `${kinds[kinds.length - 1][0]} ${pct(kinds[kinds.length - 1][1])}`)) : null)) : null,
      h('p.dt-small', `Over the ${list.length} card${list.length === 1 ? '' : 's'} you've both swiped. Gets sharper every day.`));
  }

  function cardSheet(c) {
    const me = mine.get(c.id)?.liked, they = theirs.get(c.id);
    const verdict = (who, v, hidden) => h(`div.dt-verdict${v == null ? '' : v ? '.yes' : '.no'}`, h('span', who.toUpperCase()), h('b', v == null ? (hidden ? 'Hidden till you swipe' : 'Not yet') : v ? 'Love' : 'Pass'));
    sheet(KIND[c.kind], [
      h('div.dt-sheet-card', { style: colorVars(c) }, h('div.dt-sheet-pic', img(c)), h('div.dt-about.flat', infoBack(c))),
      h('div.dt-verdicts', verdict('You', me), verdict(them(), me == null ? null : they, me == null)),
    ], { quiet: true, className: 'dt-sheet' });
  }

  return {
    show() { visible = true; document.body.classList.add('on-design'); render(); load(); },
    hide() { visible = false; document.body.classList.remove('on-design'); },
    get visible() { return visible; },
    matches: () => matchesSheet(),
  };
}
