// The shelf: one swipe from the pocket. Wooden planks on the same sky, holding
// "open when…" envelopes, photos that open on a date, and the things you kept.
import { h, ago, prettyDay, seeded } from './util.js';
import { sheet, btn, toast, segmented, icon } from './ui.js';
import { makeSky, SKY, PAPERS, TRINKETS, renderStrokes } from './draw.js';
import { Worm } from './worm.js';
import { openItem, trinketCanvas, reactRow, theirReactions } from './compose.js';
import { photoFromFile } from './media.js';
import { sfx, buzz } from './feel.js';

const INK = '#26324D';
export const WHEN_PRESETS = ['you\'re sad', 'you can\'t sleep', 'you miss me', 'you need a laugh', 'you had a bad day', 'it\'s your birthday', 'you need a hug', 'you\'re proud of yourself'];
const ENVELOPES = { rosa: '#F9C6D3', celeste: '#BFDDF7', limon: '#F3EB94', white: '#FFFFFF' };
const shade = (hex, k = 0.86) => { const v = parseInt(hex.slice(1), 16); return '#' + [16, 8, 0].map((s) => Math.round(((v >> s) & 255) * k).toString(16).padStart(2, '0')).join(''); };
const dayLabel = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const daysUntil = (app, d) => Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(app.today() + 'T00:00:00Z')) / 86400000);
const html = (s) => h('span.art', { html: s });

// ── drawings ───────────────────────────────────────────────
export function envelopeSVG(paper = 'rosa', { open = false, w = 92 } = {}) {
  const c = ENVELOPES[paper] || ENVELOPES.rosa, d = shade(c);
  if (!open) {
    return `<svg viewBox="0 0 120 84" width="${w}" aria-hidden="true">
      <rect x="4" y="4" width="112" height="76" rx="7" fill="${c}" stroke="${INK}" stroke-width="2.6"/>
      <path d="M8 76 L50 42 M112 76 L70 42" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".35"/>
      <path d="M6 8 L60 48 L114 8" fill="${d}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
      <circle cx="60" cy="47" r="11" fill="#E0465E" stroke="${INK}" stroke-width="2.4"/>
      <path d="M60 52s-5-3-5-6.2a2.6 2.6 0 0 1 5-1.2 2.6 2.6 0 0 1 5 1.2C65 49 60 52 60 52Z" fill="#fff"/>
    </svg>`;
  }
  return `<svg viewBox="0 -34 120 118" width="${w}" aria-hidden="true">
    <rect x="4" y="4" width="112" height="76" rx="7" fill="${d}" stroke="${INK}" stroke-width="2.6"/>
    <path d="M6 8 L60 -30 L114 8" fill="${d}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
    <rect x="18" y="-16" width="84" height="66" rx="3" fill="#fff" stroke="${INK}" stroke-width="2.2"/>
    <path d="M28 -4h52M28 6h60M28 16h44" stroke="#C9CEDA" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M4 30 L60 58 L116 30 V74 a6 6 0 0 1 -6 6 H10 a6 6 0 0 1 -6 -6 Z" fill="${c}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
  </svg>`;
}
export function parcelSVG({ ready = false, w = 88 } = {}) {
  return `<svg viewBox="0 0 120 100" width="${w}" aria-hidden="true">
    <rect x="8" y="18" width="104" height="78" rx="6" fill="#D9B283" stroke="${INK}" stroke-width="2.6"/>
    <path d="M14 30 h92 M14 84 h92" stroke="#C49A68" stroke-width="2" opacity=".6"/>
    <path d="M60 18 V96 M8 56 H112" stroke="${ready ? '#E0465E' : '#8A5A2B'}" stroke-width="5"/>
    <path d="M60 18 C 44 2, 30 10, 44 20 C 50 24, 56 20, 60 18 C 64 20, 70 24, 76 20 C 90 10, 76 2, 60 18Z" fill="none" stroke="${ready ? '#E0465E' : '#8A5A2B'}" stroke-width="4.5" stroke-linejoin="round"/>
    <circle cx="60" cy="18" r="4.5" fill="${ready ? '#E0465E' : '#8A5A2B'}"/>
  </svg>`;
}
const tag = (text, tone = '') => h(`span.tag${tone ? '.' + tone : ''}`, text);

// the safe: everything sealed for later lives in here
export function safeSVG({ w = 118, open = false } = {}) {
  const ticks = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${(58 + Math.cos(a) * 15).toFixed(1)} ${(56 + Math.sin(a) * 15).toFixed(1)} L${(58 + Math.cos(a) * 18.5).toFixed(1)} ${(56 + Math.sin(a) * 18.5).toFixed(1)}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`; }).join('');
  const door = open
    ? `<rect x="16" y="14" width="98" height="84" rx="7" fill="#7E9E8C" stroke="${INK}" stroke-width="2.4"/><path d="M24 50h82M24 74h82" stroke="${INK}" stroke-width="2" opacity=".35"/>
       <path d="M16 14 L-14 24 V92 L16 98 Z" fill="#C6E0D1" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="1" cy="56" r="7" fill="#fff" stroke="${INK}" stroke-width="2"/>`
    : `<rect x="16" y="14" width="98" height="84" rx="8" fill="#C6E0D1" stroke="${INK}" stroke-width="2.4"/>
       <rect x="10" y="26" width="9" height="15" rx="2" fill="#7E9E8C" stroke="${INK}" stroke-width="2"/><rect x="10" y="70" width="9" height="15" rx="2" fill="#7E9E8C" stroke="${INK}" stroke-width="2"/>
       <circle cx="58" cy="56" r="21" fill="#fff" stroke="${INK}" stroke-width="2.6"/>${ticks}
       <path d="M58 56 L58 42" stroke="#E0465E" stroke-width="3" stroke-linecap="round"/><circle cx="58" cy="56" r="5.5" fill="${INK}"/>
       <rect x="92" y="38" width="11" height="36" rx="5.5" fill="#E3A23F" stroke="${INK}" stroke-width="2.4"/>
       <path d="M58 90s-5-3-5-6a2.6 2.6 0 0 1 5-1.2 2.6 2.6 0 0 1 5 1.2c0 3-5 6-5 6Z" fill="#E0465E" stroke="${INK}" stroke-width="1.4"/>`;
  return `<svg viewBox="${open ? '-18' : '0'} 0 ${open ? 148 : 130} 122" width="${w}" aria-hidden="true">
    <rect x="18" y="106" width="15" height="11" rx="2.5" fill="#5F7A6B" stroke="${INK}" stroke-width="2.4"/>
    <rect x="97" y="106" width="15" height="11" rx="2.5" fill="#5F7A6B" stroke="${INK}" stroke-width="2.4"/>
    <rect x="4" y="4" width="122" height="104" rx="13" fill="#A8CBB7" stroke="${INK}" stroke-width="2.8"/>
    ${door}
  </svg>`;
}
// the suitcase: everything you've opened, with stickers from both cities
export function suitcaseSVG({ a = '', b = '', w = 132 } = {}) {
  const sticker = (txt, x, y, r, fill) => txt ? `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-17" y="-9" width="34" height="18" rx="4" fill="${fill}" stroke="${INK}" stroke-width="1.8"/><text x="0" y="4.2" text-anchor="middle" font-family="Geist Mono, ui-monospace, monospace" font-size="10" font-weight="600" fill="${INK}">${txt}</text></g>` : '';
  return `<svg viewBox="0 0 150 118" width="${w}" aria-hidden="true">
    <path d="M55 26 V15 Q55 5 65 5 H85 Q95 5 95 15 V26 H86 V16 Q86 13 83 13 H67 Q64 13 64 16 V26 Z" fill="#9C6338" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="4" y="24" width="142" height="88" rx="13" fill="#CF9161" stroke="${INK}" stroke-width="2.8"/>
    <path d="M4 44 H146" stroke="${INK}" stroke-width="2" opacity=".3"/>
    <rect x="30" y="24" width="13" height="88" fill="#A86C3E" stroke="${INK}" stroke-width="2"/>
    <rect x="107" y="24" width="13" height="88" fill="#A86C3E" stroke="${INK}" stroke-width="2"/>
    <rect x="28" y="38" width="17" height="11" rx="2" fill="#EBD3A5" stroke="${INK}" stroke-width="1.8"/>
    <rect x="105" y="38" width="17" height="11" rx="2" fill="#EBD3A5" stroke="${INK}" stroke-width="1.8"/>
    <circle cx="70" cy="68" r="14" fill="#F9C6D3" stroke="${INK}" stroke-width="2"/>
    <path d="M70 75s-6-3.6-6-7.4a3 3 0 0 1 6-1.4 3 3 0 0 1 6 1.4c0 3.8-6 7.4-6 7.4Z" fill="#E0465E"/>
    ${sticker(a, 98, 96, 6, '#FFFFFF')}${sticker(b, 116, 72, -9, '#BFDDF7')}
  </svg>`;
}
const cityCode = (c) => (c || '').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();

let woodURL = null;
function wood() {
  if (woodURL) return woodURL;
  const c = document.createElement('canvas'); c.width = 512; c.height = 48;
  const x = c.getContext('2d'); const r = seeded(7);
  const g = x.createLinearGradient(0, 0, 0, 48); g.addColorStop(0, '#DDAE74'); g.addColorStop(1, '#C69159');
  x.fillStyle = g; x.fillRect(0, 0, 512, 48);
  for (let i = 0; i < 28; i++) {
    const y0 = r() * 48; x.strokeStyle = `rgba(120,70,30,${0.07 + r() * 0.15})`; x.lineWidth = 0.6 + r() * 1.4;
    x.beginPath();
    for (let X = 0; X <= 512; X += 16) { const yy = y0 + Math.sin(X / 60 + i) * 1.6 + Math.sin(X / 23 + i * 2) * 0.7; X ? x.lineTo(X, yy) : x.moveTo(X, yy); }
    x.stroke();
  }
  for (let k = 0; k < 2; k++) { const kx = 80 + r() * 360, ky = 12 + r() * 24; x.strokeStyle = 'rgba(110,60,25,.22)'; x.lineWidth = 1; for (let j = 1; j < 5; j++) { x.beginPath(); x.ellipse(kx, ky, 4.5 * j, 1.5 * j, 0, 0, 7); x.stroke(); } }
  const img = x.getImageData(0, 0, 512, 48), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  return (woodURL = `url(${c.toDataURL('image/jpeg', 0.86)})`);
}
const plank = () => h('div.plank', h('i.bracket.l'), h('i.bracket.r'));

// ── the screen ─────────────────────────────────────────────
export function Shelf(app, root) {
  let view = 'for', W = 0, H = 0, skyKey = null, napper = null;
  const bg = h('canvas.shelf-sky');
  const meta = h('div.hd-meta');
  const tabs = h('div.shelf-tabs.glass',
    h('button.on', { type: 'button', 'data-v': 'for', onclick: () => setView('for') }, 'For you'),
    h('button', { type: 'button', 'data-v': 'from', onclick: () => setView('from') }, 'From you'));
  const add = h('button.shelf-add.glass', { type: 'button', 'aria-label': 'Leave something for later', onclick: () => leaveSheet(app) }, h('span', '+'));
  const head = h('header.shelf-head', meta, h('div.hd-name', 'Shelf'), tabs);
  const content = h('div.shelf-content');
  const scroll = h('div.shelf-scroll', head, content);
  root.replaceChildren(bg, scroll, add);
  root.style.setProperty('--wood', wood());

  function setView(v) { view = v; [...tabs.children].forEach((b) => b.classList.toggle('on', b.dataset.v === v)); sfx.tick(); render(); scroll.scrollTop = 0; }
  function setSky(sky) {
    const w = window.innerWidth, hh = window.innerHeight;
    if (skyKey === sky.key && W === w && H === hh) return;
    W = w; H = hh; skyKey = sky.key;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const c = makeSky(w, hh, dpr, sky || SKY);
    bg.width = c.width; bg.height = c.height; bg.getContext('2d').drawImage(c, 0, 0);
  }

  // what goes where: sealed things in the safe, opened things and keepsakes in the suitcase
  function contents() {
    const me = app.slot(), mine = view === 'from';
    const all = [...app.S.shelf.values()];
    const ours = (e) => (mine ? e.from_slot === me : e.from_slot !== me);
    const later = all.filter((e) => e.kind === 'later' && ours(e));
    return {
      safe: later.filter((e) => !e.opened_at),
      archive: [...later.filter((e) => e.opened_at), ...all.filter((e) => e.kept && e.kind !== 'later' && ours(e))],
    };
  }

  function render() {
    const them = app.them()?.name || 'them';
    const { safe, archive } = contents();
    const ready = safe.filter((e) => e.payload?.mode === 'date' && daysUntil(app, e.payload.on) <= 0).length;
    meta.textContent = view === 'for' ? (safe.length ? `${safe.length} SEALED FOR YOU` : 'YOUR SHELF') : `WHAT YOU LEFT ${them.toUpperCase()}`;
    const count = (n, tone = '') => (n ? h(`span.count${tone ? '.' + tone : ''}`, String(n)) : null);
    const safeBtn = h(`button.thing.big${ready && view === 'for' ? '.ready' : ''}`, { type: 'button', style: { '--r': '-1deg' }, onclick: () => safeSheet(app, view, () => render()) },
      html(safeSVG()), count(safe.length, ready && view === 'for' ? 'pink' : ''),
      tag(view === 'for' ? (ready ? `${ready} ready to open` : 'for later') : `${them}'s safe`, ready && view === 'for' ? 'pink' : ''));
    const cities = [app.me()?.place?.city, app.them()?.place?.city].map(cityCode);
    const caseBtn = h('button.thing.big.case', { type: 'button', style: { '--r': '1.5deg' }, onclick: () => archiveSheet(app, view, () => render()) },
      html(suitcaseSVG({ a: cities[0], b: cities[1] })), count(archive.length), tag(view === 'for' ? 'Archive' : `${them} opened`));
    const out = [decor(), h('div.shelf-row.objects', safeBtn, caseBtn), plank()];
    if (view === 'for' && !safe.length && !archive.length) out.push(h('p.shelf-hint', `When ${them} leaves you something for later, it's locked in the safe. Once you open it, it goes in the suitcase.`));
    if (view === 'from') out.push(h('div.shelf-empty', btn(`Leave something for ${them}`, () => leaveSheet(app), 'primary')));
    content.replaceChildren(...out);
  }

  // top plank: a plant and their worm, napping
  function decor() {
    const cv = h('canvas.napper', { width: 440, height: 220, 'aria-label': `${app.them()?.worm?.name || 'Their worm'}, asleep` });
    const row = h('div.shelf-row.decor', h('span.plant', '🪴'), h('div.nap', cv, h('span.zz', 'z'), h('span.zz.b', 'z')));
    const wrap = h('div.decor-wrap', row, plank());
    requestAnimationFrame(() => { napper?.stop(); napper = nap(cv, app.them()?.worm); });
    return wrap;
  }

  return {
    render, setSky,
    show() { render(); napper?.start(); },
    hide() { napper?.stop(); },
  };
}

// their worm, tucked into a little bed on the top shelf. It stays put and breathes;
// poke it and it opens its eyes for a moment, then goes back to sleep.
function nap(canvas, design) {
  const x = canvas.getContext('2d'), W = 220, H = 110, R = 10.5;
  canvas.width = W * 2; canvas.height = H * 2;
  const w = new Worm(design || {}, { x: 58, y: 54, R, segs: 15, angle: Math.PI });
  // lay it down: head on the pillow, body stretched out under the blanket
  w.pts.forEach((p, k) => { p.x = p.px = 58 + k * w.spacing; p.y = p.py = 55 + Math.sin(k * 0.55) * 1.4 + k * 0.18; });
  w.heading = Math.PI;
  const sleep = () => { w.mode = 'sleep'; w.orbit = { x: 0, y: 0, a: 0, r: 0, t: 99 }; w.happy = 0; w.surprise = 0; };
  sleep();
  const bodyY = (px) => { let best = w.pts[0]; for (const p of w.pts) if (Math.abs(p.x - px) < Math.abs(best.x - px)) best = p; return best.y; };
  const tail = () => w.pts[w.pts.length - 1].x;
  const INK = '#26324D', WOOD = '#C9935B', WOOD_D = '#A9733F', BLANKET = '#F9C6D3', THREAD = '#E3A23F';
  const line = () => { x.strokeStyle = INK; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke(); };
  const rr = (X, Y, Wd, Ht, r) => { x.beginPath(); x.roundRect(X, Y, Wd, Ht, r); };

  let run = false, t = 0, last = 0, wakeT = 0;
  const draw = () => {
    x.setTransform(2, 0, 0, 2, 0, 0); x.clearRect(0, 0, W, H);
    const breathe = Math.sin(t * 1.7) * 0.9;
    // headboard, legs, rail
    rr(10, 26, 20, 82, [9, 9, 2, 2]); x.fillStyle = WOOD; x.fill(); line();
    x.beginPath(); x.arc(20, 24, 4.5, 0, Math.PI * 2); x.fillStyle = WOOD_D; x.fill(); line();
    rr(32, 92, 7, 16, 2); x.fillStyle = WOOD_D; x.fill(); line();
    rr(186, 92, 7, 16, 2); x.fill(); line();
    rr(26, 78, 172, 15, 3); x.fillStyle = WOOD; x.fill(); line();
    // mattress
    rr(28, 64, 168, 17, 5); x.fillStyle = '#FFFFFF'; x.fill(); line();
    // pillow
    x.beginPath(); x.ellipse(52, 60, 25, 10, -0.05, 0, Math.PI * 2); x.fillStyle = '#FFFFFF'; x.fill(); line();
    x.beginPath(); x.moveTo(40, 57); x.quadraticCurveTo(52, 61, 64, 57); x.strokeStyle = '#D5D9E3'; x.lineWidth = 1.5; x.stroke();
    // the worm
    w.draw(x, { flat: true });
    // blanket, rising and falling a little
    x.beginPath();
    const x0 = 78, x1 = Math.min(196, tail() + 16);
    x.moveTo(x0, 86);
    for (let px = x0; px <= x1; px += 4) x.lineTo(px, bodyY(px) - R * 0.9 + breathe * (1 - (px - x0) / (x1 - x0)) + Math.sin(px / 7) * 0.6);
    x.lineTo(x1 + 2, 74); x.quadraticCurveTo(x1 + 4, 86, x1 - 2, 90); x.lineTo(x0 - 2, 90); x.closePath();
    x.fillStyle = BLANKET; x.fill(); line();
    // turned-down edge with a running stitch, like the hole
    x.beginPath(); x.moveTo(x0, bodyY(x0) - R * 0.9 + breathe); x.lineTo(x0 + 13, bodyY(x0 + 13) - R * 0.9 + breathe * 0.9); x.lineTo(x0 + 11, 89); x.lineTo(x0 - 2, 90); x.closePath();
    x.fillStyle = '#FCE3EA'; x.fill(); line();
    x.setLineDash([3, 3]); x.beginPath(); x.moveTo(x0 + 18, bodyY(x0 + 18) - R * 0.9 + 4); x.lineTo(x0 + 18, 86); x.strokeStyle = THREAD; x.lineWidth = 1.6; x.stroke(); x.setLineDash([]);
    // footboard in front
    rr(190, 46, 18, 62, [8, 8, 2, 2]); x.fillStyle = WOOD; x.fill(); line();
  };
  const loop = (now) => {
    if (!run) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    if (dt >= 1 / 20) {
      last = now; t += dt;
      if (wakeT > 0) { wakeT -= dt; w.happy = Math.max(w.happy - dt * 0.3, 0); if (wakeT <= 0) { sleep(); canvas.parentElement?.classList.remove('awake'); } }
      draw();
    }
    requestAnimationFrame(loop);
  };
  canvas.addEventListener('click', () => {
    w.mode = 'wander'; w.orbit = null; w.happy = 2.2; w.surprise = 0.5; w.blush = Math.min(1, w.blush + 0.15); wakeT = 3.5;
    canvas.parentElement?.classList.add('awake');
    sfx.boop(); buzz(10);
  });
  const api = { start() { if (!run) { run = true; last = performance.now(); requestAnimationFrame(loop); } }, stop() { run = false; } };
  draw(); api.start();
  return api;
}

// ── inside the safe and the suitcase ──────────────────────
function keptArt(e) {
  const p = e.payload || {};
  switch (e.kind) {
    case 'note': return h('div.k-card', { style: { background: PAPERS[p.paper] || '#fff' } }, (p.text || '').slice(0, 70));
    case 'photo': return h('div.k-pol', h('img', { src: p.thumb, alt: '' }));
    case 'doodle': { const c = h('canvas', { width: 128, height: 128 }); const x = c.getContext('2d'); x.scale(2, 2); renderStrokes(x, p.strokes || [], 64, 1); return h('div.k-frame', c); }
    case 'trinket': return h('div.k-thing', trinketCanvas(p.what, 60, p.text));
    case 'whisper': return h('div.k-emo', '🐚');
    case 'wiggle': return h('div.k-emo', '🎶');
  }
  return null;
}
function cell(app, e, onChange) {
  const p = e.payload || {};
  let art, label, sub = '', tone = '';
  if (e.kind === 'later') {
    const left = p.mode === 'date' ? daysUntil(app, p.on) : 0;
    if (e.opened_at) { art = html(envelopeSVG(p.mode === 'when' ? p.paper : 'white', { open: true, w: 74 })); label = p.mode === 'when' ? `when ${p.label}` : `time capsule`; sub = `opened ${prettyDay(app.dayOf(e.opened_at))}`; }
    else if (p.mode === 'when') { art = html(envelopeSVG(p.paper, { w: 78 })); label = `when ${p.label}`; sub = `left ${ago(e.created_at)}`; }
    else if (left <= 0) { art = html(parcelSVG({ ready: true, w: 72 })); label = 'ready to open'; sub = dayLabel(p.on); tone = '.ready'; }
    else { art = html(parcelSVG({ w: 72 })); label = dayLabel(p.on); sub = `${left} day${left > 1 ? 's' : ''} to go`; }
  } else {
    art = keptArt(e); if (!art) return null;
    label = e.kind === 'trinket' ? (TRINKETS[p.what] || 'found thing').replace(/^an? /, '') : { note: 'a note', photo: 'a polaroid', doodle: 'a doodle', whisper: 'a whisper', wiggle: p.label || 'a wiggle' }[e.kind];
    sub = `kept · ${ago(e.created_at)}`;
  }
  return h(`button.cell${tone}`, { type: 'button', onclick: () => { buzz(8); if (e.kind === 'later') openLater(app, e, onChange); else openItem(app, app.asItem(e)); } },
    h('div.cell-art', art), h('b', label), h('span', sub));
}

function safeSheet(app, view, onChange) {
  const them = app.them()?.name || 'them';
  const grid = h('div.cells');
  const intro = h('p.small.muted');
  const render = () => {
    const me = app.slot();
    const list = [...app.S.shelf.values()].filter((e) => e.kind === 'later' && !e.opened_at && (view === 'from' ? e.from_slot === me : e.from_slot !== me));
    const ready = (e) => e.payload?.mode === 'date' && daysUntil(app, e.payload.on) <= 0;
    list.sort((a, b) => (ready(b) - ready(a)) || ((a.payload.mode === 'date') - (b.payload.mode === 'date')) || (a.payload.mode === 'date' ? (a.payload.on > b.payload.on ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1)));
    intro.textContent = view === 'from'
      ? `Sealed and waiting in ${them}'s safe. Once ${them} opens one, it moves to the suitcase.`
      : `${them} left these for later. Open one when it's true. After that it lives in the suitcase.`;
    grid.replaceChildren(...(list.length ? list.map((e) => cell(app, e, () => { render(); onChange?.(); })) : [h('p.cells-empty', view === 'from' ? `Nothing waiting for ${them} right now.` : `The safe is empty. When ${them} leaves you something for later, it's locked in here.`)]));
  };
  render();
  return sheet(view === 'from' ? `${them}'s safe` : 'The safe', [
    h('div.later-art', { html: safeSVG({ open: true, w: 150 }) }),
    intro, grid,
    view === 'from' ? btn(`Leave something for ${them}`, () => leaveSheet(app), 'ghost wide') : null,
  ].filter(Boolean), { tall: true, quiet: true });
}

function archiveSheet(app, view, onChange) {
  const them = app.them()?.name || 'them';
  const me = app.slot();
  const ours = (e) => (view === 'from' ? e.from_slot === me : e.from_slot !== me);
  const all = [...app.S.shelf.values()];
  const letters = all.filter((e) => e.kind === 'later' && e.opened_at && ours(e)).sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1));
  const kept = all.filter((e) => e.kept && e.kind !== 'later' && ours(e)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const cities = [app.me()?.place?.city, app.them()?.place?.city].map(cityCode);
  const section = (title, list) => (list.length ? [h('h3', title), h('div.cells', list.map((e) => cell(app, e, onChange)).filter(Boolean))] : []);
  return sheet(view === 'from' ? `${them} opened` : 'Archive', [
    h('div.later-art', { html: suitcaseSVG({ a: cities[0], b: cities[1], w: 150 }) }),
    ...(letters.length || kept.length
      ? [...section(view === 'from' ? 'Letters and capsules' : 'Opened', letters), ...section(view === 'from' ? `${them} kept` : 'Kept from the pocket', kept)]
      : [h('p.cells-empty', view === 'from' ? `${them} hasn't opened anything yet.` : 'Nothing in here yet. Everything you open from the safe, and everything you keep from the pocket, ends up in this suitcase.')]),
  ], { tall: true, quiet: true });
}

// ── opening something from the shelf ───────────────────────
const contents = new Map();
async function inside(app, e) {
  if (contents.has(e.id)) return contents.get(e.id);
  const c = await app.backend.unseal(e.id);
  contents.set(e.id, c);
  return c;
}
function letter(c) {
  const b = c?.body || {};
  return [
    c?.photo || b.thumb ? h('div.polaroid', h('div.polaroid-img', h('img', { src: c.photo || b.thumb, alt: '' })), b.caption ? h('p.handwriting.caption', b.caption) : null) : null,
    b.text ? h('div.paper-card.read', { style: { background: PAPERS[b.paper] || PAPERS.white } }, h('p.handwriting', b.text)) : null,
  ].filter(Boolean);
}

export function openLater(app, e, onChange) {
  const p = e.payload || {}, mine = e.from_slot === app.slot();
  const them = app.them()?.name || 'them';
  const title = p.mode === 'when' ? `Open when ${p.label}` : daysUntil(app, p.on) > 0 ? `Opens ${dayLabel(p.on)}` : `Time capsule · ${dayLabel(p.on)}`;
  const art = h('div.later-art', { html: p.mode === 'when' ? envelopeSVG(p.paper, { open: !!e.opened_at, w: 170 }) : parcelSVG({ ready: daysUntil(app, p.on) <= 0, w: 160 }) });
  const body = h('div.later-body');
  const from = mine ? `You left this for ${them} · ${prettyDay(app.dayOf(e.created_at))}` : `From ${them} · left ${prettyDay(app.dayOf(e.created_at))}`;
  const target = { to: e.id, about: p.mode === 'when' ? 'envelope' : 'time capsule' };
  const s = sheet(title, [art, body, h('p.meta', from)], { quiet: true });

  const reveal = async (animate) => {
    try {
      const c = await inside(app, e);
      if (animate) { art.innerHTML = p.mode === 'when' ? envelopeSVG(p.paper, { open: true, w: 170 }) : envelopeSVG('white', { open: true, w: 170 }); art.classList.add('pop'); buzz([15, 40, 15]); }
      if (!mine && c.opened_at && !e.opened_at) { e.opened_at = c.opened_at; app.shelfChanged(e); onChange?.(); app.backend.nudge('unsealed', { mode: p.mode, label: p.label || null }); }
      body.replaceChildren(...letter(c), mine ? theirReactions(app, target) : reactRow(app, target));
    } catch (err) {
      body.replaceChildren(h('p.small.muted', /not_yet/.test(err.message) ? 'Not yet. Patience, gusano.' : 'Couldn\'t open it. Try again.'));
    }
  };

  if (mine) {
    const status = e.opened_at ? `${them} opened it ${ago(e.opened_at)}.` : p.mode === 'date' ? `Locked until ${longDay(p.on)}.` : `Sealed. ${them} hasn't opened it yet.`;
    body.replaceChildren(h('p.small.muted.center', status), btn('Peek at what you wrote', () => reveal(false), 'ghost wide'));
  } else if (e.opened_at) {
    reveal(false);
  } else if (p.mode === 'date' && daysUntil(app, p.on) > 0) {
    const n = daysUntil(app, p.on);
    body.replaceChildren(h('p.later-count', h('b', String(n)), ` day${n > 1 ? 's' : ''} to go`), h('p.small.muted.center', `Wrapped up until ${longDay(p.on)}. ${them} made sure you can't peek.`));
  } else {
    body.replaceChildren(
      h('p.small.muted.center', p.mode === 'when' ? 'Only if it\'s true right now.' : 'The day is here.'),
      btn(p.mode === 'when' ? 'Open it' : 'Unwrap it', (ev) => { ev.currentTarget.disabled = true; reveal(true); }, 'primary wide'));
  }
  return s;
}

// ── leaving something for later ─────────────────────────────
export function leaveSheet(app, { mode = 'when' } = {}) {
  const them = app.them()?.name || 'them';
  if (!app.them()) return toast('Waiting for your person to crawl in.');
  let m = mode, label = WHEN_PRESETS[0], paper = 'rosa', shot = null;
  const today = app.today();
  const addDays = (n) => new Date(Date.parse(today + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  let on = addDays(30);

  const preview = h('div.later-art.small');
  const drawPreview = () => {
    preview.innerHTML = m === 'when' ? envelopeSVG(paper, { w: 120 }) : parcelSVG({ w: 112 });
    preview.append(tag(m === 'when' ? `when ${label || '…'}` : dayLabel(on)));
  };
  const custom = h('input', { placeholder: 'Or write your own…', maxLength: 50 });
  const chips = h('div.chips', WHEN_PRESETS.map((t, i) => h(`button.chip${i === 0 ? '.on' : ''}`, { type: 'button', onclick: (ev) => { label = t; custom.value = ''; [...chips.children].forEach((b) => b.classList.remove('on')); ev.currentTarget.classList.add('on'); drawPreview(); } }, t)));
  custom.addEventListener('input', () => { label = custom.value.trim().replace(/^open when\s*/i, ''); [...chips.children].forEach((b) => b.classList.remove('on')); drawPreview(); });
  const whenBox = h('div.field', h('span.field-label', 'Open when…'), chips, custom);

  const dateIn = h('input', { type: 'date', min: addDays(1), value: on });
  dateIn.addEventListener('change', () => { if (dateIn.value) { on = dateIn.value; drawPreview(); } });
  const quick = [['In a week', addDays(7)], ['In a month', addDays(30)], ['In a year', addDays(365)]];
  const reunion = app.S.hole?.reunion_on;
  if (reunion && reunion > today) quick.unshift(['Our next reunion', String(reunion).slice(0, 10)]);
  const ny = `${+today.slice(0, 4) + 1}-01-01`; quick.push(['New Year', ny]);
  const dateChips = h('div.chips', quick.map(([t, d]) => h('button.chip', { type: 'button', onclick: () => { on = d; dateIn.value = d; drawPreview(); } }, t)));
  const dateBox = h('div.field', { hidden: true }, h('span.field-label', 'It opens on'), dateIn, dateChips);

  const ta = h('textarea.handwriting', { rows: 5, maxLength: 1000, placeholder: `Write ${them} something for that moment…` });
  const card = h('div.paper-card', { style: { background: PAPERS[paper] } }, ta);
  const papers = segmented({ rosa: 'Rosa', celeste: 'Celeste', limon: 'Limón', white: 'White' }, paper, (k) => { paper = k; card.style.background = PAPERS[k]; drawPreview(); });
  const photoBox = h('div.later-photo');
  const caption = h('input', { placeholder: 'A line on the polaroid', maxLength: 60, hidden: true });
  const pick = (capture) => {
    const inp = h('input', { type: 'file', accept: 'image/*' });
    if (capture) inp.setAttribute('capture', 'environment');
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      try { shot = await photoFromFile(f); photoBox.replaceChildren(h('div.polaroid', h('div.polaroid-img', h('img', { src: shot.full, alt: '' }))), btn('Remove photo', () => { shot = null; photoBox.replaceChildren(); caption.hidden = true; }, 'ghost small')); caption.hidden = false; sfx.pop(); } catch { toast('Couldn\'t read that photo.'); }
    };
    inp.click();
  };

  const seal = btn('Seal it', async (ev) => {
    const text = ta.value.trim();
    if (m === 'when' && (label || '').length < 2) return toast('Pick when they should open it.');
    if (m === 'date' && !(on > today)) return toast('Pick a day after today.');
    if (!text && !shot) return toast('Write something or add a photo.');
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Sealing…';
    try {
      const payload = { mode: m, label: m === 'when' ? label : null, on: m === 'date' ? on : null, paper };
      const body = { text: text || null, paper, thumb: shot?.thumb || null, caption: caption.value.trim() || null };
      const e = await app.backend.seal(payload, body, shot?.full || null, shot ? 'image/jpeg' : null);
      app.shelfChanged(e);
      app.backend.nudge('later', { mode: m, label: payload.label, when: m === 'date' ? app.whenDay(on) : null });
      sfx.chime(); buzz([15, 40, 15]);
      toast(m === 'when' ? `Sealed. It's on ${them}'s shelf.` : `Wrapped. ${them} can open it ${app.whenDay(on)}.`, { tone: 'love' });
      s.close();
    } catch (err) {
      b.disabled = false; b.textContent = 'Seal it';
      toast(/too_big/.test(err.message) ? 'Too big. Try a shorter note or another photo.' : /bad_date/.test(err.message) ? 'Pick a day after today.' : 'Couldn\'t seal it. Try again.');
    }
  }, 'primary wide');

  const modes = segmented({ when: 'Open when…', date: 'Opens on a date' }, m, (k) => { m = k; whenBox.hidden = k !== 'when'; dateBox.hidden = k !== 'date'; papers.hidden = k !== 'when'; drawPreview(); });
  const s = sheet(`For ${them}, for later`, [
    modes, preview, whenBox, dateBox,
    papers, card,
    h('div.row', btn([icon('cam'), ' Camera'], () => pick(true), 'ghost'), btn('Add a photo', () => pick(false), 'ghost')),
    photoBox, caption,
    seal,
  ]);
  drawPreview();
  if (m === 'date') { whenBox.hidden = true; dateBox.hidden = false; papers.hidden = true; }
  return s;
}
