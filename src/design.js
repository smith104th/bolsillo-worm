// Design Tinder: one of the games (opens from the Games page). Five iconic chairs, lamps, pieces of
// furniture, houses and buildings a day, the same five for both of you. Each one is a little
// article (photo, name, maker; tap to read the rest). Swipe right to like it, further to love,
// all the way to adore; left for don't like, dislike, hate. A swipe is a score, -3..3.
// Their score on a card stays hidden until you've swiped it yourself (the server only hands
// it over then, see wh_ds_state). Missed days carry over for a week, so you both end up
// judging the same things, which is what the agreement numbers and the stats run on.
// The deck: src/design/deck.txt (tags for the stats), photos from Wikimedia (photos.txt).
// Look (Manu, Nov 12): white page, square corners, the app's type (Geist), very little color.
import { h, store, hash, seeded, dayNumber, clamp } from './util.js';
import { sheet, toast } from './ui.js';
import { buzz, sfx } from './feel.js';
import { offlineError } from './cache.js';

const DECK = __DECK__;   // ./design/deck.json?v=<hash>, set by build.mjs
const PER_DAY = 5;       // cards dealt a day
const CATCH_UP = 6;      // days a missed card stays in your pile
const PILE_MAX = 15;

// how far you swiped, in words
export const LEVEL = { 3: 'Adore', 2: 'Love', 1: 'Like', [-1]: 'Don\'t like', [-2]: 'Dislike', [-3]: 'Hate' };
const YOU = { 3: 'adore', 2: 'love', 1: 'like', [-1]: 'don\'t like', [-2]: 'dislike', [-3]: 'hate' };
const THEY = { 3: 'adores', 2: 'loves', 1: 'likes', [-1]: 'doesn\'t like', [-2]: 'dislikes', [-3]: 'hates' };
const STEPS = [0.1, 0.22, 0.36]; // share of the card's width for each level (Manu: closer together)

const KINDS = { chair: 'Chairs', lamp: 'Lamps', furniture: 'Furniture', house: 'Houses', building: 'Buildings' };
const GROUP = { chair: 'chair', lamp: 'object', furniture: 'object', house: 'house', building: 'building' };
const svg = (d, w = 24, sw = 2) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const HEART = (w) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}"><path fill="currentColor" d="M12 20.6s-7.6-4.7-7.6-10.6A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.6 2.6c0 5.9-7.6 10.6-7.6 10.6Z"/></svg>`;
const ICONS = { undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', 19) };
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
const shortDate = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const isPlace = (c) => c.kind === 'house' || c.kind === 'building';

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

// One person's taste over a list of { c, me, them } (scores): who = 'me' | 'them'.
// Favorites are the values with the highest total score (adore counts 3, hate counts -3).
export function taste(list, who) {
  const s = list.map((x) => [x.c, x[who]]);
  const liked = s.filter(([, v]) => v > 0);
  const best = (key) => {
    const n = new Map();
    for (const [c, v] of s) for (const k of [key(c)].flat()) n.set(k, (n.get(k) || 0) + v);
    let b = null; for (const [k, v] of n) if (v > 0 && (!b || v > b[1])) b = [k, v];
    return b?.[0] || null;
  };
  const lean = (key, a, b) => {
    const w = liked.reduce((t, [, v]) => t + v, 0);
    if (!w) return null;
    const k = liked.filter(([c]) => c[key] === a).reduce((t, [, v]) => t + v, 0) / w;
    return k >= 0.5 ? `${cap(a)} ${pct(k)}` : `${cap(b)} ${pct(1 - k)}`;
  };
  const avg = s.length ? s.reduce((t, [, v]) => t + v, 0) / s.length : null;
  return {
    rate: s.length ? liked.length / s.length : null,
    avg,
    adore: s.filter(([, v]) => v === 3).length,
    hate: s.filter(([, v]) => v === -3).length,
    kind: best((c) => KINDS[c.kind]),
    era: best((c) => eraOf(c.year)),
    style: best((c) => c.style),
    material: best(matsOf),
    country: best((c) => c.country),
    form: lean('form', 'organic', 'geometric'),
    palette: lean('palette', 'color', 'neutral'),
    feel: lean('feel', 'minimal', 'expressive'),
  };
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const pct = (k) => `${Math.round(k * 100)}%`;
const signed = (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

// six squares, three each side of the middle, filled out to the score
export function scaleEl(v) {
  return h('span.dt-scale', { 'aria-label': v ? LEVEL[v] : 'Not yet' },
    [-3, -2, -1, 1, 2, 3].map((p) => h(`i${v && Math.sign(p) === Math.sign(v) && Math.abs(p) <= Math.abs(v) ? (p > 0 ? '.yes' : '.no') : ''}`)));
}

// the rest of the article: who, when, where, what it's made of, the story, the photo credit
function more(c) {
  const rows = [
    ['Year', yearText(c)],
    [isPlace(c) ? 'Where' : 'From', isPlace(c) ? [c.at, c.country].filter(Boolean).join(', ') : c.country],
    !isPlace(c) && c.at ? ['Made by', c.at] : null,
    ['Style', c.style],
    ['Materials', c.materials.join(', ')],
  ].filter(Boolean);
  return h('div.dt-more',
    h('p.dt-note', c.note),
    h('dl.dt-facts', rows.map(([k, v]) => [h('dt', k), h('dd', v)])),
    h('a.dt-credit', { href: c.source, target: '_blank', rel: 'noopener' }, `Photo: ${c.credit || 'Wikimedia Commons'}`));
}

// Wikimedia photos load with CORS (the service worker keeps them for offline). Photos linked from
// other sites load plainly with no referrer, and fall back to the card's Wikimedia photo if the link breaks.
const WIKI = /^https:\/\/upload\.wikimedia\.org\//;
export function setPhoto(i, c) {
  const use = (src) => {
    if (WIKI.test(src)) { i.crossOrigin = 'anonymous'; i.removeAttribute('referrerpolicy'); }
    else { i.removeAttribute('crossorigin'); i.referrerPolicy = 'no-referrer'; }
    i.src = src;
  };
  i.onerror = c.fallback ? () => { if (i.src !== c.fallback) { i.onerror = null; use(c.fallback); } } : null;
  use(c.img);
  return i;
}
function img(c, cls = '') {
  return setPhoto(h(`img${cls}`, { alt: '', draggable: false, decoding: 'async' }), c);
}
function prefetch(cards) {
  for (const c of cards) { const i = new Image(); i.decoding = 'async'; setPhoto(i, c); }
}

// ── the page ────────────────────────────────────────────────
export function DesignPage(app, root, { onBack } = {}) {
  let deck = null, order = [], byId = new Map();
  let st = store('dsState') || null; // { today, started, mine, theirs, pending } from the server
  const mine = new Map(), theirs = new Map(), pending = new Set(); // mine: id → { score, day }; theirs: id → score
  const history = []; // swipes this visit, newest last, for the rewind button
  let front = null;   // a card brought back by rewind goes on top
  let busy = false, visible = false, failed = null, rising = false;

  const them = () => app.them()?.name || 'Them';
  const seed = () => app.S.hole?.id || 'bw';

  const meta = h('div.dt-meta');
  const count = h('span.dt-count');
  const undoBtn = h('button.dt-sq', { type: 'button', 'aria-label': 'Take back the last one', onclick: () => undo() }, svgEl(ICONS.undo));
  const matchesBtn = h('button.dt-sq.dt-matches', { type: 'button', 'aria-label': 'Matches', onclick: () => matchesSheet() }, svgEl(HEART(18)), count);
  const stage = h('div.dt-stage');
  root.replaceChildren(
    h('header.dt-head', h('div.dt-top', meta, h('div.dt-tools', undoBtn, matchesBtn)), h('h1.dt-title', 'Design Tinder')),
    stage);

  function applyState(s) {
    st = s;
    mine.clear(); theirs.clear(); pending.clear();
    for (const x of s.mine || []) mine.set(x.item, { score: x.score, day: String(x.day).slice(0, 10) });
    for (const x of s.theirs || []) theirs.set(x.item, x.score);
    for (const x of s.pending || []) pending.add(x);
    // swipes still waiting for a signal count as made
    for (const o of store('dsOutbox') || []) {
      if (o.undo) mine.delete(o.item); else mine.set(o.item, { score: o.score, day: o.day });
    }
  }
  if (st && (st.mine || []).every((x) => x.score != null)) applyState(st); else st = null;

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
  const bothLike = () => [...theirs].filter(([id, t]) => t > 0 && mine.get(id)?.score > 0).length;

  // ── drawing ──
  function render() {
    undoBtn.disabled = !history.length;
    const m = bothLike(); count.textContent = m ? String(m) : '';
    if (failed === 'deck' || (!deck && !st)) {
      meta.textContent = '\u00a0';
      stage.replaceChildren(h('div.dt-empty', h('p', failed === 'deck' ? 'The deck needs a signal the first time.' : 'Shuffling the deck…'), exitBtn()));
      return;
    }
    if (!deck) return;
    const today = dealtOn(dayIndex());
    const p = pile();
    meta.textContent = `${p.length} LEFT`; // just how many are left to answer (Manu)
    if (!p.length) {
      const next = dealtOn(dayIndex() + 1).length;
      meta.textContent = !today.length ? '' : next ? `NEW ${next} TOMORROW` : 'THAT\'S THE WHOLE DECK'; // Manu: no "Done for today."
      stage.replaceChildren(donePanel(today));
      return;
    }
    const W = stage.clientWidth || window.innerWidth - 32, H = stage.clientHeight || window.innerHeight * 0.6;
    const cards = p.slice(0, 2).map((x, k) => cardEl(x, W, H, k));
    const top = cards[0];
    if (rising) top.classList.add('rise');
    rising = false;
    stage.replaceChildren(...cards.reverse(), top._rate);
    prefetch(p.slice(2, 7).map((x) => x.c));
  }

  // A card is a little article: the photo edge to edge at its own shape, then the name and who
  // made it. Tapping the text (or Read) slides the rest of the article up over the photo.
  // The card itself is the whole width of the screen with white margins (it extends past the
  // stage, see .dt-card), so a swiped card reads as a page, not a photo cut out of one.
  function cardEl(x, W, H, depth) {
    const c = x.c;
    const foot = 38;
    const room = H - foot - 150; // the photo leaves at least this much for the name and maker
    // its own shape, allowed to run a little taller (cropping the sides) so less page sits empty
    const picH = Math.round(clamp(W * (c.h / c.w) * 1.22, Math.min(170, room), room));
    const pic = h('div.dt-pic', { style: { height: `${picH}px` } }, img(c, '.dt-img'));
    const long = c.name.length > 26;
    const readBtn = h('button.dt-read', { type: 'button' }, 'READ');
    const backBtn = h('button.dt-back', { type: 'button', onclick: () => onBack?.() }, '← BACK');
    const text = h('div.dt-text',
      h(`h2.dt-name${long ? '.long' : ''}`, c.name),
      h('p.dt-by', c.by),
      more(c));
    const el = h(`div.dt-card${depth ? '.next' : ''}`, { 'data-nopager': '' },
      pic, text,
      h('div.dt-foot', backBtn, readBtn)); // Manu: Back where Hate was, Read where Adore was
    const flip = (on = !el.classList.contains('open')) => {
      el.classList.toggle('open', on);
      readBtn.textContent = on ? 'CLOSE' : 'READ';
      pic.style.height = on ? `${Math.round(Math.min(picH, H * 0.28))}px` : `${picH}px`;
      text.scrollTop = 0;
    };
    // a drag that ends where it started (or a mouse drag) still fires a click; that's not a tap
    const tapped = () => performance.now() - (el._dragEnd || 0) > 300;
    readBtn.addEventListener('click', () => flip());
    text.addEventListener('click', (e) => { if (tapped() && !el.classList.contains('open') && !e.target.closest('a')) flip(true); });
    pic.addEventListener('click', () => { if (tapped() && el.classList.contains('open')) flip(false); });
    if (!depth) {
      // the level you're dragging to sits on the page over the photo, not on the card, so it stays
      // readable however far the card goes
      el._rate = h('div.dt-rate', { style: { top: `${picH / 2}px` } }, h('b'), scaleEl(0));
      drag(el, x, el._rate, pic);
    }
    return el;
  }

  // Gradual swipe: the further you drag, the stronger the feeling. Let go to rate at that level.
  function drag(el, x, rate, pic) {
    let s = null, lv = 0;
    const W = () => el.offsetWidth || window.innerWidth;
    const levelAt = (dx) => { const r = Math.abs(dx) / W(); const n = r < STEPS[0] ? 0 : r < STEPS[1] ? 1 : r < STEPS[2] ? 2 : 3; return Math.sign(dx) * n; };
    const show = (dx) => {
      const v = levelAt(dx);
      if (v !== lv) { lv = v; if (v) buzz(6); rate.querySelector('b').textContent = v ? LEVEL[v] : ''; rate.querySelector('.dt-scale').replaceWith(scaleEl(v)); }
      rate.className = `dt-rate${lv > 0 ? ' yes' : lv < 0 ? ' no' : ''}`;
      rate.style.opacity = lv ? 1 : clamp(Math.abs(dx) / (W() * STEPS[0]), 0, 1) * 0.5;
      rate.style.transform = `translate(-50%, -50%) scale(${1 + Math.abs(lv) * 0.07})`;
    };
    el.addEventListener('dragstart', (e) => e.preventDefault()); // dragging selected text would cancel the swipe
    el.addEventListener('pointerdown', (e) => {
      if (busy || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button, a')) return;
      // while reading, the text scrolls up and down and still swipes sideways
      const reading = el.classList.contains('open') && !!e.target.closest('.dt-text');
      s = { id: e.pointerId, x: e.clientX, y: e.clientY, hist: [{ x: e.clientX, t: performance.now() }], moved: false, reading };
      if (!reading) { try { el.setPointerCapture(e.pointerId); } catch { /* */ } }
    });
    el.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) < 6) return;
      if (!s.moved) {
        if (s.reading && Math.abs(dy) > Math.abs(dx)) { s = null; return; } // a scroll, not a swipe
        if (s.reading) { try { el.setPointerCapture(e.pointerId); } catch { /* */ } window.getSelection()?.removeAllRanges(); }
        el.style.transition = 'none';
        el.classList.add('dragging');
        rate.style.top = `${pic.offsetHeight / 2}px`;
      }
      s.moved = true;
      el.style.transform = `translate3d(${dx}px, ${dy * 0.25}px, 0) rotate(${(dx / W()) * 10}deg)`;
      show(dx);
      s.hist.push({ x: e.clientX, t: performance.now() }); if (s.hist.length > 6) s.hist.shift();
    });
    const end = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      const a = s.hist[0], z = s.hist[s.hist.length - 1];
      const v = (z.x - a.x) / Math.max(16, z.t - a.t);
      const moved = s.moved;
      s = null;
      if (!moved) return;
      el._dragEnd = performance.now();
      const score = lv || (Math.abs(v) > 0.6 && Math.abs(dx) > 30 ? Math.sign(dx) : 0);
      if (score) {
        rate.style.transition = 'opacity 0.2s 0.12s'; rate.style.opacity = '0';
        return commit(x, score, el, dy);
      }
      el.classList.remove('dragging');
      el.style.transition = 'transform 0.42s cubic-bezier(.2,1.4,.4,1)';
      el.style.transform = '';
      lv = 0; show(0);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  async function commit(x, score, el, dy = 0) {
    busy = true;
    const id = x.c.id;
    if (front === id) front = null;
    mine.set(id, { score, day: x.day });
    history.push(x);
    if (el) {
      const W = el.offsetWidth || window.innerWidth;
      el.style.transition = 'transform 0.32s cubic-bezier(.3,.6,.5,1)';
      el.style.transform = `translate3d(${score > 0 ? W * 1.5 : -W * 1.5}px, ${dy * 0.25 + 20}px, 0) rotate(${score > 0 ? 16 : -16}deg)`;
    }
    setTimeout(() => { busy = false; rising = true; render(); }, el ? 240 : 0);
    try {
      const r = await app.backend.dsSwipe(id, x.day, score);
      pending.delete(id);
      if (r?.theirs != null) { theirs.set(id, r.theirs); reveal(x.c, score, r.theirs); }
      saveCopy();
      count.textContent = bothLike() ? String(bothLike()) : '';
    } catch (e) {
      if (offlineError(e)) { queueOut({ item: id, day: x.day, score }); return; }
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
      el.style.transform = 'translate3d(0, -24px, 0)'; el.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'transform 0.34s cubic-bezier(.2,1.3,.4,1), opacity 0.2s'; el.style.transform = ''; el.style.opacity = ''; }));
    }
    try { await app.backend.dsUndo(id); saveCopy(); } catch (e) { if (offlineError(e)) queueOut({ item: id, undo: true }); }
  }

  function reveal(c, me, they) {
    if (me > 0 && they > 0) return matchMoment(c, me, they);
    toast(`${them()} ${THEY[they]} this one.`);
  }

  function matchMoment(c, me, they) {
    sfx.chime(); buzz([14, 70, 14]);
    const box = h('div.dt-match', { role: 'status' },
      h('div.dt-match-card',
        h('div.dt-match-pic', img(c)),
        h('div.dt-match-text',
          h('div.dt-match-label', 'IT\'S A MATCH'),
          h('h2', c.name),
          h('p', `You ${YOU[me]} it. ${them()} ${THEY[they]} it.`))));
    const close = () => { box.classList.remove('in'); setTimeout(() => box.remove(), 300); };
    box.addEventListener('click', close);
    document.body.append(box);
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('in')));
    setTimeout(close, 2600);
  }

  // offline: swipes wait on the phone and go out on the next visit with a signal
  function queueOut(o) {
    const q = (store('dsOutbox') || []).filter((x) => x.item !== o.item);
    q.push(o); store('dsOutbox', q.slice(-100));
  }
  async function flushOutbox() {
    const q = (store('dsOutbox') || []).filter((o) => o.undo || o.score != null);
    while (q.length) {
      const o = q[0];
      try { if (o.undo) await app.backend.dsUndo(o.item); else await app.backend.dsSwipe(o.item, o.day, o.score); }
      catch (e) { if (offlineError(e)) break; console.warn('swipe dropped', o, e); }
      q.shift(); store('dsOutbox', q);
    }
  }
  function saveCopy() {
    if (!st) return;
    store('dsState', {
      ...st,
      mine: [...mine].map(([item, v]) => ({ item, day: v.day, score: v.score })),
      theirs: [...theirs].map(([item, score]) => ({ item, score })),
      pending: [...pending],
    });
  }

  // ── when today's are done ──
  // Today's cards again, each full screen, side by side: swipe sideways to go through them, tap one
  // for the whole article. See matches and Exit the game sit at the bottom (Manu). With no card left
  // there's no BACK in a card's foot, so Exit the game is the way out.
  const exitBtn = () => h('button.dt-wide.dt-exit', { type: 'button', onclick: () => onBack?.() }, 'Exit the game');
  const doneFoot = () => h('div.dt-done-foot',
    h('button.dt-wide', { type: 'button', onclick: () => matchesSheet() }, 'See matches'),
    exitBtn());
  function donePanel(today) {
    if (!today.length) {
      return h('div.dt-done',
        h('div.dt-done-end', h('h2.dt-done-title', 'That\'s the whole deck.'), h('p.dt-lede', 'New cards are on the way.')),
        doneFoot());
    }
    const n = them();
    // a redraw (say, they just swiped) keeps you on the card you were looking at
    const prev = stage.querySelector('.dt-reel');
    const at = prev ? clamp(Math.round(prev.scrollLeft / (prev.clientWidth || 1)), 0, today.length - 1) : 0;
    const W = stage.clientWidth || window.innerWidth - 44;
    const row = (who, s) => h('div.dt-verdict', h('span', who), scaleEl(s || 0), h('b', s ? LEVEL[s] : 'Not yet'));
    const reel = h('div.dt-reel', { 'data-nopager': '' }, today.map((x) => {
      const c = x.c;
      return h('div.dt-slide', { onclick: () => cardSheet(c) },
        // its own shape, a little taller at most (like the swipe card); it gives way if the text needs the room
        h('div.dt-pic', { style: { flexBasis: `${Math.round(W * (c.h / c.w) * 1.22)}px` } }, img(c, '.dt-img')),
        h('div.dt-slide-text', h(`h2.dt-name${c.name.length > 26 ? '.long' : ''}`, c.name), h('p.dt-by', c.by)),
        h('div.dt-verdicts', row('You', mine.get(c.id)?.score), row(n, theirs.get(c.id))));
    }));
    const dots = h('div.dt-dots', { hidden: today.length < 2 }, today.map((_, k) => h(`i${k === at ? '.on' : ''}`)));
    let raf = 0;
    reel.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(reel.scrollLeft / (reel.clientWidth || 1));
        dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i));
      });
    }, { passive: true });
    if (at) requestAnimationFrame(() => { reel.scrollLeft = at * reel.clientWidth; });
    return h('div.dt-done', reel, dots, doneFoot());
  }

  // ── matches ──
  function both() {
    return [...theirs].filter(([id]) => mine.has(id) && byId.has(id))
      .map(([id, t]) => ({ c: byId.get(id), me: mine.get(id).score, them: t }));
  }
  function matchesSheet() {
    if (!deck) return;
    const n = them();
    const list = both();
    const agree = list.filter((x) => Math.sign(x.me) === Math.sign(x.them)).length;
    const liked = list.filter((x) => x.me > 0 && x.them > 0).sort((p, q) => (q.me + q.them) - (p.me + p.them));
    const split = list.filter((x) => Math.sign(x.me) !== Math.sign(x.them));
    const neither = list.filter((x) => x.me < 0 && x.them < 0);
    const grid = (items) => h('div.dt-grid', items.map((x) => h('button.dt-tile', { type: 'button', onclick: () => cardSheet(x.c) },
      h('div.dt-tile-pic', setPhoto(h('img', { loading: 'lazy', alt: '' }), x.c)),
      h('b', x.c.name),
      h('div.dt-tile-row', h('span', 'You'), scaleEl(x.me)),
      h('div.dt-tile-row', h('span', n), scaleEl(x.them)))));
    const section = (label, items, empty) => h('section.dt-sec',
      h('div.dt-label', h('span', label), h('span', String(items.length))),
      items.length ? grid(items) : h('p.dt-empty-line', empty));
    sheet('Matches', [
      h('div.dt-hero',
        h('span.dt-hero-label', 'YOU AGREE ON, ALL TIME'),
        h('div.dt-hero-num', list.length ? pct(agree / list.length) : '0%'),
        h('p', list.length ? `${agree} of the ${list.length} cards you've both swiped landed on the same side.` : `Once you and ${n} have both swiped a card, it lands here.`)),
      statsList(list),
      section('YOU BOTH LIKE', liked, 'Nothing yet. Keep swiping.'),
      section('SPLIT', split, 'No disagreements yet.'),
      section('NEITHER OF YOU', neither, 'Nothing you both turned down yet.'),
    ], { tall: true, quiet: true, className: 'dt-sheet' });
  }

  // Taste profiles: a plain list of stats, You and them side by side, over the cards you've
  // both swiped (so it's a fair comparison).
  function statsList(list) {
    const n = them();
    // every card you've both ever swiped, not just today's (Manu: the stats keep adding up)
    const head = h('div.dt-label', h('span', 'TASTE PROFILES'), h('span', `ALL TIME · ${list.length} CARDS`));
    if (!list.length) return h('section.dt-sec', head, h('p.dt-empty-line', 'Stats start with the first card you\'ve both swiped.'));
    const a = taste(list, 'me'), b = taste(list, 'them');
    const v = (x) => x ?? '–';
    const exact = list.filter((x) => x.me === x.them).length;
    const byKind = new Map();
    for (const x of list) { const k = byKind.get(x.c.kind) || [0, 0]; k[0]++; if (Math.sign(x.me) === Math.sign(x.them)) k[1]++; byKind.set(x.c.kind, k); }
    const kinds = [...byKind].filter(([, k]) => k[0] >= 2).map(([kind, k]) => [KINDS[kind], k[1] / k[0]]).sort((p, q) => q[1] - p[1]);
    const rows = [
      ['Like rate', a.rate == null ? '–' : pct(a.rate), b.rate == null ? '–' : pct(b.rate)],
      ['Average', a.avg == null ? '–' : signed(a.avg), b.avg == null ? '–' : signed(b.avg)],
      ['Adored', String(a.adore), String(b.adore)],
      ['Hated', String(a.hate), String(b.hate)],
      ['Kind', v(a.kind), v(b.kind)],
      ['Era', v(a.era), v(b.era)],
      ['Style', v(a.style), v(b.style)],
      ['Shapes', v(a.form), v(b.form)],
      ['Color', v(a.palette), v(b.palette)],
      ['Feel', v(a.feel), v(b.feel)],
      ['Material', v(a.material), v(b.material)],
      ['Country', v(a.country), v(b.country)],
    ];
    const shared = [
      ['Same level', `${exact} of ${list.length}`],
      kinds.length ? ['Agree most on', `${kinds[0][0]}, ${pct(kinds[0][1])}`] : null,
      kinds.length > 1 ? ['Split most on', `${kinds[kinds.length - 1][0]}, ${pct(kinds[kinds.length - 1][1])}`] : null,
    ].filter(Boolean);
    return h('section.dt-sec',
      head,
      h('table.dt-stats',
        h('thead', h('tr', h('th', ''), h('th', 'You'), h('th', n))),
        h('tbody', rows.map(([k, x, y]) => h('tr', h('th', k), h('td', x), h('td', y))))),
      h('table.dt-stats.two', h('tbody', shared.map(([k, x]) => h('tr', h('th', k), h('td', x))))));
  }

  function cardSheet(c) {
    const me = mine.get(c.id)?.score, they = theirs.get(c.id);
    const row = (who, s, hidden) => h('div.dt-verdict', h('span', who), scaleEl(s || 0), h('b', s ? LEVEL[s] : hidden ? 'Hidden till you swipe' : 'Not yet'));
    sheet('', [
      h('div.dt-sheet-pic', img(c)),
      h('h2.dt-name', c.name),
      h('p.dt-by', c.by),
      h('div.dt-verdicts', row('You', me), row(them(), me == null ? null : they, me == null)),
      more(c),
    ], { quiet: true, className: 'dt-sheet dt-article' });
  }

  return {
    // for the Games page: how many are left to swipe (null until the deck and state are in)
    left: () => (deck && st ? pile().length : null),
    prime: () => (deck && st ? null : load()),
    show() { visible = true; document.body.classList.add('on-design'); render(); load(); },
    hide() { visible = false; document.body.classList.remove('on-design'); },
    get visible() { return visible; },
    matches: () => matchesSheet(),
  };
}
