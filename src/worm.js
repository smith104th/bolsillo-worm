// The worm: a soft verlet chain that crawls, curls, gets petted and kissed.
import { clamp, rand, hash } from './util.js';
import { drawLips } from './draw.js';

export const COLORS = {
  lombriz: { label: 'Lombriz', body: '#E8959B', dark: '#C46E78', light: '#F8CFCD', saddle: '#D27880' },
  coral:   { label: 'Coral',   body: '#F2876B', dark: '#CF5F45', light: '#FCC1AE', saddle: '#E06D52' },
  lila:    { label: 'Lila',    body: '#B49BE0', dark: '#8C70C2', light: '#E0D5F7', saddle: '#9E83D3' },
  menta:   { label: 'Menta',   body: '#8FD3AE', dark: '#5FAE86', light: '#CDEFDC', saddle: '#74C096' },
  manteca: { label: 'Manteca', body: '#F1CE6A', dark: '#CFA43C', light: '#FBE9B4', saddle: '#DDB54E' },
  cielo:   { label: 'Cielo',   body: '#86BEE6', dark: '#5793C4', light: '#CBE4F6', saddle: '#6CA7D6' },
  cacao:   { label: 'Cacao',   body: '#B08066', dark: '#8A5C45', light: '#DDBCA9', saddle: '#9A6A52' },
  tomate:  { label: 'Tomate',  body: '#E5574B', dark: '#B93A31', light: '#F5A69D', saddle: '#CC463B' },
  noche:   { label: 'Noche',   body: '#5A628C', dark: '#3E4468', light: '#959CC4', saddle: '#4A517A' },
};
export const PATTERNS = { rings: 'Rings', stripes: 'Stripes', spots: 'Spots', ombre: 'Ombré', sparkle: 'Sparkle' };
export const ACCESSORIES = {
  none: 'Nothing', beanie: 'Beanie', bow: 'Bow', glasses: 'Glasses', mustache: 'Mustache',
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
    let r = u < 0.1 ? R * (0.9 + u) : u > 0.55 ? R * (1 - ((u - 0.55) / 0.45) * 0.5) : R;
    if (i < 4) r *= 1 + this.squish * 0.18;
    return r;
  }

  draw(ctx, opts = {}) {
    const P = this.pts, n = P.length, R = this.R;
    const C = COLORS[this.design.color] || COLORS.lombriz;
    const pat = this.design.pattern;
    const dryFade = this.dry * 0.35;
    const body = dryFade ? mix(C.body, '#BFA99A', dryFade) : C.body;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // shadow
    if (!opts.flat) {
      ctx.save();
      ctx.translate(R * 0.18, R * 0.34);
      ctx.strokeStyle = 'rgba(6,10,24,0.32)';
      ctx.lineWidth = R * 2.05;
      ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      ctx.restore();
    }

    // body, tail first
    const sStart = Math.round(n * 0.2), sEnd = Math.round(n * 0.32);
    for (let i = n - 1; i > 0; i--) {
      const a = P[i], c = P[i - 1];
      let col = body;
      if (pat === 'stripes' && i % 4 < 2) col = mix(C.body, C.dark, 0.45);
      if (pat === 'ombre') col = mix(C.body, C.light, (i / n) * 0.9);
      const saddle = i >= sStart && i <= sEnd;
      if (saddle) col = C.saddle;
      ctx.strokeStyle = col;
      ctx.lineWidth = this.radius(i) + this.radius(i - 1) + (saddle ? R * 0.14 : 0);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }

    // rings
    ctx.strokeStyle = 'rgba(70,20,30,0.16)';
    ctx.lineWidth = Math.max(1, R * 0.09);
    for (let i = 2; i < n - 1; i++) {
      const a = P[i - 1], c = P[i + 1], p = P[i];
      let nx = -(c.y - a.y), ny = c.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const r = this.radius(i) * 0.78;
      ctx.beginPath(); ctx.moveTo(p.x - nx * r, p.y - ny * r); ctx.lineTo(p.x + nx * r, p.y + ny * r); ctx.stroke();
    }

    if (pat === 'spots') {
      ctx.fillStyle = mix(C.dark, '#000000', 0.1);
      for (let i = 2; i < n - 1; i++) {
        const hsh = hash(this.design.name + i);
        if (hsh % 3) continue;
        const a = P[i - 1], c = P[i + 1], p = P[i];
        let nx = -(c.y - a.y), ny = c.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const off = ((hsh % 100) / 100 - 0.5) * this.radius(i);
        ctx.beginPath(); ctx.ellipse(p.x + nx * off, p.y + ny * off, R * 0.22, R * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      }
    }

    // highlight from top-left
    ctx.save();
    ctx.translate(-R * 0.26, -R * 0.36);
    ctx.strokeStyle = C.light;
    ctx.globalAlpha = this.alpha * (0.5 + this.wet * 0.45);
    ctx.lineWidth = R * (0.42 + this.wet * 0.12);
    ctx.beginPath();
    for (let i = 0; i < n - 2; i++) (i ? ctx.lineTo(P[i].x, P[i].y) : ctx.moveTo(P[i].x, P[i].y));
    ctx.stroke();
    ctx.restore();

    if (this.wet > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${0.75 * this.wet})`;
      for (let i = 1; i < n - 1; i += 2) {
        const p = P[i], o = (hash('w' + i) % 100) / 100 - 0.5;
        ctx.beginPath(); ctx.arc(p.x + o * R, p.y - R * 0.2 + o * R * 0.6, R * 0.1, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (pat === 'sparkle') {
      for (let i = 2; i < n - 1; i += 3) {
        const p = P[i], tw = 0.5 + 0.5 * Math.sin(this.t * 3 + i);
        star(ctx, p.x + Math.sin(i) * R * 0.4, p.y + Math.cos(i * 1.7) * R * 0.4, R * 0.22 * tw, '#FFFDF5');
      }
    }

    // kisses on the body
    for (const k of this.marks) {
      const i = Math.min(k.i, n - 2), a = P[i - 1] || P[i], c = P[i + 1], p = P[i];
      let nx = -(c.y - a.y), ny = c.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      drawLips(ctx, p.x + nx * k.side * R * 0.35, p.y + ny * k.side * R * 0.35, R * k.s, Math.atan2(ny, nx) + k.rot, 'rgba(196,30,58,0.85)');
    }

    if (this.design.acc === 'pearls' || this.design.acc === 'scarf') this.neckwear(ctx, C);
    this.face(ctx, C);
    ctx.restore();
  }

  neckwear(ctx) {
    const P = this.pts, R = this.R, i = 3, p = P[i], a = P[i - 1], c = P[i + 1];
    let nx = -(c.y - a.y), ny = c.x - a.x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const r = this.radius(i);
    if (this.design.acc === 'pearls') {
      for (let k = -3; k <= 3; k++) {
        const x = p.x + nx * (k / 3) * r * 1.02, y = p.y + ny * (k / 3) * r * 1.02;
        ctx.fillStyle = '#FFFBF0'; ctx.beginPath(); ctx.arc(x, y, R * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(x - R * 0.05, y - R * 0.05, R * 0.06, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#D9483B'; ctx.lineWidth = R * 0.55;
      ctx.beginPath(); ctx.moveTo(p.x - nx * r * 1.12, p.y - ny * r * 1.12); ctx.lineTo(p.x + nx * r * 1.12, p.y + ny * r * 1.12); ctx.stroke();
      ctx.strokeStyle = '#F4EBDD'; ctx.lineWidth = R * 0.14;
      ctx.beginPath(); ctx.moveTo(p.x - nx * r * 1.12, p.y - ny * r * 1.12); ctx.lineTo(p.x + nx * r * 1.12, p.y + ny * r * 1.12); ctx.stroke();
      const tx = p.x + nx * r * 1.1, ty = p.y + ny * r * 1.1, fl = Math.sin(this.t * 4) * 0.25;
      ctx.lineCap = 'round'; ctx.strokeStyle = '#D9483B'; ctx.lineWidth = R * 0.42;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + nx * R * 0.8 + (c.x - a.x) * 0.3, ty + ny * R * 0.8 + (c.y - a.y) * 0.3, tx + nx * R * 0.6 + (c.x - a.x) * (0.9 + fl), ty + ny * R * 0.6 + (c.y - a.y) * (0.9 + fl));
      ctx.stroke();
    }
  }

  face(ctx, C) {
    const P = this.pts, R = this.R, h0 = P[0], h1 = P[1];
    const ang = Math.atan2(h0.y - h1.y, h0.x - h1.x);
    ctx.save();
    ctx.translate(h0.x, h0.y);
    ctx.rotate(ang);
    const acc = this.design.acc;

    // blush
    const bl = Math.min(1, this.blush + this.happy * 0.15);
    if (bl > 0.02) {
      ctx.fillStyle = `rgba(232,72,92,${0.18 + bl * 0.5})`;
      ctx.beginPath(); ctx.ellipse(-R * 0.05, -R * 0.62, R * 0.22, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-R * 0.05, R * 0.62, R * 0.22, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    }

    if (acc === 'beanie') {
      ctx.fillStyle = '#C9473A';
      ctx.beginPath(); ctx.arc(-R * 0.15, 0, R * 1.02, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = R * 0.06;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(-R * 0.2, k * R * 0.35); ctx.lineTo(-R * 1.05 * Math.cos(Math.asin(Math.min(0.95, Math.abs(k * 0.35)))), k * R * 0.35); ctx.stroke(); }
      ctx.fillStyle = '#E2685A'; ctx.fillRect(-R * 0.32, -R * 1.0, R * 0.22, R * 2.0);
      ctx.fillStyle = '#F4EBDD'; ctx.beginPath(); ctx.arc(-R * 1.05, 0, R * 0.36, 0, Math.PI * 2); ctx.fill();
    }
    if (acc === 'tophat') {
      ctx.fillStyle = '#1F1B24'; ctx.beginPath(); ctx.arc(-R * 0.3, 0, R * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#B23A3A'; ctx.beginPath(); ctx.arc(-R * 0.3, 0, R * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2C2733'; ctx.beginPath(); ctx.arc(-R * 0.3, 0, R * 0.52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(-R * 0.45, -R * 0.15, R * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    if (acc === 'crown') {
      ctx.fillStyle = '#E8B93C'; ctx.strokeStyle = '#B88A1E'; ctx.lineWidth = R * 0.06;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, r = k % 2 ? R * 0.42 : R * 0.7; ctx.lineTo(-R * 0.3 + Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#D9483B'; ctx.beginPath(); ctx.arc(-R * 0.3, 0, R * 0.16, 0, Math.PI * 2); ctx.fill();
    }

    // eyes
    const ex = R * 0.18, ey = R * 0.4;
    const sleeping = this.mode === 'sleep' && this.orbit && this.orbit.t > 1.5;
    const happyEyes = this.happy > 0.6 && !sleeping;
    const loveEyes = this.love > 0.6 && !sleeping;
    for (const s of [-1, 1]) {
      const cx = ex, cy = s * ey;
      if (sleeping || (this.blinkAnim > 0 && !happyEyes)) {
        ctx.strokeStyle = '#2A1D22'; ctx.lineWidth = R * 0.09;
        ctx.beginPath(); ctx.arc(cx - R * 0.05, cy, R * 0.18, -Math.PI / 2.4, Math.PI / 2.4); ctx.stroke();
      } else if (loveEyes) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 2);
        heart(ctx, 0, 0, R * 0.32 * (1 + Math.sin(this.t * 10) * 0.08), '#E0334E'); ctx.restore();
      } else if (happyEyes) {
        ctx.strokeStyle = '#2A1D22'; ctx.lineWidth = R * 0.1;
        ctx.beginPath(); ctx.arc(cx - R * 0.12, cy, R * 0.2, -Math.PI / 2.6, Math.PI / 2.6); ctx.stroke();
      } else {
        const big = 1 + this.surprise * 0.5;
        ctx.fillStyle = '#FFFDF8';
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.28 * big, 0, Math.PI * 2); ctx.fill();
        let gx = 0.6, gy = 0;
        if (this.gaze) {
          const dx = this.gaze.x - P[0].x, dy = this.gaze.y - P[0].y;
          const la = Math.atan2(dy, dx) - ang; gx = Math.cos(la); gy = Math.sin(la);
        }
        ctx.fillStyle = '#1E1418';
        ctx.beginPath(); ctx.arc(cx + gx * R * 0.1, cy + gy * R * 0.1, R * 0.16 * (this.surprise > 0 ? 0.7 : 1), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(cx + gx * R * 0.1 - R * 0.05, cy + gy * R * 0.1 - R * 0.06, R * 0.055, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (acc === 'glasses') {
      ctx.strokeStyle = '#2A1D22'; ctx.lineWidth = R * 0.08;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(ex, s * ey, R * 0.36, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ex + R * 0.1, -ey + R * 0.32); ctx.quadraticCurveTo(ex + R * 0.22, 0, ex + R * 0.1, ey - R * 0.32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex - R * 0.3, -ey - R * 0.2); ctx.lineTo(-R * 0.7, -ey - R * 0.3); ctx.moveTo(ex - R * 0.3, ey + R * 0.2); ctx.lineTo(-R * 0.7, ey + R * 0.3); ctx.stroke();
    }

    // mouth
    if (this.pucker > 0) {
      ctx.fillStyle = '#C21E3A';
      ctx.beginPath(); ctx.ellipse(R * 0.82, 0, R * 0.16, R * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7A0F22'; ctx.beginPath(); ctx.ellipse(R * 0.84, 0, R * 0.06, R * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    } else if (this.chew > 0) {
      const o = Math.abs(Math.sin(this.chew * 18));
      ctx.fillStyle = '#5A1E2A'; ctx.beginPath(); ctx.ellipse(R * 0.72, 0, R * (0.06 + o * 0.08), R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    } else if (this.surprise > 0.2) {
      ctx.fillStyle = '#5A1E2A'; ctx.beginPath(); ctx.arc(R * 0.72, 0, R * 0.1, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = '#4A1C26'; ctx.lineWidth = R * 0.08;
      const smile = this.dry > 0.6 ? -1 : 1;
      ctx.beginPath(); ctx.arc(R * (smile > 0 ? 0.5 : 0.95), 0, R * 0.24, -0.75 * smile + (smile < 0 ? Math.PI : 0), 0.75 * smile + (smile < 0 ? Math.PI : 0)); ctx.stroke();
    }

    if (acc === 'mustache') {
      ctx.fillStyle = '#3D2A20';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(R * 0.62, 0);
        ctx.bezierCurveTo(R * 0.75, s * R * 0.2, R * 0.72, s * R * 0.55, R * 0.48, s * R * 0.62);
        ctx.bezierCurveTo(R * 0.62, s * R * 0.5, R * 0.6, s * R * 0.25, R * 0.5, s * R * 0.12);
        ctx.closePath(); ctx.fill();
      }
    }
    if (acc === 'bow') {
      ctx.save(); ctx.translate(-R * 0.25, -R * 0.82); ctx.rotate(0.3);
      ctx.fillStyle = '#E0334E';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-R * 0.55, -R * 0.38); ctx.lineTo(-R * 0.55, R * 0.38); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 0.55, -R * 0.38); ctx.lineTo(R * 0.55, R * 0.38); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#B81F3A'; ctx.beginPath(); ctx.arc(0, 0, R * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (acc === 'flower') {
      ctx.save(); ctx.translate(-R * 0.3, -R * 0.75);
      ctx.fillStyle = '#FFFDF5';
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + this.t * 0.2; ctx.beginPath(); ctx.ellipse(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, R * 0.2, R * 0.11, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#F2B632'; ctx.beginPath(); ctx.arc(0, 0, R * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (acc === 'headphones') {
      ctx.strokeStyle = '#2B2D3A'; ctx.lineWidth = R * 0.16;
      ctx.beginPath(); ctx.moveTo(-R * 0.2, -R * 0.95); ctx.quadraticCurveTo(-R * 0.55, 0, -R * 0.2, R * 0.95); ctx.stroke();
      ctx.fillStyle = '#E8B93C';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-R * 0.15, s * R * 0.98, R * 0.32, R * 0.2, 0, 0, Math.PI * 2); ctx.fill(); }
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
