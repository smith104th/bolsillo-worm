// The soil: everything you've grown, layer by layer. Newest on top, older deeper down.
// Opened things settle here a few days after they leave the pocket, next to every
// question you both answered.
import { h, prettyDay, seeded } from './util.js';
import { sheet, btn, toast } from './ui.js';
import { PAPERS, TRINKETS, renderStrokes, mixHex } from './draw.js';
import { openItem, trinketCanvas } from './compose.js';
import { sfx } from './feel.js';
import { zineSheet } from './zine.js';

export const SOIL = ['#EDE0CA', '#E4D2B5', '#DAC39F', '#CFB389', '#C5A478', '#BA956A', '#AF885E', '#A37B54'];
const WAVES = [
  'M0 16V9C40 3 80 14 130 9S210 2 260 8S350 15 400 7V16Z',
  'M0 16V7C50 13 90 3 150 8S240 14 290 8S370 2 400 9V16Z',
  'M0 16V10C30 5 70 5 110 10S190 15 240 9S330 3 400 8V16Z',
];
const waveURL = (i) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 16' preserveAspectRatio='none'><path d='${WAVES[i % WAVES.length]}' fill='black'/></svg>`)}")`;

let grainURL = null;
export function soilGrain() {
  if (grainURL) return grainURL;
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d'); const r = seeded(42);
  for (let i = 0; i < 900; i++) {
    const dark = r() < 0.7;
    x.fillStyle = dark ? `rgba(70,45,20,${0.05 + r() * 0.12})` : `rgba(255,250,240,${0.1 + r() * 0.2})`;
    const s = r() < 0.93 ? 1 + r() * 1.4 : 2.4 + r() * 2.4;
    x.beginPath(); x.ellipse(r() * 160, r() * 160, s, s * (0.6 + r() * 0.5), r() * 3, 0, 7); x.fill();
  }
  grainURL = `url(${c.toDataURL('image/png')})`;
  return grainURL;
}

const monthKey = (day) => day.slice(0, 7);
const monthName = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthsBetween = (a, b) => (+a.slice(0, 4) - +b.slice(0, 4)) * 12 + (+a.slice(5, 7) - +b.slice(5, 7));

// one find in the soil: a note, a polaroid, a doodle, a trinket, a whisper, a wiggle
export function findEl(app, e) {
  const p = e.payload || {};
  const rot = ((e.id * 37) % 9) - 4;
  const who = h('span.who', e.from_slot === app.slot() ? 'from you' : `from ${app.them()?.name || 'them'}`);
  let art;
  switch (e.kind) {
    case 'note': art = h('div.f-paper', { style: { background: PAPERS[p.paper] || PAPERS.white, transform: `rotate(${rot}deg)` } }, p.text); break;
    case 'photo': art = h('div.f-pol', { style: { transform: `rotate(${rot}deg)` } }, h('img', { src: p.thumb, alt: '' }), p.caption ? h('span', p.caption) : null); break;
    case 'doodle': {
      const c = h('canvas', { width: 160, height: 160 });
      const x = c.getContext('2d'); x.scale(2, 2); renderStrokes(x, p.strokes || [], 80, 1);
      art = h('div.f-paper.doodle', { style: { transform: `rotate(${rot}deg)` } }, c); break;
    }
    case 'trinket': art = h('div.f-thing', trinketCanvas(p.what, 56, p.text)); break;
    case 'whisper': art = h('div.f-pebble', h('b', '🐚'), h('span', `${Math.round(p.dur || 0)}s`)); break;
    case 'wiggle': art = h('div.f-pebble', h('b', '〰️'), h('span', p.label || 'wiggle')); break;
    default: return null;
  }
  return h('button.find', { type: 'button', onclick: () => openItem(app, app.asItem(e)), 'aria-label': `${e.kind} ${who.textContent}` }, art, who);
}

export async function viewPhoto(app, mediaId, thumb, title = 'Photo of the day') {
  const img = h('img', { src: thumb, alt: '' });
  sheet(title, h('div.polaroid', h('div.polaroid-img', img)));
  if (mediaId) try { const m = await app.backend.media(mediaId); if (m?.data) img.src = m.data; } catch { /* thumb is fine */ }
}

export function soilSheet(app) {
  const them = app.them()?.name || 'Them';
  const strata = h('div.soil', { style: { '--grain': soilGrain() } });
  const s = sheet('The soil', [
    h('p.small.muted', `Everything you two have grown. Opened things sink in here a few days after they leave the pocket, next to every question you both answered.`),
    h('div.row', btn('🌱 Plant a question', () => plantSheet(app), 'ghost'), btn('Print our year', () => zineSheet(app), 'primary')),
    strata,
  ], { tall: true, className: 'soil-card' });
  strata.append(h('div.stratum', { style: { '--soil': SOIL[0], '--wave': waveURL(0) } }, h('p.small', 'Digging…')));

  let drops = [], dailies = [], more = false;
  const PAGE = 80;
  const load = async (before = null) => {
    const [d, a] = await Promise.all([dailies.length ? dailies : app.backend.dailies(400), app.backend.archive({ before, limit: PAGE })]);
    dailies = d; drops = drops.concat(a); more = a.length === PAGE;
  };
  const render = () => {
    const today = app.today();
    const horizon = more && drops.length ? app.dayOf(drops[drops.length - 1].created_at) : '';
    const days = new Map();
    const day = (k) => { if (!days.has(k)) days.set(k, { day: k, daily: null, finds: [] }); return days.get(k); };
    for (const r of dailies) {
      const k = String(r.day).slice(0, 10);
      if (k >= today || k < horizon) continue;
      if (r.my_answer || r.their_answer || r.my_thumb || r.their_thumb) day(k).daily = r;
    }
    for (const e of drops) if (app.composted(e)) day(app.dayOf(e.created_at)).finds.push(e);
    const list = [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));

    const out = [];
    let lastMonth = null, i = 0;
    const tone = (k, j) => mixHex(SOIL[Math.min(SOIL.length - 1, Math.max(0, monthsBetween(today, k) * 2 + (j % 2)))], '#FFFFFF', (j % 3) * 0.03);
    for (const L of list) {
      if (monthKey(L.day) !== lastMonth) {
        if (lastMonth) out.push(h('div.stratum.month', { style: { '--soil': tone(L.day, 0), '--wave': waveURL(i++) } }, h('h4', monthName(L.day)), h('span.mono.tiny', 'deeper')));
        lastMonth = monthKey(L.day);
      }
      out.push(stratum(app, L, them, tone(L.day, i), waveURL(i++)));
    }
    if (!list.length) {
      out.push(h('div.stratum.empty', { style: { '--soil': SOIL[0], '--wave': waveURL(0) } },
        h('p.q', 'Nothing has settled yet.'),
        h('p.small', 'Answer today\'s question together, open what lands in your pocket, and a few days later it all sinks in here, layer by layer.')));
    }
    if (more) {
      out.push(h('div.stratum.bed', { style: { '--soil': SOIL[SOIL.length - 1], '--wave': waveURL(i++) } },
        btn('Dig deeper', async (e) => {
          e.currentTarget.disabled = true; e.currentTarget.textContent = 'Digging…';
          try { await load(drops[drops.length - 1].created_at); sfx.tick(); render(); } catch { toast('Couldn\'t dig. Try again.'); e.currentTarget.disabled = false; }
        }, 'ghost')));
    } else if (list.length) {
      const since = app.S.hole?.created_at ? prettyDay(app.dayOf(app.S.hole.created_at)) : '';
      out.push(h('div.stratum.bed', { style: { '--soil': SOIL[SOIL.length - 1], '--wave': waveURL(i++) } }, h('span.mono.tiny', 'BEDROCK'), h('p.small', `Where you started${since ? `, ${since}` : ''}.`)));
    }
    strata.replaceChildren(...out);
  };
  load().then(render).catch(() => { strata.replaceChildren(h('div.stratum', { style: { '--soil': SOIL[0], '--wave': waveURL(0) } }, h('p', 'Couldn\'t reach the soil. Try again.'))); });
  app.onDaily(() => { if (!s.el.isConnected) return false; render(); });
  return s;
}

function stratum(app, L, them, color, wave) {
  const r = L.daily;
  const q = app.questionFor(L.day);
  const kids = [h('div.stratum-head', h('span.mono.tiny', prettyDay(L.day).toUpperCase()), q.by && r ? h('span.seed', q.mine ? '🌱 you planted this' : `🌱 ${q.by} planted this`) : null)];
  if (r) {
    if (r.my_answer || r.their_answer) {
      kids.push(h('p.q', q.q));
      kids.push(h('div.slips',
        r.my_answer ? h('div.slip', h('b', 'YOU'), h('p', r.my_answer)) : h('div.slip.faint', h('b', 'YOU'), h('p', 'No answer')),
        r.their_answer ? h('div.slip', h('b', them.toUpperCase()), h('p', r.their_answer)) : h('div.slip.faint', h('b', them.toUpperCase()), h('p', r.their_answered ? 'Buried. You never dug it up.' : 'No answer'))));
    }
  }
  const pics = [];
  if (r?.my_thumb) pics.push(h('button.find', { type: 'button', onclick: () => viewPhoto(app, r.my_photo, r.my_thumb) }, h('div.f-pol.day', h('img', { src: r.my_thumb, alt: '' })), h('span.who', 'your day')));
  if (r?.their_thumb) pics.push(h('button.find', { type: 'button', onclick: () => viewPhoto(app, r.their_photo, r.their_thumb) }, h('div.f-pol.day', h('img', { src: r.their_thumb, alt: '' })), h('span.who', `${them}'s day`)));
  const finds = [...pics, ...L.finds.map((e) => findEl(app, e)).filter(Boolean)];
  if (finds.length) kids.push(h('div.finds', finds));
  return h('div.stratum', { style: { '--soil': color, '--wave': wave } }, kids);
}

// ── planting a question for them
export function plantSheet(app) {
  const them = app.them()?.name || 'them';
  const ta = h('textarea', { rows: 3, maxLength: 200, placeholder: `Ask ${them} something…` });
  const count = h('span.small.muted', '0 / 200');
  ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / 200`; });
  const seeds = h('div.seeds');
  const renderSeeds = () => {
    const today = app.today();
    const mine = [...app.S.planted.values()].filter((p) => p.from_slot === app.slot() && String(p.day).slice(0, 10) > today).sort((a, b) => (a.day > b.day ? 1 : -1));
    seeds.replaceChildren(...(mine.length ? [h('h3', 'Your seeds'), ...mine.map((p) => h('div.seed-row',
      h('div', h('span.mono.tiny', `COMES UP ${app.whenDay(String(p.day).slice(0, 10)).toUpperCase()}`), h('p', p.question)),
      btn('Dig up', async (e) => {
        e.currentTarget.disabled = true;
        try { await app.backend.unplant(String(p.day).slice(0, 10)); await app.loadPlanted(); renderSeeds(); toast('Dug up.'); } catch { toast('Couldn\'t dig it up.'); e.currentTarget.disabled = false; }
      }, 'ghost small')))] : []));
  };
  const s = sheet('Plant a question', [
    h('p.small.muted', `It comes up as your question of the day on the next free day. ${them} won't see it until then, and you both answer it like any other.`),
    h('div.paper-card', { style: { background: '#FFFFFF' } }, ta),
    h('div.row.between', count, btn('Plant it', async (e) => {
      const q = ta.value.trim();
      if (q.length < 3) return ta.focus();
      const b = e.currentTarget; b.disabled = true;
      try {
        const day = String(await app.backend.plant(q)).slice(0, 10);
        app.backend.nudge('plant', { when: app.whenDay(day) });
        sfx.chime();
        toast(`Planted. It comes up ${app.whenDay(day)}.`, { tone: 'love' });
        ta.value = ''; count.textContent = '0 / 200';
        await app.loadPlanted(); renderSeeds();
      } catch (err) {
        toast(/too_many/.test(err.message) ? 'Seven seeds in the ground already. Let one come up first.' : 'Couldn\'t plant it. Try again.');
      }
      b.disabled = false;
    }, 'primary')),
    seeds,
  ]);
  renderSeeds();
  setTimeout(() => ta.focus(), 350);
  return s;
}

