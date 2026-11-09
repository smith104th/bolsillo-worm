// Everything that lives in a pocket, drawn by hand on canvas.
import { seeded, hash } from './util.js';


// ── the sky inside the pocket: their time of day + weather ─────────
const PALETTES = {
  night:  { stops: ['#0B0F2E', '#232768', '#5A48B8'], orb: ['#0A0B3A', '#7B6CFF', '#FF8AD8'], dark: true },
  dawn:   { stops: ['#8C98E2', '#F1B3A8', '#FF8B4E'], orb: ['#1B2A9E', '#5C8BFF', '#FFD0A8'], dark: false },
  day:    { stops: ['#6FBEFF', '#B7E0FF', '#EEF6FF'], orb: ['#0638E8', '#1FB8FF', '#BDEBFF'], dark: false },
  golden: { stops: ['#97A3EE', '#F6B78C', '#FF6A2B'], orb: ['#2A1FA8', '#6F7BFF', '#FFC48F'], dark: false },
  dusk:   { stops: ['#262A6A', '#6B5BC6', '#F28A9C'], orb: ['#0C0C40', '#8E6BFF', '#FFB0C8'], dark: true },
};
const WEATHER_TINT = { cloud: ['#AEB6C8', 0.18], fog: ['#D9DEE8', 0.3], rain: ['#56637D', 0.3], storm: ['#2E3550', 0.42], snow: ['#E9EEF8', 0.3] };

export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return '#' + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('');
}
const lum = (hex) => { const v = parseInt(hex.slice(1), 16); return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };

export function skyFor(hour = 12, kind = 'clear') {
  const moment = hour >= 22 || hour < 5 ? 'night' : hour < 8 ? 'dawn' : hour < 17 ? 'day' : hour < 20 ? 'golden' : 'dusk';
  const p = PALETTES[moment];
  const tint = WEATHER_TINT[kind];
  const stops = tint ? p.stops.map((c) => mixHex(c, tint[0], tint[1])) : [...p.stops];
  const dark = lum(stops[0]) < 0.55;
  return { moment, kind, stops, orb: p.orb, dark, key: moment + kind };
}

export function makeGrain(W, H, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const x = c.getContext('2d');
  const img = x.createImageData(c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 22;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export function drawSky(x, W, H, t, sky) {
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sky.stops[0]); g.addColorStop(0.55, sky.stops[1]); g.addColorStop(1, sky.stops[2]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // two slow drifting blooms, so the sky breathes
  const blob = (cx, cy, r, col, a) => {
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, hexA(col, a)); rg.addColorStop(1, hexA(col, 0));
    x.fillStyle = rg; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  blob(W * (0.25 + 0.12 * Math.sin(t * 0.07)), H * (0.3 + 0.08 * Math.cos(t * 0.05)), W * 0.9, sky.stops[2], 0.35);
  blob(W * (0.8 + 0.1 * Math.cos(t * 0.06)), H * (0.62 + 0.07 * Math.sin(t * 0.08)), W * 0.8, sky.stops[0], 0.3);
}
export function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

// the hole: a soft glowing orb that things fall in and out of
export function drawOrb(x, cx, cy, r, t, glow, sky) {
  const [core, mid, edge] = sky.orb;
  const breathe = 1 + Math.sin(t * 1.3) * 0.04 + glow * 0.18;
  const R = r * breathe;
  const halo = x.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.3);
  halo.addColorStop(0, hexA(edge, 0.55 + glow * 0.3)); halo.addColorStop(1, hexA(edge, 0));
  x.fillStyle = halo; x.fillRect(cx - R * 2.4, cy - R * 2.4, R * 4.8, R * 4.8);
  for (let k = 0; k < 3; k++) {
    const a = t * (0.35 + k * 0.17) + k * 2.1;
    const ox = Math.cos(a) * R * 0.14, oy = Math.sin(a) * R * 0.1;
    const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, R * (1.05 - k * 0.12));
    g.addColorStop(0, hexA(core, 0.95)); g.addColorStop(0.45, hexA(mid, 0.75)); g.addColorStop(1, hexA(mid, 0));
    x.fillStyle = g; x.beginPath(); x.arc(cx + ox, cy + oy, R * (1.05 - k * 0.12), 0, 7); x.fill();
  }
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
export const PAPERS = { white: '#FFFFFF', rosa: '#FFC9DD', celeste: '#BFE3FF', limon: '#F1F59A' };

export function itemRadius(kind) {
  return { note: 24, doodle: 24, photo: 28, whisper: 18, wiggle: 13, trinket: 16 }[kind] || 16;
}

const SHADOW = 'rgba(16,18,60,0.22)';
export function drawItem(x, it, t, images) {
  const p = it.payload || {};
  x.save();
  x.translate(it.x, it.y);
  x.rotate(it.rot || 0);
  const fresh = !it.opened && !it.mine;
  if (fresh) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + it.seed);
    x.strokeStyle = `rgba(255,255,255,${0.35 + pulse * 0.45})`; x.lineWidth = 2;
    x.beginPath(); x.arc(0, 0, it.r * (1.35 + pulse * 0.12), 0, 7); x.stroke();
  }
  x.shadowColor = SHADOW; x.shadowBlur = 14; x.shadowOffsetY = 6;
  switch (it.kind) {
    case 'note': {
      x.fillStyle = PAPERS[p.paper] || '#FFFFFF'; rr(x, -24, -17, 48, 34, 8); x.fill();
      x.shadowColor = 'transparent';
      x.strokeStyle = 'rgba(0,0,0,0.08)'; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(-20, -13); x.lineTo(0, 1); x.lineTo(20, -13); x.stroke();
      if (fresh) { x.fillStyle = '#FF2D55'; x.beginPath(); x.arc(0, 2, 5, 0, 7); x.fill(); }
      break;
    }
    case 'doodle': {
      x.fillStyle = '#FFFFFF'; rr(x, -23, -23, 46, 46, 10); x.fill();
      x.shadowColor = 'transparent';
      const thumb = doodleThumb(it);
      if (thumb) x.drawImage(thumb, -19, -19, 38, 38);
      break;
    }
    case 'photo': {
      x.fillStyle = '#FFFFFF'; rr(x, -25, -29, 50, 58, 9); x.fill();
      x.shadowColor = 'transparent';
      const img = images && p.thumb ? images(p.thumb) : null;
      x.save(); rr(x, -21, -25, 42, 42, 6); x.clip();
      if (img && img.complete && img.naturalWidth) {
        const sw = img.naturalWidth, sh = img.naturalHeight, side = Math.min(sw, sh);
        x.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, -21, -25, 42, 42);
      } else { x.fillStyle = '#E9E9EE'; x.fillRect(-21, -25, 42, 42); }
      x.restore();
      break;
    }
    case 'whisper': {
      x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(0, 0, 18, 0, 7); x.fill();
      x.shadowColor = 'transparent';
      x.fillStyle = '#111'; x.lineCap = 'round';
      [5, 10, 14, 8, 12, 6].forEach((hgt, i) => { const live = 1 + Math.sin(t * 6 + i) * (fresh ? 0.25 : 0.08); rr(x, -9.5 + i * 3.4, -hgt * live / 2, 2, hgt * live, 1); x.fill(); });
      break;
    }
    case 'wiggle': {
      const hop = it.hop || 0;
      x.translate(0, -hop * 7); x.rotate(Math.sin(t * 20) * hop * 0.5);
      x.fillStyle = '#FF8A3D'; rr(x, -14, -8, 28, 16, 8); x.fill();
      x.shadowColor = 'transparent';
      x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1.6; x.lineCap = 'round';
      x.beginPath(); for (let i = 0; i <= 12; i++) { const px = -9 + i * 1.5, py = Math.sin(i * 1.1 + t * 8 * (fresh ? 1 : 0.2)) * 2.4; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
      break;
    }
    case 'trinket':
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
