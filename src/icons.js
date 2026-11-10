// Object icons, shared by every screen: clean, lit, no outlines, so they sit
// with the system UI. Worms (and their food) stay illustrated; everything you
// send or keep looks like this. SVG strings for the DOM, canvas versions for
// the pocket.

let uid = 0;
export const TINTS = {
  rosa: ['#FFF1F5', '#F9D3DE', '#E9B3C3'], celeste: ['#F2F8FF', '#D4E6F8', '#B5CDE6'],
  limon: ['#FFFCE6', '#F6EDB2', '#E3D88E'], white: ['#FFFFFF', '#F2F3F6', '#D9DCE3'],
};
const shadowDef = (id) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="175%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#1C1C1E" flood-opacity=".17"/></filter>`;
const group = (id, shadow) => (shadow ? `<g filter="url(#${id}d)">` : '<g>');

export function envelopeIcon(paper = 'white', { open = false, size = 124, shadow = true } = {}) {
  const [hi, base, shade] = TINTS[paper] || TINTS.white, id = `ic${++uid}`;
  const defs = `<defs>
    <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${base}"/></linearGradient>
    <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="${shade}"/></linearGradient>
    <radialGradient id="${id}s" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FF6B63"/><stop offset="1" stop-color="#C9001B"/></radialGradient>
    <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F4F4F7"/></linearGradient>
    ${shadowDef(`${id}d`)}</defs>`;
  if (!open) {
    return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true" style="overflow:visible">${defs}${group(id, shadow)}
      <rect x="12" y="30" width="96" height="64" rx="9" fill="url(#${id}p)"/>
      <path d="M15 90 L52 62 M105 90 L68 62" stroke="${shade}" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M12.5 37 Q12.5 30 19.5 30 H100.5 Q107.5 30 107.5 37 L64.5 66.5 Q60 69.5 55.5 66.5 Z" fill="url(#${id}f)"/>
      <circle cx="60" cy="64.5" r="8.6" fill="url(#${id}s)"/><ellipse cx="57.3" cy="61.6" rx="2.8" ry="1.9" fill="#fff" opacity=".55"/>
    </g></svg>`;
  }
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true" style="overflow:visible">${defs}${group(id, shadow)}
    <rect x="12" y="40" width="96" height="62" rx="9" fill="${shade}"/>
    <path d="M12.5 46 L60 16 L107.5 46 Z" fill="url(#${id}f)"/>
    <rect x="22" y="22" width="76" height="58" rx="5" fill="url(#${id}l)"/>
    <path d="M32 36h46M32 46h56M32 56h38" stroke="#D1D1D6" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M12 52 L60 78 L108 52 V93 Q108 102 99 102 H21 Q12 102 12 93 Z" fill="url(#${id}p)"/>
  </g></svg>`;
}

export function boxIcon({ open = false, size = 120, shadow = true } = {}) {
  const id = `ic${++uid}`;
  const g = (n, a, b) => `<linearGradient id="${id}${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const defs = `<defs>${g('t', '#F2D7AE', '#E3BF8C')}${g('a', '#D9AC74', '#C8975D')}${g('b', '#BC8850', '#A87642')}${g('i', '#7B5532', '#5C3E22')}${shadowDef(`${id}d`)}</defs>`;
  if (!open) {
    return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true" style="overflow:visible">${defs}${group(id, shadow)}
      <path d="M60 22 L101 40 L60 58 L19 40 Z" fill="url(#${id}t)"/>
      <path d="M19 40 L60 58 L60 101 L19 83 Z" fill="url(#${id}a)"/>
      <path d="M60 58 L101 40 L101 83 L60 101 Z" fill="url(#${id}b)"/>
      <path d="M36 32.6 L44 29 L84.6 47 L76.6 50.6 Z" fill="#F8EBD2" opacity=".92"/>
      <path d="M76.6 50.6 L84.6 47 L84.6 89.6 L76.6 93.2 Z" fill="#EEDBB8" opacity=".9"/>
      <path d="M19 40 L60 58 L101 40" fill="none" stroke="#FFF6E6" stroke-width="1" opacity=".6"/>
    </g></svg>`;
  }
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true" style="overflow:visible">${defs}${group(id, shadow)}
    <path d="M19 44 L60 26 L56 9 L15 27 Z" fill="url(#${id}a)"/>
    <path d="M60 26 L101 44 L105 27 L64 9 Z" fill="url(#${id}b)"/>
    <path d="M60 26 L101 44 L60 62 L19 44 Z" fill="url(#${id}i)"/>
    <path d="M19 44 L60 62 L60 104 L19 86 Z" fill="url(#${id}a)"/>
    <path d="M60 62 L101 44 L101 86 L60 104 Z" fill="url(#${id}b)"/>
    <path d="M19 44 L60 62 L51 76 L10 58 Z" fill="url(#${id}t)"/>
    <path d="M60 62 L101 44 L110 58 L69 76 Z" fill="url(#${id}t)"/>
  </g></svg>`;
}

// SF-style glyph tiles, like a small app icon
export const GLYPH_COLORS = { whisper: ['#FF6482', '#FF2D55'], wiggle: ['#C779EB', '#AF52DE'] };
const GLYPHS = {
  wave: '<path d="M12 24v0M18 18v12M24 12v24M30 16v16M36 21v6" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>',
  sine: '<path d="M10 24c3-8 6-8 9 0s6 8 9 0 6-8 9 0 3 4 4 4" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>',
  lock: '<rect x="15" y="21" width="18" height="14" rx="3.5" fill="#fff"/><path d="M18.5 21v-4a5.5 5.5 0 0 1 11 0v4" fill="none" stroke="#fff" stroke-width="3"/>',
};
export function glyphTile(kind, [a, b], size = 92) {
  const id = `ic${++uid}`;
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" style="overflow:visible"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>${shadowDef(`${id}d`)}</defs>
    <g filter="url(#${id}d)"><rect x="2" y="2" width="44" height="44" rx="11" fill="url(#${id})"/></g>${GLYPHS[kind]}</svg>`;
}

export const TRINKET_EMOJI = { pebble: '🪨', leaf: '🍂', coin: '🪙', ticket: '🎟️', button: '🔘', matchbook: '🔥', flower: '🌼', bottlecap: '🍾', feather: '🪶', candy: '🍬', key: '🗝️' };
export const trinketEmoji = (what) => TRINKET_EMOJI[what] || '✨';

// ── canvas versions (the pocket) ───────────────────────────
// SVG icons drawn into canvas: rasterized once per variant, without the baked
// shadow, so the canvas can cast a shadow that always falls straight down
// however the object is turned.
const images = new Map();
function svgImage(key, svg) {
  let img = images.get(key);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
    images.set(key, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}
export const envelopeImage = (paper, open) => svgImage(`env:${paper}:${open ? 1 : 0}`, envelopeIcon(TINTS[paper] ? paper : 'white', { open, size: 216, shadow: false }));
export const boxImage = (open) => svgImage(`box:${open ? 1 : 0}`, boxIcon({ open, size: 216, shadow: false }));
export function preloadIcons() {
  for (const paper of Object.keys(TINTS)) { envelopeImage(paper, false); envelopeImage(paper, true); }
}

// The soft system shadow from the SVGs (dy 7, blur 6 at 120 px), in canvas
// terms. Canvas shadows ignore the transform, so they're scaled by the
// device pixel ratio the caller passes.
export function iconShadow(x, k = 1, size = 60) {
  const s = size / 120;
  x.shadowColor = 'rgba(28,28,30,0.18)';
  x.shadowBlur = 12 * s * k;
  x.shadowOffsetX = 0;
  x.shadowOffsetY = 7 * s * k;
}
export function noShadow(x) { x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0; }

export function roundRect(x, X, Y, W, H, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath();
}

// A glyph tile drawn live, so its glyph can move: bars for a whisper, a wave for a wiggle.
export function drawGlyphTile(x, kind, size, t, { k, live = 0 } = {}) {
  if (k == null) { const m = x.getTransform(); k = Math.hypot(m.a, m.b) || 1; }
  const [a, b] = GLYPH_COLORS[kind === 'wave' ? 'whisper' : 'wiggle'];
  const half = size / 2, r = size * 0.25;
  const g = x.createLinearGradient(0, -half, 0, half); g.addColorStop(0, a); g.addColorStop(1, b);
  x.save();
  iconShadow(x, k, size * 120 / 44);
  x.fillStyle = g; roundRect(x, -half, -half, size, size, r); x.fill();
  noShadow(x);
  const u = size / 44; // the 48 px glyph box, tile at 44
  x.strokeStyle = '#FFFFFF'; x.lineWidth = 3.2 * u; x.lineCap = 'round'; x.lineJoin = 'round';
  if (kind === 'wave') {
    [0, 12, 24, 16, 6].forEach((hgt, i) => {
      const hh = Math.max(0.01, hgt * u * (1 + Math.sin(t * 6 + i * 1.3) * (0.08 + live * 0.22)));
      const X = (-12 + i * 6) * u;
      x.beginPath(); x.moveTo(X, -hh / 2); x.lineTo(X, hh / 2); x.stroke();
    });
  } else {
    x.beginPath();
    for (let i = 0; i <= 24; i++) {
      const X = (-13 + i * (26 / 24)) * u, Y = Math.sin(i * 0.72 + t * 8 * (0.2 + live * 0.8)) * 4.6 * u;
      i ? x.lineTo(X, Y) : x.moveTo(X, Y);
    }
    x.stroke();
  }
  x.restore();
}
