// Making things to drop through the hole, and opening things that came out of it.
import { h, ago, clamp } from './util.js';
import { sheet, btn, icon, toast, field, segmented } from './ui.js';
import { PAPERS, TRINKETS, drawTrinket, renderStrokes } from './draw.js';
import { photoFromFile, Recorder, blobToDataURL } from './media.js';
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
  let ink = inks[1], width = 14;
  const strokes = []; let cur = null;
  const redraw = () => { x.clearRect(0, 0, size, size); renderStrokes(x, strokes, size, 1); };
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 1000), Math.round(clamp((e.clientY - r.top) / r.height, 0, 1) * 1000)]; };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); cur = { c: ink, w: width, p: pt(e) }; strokes.push(cur); redraw(); });
  cv.addEventListener('pointermove', (e) => {
    if (!cur) return; const [a, b] = pt(e), n = cur.p.length;
    if (Math.hypot(a - cur.p[n - 2], b - cur.p[n - 1]) > 5) { cur.p.push(a, b); redraw(); }
  });
  const end = () => { cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const inkRow = h('div.inks', inks.map((c) => h(`button.ink${c === ink ? '.on' : ''}`, { type: 'button', style: { background: c }, onclick: (e) => { ink = c; [...inkRow.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } })));
  const s = sheet('A doodle', [
    h('div.doodle-wrap', cv),
    inkRow,
    h('div.row.between',
      segmented({ 8: 'Fine', 14: 'Marker', 30: 'Fat' }, '14', (k) => { width = +k; }),
      h('div.row', h('button.icon-btn', { type: 'button', onclick: () => { strokes.pop(); redraw(); }, title: 'Undo' }, icon('undo')))),
    btn('Drop it in', async (e) => {
      if (!strokes.length) return toast('Draw something first.');
      busy(e.currentTarget, true);
      if (await app.send('doodle', { strokes })) s.close(); else busy(e.currentTarget, false);
    }, 'primary'),
  ], { wide: true });
}

export function composePhoto(app, { daily = false, onDone } = {}) {
  let shot = null;
  const caption = h('input.handwriting', { placeholder: daily ? '' : 'Write on the bottom…', maxLength: 60 });
  const frame = h('div.polaroid.empty', h('div.polaroid-img', h('span.small.muted', 'No photo yet')), daily ? null : caption);
  const pick = (capture) => {
    const inp = h('input', { type: 'file', accept: 'image/*' });
    if (capture) inp.setAttribute('capture', 'environment');
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      try {
        shot = await photoFromFile(f);
        frame.classList.remove('empty');
        frame.querySelector('.polaroid-img').replaceChildren(h('img', { src: shot.full, alt: '' }));
        sfx.pop();
      } catch { toast('Couldn\'t read that photo.'); }
    };
    inp.click();
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

export function trinketCanvas(kind, size = 64, text = '') {
  const c = h('canvas', { width: size * 2, height: size * 2, style: { width: size + 'px', height: size + 'px' } });
  const x = c.getContext('2d'); x.scale(2, 2); x.translate(size / 2, size / 2);
  x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = 4; x.shadowOffsetY = 2;
  drawTrinket(x, kind, size * 0.3, text);
  return c;
}
export function composeTrinket(app) {
  let what = null;
  const label = h('input', { placeholder: 'Ticket line, bar name…', maxLength: 9 });
  const note = h('input', { placeholder: 'Where did you find it?', maxLength: 80 });
  const labelField = field('Printed on it', label); labelField.hidden = true;
  const grid = h('div.trinkets', Object.entries(TRINKETS).map(([k, name]) =>
    h('button.trinket', { type: 'button', onclick: (e) => { what = k; [...grid.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); labelField.hidden = !['ticket', 'matchbook'].includes(k); sfx.pop(); } },
      trinketCanvas(k, 52), h('span', name.replace(/^an? /, '')))));
  const s = sheet('Something you found', [
    grid, labelField, field('A line about it', note),
    btn('Slip it in', async (e) => {
      if (!what) return toast('Pick a thing.');
      busy(e.currentTarget, true);
      const payload = { what, text: label.value.trim() || null, inscription: note.value.trim() || null };
      if (await app.send('trinket', payload, { what: TRINKETS[what], inscription: payload.inscription })) s.close(); else busy(e.currentTarget, false);
    }, 'primary'),
  ], { wide: true });
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
      body = [h('div.shell-art', trinketShell()), h('div.rec', playBtn), bar, h('p.small.muted.center', `${p.dur || ''}s. Hold it up to your ear.`)];
      break;
    }
    case 'wiggle': {
      const feel = () => { buzz(p.pattern || [200]); app.pocket.wiggle(p.pattern || [200]); };
      body = [h('p.big-quote', p.label ? `“${p.label}”` : 'A wiggle'), btn('Feel it again', feel, 'primary')];
      setTimeout(feel, 400);
      break;
    }
    case 'trinket':
      body = [h('div.trinket-big', trinketCanvas(p.what, 150, p.text)), h('p.big-quote', TRINKETS[p.what] || 'Something'), p.inscription ? h('p.handwriting.center', p.inscription) : null];
      break;
  }
  const keepBtn = h('button.btn.ghost', { type: 'button' }, icon(it.kept ? 'heartFill' : 'heart'), it.kept ? ' Kept' : ' Keep in pocket');
  keepBtn.onclick = async () => {
    it.kept = !it.kept;
    keepBtn.replaceChildren(icon(it.kept ? 'heartFill' : 'heart'), it.kept ? ' Kept' : ' Keep in pocket');
    try { await app.backend.open(it.id, it.kept); } catch { /* */ }
    app.refreshPocket();
  };
  const stash = btn('Put in the jar', () => { app.stash(it.id); s.close(); }, 'ghost');
  const s = sheet(titleFor(it), [...body, meta, h('div.row', keepBtn, it.mine ? null : stash)], { onClose });
  if (!it.mine && !it.opened_at) { it.opened_at = new Date().toISOString(); it.opened = true; app.backend.open(it.id).catch(() => {}); app.refreshPocket(); }
  sfx.paper();
}

export function titleFor(it) {
  return { note: 'A note', doodle: 'A doodle', photo: 'A polaroid', whisper: 'A whisper', wiggle: 'A wiggle', trinket: 'Something they found' }[it.kind] || 'Something';
}
function trinketShell() {
  return h('div', { html: `<svg viewBox="0 0 120 100" width="150"><defs><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F9D3BE"/><stop offset="1" stop-color="#E59E86"/></linearGradient></defs><path d="M60 92 C 20 70 6 40 14 22 C 30 6 90 6 106 22 C 114 40 100 70 60 92Z" fill="url(#sh)"/>${[...Array(7)].map((_, i) => `<path d="M60 88 L ${18 + i * 14} ${18 + Math.abs(3 - i) * 3}" stroke="rgba(160,80,60,.45)" stroke-width="2" fill="none"/>`).join('')}<rect x="50" y="86" width="20" height="8" rx="2" fill="#E59E86"/></svg>` });
}
