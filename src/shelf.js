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

  function items() {
    const me = app.slot();
    const all = [...app.S.shelf.values()];
    const later = all.filter((e) => e.kind === 'later');
    const isReady = (e) => e.payload?.mode === 'date' && e.payload.on && daysUntil(app, e.payload.on) <= 0;
    if (view === 'for') {
      const theirs = later.filter((e) => e.from_slot !== me);
      return [
        ['Open when…', theirs.filter((e) => e.payload?.mode === 'when').sort((a, b) => (!!a.opened_at - !!b.opened_at) || (a.created_at < b.created_at ? 1 : -1))],
        ['Time capsules', theirs.filter((e) => e.payload?.mode === 'date').sort((a, b) => (!!a.opened_at - !!b.opened_at) || (isReady(b) - isReady(a)) || (a.payload.on > b.payload.on ? 1 : -1))],
        ['Kept', all.filter((e) => e.kept && e.kind !== 'later' && e.from_slot !== me)],
      ];
    }
    const mine = later.filter((e) => e.from_slot === me);
    const them = app.them()?.name || 'them';
    return [
      [`Waiting for ${them}`, mine.filter((e) => !e.opened_at).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))],
      [`${them} opened`, mine.filter((e) => e.opened_at).sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1))],
      [`${them} kept`, all.filter((e) => e.kept && e.kind !== 'later' && e.from_slot === me)],
    ];
  }

  function thing(e) {
    const p = e.payload || {}, mine = e.from_slot === app.slot();
    const rot = ((e.id * 53) % 9) - 4;
    let art, label = null, cls = '';
    if (e.kind === 'later' && p.mode === 'when') {
      art = html(envelopeSVG(p.paper, { open: !!e.opened_at }));
      label = tag(mine && view === 'from' ? `when ${p.label}` : p.label, e.opened_at ? 'dim' : '');
      cls = e.opened_at ? '.opened' : '.sealed';
    } else if (e.kind === 'later') {
      const left = daysUntil(app, p.on);
      if (e.opened_at) { art = html(envelopeSVG('white', { open: true })); label = tag(dayLabel(p.on), 'dim'); cls = '.opened'; }
      else if (left <= 0) { art = html(parcelSVG({ ready: true })); label = tag(mine ? 'ready for them' : 'open me', 'pink'); cls = '.ready'; }
      else { art = html(parcelSVG()); label = tag(`${dayLabel(p.on)} · ${left}d`); cls = '.locked'; }
    } else {
      switch (e.kind) {
        case 'note': art = h('div.k-card', { style: { background: PAPERS[p.paper] || '#fff' } }, (p.text || '').slice(0, 80)); break;
        case 'photo': art = h('div.k-pol', h('img', { src: p.thumb, alt: '' })); break;
        case 'doodle': { const c = h('canvas', { width: 128, height: 128 }); const x = c.getContext('2d'); x.scale(2, 2); renderStrokes(x, p.strokes || [], 64, 1); art = h('div.k-frame', c); break; }
        case 'trinket': art = h('div.k-thing', trinketCanvas(p.what, 66, p.text)); break;
        case 'whisper': art = h('div.k-emo', '🐚'); break;
        case 'wiggle': art = h('div.k-emo', '🎶'); break;
        default: return null;
      }
      label = tag(e.kind === 'trinket' ? (TRINKETS[p.what] || 'found thing').replace(/^an? /, '') : ago(e.created_at), 'dim');
    }
    return h(`button.thing${cls}`, { type: 'button', style: { '--r': `${rot}deg` }, onclick: () => tap(e) }, art, label);
  }

  function tap(e) {
    sfx.paper(); buzz(8);
    if (e.kind === 'later') return openLater(app, e, () => render());
    openItem(app, app.asItem(e));
  }

  function render() {
    const them = app.them()?.name || 'them';
    const groups = items().filter(([, list]) => list.length);
    const total = groups.reduce((a, [, l]) => a + l.length, 0);
    const sealedForMe = [...app.S.shelf.values()].filter((e) => e.kind === 'later' && e.from_slot !== app.slot() && !e.opened_at).length;
    meta.textContent = view === 'for'
      ? (sealedForMe ? `${sealedForMe} SEALED FOR YOU` : 'YOUR SHELF')
      : `WHAT YOU LEFT ${them.toUpperCase()}`;
    const out = [decor()];
    for (const [title, list] of groups) {
      out.push(h('h3.shelf-title', title));
      for (let i = 0; i < list.length; i += 3) out.push(h('div.shelf-row', list.slice(i, i + 3).map(thing).filter(Boolean)), plank());
    }
    if (!total) {
      out.push(h('div.shelf-empty',
        h('p', view === 'for' ? `Nothing on your shelf yet. When ${them} leaves you something for later, it lands here. Things you keep from the pocket live here too.` : `Leave ${them} an envelope for a bad day, or a photo that only opens on a date you pick.`),
        btn(`Leave something for ${them}`, () => leaveSheet(app), 'primary')));
    } else if (view === 'from') {
      out.push(h('div.shelf-empty', btn(`Leave something for ${them}`, () => leaveSheet(app), 'ghost')));
    }
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
  const s = sheet(title, [art, body, h('p.meta', from)]);

  const reveal = async (animate) => {
    try {
      const c = await inside(app, e);
      if (animate) { art.innerHTML = p.mode === 'when' ? envelopeSVG(p.paper, { open: true, w: 170 }) : envelopeSVG('white', { open: true, w: 170 }); art.classList.add('pop'); sfx.chime(); buzz([15, 40, 15]); }
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
