// Making things to send up into their sky, and opening things that fell into yours.
import { h, ago, clamp } from './util.js';
import { sheet, btn, icon, toast, field, segmented } from './ui.js';
import { PAPERS, TRINKETS, renderStrokes, REACTIONS } from './draw.js';
import { trinketEmoji, glyphTile, GLYPH_COLORS, recordIcon } from './icons.js';
import { songInfo, parseSong, embedHeight, PROVIDERS } from './music.js';
import { photoFromFile, pickImage, Recorder, blobToDataURL } from './media.js';
import { sfx, buzz } from './feel.js';

const busy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); };

export function composeNote(app) {
  let paper = 'white';
  const ta = h('textarea.handwriting', { maxLength: 600, rows: 7, placeholder: 'Write something for their pocket…' });
  const card = h('div.paper-card', { style: { background: PAPERS[paper] } }, ta);
  const count = h('span.small.muted', '0 / 600');
  ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / 600`; });
  const s = sheet('A note', [
    segmented({ white: 'White', rosa: 'Rosa', celeste: 'Celeste', limon: 'Limón' }, paper, (k) => { paper = k; card.style.background = PAPERS[k]; }),
    card, h('div.row.between', count, btn('Fold it and drop it', async (e) => {
      const text = ta.value.trim(); if (!text) return ta.focus();
      busy(e.currentTarget, true);
      if (await app.send('note', { text, paper }, { preview: text.slice(0, 90) })) s.close(); else busy(e.currentTarget, false);
    }, 'primary')),
  ]);
  setTimeout(() => ta.focus(), 350);
}

export function composeDoodle(app) {
  const size = Math.min(window.innerWidth - 48, 380);
  const cv = h('canvas.doodle-pad', { width: size * 2, height: size * 2, style: { width: size + 'px', height: size + 'px' } });
  const x = cv.getContext('2d'); x.scale(2, 2);
  const inks = ['#0B0B0C', '#FF2D55', '#FF9EC2', '#2F7BFF', '#34C759', '#FF9A3C'];
  let ink = inks[1], width = 14, erasing = false;
  const strokes = []; let cur = null;
  const ERASE = { 8: 36, 14: 56, 30: 110 }; // eraser widths for Fine / Marker / Fat: roomier than the pens
  const redraw = () => {
    x.clearRect(0, 0, size, size); renderStrokes(x, strokes, size, 1);
    if (cur?.e) { // show how big the eraser is under the finger
      const n = cur.p.length, r = (cur.w / 1000) * size / 2;
      x.save(); x.lineWidth = 1.5; x.strokeStyle = 'rgba(28,28,30,0.35)'; x.setLineDash([3, 3]);
      x.beginPath(); x.arc((cur.p[n - 2] / 1000) * size, (cur.p[n - 1] / 1000) * size, r, 0, Math.PI * 2); x.stroke(); x.restore();
    }
  };
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 1000), Math.round(clamp((e.clientY - r.top) / r.height, 0, 1) * 1000)]; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    cur = erasing ? { c: '#FFFFFF', w: ERASE[width] || width * 4, p: pt(e), e: 1 } : { c: ink, w: width, p: pt(e) };
    strokes.push(cur); redraw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!cur) return; const [a, b] = pt(e), n = cur.p.length;
    if (Math.hypot(a - cur.p[n - 2], b - cur.p[n - 1]) > 5) { cur.p.push(a, b); redraw(); }
  });
  const end = () => { cur = null; redraw(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const pick = (el) => { [...inkRow.children].forEach((b) => b.classList.toggle('on', b === el)); };
  const inkRow = h('div.inks',
    inks.map((c) => h(`button.ink${c === ink ? '.on' : ''}`, { type: 'button', 'aria-label': 'Pen', style: { background: c }, onclick: (e) => { ink = c; erasing = false; pick(e.currentTarget); } })),
    h('button.ink.eraser', { type: 'button', 'aria-label': 'Eraser', title: 'Eraser', onclick: (e) => { erasing = true; pick(e.currentTarget); } }, icon('eraser')));
  const s = sheet('A doodle', [
    h('div.doodle-wrap', cv),
    inkRow,
    h('div.row.between',
      segmented({ 8: 'Fine', 14: 'Marker', 30: 'Fat' }, '14', (k) => { width = +k; }),
      h('div.row', h('button.icon-btn', { type: 'button', onclick: () => { strokes.pop(); redraw(); }, title: 'Undo' }, icon('undo')))),
    btn('Drop it in', async (e) => {
      if (!strokes.some((st) => !st.e)) return toast('Draw something first.');
      busy(e.currentTarget, true);
      if (await app.send('doodle', { strokes })) s.close(); else busy(e.currentTarget, false);
    }, 'primary'),
  ], { wide: true });
}

export function composePhoto(app, { daily = false, onDone } = {}) {
  let shot = null;
  const caption = h('input.handwriting', { placeholder: daily ? '' : 'Write on the bottom…', maxLength: 60 });
  const frame = h('div.polaroid.empty', h('div.polaroid-img', h('span.small.muted', 'No photo yet')), daily ? null : caption);
  const pick = async (capture) => {
    const f = await pickImage({ capture });
    if (!f) return;
    try {
      shot = await photoFromFile(f);
      frame.classList.remove('empty');
      frame.querySelector('.polaroid-img').replaceChildren(h('img', { src: shot.full, alt: '' }));
    } catch (e) { toast(`Couldn't read that photo${e?.message ? ` (${e.message})` : ''}. Try another one.`); }
  };
  const s = sheet(daily ? 'Today\'s photo' : 'A polaroid', [
    daily ? h('p.small.muted', 'Whatever is in front of you. It stays buried until they post theirs.') : null,
    frame,
    h('div.row', btn([icon('cam'), ' Camera'], () => pick(true), 'ghost'), btn('Library', () => pick(false), 'ghost')),
    btn(daily ? 'Bury it' : 'Drop it in', async (e) => {
      if (!shot) return toast('Pick a photo first.');
      busy(e.currentTarget, true);
      const ok = daily ? await onDone(shot) : await app.send('photo', { thumb: shot.thumb, caption: caption.value.trim() }, { caption: caption.value.trim() }, shot.full, 'image/jpeg');
      if (ok) s.close(); else busy(e.currentTarget, false);
    }, 'primary'),
  ]);
}

export function composeWhisper(app) {
  let rec = null, clip = null, raf = 0, audio = null;
  const MAX = 30;
  const ring = h('div.rec-ring');
  const timer = h('div.rec-time', '0:00');
  const main = h('button.rec-btn', { type: 'button' }, icon('mic'));
  const status = h('p.small.muted', 'Tap to start whispering.');
  const actions = h('div.row', { hidden: true });
  const tick = () => {
    if (!rec) return;
    const t = rec.elapsed(), lv = rec.level();
    timer.textContent = `0:${String(Math.floor(t)).padStart(2, '0')}`;
    ring.style.transform = `scale(${1 + lv * 0.6})`;
    if (t >= MAX) return stop();
    raf = requestAnimationFrame(tick);
  };
  const start = async () => {
    try { rec = new Recorder(); await rec.start(); } catch { rec = null; return toast('Microphone is blocked. Allow it in settings.'); }
    main.replaceChildren(icon('stop')); main.classList.add('on'); status.textContent = 'Recording. Tap to stop.';
    actions.hidden = true; buzz(10); tick();
  };
  const stop = async () => {
    cancelAnimationFrame(raf);
    const r = rec; rec = null; ring.style.transform = '';
    clip = await r.stop();
    main.replaceChildren(icon('mic')); main.classList.remove('on');
    status.textContent = `${clip.dur.toFixed(1)}s whisper ready.`;
    actions.hidden = false;
  };
  main.onclick = () => (rec ? stop() : start());
  actions.append(
    btn([icon('play'), ' Listen'], () => { audio?.pause(); audio = new Audio(URL.createObjectURL(clip.blob)); audio.play(); }, 'ghost'),
    btn('Drop it in', async (e) => {
      busy(e.currentTarget, true);
      const data = await blobToDataURL(clip.blob);
      if (data.length > 2400000) { busy(e.currentTarget, false); return toast('Too long. Keep it under 30 seconds.'); }
      if (await app.send('whisper', { dur: Math.round(clip.dur * 10) / 10 }, {}, data, clip.blob.type)) s.close(); else busy(e.currentTarget, false);
    }, 'primary'));
  const s = sheet('A whisper', [h('div.rec', ring, main), timer, status, actions], { onClose: () => { audio?.pause(); if (rec) rec.stop().catch(() => {}); } });
}

export const WIGGLES = {
  'te quiero': [110, 110, 110, 110, 110],
  'good night': [500, 200, 120, 200, 500],
  'thinking of you': [90, 90, 90, 90, 420],
  'heartbeat': [80, 90, 140, 420, 80, 90, 140],
  'come here': [60, 60, 60, 60, 60, 60, 60, 60, 300],
};
export function composeWiggle(app) {
  let pattern = [], down = 0, lastUp = 0, label = '';
  const pad = h('div.tap-pad', h('span', 'Tap a rhythm here'));
  const show = h('div.pattern');
  const draw = () => show.replaceChildren(...pattern.map((ms, i) => h(`span.${i % 2 ? 'gap' : 'beat'}`, { style: { width: Math.max(4, ms / 8) + 'px' } })));
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (pattern.length && now - lastUp > 2500) pattern = [];
    if (pattern.length) pattern.push(Math.min(1200, Math.round(now - lastUp)));
    down = now; pad.classList.add('on'); buzz(400); label = '';
  });
  const up = () => {
    if (!down) return;
    const now = performance.now(); pattern.push(Math.min(1500, Math.round(now - down))); lastUp = now; down = 0;
    pad.classList.remove('on'); navigator.vibrate?.(0); draw();
    if (pattern.length > 17) pattern = pattern.slice(0, 17);
  };
  pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); pad.addEventListener('pointerleave', up);
  const presets = h('div.chips', Object.keys(WIGGLES).map((k) => h('button.chip', { type: 'button', onclick: () => { pattern = [...WIGGLES[k]]; label = k; draw(); buzz(pattern); } }, k)));
  const s = sheet('A wiggle', [
    h('p.small.muted', 'They feel it as buzzes, and your worm does the dance in their pocket.'),
    pad, show, presets,
    h('div.row', btn('Feel it', () => pattern.length && buzz(pattern), 'ghost'), btn('Clear', () => { pattern = []; draw(); }, 'ghost')),
    btn('Send the wiggle', async (e) => {
      if (!pattern.length) return toast('Tap a rhythm or pick one.');
      busy(e.currentTarget, true);
      if (await app.send('wiggle', { pattern, label: label || null }, { label: label || 'Feel it.' })) s.close(); else busy(e.currentTarget, false);
    }, 'primary'),
  ]);
}

// Found things are Apple emoji everywhere (pocket, picker, shelf, jar, zine).
export function trinketArt(kind, size = 64) {
  return h('span.temoji', { style: { fontSize: `${size}px` } }, trinketEmoji(kind));
}
// ── a song: paste a link, it lands as a record in their pocket
export function composeSong(app) {
  let info = null, asked = '', seq = 0;
  const link = h('input', { placeholder: 'Paste a song link', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', });
  const line = h('input', { placeholder: 'This one is us.', maxLength: 80 });
  const preview = h('div.song-preview.empty', h('div.song-art', { html: recordIcon({ size: 76, shadow: false }) }), h('div.song-meta', h('b', 'Spotify, Apple Music or YouTube'), h('span', 'Copy the link from the Share button and paste it here.')));
  const show = (st) => {
    preview.classList.toggle('empty', st !== 'ok');
    if (st === 'ok') {
      preview.replaceChildren(h('div.song-art', { html: recordIcon({ cover: info.cover, accent: PROVIDERS[info.provider].accent, size: 76, shadow: false, spin: true }) }),
        h('div.song-meta', h('b', info.title || 'A song'), info.artist ? h('span', info.artist) : null, h('span.song-src.mono', PROVIDERS[info.provider].name.toUpperCase())));
    } else {
      preview.replaceChildren(h('div.song-art', { html: recordIcon({ size: 76, shadow: false }) }),
        h('div.song-meta', h('b', st === 'loading' ? 'Finding it…' : st === 'bad' ? 'That link isn\'t a song' : 'Couldn\'t reach it'),
          h('span', st === 'loading' ? ' ' : st === 'bad' ? 'Use a Spotify, Apple Music or YouTube link.' : 'Check the link or your connection and try again.')));
    }
  };
  const look = async () => {
    const text = link.value.trim();
    if (text === asked) return; asked = text; info = null;
    if (!text) return show('idle');
    if (!parseSong(text)) return show('bad');
    const my = ++seq; show('loading');
    try { const r = await songInfo(text); if (my !== seq) return; info = r; show('ok'); }
    catch (e) { if (my !== seq) return; show(e?.message === 'not_a_song' ? 'bad' : 'error'); }
  };
  link.addEventListener('input', () => { clearTimeout(link._t); link._t = setTimeout(look, 350); });
  link.addEventListener('paste', () => setTimeout(look, 30));
  const paste = navigator.clipboard?.readText ? btn('Paste', async () => { try { link.value = await navigator.clipboard.readText(); look(); } catch { link.focus(); } }, 'ghost small') : null;
  const s = sheet('A song', [
    preview,
    field('Link', h('div.song-link', link, paste)),
    field('A line about it', line),
    btn('Drop it in', async (e) => {
      if (!link.value.trim()) return toast('Paste a song link first.');
      if (!info) { await look(); if (!info) return toast('That link didn\'t work. Try the Share → Copy link from the app.'); }
      busy(e.currentTarget, true);
      const payload = { ...info, line: line.value.trim() || null };
      if (await app.send('song', payload, { title: info.title, artist: info.artist, line: payload.line })) s.close(); else busy(e.currentTarget, false);
    }, 'primary'),
  ]);
  setTimeout(() => link.focus(), 350);
}

// The player for a song, right in the sheet.
function songPlayer(p) {
  if (!p.embed) return null;
  const hgt = embedHeight(p);
  const frame = h('iframe', { src: p.embed, title: p.title || 'Song', loading: 'lazy', allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture', allowfullscreen: true, frameborder: '0' });
  if (hgt) frame.style.height = hgt + 'px';
  return h(`div.song-player.${p.provider}`, frame);
}

// ── emoji reactions on things
const match = (e, t) => e.kind === 'react' && (t.to ? e.payload?.to === t.to : e.payload?.day === t.day && e.payload?.part === t.part);
export function reactionsOn(app, target, fromThem = true) {
  return app.S.events.filter((e) => match(e, target) && (fromThem ? e.from_slot !== app.slot() : e.from_slot === app.slot())).map((e) => e.payload.emoji);
}
export function reactRow(app, target) {
  const sent = new Set(reactionsOn(app, target, false));
  const row = h('div.react-row', REACTIONS.map((e) => h(`button.react-emo${sent.has(e) ? '.on' : ''}`, { type: 'button', onclick: async (ev) => {
    const b = ev.currentTarget; if (b.classList.contains('on')) return;
    b.classList.add('on', 'pop');
    await app.react(e, target);
  } }, e)));
  return row;
}
export function theirReactions(app, target) {
  const list = reactionsOn(app, target, true);
  return list.length ? h('div.their-reacts', h('span.small.muted', `${app.them()?.name || 'They'} reacted`), h('span.emos', list.join(' '))) : null;
}

// ── opening things
export function openItem(app, it) {
  const p = it.payload || {};
  const from = it.mine ? 'You sent this' : `From ${app.them()?.name || 'them'}`;
  const meta = h('p.meta', `${from} · ${ago(it.created_at)}`);
  let body = [];
  let onClose = null;
  switch (it.kind) {
    case 'note':
      body = [h('div.paper-card.read', { style: { background: PAPERS[p.paper] || PAPERS.white } }, h('p.handwriting', p.text))];
      break;
    case 'doodle': {
      const size = Math.min(window.innerWidth - 48, 380);
      const cv = h('canvas.doodle-pad', { width: size * 2, height: size * 2, style: { width: size + 'px', height: size + 'px' } });
      const x = cv.getContext('2d'); x.scale(2, 2);
      let k = 0; const play = () => { k = Math.min(1, k + 0.012); x.clearRect(0, 0, size, size); renderStrokes(x, p.strokes || [], size, k); if (k < 1) requestAnimationFrame(play); };
      requestAnimationFrame(play);
      body = [h('div.doodle-wrap', cv)];
      break;
    }
    case 'photo': {
      const img = h('img', { src: p.thumb, alt: '' });
      if (it.media_id) app.backend.media(it.media_id).then((m) => { if (m?.data) img.src = m.data; }).catch(() => {});
      body = [h('div.polaroid', h('div.polaroid-img', img), p.caption ? h('p.handwriting.caption', p.caption) : null)];
      break;
    }
    case 'whisper': {
      let audio = null;
      const playBtn = h('button.rec-btn', { type: 'button' }, icon('play'));
      const bar = h('div.progress', h('span'));
      playBtn.onclick = async () => {
        if (audio && !audio.paused) { audio.pause(); playBtn.replaceChildren(icon('play')); return; }
        if (!audio) {
          playBtn.classList.add('busy');
          try { const m = await app.backend.media(it.media_id); audio = new Audio(m.data); } catch { playBtn.classList.remove('busy'); return toast('Couldn\'t fetch the whisper.'); }
          playBtn.classList.remove('busy');
          audio.ontimeupdate = () => { bar.firstChild.style.width = `${(audio.currentTime / (audio.duration || p.dur || 1)) * 100}%`; };
          audio.onended = () => playBtn.replaceChildren(icon('play'));
        }
        audio.play(); playBtn.replaceChildren(icon('stop'));
      };
      onClose = () => audio?.pause();
      body = [h('div.shell-art', { html: glyphTile('wave', GLYPH_COLORS.whisper, 132) }), h('div.rec', playBtn), bar, h('p.small.muted.center', `${p.dur || ''}s. Hold it up to your ear.`)];
      break;
    }
    case 'wiggle': {
      const pattern = p.pattern || [200];
      const feel = () => { buzz(pattern); return app.pocket.wiggle(pattern); };
      // feel it again: the card drops out of the way so you see your worm dance, then comes back up
      let back = null;
      const again = () => {
        if (back) return;
        s.el.classList.add('lowered');
        back = setTimeout(() => {
          const ms = feel();
          back = setTimeout(() => { back = null; if (s.el.isConnected) s.el.classList.remove('lowered'); }, ms + 1100);
        }, 380);
      };
      body = [h('div.shell-art', { html: glyphTile('sine', GLYPH_COLORS.wiggle, 132) }), h('p.big-quote', p.label ? `“${p.label}”` : 'A wiggle'), btn('Feel it again', again, 'primary')];
      setTimeout(feel, 400);
      break;
    }
    case 'song': {
      const pv = PROVIDERS[p.provider] || PROVIDERS.spotify;
      body = [
        h('div.song-big', { html: recordIcon({ cover: p.cover, accent: pv.accent, size: 168, spin: true }) }),
        h('p.big-quote.song-title', p.title || 'A song'),
        p.artist ? h('p.song-artist', p.artist) : null,
        p.line ? h('p.handwriting.center', p.line) : null,
        songPlayer(p),
        p.url ? h('a.btn.ghost.song-open', { href: p.url, target: '_blank', rel: 'noopener' }, `Open in ${pv.name}`) : null,
      ].filter(Boolean);
      break;
    }
    case 'trinket':
      body = [h('div.trinket-big', trinketArt(p.what, 120)), h('p.big-quote', TRINKETS[p.what] || 'Something'), p.text ? h('p.trinket-print.mono', p.text) : null, p.inscription ? h('p.handwriting.center', p.inscription) : null].filter(Boolean);
      break;
  }
  const keepBtn = h('button.btn.ghost', { type: 'button' }, icon(it.kept ? 'heartFill' : 'heart'), it.kept ? ' Kept' : ' Keep it');
  keepBtn.onclick = async () => {
    it.kept = !it.kept;
    keepBtn.replaceChildren(icon(it.kept ? 'heartFill' : 'heart'), it.kept ? ' Kept' : ' Keep it');
    if (it.kept) toast('Kept. It\'s in the suitcase on your shelf.');
    try { await app.backend.open(it.id, it.kept); } catch { /* */ }
    app.shelfChanged({ ...it, kept: it.kept });
    app.refreshPocket();
  };
  const stash = btn('Put in the jar', () => { app.stash(it.id); s.close(); }, 'ghost');
  const about = { note: 'note', doodle: 'doodle', photo: 'polaroid', whisper: 'whisper', wiggle: 'wiggle', song: 'song', trinket: 'found thing' }[it.kind];
  const target = { to: it.id, about };
  const s = sheet(titleFor(it), [...body, meta, it.mine ? theirReactions(app, target) : reactRow(app, target), h('div.row', keepBtn, it.mine ? null : stash)], { onClose, quiet: true });
  if (!it.mine && !it.opened_at) { it.opened_at = new Date().toISOString(); it.opened = true; app.backend.open(it.id).catch(() => {}); app.refreshPocket(); }
}

export function titleFor(it) {
  return { note: 'A note', doodle: 'A doodle', photo: 'A polaroid', whisper: 'A whisper', wiggle: 'A wiggle', song: 'A song', trinket: 'Something they found' }[it.kind] || 'Something';
}
