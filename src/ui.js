// Small UI kit: sheets, toasts, icons, buttons. Paper and thread.
import { h, svg } from './util.js';
import { sfx } from './feel.js';

const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const ICON = {
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
  back: I('<path d="M15 5l-7 7 7 7"/>'),
  heart: I('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>'),
  heartFill: I('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" fill="currentColor"/>'),
  share: I('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7h14v-7"/>'),
  cam: I('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  play: I('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  stop: I('<rect x="6.5" y="6.5" width="11" height="11" rx="1" fill="currentColor"/>'),
  mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  undo: I('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  jar: I('<path d="M7 4h10M8 4v2c-2 1-3 3-3 5v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8c0-2-1-4-3-5V4"/><path d="M5 12h14"/>'),
};
export const icon = (name, cls = '') => { const el = svg(ICON[name]); if (cls) el.classList.add(cls); return el; };

// ── toasts: little stitched tags under the label
let toastBox;
export function toast(text, { tone = 'plain', ms = 3200, icon: ic } = {}) {
  if (!toastBox) { toastBox = h('div.toasts'); document.body.append(toastBox); }
  const el = h(`div.toast.${tone}`, ic ? icon(ic) : null, h('span', text));
  toastBox.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, ms);
}

// ── sheets: paper slips that slide up out of the pocket
const stack = [];
export function sheet(title, body, { onClose, wide = false, tall = false, className = '' } = {}) {
  const close = () => {
    if (!el.isConnected) return;
    el.classList.remove('in');
    setTimeout(() => el.remove(), 320);
    const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
    onClose?.();
  };
  const head = h('header.sheet-head', h('h2', title), h('button.icon-btn', { onclick: close, 'aria-label': 'Close' }, icon('close')));
  const card = h(`div.sheet-card${wide ? '.wide' : ''}${tall ? '.tall' : ''}`, head, h('div.sheet-body', body));
  if (className) card.classList.add(className);
  const el = h('div.sheet', { onclick: (e) => { if (e.target === el) close(); } }, card);
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  sfx.paper();
  const api = { el, card, close, body: card.querySelector('.sheet-body') };
  stack.push(api);
  return api;
}
export const closeAllSheets = () => [...stack].forEach((s) => s.close());

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
