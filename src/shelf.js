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
const dayLabel = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const daysUntil = (app, d) => Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(app.today() + 'T00:00:00Z')) / 86400000);
const html = (s) => h('span.art', { html: s });

// ── drawings ───────────────────────────────────────────────
const tag = (text, tone = '') => h(`span.tag${tone ? '.' + tone : ''}`, text);

// ── icons: clean, lit, no outlines, so they sit with the system UI ─────────
let uid = 0;
const TINTS = {
  rosa: ['#FFF1F5', '#F9D3DE', '#E9B3C3'], celeste: ['#F2F8FF', '#D4E6F8', '#B5CDE6'],
  limon: ['#FFFCE6', '#F6EDB2', '#E3D88E'], white: ['#FFFFFF', '#F2F3F6', '#D9DCE3'],
};
const shadowDef = (id) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="175%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#1C1C1E" flood-opacity=".17"/></filter>`;
export function envelopeIcon(paper = 'white', { open = false, size = 124 } = {}) {
  const [hi, base, shade] = TINTS[paper] || TINTS.white, id = `ic${++uid}`;
  const defs = `<defs>
    <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${base}"/></linearGradient>
    <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="${shade}"/></linearGradient>
    <radialGradient id="${id}s" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FF6B63"/><stop offset="1" stop-color="#C9001B"/></radialGradient>
    <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F4F4F7"/></linearGradient>
    ${shadowDef(`${id}d`)}</defs>`;
  if (!open) {
    return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${defs}<g filter="url(#${id}d)">
      <rect x="12" y="30" width="96" height="64" rx="9" fill="url(#${id}p)"/>
      <path d="M15 90 L52 62 M105 90 L68 62" stroke="${shade}" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M12.5 37 Q12.5 30 19.5 30 H100.5 Q107.5 30 107.5 37 L64.5 66.5 Q60 69.5 55.5 66.5 Z" fill="url(#${id}f)"/>
      <circle cx="60" cy="64.5" r="8.6" fill="url(#${id}s)"/><ellipse cx="57.3" cy="61.6" rx="2.8" ry="1.9" fill="#fff" opacity=".55"/>
    </g></svg>`;
  }
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${defs}<g filter="url(#${id}d)">
    <rect x="12" y="40" width="96" height="62" rx="9" fill="${shade}"/>
    <path d="M12.5 46 L60 16 L107.5 46 Z" fill="url(#${id}f)"/>
    <rect x="22" y="22" width="76" height="58" rx="5" fill="url(#${id}l)"/>
    <path d="M32 36h46M32 46h56M32 56h38" stroke="#D1D1D6" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M12 52 L60 78 L108 52 V93 Q108 102 99 102 H21 Q12 102 12 93 Z" fill="url(#${id}p)"/>
  </g></svg>`;
}
export function boxIcon({ open = false, size = 120 } = {}) {
  const id = `ic${++uid}`;
  const g = (n, a, b) => `<linearGradient id="${id}${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const defs = `<defs>${g('t', '#F2D7AE', '#E3BF8C')}${g('a', '#D9AC74', '#C8975D')}${g('b', '#BC8850', '#A87642')}${g('i', '#7B5532', '#5C3E22')}${shadowDef(`${id}d`)}</defs>`;
  if (!open) {
    return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${defs}<g filter="url(#${id}d)">
      <path d="M60 22 L101 40 L60 58 L19 40 Z" fill="url(#${id}t)"/>
      <path d="M19 40 L60 58 L60 101 L19 83 Z" fill="url(#${id}a)"/>
      <path d="M60 58 L101 40 L101 83 L60 101 Z" fill="url(#${id}b)"/>
      <path d="M36 32.6 L44 29 L84.6 47 L76.6 50.6 Z" fill="#F8EBD2" opacity=".92"/>
      <path d="M76.6 50.6 L84.6 47 L84.6 89.6 L76.6 93.2 Z" fill="#EEDBB8" opacity=".9"/>
      <path d="M19 40 L60 58 L101 40" fill="none" stroke="#FFF6E6" stroke-width="1" opacity=".6"/>
    </g></svg>`;
  }
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${defs}<g filter="url(#${id}d)">
    <path d="M19 44 L60 26 L56 9 L15 27 Z" fill="url(#${id}a)"/>
    <path d="M60 26 L101 44 L105 27 L64 9 Z" fill="url(#${id}b)"/>
    <path d="M60 26 L101 44 L60 62 L19 44 Z" fill="url(#${id}i)"/>
    <path d="M19 44 L60 62 L60 104 L19 86 Z" fill="url(#${id}a)"/>
    <path d="M60 62 L101 44 L101 86 L60 104 Z" fill="url(#${id}b)"/>
    <path d="M19 44 L60 62 L51 76 L10 58 Z" fill="url(#${id}t)"/>
    <path d="M60 62 L101 44 L110 58 L69 76 Z" fill="url(#${id}t)"/>
  </g></svg>`;
}
// SF-style glyph tiles, like a small app icon
const GLYPHS = {
  wave: '<path d="M14 24v0M20 18v12M26 12v24M32 16v16M38 21v6" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>',
  sine: '<path d="M10 24c3-8 6-8 9 0s6 8 9 0 6-8 9 0 3 4 4 4" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>',
  lock: '<rect x="15" y="21" width="18" height="14" rx="3.5" fill="#fff"/><path d="M18.5 21v-4a5.5 5.5 0 0 1 11 0v4" fill="none" stroke="#fff" stroke-width="3"/>',
};
export function glyphTile(kind, [a, b], size = 92) {
  const id = `ic${++uid}`;
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>${shadowDef(`${id}d`)}</defs>
    <g filter="url(#${id}d)"><rect x="2" y="2" width="44" height="44" rx="11" fill="url(#${id})"/></g>${GLYPHS[kind]}</svg>`;
}
const TRINKET_EMOJI = { pebble: '🪨', leaf: '🍂', coin: '🪙', ticket: '🎟️', button: '🔘', matchbook: '🔥', flower: '🌼', bottlecap: '🍾', feather: '🪶', candy: '🍬', key: '🗝️' };
function keptIcon(e) {
  const p = e.payload || {};
  switch (e.kind) {
    case 'photo': return h('div.k2.photo', h('img', { src: p.thumb, alt: '' }));
    case 'note': return h('div.k2.note', { style: { background: PAPERS[p.paper] || '#fff' } }, (p.text || '').slice(0, 90));
    case 'doodle': { const c = h('canvas', { width: 168, height: 168 }); const x = c.getContext('2d'); x.scale(2, 2); renderStrokes(x, p.strokes || [], 84, 1); return h('div.k2.doodle', c); }
    case 'trinket': return h('div.k2.emoji', TRINKET_EMOJI[p.what] || '✨');
    case 'whisper': return html(glyphTile('wave', ['#FF6482', '#FF2D55']));
    case 'wiggle': return html(glyphTile('sine', ['#C779EB', '#AF52DE']));
  }
  return null;
}
const lockBadge = () => h('span.c-lock', { html: '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#1C1C1E"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#1C1C1E" stroke-width="2.2"/></svg>' });
const short = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 3600 ? 'now' : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

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
  let view = 'for', W = 0, H = 0, skyKey = null, roamer = null;
  const roamCv = h('canvas.roamer', { 'aria-label': 'Their worm, wandering' });
  const roamWrap = h('div.roam-wrap', roamCv);
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

  function render() {
    const them = app.them()?.name || 'them';
    const sealedForMe = list(app, 'for', 'when').length + list(app, 'for', 'date').length;
    meta.textContent = view === 'for' ? (sealedForMe ? `${sealedForMe} SEALED FOR YOU` : 'YOUR SHELF') : `WHAT YOU LEFT ${them.toUpperCase()}`;
    const bands = CATS.map((c) => {
      const items = list(app, view, c.key);
      const ready = c.key === 'date' && view === 'for' ? items.filter((e) => daysUntil(app, e.payload.on) <= 0).length : 0;
      return h('button.band', { type: 'button', style: { '--bg': c.bg, '--fg': c.fg }, onclick: () => categorySheet(app, view, c.key, () => render()) },
        h('span.band-name', c.name),
        h('span.band-side', ready ? h('span.band-ready', `${ready} ready`) : null, h('span.band-count', String(items.length))));
    });
    content.replaceChildren(decor(), h('div.bands', { style: { '--last': CATS[CATS.length - 1].bg } }, bands));
  }

  // their worm, loose in the open sky above the shelves
  function decor() {
    if (roamer) roamer.worm.setDesign(app.them()?.worm || {});
    else requestAnimationFrame(() => { if (!roamer && roamCv.isConnected) roamer = roam(roamCv, app.them()?.worm); });
    return roamWrap;
  }

  return {
    render, setSky,
    show() { render(); roamer?.start(); },
    hide() { roamer?.stop(); },
  };
}

// a worm wandering freely: same body and brain as in the pocket, just slower and calmer
function roam(canvas, design) {
  const x = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, bounds = null;
  const size = () => {
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || 170;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    bounds = { l: 12, r: W - 12, t: 6, b: H - 6 };
  };
  size();
  const R = 13;
  const w = new Worm(design || {}, { x: W * 0.62, y: H * 0.55, R, segs: 16, angle: Math.PI * 0.9 });
  w.speedBase = R * 2.8;
  for (let i = 0; i < 30; i++) w.update(1 / 60, { bounds, gx: 0, gy: 0 });
  let run = false, last = 0;
  const loop = (now) => {
    if (!run) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (canvas.clientWidth && Math.abs(canvas.clientWidth - W) > 1) size();
    w.update(dt, { bounds, gx: 0, gy: 0 });
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    w.draw(x);
    requestAnimationFrame(loop);
  };
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    if (w.hit(e.clientX - r.left, e.clientY - r.top, 2) < 0) return;
    w.happy = 2.4; w.squish = 1; w.dance = 0.6; w.danceAmp = R * 0.5; w.blush = Math.min(1, w.blush + 0.15);
    sfx.boop(); buzz(10);
  });
  const api = { worm: w, start() { if (!run) { run = true; last = performance.now(); requestAnimationFrame(loop); } }, stop() { run = false; } };
  api.start();
  return api;
}

// ── categories ──────────────────────────────────────────
export const SHELF_BOTTOM = '#FFC93C';
const CATS = [
  { key: 'when', name: 'Open when', bg: '#FFC8D7', fg: '#D90042' },
  { key: 'date', name: 'Time capsules', bg: '#0F7A4E', fg: '#FFD84A' },
  { key: 'kept', name: 'Kept', bg: '#A3E6EC', fg: '#1546A8' },
  { key: 'archive', name: 'Archive', bg: '#FFC93C', fg: '#0B0B0C' },
];
function list(app, view, key) {
  const me = app.slot();
  const ours = (e) => (view === 'from' ? e.from_slot === me : e.from_slot !== me);
  const all = [...app.S.shelf.values()].filter(ours);
  const ready = (e) => daysUntil(app, e.payload.on) <= 0;
  switch (key) {
    case 'when': return all.filter((e) => e.kind === 'later' && e.payload?.mode === 'when' && !e.opened_at).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    case 'date': return all.filter((e) => e.kind === 'later' && e.payload?.mode === 'date' && !e.opened_at).sort((a, b) => (ready(b) - ready(a)) || (a.payload.on > b.payload.on ? 1 : -1));
    case 'kept': return all.filter((e) => e.kept && e.kind !== 'later').sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    case 'archive': return all.filter((e) => e.kind === 'later' && e.opened_at).sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1));
  }
  return [];
}
const SUBS = {
  for: { when: (t) => `${t} left these for later. Open one when it's true.`, date: () => 'Photos and notes that only open on their day.', kept: () => 'What you kept from your pocket.', archive: () => 'Everything you have opened.' },
  from: { when: (t) => `Sealed on ${t}'s shelf until it's true.`, date: (t) => `Locked on ${t}'s shelf until their day.`, kept: (t) => `What ${t} kept from you.`, archive: (t) => `What ${t} has opened.` },
};
const EMPTY = {
  for: { when: (t) => `Nothing sealed for you yet. When ${t} leaves an "open when" letter, it waits here.`, date: (t) => `No time capsules yet. When ${t} locks a photo or note to a date, it waits here.`, kept: () => 'Nothing kept yet. Open something in your pocket and tap Keep it.', archive: () => 'Nothing opened yet. Letters and capsules move here once you open them.' },
  from: { when: (t) => `Nothing waiting for ${t}.`, date: (t) => `No time capsules waiting for ${t}.`, kept: (t) => `${t} hasn't kept anything yet.`, archive: (t) => `${t} hasn't opened anything yet.` },
};

function card(app, e, onChange) {
  const p = e.payload || {};
  let art, title, meta, tone = '', badge = null;
  if (e.kind === 'later' && p.mode === 'when') {
    art = html(envelopeIcon(p.paper, { open: !!e.opened_at }));
    title = cap(p.label); meta = e.opened_at ? dayLabel(app.dayOf(e.opened_at)) : short(e.created_at);
  } else if (e.kind === 'later') {
    const left = daysUntil(app, p.on);
    if (e.opened_at) { art = html(boxIcon({ open: true })); title = dayLabel(p.on); meta = 'Opened'; }
    else if (left <= 0) { art = html(boxIcon()); title = 'Ready to open'; meta = dayLabel(p.on); tone = '.red'; }
    else { art = html(boxIcon()); badge = lockBadge(); title = dayLabel(p.on); meta = `${left}d`; }
  } else {
    art = keptIcon(e); if (!art) return null;
    title = e.kind === 'trinket' ? cap((TRINKETS[p.what] || 'something').replace(/^an? /, '')) : { note: 'Note', photo: p.caption || 'Polaroid', doodle: 'Doodle', whisper: 'Whisper', wiggle: cap(p.label) || 'Wiggle' }[e.kind];
    meta = short(e.created_at);
  }
  return h('button.c-card', { type: 'button', onclick: () => { buzz(8); if (e.kind === 'later') openLater(app, e, onChange); else openItem(app, app.asItem(e)); } },
    h('div.c-icon', art, badge), h('div.c-foot', h('b', title), h(`span${tone}`, meta)));
}

function categorySheet(app, view, key, onChange) {
  const them = app.them()?.name || 'them';
  const c = CATS.find((x) => x.key === key);
  const grid = h('div.c-grid');
  const render = () => {
    const items = list(app, view, key);
    const cards = items.map((e) => card(app, e, () => { render(); onChange?.(); })).filter(Boolean);
    const add = view === 'from' && (key === 'when' || key === 'date')
      ? h('button.c-card.add', { type: 'button', onclick: () => leaveSheet(app, { mode: key }) }, h('div.c-icon', h('span.c-plus', '+')), h('div.c-foot', h('b', key === 'when' ? 'New letter' : 'New capsule'), h('span', `for ${them}`)))
      : null;
    grid.replaceChildren(...[...cards, add].filter(Boolean));
    if (!cards.length) grid.prepend(h('p.c-empty', EMPTY[view][key](them)));
  };
  render();
  return sheet(view === 'from' && key !== 'kept' && key !== 'archive' ? `${c.name} · for ${them}` : c.name, [h('p.c-sub', SUBS[view][key](them)), grid], { tall: true, quiet: true, className: 'cat-sheet' });
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
  const art = h('div.later-art', { html: p.mode === 'when' ? envelopeIcon(p.paper, { open: !!e.opened_at, size: 168 }) : boxIcon({ open: !!e.opened_at, size: 160 }) });
  const body = h('div.later-body');
  const from = mine ? `You left this for ${them} · ${prettyDay(app.dayOf(e.created_at))}` : `From ${them} · left ${prettyDay(app.dayOf(e.created_at))}`;
  const target = { to: e.id, about: p.mode === 'when' ? 'envelope' : 'time capsule' };
  const s = sheet(title, [art, body, h('p.meta', from)], { quiet: true });

  const reveal = async (animate) => {
    try {
      const c = await inside(app, e);
      if (animate) { art.innerHTML = p.mode === 'when' ? envelopeIcon(p.paper, { open: true, size: 168 }) : boxIcon({ open: true, size: 160 }); art.classList.add('pop'); buzz([15, 40, 15]); }
      if (!mine && c.opened_at && !e.opened_at) { e.opened_at = c.opened_at; app.shelfChanged(e); onChange?.(); app.backend.nudge('unsealed', { mode: p.mode, label: p.label || null }); }
      body.replaceChildren(...[...letter(c), mine ? theirReactions(app, target) : reactRow(app, target)].filter(Boolean));
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
    preview.innerHTML = m === 'when' ? envelopeIcon(paper, { size: 124 }) : boxIcon({ size: 120 });
    preview.append(h('span.preview-label', m === 'when' ? `Open when ${label || '…'}` : `Opens ${dayLabel(on)}`));
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
