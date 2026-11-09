// Everything that lives in a pocket, drawn by hand on canvas.
import { seeded, hash } from './util.js';

export const THREAD = '#D9A04A';
export const DENIM = '#2B3F63';

// ── the denim itself ─────────────────────────────────────────
export function makeDenim(W, H, dpr, seed = 7) {
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  const r = seeded(seed);

  const g = x.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, '#2A3D60'); g.addColorStop(0.55, '#304873'); g.addColorStop(1, '#263958');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // fading / whiskers: soft lighter patches
  for (let i = 0; i < 7; i++) {
    const px = r() * W, py = H * (0.2 + r() * 0.7), rad = 80 + r() * 160;
    const rg = x.createRadialGradient(px, py, 0, px, py, rad);
    rg.addColorStop(0, 'rgba(120,150,200,0.10)'); rg.addColorStop(1, 'rgba(120,150,200,0)');
    x.fillStyle = rg; x.fillRect(0, 0, W, H);
  }

  // twill: diagonal weave
  x.lineWidth = 0.8;
  for (let i = -H; i < W; i += 2.2) {
    x.strokeStyle = (Math.floor(i / 2.2) % 2) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,10,0.07)';
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H * 0.42, H); x.stroke();
  }
  // weft speckle
  for (let i = 0; i < (W * H) / 70; i++) {
    x.fillStyle = r() > 0.5 ? `rgba(230,236,255,${0.03 + r() * 0.06})` : `rgba(5,10,25,${0.05 + r() * 0.08})`;
    x.fillRect(r() * W, r() * H, 1 + r() * 1.6, 0.8);
  }
  // slubs: longer pale threads
  for (let i = 0; i < 120; i++) {
    const sx = r() * W, sy = r() * H, len = 6 + r() * 26;
    x.strokeStyle = `rgba(200,215,240,${0.05 + r() * 0.08})`; x.lineWidth = 0.7 + r() * 0.8;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + len * 0.42, sy + len); x.stroke();
  }
  // inside-the-pocket shading: darker at the top, near the opening edges
  const v = x.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(4,8,20,0.55)'); v.addColorStop(0.18, 'rgba(4,8,20,0.12)');
  v.addColorStop(0.75, 'rgba(4,8,20,0)'); v.addColorStop(1, 'rgba(4,8,20,0.35)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  const side = x.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(4,8,20,0.35)'); side.addColorStop(0.12, 'rgba(4,8,20,0)');
  side.addColorStop(0.88, 'rgba(4,8,20,0)'); side.addColorStop(1, 'rgba(4,8,20,0.35)');
  x.fillStyle = side; x.fillRect(0, 0, W, H);

  // lint: little fuzz balls collected in the corners
  for (let i = 0; i < 9; i++) {
    const corner = r() < 0.5;
    const lx = corner ? (r() < 0.5 ? 20 + r() * 40 : W - 20 - r() * 40) : 30 + r() * (W - 60);
    const ly = H * (0.55 + r() * 0.3);
    lint(x, lx, ly, 3 + r() * 6, r);
  }
  return c;
}

function lint(x, cx, cy, s, r) {
  x.strokeStyle = 'rgba(220,226,240,0.35)'; x.lineWidth = 0.6;
  for (let k = 0; k < 14; k++) {
    x.beginPath();
    x.moveTo(cx + (r() - 0.5) * s, cy + (r() - 0.5) * s);
    x.quadraticCurveTo(cx + (r() - 0.5) * s * 2.4, cy + (r() - 0.5) * s * 2.4, cx + (r() - 0.5) * s * 2, cy + (r() - 0.5) * s * 2);
    x.stroke();
  }
}

// the pocket seams + hem, drawn over the denim
export function drawSeams(x, W, H, top, bottom) {
  x.save();
  // hem band at the opening
  x.fillStyle = 'rgba(70,95,140,0.35)';
  x.fillRect(0, top - 26, W, 26);
  x.fillStyle = 'rgba(0,0,10,0.35)';
  x.fillRect(0, top, W, 3);
  dashed(x, [[0, top - 20], [W, top - 20]]);
  dashed(x, [[0, top - 13], [W, top - 13]]);
  // side + bottom seams
  const inset = 9;
  x.fillStyle = 'rgba(0,0,10,0.25)';
  x.fillRect(0, top, inset - 3, H); x.fillRect(W - inset + 3, top, inset, H);
  dashed(x, [[inset, top + 4], [inset, bottom - 8], [W / 2, bottom + 28], [W - inset, bottom - 8], [W - inset, top + 4]]);
  dashed(x, [[inset + 6, top + 4], [inset + 6, bottom - 12], [W / 2, bottom + 21], [W - inset - 6, bottom - 12], [W - inset - 6, top + 4]]);
  // copper rivets
  for (const rx of [18, W - 18]) rivet(x, rx, top - 16, 6.5);
  x.restore();
}

function dashed(x, pts) {
  x.save();
  x.lineCap = 'round';
  x.setLineDash([5, 4]);
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2.2;
  x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a + 0.6, b + 1) : x.moveTo(a + 0.6, b + 1))); x.stroke();
  x.strokeStyle = THREAD; x.lineWidth = 1.7;
  x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
  x.restore();
}

export function rivet(x, cx, cy, r) {
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#F3C79A'); g.addColorStop(0.45, '#C1824E'); g.addColorStop(1, '#6D3E1F');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(60,30,10,0.6)'; x.lineWidth = 0.8; x.beginPath(); x.arc(cx, cy, r * 0.55, 0, Math.PI * 2); x.stroke();
}

// ── the hole: a worn-through spot in the denim, frayed, swirling ─────────
export function makeFray(rx, ry, seed = 3) {
  const r = seeded(seed);
  const threads = [];
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2;
    threads.push({ a, len: 4 + r() * 14, curl: (r() - 0.5) * 1.4, w: 0.6 + r() * 1.1, light: 0.55 + r() * 0.45, out: r() < 0.7 });
  }
  return { rx, ry, threads };
}
export function drawHole(x, cx, cy, fray, t, glow = 0) {
  const { rx, ry, threads } = fray;
  x.save();
  if (glow > 0.01) {
    const gg = x.createRadialGradient(cx, cy, rx * 0.4, cx, cy, rx * 2.4);
    gg.addColorStop(0, `rgba(255,140,170,${0.35 * glow})`); gg.addColorStop(1, 'rgba(255,140,170,0)');
    x.fillStyle = gg; x.fillRect(cx - rx * 3, cy - rx * 3, rx * 6, rx * 6);
  }
  // worn ring
  x.fillStyle = 'rgba(150,175,215,0.28)';
  x.beginPath(); x.ellipse(cx, cy, rx * 1.28, ry * 1.32, 0, 0, Math.PI * 2); x.fill();
  // the void
  const g = x.createRadialGradient(cx, cy + ry * 0.2, 1, cx, cy, rx);
  g.addColorStop(0, '#000000'); g.addColorStop(0.65, '#070A16'); g.addColorStop(1, '#141C33');
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill();
  // the swirl inside
  x.save();
  x.beginPath(); x.ellipse(cx, cy, rx * 0.96, ry * 0.94, 0, 0, Math.PI * 2); x.clip();
  for (let k = 0; k < 4; k++) {
    x.strokeStyle = k % 2 ? `rgba(255,150,180,${0.10 + glow * 0.25})` : `rgba(150,170,255,${0.08 + glow * 0.2})`;
    x.lineWidth = 1.4;
    x.beginPath();
    for (let s = 0; s < 60; s++) {
      const u = s / 60, a = t * (0.7 + k * 0.15) + k * 1.6 + u * 7, rr = (1 - u) * 0.95;
      const px = cx + Math.cos(a) * rx * rr, py = cy + Math.sin(a) * ry * rr;
      s ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
  }
  x.restore();
  // frayed white threads
  for (const th of threads) {
    const ex = Math.cos(th.a), ey = Math.sin(th.a);
    const sx = cx + ex * rx * (th.out ? 0.97 : 0.9), sy = cy + ey * ry * (th.out ? 0.97 : 0.9);
    const dir = th.out ? 1 : -0.6;
    const lx = sx + ex * th.len * dir, ly = sy + ey * th.len * 0.6 * dir;
    x.strokeStyle = `rgba(232,236,245,${th.light})`; x.lineWidth = th.w;
    x.beginPath(); x.moveTo(sx, sy);
    x.quadraticCurveTo((sx + lx) / 2 + th.curl * 4, (sy + ly) / 2 + th.curl * 3, lx, ly);
    x.stroke();
  }
  x.restore();
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
      x.fillStyle = 'rgba(110,80,20,0.65)'; x.font = `600 ${s * 0.7}px Fraunces, serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('1', 0, 1);
      break;
    }
    case 'ticket':
      x.fillStyle = '#F2D8B4'; x.fillRect(-s * 1.3, -s * 0.6, s * 2.6, s * 1.2);
      x.strokeStyle = '#B5523E'; x.setLineDash([2, 2]); x.beginPath(); x.moveTo(s * 0.6, -s * 0.6); x.lineTo(s * 0.6, s * 0.6); x.stroke(); x.setLineDash([]);
      x.fillStyle = '#B5523E'; x.font = `700 ${s * 0.42}px "IBM Plex Mono", monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
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
      x.fillStyle = '#F4EBDD'; x.font = `italic 600 ${s * 0.38}px Fraunces, serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
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
export const PAPERS = { cream: '#F6EEDC', rosa: '#F7D9D9', celeste: '#D8E6F3', limon: '#F5EDB8' };

export function itemRadius(kind) {
  return { note: 24, doodle: 24, photo: 28, whisper: 17, wiggle: 12, trinket: 16 }[kind] || 16;
}

export function drawItem(x, it, t, images) {
  const p = it.payload || {};
  x.save();
  x.translate(it.x, it.y);
  x.rotate(it.rot || 0);
  const fresh = !it.opened && !it.mine;
  if (fresh) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + it.seed);
    x.fillStyle = `rgba(255,214,140,${0.12 + pulse * 0.16})`;
    x.beginPath(); x.arc(0, 0, it.r * 1.55, 0, 7); x.fill();
  }
  x.shadowColor = 'rgba(0,0,10,0.45)'; x.shadowBlur = 6; x.shadowOffsetX = 1.5; x.shadowOffsetY = 3;
  switch (it.kind) {
    case 'note': {
      const col = PAPERS[p.paper] || PAPERS.cream;
      x.fillStyle = col; x.fillRect(-23, -16, 46, 32);
      x.shadowColor = 'transparent';
      x.strokeStyle = 'rgba(0,0,0,0.08)'; x.beginPath(); x.moveTo(-23, -16); x.lineTo(0, 2); x.lineTo(23, -16); x.stroke();
      if (fresh) { x.fillStyle = '#B8323C'; x.beginPath(); x.arc(0, 2, 5.5, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.arc(-1.5, 0.5, 1.6, 0, 7); x.fill(); }
      else { x.strokeStyle = 'rgba(60,40,30,0.25)'; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(-14, 6 + k * 3.5); x.lineTo(10 - k * 4, 6 + k * 3.5); x.stroke(); } }
      break;
    }
    case 'doodle': {
      x.fillStyle = '#FBF8F1'; x.fillRect(-22, -22, 44, 44);
      x.shadowColor = 'transparent';
      const thumb = doodleThumb(it);
      if (thumb) x.drawImage(thumb, -19, -19, 38, 38);
      x.fillStyle = 'rgba(217,160,74,0.7)'; x.fillRect(-7, -25, 14, 6);
      break;
    }
    case 'photo': {
      x.fillStyle = '#FCFAF4'; x.fillRect(-24, -28, 48, 56);
      x.shadowColor = 'transparent';
      const img = images && p.thumb ? images(p.thumb) : null;
      if (img && img.complete && img.naturalWidth) {
        const sw = img.naturalWidth, sh = img.naturalHeight, side = Math.min(sw, sh);
        x.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, -20, -24, 40, 40);
      } else { x.fillStyle = '#2C2A33'; x.fillRect(-20, -24, 40, 40); }
      break;
    }
    case 'whisper': {
      x.rotate(Math.PI);
      const g = x.createLinearGradient(0, -16, 0, 14);
      g.addColorStop(0, '#F9D3BE'); g.addColorStop(1, '#E59E86');
      x.fillStyle = g; x.beginPath(); x.moveTo(0, 14);
      for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; x.lineTo(Math.cos(a) * 17, -2 + Math.sin(a) * 15); }
      x.closePath(); x.fill();
      x.shadowColor = 'transparent';
      x.strokeStyle = 'rgba(160,80,60,0.45)'; x.lineWidth = 1;
      for (let k = 1; k < 8; k++) { const a = Math.PI + (k / 8) * Math.PI; x.beginPath(); x.moveTo(0, 12); x.lineTo(Math.cos(a) * 15, -2 + Math.sin(a) * 13); x.stroke(); }
      x.fillStyle = '#E59E86'; x.fillRect(-5, 11, 10, 5);
      break;
    }
    case 'wiggle': {
      const hop = it.hop || 0;
      x.translate(0, -hop * 6); x.rotate(Math.sin(t * 20) * hop * 0.5);
      x.fillStyle = '#9C6B3E'; x.beginPath(); x.ellipse(0, 0, 12, 8, 0, 0, 7); x.fill();
      x.shadowColor = 'transparent';
      x.fillStyle = '#C08A55'; x.beginPath(); x.ellipse(-3, -2, 5, 2.4, -0.2, 0, 7); x.fill();
      x.strokeStyle = '#6D4521'; x.lineWidth = 1; x.beginPath(); x.moveTo(-9, 3); x.quadraticCurveTo(0, 6, 9, 3); x.stroke();
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
