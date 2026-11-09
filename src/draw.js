// Everything that lives in a pocket, drawn by hand on canvas.
import { seeded, hash } from './util.js';
import { wobblyCircle, dab } from './brush.js';


// ── light-wash denim, flat color + woven texture ─────────────
export const DENIM = '#8EC8FF';
export const THREAD = '#E3A23F';

export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return '#' + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('');
}
export function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

// ── the pocket: a soft daytime sky, light blue fading to white, with fine grain ──
export const KISS_EMOJI = ['', '😗', '😙', '😘', '💋', '😍'];
export const KISS_NAMES = ['', 'piquito', 'besito', 'beso', 'besote', 'BESAZO'];
export const REACTIONS = ['❤️', '🥰', '🥺', '😂', '🔥', '🫶', '✨', '😴'];
export const SKY = { top: '#6FBEFF', mid: '#B7E0FF', bottom: '#EEF6FF' };
// the same sky through the day, following the sun where their worm lives
const SKIES = {
  goldDusk: { top: '#80A8EA', mid: '#F3C2B1', bottom: '#FFE3C2' },
  goldDawn: { top: '#8AB3F0', mid: '#F5C8D6', bottom: '#FFEEDF' },
  twiDusk: { top: '#33458E', mid: '#7D70B3', bottom: '#E9A28D' },
  twiDawn: { top: '#3C4F97', mid: '#8C7EBE', bottom: '#F1B2B4' },
  night: { top: '#0A1331', mid: '#15275C', bottom: '#2A4584' },
};
const mixSky = (a, b, t) => ({ top: mixHex(a.top, b.top, t), mid: mixHex(a.mid, b.mid, t), bottom: mixHex(a.bottom, b.bottom, t) });
const lum = (hex) => { const v = parseInt(hex.slice(1), 16); const c = [16, 8, 0].map((s) => { const x = ((v >> s) & 255) / 255; return x <= 0.04 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };

// solar altitude in degrees, and whether it's morning, for a lat/lon at a moment
export function sunAt(lat, lon, date = new Date()) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  let H = (gmst * 15 + lon) * rad - ra;
  H = Math.atan2(Math.sin(H), Math.cos(H));
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(H)) / rad;
  return { alt, am: H < 0 };
}

// day: your gradient. dawn/dusk: warmer. night: deep blue with stars.
export function skyFor(place, date = new Date(), altOverride = null) {
  const has = place && Number.isFinite(+place.lat) && Number.isFinite(+place.lon);
  if (!has && altOverride == null) return { ...SKY, night: 0, dark: false, key: 'day' };
  const sun = has ? sunAt(+place.lat, +place.lon, date) : { alt: 0, am: false };
  const alt = altOverride ?? sun.alt;
  const gold = sun.am ? SKIES.goldDawn : SKIES.goldDusk, twi = sun.am ? SKIES.twiDawn : SKIES.twiDusk;
  let pal;
  if (alt >= 8) pal = SKY;
  else if (alt >= 1) pal = mixSky(gold, SKY, (alt - 1) / 7);
  else if (alt >= -5) pal = mixSky(twi, gold, (alt + 5) / 6);
  else if (alt >= -12) pal = mixSky(SKIES.night, twi, (alt + 12) / 7);
  else pal = SKIES.night;
  const night = Math.max(0, Math.min(1, (-alt - 3) / 7));
  const key = alt >= 8 ? 'day' : alt <= -12 ? 'night' : `${sun.am ? 'a' : 'p'}${Math.round(alt * 2) / 2}`;
  return { ...pal, night, dark: lum(pal.top) < 0.16, alt, key };
}

export function makeSky(W, H, dpr, pal = SKY) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.top); g.addColorStop(0.55, pal.mid); g.addColorStop(1, pal.bottom);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const bloom = (cx, cy, r, col, a) => {
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, hexA(col, a)); rg.addColorStop(1, hexA(col, 0));
    x.fillStyle = rg; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  const night = pal.night || 0;
  bloom(W * 0.22, H * 0.78, W * 0.95, pal.bottom, 0.5 - night * 0.2);
  bloom(W * 0.85, H * 0.18, W * 0.8, pal.top, 0.35);
  if (night > 0) bloom(W * 0.8, H * 0.12, W * 0.45, '#C9D8FF', 0.1 * night); // a little moonlight
  // fine grain
  x.setTransform(1, 0, 0, 1, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// hand-sewn running stitch along a path, with a little wobble
export function stitchPath(x, pts, seed = 1, color = THREAD, w = 2) {
  const r = seeded(seed);
  x.save();
  x.lineCap = 'round';
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
    for (let d = carry; d < len; d += 10) {
      const s = Math.min(6, len - d), j = (r() - 0.5) * 1.4;
      x.strokeStyle = 'rgba(20,40,80,0.18)'; x.lineWidth = w;
      x.beginPath(); x.moveTo(ax + ux * d - uy * j + 0.6, ay + uy * d + ux * j + 1); x.lineTo(ax + ux * (d + s) - uy * j + 0.6, ay + uy * (d + s) + ux * j + 1); x.stroke();
      x.strokeStyle = color;
      x.beginPath(); x.moveTo(ax + ux * d - uy * j, ay + uy * d + ux * j); x.lineTo(ax + ux * (d + s) - uy * j, ay + uy * (d + s) + ux * j); x.stroke();
      carry = d + 10 - len;
    }
  }
  x.restore();
}

export function drawSeams(x, W, H, bottom) {
  const inset = 11, curve = (k) => {
    const pts = [];
    pts.push([inset + k, -10], [inset + k, bottom - 40]);
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([inset + k + (W - 2 * (inset + k)) * t, bottom - 40 + Math.sin(t * Math.PI) * 34]); }
    pts.push([W - inset - k, -10]);
    return pts;
  };
  stitchPath(x, curve(0), 3);
  stitchPath(x, curve(7), 9);
}

// the hole: a black circle sewn into the denim
export function drawHole(x, cx, cy, r, t, glow = 0) {
  x.save();
  if (glow > 0.35) {
    x.strokeStyle = `rgba(255,255,255,${(glow - 0.35) * 1.2})`; x.lineWidth = 2.5; x.setLineDash([3, 6]);
    wobblyCircle(x, cx, cy, r * (1.5 + (1 - glow) * 0.6), 5, 0.04); x.stroke(); x.setLineDash([]);
  }
  // a soft shadow ring where the fabric folds in
  x.fillStyle = 'rgba(30,55,100,0.18)';
  wobblyCircle(x, cx + 1.5, cy + 2.5, r * 1.06, 7, 0.05); x.fill();
  x.fillStyle = '#0D0F14';
  wobblyCircle(x, cx, cy, r, 7, 0.05); x.fill();
  // a sliver of depth
  x.strokeStyle = '#26324D'; x.lineWidth = r * 0.08; x.lineCap = 'round';
  x.beginPath(); x.arc(cx, cy + r * 0.12, r * 0.72, Math.PI * 1.15, Math.PI * 1.55); x.stroke();
  // blanket stitch around the edge
  const n = Math.max(16, Math.round(r * 0.42));
  const pop = 1 + glow * 0.12;
  x.strokeStyle = 'rgba(20,40,80,0.2)'; x.lineWidth = 2.6; x.lineCap = 'round';
  wobblyCircle(x, cx + 0.8, cy + 1.2, r * 1.2 * pop, 2, 0.02); x.stroke();
  x.strokeStyle = THREAD;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.04 * Math.sin(i * 7.3);
    const r0 = r * 0.93, r1 = r * 1.2 * pop;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.stroke();
  }
  x.lineWidth = 2.4;
  wobblyCircle(x, cx, cy, r * 1.2 * pop, 2, 0.02); x.stroke();
  x.restore();
}

// rounded rect path helper
export function rr(x, X, Y, W, H, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath();
}

// ── lips ─────────────────────────────────────────────────────
export function drawLips(x, cx, cy, s, rot = 0, color = '#C41E3A') {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s / 20, s / 20);
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(-14, 0);
  x.bezierCurveTo(-10, -6, -6, -9, -3, -6); x.bezierCurveTo(-1, -8, 1, -8, 3, -6);
  x.bezierCurveTo(6, -9, 10, -6, 14, 0);
  x.bezierCurveTo(10, 1, -10, 1, -14, 0); x.fill();
  x.beginPath();
  x.moveTo(-14, 1); x.bezierCurveTo(-8, 10, 8, 10, 14, 1); x.bezierCurveTo(8, 3, -8, 3, -14, 1); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.25)';
  x.beginPath(); x.ellipse(4, 5, 4, 1.4, 0, 0, Math.PI * 2); x.fill();
  x.restore();
}
export function lipsSVG(color = '#C41E3A') {
  return `<svg viewBox="-16 -12 32 24" xmlns="http://www.w3.org/2000/svg"><path fill="${color}" d="M-14 0C-10-6-6-9-3-6C-1-8 1-8 3-6C6-9 10-6 14 0C10 1-10 1-14 0Z M-14 1C-8 10 8 10 14 1C8 3-8 3-14 1Z"/><ellipse cx="4" cy="5" rx="4" ry="1.4" fill="rgba(255,255,255,.3)"/></svg>`;
}

// ── food ─────────────────────────────────────────────────────
export const FOODS = {
  medialuna: 'a medialuna crumb', alfajor: 'a bite of alfajor', frutilla: 'a strawberry',
  manzana: 'an apple peel', galletita: 'a cookie crumb', banana: 'a bit of banana',
  empanada: 'an empanada corner', hoja: 'a fresh leaf', cafe: 'coffee grounds',
};
export function drawFood(x, kind, s = 10) {
  x.save();
  switch (kind) {
    case 'medialuna': {
      x.fillStyle = '#D99A3E'; x.beginPath(); x.arc(0, 0, s, Math.PI * 0.15, Math.PI * 1.85); x.arc(s * 0.45, 0, s * 0.62, Math.PI * 1.6, Math.PI * 0.4, true); x.fill();
      x.strokeStyle = '#A8661F'; x.lineWidth = 1; for (const a of [-0.9, 0, 0.9]) { x.beginPath(); x.moveTo(Math.cos(Math.PI + a) * s * 0.4, Math.sin(Math.PI + a) * s * 0.4); x.lineTo(Math.cos(Math.PI + a) * s, Math.sin(Math.PI + a) * s); x.stroke(); }
      x.fillStyle = 'rgba(255,230,160,0.6)'; x.beginPath(); x.arc(-s * 0.4, -s * 0.4, s * 0.2, 0, 7); x.fill();
      break;
    }
    case 'alfajor':
      x.fillStyle = '#F4ECDD'; x.beginPath(); x.arc(0, 0, s * 1.02, 0, 7); x.fill();
      x.fillStyle = '#5B3524'; x.beginPath(); x.arc(0, 0, s * 0.9, 0, 7); x.fill();
      x.fillStyle = '#7A4A33'; x.beginPath(); x.arc(-s * 0.2, -s * 0.2, s * 0.35, 0, 7); x.fill();
      x.fillStyle = '#5B3524'; x.beginPath(); x.moveTo(s * 0.3, -s); x.lineTo(s * 1.1, -s * 0.2); x.lineTo(s * 1.1, -s); x.fill();
      break;
    case 'frutilla':
      x.fillStyle = '#E23D45'; x.beginPath(); x.moveTo(0, s * 1.1); x.bezierCurveTo(-s * 1.2, s * 0.2, -s * 0.9, -s * 0.8, 0, -s * 0.7); x.bezierCurveTo(s * 0.9, -s * 0.8, s * 1.2, s * 0.2, 0, s * 1.1); x.fill();
      x.fillStyle = '#FCE38A'; for (let i = 0; i < 7; i++) { x.fillRect(Math.sin(i * 2.3) * s * 0.5, Math.cos(i * 1.7) * s * 0.4, 1.2, 1.6); }
      x.fillStyle = '#4C9A4A'; x.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.5; x.ellipse(Math.cos(a) * s * 0.25, -s * 0.7 + Math.sin(a) * s * 0.15, s * 0.35, s * 0.12, a, 0, 7); } x.fill();
      break;
    case 'manzana':
      x.strokeStyle = '#C93A35'; x.lineWidth = s * 0.45; x.lineCap = 'round';
      x.beginPath(); x.arc(0, 0, s * 0.8, 0.2, 3.6); x.stroke();
      x.strokeStyle = '#F6E9C8'; x.lineWidth = s * 0.18; x.beginPath(); x.arc(0, 0, s * 0.62, 0.3, 3.5); x.stroke();
      break;
    case 'galletita':
      x.fillStyle = '#D8A55E'; x.beginPath(); for (let k = 0; k < 9; k++) { const a = (k / 9) * 7, r = s * (0.85 + (k % 2) * 0.15); x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.fill();
      x.fillStyle = '#5B3524'; for (const [a, b] of [[-0.3, -0.3], [0.35, 0.1], [-0.1, 0.45], [0.3, -0.45]]) { x.beginPath(); x.arc(a * s, b * s, s * 0.13, 0, 7); x.fill(); }
      break;
    case 'banana':
      x.fillStyle = '#F2D45C'; x.beginPath(); x.arc(0, 0, s * 0.9, 0, 7); x.fill();
      x.fillStyle = '#FBF1C4'; x.beginPath(); x.arc(0, 0, s * 0.68, 0, 7); x.fill();
      x.fillStyle = '#B79A4A'; for (let k = 0; k < 3; k++) { const a = (k / 3) * 7; x.beginPath(); x.arc(Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.22, s * 0.07, 0, 7); x.fill(); }
      break;
    case 'empanada':
      x.fillStyle = '#D79B4F'; x.beginPath(); x.arc(0, s * 0.3, s, Math.PI, 0); x.closePath(); x.fill();
      x.fillStyle = '#B9772E'; for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI; x.beginPath(); x.arc(Math.cos(a) * s * 0.95, s * 0.3 + Math.sin(a) * s * 0.95, s * 0.17, 0, 7); x.fill(); }
      break;
    case 'hoja':
      leafShape(x, s * 1.2, '#6DAA4F', '#4E8536');
      break;
    case 'cafe':
      for (let k = 0; k < 14; k++) { x.fillStyle = k % 2 ? '#3A2318' : '#5A3826'; x.beginPath(); x.arc(Math.sin(k * 2.1) * s * 0.7, Math.cos(k * 1.3) * s * 0.6, s * 0.18, 0, 7); x.fill(); }
      break;
  }
  x.restore();
}

function leafShape(x, s, fill, vein) {
  x.fillStyle = fill; x.beginPath();
  x.moveTo(-s, 0); x.quadraticCurveTo(-s * 0.2, -s * 0.75, s, 0); x.quadraticCurveTo(-s * 0.2, s * 0.75, -s, 0); x.fill();
  x.strokeStyle = vein; x.lineWidth = 1; x.beginPath(); x.moveTo(-s * 1.15, 0); x.lineTo(s * 0.9, 0); x.stroke();
  for (let k = -2; k <= 2; k++) { if (!k) continue; x.beginPath(); x.moveTo(k * s * 0.25, 0); x.lineTo(k * s * 0.25 + s * 0.25, k > 0 ? -s * 0.28 : s * 0.28); x.stroke(); }
}

// ── trinkets ─────────────────────────────────────────────────
export const TRINKETS = {
  pebble: 'a smooth pebble', leaf: 'a leaf', coin: 'a coin', ticket: 'a ticket stub', button: 'a button',
  matchbook: 'a matchbook', flower: 'a little flower', bottlecap: 'a bottle cap', feather: 'a feather',
  candy: 'a candy', key: 'a tiny key',
};
export function drawTrinket(x, kind, s = 16, text = '') {
  x.save();
  switch (kind) {
    case 'pebble': {
      const g = x.createRadialGradient(-s * 0.3, -s * 0.3, 1, 0, 0, s);
      g.addColorStop(0, '#C9C4BC'); g.addColorStop(1, '#7E7A74');
      x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, s, s * 0.72, 0.2, 0, 7); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 0.8; x.beginPath(); x.ellipse(0, 0, s * 0.6, s * 0.35, 0.4, 0.3, 2.4); x.stroke();
      break;
    }
    case 'leaf': leafShape(x, s * 1.2, '#D98B3A', '#9C5A1F'); break;
    case 'coin': {
      const g = x.createRadialGradient(-s * 0.3, -s * 0.3, 1, 0, 0, s);
      g.addColorStop(0, '#F7E3A1'); g.addColorStop(1, '#B98D2E');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, s * 0.85, 0, 7); x.fill();
      x.strokeStyle = 'rgba(110,80,20,0.6)'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, s * 0.68, 0, 7); x.stroke();
      x.fillStyle = 'rgba(110,80,20,0.65)'; x.font = `600 ${s * 0.7}px Geist, system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('1', 0, 1);
      break;
    }
    case 'ticket':
      x.fillStyle = '#F2D8B4'; x.fillRect(-s * 1.3, -s * 0.6, s * 2.6, s * 1.2);
      x.strokeStyle = '#B5523E'; x.setLineDash([2, 2]); x.beginPath(); x.moveTo(s * 0.6, -s * 0.6); x.lineTo(s * 0.6, s * 0.6); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#B5523E'; x.font = `600 ${s * 0.42}px "Geist Mono", ui-monospace, monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText((text || 'ADMIT').slice(0, 7).toUpperCase(), -s * 0.35, 0);
      break;
    case 'button':
      x.fillStyle = '#E8C36A'; x.beginPath(); x.arc(0, 0, s * 0.8, 0, 7); x.fill();
      x.strokeStyle = '#B48C33'; x.lineWidth = 1.2; x.beginPath(); x.arc(0, 0, s * 0.6, 0, 7); x.stroke();
      x.fillStyle = '#7A5A1A'; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { x.beginPath(); x.arc(a * s * 0.2, b * s * 0.2, s * 0.1, 0, 7); x.fill(); }
      break;
    case 'matchbook':
      x.fillStyle = '#C23B32'; x.fillRect(-s * 0.8, -s * 1.1, s * 1.6, s * 2.2);
      x.fillStyle = '#F4EBDD'; x.fillRect(-s * 0.8, s * 0.55, s * 1.6, s * 0.18);
      x.fillStyle = '#F4EBDD'; x.font = `600 ${s * 0.36}px Geist, system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.save(); x.rotate(-Math.PI / 2); x.fillText((text || 'Bar').slice(0, 9), 0, 0); x.restore();
      break;
    case 'flower':
      x.fillStyle = '#F2A7C0'; for (let k = 0; k < 5; k++) { const a = (k / 5) * 7; x.beginPath(); x.arc(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42, s * 0.36, 0, 7); x.fill(); }
      x.fillStyle = '#F6C64A'; x.beginPath(); x.arc(0, 0, s * 0.28, 0, 7); x.fill();
      break;
    case 'bottlecap':
      x.fillStyle = '#C7CCD3'; x.beginPath(); for (let k = 0; k < 21; k++) { const a = (k / 21) * 7, r = k % 2 ? s * 0.78 : s * 0.9; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.fill();
      x.fillStyle = '#2F6CB5'; x.beginPath(); x.arc(0, 0, s * 0.62, 0, 7); x.fill();
      x.fillStyle = '#F4EBDD'; x.beginPath(); x.arc(0, 0, s * 0.3, 0, 7); x.fill();
      break;
    case 'feather':
      x.rotate(-0.6);
      x.fillStyle = '#EDE6DA'; x.beginPath(); x.moveTo(0, -s * 1.4); x.quadraticCurveTo(s * 0.7, 0, 0, s * 1.2); x.quadraticCurveTo(-s * 0.7, 0, 0, -s * 1.4); x.fill();
      x.strokeStyle = '#9A8E7C'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -s * 1.4); x.lineTo(0, s * 1.5); x.stroke();
      for (let k = -4; k <= 4; k++) { x.beginPath(); x.moveTo(0, k * s * 0.25); x.lineTo(k % 2 ? s * 0.4 : -s * 0.4, k * s * 0.25 - s * 0.2); x.stroke(); }
      break;
    case 'candy':
      x.fillStyle = '#E2546A'; x.beginPath(); x.moveTo(-s * 0.55, 0); x.lineTo(-s * 1.2, -s * 0.45); x.lineTo(-s * 1.2, s * 0.45); x.fill();
      x.beginPath(); x.moveTo(s * 0.55, 0); x.lineTo(s * 1.2, -s * 0.45); x.lineTo(s * 1.2, s * 0.45); x.fill();
      x.fillStyle = '#F5A3B0'; x.beginPath(); x.ellipse(0, 0, s * 0.65, s * 0.5, 0, 0, 7); x.fill();
      x.strokeStyle = '#E2546A'; x.lineWidth = s * 0.12; x.beginPath(); x.moveTo(-s * 0.4, -s * 0.3); x.lineTo(s * 0.2, s * 0.4); x.stroke();
      break;
    case 'key':
      x.strokeStyle = '#C79A3E'; x.lineWidth = s * 0.22; x.beginPath(); x.arc(-s * 0.6, 0, s * 0.42, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(-s * 0.18, 0); x.lineTo(s * 1.1, 0); x.lineTo(s * 1.1, s * 0.35); x.moveTo(s * 0.75, 0); x.lineTo(s * 0.75, s * 0.3); x.stroke();
      break;
  }
  x.restore();
}

// ── things that arrive through the hole ──────────────────────
export const ITEM_KINDS = ['note', 'doodle', 'photo', 'whisper', 'wiggle', 'trinket'];
export const PAPERS = { white: '#FFFFFF', rosa: '#FCD3DC', celeste: '#CFE6FA', limon: '#F6F1A6' };

export function itemRadius(kind) {
  return { note: 24, doodle: 24, photo: 28, whisper: 18, wiggle: 13, trinket: 16 }[kind] || 16;
}

const INK = '#26324D';
const SHADE = 'rgba(30,55,100,0.22)';
function card(x, X, Y, W, H, r, fill) {
  x.fillStyle = SHADE; rr(x, X + 2, Y + 3, W, H, r); x.fill();
  x.fillStyle = fill; rr(x, X, Y, W, H, r); x.fill();
  x.strokeStyle = INK; x.lineWidth = 1.4; x.stroke();
}
export function drawItem(x, it, t, images) {
  const p = it.payload || {};
  x.save();
  x.translate(it.x, it.y);
  x.rotate(it.rot || 0);
  x.lineJoin = 'round'; x.lineCap = 'round';
  const fresh = !it.opened && !it.mine;
  if (fresh) {
    x.save(); x.rotate(t * 0.6 + it.seed);
    x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 2; x.setLineDash([4, 5]);
    x.beginPath(); x.arc(0, 0, it.r * 1.42, 0, 7); x.stroke();
    x.restore();
  }
  switch (it.kind) {
    case 'note': {
      card(x, -24, -17, 48, 34, 5, PAPERS[p.paper] || '#FFFFFF');
      x.strokeStyle = INK; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(-23, -15); x.quadraticCurveTo(-8, -4, 0, 1); x.quadraticCurveTo(8, -4, 23, -15); x.stroke();
      if (fresh) { x.fillStyle = '#E2344F'; x.beginPath(); x.arc(0, 2, 5, 0, 7); x.fill(); }
      break;
    }
    case 'doodle': {
      card(x, -23, -23, 46, 46, 6, '#FFFFFF');
      const thumb = doodleThumb(it);
      if (thumb) x.drawImage(thumb, -19, -19, 38, 38);
      x.fillStyle = 'rgba(227,162,63,0.85)'; x.fillRect(-7, -27, 14, 7);
      break;
    }
    case 'photo': {
      card(x, -25, -29, 50, 58, 4, '#FFFFFF');
      const img = images && p.thumb ? images(p.thumb) : null;
      if (img && img.complete && img.naturalWidth) {
        const sw = img.naturalWidth, sh = img.naturalHeight, side = Math.min(sw, sh);
        x.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, -21, -25, 42, 42);
      } else { x.fillStyle = '#DDE3EC'; x.fillRect(-21, -25, 42, 42); }
      x.strokeStyle = INK; x.lineWidth = 1; x.strokeRect(-21, -25, 42, 42);
      break;
    }
    case 'whisper': {
      x.fillStyle = SHADE; x.beginPath(); x.arc(2, 3, 18, 0, 7); x.fill();
      x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(0, 0, 18, 0, 7); x.fill();
      x.strokeStyle = INK; x.lineWidth = 1.4; x.stroke();
      x.fillStyle = INK;
      [5, 10, 14, 8, 12, 6].forEach((hgt, i) => { const live = 1 + Math.sin(t * 6 + i) * (fresh ? 0.25 : 0.08); rr(x, -9.5 + i * 3.4, -hgt * live / 2, 2, hgt * live, 1); x.fill(); });
      break;
    }
    case 'wiggle': {
      const hop = it.hop || 0;
      x.translate(0, -hop * 7); x.rotate(Math.sin(t * 20) * hop * 0.5);
      x.fillStyle = SHADE; rr(x, -12, -5, 28, 16, 8); x.fill();
      x.fillStyle = '#F5A04F'; rr(x, -14, -8, 28, 16, 8); x.fill();
      x.strokeStyle = INK; x.lineWidth = 1.4; x.stroke();
      x.strokeStyle = '#FFFFFF'; x.lineWidth = 1.8;
      x.beginPath(); for (let i = 0; i <= 12; i++) { const px = -9 + i * 1.5, py = Math.sin(i * 1.1 + t * 8 * (fresh ? 1 : 0.2)) * 2.4; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
      break;
    }
    case 'trinket':
      dab(x, '#1E3A66', 2, 4, 17, 'soft', 0.35);
      drawTrinket(x, p.what, 15, p.text);
      break;
  }
  x.restore();
}

const doodleCache = new Map();
export function doodleThumb(it) {
  const key = it.id;
  if (doodleCache.has(key)) return doodleCache.get(key);
  const strokes = it.payload?.strokes;
  if (!strokes) return null;
  const c = document.createElement('canvas'); c.width = c.height = 120;
  const x = c.getContext('2d');
  renderStrokes(x, strokes, 120, 1);
  doodleCache.set(key, c);
  return c;
}

// strokes: [{c: color, w: width(0..1000 scale), p: [x,y,x,y,...] in 0..1000}]
export function renderStrokes(x, strokes, size, progress = 1) {
  const total = strokes.reduce((a, s) => a + s.p.length / 2, 0);
  let budget = total * progress;
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const s of strokes) {
    if (budget <= 0) break;
    const n = Math.min(s.p.length / 2, Math.ceil(budget));
    budget -= s.p.length / 2;
    x.strokeStyle = s.c; x.lineWidth = (s.w / 1000) * size;
    x.beginPath();
    for (let i = 0; i < n; i++) {
      const px = (s.p[i * 2] / 1000) * size, py = (s.p[i * 2 + 1] / 1000) * size;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    if (n === 1) x.lineTo((s.p[0] / 1000) * size + 0.1, (s.p[1] / 1000) * size);
    x.stroke();
  }
}

export function weatherKind(code) {
  if (code == null) return 'none';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2) return 'cloud';
  return 'clear';
}
export const weatherWord = { storm: 'storming', snow: 'snowing', rain: 'raining', fog: 'foggy', cloud: 'cloudy', clear: 'clear', none: '' };

export { hash };
