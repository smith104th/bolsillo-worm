// Swipe between screens: the pocket in the middle of things, the shelf one swipe away.
import { h, clamp } from './util.js';

export function Pager(screens, { labels = [], onChange, onMove } = {}) {
  let index = 0, pos = 0, drag = null, lastEnd = 0;
  const n = screens.length;
  const dots = h('div.pager-dots.glass', screens.map((_, k) => h('button', { type: 'button', 'aria-label': labels[k] || `Screen ${k + 1}`, onclick: () => go(k) }, h('i'))));
  document.body.append(dots);

  const apply = (animate) => {
    screens.forEach((s, k) => {
      s.style.transition = animate ? 'transform 0.46s cubic-bezier(.2,.9,.25,1)' : 'none';
      s.style.transform = `translate3d(${(k - pos) * 100}%,0,0)`;
    });
    const on = Math.round(pos);
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === on));
    onMove?.(pos, animate, dots);
  };

  function go(k, { silent = false } = {}) {
    k = clamp(k, 0, n - 1);
    const changed = k !== index;
    index = k; pos = k; apply(true);
    if (changed && !silent) onChange?.(index);
  }

  // someone else decided this pointer is a horizontal swipe; follow it from here
  function begin(e) {
    if (drag) return false;
    drag = { id: e.pointerId, x0: e.clientX, start: pos, hist: [{ x: e.clientX, t: performance.now() }] };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return true;
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault?.();
    const W = window.innerWidth;
    let p = drag.start - (e.clientX - drag.x0) / W;
    if (p < 0) p *= 0.3; if (p > n - 1) p = n - 1 + (p - (n - 1)) * 0.3;
    pos = p; apply(false);
    drag.hist.push({ x: e.clientX, t: performance.now() }); if (drag.hist.length > 6) drag.hist.shift();
  }
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
    const a = drag.hist[0], z = drag.hist[drag.hist.length - 1];
    const v = (z.x - a.x) / Math.max(16, z.t - a.t); // px per ms, negative = finger moving left
    let target = Math.round(pos);
    if (Math.abs(v) > 0.3) target = v < 0 ? Math.ceil(pos - 0.02) : Math.floor(pos + 0.02);
    drag = null; lastEnd = performance.now();
    go(target);
  }

  // DOM screens (like the shelf): claim horizontal drags, leave vertical scrolling alone
  function watch(el) {
    let s = null;
    el.addEventListener('pointerdown', (e) => { if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('input, textarea, [data-nopager]')) { s = null; return; } s = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id || drag) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        const st = s; s = null;
        if (begin({ pointerId: e.pointerId, clientX: st.x })) { try { el.setPointerCapture(e.pointerId); } catch { /* */ } move(e); }
      }
    });
    el.addEventListener('click', (e) => { if (performance.now() - lastEnd < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
    const clear = () => { s = null; };
    el.addEventListener('pointerup', clear); el.addEventListener('pointercancel', clear);
  }

  apply(false);
  return { go, begin, watch, dots, get index() { return index; }, get dragging() { return !!drag; } };
}
