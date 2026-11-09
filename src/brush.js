// An airbrush: speckled spray stamps, cached per color. Everything soft in the pocket is painted with these.
const cache = new Map();
const SIZE = 64;

function rgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// kind 'body': solid core with a sprayed, speckled edge (worm bodies, hats)
// kind 'soft': all falloff, like a blurry airbrush dot (spots, cheeks, shadows)
export function stamp(color, kind = 'body') {
  const key = color + kind;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d');
  const img = x.createImageData(SIZE, SIZE);
  const [r, g, b] = rgb(color);
  const half = SIZE / 2;
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const dx = (px + 0.5 - half) / half, dy = (py + 0.5 - half) / half;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a;
      if (kind === 'body') {
        a = d < 0.72 ? 1 : d < 1 ? Math.pow(1 - (d - 0.72) / 0.28, 1.25) : 0;
        if (a > 0 && a < 1) a = Math.min(1, a * (0.8 + Math.random() * 0.4));
      } else {
        a = d < 1 ? Math.pow(1 - d, 1.7) : 0;
        a *= 0.7 + Math.random() * 0.6;
      }
      const grain = (Math.random() - 0.5) * 12;
      const i = (py * SIZE + px) * 4;
      img.data[i] = Math.max(0, Math.min(255, r + grain));
      img.data[i + 1] = Math.max(0, Math.min(255, g + grain));
      img.data[i + 2] = Math.max(0, Math.min(255, b + grain));
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  x.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

// one dab of paint, radius r (the visible edge sits around r)
export function dab(x, color, cx, cy, r, kind = 'body', alpha = 1) {
  const s = kind === 'body' ? r * 1.18 : r;
  if (alpha !== 1) { const a = x.globalAlpha; x.globalAlpha = a * alpha; x.drawImage(stamp(color, kind), cx - s, cy - s, s * 2, s * 2); x.globalAlpha = a; }
  else x.drawImage(stamp(color, kind), cx - s, cy - s, s * 2, s * 2);
}

// a wobbly hand-drawn circle path
export function wobblyCircle(x, cx, cy, r, seed = 1, amt = 0.05, n = 40) {
  x.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + amt * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 5 + seed * 2.3) * 0.4);
    const px = cx + Math.cos(a) * r * w, py = cy + Math.sin(a) * r * w;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath();
}

// a soft band across a tube: an airbrush dab squashed along the body
export function band(x, color, cx, cy, r, angle, along = 0.42, kind = 'body', alpha = 1) {
  const s = kind === 'body' ? r * 1.18 : r;
  x.save();
  x.translate(cx, cy); x.rotate(angle);
  if (alpha !== 1) x.globalAlpha *= alpha;
  x.drawImage(stamp(color, kind), -s * along, -s, s * 2 * along, s * 2);
  x.restore();
}

// emoji, rendered once at a good size and reused
export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
const emojiCache = new Map();
function emojiCanvas(ch) {
  let c = emojiCache.get(ch);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 112;
  const x = c.getContext('2d');
  x.font = `88px ${EMOJI_FONT}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ch, 56, 62);
  emojiCache.set(ch, c);
  return c;
}
export function drawEmoji(x, ch, cx, cy, size, rot = 0, alpha = 1) {
  const c = emojiCanvas(ch), s = size * 1.27;
  x.save();
  x.translate(cx, cy); if (rot) x.rotate(rot);
  if (alpha !== 1) x.globalAlpha *= alpha;
  x.drawImage(c, -s / 2, -s / 2, s, s);
  x.restore();
}
