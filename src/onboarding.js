// Getting into the pocket: who you are, what your worm looks like, where you are, who you're paired with.
import { h, $, isIOS, isStandalone, store, myTz, rand } from './util.js';
import { Worm, COLORS, PATTERNS, ACCESSORIES, DEFAULT_DESIGN } from './worm.js';
import { skyFor, drawSky, makeGrain } from './draw.js';
import { btn, field, icon, toast } from './ui.js';
import { sfx, unlockAudio } from './feel.js';

export const fmtCode = (c) => (c || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().replace(/^(.{4})(.+)$/, '$1-$2');

export function wormPreview(canvas, design, { segs = 18 } = {}) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || 300, H = canvas.clientHeight || 200;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const x = canvas.getContext('2d');
  const sky = skyFor(13, 'clear');
  const grain = makeGrain(W, H, dpr);
  const R = Math.min(16, W * 0.05);
  const w = new Worm(design, { x: W * 0.6, y: H * 0.55, R, segs, angle: -0.3 });
  w.speedBase = R * 2.6;
  let run = true, last = performance.now();
  const bounds = { l: 6, r: W - 6, t: 6, b: H - 6 };
  const loop = (now) => {
    if (!run) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    w.update(dt, { bounds, gx: 0, gy: 0 });
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(x, W, H, now / 1000, sky);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 0.5; x.drawImage(grain, 0, 0); x.restore();
    w.draw(x);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  canvas.addEventListener('pointerdown', () => { w.happy = 2; w.squish = 1; w.dance = 0.5; w.danceAmp = R * 0.5; sfx.boop(); });
  return { worm: w, set(d) { w.setDesign(d); w.happy = 1.2; }, stop() { run = false; } };
}

function screen(...kids) {
  const root = $('#onboard');
  root.classList.remove('hero');
  root.replaceChildren(h('div.ob-card', ...kids));
  root.hidden = false;
  root.scrollTop = 0;
  return root;
}

export function installGate(code) {
  return new Promise((resolve) => {
    if (isStandalone() || store('skipInstall')) return resolve();
    const ios = isIOS();
    let deferred = window.__bwInstallPrompt;
    if (!ios && !deferred) return resolve();
    const copy = code ? h('div.code-box',
      h('span.mono.small', 'Your code'),
      h('div.code', fmtCode(code)),
      btn('Copy code', async () => { try { await navigator.clipboard.writeText(code); toast('Copied. Paste it inside the app.'); } catch { toast('Write it down: ' + fmtCode(code)); } }, 'ghost small'),
    ) : null;
    screen(
      h('div.ob-logo', logo()),
      h('h1', 'Put it in your pocket'),
      ios
        ? h('ol.steps',
          h('li', 'Tap ', h('span.inline-ic', icon('share')), ' Share at the bottom of Safari.'),
          h('li', 'Scroll and tap ', h('b', 'Add to Home Screen'), '.'),
          h('li', 'Open ', h('b', 'Bolsillo Worm'), ' from your home screen.'))
        : h('p.lede', 'Install it so it lives on your home screen and can buzz you when something lands in your pocket.'),
      ios ? h('p.small.muted', 'It only works as a home screen app on iPhone: notifications, full screen, the works.') : null,
      copy,
      !ios && deferred ? btn('Install Bolsillo Worm', async () => { deferred.prompt(); await deferred.userChoice; resolve(); }, 'primary') : null,
      h('button.link', { onclick: () => { store('skipInstall', true); resolve(); } }, 'Continue in the browser'),
    );
  });
}

function logo() {
  return h('div.logo-mark', { html: `<svg viewBox="0 0 120 120"><defs><radialGradient id="lo" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#0638E8"/><stop offset=".55" stop-color="#1FB8FF"/><stop offset="1" stop-color="#BDEBFF" stop-opacity="0"/></radialGradient><linearGradient id="lb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBE9DE"/><stop offset="1" stop-color="#EAF4FF"/></linearGradient></defs><rect width="120" height="120" fill="url(#lb)"/><circle cx="60" cy="68" r="46" fill="url(#lo)"/><path d="M60 74c0-14-10-18-10-28 0-9 10-14 18-9" fill="none" stroke="#FF9EC2" stroke-width="13" stroke-linecap="round"/><circle cx="66.5" cy="35.5" r="2.4" fill="#111"/><circle cx="72" cy="39.5" r="2.4" fill="#111"/></svg>` });
}

export async function onboard(backend, { code: presetCode } = {}) {
  const draft = store('draft') || { name: '', worm: { ...DEFAULT_DESIGN }, place: null };
  const save = () => store('draft', draft);

  // 1. welcome
  await new Promise((res) => {
    const root = $('#onboard');
    root.hidden = false;
    root.classList.add('hero');
    root.replaceChildren(h('div.hero-card',
      h('div.hero-top', h('span', 'for two'), h('span', 'carry each other')),
      h('div.hero-title', 'bolsillo', h('br'), 'worm'),
      h('p.hero-tag', 'You become a worm. Yours lives in their pocket. Theirs lives in yours.'),
      h('div.hero-list', ['pet', 'kiss', 'feed', 'dig', 'touch'].map((w) => h('span', w))),
      h('button.start-pill', { type: 'button', onclick: res }, 'start', h('i', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>' }))));
  });

  // 2. you
  await new Promise((res) => {
    const input = h('input', { value: draft.name, maxLength: 40, placeholder: 'Your name', autocomplete: 'given-name', enterKeyHint: 'next' });
    const next = () => { if (!input.value.trim()) return input.focus(); draft.name = input.value.trim(); save(); res(); };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && next());
    screen(h('p.step', '01 / 04'), h('h1', 'Who are you?'), h('p.lede', 'This is the name your person sees next to your worm.'), field('Your name', input), btn('Next', next, 'primary'));
    setTimeout(() => input.focus(), 300);
  });

  // 3. your worm
  await new Promise((res) => {
    const cv = h('canvas.preview');
    const nameIn = h('input', { value: draft.worm.name || '', maxLength: 24, placeholder: 'Fideo, Pickle, Señor Gusano…' });
    let pv;
    const swatches = h('div.swatches', Object.entries(COLORS).map(([k, c]) =>
      h(`button.swatch${draft.worm.color === k ? '.on' : ''}`, { type: 'button', style: { background: c.body }, title: c.label, onclick: (e) => { draft.worm.color = k; [...swatches.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); pv.set(draft.worm); sfx.pop(); } })));
    const chips = (obj, key) => {
      const wrap = h('div.chips');
      for (const [k, label] of Object.entries(obj)) {
        wrap.append(h(`button.chip${draft.worm[key] === k ? '.on' : ''}`, { type: 'button', onclick: (e) => { draft.worm[key] = k; [...wrap.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); pv.set(draft.worm); sfx.pop(); } }, label));
      }
      return wrap;
    };
    const next = () => { if (!nameIn.value.trim()) { toast('Your worm needs a name.'); return nameIn.focus(); } draft.worm.name = nameIn.value.trim(); save(); pv.stop(); res(); };
    screen(
      h('p.step', '02 / 04'), h('h1', 'Make your worm'),
      h('p.lede', 'This worm is you. It will live in their pocket.'),
      cv,
      field('Worm name', nameIn),
      h('div.field', h('span.field-label', 'Color'), swatches),
      h('div.field', h('span.field-label', 'Pattern'), chips(PATTERNS, 'pattern')),
      h('div.field', h('span.field-label', 'Wearing'), chips(ACCESSORIES, 'acc')),
      btn('Next', next, 'primary'),
    );
    requestAnimationFrame(() => { pv = wormPreview(cv, draft.worm); });
  });

  // 4. where
  await new Promise((res) => {
    const q = h('input', { placeholder: 'Search your city', autocomplete: 'off', enterKeyHint: 'search', value: draft.place?.city || '' });
    const list = h('div.results');
    const chosen = h('p.chosen', draft.place ? `${draft.place.city}${draft.place.country ? ', ' + draft.place.country : ''}` : '');
    let timer;
    const search = async () => {
      const term = q.value.trim(); if (term.length < 2) { list.replaceChildren(); return; }
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=6&language=en&format=json`);
        const j = await r.json();
        list.replaceChildren(...(j.results || []).map((c) => h('button.result', { type: 'button', onclick: () => {
          draft.place = { city: c.name, country: c.country || '', region: c.admin1 || '', lat: +c.latitude.toFixed(3), lon: +c.longitude.toFixed(3), tz: c.timezone || myTz() };
          save(); chosen.textContent = `${c.name}, ${c.country || ''}`; list.replaceChildren(); q.value = c.name; sfx.pop();
        } }, h('b', c.name), h('span', [c.admin1, c.country].filter(Boolean).join(', ')))));
        if (!j.results?.length) list.replaceChildren(h('p.small.muted', 'Nothing found. Try the nearest big city.'));
      } catch { list.replaceChildren(h('p.small.muted', 'Can\'t search right now. Type your city and tap Next.')); }
    };
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 300); });
    const next = async () => {
      const term = q.value.trim();
      if (term && (!draft.place || draft.place.city.toLowerCase() !== term.toLowerCase())) {
        // typed but didn't pick: take the best match so time, weather and distance work
        try {
          const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=en&format=json`);
          const c = (await r.json()).results?.[0];
          draft.place = c ? { city: c.name, country: c.country || '', region: c.admin1 || '', lat: +c.latitude.toFixed(3), lon: +c.longitude.toFixed(3), tz: c.timezone || myTz() } : { city: term, tz: myTz() };
        } catch { draft.place = { city: term, tz: myTz() }; }
      }
      if (!draft.place) { toast('Where are you?'); return q.focus(); }
      save(); res();
    };
    screen(h('p.step', '03 / 04'), h('h1', 'Where\'s your pocket?'),
      h('p.lede', 'Your partner sees your time and weather, and the distance between you becomes a tunnel you dig together.'),
      field('City', q), chosen, list, btn('Next', next, 'primary'));
  });

  // 5. pair
  return await new Promise((resolve) => {
    const codeIn = h('input.code-in', { placeholder: 'XXXX-XXXX', maxLength: 9, autocapitalize: 'characters', autocomplete: 'off', value: presetCode ? fmtCode(presetCode) : '' });
    codeIn.addEventListener('input', () => { const p = codeIn.selectionStart; codeIn.value = fmtCode(codeIn.value); codeIn.setSelectionRange(p, p); });
    const busy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); };

    const create = async (e) => {
      const b = e.currentTarget; busy(b, true);
      try {
        const r = await backend.create(draft.name, draft.worm, draft.place);
        store('draft', null);
        showCode(r.code, resolve);
      } catch (err) { toast(nice(err)); busy(b, false); }
    };
    const join = async (e) => {
      const b = e.currentTarget; const code = codeIn.value.replace(/[^A-Z0-9]/gi, '');
      if (code.length < 8) { toast('The code has 8 characters.'); return codeIn.focus(); }
      busy(b, true);
      try {
        const r = await backend.join(code, draft.name, draft.worm, draft.place);
        if (r.full) { busy(b, false); return reclaim(code, r.worms, resolve); }
        store('draft', null); sfx.chime(); resolve(r);
      } catch (err) { toast(nice(err)); busy(b, false); }
    };
    const paste = async () => { try { const t = await navigator.clipboard.readText(); codeIn.value = fmtCode(t); } catch { toast('Type it in instead.'); } };

    screen(h('p.step', '04 / 04'), h('h1', 'Connect the pockets'),
      h('div.choice',
        h('h3', 'Starting?'),
        h('p.small', 'Dig a new hole and send the code to your person.'),
        btn('Dig a new hole', create, 'primary')),
      h('div.or', 'or'),
      h('div.choice',
        h('h3', 'Got a code?'),
        h('div.code-row', codeIn, h('button.icon-btn', { type: 'button', onclick: paste, title: 'Paste' }, 'Paste')),
        btn('Crawl in', join, presetCode ? 'primary' : '')),
    );
  });
}

function showCode(code, resolve) {
  const url = `${location.origin}${location.pathname}#join=${code}`;
  const share = async () => {
    const text = `Crawl into my pocket 🪱 Install Bolsillo Worm, then use code ${fmtCode(code)}`;
    try { if (navigator.share) await navigator.share({ title: 'Bolsillo Worm', text, url }); else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Link copied.'); } } catch { /* cancelled */ }
  };
  sfx.chime();
  screen(h('div.ob-logo', logo()), h('h1', 'Your hole is dug'),
    h('p.lede', 'Send this to your person. When they crawl in, their worm shows up in your pocket.'),
    h('div.code-box', h('span.mono.small', 'Code'), h('div.code', fmtCode(code))),
    btn('Send the link', share, 'primary'),
    btn('Go to my pocket', () => resolve({ code }), 'ghost'));
}

function reclaim(code, worms, resolve) {
  screen(h('h1', 'This hole is full'),
    h('p.lede', 'It already has two worms. New phone? Pick yours to take it back. The old phone will lose access.'),
    h('div.reclaim', worms.map((w) => h('button.result', { type: 'button', onclick: async () => {
      try { const r = await window.__bw.backend.reclaim(code, w.slot); store('draft', null); sfx.chime(); resolve(r); } catch (err) { toast(nice(err)); }
    } }, h('b', w.worm?.name || 'Worm'), h('span', `${w.name}'s worm`)))));
}

export function nice(err) {
  const m = String(err?.message || err);
  if (m.includes('no_such_hole')) return 'No hole with that code. Check the letters.';
  if (m.includes('already_in_hole')) return 'This phone is already in a pocket.';
  if (m.includes('anonymous') || m.includes('Anonymous')) return 'Sign-ins are switched off on the server.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'No connection. Try again.';
  return 'Something snagged: ' + m.slice(0, 80);
}
export { rand };
