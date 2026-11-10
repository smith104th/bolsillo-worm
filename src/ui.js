// Small UI kit: sheets, toasts, icons, buttons. Paper and thread.
import { h, svg } from './util.js';
import { sfx } from './feel.js';

const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const ICON = {
  pocket: I('<path d="M4.5 4.5h15v7.5a7.5 7.5 0 0 1-15 0z"/><path d="M4.5 9h15"/>'),
  peek: I('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>'),
  kissFill: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2.5 11.6c2.1-3.2 4.3-4.6 6.4-3.5 1.9-1.2 4.3-1.2 6.2 0 2.1-1.1 4.3.3 6.4 3.5-3.6.9-15.4.9-19 0Zm0 .8c3.3 4.5 15.7 4.5 19 0-3.8 1.1-15.2 1.1-19 0Z"/></svg>',
  feed: I('<path d="M5 15c0-4 3-7 7-7s7 3 7 7"/><path d="M4 15h16"/><circle cx="9" cy="11.5" r=".6" fill="currentColor"/><circle cx="13" cy="10.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="12.5" r=".6" fill="currentColor"/><path d="M7 18.5c1.5.8 3.2 1 5 1s3.5-.2 5-1"/>'),
  kiss: I('<path d="M3 12c2-3 4-4.5 6-3.4 1.2-.9 2.8-.9 4 0 2-1.1 4 .4 6 3.4-3 .8-15 .8-16 0Z"/><path d="M3 12.4c3 4 15 4 18 0"/>'),
  drop: I('<ellipse cx="12" cy="15" rx="7" ry="3.2"/><path d="M12 4v8"/><path d="M8.5 8.5 12 12l3.5-3.5"/>'),
  today: I('<circle cx="12" cy="13" r="4"/><path d="M12 3.5v2M4.5 13h-2M21.5 13h-2M6 7l-1.4-1.4M18 7l1.4-1.4"/><path d="M3 20h18"/>'),
  us: I('<path d="M4 15c1.5-3 3.5-3 5 0s3.5 3 5 0 3.5-3 5 0"/><path d="M4 9c1.5-3 3.5-3 5 0s3.5 3 5 0 3.5-3 5 0"/>'),
  note: I('<path d="M4 7h16v11H4z"/><path d="m4 7 8 6 8-6"/>'),
  doodle: I('<path d="M4 18c3-1 3-6 6-6s2 5 5 5 3-8 5-9"/><path d="m17 4 3 3"/>'),
  photo: I('<rect x="4" y="3.5" width="16" height="17" rx="1"/><rect x="6.5" y="6" width="11" height="10"/>'),
  whisper: I('<path d="M6 18c-1-5 2-12 6-12s7 7 6 12"/><path d="M12 6v12M9 7.5 8 18M15 7.5l1 10.5"/><path d="M5 18h14"/>'),
  wiggle: I('<path d="M3 12c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0 3 4 4.5 0"/>'),
  trinket: I('<path d="M12 3.5 19 9l-7 11.5L5 9z"/><path d="M5 9h14M9.5 9 12 20.5 14.5 9 12 3.5 9.5 9"/>'),
  knock: I('<path d="M8 13V7.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V6a1.5 1.5 0 0 1 3 0v5"/><path d="M14 11V7a1.5 1.5 0 0 1 3 0v6c0 4-2.5 7-6 7s-5-2-6-5l-1-3a1.5 1.5 0 0 1 2.7-1.2L8 13"/>'),
  ring: I('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  mist: I('<path d="M12 3.5c3 4 5 6.6 5 9.5a5 5 0 0 1-10 0c0-2.9 2-5.5 5-9.5Z"/>'),
  close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  faceid: I('<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1.5M15 9v1.5M12 9v4h-1M9.5 16c1.4 1 3.6 1 5 0"/>'),
  save: I('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>'),
  song: I('<path d="M9 17.5V6.5l10-2.5v11"/><circle cx="6.6" cy="17.5" r="2.4"/><circle cx="16.6" cy="15" r="2.4"/>'),
  check: I('<path d="M5 12.5 10 17.5 19 7"/>'),
  back: I('<path d="M15 5l-7 7 7 7"/>'),
  heart: I('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>'),
  heartFill: I('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" fill="currentColor"/>'),
  share: I('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7h14v-7"/>'),
  cam: I('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  play: I('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  stop: I('<rect x="6.5" y="6.5" width="11" height="11" rx="1" fill="currentColor"/>'),
  mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  undo: I('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  eraser: I('<path d="M8.5 20 3.6 15.1a2 2 0 0 1 0-2.8l8.7-8.7a2 2 0 0 1 2.8 0l5.3 5.3a2 2 0 0 1 0 2.8L12 20"/><path d="m8 8 8 8"/><path d="M8.5 20H21"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  later: I('<path d="M4 7h16v11H4z"/><path d="m4 7 8 5.5L20 7"/><path d="M12 16.6s-2.3-1.4-2.3-2.8a1.15 1.15 0 0 1 2.3-.5 1.15 1.15 0 0 1 2.3.5c0 1.4-2.3 2.8-2.3 2.8Z" fill="currentColor" stroke="none"/>'),
  jar: I('<path d="M7 4h10M8 4v2c-2 1-3 3-3 5v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8c0-2-1-4-3-5V4"/><path d="M5 12h14"/>'),
};
export const icon = (name, cls = '') => { const el = svg(ICON[name]); if (cls) el.classList.add(cls); return el; };

// ── toasts: little stitched tags under the label
let toastBox;
// One toast at a time (Manu, Nov 10: they used to pile up over the header on open).
// The rest wait in line; tap or flick a toast up to dismiss it and bring the next one.
// A text already waiting isn't queued twice.
const queue = []; let showing = null;
export function toast(text, { tone = 'plain', ms = 3200, icon: ic } = {}) {
  if (!toastBox) { toastBox = h('div.toasts'); document.body.append(toastBox); }
  if (showing?.text === text || queue.some((t) => t.text === text)) return;
  queue.push({ text, tone, ms, ic });
  if (!showing) nextToast();
}
function nextToast() {
  const t = queue.shift(); if (!t) { showing = null; return; }
  showing = t;
  const el = h(`div.toast.${t.tone}${t.ic ? '' : '.plain-pad'}`, t.ic ? h('span.ti', icon(t.ic)) : null, h('span', t.text));
  let done = false, y0 = null;
  const dismiss = () => {
    if (done) return; done = true; clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(() => { el.remove(); setTimeout(nextToast, queue.length ? 140 : 0); }, 360);
  };
  el.addEventListener('click', dismiss);
  el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (y0 != null && y0 - e.touches[0].clientY > 24) { y0 = null; dismiss(); } }, { passive: true });
  toastBox.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  // a toast with others waiting behind it doesn't overstay
  const timer = setTimeout(dismiss, queue.length ? Math.min(t.ms, 2400) : t.ms);
}

// ── sheets: white cards that slide up, swipe down to close
const stack = [];
let sheetListener = null;
export const onSheets = (fn) => { sheetListener = fn; };
export function sheet(title, body, { onClose, wide = false, tall = false, className = '', quiet = false } = {}) {
  const close = () => {
    if (!el.isConnected || el.dataset.closing) return;
    el.dataset.closing = '1';
    el.classList.remove('in');
    card.style.transform = '';
    setTimeout(() => el.remove(), 360);
    const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
    onClose?.();
    sheetListener?.(stack.length);
  };
  const grab = h('div.grabber');
  const head = h('header.sheet-head', h('h2', title), h('button.icon-btn', { onclick: close, 'aria-label': 'Close' }, icon('close')));
  const card = h(`div.sheet-card${wide ? '.wide' : ''}${tall ? '.tall' : ''}`, grab, head, h('div.sheet-body', body));
  if (className) card.classList.add(className);
  const el = h('div.sheet', { onclick: (e) => { if (e.target === el) close(); } }, card);
  // swipe down on the grabber or title to dismiss
  let y0 = null, dy = 0;
  const start = (e) => { if (e.target.closest('button')) return; y0 = e.clientY; dy = 0; card.classList.add('dragging'); e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); card.style.transform = `translateY(${dy}px)`; };
  const end = () => { if (y0 == null) return; y0 = null; card.classList.remove('dragging'); if (dy > 110) close(); else card.style.transform = ''; };
  for (const t of [grab, head]) { t.addEventListener('pointerdown', start); t.addEventListener('pointermove', move); t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end); }
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  const api = { el, card, close, body: card.querySelector('.sheet-body') };
  stack.push(api);
  sheetListener?.(stack.length);
  return api;
}
export const closeAllSheets = () => [...stack].forEach((s) => s.close());
export const topSheet = () => stack[stack.length - 1] || null;

export function btn(label, onclick, cls = '') {
  return h(`button.btn${cls ? '.' + cls.split(' ').join('.') : ''}`, { onclick, type: 'button' }, label);
}

export function confirmBox(text, yes = 'Yes', no = 'Cancel') {
  return new Promise((res) => {
    const s = sheet('Sure?', [h('p.lede', text), h('div.row', btn(no, () => { s.close(); res(false); }, 'ghost'), btn(yes, () => { s.close(); res(true); }, 'danger'))]);
  });
}

export function field(label, input, hint) {
  return h('label.field', h('span.field-label', label), input, hint ? h('span.field-hint', hint) : null);
}

export function segmented(options, value, onchange) {
  const wrap = h('div.seg');
  const render = () => {
    wrap.replaceChildren(...Object.entries(options).map(([k, v]) =>
      h(`button.seg-opt${k === value ? '.on' : ''}`, { type: 'button', onclick: () => { value = k; render(); onchange(k); } }, v)));
  };
  render();
  return wrap;
}
