// Our year, printed: a half-letter zine (5.5 × 8.5 in) drawn page by page on canvas,
// then bound into a PDF right here on the phone. No server, no libraries.
import { h, fmtDistance, store } from './util.js';
import { sheet, btn, toast, segmented } from './ui.js';
import { makeSky, skyFor, PAPERS, TRINKETS, renderStrokes, mixHex, SKY } from './draw.js';
import { drawEmoji } from './brush.js';
import { trinketEmoji, drawGlyphTile, drawRecord } from './icons.js';
import { PROVIDERS } from './music.js';
import { Worm } from './worm.js';
import { SOIL_BG, SOIL_FG } from './soil.js';

const DPI = 180, U = DPI / 72;               // draw in points, render at 180 dpi
const PW = 396, PH = 612, M = 36, CW = PW - M * 2;
const TOP = 58, BOTTOM = PH - 58;
const SANS = 'Geist, -apple-system, "Helvetica Neue", Arial, sans-serif';
const MONO = '"Geist Mono", ui-monospace, Menlo, monospace';
const INK = '#0B0B0C', INK2 = '#6E6E73', SEED = '#2E5A1C';
const DROP_KINDS = ['note', 'photo', 'doodle', 'song', 'trinket', 'whisper', 'wiggle'];

// ── gathering a year out of the soil
async function gather(app, year, onStep) {
  const from = `${year}-01-01T00:00:00Z`, to = `${year + 1}-01-01T00:00:00Z`;
  onStep('Digging up the year…');
  const drops = [];
  let before = to;
  for (;;) {
    const page = await app.backend.archive({ before, after: from, limit: 200 });
    drops.push(...page);
    if (page.length < 200) break;
    before = page[page.length - 1].created_at;
  }
  const visible = drops.filter((e) => DROP_KINDS.includes(e.kind) && (e.from_slot === app.slot() || e.opened_at));
  const dailies = (await app.backend.dailies(400)).filter((r) => String(r.day).startsWith(String(year)) && (r.my_answer || r.their_answer || r.my_thumb || r.their_thumb));
  let stats = [];
  try { stats = await app.backend.stats(from, to); } catch { /* numbers page gets thinner */ }
  const days = new Map();
  const day = (k) => { if (!days.has(k)) days.set(k, { day: k, daily: null, drops: [] }); return days.get(k); };
  for (const r of dailies) day(String(r.day).slice(0, 10)).daily = r;
  for (const e of visible) day(app.dayOf(e.created_at)).drops.push(e);
  for (const L of days.values()) L.drops.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return { year, days: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)), stats, dailies, drops: visible };
}

const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

// ── canvas helpers
function font(x, w, size, mono = false) { x.font = `${w} ${size}px ${mono ? MONO : SANS}`; }
function wrap(x, text, maxW, maxLines = 99) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = []; let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (!line || x.measureText(t).width <= maxW) line = t; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return lines;
}
function rrect(x, X, Y, W, H, r) { x.beginPath(); x.roundRect ? x.roundRect(X, Y, W, H, r) : x.rect(X, Y, W, H); }
function cover(x, img, X, Y, W, H) {
  const s = Math.max(W / img.width, H / img.height), sw = W / s, sh = H / s;
  x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, X, Y, W, H);
}
function wave(x, y, amp, seed, W = PW) {
  x.moveTo(0, y);
  for (let i = 0; i <= 8; i++) {
    const px = (W / 8) * i, py = y + Math.sin(i * 1.7 + seed) * amp + Math.sin(i * 0.6 + seed * 2) * amp * 0.5;
    x.lineTo(px, py);
  }
}
function softShadow(x) { x.shadowColor = 'rgba(70,45,20,0.2)'; x.shadowBlur = 5; x.shadowOffsetY = 1.5; }
function noShadow(x) { x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0; }

// ── page furniture
function footer(x, n) {
  x.fillStyle = SOIL_BG; x.fillRect(0, PH - 26, PW, 26);
  font(x, 500, 7, true); x.fillStyle = '#FFFFFF'; x.textAlign = 'center'; x.fillText(String(n), PW / 2, PH - 10); x.textAlign = 'left';
}
function runningHead(x, left) {
  font(x, 500, 6.5, true); x.fillStyle = INK2;
  x.fillText(left.toUpperCase(), M, 32);
  x.textAlign = 'right'; x.fillText('BOLSILLO WORM', PW - M, 32); x.textAlign = 'left';
}

// ── blocks: each measures itself, then draws at (M, y)
function headerBlock(x, app, L) {
  const q = app.questionFor(L.day);
  const label = new Date(L.day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
  return { h: 20, keep: true, draw(y) {
    font(x, 500, 7, true); x.fillStyle = INK; x.fillText(label, M, y + 8);
    if (q.by && L.daily) { x.fillStyle = SEED; x.textAlign = 'right'; x.fillText(q.mine ? 'YOU PLANTED THIS ONE' : `${q.by.toUpperCase()} PLANTED THIS ONE`, PW - M, y + 8); x.textAlign = 'left'; }
    x.strokeStyle = '#E5E5EA'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(M, y + 14); x.lineTo(PW - M, y + 14); x.stroke();
  } };
}
function qaBlock(x, app, L, names) {
  const r = L.daily; if (!r || !(r.my_answer || r.their_answer)) return null;
  const q = app.questionFor(L.day).q;
  font(x, 600, 12.5); const ql = wrap(x, q, CW);
  const colW = (CW - 10) / 2, pad = 8;
  font(x, 400, 9.2);
  const a = [[names[0], r.my_answer], [names[1], r.their_answer || (r.their_answered ? 'Buried.' : 'No answer.')]].map(([n, t]) => ({ n, lines: wrap(x, t || 'No answer.', colW - pad * 2, 14), faint: !t }));
  const boxH = Math.max(...a.map((c) => c.lines.length)) * 12 + 14 + pad * 2;
  return { h: ql.length * 15 + 8 + boxH, draw(y) {
    font(x, 600, 12.5); x.fillStyle = INK; ql.forEach((l, i) => x.fillText(l, M, y + 11 + i * 15));
    const by = y + ql.length * 15 + 8;
    a.forEach((c, i) => {
      const bx = M + i * (colW + 10);
      rrect(x, bx, by, colW, boxH, 7); x.fillStyle = '#F2F2F7'; x.fill();
      font(x, 500, 6.3, true); x.fillStyle = INK; x.fillText(c.n.toUpperCase(), bx + pad, by + pad + 6);
      font(x, c.faint ? 'italic 400' : 400, 9.2); x.fillStyle = INK;
      c.lines.forEach((l, j) => x.fillText(l, bx + pad, by + pad + 20 + j * 12));
    });
  } };
}
function photosBlock(x, imgs, names) {
  const have = imgs.map((im, i) => ({ im, label: `${names[i]}'s day` })).filter((p) => p.im);
  if (!have.length) return null;
  const W = 132, IMG = 120;
  return { h: W + 26, draw(y) {
    have.forEach((p, i) => {
      const cx = have.length === 1 ? PW / 2 : PW / 2 + (i ? 74 : -74);
      x.save(); x.translate(cx, y + W / 2 + 6); x.rotate((i ? 1.6 : -1.4) * Math.PI / 180);
      softShadow(x); x.fillStyle = '#fff'; x.fillRect(-W / 2, -W / 2, W, W + 14); noShadow(x);
      cover(x, p.im, -IMG / 2, -IMG / 2 - 2, IMG, IMG);
      font(x, 400, 7.5); x.fillStyle = INK2; x.textAlign = 'center'; x.fillText(p.label, 0, W / 2 + 7); x.textAlign = 'left';
      x.restore();
    });
  } };
}
function tileFor(x, app, e, img, names) {
  const p = e.payload || {}, TW = 100;
  const who = e.from_slot === app.slot() ? names[0] : names[1];
  const label = (y) => { font(x, 500, 5.8, true); x.fillStyle = INK2; x.textAlign = 'center'; x.fillText(`FROM ${who.toUpperCase()}`, TW / 2, y); x.textAlign = 'left'; };
  const rot = (((e.id * 37) % 7) - 3) * 0.5 * Math.PI / 180;
  switch (e.kind) {
    case 'note': {
      font(x, 400, 8); const lines = wrap(x, p.text, TW - 14, 13); const hh = lines.length * 10.5 + 16;
      return { h: hh + 14, draw(X, Y) {
        x.save(); x.translate(X + TW / 2, Y + hh / 2); x.rotate(rot); softShadow(x); x.fillStyle = PAPERS[p.paper] || '#fff'; x.fillRect(-TW / 2, -hh / 2, TW, hh); noShadow(x);
        font(x, 400, 8); x.fillStyle = INK; lines.forEach((l, i) => x.fillText(l, -TW / 2 + 7, -hh / 2 + 15 + i * 10.5)); x.restore();
        x.save(); x.translate(X, Y); label(hh + 11); x.restore();
      } };
    }
    case 'photo': return { h: 128, draw(X, Y) {
      x.save(); x.translate(X + TW / 2, Y + 57); x.rotate(rot); softShadow(x); x.fillStyle = '#fff'; x.fillRect(-TW / 2, -57, TW, 114); noShadow(x);
      if (img) cover(x, img, -44, -51, 88, 88);
      if (p.caption) { font(x, 400, 7); x.fillStyle = INK; x.textAlign = 'center'; x.fillText(wrap(x, p.caption, 88, 1)[0] || '', 0, 52); x.textAlign = 'left'; }
      x.restore(); x.save(); x.translate(X, Y); label(125); x.restore();
    } };
    case 'doodle': return { h: 114, draw(X, Y) {
      x.save(); x.translate(X, Y); softShadow(x); x.fillStyle = '#fff'; x.fillRect(0, 0, TW, TW); noShadow(x);
      renderStrokes(x, p.strokes || [], TW, 1); label(111); x.restore();
    } };
    case 'song': {
      font(x, 600, 8); const tl = wrap(x, p.title || 'A song', TW - 4, 2);
      font(x, 400, 7.5); const extra = [p.artist, p.line ? `“${p.line}”` : null].filter(Boolean).flatMap((t) => wrap(x, t, TW - 6, 2));
      const hh = 78 + tl.length * 10 + extra.length * 9.5 + 12;
      return { h: hh, draw(X, Y) {
        x.save(); x.translate(X + TW / 2, Y + 34); drawRecord(x, 76, { img, accent: PROVIDERS[p.provider]?.accent }); x.restore();
        x.textAlign = 'center';
        font(x, 600, 8); x.fillStyle = INK; tl.forEach((l, i) => x.fillText(l, X + TW / 2, Y + 80 + i * 10));
        font(x, 400, 7.5); x.fillStyle = INK2; extra.forEach((l, i) => x.fillText(l, X + TW / 2, Y + 80 + tl.length * 10 + i * 9.5));
        x.textAlign = 'left';
        x.save(); x.translate(X, Y); label(hh - 3); x.restore();
      } };
    }
    case 'trinket': {
      font(x, 400, 7.5); const ins = p.inscription ? wrap(x, p.inscription, TW - 6, 3) : [];
      return { h: 74 + ins.length * 9.5 + 12, draw(X, Y) {
        x.save(); x.translate(X + TW / 2, Y + 34); softShadow(x); drawEmoji(x, trinketEmoji(p.what), 0, 0, 30); noShadow(x); x.restore();
        font(x, 500, 7.5); x.fillStyle = INK; x.textAlign = 'center'; x.fillText((TRINKETS[p.what] || 'something').replace(/^an? /, ''), X + TW / 2, Y + 70); x.textAlign = 'left';
        font(x, 400, 7.5); x.fillStyle = INK2; x.textAlign = 'center'; ins.forEach((l, i) => x.fillText(l, X + TW / 2, Y + 80 + i * 9.5)); x.textAlign = 'left';
        x.save(); x.translate(X, Y); label(74 + ins.length * 9.5 + 9); x.restore();
      } };
    }
    case 'whisper': case 'wiggle': return { h: 66, draw(X, Y) {
      x.save(); x.translate(X + TW / 2, Y + 17); drawGlyphTile(x, e.kind === 'whisper' ? 'wave' : 'sine', 26, 0.4); x.restore();
      x.save(); x.translate(X, Y);
      font(x, 500, 8.5); x.fillStyle = INK; x.textAlign = 'center';
      x.fillText(e.kind === 'whisper' ? `a ${Math.round(p.dur || 0)}s whisper` : (p.label || 'a wiggle'), TW / 2, 45);
      x.textAlign = 'left'; label(62); x.restore();
    } };
  }
  return null;
}
function dropRows(x, app, drops, imgs, names) {
  const tiles = drops.map((e) => tileFor(x, app, e, imgs.get(e.id), names)).filter(Boolean);
  const rows = [];
  for (let i = 0; i < tiles.length; i += 3) {
    const row = tiles.slice(i, i + 3), hh = Math.max(...row.map((t) => t.h));
    const total = row.length * 100 + (row.length - 1) * 12, x0 = M + (CW - total) / 2;
    rows.push({ h: hh + 8, draw(y) { row.forEach((t, j) => t.draw(x0 + j * 112, y + 4)); } });
  }
  return rows;
}

// ── special pages
function wormOn(x, design, cx, cy, R, segs, angle, steps = 160) {
  const w = new Worm(design || {}, { x: cx, y: cy, R, segs, angle });
  w.speedBase = R * 2.4;
  const bounds = { l: Math.max(M + 16, cx - 110), r: Math.min(PW - M - 16, cx + 110), t: cy - 80, b: cy + 60 };
  for (let i = 0; i < steps; i++) w.update(1 / 60, { bounds, gx: 0, gy: 0 });
  w.draw(x);
}
function coverPage(x, app, data, names) {
  const me = app.me(), them = app.them();
  x.drawImage(makeSky(PW, PH, U, SKY), 0, 0, PW, PH);
  font(x, 500, 7, true); x.fillStyle = INK; x.fillText('A YEAR IN EACH OTHER\'S POCKETS', M, 52);
  font(x, 600, 58); x.fillText('Bolsillo', M - 2, 112); x.fillText('Worm', M - 2, 164);
  font(x, 400, 15); x.fillText(`${names[0]} & ${names[1]}`, M, 196);
  const hx = PW / 2, hy = PH - 150;
  wormOn(x, them?.worm, hx - 70, hy - 120, 15, 18, -0.6);
  wormOn(x, me?.worm, hx + 60, hy - 60, 15, 16, 2.4, 220);
  font(x, 600, 64); x.fillStyle = INK; x.fillText(String(data.year), M - 2, PH - 44);
  font(x, 500, 6.5, true); x.textAlign = 'right';
  x.fillText([me?.place?.city, them?.place?.city].filter(Boolean).join(' · ').toUpperCase(), PW - M, PH - 46); x.textAlign = 'left';
}
function numbersPage(x, app, data, names, n) {
  const S = (k, slot) => data.stats.filter((r) => r.kind === k && (slot == null || r.from_slot === slot)).reduce((a, r) => a + Number(r.n), 0);
  const both = data.dailies.filter((r) => r.my_answer && r.their_answer).length;
  const photos = data.dailies.reduce((a, r) => a + (r.my_thumb ? 1 : 0) + (r.their_thumb ? 1 : 0), 0) + data.drops.filter((e) => e.kind === 'photo').length;
  const hole = app.S.hole || {};
  const units = store('settings')?.units || app.defaultUnits();
  const mine = app.slot(), theirs = 1 - mine;
  const items = [
    [both, 'question you both answered', 'questions you both answered'],
    [photos, 'photo traded', 'photos traded'],
    [S('kiss', mine), `kiss from ${names[0]}`, `kisses from ${names[0]}`],
    [S('kiss', theirs), `kiss from ${names[1]}`, `kisses from ${names[1]}`],
    [data.drops.filter((e) => e.kind === 'note').length, 'note folded', 'notes folded'],
    [S('pet') + S('boop'), 'pet or boop', 'pets and boops'],
    [S('feed'), 'crumb fed', 'crumbs fed'],
    [S('touch'), 'fingertip touch', 'fingertip touches'],
    [S('plant'), 'question planted', 'questions planted'],
    [S('react'), 'emoji reaction', 'emoji reactions'],
  ].filter(([v]) => v > 0).map(([v, one, many]) => [v, v === 1 ? one : many]);
  x.fillStyle = '#fff'; x.fillRect(0, 0, PW, PH);
  runningHead(x, String(data.year));
  font(x, 600, 26); x.fillStyle = INK; x.fillText('The year in numbers', M, 92);
  const colW = CW / 2;
  items.slice(0, 10).forEach(([v, label], i) => {
    const cx = M + (i % 2) * colW, cy = 140 + Math.floor(i / 2) * 74;
    font(x, 600, 34); x.fillStyle = INK; x.fillText(Number(v).toLocaleString(), cx, cy + 26);
    font(x, 400, 9); x.fillStyle = INK2; wrap(x, label, colW - 14, 2).forEach((l, j) => x.fillText(l, cx, cy + 42 + j * 11));
  });
  const dug = (hole.tunnels_done || 0) * (hole.tunnel_km || 0) + (hole.dug_km || 0);
  font(x, 400, 10); x.fillStyle = INK;
  const tail = wrap(x, `${fmtDistance(dug, units)} of tunnel dug between ${app.me()?.place?.city || 'here'} and ${app.them()?.place?.city || 'there'}${hole.tunnels_done ? `, ${hole.tunnels_done} all the way through` : ''}.`, CW);
  tail.forEach((l, i) => x.fillText(l, M, 140 + Math.ceil(items.length / 2) * 74 + 14 + i * 13));
  footer(x, n);
}
function monthPage(x, monthDay, count) {
  x.fillStyle = SOIL_BG; x.fillRect(0, 0, PW, PH);
  const name = new Date(monthDay + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase();
  font(x, 800, 66); const fit = Math.min(66, (66 * (PW - M * 2)) / x.measureText(name).width);
  font(x, 800, fit); x.fillStyle = SOIL_FG;
  x.fillText(name, M - 3, PH - 92);
  font(x, 500, 8, true); x.fillStyle = '#FFFFFF';
  x.fillText(`${count} DAY${count === 1 ? '' : 'S'} · ${monthDay.slice(0, 4)}`, M, PH - 64);
}
function backPage(x, app) {
  const dusk = skyFor(null, new Date(), 3);
  x.drawImage(makeSky(PW, PH, U, dusk), 0, 0, PW, PH);
  wormOn(x, app.them()?.worm, PW / 2 - 40, PH / 2 - 48, 11, 13, -0.3, 30);
  wormOn(x, app.me()?.worm, PW / 2 + 40, PH / 2 - 62, 11, 13, Math.PI + 0.3, 30);
  font(x, 600, 18); x.fillStyle = INK; x.textAlign = 'center';
  x.fillText('Same pocket soon.', PW / 2, PH / 2 + 40);
  font(x, 500, 6.5, true); x.fillStyle = INK;
  x.fillText('MADE FOR TWO', PW / 2, PH - 40); x.textAlign = 'left';
}

// ── the PDF: one full-bleed JPEG per page
async function toPDF(jpegs) {
  const enc = new TextEncoder(), parts = [], offsets = [];
  let pos = 0;
  const put = (d) => { const b = typeof d === 'string' ? enc.encode(d) : d; parts.push(b); pos += b.length; };
  const obj = (n, ...body) => { offsets[n] = pos; put(`${n} 0 obj\n`); body.forEach(put); put('\nendobj\n'); };
  put('%PDF-1.4\n%âãÏÓ\n');
  const n = jpegs.length, kids = jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  jpegs.forEach((j, i) => {
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
    const stream = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
    obj(ct, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    obj(im, `<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.bytes.length} >>\nstream\n`, j.bytes, '\nendstream');
  });
  const xref = pos, count = 3 + n * 3;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

export async function makeZine(app, year, { onStep = () => {}, onPage = () => {} } = {}) {
  await Promise.all(['400', '500', '600'].map((w) => document.fonts.load(`${w} 12px Geist`).catch(() => {})).concat(document.fonts.load('500 12px "Geist Mono"').catch(() => {})));
  const data = await gather(app, year, onStep);
  const names = [app.me()?.name || 'You', app.them()?.name || 'Them'];
  onStep('Developing the photos…');
  const imgs = new Map();
  await Promise.all(data.drops.filter((e) => e.kind === 'photo' || e.kind === 'song').map(async (e) => imgs.set(e.id, await loadImg(e.kind === 'song' ? e.payload?.cover : e.payload?.thumb))));
  const dayImgs = new Map();
  await Promise.all(data.days.filter((L) => L.daily).map(async (L) => dayImgs.set(L.day, await Promise.all([loadImg(L.daily.my_thumb), loadImg(L.daily.their_thumb)]))));

  const cv = document.createElement('canvas'); cv.width = Math.round(PW * U); cv.height = Math.round(PH * U);
  const x = cv.getContext('2d');
  const jpegs = [];
  const months = [...new Set(data.days.map((L) => L.day.slice(0, 7)))];
  let pageNo = 0;
  const page = async (draw) => {
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
    x.setTransform(U, 0, 0, U, 0, 0); x.textBaseline = 'alphabetic'; noShadow(x);
    pageNo++; draw(pageNo);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.88));
    jpegs.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height });
    onPage(cv, pageNo);
    await new Promise((r) => setTimeout(r, 0));
  };

  onStep('Setting the cover…');
  await page(() => coverPage(x, app, data, names));
  await page((n) => numbersPage(x, app, data, names, n));

  for (const m of months) {
    const days = data.days.filter((L) => L.day.startsWith(m));
    onStep(`Laying out ${new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}…`);
    await page(() => monthPage(x, days[0].day, days.length));
    // flow the month's days onto pages, keeping each day together when it fits
    const label = new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const CAP = BOTTOM - TOP, GAP = 10;
    let placed = [], y = TOP;
    const flush = async () => {
      if (!placed.length) return;
      const pl = placed; placed = []; y = TOP;
      await page((n) => { runningHead(x, label); pl.forEach(([b, by]) => b.draw(by)); footer(x, n); });
    };
    for (const L of days) {
      const g = [headerBlock(x, app, L), qaBlock(x, app, L, names), photosBlock(x, dayImgs.get(L.day) || [], names), ...dropRows(x, app, L.drops, imgs, names)].filter(Boolean);
      if (g.length < 2) continue;
      const total = g.reduce((a, b) => a + b.h, 0) + (g.length - 1) * GAP;
      if (y + total > BOTTOM && placed.length && total <= CAP) await flush();
      for (let k = 0; k < g.length; k++) {
        const b = g[k], next = g[k + 1];
        const need = b.h + (b.keep && next ? GAP + next.h : 0);
        if (y + need > BOTTOM && placed.length) await flush();
        placed.push([b, y]); y += b.h + GAP;
      }
      y += 14;
    }
    await flush();
  }
  if (!months.length) await page((n) => { runningHead(x, String(year)); font(x, 600, 22); x.fillStyle = INK; x.fillText('Nothing settled yet.', M, 120); font(x, 400, 11); x.fillStyle = INK2; wrap(x, 'Answer questions together and open what lands in your pockets. It all ends up here.', CW).forEach((l, j) => x.fillText(l, M, 146 + j * 15)); footer(x, n); });
  await page(() => backPage(x, app));
  onStep('Binding…');
  return { blob: await toPDF(jpegs), pages: jpegs.length, days: data.days.length };
}

// ── the sheet
export function zineSheet(app) {
  const now = new Date().getFullYear();
  const first = app.S.hole?.created_at ? new Date(app.S.hole.created_at).getFullYear() : now;
  const years = []; for (let y = now; y >= first; y--) years.push(y);
  let year = now, result = null;
  const status = h('p.small.muted', '');
  const thumbs = h('div.zine-pages');
  const go = btn('Make the zine', () => run(), 'primary wide');
  const save = btn('Save the PDF', () => share(), 'primary wide'); save.hidden = true;
  const s = sheet('Our year, printed', [
    h('p.small.muted', 'A half-letter zine (5.5 × 8.5 in) of your year: the questions you both answered, your photos of the day, notes, polaroids, doodles and found things. Print it double-sided, or send the PDF to a print shop.'),
    years.length > 1 ? segmented(Object.fromEntries(years.map((y) => [y, String(y)])), String(year), (k) => { year = +k; result = null; save.hidden = true; go.hidden = false; thumbs.replaceChildren(); status.textContent = ''; }) : null,
    thumbs, status, go, save,
  ].filter(Boolean), { tall: true });

  async function run() {
    go.disabled = true; go.textContent = 'Printing…'; thumbs.replaceChildren();
    try {
      result = await makeZine(app, year, {
        onStep: (t) => { status.textContent = t; },
        onPage: (cv) => { const t = document.createElement('canvas'); t.width = 132; t.height = 204; t.getContext('2d').drawImage(cv, 0, 0, 132, 204); thumbs.append(h('div.zine-page', t)); thumbs.scrollLeft = thumbs.scrollWidth; },
      });
      status.textContent = `${result.pages} pages · ${(result.blob.size / 1048576).toFixed(1)} MB`;
      go.hidden = true; save.hidden = false;
    } catch (e) {
      console.error(e); status.textContent = 'Something got stuck in the press. Try again.';
    }
    go.disabled = false; go.textContent = 'Make the zine';
  }
  async function share() {
    if (!result) return;
    const name = `bolsillo-worm-${year}.pdf`;
    const file = new File([result.blob], name, { type: 'application/pdf' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `Bolsillo Worm ${year}` }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    const a = h('a', { href: URL.createObjectURL(file), download: name });
    document.body.append(a); a.click(); a.remove();
    toast('Saved.');
  }
  return s;
}
