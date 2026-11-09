// The paper slips: feed, drop, today, us, peek, settings, the jar.
import { h, ago, hoursSince, prettyDay, fmtDistance, store, dayNumber, isIOS, isStandalone, timeIn } from './util.js';
import { sheet, btn, icon, toast, field, segmented, confirmBox } from './ui.js';
import { FOODS, drawFood, TRINKETS, KISS_NAMES, KISS_EMOJI, REACTIONS } from './draw.js';
import { COLORS, PATTERNS, ACCESSORIES, inchesFor, lengthBlurb } from './worm.js';
import { composeNote, composeDoodle, composePhoto, composeWhisper, composeWiggle, composeTrinket, openItem, titleFor, trinketCanvas, reactRow, theirReactions } from './compose.js';
import { wormPreview, fmtCode } from './onboarding.js';
import { soilSheet, plantSheet, viewPhoto, soilGrain as soilGrainURL } from './soil.js';
import { leaveSheet } from './shelf.js';
import { sfx } from './feel.js';


function foodCanvas(kind, size = 54) {
  const c = h('canvas', { width: size * 2, height: size * 2, style: { width: size + 'px', height: size + 'px' } });
  const x = c.getContext('2d'); x.scale(2, 2); x.translate(size / 2, size / 2);
  x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = 3; x.shadowOffsetY = 2;
  drawFood(x, kind, size * 0.3);
  return c;
}

function careLine(label, iso, okH, badWord) {
  const hrs = hoursSince(iso);
  const fill = Math.max(0.06, 1 - hrs / (okH * 2.5));
  const ok = hrs <= okH;
  return h(`div.meter${ok ? '.ok' : ''}`, h('span.mono', label), h('b', iso ? ago(iso) : 'never'),
    h('div.bar', h('span', { style: { width: `${Math.round(fill * 100)}%` } })), ok ? null : h('span.tag', badWord));
}

export function feedSheet(app) {
  const them = app.them(); const w = them?.worm || {};
  const s = sheet(`Feed ${w.name || 'them'}`, [
    h('div.meters', careLine('Fed', them?.fed_at, 20, 'hungry'), careLine('Misted', them?.misted_at, 18, 'dry'), careLine('Petted', them?.petted_at, 12, 'lonely')),
    h('h3', 'Pick a crumb'),
    h('div.foods', Object.entries(FOODS).map(([k, label]) => h('button.food', { type: 'button', onclick: () => { s.close(); app.feed(k); } }, foodCanvas(k), h('span', label.replace(/^(an?|a bit of|a bite of) /, ''))))),
    btn([icon('mist'), ' Mist them'], () => { s.close(); app.mist(); }, 'primary wide'),
    h('p.small.muted.center', 'Stroke the worm to pet it. Tap its head to boop.'),
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
    tile('later', 'For later', 'open when… or on a date', (a) => leaveSheet(a)),
    tile('knock', 'Knock', 'thinking of you', () => app.knock()),
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
    const Q = app.questionFor(today), q = Q.q;

    // streak: consecutive days where both of you did both
    const full = new Set(rows.filter((r) => r.my_answer && r.their_answered && r.my_photo && r.their_photographed).map((r) => r.day));
    let streak = 0; let d = dayNumber(today); if (!full.has(today)) d -= 1;
    while (full.has(new Date(d * 86400000).toISOString().slice(0, 10))) { streak++; d--; }

    const slot = (who, thumb, state, onTap) => h(`div.slot.${state}`, { onclick: onTap },
      thumb ? h('img', { src: thumb, alt: '' }) : h('div.dirt', state === 'buried' ? [icon('peek'), h('span', 'Buried')] : state === 'empty-me' ? [icon('cam'), h('span', 'Take yours')] : h('span', 'Not yet')),
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
      ? h('div.answer.mine', h('span.who', 'You'), h('p', t.my_answer), theirReactions(app, { day: today, part: 'answer' }))
      : h('div.answer-form', ans, btn('Bury my answer', async (e) => {
        if (!ans.value.trim()) return ans.focus();
        e.currentTarget.disabled = true;
        try {
          const r = await app.backend.daily(today, { answer: ans.value.trim() });
          app.backend.nudge('daily', { part: 'answer', both: r.both });
          sfx.chime(); render();
        } catch { e.currentTarget.disabled = false; toast('Couldn\'t bury it. Try again.'); }
      }, 'primary'));
    const tA = { day: today, part: 'answer', about: 'answer' }, tP = { day: today, part: 'photo', about: 'photo of the day' };
    const theirAnswer = t.their_answer
      ? h('div.answer', h('span.who', them), h('p', t.their_answer), reactRow(app, tA))
      : t.their_answered ? h('div.answer.buried', { style: { '--grain': soilGrainURL() } }, h('span.who', them), h('p', 'Buried. Answer to dig it up.')) : h('div.answer', h('span.who', them), h('p.muted', 'Hasn\'t answered yet.'));

    const layers = rows.filter((r) => String(r.day).slice(0, 10) < today && (r.my_answer || r.their_answer)).length;

    body.replaceChildren(...[
      h('div.today-head', h('span.mono', prettyDay(today)), streak ? h('span.streak', `${streak} day${streak > 1 ? 's' : ''} in a row`) : h('span.streak.dim', 'Start a streak')),
      h('h3', 'Photo of the day'),
      h('div.slots', myPhoto, theirPhoto),
      t.their_thumb ? reactRow(app, tP) : null,
      t.my_thumb ? theirReactions(app, { day: today, part: 'photo' }) : null,
      h('h3', 'Question of the day'),
      Q.by ? h('span.seed', Q.mine ? '🌱 You planted this one' : `🌱 ${Q.by} planted this one`) : null,
      h('p.question', q),
      answerBox, theirAnswer,
      h('div.soil-links',
        h('button.soil-link', { type: 'button', onclick: () => soilSheet(app), style: { '--grain': soilGrainURL() } }, h('b', 'The soil'), h('span', layers ? `${layers} layer${layers > 1 ? 's' : ''} of answers, plus everything that settled` : 'Where everything settles')),
        h('button.plant-link', { type: 'button', onclick: () => plantSheet(app) }, h('b', '🌱'), h('span', `Plant a question for ${them}`))),
    ].filter(Boolean));
  };
  app.onDaily(() => { if (!s.el.isConnected) return false; render(); });
  app.onReact = (ev) => { if (s.el.isConnected && ev?.payload?.day) render(); };
  render();
}

const viewFull = (app, mediaId, thumb) => viewPhoto(app, mediaId, thumb, 'Today');

// ── us: the tunnel, the worms, the countdown
export function usSheet(app) {
  const S = app.S, me = app.me(), them = app.them(), hole = S.hole || {};
  const units = store('settings')?.units || app.defaultUnits();
  const pct = hole.tunnel_km ? Math.min(1, hole.dug_km / hole.tunnel_km) : 0;
  const myIn = inchesFor(me?.love), theirIn = inchesFor(them?.love);
  const reunionIn = h('input', { type: 'date', value: hole.reunion_on || '' });
  const reunionNote = h('input', { placeholder: 'Where?', maxLength: 60, value: hole.reunion_note || '' });
  const days = hole.reunion_on ? Math.ceil((Date.parse(hole.reunion_on + 'T00:00:00') - Date.now()) / 86400000) : null;
  const ev = S.events;
  const count = (k, slot) => ev.filter((e) => e.kind === k && (slot == null || e.from_slot === slot)).reduce((a, e) => a + (e.payload?.n || 1), 0);
  const together = hole.created_at ? Math.max(1, Math.round((Date.now() - Date.parse(hole.created_at)) / 86400000)) : 1;
  const wormCard = (m, inches, mine) => h('div', { style: { background: COLORS[m?.worm?.color]?.light || '#F2F2F5' } },
    h('span.mono.small', mine ? 'YOU' : (m?.name || '').toUpperCase()), h('p.big-num', `${inches.toFixed(1)}`, h('span', ' in')), h('p.small', m?.worm?.name || ''), h('p.small.muted', lengthBlurb(inches)));

  sheet('Us', [
    h('div.card',
      h('div.row.between', h('span.mono.small.muted', (me?.place?.city || 'You').toUpperCase()), h('span.mono.small.muted', (them?.place?.city || 'Them').toUpperCase())),
      h('div.tunnel-bar', h('span', { style: { width: `${Math.max(8, pct * 100)}%` } }), h('b', `${Math.round(pct * 100)}%`), h('i', `${fmtDistance(hole.tunnel_km || 0, units)}`)),
      h('p.big-num', fmtDistance(hole.dug_km || 0, units), h('span', ' dug')),
      h('p.small.muted', hole.tunnels_done ? `${hole.tunnels_done} tunnel${hole.tunnels_done > 1 ? 's' : ''} finished. Every pet, kiss, note and daily digs further.` : 'Every pet, kiss, note and daily digs further. Finish the tunnel and your worms meet.')),
    h('div.card.two', wormCard(me, myIn, true), wormCard(them, theirIn, false)),
    h('div.card.night',
      h('span.mono.small', 'SAME POCKET'),
      days != null && days >= 0
        ? h('p.big-num', days === 0 ? 'Today' : `${days}`, days ? h('span', ` day${days > 1 ? 's' : ''} to go`) : null)
        : h('p.big-num', h('span', 'When are you together next?')),
      hole.reunion_note && days >= 0 ? h('p.small.muted', hole.reunion_note) : null,
      h('div.row', reunionIn, reunionNote),
      btn('Set the countdown', async () => {
        if (!reunionIn.value) return toast('Pick a date.');
        try { await app.backend.setReunion(reunionIn.value, reunionNote.value.trim() || null); app.backend.nudge('reunion', { note: reunionNote.value.trim() }); toast('Countdown set.'); } catch { toast('Couldn\'t save. Try again.'); }
      }, 'ghost')),
    h('div.stats',
      stat(together, 'days together here'), stat(hole.touches || 0, 'fingertip touches'),
      stat(count('kiss', app.slot()), 'kisses sent'), stat(count('kiss', 1 - app.slot()), 'kisses received'),
      stat(count('note'), 'notes'), stat(count('pet'), 'pets')),
    h('div.btn-grid.four',
      btn([icon('jar'), ' Jar'], () => jarSheet(app), 'ghost'),
      btn('🌱 Soil', () => soilSheet(app), 'ghost'),
      btn('My worm', () => editWorm(app), 'ghost'),
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
      pet: `petted you${p.n > 1 ? ` ×${p.n}` : ''}`, boop: `booped you${p.n > 1 ? ` ×${p.n}` : ''}`, kiss: `sent a ${KISS_NAMES[p.level || 1]} ${KISS_EMOJI[p.level || 1]}`, react: p.about ? `reacted ${p.emoji} to your ${p.about}` : `sent ${p.emoji}`,
      feed: `fed you ${FOODS[p.food] || 'a crumb'}`, mist: 'misted you', note: 'dropped a note', doodle: 'drew you something',
      photo: 'sent a polaroid', whisper: 'whispered', wiggle: `wiggled${p.label ? ` “${p.label}”` : ''}`, trinket: `found you ${TRINKETS[p.what] || 'something'}`,
      knock: 'knocked', ring: 'called you in', touch: 'touched fingertips with you', daily: p.part === 'photo' ? 'posted today\'s photo' : 'answered today\'s question',
      reunion: 'set the countdown', plant: 'planted a question for you', later: p.mode === 'date' ? 'wrapped a time capsule for you' : `left you an envelope: when ${p.label}`, unsealed: p.mode === 'date' ? 'unwrapped your time capsule' : `opened “when ${p.label}”`, arrived: 'crawled into your pocket', tunnel: 'finished a tunnel with you',
    }[e.kind];
    return t ? h('li', h('span', t), h('span.mono.small', ago(e.created_at))) : null;
  };
  const s = sheet('Through the hole', [
    h('p.small.muted', `This is you, living in ${them?.name || 'their'}'s pocket. It's ${timeIn(them?.place?.tz)} there.`),
    cv,
    h('div.meters', careLine('Fed', me?.fed_at, 20, 'hungry'), careLine('Misted', me?.misted_at, 18, 'dry'), careLine('Petted', me?.petted_at, 12, 'lonely')),
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

