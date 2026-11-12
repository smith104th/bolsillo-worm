// Games: the third page (Manu, Nov 12). Soil, Design Tinder and Garden & House used to be pages
// you swiped through; now they live here as bands, like the shelf's. Tapping one slides it in
// over this page; Back (or a swipe to the right) slides it away again, and from here you swipe
// on to the shelf and the pocket as before.
// Laid out like the shelf (Manu): the header, both worms wandering together in a strip of sky,
// then the bands, white with hairlines between them and the names in each game's color. The
// sky here is always the daytime blue, whatever time it is where they are.
import { h } from './util.js';
import { makeSky, SKY } from './draw.js';
import { buzz } from './feel.js';
import { roam } from './shelf.js';

export const GAMES_SKY = SKY;
export const GAMES_BOTTOM = '#FFFFFF';
export const GAMES = [
  { id: 'soil', name: 'Soil', fg: '#0F7A4E' },
  { id: 'design', name: 'Design Tinder', fg: '#D90042' },
  { id: 'house', name: 'Garden & House', fg: '#1546A8' },
];

// status(id) → short text for the band's pill when something waits there, else null
export function GamesPage(app, root, { open, status }) {
  let W = 0, H = 0, roamer = null;
  const bg = h('canvas.shelf-sky');
  const meta = h('div.hd-meta');
  const roamCv = h('canvas.roamer', { 'aria-label': 'Your two worms, wandering' });
  const roamWrap = h('div.roam-wrap', roamCv);
  const bands = h('div.bands', { style: { '--last': GAMES_BOTTOM } });
  const scroll = h('div.shelf-scroll', h('header.shelf-head', meta, h('div.hd-name', 'Games')), h('div.shelf-content.games-content', roamWrap, bands));
  root.replaceChildren(bg, scroll);

  // always the daytime gradient (Manu), only redrawn when the screen size changes
  function setSky() {
    const w = window.innerWidth, hh = window.innerHeight;
    if (W === w && H === hh) return;
    W = w; H = hh;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const c = makeSky(w, hh, dpr, GAMES_SKY);
    bg.width = c.width; bg.height = c.height; bg.getContext('2d').drawImage(c, 0, 0);
  }

  // both worms, loose in the sky above the games
  function worms() {
    const designs = [app.me()?.worm, app.them()?.worm].filter(Boolean);
    if (roamer && roamer.worms.length === designs.length) roamer.worms.forEach((w, i) => w.setDesign(designs[i] || {}));
    else if (!roamer || roamer.worms.length !== designs.length) {
      roamer?.stop(); roamer = null;
      requestAnimationFrame(() => { if (!roamer && roamCv.isConnected) roamer = roam(roamCv, designs.length ? designs : [{}]); });
    }
  }

  function render() {
    const waiting = GAMES.map((g) => status(g.id)).filter(Boolean).length;
    meta.textContent = waiting ? `${waiting} WAITING FOR YOU` : 'GAMES FOR TWO';
    bands.replaceChildren(...GAMES.map((g) => {
      const s = status(g.id);
      return h('button.band.game', { type: 'button', style: { '--bg': '#FFFFFF', '--fg': g.fg }, onclick: () => { buzz(8); open(g.id); } },
        h('span.band-name', g.name),
        h('span.band-side', s ? h('span.band-ready', s) : null));
    }));
  }

  return {
    render, setSky,
    show() { setSky(); render(); worms(); roamer?.start(); },
    hide() { roamer?.stop(); },
  };
}

// The games slide in over the Games page, one at a time. Swipe right to send one back.
export function GameStack(screens, { onChange } = {}) {
  const EASE = 'transform 0.42s cubic-bezier(.2,.9,.25,1)';
  let cur = null, drag = null, lastEnd = 0;
  const hideTimers = new Map();
  for (const el of Object.values(screens)) { el.style.transform = 'translate3d(100%,0,0)'; el.style.visibility = 'hidden'; }

  function slide(el, x, animate) {
    el.style.transition = animate ? EASE : 'none';
    el.style.transform = typeof x === 'number' ? `translate3d(${x}px,0,0)` : `translate3d(${x},0,0)`;
  }

  function open(id, { animate = true } = {}) {
    const el = screens[id];
    if (!el || cur === id) return;
    if (cur) close({ animate: false });
    cur = id;
    clearTimeout(hideTimers.get(id));
    el.style.visibility = 'visible';
    slide(el, '100%', false);
    void el.offsetWidth;
    slide(el, 0, animate);
    document.body.classList.add('in-game');
    onChange?.(id);
  }

  function close({ animate = true } = {}) {
    if (!cur) return;
    const id = cur, el = screens[id];
    cur = null;
    slide(el, '100%', animate);
    clearTimeout(hideTimers.get(id));
    if (animate) hideTimers.set(id, setTimeout(() => { if (cur !== id) el.style.visibility = 'hidden'; }, 460));
    else el.style.visibility = 'hidden';
    document.body.classList.remove('in-game');
    onChange?.(null, id);
  }

  // follow a finger dragging the open game to the right; let go past a third (or flick) to close
  function begin(e) {
    if (!cur || drag) return false;
    drag = { id: e.pointerId, x0: e.clientX, x: 0, el: screens[cur], hist: [{ x: e.clientX, t: performance.now() }] };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return true;
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault?.();
    drag.x = Math.max(0, e.clientX - drag.x0);
    slide(drag.el, drag.x, false);
    drag.hist.push({ x: e.clientX, t: performance.now() }); if (drag.hist.length > 6) drag.hist.shift();
  }
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
    const a = drag.hist[0], z = drag.hist[drag.hist.length - 1];
    const v = (z.x - a.x) / Math.max(16, z.t - a.t);
    const go = drag.x > window.innerWidth * 0.33 || (v > 0.3 && drag.x > 20);
    const el = drag.el;
    drag = null; lastEnd = performance.now();
    if (go) close(); else slide(el, 0, true);
  }

  // DOM games (Soil, the top of Design Tinder): a sideways drag to the right is a back swipe,
  // vertical scrolling and anything marked data-nopager are left alone
  function watch(el) {
    let s = null;
    el.addEventListener('pointerdown', (e) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('input, textarea, [data-nopager]')) { s = null; return; }
      s = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id || drag) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (dx < -12) { s = null; return; }
      if (dx > 12 && dx > Math.abs(dy) * 1.3) {
        const st = s; s = null;
        if (begin({ pointerId: e.pointerId, clientX: st.x })) { try { el.setPointerCapture(e.pointerId); } catch { /* */ } move(e); }
      }
    });
    el.addEventListener('click', (e) => { if (performance.now() - lastEnd < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
    const clear = () => { s = null; };
    el.addEventListener('pointerup', clear); el.addEventListener('pointercancel', clear);
  }

  return { open, close, begin, watch, get current() { return cur; } };
}
