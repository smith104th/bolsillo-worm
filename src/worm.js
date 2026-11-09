// The worm: a soft verlet chain that crawls, curls, gets petted and kissed.
import { clamp, rand, hash } from './util.js';
import { drawLips, mixHex } from './draw.js';
import { dab, band } from './brush.js';

export const COLORS = {
  lombriz: { label: 'Rosa',    body: '#F2A1A6', dark: '#DE6B72', light: '#FCD6D3', saddle: '#EA8A91', spot: '#E0606A', nose: '#E04A4F' },
  durazno: { label: 'Durazno', body: '#F6C2A6', dark: '#E07B45', light: '#FDE3D3', saddle: '#F0A27E', spot: '#E9864F', nose: '#E0663A' },
  menta:   { label: 'Verde',   body: '#A5C63D', dark: '#7F9E22', light: '#D3E58C', saddle: '#93B52F', spot: '#D85F36', nose: '#D9542F' },
  manteca: { label: 'Limón',   body: '#EFD15A', dark: '#D2A92D', light: '#F8E8A6', saddle: '#E4BE45', spot: '#E0773A', nose: '#DD5B33' },
  coral:   { label: 'Coral',   body: '#F28C68', dark: '#D6603F', light: '#F9C3AE', saddle: '#E8775A', spot: '#C94B3A', nose: '#C2402F' },
  lila:    { label: 'Lila',    body: '#B7A5E6', dark: '#8D78CF', light: '#DDD3F6', saddle: '#A592DD', spot: '#EE7DA0', nose: '#E0587E' },
  cielo:   { label: 'Cielo',   body: '#8DC2E8', dark: '#5C97C9', light: '#CBE3F6', saddle: '#79B0DC', spot: '#F08C6B', nose: '#E86A4C' },
  naranja: { label: 'Naranja', body: '#F5A04F', dark: '#D9772A', light: '#FBD1A6', saddle: '#EC8B3B', spot: '#C9512E', nose: '#C9492B' },
  tomate:  { label: 'Rojo',    body: '#E9645C', dark: '#C9433D', light: '#F5AEA8', saddle: '#DE534C', spot: '#F3B24A', nose: '#B5322E' },
  noche:   { label: 'Noche',   body: '#4A4F66', dark: '#2C3040', light: '#7B8098', saddle: '#3D4256', spot: '#F08A9A', nose: '#F07A8A' },
};
export const PATTERNS = { rings: 'Rings', stripes: 'Stripes', spots: 'Spots', ombre: 'Ombré', sparkle: 'Sparkle' };
export const ACCESSORIES = {
  none: 'Nothing', cap: 'Cap', beanie: 'Beanie', bow: 'Bow', glasses: 'Glasses', mustache: 'Mustache',
  flower: 'Daisy', tophat: 'Top hat', pearls: 'Pearls', headphones: 'Headphones', crown: 'Crown', scarf: 'Scarf',
};
export const DEFAULT_DESIGN = { name: '', color: 'lombriz', pattern: 'rings', acc: 'none' };

export const inchesFor = (love = 0) => 3 + 0.3 * Math.pow(Math.max(0, love), 0.55);
export const segsFor = (inches) => clamp(Math.round(11 + inches * 0.75), 11, 44);
export function lengthBlurb(inches) {
  const ladder = [
    [4, 'about a gummy worm'], [6, 'longer than a pencil stub'], [8, 'a proper garden worm'],
    [11, 'nightcrawler territory'], [14, 'longer than a school ruler'],
    [18, 'longer than your forearm'], [24, 'two whole feet of worm'], [36, 'a yard of devotion'],
    [60, 'taller than a toddler'], [9999, 'legendary. a Gippsland giant'],
  ];
  return ladder.find(([n]) => inches < n)[1];
}

const mix = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
};

export class Worm {
  constructor(design, { x = 100, y = 100, R = 13, segs = 16, angle = 0 } = {}) {
    this.design = { ...DEFAULT_DESIGN, ...design };
    this.R = R;
    this.spacing = R * 0.62;
    this.pts = [];
    for (let i = 0; i < segs; i++) {
      const px = x - Math.cos(angle) * i * this.spacing, py = y - Math.sin(angle) * i * this.spacing;
      this.pts.push({ x: px, y: py, px, py });
    }
    this.heading = angle;
    this.t = rand(10);
    this.mode = 'wander';
    this.speedBase = R * 3.4;
    this.energy = 1;
    this.wiggly = 1;
    this.crawl = 1;
    this.rest = 0;
    this.wp = null; this.wpT = 0;
    this.blinkT = 2; this.blinkAnim = 0;
    this.happy = 0; this.love = 0; this.blush = 0; this.baseBlush = 0;
    this.wet = 0; this.squish = 0; this.surprise = 0; this.chew = 0; this.pucker = 0;
    this.dry = 0; this.sleepy = 0;
    this.dance = 0; this.danceAmp = 0;
    this.grab = null;
    this.follow = null;
    this.gaze = null;
    this.marks = [];
    this.orbit = null;
    this.bubble = null;
    this.alpha = 1;
  }

  setDesign(d) { this.design = { ...DEFAULT_DESIGN, ...d }; }

  setSegments(n) {
    const P = this.pts;
    while (P.length < n) {
      const a = P[P.length - 1], b = P[P.length - 2] || { x: a.x - 1, y: a.y };
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
      const x = a.x + (dx / d) * this.spacing, y = a.y + (dy / d) * this.spacing;
      P.push({ x, y, px: x, py: y });
    }
    while (P.length > n && P.length > 6) P.pop();
  }

  placeAt(x, y, angle = 0) {
    this.pts.forEach((p, i) => {
      p.x = p.px = x - Math.cos(angle) * i * this.spacing;
      p.y = p.py = y - Math.sin(angle) * i * this.spacing;
    });
    this.heading = angle;
  }

  head() { return this.pts[0]; }
  mid() { return this.pts[(this.pts.length / 2) | 0]; }

  hit(x, y, slop = 1.5) {
    let best = -1, bd = (this.R * slop) ** 2;
    this.pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }

  sleep(on) {
    if (on && this.mode !== 'sleep') {
      const m = this.mid();
      this.orbit = { x: m.x, y: m.y, a: Math.atan2(this.pts[0].y - m.y, this.pts[0].x - m.x), r: this.R * 2.2, t: 0 };
      this.mode = 'sleep';
    } else if (!on && this.mode === 'sleep') { this.mode = 'wander'; this.surprise = 0.4; }
  }

  kiss(level = 1) {
    this.blush = Math.min(1, this.blush + 0.18 * level);
    this.love = Math.max(this.love, 1 + level * 0.6);
    this.happy = Math.max(this.happy, 2);
    this.dance = Math.max(this.dance, 0.4 + level * 0.25); this.danceAmp = this.R * (0.12 + level * 0.06);
    this.addMark();
  }
  addMark(seed = Math.random()) {
    const n = this.pts.length;
    this.marks.push({ i: 1 + Math.floor(seed * (n - 3)), side: seed > 0.5 ? 1 : -1, rot: (seed - 0.5) * 2, s: 0.55 + (seed * 7 % 1) * 0.3 });
    if (this.marks.length > 14) this.marks.shift();
  }

  update(dt, env) {
    dt = Math.min(dt, 1 / 30);
    const P = this.pts, n = P.length, R = this.R, head = P[0];
    this.t += dt;

    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blinkT = 1.5 + Math.random() * 4; this.blinkAnim = 0.14; }
    this.blinkAnim = Math.max(0, this.blinkAnim - dt);
    this.happy = Math.max(0, this.happy - dt * 0.3);
    this.love = Math.max(0, this.love - dt * 0.35);
    this.blush = Math.max(this.baseBlush, this.blush - dt * 0.03);
    this.wet = Math.max(0, this.wet - dt * 0.04);
    this.squish = Math.max(0, this.squish - dt * 3);
    this.surprise = Math.max(0, this.surprise - dt);
    this.chew = Math.max(0, this.chew - dt);
    this.pucker = Math.max(0, this.pucker - dt);
    this.dance = Math.max(0, this.dance - dt);

    // ── brain
    let target = null;
    let maxSpeed = this.speedBase * this.energy * (1 - this.dry * 0.5);
    const b = env.bounds;
    if (this.grab) {
      // held
    } else if (this.mode === 'sleep' && this.orbit) {
      const o = this.orbit; o.t += dt;
      if (o.t < 5) { o.a += dt * 1.6; o.r = Math.max(R * 0.9, o.r - dt * R * 0.25); target = { x: o.x + Math.cos(o.a) * o.r, y: o.y + Math.sin(o.a) * o.r }; maxSpeed *= 0.55; }
    } else if (this.mode === 'knot' && this.orbit) {
      const o = this.orbit; o.a += dt * 3.2 * (o.dir || 1);
      target = { x: o.x + Math.cos(o.a) * o.r, y: o.y + Math.sin(o.a) * o.r };
      maxSpeed *= 1.6;
    } else if (this.follow) {
      target = this.follow; maxSpeed *= 1.35;
    } else if (this.mode === 'wander') {
      this.wpT -= dt;
      if (this.rest > 0) this.rest -= dt;
      else {
        if (!this.wp || this.wpT < 0 || Math.hypot(this.wp.x - head.x, this.wp.y - head.y) < R * 2) {
          if (this.wp && Math.random() < 0.45) { this.rest = rand(1.2, 4.5); this.wp = null; }
          else {
            const m = R * 3;
            this.wp = { x: rand(b.l + m, b.r - m), y: rand(b.t + m, b.b - m) };
            this.wpT = rand(4, 9);
          }
        }
        target = this.wp;
      }
    }

    let driven = false;
    if (target && !this.grab) {
      const dx = target.x - head.x, dy = target.y - head.y, d = Math.hypot(dx, dy);
      if (d > 1) {
        const want = Math.atan2(dy, dx);
        let diff = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const turn = (this.follow ? 6 : 3.6) * dt;
        this.heading += clamp(diff, -turn, turn);
        const wig = Math.sin(this.t * 5.2) * 0.42 * this.wiggly;
        const sp = maxSpeed * Math.min(1, d / (R * 2.5));
        const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(this.t * 6.2));
        const v = sp * pulse;
        head.px = head.x; head.py = head.y;
        head.x += Math.cos(this.heading + wig) * v * dt;
        head.y += Math.sin(this.heading + wig) * v * dt;
        driven = true;
      }
    }

    // ── inertia + tilt
    const grip = this.mode === 'sleep' ? 0.55 : this.grab ? 0 : 0.14;
    const damp = Math.pow(0.86, dt * 60);
    for (let i = driven ? 1 : 0; i < n; i++) {
      const p = P[i];
      if (this.grab && this.grab.i === i) continue;
      const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
      p.px = p.x; p.py = p.y;
      p.x += vx + env.gx * grip * dt * dt;
      p.y += vy + env.gy * grip * dt * dt;
    }
    if (this.grab) {
      const p = P[this.grab.i];
      p.px = p.x; p.py = p.y; p.x = this.grab.x; p.y = this.grab.y;
    }

    // ── body constraints
    const rest = (i) => this.spacing * (1 + 0.13 * Math.sin(this.t * 6.2 - i * 0.55) * this.crawl * (driven ? 1 : 0.3));
    const anchor = this.grab ? this.grab.i : driven ? 0 : -1;
    if (anchor >= 0) {
      for (let i = anchor + 1; i < n; i++) follow(P[i], P[i - 1], rest(i));
      for (let i = anchor - 1; i >= 0; i--) follow(P[i], P[i + 1], rest(i + 1));
    } else {
      for (let k = 0; k < 6; k++) for (let i = 1; i < n; i++) relax(P[i - 1], P[i], rest(i));
    }
    // a little stiffness so it bends like a worm, not a rope
    for (let i = 1; i < n - 1; i++) {
      if (i === anchor) continue;
      const a = P[i - 1], c = P[i + 1], p = P[i];
      p.x += ((a.x + c.x) / 2 - p.x) * 0.08;
      p.y += ((a.y + c.y) / 2 - p.y) * 0.08;
    }

    // wiggle dance
    if (this.dance > 0) {
      const amp = this.danceAmp * Math.min(1, this.dance * 2);
      for (let i = 1; i < n - 1; i++) {
        const a = P[i - 1], c = P[i + 1];
        let nx = -(c.y - a.y), ny = c.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const o = Math.sin(this.t * 22 - i * 0.9) * amp * 0.35;
        P[i].x += nx * o; P[i].y += ny * o; P[i].px += nx * o; P[i].py += ny * o;
      }
    }

    // walls
    const m = R * 0.85;
    for (const p of P) {
      if (p.x < b.l + m) { p.x = b.l + m; } else if (p.x > b.r - m) { p.x = b.r - m; }
      if (p.y < b.t + m) { p.y = b.t + m; } else if (p.y > b.b - m) { p.y = b.b - m; }
    }
    if (driven) {
      const hx = clamp(head.x, b.l + m, b.r - m), hy = clamp(head.y, b.t + m, b.b - m);
      if (hx !== head.x || hy !== head.y) { head.x = hx; head.y = hy; this.wpT = -1; }
    }
  }

  radius(i) {
    const n = this.pts.length, u = i / (n - 1), R = this.R;
    let r = u < 0.08 ? R * 1.08 : u > 0.5 ? R * (1 - ((u - 0.5) / 0.5) * 0.45) : R;
    if (i < 3) r *= 1 + this.squish * 0.18;
    return r;
  }

  // even steps along the body, tail → head
  samples(step) {
    const P = this.pts, out = [];
    for (let i = P.length - 1; i > 0; i--) {
      const a = P[i], b = P[i - 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 0.001;
      const k = Math.max(1, Math.ceil(len / step));
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      for (let j = 0; j < k; j++) {
        const t = j / k;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: this.radius(i) * (1 - t) + this.radius(i - 1) * t, i: i - t, nx, ny });
      }
    }
    const last = out[out.length - 1] || { nx: 0, ny: 1 };
    out.push({ x: P[0].x, y: P[0].y, r: this.radius(0), i: 0, nx: last.nx, ny: last.ny });
    return out;
  }

  draw(ctx, opts = {}) {
    const P = this.pts, n = P.length, R = this.R;
    const C = COLORS[this.design.color] || COLORS.lombriz;
    const pat = this.design.pattern;
    const body = this.dry > 0.05 ? mixHex(C.body, '#C9BFB2', this.dry * 0.35) : C.body;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    const S = this.samples(R * 0.3);

    // soft airbrushed shadow on the denim
    if (!opts.flat) for (let k = 0; k < S.length; k += 2) { const s = S[k]; dab(ctx, '#1E3A66', s.x + R * 0.12, s.y + R * 0.55, s.r * 1.35, 'soft', 0.2); }

    // body
    for (const s of S) dab(ctx, body, s.x, s.y, s.r);

    // the saddle band every earthworm has
    const s0 = (n - 1) * 0.2, s1 = (n - 1) * 0.31;
    for (const s of S) if (s.i >= s0 && s.i <= s1) dab(ctx, C.saddle, s.x, s.y, s.r * 0.98, 'body', 0.7);

    const across = (s) => Math.atan2(-s.nx, s.ny);
    if (pat === 'rings') {
      for (const s of S) if (s.i > 1.6 && s.i % 1.4 < 0.3) band(ctx, C.dark, s.x, s.y, s.r * 0.96, across(s), 0.3, 'soft', 0.4);
    } else if (pat === 'stripes') {
      for (const s of S) if (s.i > 1.4 && s.i % 2.2 < 0.3) band(ctx, C.dark, s.x, s.y, s.r * 0.98, across(s), 0.38, 'body', 0.9);
    } else if (pat === 'spots') {
      for (let k = 2; k < n - 1; k += 3) {
        const a = P[k - 1], c = P[k + 1], p = P[k];
        let nx = -(c.y - a.y), ny = c.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const side = hash(this.design.name + k) % 2 ? 1 : -1;
        const sx = p.x + nx * side * R * 0.16, sy = p.y + ny * side * R * 0.16;
        dab(ctx, C.spot, sx, sy, this.radius(k) * 1.15, 'soft', 0.85);
        dab(ctx, C.spot, sx, sy, this.radius(k) * 0.42, 'body', 0.55);
      }
    } else if (pat === 'ombre') {
      for (const s of S) { const u = s.i / (n - 1); if (u > 0.3) dab(ctx, C.light, s.x, s.y, s.r * 0.96, 'body', Math.min(0.85, (u - 0.3) * 1.3)); }
    }

    // a gentle airbrushed sheen, only when they've just been misted
    if (this.wet > 0.05) for (const s of S) { if (s.i < 0.7) continue; dab(ctx, C.light, s.x - s.r * 0.25, s.y - s.r * 0.3, s.r * 0.55, 'soft', 0.18 * this.wet); }
    if (this.wet > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * this.wet})`;
      for (let i = 1; i < n - 1; i += 2) {
        const p = P[i], o = (hash('w' + i) % 100) / 100 - 0.5;
        ctx.beginPath(); ctx.arc(p.x + o * R, p.y - R * 0.2 + o * R * 0.6, R * 0.1, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (pat === 'sparkle') {
      for (let i = 2; i < n - 1; i += 3) {
        const p = P[i], tw = 0.5 + 0.5 * Math.sin(this.t * 3 + i);
        star(ctx, p.x + Math.sin(i) * R * 0.4, p.y + Math.cos(i * 1.7) * R * 0.4, R * 0.24 * tw, '#FFFDF5');
      }
    }

    for (const k of this.marks) {
      const i = Math.min(k.i, n - 2), a = P[i - 1] || P[i], c = P[i + 1], p = P[i];
      let nx = -(c.y - a.y), ny = c.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      drawLips(ctx, p.x + nx * k.side * R * 0.35, p.y + ny * k.side * R * 0.35, R * k.s, Math.atan2(ny, nx) + k.rot, 'rgba(226,52,84,0.9)');
    }

    if (this.design.acc === 'pearls' || this.design.acc === 'scarf') this.neckwear(ctx);
    this.face(ctx, C);
    ctx.restore();
  }

  neckwear(ctx) {
    const P = this.pts, R = this.R, i = 2, p = P[i], a = P[i - 1], c = P[i + 1];
    let nx = -(c.y - a.y), ny = c.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const r = this.radius(i);
    if (this.design.acc === 'pearls') {
      for (let k = -3; k <= 3; k++) {
        const x = p.x + nx * (k / 3) * r * 1.02, y = p.y + ny * (k / 3) * r * 1.02 + Math.abs(k) * R * 0.03;
        dab(ctx, '#FFF8EE', x, y, R * 0.17);
      }
    } else {
      for (let k = -4; k <= 4; k++) dab(ctx, k % 2 ? '#F2EADF' : '#E2574C', p.x + nx * (k / 4) * r * 1.08, p.y + ny * (k / 4) * r * 1.08, R * 0.3);
      const fl = Math.sin(this.t * 4) * 0.3;
      for (let k = 1; k <= 4; k++) dab(ctx, k % 2 ? '#E2574C' : '#F2EADF', p.x + nx * r * 1.05 + (c.x - a.x) * k * 0.22 * (1 + fl), p.y + ny * r * 1.05 + (c.y - a.y) * k * 0.22 + k * R * 0.12, R * 0.26);
    }
  }

  // an upright, drawn face: dash eyes, round nose, rosy cheeks
  face(ctx, C) {
    const P = this.pts, R = this.R, h0 = P[0], h1 = P[1];
    const hd = Math.atan2(h0.y - h1.y, h0.x - h1.x);
    let lx = Math.cos(hd) * R * 0.16, ly = Math.sin(hd) * R * 0.1;
    if (this.gaze) { const ga = Math.atan2(this.gaze.y - h0.y, this.gaze.x - h0.x); lx = Math.cos(ga) * R * 0.2; ly = Math.sin(ga) * R * 0.14; }
    const side = Math.cos(hd) >= 0 ? 1 : -1;
    const ink = '#2B1D1F';
    const acc = this.design.acc;
    ctx.save();
    ctx.translate(h0.x, h0.y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (acc === 'headphones') { ctx.strokeStyle = '#2E3240'; ctx.lineWidth = R * 0.16; ctx.beginPath(); ctx.arc(0, -R * 0.05, R * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); }

    const bl = Math.min(1, 0.5 + this.blush * 0.6 + this.happy * 0.1);
    dab(ctx, '#F0788A', -R * 0.56 + lx, R * 0.16 + ly, R * 0.3, 'soft', bl);
    dab(ctx, '#F0788A', R * 0.56 + lx, R * 0.16 + ly, R * 0.3, 'soft', bl);

    const sleeping = this.mode === 'sleep' && this.orbit && this.orbit.t > 1.5;
    const happy = this.happy > 0.6 && !sleeping, love = this.love > 0.6 && !sleeping;
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = R * 0.12;
    for (const sx of [-1, 1]) {
      const cx = sx * R * 0.3 + lx, cy = -R * 0.24 + ly;
      if (sleeping || this.blinkAnim > 0) { ctx.beginPath(); ctx.arc(cx, cy - R * 0.06, R * 0.12, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
      else if (love) { ctx.save(); heart(ctx, cx, cy + R * 0.04, R * 0.28 * (1 + Math.sin(this.t * 10) * 0.08), '#E2344F'); ctx.restore(); }
      else if (happy) { ctx.beginPath(); ctx.arc(cx, cy + R * 0.08, R * 0.12, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      else if (this.surprise > 0.2) { ctx.lineWidth = R * 0.08; ctx.beginPath(); ctx.arc(cx, cy, R * 0.1, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = R * 0.12; }
      else { ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.11); ctx.lineTo(cx, cy + R * 0.11); ctx.stroke(); }
    }
    if (acc === 'glasses') {
      ctx.lineWidth = R * 0.07; ctx.strokeStyle = ink;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * R * 0.3 + lx, -R * 0.24 + ly, R * 0.23, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-R * 0.08 + lx, -R * 0.27 + ly); ctx.quadraticCurveTo(lx, -R * 0.33 + ly, R * 0.08 + lx, -R * 0.27 + ly); ctx.stroke();
    }

    // the nose
    dab(ctx, C.nose, lx * 1.3, R * 0.04 + ly, R * 0.22);

    // the mouth
    const my = R * 0.3 + ly;
    if (this.pucker > 0) {
      dab(ctx, '#D8324F', lx, my + R * 0.04, R * 0.14); ctx.fillStyle = '#7A1626'; ctx.beginPath(); ctx.arc(lx, my + R * 0.04, R * 0.05, 0, Math.PI * 2); ctx.fill();
    } else if (this.chew > 0) {
      const o = Math.abs(Math.sin(this.chew * 18));
      ctx.fillStyle = '#7A1E2A'; ctx.beginPath(); ctx.ellipse(lx, my + R * 0.06, R * 0.12, R * (0.04 + o * 0.08), 0, 0, Math.PI * 2); ctx.fill();
    } else if (happy || love) {
      ctx.fillStyle = '#B8303F'; ctx.beginPath(); ctx.arc(lx, my, R * 0.19, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F08A98'; ctx.beginPath(); ctx.arc(lx, my + R * 0.12, R * 0.08, Math.PI, 0); ctx.fill();
    } else if (this.dry > 0.6) {
      ctx.lineWidth = R * 0.07; ctx.beginPath(); ctx.moveTo(lx - R * 0.12, my + R * 0.08); ctx.quadraticCurveTo(lx, my + R * 0.02, lx + R * 0.12, my + R * 0.08); ctx.stroke();
    } else {
      ctx.lineWidth = R * 0.07; ctx.strokeStyle = ink; ctx.beginPath(); ctx.arc(lx, my - R * 0.06, R * 0.16, Math.PI * 0.22, Math.PI * 0.78); ctx.stroke();
    }

    if (acc === 'mustache') {
      ctx.fillStyle = '#4A3328';
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(lx, my - R * 0.06);
        ctx.bezierCurveTo(lx + sx * R * 0.18, my - R * 0.18, lx + sx * R * 0.42, my - R * 0.12, lx + sx * R * 0.48, my - R * 0.24);
        ctx.bezierCurveTo(lx + sx * R * 0.46, my - R * 0.02, lx + sx * R * 0.2, my + R * 0.02, lx, my - R * 0.02);
        ctx.fill();
      }
    }

    // hats and things on top
    if (acc === 'cap') {
      const col = '#D9663A';
      for (let k = -4; k <= 4; k++) { const a = Math.PI + ((k + 4) / 8) * Math.PI; dab(ctx, col, Math.cos(a) * R * 0.36, -R * 0.7 + Math.sin(a) * R * 0.32, R * 0.24); }
      dab(ctx, col, 0, -R * 0.78, R * 0.4);
      for (let k = 0; k < 5; k++) dab(ctx, '#C4532C', side * (R * 0.35 + k * R * 0.14), -R * 0.6, R * 0.13);
      ctx.fillStyle = '#C4532C'; ctx.beginPath(); ctx.arc(0, -R * 1.12, R * 0.08, 0, Math.PI * 2); ctx.fill();
    } else if (acc === 'beanie') {
      for (let k = -4; k <= 4; k++) { const a = Math.PI + ((k + 4) / 8) * Math.PI; dab(ctx, '#3E5FB0', Math.cos(a) * R * 0.45, -R * 0.62 + Math.sin(a) * R * 0.42, R * 0.28); }
      dab(ctx, '#3E5FB0', 0, -R * 0.8, R * 0.42);
      for (let k = -3; k <= 3; k++) dab(ctx, '#5A7BC8', k * R * 0.22, -R * 0.52, R * 0.17);
      dab(ctx, '#F7EFE2', 0, -R * 1.3, R * 0.24);
    } else if (acc === 'tophat') {
      ctx.fillStyle = '#26232B';
      ctx.beginPath(); ctx.ellipse(0, -R * 0.74, R * 0.72, R * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-R * 0.42, -R * 1.6, R * 0.84, R * 0.86, R * 0.08) : ctx.rect(-R * 0.42, -R * 1.6, R * 0.84, R * 0.86); ctx.fill();
      ctx.fillStyle = '#C9473D'; ctx.fillRect(-R * 0.42, -R * 0.98, R * 0.84, R * 0.16);
    } else if (acc === 'crown') {
      ctx.fillStyle = '#EDBE3F'; ctx.strokeStyle = '#C2921F'; ctx.lineWidth = R * 0.05;
      ctx.beginPath(); ctx.moveTo(-R * 0.5, -R * 0.68); ctx.lineTo(-R * 0.55, -R * 1.25); ctx.lineTo(-R * 0.25, -R * 0.98); ctx.lineTo(0, -R * 1.35); ctx.lineTo(R * 0.25, -R * 0.98); ctx.lineTo(R * 0.55, -R * 1.25); ctx.lineTo(R * 0.5, -R * 0.68); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#E0505A'; ctx.beginPath(); ctx.arc(0, -R * 0.86, R * 0.08, 0, Math.PI * 2); ctx.fill();
    } else if (acc === 'bow') {
      ctx.save(); ctx.translate(R * 0.55, -R * 0.78); ctx.rotate(0.35);
      dab(ctx, '#E8566F', -R * 0.26, 0, R * 0.24); dab(ctx, '#E8566F', R * 0.26, 0, R * 0.24); dab(ctx, '#C93A54', 0, 0, R * 0.13);
      ctx.restore();
    } else if (acc === 'flower') {
      ctx.save(); ctx.translate(R * 0.55, -R * 0.78);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + this.t * 0.2; dab(ctx, '#FFFBF2', Math.cos(a) * R * 0.22, Math.sin(a) * R * 0.22, R * 0.15); }
      dab(ctx, '#F2B632', 0, 0, R * 0.13);
      ctx.restore();
    } else if (acc === 'headphones') {
      dab(ctx, '#EDBE3F', -R * 1.0, R * 0.02, R * 0.26); dab(ctx, '#EDBE3F', R * 1.0, R * 0.02, R * 0.26);
    }
    ctx.restore();
  }
}

function follow(p, q, len) {
  const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 0.0001;
  p.x = q.x + (dx / d) * len; p.y = q.y + (dy / d) * len;
}
function relax(a, c, len) {
  const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.0001, k = ((d - len) / d) * 0.5;
  a.x += dx * k; a.y += dy * k; c.x -= dx * k; c.y -= dy * k;
}
export function heart(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(0, 6); ctx.bezierCurveTo(-14, -4, -8, -16, 0, -8); ctx.bezierCurveTo(8, -16, 14, -4, 0, 6); ctx.fill();
  ctx.restore();
}
export function star(ctx, x, y, r, color) {
  ctx.save(); ctx.fillStyle = color; ctx.beginPath();
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = k % 2 ? r * 0.35 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
