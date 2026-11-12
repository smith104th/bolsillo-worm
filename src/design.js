// Design Tinder: the page between Soil and the House. Five iconic chairs, lamps, pieces of
// furniture, houses and buildings a day, the same five for both of you. Swipe right to love,
// left to pass. Their swipe on a card stays hidden until you've swiped it yourself (the server
// only hands it over then, see wh_ds_state). Missed days carry over for a week, so you both
// end up judging the same things, which is what the agreement numbers and profiles run on.
// The deck: src/design/deck.txt (tags for the stats), photos from Wikimedia (photos.txt).
import { h, store, hash, seeded, dayNumber, clamp } from './util.js';
import { sheet, toast, icon } from './ui.js';
import { buzz, sfx } from './feel.js';
import { offlineError } from './cache.js';

const DECK = __DECK__;   // ./design/deck.json?v=<hash>, set by build.mjs
const PER_DAY = 5;       // cards dealt a day
const CATCH_UP = 6;      // days a missed card stays in your pile
const PILE_MAX = 15;
const PROFILE_AT = 50;   // swipes each before taste profiles make sense

const KIND = { chair: 'Chair', lamp: 'Lamp', furniture: 'Furniture', house: 'House', building: 'Building' };
const GROUP = { chair: 'chair', lamp: 'object', furniture: 'object', house: 'house', building: 'building' };
const svg = (d, w = 24) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  nope: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 26),
  love: '<svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 20.6s-7.6-4.7-7.6-10.6A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.6 2.6c0 5.9-7.6 10.6-7.6 10.6Z"/></svg>',
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', 20),
  info: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="7.3" r="1.5" fill="currentColor"/><path d="M12 11v6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  matches: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 18.5s-6-3.7-6-8.3A3.3 3.3 0 0 1 9 8.2a3.3 3.3 0 0 1 6 2c0 4.6-6 8.3-6 8.3Z" opacity=".55"/><path fill="currentColor" d="M15 17s-6-3.7-6-8.3A3.3 3.3 0 0 1 15 6.7a3.3 3.3 0 0 1 6 2c0 4.6-6 8.3-6 8.3Z"/></svg>',
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
const weekday = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

// who made it, when, where: one line under the name
function facts(c) {
  const place = c.kind === 'house' || c.kind === 'building' ? [c.at, c.country].filter(Boolean).join(', ') : c.country;
  return [yearText(c), place].filter(Boolean).join(' · ');
}

function infoBody(c) {
  const tags = [KIND[c.kind], c.style, ...c.materials].filter(Boolean);
  const maker = c.kind !== 'house' && c.kind !== 'building' && c.at ? `Made by ${c.at}` : null;
  return [
    h('h2.dt-name', c.name),
    h('p.dt-by', c.by),
    h('p.dt-facts', facts(c)),
    h('p.dt-note', c.note),
    maker ? h('p.dt-maker', maker) : null,
    h('div.dt-tags', tags.map((t) => h('span', t))),
    h('a.dt-credit', { href: c.source, target: '_blank', rel: 'noopener' }, `Photo: ${c.credit || 'Wikimedia Commons'}`),
  ].filter(Boolean);
}

// a photo that fills its frame when the shapes are close, else sits whole on a blurred copy of itself
function photo(c, frameAspect) {
  const a = c.w / c.h;
  const fit = frameAspect && a / frameAspect > 0.8 && a / frameAspect < 1.25 ? 'cover' : 'contain';
  const img = h('img.dt-img', { alt: '', draggable: false, decoding: 'async' });
  img.crossOrigin = 'anonymous';
  img.src = c.img;
  img.style.objectFit = fit;
  if (fit === 'cover') return h('div.dt-photo', img);
  const blur = h('img.dt-blur', { alt: '', draggable: false, decoding: 'async' });
  blur.crossOrigin = 'anonymous';
  blur.src = c.img;
  return h('div.dt-photo', blur, img);
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

  const meta = h('div.dt-meta');
  const matchesBtn = h('button.dt-round', { type: 'button', 'aria-label': 'Matches', onclick: () => matchesSheet() }, svgEl(ICONS.matches));
  const stage = h('div.dt-stage');
  const nope = h('button.dt-act.nope', { type: 'button', 'aria-label': 'Pass', onclick: () => swipeTop(false) }, svgEl(ICONS.nope));
  const undoBtn = h('button.dt-act.undo', { type: 'button', 'aria-label': 'Take it back', onclick: () => undo() }, svgEl(ICONS.undo));
  const love = h('button.dt-act.love', { type: 'button', 'aria-label': 'Love', onclick: () => swipeTop(true) }, svgEl(ICONS.love));
  const actions = h('div.dt-actions', nope, undoBtn, love);
  root.replaceChildren(h('header.dt-head', h('div', meta, h('h1.dt-title', 'Design Tinder')), matchesBtn), stage, actions);

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
  const dealtOn = (i) => order.slice(i * PER_DAY, (i + 1) * PER_DAY).map((c) => ({ c, i, day: addDays(started(), i) }));
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

  // ── drawing ──
  function render() {
    undoBtn.disabled = !history.length;
    if (failed === 'deck' || (!deck && !st)) {
      meta.textContent = 'TODAY\'S FIVE';
      stage.replaceChildren(h('div.dt-empty', h('p', failed === 'deck' ? 'The deck needs a signal the first time.' : 'Shuffling the deck…')));
      nope.disabled = love.disabled = true;
      return;
    }
    if (!deck) return;
    const today = dealtOn(dayIndex());
    const p = pile();
    const left = p.filter((x) => x.i === dayIndex()).length;
    const earlier = p.length - left;
    meta.textContent = !today.length ? 'THE WHOLE DECK, DONE'
      : left ? `${left} LEFT TODAY${earlier ? ` · ${earlier} FROM EARLIER` : ''}`
      : earlier ? `${earlier} FROM EARLIER` : 'TODAY\'S FIVE, DONE';
    nope.disabled = love.disabled = !p.length;
    actions.classList.toggle('done', !p.length);
    if (!p.length) { stage.replaceChildren(donePanel(today)); return; }
    const W = stage.clientWidth || window.innerWidth - 32, H = stage.clientHeight || window.innerHeight * 0.6;
    const cards = p.slice(0, 2).map((x, k) => cardEl(x, W / H, k));
    if (rising) cards[0].classList.add('rise');
    rising = false;
    stage.replaceChildren(...cards.reverse());
    prefetch(p.slice(2, 7).map((x) => x.c));
  }

  function cardEl(x, aspect, depth) {
    const c = x.c;
    const chips = [];
    if (x.i < dayIndex()) chips.push(h('span.dt-chip', `FROM ${weekday(x.day).toUpperCase()}`));
    if (pending.has(c.id)) chips.push(h('span.dt-chip.them', `${them().toUpperCase()} SWIPED`));
    const info = h('div.dt-info', infoBody(c));
    const iBtn = h('button.dt-i', { type: 'button', 'aria-label': 'About this one' }, svgEl(ICONS.info));
    const el = h(`div.dt-card${depth ? '.next' : ''}`, { 'data-nopager': '' },
      photo(c, aspect),
      h('div.dt-chips', chips),
      h('span.dt-stamp.love', 'LOVE'), h('span.dt-stamp.nope', 'NOPE'),
      info, iBtn);
    iBtn.addEventListener('click', () => { const on = !el.classList.contains('open'); el.classList.toggle('open', on); iBtn.classList.toggle('on', on); if (on) info.scrollTop = 0; });
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
      if (busy || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button, a, .dt-info')) return;
      s = { id: e.pointerId, x: e.clientX, y: e.clientY, hist: [{ x: e.clientX, t: performance.now() }], moved: false };
      try { el.setPointerCapture(e.pointerId); } catch { /* */ }
      el.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) < 4) return;
      s.moved = true;
      el.style.transform = `translate3d(${dx}px, ${dy * 0.3}px, 0) rotate(${(dx / W()) * 16}deg)`;
      stamp(dx);
      s.hist.push({ x: e.clientX, t: performance.now() }); if (s.hist.length > 6) s.hist.shift();
    });
    const end = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      const a = s.hist[0], z = s.hist[s.hist.length - 1];
      const v = (z.x - a.x) / Math.max(16, z.t - a.t);
      s = null;
      if (dx > W() * 0.3 || (v > 0.55 && dx > 30)) return commit(x, true, el, dy);
      if (dx < -W() * 0.3 || (v < -0.55 && dx < -30)) return commit(x, false, el, dy);
      el.style.transition = 'transform 0.42s cubic-bezier(.2,1.4,.4,1)';
      el.style.transform = '';
      stamp(0);
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
      el.style.transition = 'transform 0.36s cubic-bezier(.3,.6,.5,1), opacity 0.36s';
      el.style.transform = `translate3d(${liked ? W * 1.5 : -W * 1.5}px, ${dy * 0.3 + 40}px, 0) rotate(${liked ? 26 : -26}deg)`;
      el.style.opacity = '0.6';
    }
    setTimeout(() => { busy = false; rising = true; render(); }, el ? 260 : 0);
    try {
      const r = await app.backend.dsSwipe(id, x.day, liked);
      pending.delete(id);
      if (r?.theirs != null) { theirs.set(id, r.theirs); reveal(x.c, liked, r.theirs); }
      saveCopy();
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
      el.style.transform = 'translate3d(0, -40px, 0) scale(0.92)'; el.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'transform 0.4s cubic-bezier(.2,1.3,.4,1), opacity 0.25s'; el.style.transform = ''; el.style.opacity = ''; }));
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
        h('div.dt-match-pic', photo(c, 1)),
        h('div.dt-match-label', 'IT\'S A MATCH'),
        h('p', `You and ${them()} both love ${c.name}.`)));
    const close = () => { box.classList.remove('in'); setTimeout(() => box.remove(), 320); };
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

  // ── when today's are done ──
  function donePanel(today) {
    if (!today.length) {
      return h('div.dt-empty', h('h2', 'That\'s the whole deck.'), h('p', 'New cards are on the way.'), h('button.btn.dt-btn', { type: 'button', onclick: () => matchesSheet() }, 'See matches'));
    }
    const n = them();
    const waiting = today.filter((x) => !theirs.has(x.c.id)).length;
    const mark = (v) => (v == null ? h('i.wait', '·') : v ? h('i.yes', svgEl(ICONS.love)) : h('i.no', svgEl(ICONS.nope)));
    return h('div.dt-done',
      h('h2', 'Done for today.'),
      h('div.dt-five', today.map((x) => h('button.dt-mini', { type: 'button', onclick: () => cardSheet(x.c) },
        h('div.dt-mini-pic', h('img', { crossOrigin: 'anonymous', src: x.c.img, alt: '' })),
        h('div.dt-mini-row', h('span', 'You'), mark(mine.get(x.c.id)?.liked)),
        h('div.dt-mini-row', h('span', n), mark(theirs.get(x.c.id)))))),
      h('p', waiting ? `${n} hasn't swiped ${waiting === today.length ? 'today\'s yet' : `${waiting} of them yet`}. New five tomorrow.` : 'New five tomorrow.'),
      h('button.btn.dt-btn', { type: 'button', onclick: () => matchesSheet() }, 'See matches'));
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
    const pct = list.length ? Math.round((agree / list.length) * 100) : null;
    const grid = (items, tag) => h('div.dt-grid', items.map((x) => h('button.dt-tile', { type: 'button', onclick: () => cardSheet(x.c) },
      h('div.dt-tile-pic', h('img', { crossOrigin: 'anonymous', loading: 'lazy', src: x.c.img, alt: '' })),
      h('b', x.c.name), tag ? h('span', tag(x)) : null)));
    const section = (label, cls, items, tag, empty) => h(`section.dt-sec.${cls}`,
      h('div.dt-sec-head', h('span', label), h('b', String(items.length))),
      items.length ? grid(items, tag) : h('p.dt-sec-empty', empty));
    const loved = list.filter((x) => x.me && x.them), split = list.filter((x) => x.me !== x.them), passed = list.filter((x) => !x.me && !x.them);
    const theirCount = theirs.size + pending.size;
    sheet('Matches', [
      h('div.dt-agree',
        h('span.dt-agree-label', 'YOU AGREE ON'),
        h('div.dt-agree-num', pct == null ? '…' : `${pct}%`),
        h('p', list.length ? `${agree} of the ${list.length} cards you've both swiped.` : `Once you and ${n} have both swiped a card, it lands here.`)),
      section('BOTH LOVE', 'love', loved, null, 'Nothing yet. Keep swiping.'),
      section('SPLIT', 'split', split, (x) => (x.me ? 'You loved it' : `${n} loved it`), 'No disagreements yet.'),
      section('BOTH PASS', 'pass', passed, null, 'Nothing you both passed on yet.'),
      h('div.dt-soon',
        h('span.dt-agree-label', 'TASTE PROFILES'),
        h('p', `Charts of what each of you leans toward: mid-century or contemporary, wood or concrete, minimal or loud. They start once you've each swiped ${PROFILE_AT}.`),
        h('div.dt-soon-row', h('span', `You ${Math.min(mine.size, PROFILE_AT)} / ${PROFILE_AT}`), h('span', `${n} ${Math.min(theirCount, PROFILE_AT)} / ${PROFILE_AT}`))),
    ], { tall: true, quiet: true, className: 'dt-sheet' });
  }

  function cardSheet(c) {
    const me = mine.get(c.id)?.liked, they = theirs.get(c.id);
    const verdict = (who, v) => h(`div.dt-verdict${v == null ? '' : v ? '.yes' : '.no'}`, h('span', who), h('b', v == null ? (who === 'You' ? 'Not yet' : 'Hidden till you swipe') : v ? 'Love' : 'Pass'));
    sheet(c.name, [
      h('div.dt-sheet-pic', photo(c, 4 / 3)),
      h('div.dt-verdicts', verdict('You', me), verdict(them(), me == null ? null : they)),
      h('div.dt-info.flat', infoBody(c).slice(1)),
    ], { quiet: true, className: 'dt-card-sheet' });
  }

  return {
    show() { visible = true; render(); load(); },
    hide() { visible = false; },
    get visible() { return visible; },
    matches: () => matchesSheet(),
  };
}
