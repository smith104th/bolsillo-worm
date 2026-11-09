// The paper slips: feed, drop, today, us, peek, settings, the jar.
import { h, ago, hoursSince, prettyDay, fmtDistance, store, dayNumber, isIOS, isStandalone, timeIn } from './util.js';
import { sheet, btn, icon, toast, field, segmented, confirmBox } from './ui.js';
import { FOODS, drawFood, TRINKETS } from './draw.js';
import { COLORS, PATTERNS, ACCESSORIES, inchesFor, lengthBlurb } from './worm.js';
import { composeNote, composeDoodle, composePhoto, composeWhisper, composeWiggle, composeTrinket, openItem, titleFor, trinketCanvas } from './compose.js';
import { wormPreview, fmtCode } from './onboarding.js';
import { questionFor } from './questions.js';
import { sfx } from './feel.js';

const KISS_NAMES = ['', 'piquito', 'besito', 'beso', 'besote', 'BESAZO'];

function foodCanvas(kind, size = 54) {
  const c = h('canvas', { width: size * 2, height: size * 2, style: { width: size + 'px', height: size + 'px' } });
  const x = c.getContext('2d'); x.scale(2, 2); x.translate(size / 2, size / 2);
  x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = 3; x.shadowOffsetY = 2;
  drawFood(x, kind, size * 0.3);
  return c;
}

function careLine(label, iso, okH, badWord) {
  const hrs = hoursSince(iso);
  const tone = hrs > okH * 2 ? 'bad' : hrs > okH ? 'meh' : 'ok';
  return h(`div.care.${tone}`, h('span', label), h('span.mono', iso ? ago(iso) : 'never'), tone !== 'ok' ? h('span.tag', badWord) : null);
}

export function feedSheet(app) {
  const them = app.them(); const w = them?.worm || {};
  const s = sheet(`Tend to ${w.name || 'their worm'}`, [
    h('div.cares', careLine('Fed', them?.fed_at, 20, 'hungry'), careLine('Misted', them?.misted_at, 18, 'dry'), careLine('Petted', them?.petted_at, 12, 'lonely')),
    h('p.small.muted', 'Pick a crumb. It lands in your pocket and they get told what you fed them.'),
    h('div.foods', Object.entries(FOODS).map(([k, label]) => h('button.food', { type: 'button', onclick: () => { s.close(); app.feed(k); } }, foodCanvas(k), h('span', label.replace(/^(an?|a bit of|a bite of) /, ''))))),
    btn([icon('mist'), ' Mist them'], () => { s.close(); app.mist(); }, 'ghost wide'),
    h('p.small.muted.center', 'Tip: stroke the worm to pet it. Tap its head to boop.'),
  ]);
}

export function dropSheet(app) {
  const them = app.them()?.name || 'them';
  const tile = (ic, title, sub, fn) => h('button.tile', { type: 'button', onclick: () => { s.close(); setTimeout(() => fn(app), 180); } }, h('span.tile-ic', icon(ic)), h('b', title), h('span', sub));
  const s = sheet(`Into ${them}'s pocket`, h('div.tiles',
    tile('note', 'Note', 'folded paper', composeNote),
    tile('photo', 'Polaroid', 'a photo + a line', composePhoto),
    tile('whisper', 'Whisper', 'a voice note', composeWhisper),
    tile('doodle', 'Doodle', 'draw something', composeDoodle),
    tile('wiggle', 'Wiggle', 'a buzz rhythm', composeWiggle),
    tile('trinket', 'Found thing', 'a pebble, a ticket…', composeTrinket),
    tile('knock', 'Knock', 'thinking of you', () => app.knock()),
    tile('ring', 'Call them in', 'open the hole', () => app.ring()),
  ));
}

// ── today: one photo, one answer, buried until both
export async function todaySheet(app) {
  const body = h('div.today', h('p.small.muted', 'Digging…'));
  const s = sheet('Today', body, { tall: true });
  const render = async () => {
    let rows = [];
    try { rows = await app.backend.dailies(); } catch (e) { body.replaceChildren(h('p', 'Couldn\'t reach the soil. Try again.')); return; }
    const today = app.today();
    const t = rows.find((r) => r.day === today) || { day: today };
    const them = app.them()?.name || 'Them';
    const q = questionFor(today, app.seed());

    // streak: consecutive days where both of you did both
    const full = new Set(rows.filter((r) => r.my_answer && r.their_answered && r.my_photo && r.their_photographed).map((r) => r.day));
    let streak = 0; let d = dayNumber(today); if (!full.has(today)) d -= 1;
    while (full.has(new Date(d * 86400000).toISOString().slice(0, 10))) { streak++; d--; }

    const slot = (who, thumb, state, onTap) => h(`div.slot.${state}`, { onclick: onTap },
      thumb ? h('img', { src: thumb, alt: '' }) : h('div.dirt', state === 'buried' ? h('span', 'buried') : state === 'empty-me' ? [icon('cam'), h('span', 'Take yours')] : h('span', 'not yet')),
      h('span.who', who));

    const myPhoto = slot('You', t.my_thumb, t.my_thumb ? 'done' : 'empty-me', () => {
      if (t.my_thumb) return viewFull(app, t.my_photo, t.my_thumb);
      composePhoto(app, { daily: true, onDone: async (shot) => {
        try {
          const r = await app.backend.daily(today, { photo: shot.full, mime: 'image/jpeg', thumb: shot.thumb });
          app.backend.nudge('daily', { part: 'photo', both: r.both });
          sfx.chime(); render(); return true;
        } catch (e) { toast('Couldn\'t bury it. Try again.'); return false; }
      } });
    });
    const theirPhoto = slot(them, t.their_thumb, t.their_thumb ? 'done' : t.their_photographed ? 'buried' : 'waiting', () => {
      if (t.their_thumb) viewFull(app, t.their_photo, t.their_thumb);
      else if (t.their_photographed) toast('Post yours to dig theirs up.');
    });

    const ans = h('textarea', { rows: 3, maxLength: 1000, placeholder: 'Your answer…', value: t.my_answer || '' });
    const answerBox = t.my_answer
      ? h('div.answer.mine', h('span.who', 'You'), h('p', t.my_answer))
      : h('div.answer-form', ans, btn('Bury my answer', async (e) => {
        if (!ans.value.trim()) return ans.focus();
        e.currentTarget.disabled = true;
        try {
          const r = await app.backend.daily(today, { answer: ans.value.trim() });
          app.backend.nudge('daily', { part: 'answer', both: r.both });
          sfx.chime(); render();
        } catch { e.currentTarget.disabled = false; toast('Couldn\'t bury it. Try again.'); }
      }, 'primary'));
    const theirAnswer = t.their_answer
      ? h('div.answer', h('span.who', them), h('p', t.their_answer))
      : h('div.answer.buried', h('span.who', them), h('p', t.their_answered ? 'Buried. Answer to dig it up.' : 'Hasn\'t dug yet.'));

    const layers = rows.filter((r) => r.day !== today).map((r) => {
      const open = h('div.layer-body', { hidden: true },
        h('p.q', questionFor(r.day, app.seed())),
        r.my_answer ? h('p', h('b', 'You: '), r.my_answer) : null,
        r.their_answer ? h('p', h('b', them + ': '), r.their_answer) : null,
        h('div.row', r.my_thumb ? h('img.mini', { src: r.my_thumb, onclick: () => viewFull(app, r.my_photo, r.my_thumb) }) : null, r.their_thumb ? h('img.mini', { src: r.their_thumb, onclick: () => viewFull(app, r.their_photo, r.their_thumb) }) : null));
      return h('div.layer', { onclick: (e) => { if (e.target.tagName !== 'IMG') open.hidden = !open.hidden; } },
        h('div.layer-head', h('span.mono', prettyDay(r.day)), h('span.dots', r.my_answer && r.their_answer ? '●' : '○', r.my_thumb && r.their_thumb ? '●' : '○')), open);
    });

    body.replaceChildren(...[
      h('div.today-head', h('span.mono', prettyDay(today)), streak ? h('span.streak', `${streak} day${streak > 1 ? 's' : ''} in a row`) : h('span.streak.dim', 'Start a streak')),
      h('h3', 'Photo of the day'),
      h('div.slots', myPhoto, theirPhoto),
      h('h3', 'Question of the day'),
      h('p.question', q),
      answerBox, theirAnswer,
      layers.length ? h('h3', 'The layers') : null,
      layers.length ? h('p.small.muted', 'Every day you both dig settles into the soil.') : null,
      h('div.layers', layers),
    ].filter(Boolean));
  };
  app.onDailyChange = () => { if (s.el.isConnected) render(); };
  render();
}

async function viewFull(app, mediaId, thumb) {
  const img = h('img', { src: thumb, alt: '' });
  sheet('Today', h('div.polaroid', h('div.polaroid-img', img)));
  if (mediaId) try { const m = await app.backend.media(mediaId); img.src = m.data; } catch { /* thumb is fine */ }
}

// ── us: the tunnel, the worms, the countdown
export function usSheet(app) {
  const S = app.S, me = app.me(), them = app.them(), hole = S.hole || {};
  const units = store('settings')?.units || app.defaultUnits();
  const pct = hole.tunnel_km ? Math.min(1, hole.dug_km / hole.tunnel_km) : 0;
  const W = 320, y = 70;
  const tunnel = h('div.tunnel', { html: `
    <svg viewBox="0 0 ${W} 130" preserveAspectRatio="none">
      <defs><pattern id="soil" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#6B4A35"/><circle cx="2" cy="3" r="1" fill="#5A3C2A"/><circle cx="6" cy="6" r=".8" fill="#7D5A42"/></pattern></defs>
      <rect x="0" y="34" width="${W}" height="96" fill="url(#soil)"/>
      <rect x="0" y="30" width="${W}" height="6" fill="#4F7A3E"/>
      <path d="M24 ${y} H ${24 + (W - 48) * pct}" stroke="#2A1B13" stroke-width="16" stroke-linecap="round"/>
      <path d="M24 ${y} H ${W - 24}" stroke="#F4ECDD" stroke-width="1.4" stroke-dasharray="3 5" opacity=".5"/>
      <rect x="10" y="10" width="28" height="24" rx="3" fill="#2B3F63"/><rect x="${W - 38}" y="10" width="28" height="24" rx="3" fill="#2B3F63"/>
      <circle cx="${24 + (W - 48) * pct}" cy="${y}" r="7" fill="${COLORS[me?.worm?.color]?.body || '#E8959B'}"/>
      <circle cx="${W - 24}" cy="${y}" r="7" fill="${COLORS[them?.worm?.color]?.body || '#B49BE0'}" opacity=".7"/>
    </svg>` });
  const myIn = inchesFor(me?.love), theirIn = inchesFor(them?.love);
  const reunionIn = h('input', { type: 'date', value: hole.reunion_on || '' });
  const reunionNote = h('input', { placeholder: 'Where? (optional)', maxLength: 60, value: hole.reunion_note || '' });
  const days = hole.reunion_on ? Math.ceil((Date.parse(hole.reunion_on + 'T00:00:00') - Date.now()) / 86400000) : null;
  const ev = S.events;
  const count = (k, slot) => ev.filter((e) => e.kind === k && (slot == null || e.from_slot === slot)).reduce((a, e) => a + (e.payload?.n || 1), 0);
  const together = hole.created_at ? Math.max(1, Math.round((Date.now() - Date.parse(hole.created_at)) / 86400000)) : 1;

  sheet('Us', [
    h('div.card',
      h('div.row.between', h('span.mono.small', me?.place?.city || 'You'), h('span.mono.small', them?.place?.city || 'Them')),
      tunnel,
      h('p.big-num', fmtDistance(hole.dug_km || 0, units), h('span', ` of ${fmtDistance(hole.tunnel_km || 0, units)} dug`)),
      h('p.small.muted', hole.tunnels_done ? `${hole.tunnels_done} tunnel${hole.tunnels_done > 1 ? 's' : ''} finished. Every pet, kiss, note and daily digs further.` : 'Every pet, kiss, note and daily digs further. Finish the tunnel and your worms meet.')),
    h('div.card.two',
      h('div', h('span.mono.small', `${me?.worm?.name || 'Yours'} (you)`), h('p.big-num', `${myIn.toFixed(1)} in`), h('p.small.muted', lengthBlurb(myIn))),
      h('div', h('span.mono.small', them?.worm?.name || 'Theirs'), h('p.big-num', `${theirIn.toFixed(1)} in`), h('p.small.muted', lengthBlurb(theirIn)))),
    h('div.card',
      days != null && days >= 0
        ? h('p.big-num', days === 0 ? 'Today. Same pocket.' : `${days} day${days > 1 ? 's' : ''}`, days ? h('span', ' until the same pocket') : null)
        : h('p.lede', 'When are you in the same pocket next?'),
      hole.reunion_note && days >= 0 ? h('p.small.muted', hole.reunion_note) : null,
      h('div.row', reunionIn, reunionNote),
      btn('Set the countdown', async () => {
        if (!reunionIn.value) return toast('Pick a date.');
        try { await app.backend.setReunion(reunionIn.value, reunionNote.value.trim() || null); app.backend.nudge('reunion', { note: reunionNote.value.trim() }); toast('Countdown set.'); } catch { toast('Couldn\'t save. Try again.'); }
      }, 'ghost')),
    h('div.stats',
      stat(together, 'days in the pocket'), stat(hole.touches || 0, 'fingertip touches'),
      stat(count('kiss', app.slot()), 'kisses sent'), stat(count('kiss', 1 - app.slot()), 'kisses received'),
      stat(count('note'), 'notes'), stat(count('pet'), 'pets')),
    h('div.row.wrap',
      btn([icon('jar'), ' The jar'], () => jarSheet(app), 'ghost'),
      btn('Edit my worm', () => editWorm(app), 'ghost'),
      btn([icon('gear'), ' Settings'], () => settingsSheet(app), 'ghost')),
  ], { tall: true });
}
const stat = (n, label) => h('div.stat', h('b', String(n)), h('span', label));

// ── through the hole: how you look from their side
export function peekSheet(app) {
  const me = app.me(), them = app.them();
  const cv = h('canvas.preview.small');
  const evs = app.S.events.filter((e) => e.from_slot !== app.slot()).slice(0, 40);
  const line = (e) => {
    const p = e.payload || {};
    const t = {
      pet: `petted you${p.n > 1 ? ` ×${p.n}` : ''}`, boop: `booped you${p.n > 1 ? ` ×${p.n}` : ''}`, kiss: `sent a ${KISS_NAMES[p.level || 1]}`,
      feed: `fed you ${FOODS[p.food] || 'a crumb'}`, mist: 'misted you', note: 'dropped a note', doodle: 'drew you something',
      photo: 'sent a polaroid', whisper: 'whispered', wiggle: `wiggled${p.label ? ` “${p.label}”` : ''}`, trinket: `found you ${TRINKETS[p.what] || 'something'}`,
      knock: 'knocked', ring: 'called you in', touch: 'touched fingertips with you', daily: p.part === 'photo' ? 'posted today\'s photo' : 'answered today\'s question',
      reunion: 'set the countdown', arrived: 'crawled into your pocket', tunnel: 'finished a tunnel with you',
    }[e.kind];
    return t ? h('li', h('span', t), h('span.mono.small', ago(e.created_at))) : null;
  };
  const s = sheet('Through the hole', [
    h('p.small.muted', `This is you, living in ${them?.name || 'their'}'s pocket. It's ${timeIn(them?.place?.tz)} there.`),
    cv,
    h('div.cares', careLine('They fed you', me?.fed_at, 20, 'hungry'), careLine('Misted you', me?.misted_at, 18, 'dry'), careLine('Petted you', me?.petted_at, 12, 'lonely')),
    h('h3', 'Lately'),
    h('ul.log', evs.map(line).filter(Boolean).length ? evs.map(line) : h('li.muted', 'Nothing yet.')),
  ], { onClose: () => pv?.stop() });
  let pv; requestAnimationFrame(() => { pv = wormPreview(cv, me?.worm || {}, { segs: Math.min(30, 11 + Math.round(inchesFor(me?.love) * 0.75)) }); pv.worm.marks = []; });
  return s;
}

// ── the jar: everything that ever came through
export function jarSheet(app) {
  const all = app.S.events.filter((e) => ['note', 'doodle', 'photo', 'whisper', 'wiggle', 'trinket'].includes(e.kind));
  let filter = 'theirs';
  const grid = h('div.jar');
  const render = () => {
    const list = all.filter((e) => (filter === 'theirs' ? e.from_slot !== app.slot() : filter === 'mine' ? e.from_slot === app.slot() : e.kept));
    grid.replaceChildren(...(list.length ? list.map((e) => h('button.jar-item', { type: 'button', onclick: () => openItem(app, app.asItem(e)) },
      e.kind === 'photo' && e.payload?.thumb ? h('img', { src: e.payload.thumb }) : e.kind === 'trinket' ? trinketCanvas(e.payload?.what, 44, e.payload?.text) : h('span.jar-ic', icon(e.kind)),
      h('span.small', titleFor(e).replace(/^An? /, '').replace('Something they found', 'found')), h('span.mono.tiny', ago(e.created_at)))) : [h('p.muted', 'Empty.')]));
  };
  sheet('The jar', [segmented({ theirs: 'From them', mine: 'From you', kept: 'Kept' }, filter, (k) => { filter = k; render(); }), grid], { tall: true });
  render();
}

export function editWorm(app) {
  const d = { ...(app.me()?.worm || {}) };
  const cv = h('canvas.preview');
  const nameIn = h('input', { value: d.name || '', maxLength: 24 });
  let pv;
  const chips = (obj, key) => {
    const wrap = h('div.chips');
    for (const [k, label] of Object.entries(obj)) wrap.append(h(`button.chip${d[key] === k ? '.on' : ''}`, { type: 'button', onclick: (e) => { d[key] = k; [...wrap.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); pv.set(d); } }, label));
    return wrap;
  };
  const swatches = h('div.swatches', Object.entries(COLORS).map(([k, c]) => h(`button.swatch${d.color === k ? '.on' : ''}`, { type: 'button', style: { background: c.body }, onclick: (e) => { d.color = k; [...swatches.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); pv.set(d); } })));
  const s = sheet('Your worm', [cv, field('Name', nameIn), h('div.field', h('span.field-label', 'Color'), swatches), h('div.field', h('span.field-label', 'Pattern'), chips(PATTERNS, 'pattern')), h('div.field', h('span.field-label', 'Wearing'), chips(ACCESSORIES, 'acc')),
    btn('Save', async () => { d.name = nameIn.value.trim() || d.name; try { await app.backend.updateMe({ worm: d }); app.me().worm = d; app.pocket.setMyWorm(d, inchesFor(app.me().love)); toast('Saved. They\'ll see the new look.'); s.close(); } catch { toast('Couldn\'t save.'); } }, 'primary')],
  { onClose: () => pv?.stop() });
  requestAnimationFrame(() => { pv = wormPreview(cv, d); });
}

export function settingsSheet(app) {
  const st = store('settings') || {};
  const set = (k, v) => { const cur = store('settings') || {}; cur[k] = v; store('settings', cur); };
  const pushState = h('span.small.muted', '');
  const updatePush = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) pushState.textContent = isIOS() && !isStandalone() ? 'Add to Home Screen first.' : 'Not supported here.';
    else pushState.textContent = Notification.permission === 'granted' && app.me()?.push ? 'On' : Notification.permission === 'denied' ? 'Blocked in settings' : 'Off';
  };
  updatePush();
  sheet('Settings', [
    h('div.setting', h('div', h('b', 'Notifications'), pushState), btn('Turn on', async () => { await app.enablePush(); updatePush(); }, 'ghost small')),
    h('div.setting', h('div', h('b', 'Tilt'), h('span.small.muted', 'Things slide around when you tilt.')), btn('Allow', () => app.enableMotion(true), 'ghost small')),
    h('div.setting', h('b', 'Sound'), segmented({ on: 'On', off: 'Off' }, st.sound === false ? 'off' : 'on', (k) => set('sound', k === 'on'))),
    h('div.setting', h('b', 'Buzz'), segmented({ on: 'On', off: 'Off' }, st.haptics === false ? 'off' : 'on', (k) => set('haptics', k === 'on'))),
    h('div.setting', h('b', 'Distance'), segmented({ mi: 'Miles', km: 'Km' }, st.units || app.defaultUnits(), (k) => set('units', k))),
    h('div.setting', h('div', h('b', 'Your hole\'s code'), h('span.small.muted', 'For a new phone. Keep it between you two.')), h('span.code.small', fmtCode(app.S.hole?.code))),
    h('div.setting', h('div', h('b', 'Your city'), h('span.small.muted', app.me()?.place?.city || '')), btn('Change', () => changeCity(app), 'ghost small')),
    btn('Crawl out of this pocket', async () => {
      if (!(await confirmBox('This removes your worm from the pocket on this phone. Your partner keeps their side. You can rejoin with the code.', 'Crawl out'))) return;
      await app.backend.leave(); localStorage.clear(); location.reload();
    }, 'danger wide'),
    h('p.tiny.muted.center', 'Bolsillo Worm · made for two'),
  ]);
}

function changeCity(app) {
  const q = h('input', { placeholder: 'Search your city' });
  const list = h('div.results');
  let t;
  q.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.value)}&count=6&language=en&format=json`);
        const j = await r.json();
        list.replaceChildren(...(j.results || []).map((c) => h('button.result', { type: 'button', onclick: async () => {
          const place = { city: c.name, country: c.country || '', region: c.admin1 || '', lat: +c.latitude.toFixed(3), lon: +c.longitude.toFixed(3), tz: c.timezone };
          try { await app.backend.updateMe({ place }); app.me().place = place; toast(`Moved to ${c.name}.`); s.close(); } catch { toast('Couldn\'t save.'); }
        } }, h('b', c.name), h('span', [c.admin1, c.country].filter(Boolean).join(', ')))));
      } catch { /* */ }
    }, 300);
  });
  const s = sheet('Your city', [field('City', q), list]);
}

export { KISS_NAMES };
