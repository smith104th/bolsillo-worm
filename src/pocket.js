// The pocket: canvas scene with the worm(s), things that fell through the hole,
// crumbs, weather from the other side, and live fingertips.
import { Worm, heart, star, segsFor } from './worm.js';
import { makeSky, drawHole, drawItem, drawFood, itemRadius, SKY } from './draw.js';
import { dab, drawEmoji } from './brush.js';
import { KISS_EMOJI } from './draw.js';
import { clamp, rand, pick, seeded } from './util.js';
import { sfx, buzz } from './feel.js';

export class Pocket {
  constructor(canvas, hooks = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.items = [];
    this.food = [];
    this.parts = [];
    this.drops = [];
    this.worm = null;     // their worm, living here
    this.mine = null;     // my worm, only visible when the hole is open (both here)
    this.live = false;
    this.asleep = false;
    this.weather = { kind: 'none', day: true };
    this.needs = { hungry: 0, dry: 0 };
    this.g = { x: 0, y: 0 }; this.gRaw = { x: 0, y: 0 }; this.gBase = null;
    this.glow = 0; this.flash = 0; this.shake = 0;
    this.myFinger = null; this.theirFinger = null; this.matchT = 0; this.knotUntil = 0; this.knotCool = 0;
    this.ptr = null;
    this.t = 0;
    this.imgCache = new Map();
    this.insets = hooks.insets || (() => ({ top: 90, bottom: 120 }));
    this.resize();
    this.bind();
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    this.running = false;
    window.addEventListener('resize', () => this.resize());
  }

  // ── setup
  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = W; this.H = H; this.dpr = dpr;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    const ins = this.insets();
    this.bounds = { l: 14, r: W - 14, t: ins.top, b: H - ins.bottom };
    this.R = clamp(Math.min(W, H) * 0.044, 12, 19);
    this.holeR = Math.min(W * 0.115, 48);
    this.hole = { x: W / 2, y: this.bounds.b - this.holeR * 1.7 };
    this.denim = makeSky(W, H, dpr, this.sky || SKY);
    this.stars = Array.from({ length: Math.round(W * H / 5200) }, (_, i) => { const r = seeded(i * 7919 + 13); return { x: r() * W, y: r() * H * 0.78, s: 0.5 + r() * 1.3, ph: r() * 6.28, sp: 0.6 + r() * 1.6 }; });
    for (const w of [this.worm, this.mine]) if (w) { w.R = this.R; w.spacing = this.R * 0.62; w.speedBase = this.R * 3.4; }
  }

  start() { if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.loop); } }
  stop() { this.running = false; }

  setTheirWorm(design, inches) {
    const segs = segsFor(inches);
    if (!this.worm) {
      this.worm = new Worm(design, { x: this.W * 0.5, y: (this.bounds.t + this.bounds.b) / 2, R: this.R, segs, angle: -0.4 });
    } else { this.worm.setDesign(design); this.worm.setSegments(segs); }
  }
  setMyWorm(design, inches) {
    this.myDesign = design; this.myInches = inches;
    if (this.mine) { this.mine.setDesign(design); this.mine.setSegments(segsFor(inches)); }
  }

  setLive(on) {
    if (on === this.live) return;
    this.live = on;
    if (on && this.myDesign) {
      this.mine = new Worm(this.myDesign, { x: this.hole.x, y: this.hole.y, R: this.R, segs: segsFor(this.myInches || 4), angle: -Math.PI / 2 });
      this.mine.alpha = 0;
      this.mine.wp = { x: this.hole.x + rand(-60, 60), y: this.hole.y - 120 };
      this.burst('spark', this.hole.x, this.hole.y, 14);
      sfx.plop();
    }
    if (!on) { this.theirFinger = null; this.leaving = this.mine; }
  }

  setAsleep(on) { this.asleep = on; if (this.worm) this.worm.sleep(on); }
  setNeeds(n) { this.needs = n; if (this.worm) { this.worm.dry = clamp((n.dry - 0.5) * 2, 0, 1); } }
  setWeather(kind, day) { this.weather = { kind, day }; }
  setSky(sky) {
    if (this.sky && this.sky.key === sky.key) return;
    this.sky = sky;
    this.denim = makeSky(this.W, this.H, this.dpr, sky);
  }
  setMarks(n) { if (!this.worm) return; while (this.worm.marks.length < Math.min(n, 12)) this.worm.addMark(((this.worm.marks.length + 1) * 0.6180339) % 1); }

  setTilt(gx, gy) {
    this.gRaw = { x: gx, y: gy };
    if (!this.gBase) this.gBase = { x: gx, y: gy, n: 1 };
    else if (this.gBase.n < 60) { const b = this.gBase; b.n++; b.x += (gx - b.x) / b.n; b.y += (gy - b.y) / b.n; }
  }
  jolt(power = 1) {
    for (const it of this.items) { it.px -= rand(-8, 8) * power; it.py -= rand(-10, 4) * power; it.vr += rand(-0.4, 0.4); }
    if (this.worm) { this.worm.surprise = 1; this.worm.pts.forEach((p) => { p.px -= rand(-3, 3) * power; p.py -= rand(-3, 3) * power; }); }
    this.shake = 0.4 * power;
  }

  // ── items
  syncItems(list) {
    const keep = new Set(list.map((i) => i.id));
    this.items = this.items.filter((i) => keep.has(i.id) || i.diving != null);
    for (const it of list) {
      const have = this.items.find((x) => x.id === it.id);
      if (have) { Object.assign(have, { payload: it.payload, opened: it.opened, kept: it.kept }); continue; }
      this.addItem(it, false);
    }
  }
  addItem(it, fromHole = true) {
    const r = itemRadius(it.kind);
    const b = this.bounds;
    const x = fromHole ? this.hole.x : rand(b.l + 40, b.r - 40);
    const y = fromHole ? this.hole.y : rand(b.t + 60, b.b - 80);
    const o = { ...it, r, x, y, px: x - (fromHole ? rand(-3, 3) : 0), py: y + (fromHole ? rand(9, 14) : 0), rot: rand(-0.5, 0.5), vr: fromHole ? rand(-0.15, 0.15) : 0, seed: rand(10), s: fromHole ? 0 : 1, hop: 0, hopT: rand(3, 9) };
    this.items.push(o);
    if (fromHole) { this.burst('spark', this.hole.x, this.hole.y, 10); this.glow = 1; sfx.plop(); }
    return o;
  }
  removeItem(id) { this.items = this.items.filter((i) => i.id !== id); }
  sendIntoHole(kind, payload = {}) {
    // my outgoing thing: pops up from the bottom and dives into the hole
    const it = { id: 'out' + Math.random(), kind, payload, mine: true, opened: true };
    const o = this.addItem(it, false);
    o.x = o.px = this.W / 2; o.y = o.py = this.H + 30;
    o.diving = 0; o.r = itemRadius(kind);
  }

  image(src) {
    if (!src) return null;
    let img = this.imgCache.get(src);
    if (!img) { img = new Image(); img.src = src; this.imgCache.set(src, img); }
    return img;
  }

  // ── care
  dropFood(kind) {
    const b = this.bounds;
    const f = { kind, x: rand(b.l + 60, b.r - 60), y: b.t - 20, vy: 0, land: rand(b.t + 80, b.b - 110), left: 1, s: 1 };
    this.food.push(f);
    sfx.pop();
  }
  mist() {
    if (!this.worm) return;
    const m = this.worm.mid();
    for (let i = 0; i < 46; i++) this.parts.push({ type: 'drop', x: m.x + rand(-80, 80), y: m.y - rand(140, 260), vx: rand(-20, 20), vy: rand(160, 260), life: rand(0.6, 1.1), max: 1, size: rand(1.5, 3) });
    setTimeout(() => { if (this.worm) { this.worm.wet = 1; this.worm.happy = 1.4; } }, 500);
    sfx.mist();
  }
  kissFly(level) {
    if (!this.worm) return;
    const h = this.worm.head();
    const n = level >= 5 ? 6 : level >= 3 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      this.parts.push({ type: 'emojifly', ch: k === 0 ? KISS_EMOJI[level] : '💋', x: this.W - 48 + rand(-10, 10), y: this.H - 60, tx: h, delay: k * 0.12, life: 0.75, max: 0.75, size: 22 + level * 6, level, rot: rand(-0.3, 0.3), hits: k === 0 });
    }
  }
  blowKiss(level) {
    // the worm in this pocket blows kisses at the glass
    const w = this.worm; if (!w) return;
    w.pucker = 1.4 + level * 0.2;
    const h = w.head();
    for (let k = 0; k < level + 1; k++) this.parts.push({ type: 'emojiout', ch: '💋', x: h.x, y: h.y, vx: rand(-60, 60), vy: rand(-90, -30), delay: 0.25 + k * 0.12, life: 1.1, max: 1.1, size: 16, grow: 2 + level * 0.6, rot: rand(-0.4, 0.4) });
  }
  // an emoji comes out of the hole and floats up
  reaction(ch) {
    const { x, y } = this.hole;
    this.parts.push({ type: 'emojibig', ch, x, y, vx: rand(-20, 20), vy: -150, life: 2.6, max: 2.6, size: 64, rot: rand(-0.2, 0.2) });
    for (let k = 0; k < 6; k++) this.parts.push({ type: 'emojiout', ch, x, y, vx: rand(-140, 140), vy: rand(-220, -90), delay: 0.15 + k * 0.05, life: 1.3, max: 1.3, size: 18, grow: 0.4, rot: rand(-0.6, 0.6) });
    this.glow = 1;
    if (this.worm) { this.worm.happy = 2; this.worm.dance = 0.8; this.worm.danceAmp = this.R * 0.45; this.worm.gaze = { x, y: y - 120 }; }
  }
  // my emoji dives into the hole
  sendReaction(ch) {
    this.parts.push({ type: 'emojifly', ch, x: this.W - 48, y: this.H - 60, tx: this.hole, life: 0.7, max: 0.7, size: 46, rot: 0, toHole: true });
  }
  wiggle(pattern) {
    // pattern: [on, off, on, off...] in ms, played as dance pulses on whichever worm lives here
    const w = this.worm; if (!w) return;
    let t = 0;
    pattern.forEach((ms, i) => {
      if (i % 2 === 0) setTimeout(() => { w.dance = Math.max(w.dance, ms / 1000 + 0.15); w.danceAmp = this.R * 0.55; w.happy = 1; }, t);
      t += ms;
    });
  }
  knocked() {
    this.shake = 0.6; this.jolt(0.6);
    if (this.worm) { this.worm.surprise = 1.2; this.worm.gaze = { x: this.W / 2, y: 0 }; }
  }

  burst(type, x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), sp = rand(30, 140);
      this.parts.push({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: rand(0.7, 1.4), max: 1.4, size: rand(5, 11), rot: rand(-0.5, 0.5) });
    }
  }

  setTheirFinger(f) { this.theirFinger = f && (f.d || f.down) ? { x: this.bounds.l + f.x * (this.bounds.r - this.bounds.l), y: this.bounds.t + f.y * (this.bounds.b - this.bounds.t), at: performance.now() } : null; }
  norm(x, y) { const b = this.bounds; return { x: clamp((x - b.l) / (b.r - b.l), 0, 1), y: clamp((y - b.t) / (b.b - b.t), 0, 1) }; }

  // ── input
  bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => this.down(e));
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerup', (e) => this.up(e));
    cv.addEventListener('pointercancel', (e) => this.up(e, true));
  }
  pos(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  down(e) {
    if (this.ptr) return;
    try { this.cv.setPointerCapture(e.pointerId); } catch { /* synthetic or already released */ }
    const p = this.pos(e);
    const ptr = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: performance.now(), moved: 0, petDist: 0, lastPet: 0, hist: [] };
    const it = [...this.items].reverse().find((i) => !i.diving && (i.x - p.x) ** 2 + (i.y - p.y) ** 2 < (i.r + 10) ** 2);
    if (it) ptr.item = it;
    else if (this.worm && this.worm.hit(p.x, p.y) >= 0) { ptr.worm = this.worm; ptr.seg = this.worm.hit(p.x, p.y); }
    else if (this.mine && this.mine.hit(p.x, p.y) >= 0) { ptr.worm = this.mine; ptr.seg = this.mine.hit(p.x, p.y); ptr.isMine = true; }
    ptr.empty = !ptr.item && !ptr.worm;
    ptr.edge = p.x < 24 || p.x > this.W - 24;
    this.ptr = ptr;
    ptr.longT = setTimeout(() => {
      if (this.ptr === ptr && ptr.worm && ptr.moved < 10) {
        ptr.grabbing = true; ptr.worm.grab = { i: ptr.seg, x: p.x, y: p.y }; ptr.worm.surprise = 0.8; ptr.worm.mode = ptr.worm.mode === 'sleep' ? 'wander' : ptr.worm.mode;
        buzz(18); sfx.squish();
      }
    }, 420);
    this.myFinger = { x: p.x, y: p.y };
    this.hooks.onFinger?.(this.norm(p.x, p.y), true);
  }
  move(e) {
    const ptr = this.ptr; if (!ptr || e.pointerId !== ptr.id) return;
    const p = this.pos(e);
    // a sideways flick on empty space (or any drag from the edge) turns the page
    if ((ptr.empty || ptr.edge) && !ptr.decided) {
      const ax = Math.abs(p.x - ptr.x0), ay = Math.abs(p.y - ptr.y0);
      if (ax > 14 || ay > 14) {
        ptr.decided = true;
        const quick = performance.now() - ptr.t0 < 260;
        if ((ptr.empty || !ptr.item) && (ptr.edge || quick || !this.live) && ax > ay * 1.3 && this.hooks.onSwipe?.({ pointerId: e.pointerId, clientX: e.clientX - (p.x - ptr.x0) })) {
          clearTimeout(ptr.longT);
          if (ptr.item) ptr.item.held = false;
          this.ptr = null; this.myFinger = null; this.hooks.onFinger?.(null, false);
          try { this.cv.releasePointerCapture(e.pointerId); } catch { /* */ }
          return;
        }
      }
    }
    const dx = p.x - ptr.x, dy = p.y - ptr.y, d = Math.hypot(dx, dy);
    ptr.moved += d; ptr.x = p.x; ptr.y = p.y;
    ptr.hist.push({ x: p.x, y: p.y, t: performance.now() }); if (ptr.hist.length > 6) ptr.hist.shift();
    this.myFinger = { x: p.x, y: p.y };
    this.hooks.onFinger?.(this.norm(p.x, p.y), true);

    if (ptr.item && ptr.moved > 6) {
      const it = ptr.item; it.held = true;
      it.px = it.x; it.py = it.y; it.x = p.x; it.y = p.y;
    } else if (ptr.grabbing) {
      ptr.worm.grab.x = p.x; ptr.worm.grab.y = p.y;
    } else if (ptr.worm && !ptr.isMine) {
      // stroking = petting
      const w = ptr.worm;
      if (w.hit(p.x, p.y, 1.8) >= 0) {
        ptr.petDist += d;
        w.happy = Math.min(3, w.happy + d * 0.006);
        w.gaze = p;
        if (ptr.petDist - ptr.lastPet > 34) {
          ptr.lastPet = ptr.petDist;
          this.parts.push({ type: 'heart', x: p.x + rand(-6, 6), y: p.y - 8, vx: rand(-20, 20), vy: rand(-80, -50), life: 1, max: 1, size: rand(9, 14), rot: rand(-0.3, 0.3) });
          if (Math.random() < 0.35) sfx.coo();
          buzz(6);
          this.hooks.onPet?.();
          if (w.mode === 'sleep') { w.happy = 2; }
        }
      }
    }
  }
  up(e, cancel) {
    const ptr = this.ptr; if (!ptr || e.pointerId !== ptr.id) return;
    clearTimeout(ptr.longT);
    this.ptr = null;
    this.myFinger = null;
    this.hooks.onFinger?.(null, false);
    const quick = performance.now() - ptr.t0 < 350 && ptr.moved < 10;
    if (ptr.item) {
      const it = ptr.item; it.held = false;
      if (ptr.hist.length > 2) {
        const a = ptr.hist[0], z = ptr.hist[ptr.hist.length - 1], dt = Math.max(16, z.t - a.t);
        it.px = it.x - ((z.x - a.x) / dt) * 16; it.py = it.y - ((z.y - a.y) / dt) * 16;
        it.vr += ((z.x - a.x) / dt) * 0.05;
      }
      if (quick && !cancel) this.hooks.onOpenItem?.(it);
      return;
    }
    if (ptr.grabbing) { ptr.worm.grab = null; ptr.worm.squish = 1; sfx.squish(); if (this.asleep && ptr.worm === this.worm) setTimeout(() => this.worm?.sleep(true), 6000); return; }
    if (ptr.worm && quick && !cancel) {
      const w = ptr.worm;
      w.squish = 1; w.happy = Math.max(w.happy, 1.2); w.surprise = 0.3;
      if (ptr.seg <= 2) { sfx.boop(); this.burst('spark', ptr.x, ptr.y, 5); } else { sfx.squish(); w.dance = 0.35; w.danceAmp = this.R * 0.4; }
      buzz(10);
      if (!ptr.isMine) this.hooks.onBoop?.(ptr.seg <= 2);
      if (w.mode === 'sleep') { const was = w; was.sleep(false); setTimeout(() => { if (this.asleep && this.worm === was) was.sleep(true); }, 7000); }
      return;
    }
    if (quick && !ptr.worm) {
      this.parts.push({ type: 'ripple', x: ptr.x, y: ptr.y, life: 0.6, max: 0.6, size: 4 });
      if (this.worm) this.worm.gaze = { x: ptr.x, y: ptr.y };
    }
  }

  // ── simulation + render
  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now; this.t += dt;
    this.step(dt);
    this.render();
    requestAnimationFrame(this.loop);
  }

  step(dt) {
    const b = this.bounds;
    // tilt, relative to how they're holding the phone
    const gb = this.gBase || { x: 0, y: 0 };
    const tgx = (this.gRaw.x - gb.x) * 1100, tgy = (this.gRaw.y - gb.y) * 1100;
    this.g.x += (tgx - this.g.x) * Math.min(1, dt * 6); this.g.y += (tgy - this.g.y) * Math.min(1, dt * 6);
    const env = { bounds: b, gx: this.g.x, gy: this.g.y };

    this.glow = Math.max(this.live ? 0.3 + 0.15 * Math.sin(this.t * 2) : 0, this.glow - dt * 0.6);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.knotCool = Math.max(0, this.knotCool - dt);

    // their worm
    const w = this.worm;
    if (w) {
      // follow food
      const f = this.food.find((x) => x.landed && x.left > 0);
      if (f && w.mode !== 'sleep' && !w.grab) {
        w.follow = { x: f.x, y: f.y };
        const hd = w.head();
        if (Math.hypot(hd.x - f.x, hd.y - f.y) < this.R * 1.3) {
          w.follow = null; w.rest = 0.5;
          if (w.chew <= 0) { w.chew = 0.5; sfx.chomp(); }
          f.left -= dt * 0.55;
          if (Math.random() < 0.2) this.parts.push({ type: 'crumb', x: f.x, y: f.y, vx: rand(-40, 40), vy: rand(-60, -20), life: 0.5, max: 0.5, size: 2, kind: f.kind });
          if (f.left <= 0) { w.happy = 3; w.love = 1.5; this.burst('heart', hd.x, hd.y, 6); buzz([10, 40, 10]); }
        }
      } else if (this.live && this.theirFinger && performance.now() < this.knotUntil === false) {
        w.follow = { x: this.theirFinger.x, y: this.theirFinger.y };
      } else if (!this.live && this.ptr && !this.ptr.worm && !this.ptr.item && this.ptr.moved > 12 && w.mode !== 'sleep') {
        w.follow = { x: this.ptr.x, y: this.ptr.y + 18 }; w.gaze = { x: this.ptr.x, y: this.ptr.y };
      } else if (w.mode !== 'knot') {
        w.follow = null;
      }
      w.energy = this.live ? 1.25 : 1;
      w.update(dt, env);
      if (!this.ptr && Math.random() < dt * 0.15) w.gaze = null;
    }
    // my worm, during live mode
    const m = this.mine;
    if (m) {
      if (this.live) {
        m.alpha = Math.min(1, m.alpha + dt * 2);
        if (this.ptr && !this.ptr.item && !(this.ptr.worm === this.worm)) m.follow = { x: this.ptr.x, y: this.ptr.y };
        else if (m.mode !== 'knot') m.follow = null;
      } else {
        m.follow = { x: this.hole.x, y: this.hole.y }; m.alpha -= dt * 1.5;
        if (m.alpha <= 0) { this.mine = null; }
      }
      m.update(dt, env);
    }

    // touching through the hole
    if (this.live && this.myFinger && this.theirFinger && this.knotCool <= 0) {
      const d = Math.hypot(this.myFinger.x - this.theirFinger.x, this.myFinger.y - this.theirFinger.y);
      if (d < Math.max(46, this.W * 0.12)) {
        this.matchT += dt;
        if (this.matchT > 0.25 && Math.random() < dt * 8) buzz(5);
        if (this.matchT > 1.1) this.knot();
      } else this.matchT = Math.max(0, this.matchT - dt * 2);
    } else this.matchT = Math.max(0, this.matchT - dt * 2);
    if (this.knotUntil && performance.now() > this.knotUntil) {
      this.knotUntil = 0;
      for (const x of [this.worm, this.mine]) if (x) { x.mode = 'wander'; x.orbit = null; }
    }

    // food
    for (const f of this.food) {
      if (!f.landed) { f.vy += 900 * dt; f.y += f.vy * dt; if (f.y >= f.land) { f.y = f.land; f.landed = true; f.vy = 0; sfx.plop(); this.burst('crumb', f.x, f.y, 4); } }
    }
    this.food = this.food.filter((f) => f.left > 0);

    // items
    const damp = Math.pow(0.9, dt * 60);
    for (const it of this.items) {
      it.s = Math.min(1, (it.s ?? 1) + dt * 2.5);
      if (it.diving != null) {
        it.diving += dt;
        const k = Math.min(1, it.diving / 0.9);
        it.x += (this.hole.x - it.x) * Math.min(1, dt * 5); it.y = this.H + 30 + (this.hole.y - this.H - 30) * Math.sin(k * Math.PI / 2) - Math.sin(k * Math.PI) * 120;
        it.s = 1 - Math.max(0, (it.diving - 0.75) / 0.35);
        it.rot += dt * 4;
        if (it.diving > 1.1) { it.gone = true; this.glow = 1; this.burst('spark', this.hole.x, this.hole.y, 12); sfx.plop(); }
        continue;
      }
      if (it.held) continue;
      const vx = (it.x - it.px) * damp, vy = (it.y - it.py) * damp;
      it.px = it.x; it.py = it.y;
      it.x += vx + this.g.x * 0.5 * dt * dt; it.y += vy + this.g.y * 0.5 * dt * dt;
      it.rot += it.vr * dt * 10; it.vr *= Math.pow(0.9, dt * 60);
      if (it.kind === 'wiggle') {
        it.hopT -= dt;
        if (it.hopT < 0) { it.hopT = rand(4, 10); it.hopA = 0.5; it.px -= rand(-2, 2); it.py += 2; }
        it.hopA = Math.max(0, (it.hopA || 0) - dt); it.hop = Math.sin((it.hopA / 0.5) * Math.PI) * (it.hopA > 0 ? 1 : 0);
      }
    }
    this.items = this.items.filter((i) => !i.gone);
    // collisions: items vs items, items vs worms
    const its = this.items.filter((i) => i.diving == null);
    for (let i = 0; i < its.length; i++) {
      const a = its[i];
      for (let j = i + 1; j < its.length; j++) {
        const c = its[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = (a.r + c.r) * 0.8;
        if (d < min) { const k = (min - d) / d * 0.5; if (!a.held) { a.x -= dx * k; a.y -= dy * k; } if (!c.held) { c.x += dx * k; c.y += dy * k; } a.vr += 0.01; c.vr -= 0.01; }
      }
      for (const wm of [this.worm, this.mine]) {
        if (!wm || a.held) continue;
        for (let k = 0; k < wm.pts.length; k += 2) {
          const p = wm.pts[k], dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy) || 0.01, min = a.r * 0.75 + wm.R;
          if (d < min) { const q = (min - d) / d * 0.35; a.x += dx * q; a.y += dy * q; }
        }
      }
      const m2 = a.r * 0.7;
      if (a.x < b.l + m2) { a.x = b.l + m2; a.px = a.x + (a.x - a.px) * 0.3; }
      if (a.x > b.r - m2) { a.x = b.r - m2; a.px = a.x + (a.x - a.px) * 0.3; }
      if (a.y < b.t + m2) { a.y = b.t + m2; a.py = a.y + (a.y - a.py) * 0.3; }
      if (a.y > b.b - m2) { a.y = b.b - m2; a.py = a.y + (a.y - a.py) * 0.3; }
    }

    // particles
    for (const p of this.parts) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.type === 'emojifly') {
        const k = 1 - p.life / p.max, tx = p.tx.x, ty = p.tx.y;
        p.x += (tx - p.x) * Math.min(1, dt * 7); p.y += (ty - p.y) * Math.min(1, dt * 7) - Math.sin(k * Math.PI) * 4;
        if (p.life <= 0 && !p.hit) {
          p.hit = true;
          if (p.toHole) { this.glow = 1; this.burst('spark', tx, ty, 8); sfx.plop(); }
          else if (p.hits) { this.worm?.kiss(p.level); this.burst('heart', tx, ty, 3 + p.level); sfx.kiss(p.level); }
        }
        continue;
      }
      p.vy = (p.vy || 0) + (p.type === 'heart' ? -20 : p.type === 'drop' ? 300 : p.type === 'z' ? -10 : p.type === 'emojibig' ? 40 : 120) * dt * (p.type === 'emojiout' ? 0.6 : 1);
      p.x += (p.vx || 0) * dt; p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0 || p.delay > 0);

    // sleepy z's
    if (w && w.mode === 'sleep' && w.orbit?.t > 2 && Math.random() < dt * 0.9) {
      const h = w.head();
      this.parts.push({ type: 'z', x: h.x + 8, y: h.y - 10, vx: rand(5, 15), vy: -18, life: 2.2, max: 2.2, size: rand(9, 14) });
    }
    // weather
    this.stepWeather(dt);
    // thought bubble
    if (w && w.mode !== 'sleep') {
      this.bubbleT = (this.bubbleT || 6) - dt;
      if (this.bubbleT < 0) {
        this.bubbleT = 14;
        const need = this.needs.hungry > 0.6 ? 'food' : this.needs.dry > 0.6 ? 'water' : null;
        if (need) w.bubble = { need, life: 4 };
      }
      if (w.bubble) { w.bubble.life -= dt; if (w.bubble.life < 0) w.bubble = null; }
    }
  }

  knot() {
    if (!this.worm || !this.mine) return;
    this.matchT = 0; this.knotCool = 10;
    const cx = (this.myFinger.x + this.theirFinger.x) / 2, cy = (this.myFinger.y + this.theirFinger.y) / 2;
    this.knotUntil = performance.now() + 3200;
    this.worm.mode = 'knot'; this.worm.orbit = { x: cx, y: cy, a: 0, r: this.R * 2.2, dir: 1 }; this.worm.love = 3;
    this.mine.mode = 'knot'; this.mine.orbit = { x: cx, y: cy, a: Math.PI, r: this.R * 2.2, dir: 1 }; this.mine.love = 3;
    for (let i = 0; i < 26; i++) this.parts.push({ type: 'heart', x: cx, y: cy, vx: rand(-160, 160), vy: rand(-200, 40), life: rand(1, 1.8), max: 1.8, size: rand(8, 18), rot: rand(-0.5, 0.5) });
    this.flash = 0.5;
    sfx.knot(); buzz([30, 60, 30, 60, 160]);
    this.hooks.onKnot?.();
  }

  stepWeather(dt) {
    const k = this.weather.kind, b = this.bounds;
    const rate = k === 'rain' ? 70 : k === 'storm' ? 120 : k === 'snow' ? 18 : 0;
    let n = rate * dt; while (n > 0) { if (Math.random() < n) this.drops.push({ x: rand(b.l - 40, b.r), y: b.t - rand(0, 30), life: 1, snow: k === 'snow', land: rand(b.t + 30, b.b) }); n -= 1; }
    for (const d of this.drops) {
      if (d.splash != null) { d.splash += dt; continue; }
      if (d.snow) { d.y += 40 * dt; d.x += Math.sin(this.t * 2 + d.land) * 14 * dt; if (d.y > d.land) d.splash = 0; }
      else { d.y += 620 * dt; d.x += 120 * dt; if (d.y > d.land) d.splash = 0; }
    }
    this.drops = this.drops.filter((d) => d.splash == null || d.splash < (d.snow ? 2.5 : 0.35));
    if (k === 'storm' && Math.random() < dt * 0.08) this.flash = 1;
  }

  render() {
    const x = this.ctx, W = this.W, H = this.H, b = this.bounds;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.save();
    if (this.shake > 0) x.translate(Math.sin(this.t * 80) * this.shake * 10, Math.cos(this.t * 70) * this.shake * 6);
    x.drawImage(this.denim, 0, 0, W, H);
    const night = this.sky?.night || 0;
    if (night > 0) {
      x.fillStyle = '#FFFFFF';
      for (const st of this.stars) {
        const a = night * (0.45 + 0.55 * Math.sin(this.t * st.sp + st.ph) ** 2) * (1 - st.y / (H * 0.85));
        if (a <= 0.02) continue;
        x.globalAlpha = a; x.beginPath(); x.arc(st.x, st.y, st.s, 0, 7); x.fill();
      }
      x.globalAlpha = 1;
    }
    drawHole(x, this.hole.x, this.hole.y, this.holeR, this.t, this.glow);

    for (const f of this.food) { x.save(); x.translate(f.x, f.y); x.scale(f.left, f.left); x.shadowColor = 'rgba(0,0,10,0.4)'; x.shadowBlur = 4; x.shadowOffsetY = 2; drawFood(x, f.kind, 9); x.restore(); }

    const img = (src) => this.image(src);
    for (const it of this.items) {
      x.save();
      if (it.s < 1) { x.translate(it.x, it.y); x.scale(it.s, it.s); x.translate(-it.x, -it.y); }
      drawItem(x, it, this.t, img);
      x.restore();
    }

    if (this.mine) this.mine.draw(x);
    if (this.worm) {
      this.worm.draw(x);
      if (this.worm.bubble) this.drawBubble(x, this.worm);
    }

    // particles
    for (const p of this.parts) {
      if (p.delay > 0) continue;
      const a = clamp(p.life / (p.max * 0.4), 0, 1);
      x.save(); x.globalAlpha = a;
      switch (p.type) {
        case 'heart': drawEmoji(x, '❤️', p.x, p.y, p.size * 1.1, p.rot); break;
        case 'spark': star(x, p.x, p.y, p.size * 0.6, '#FFFFFF'); break;
        case 'drop': x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.ellipse(p.x, p.y, p.size * 0.6, p.size * 1.3, 0, 0, 7); x.fill(); break;
        case 'crumb': x.fillStyle = '#F2B544'; x.fillRect(p.x, p.y, 2.5, 2.5); break;
        case 'z': x.fillStyle = this.sky?.dark ? 'rgba(255,255,255,0.85)' : 'rgba(38,50,77,0.75)'; x.font = `600 ${p.size}px Geist, system-ui, sans-serif`; x.fillText('z', p.x, p.y); break;
        case 'ripple': { const k = 1 - p.life / p.max; x.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; x.lineWidth = 2; x.beginPath(); x.arc(p.x, p.y, 6 + k * 26, 0, 7); x.stroke(); break; }
        case 'emojifly': { const k = 1 - p.life / p.max; drawEmoji(x, p.ch, p.x, p.y, p.size * (p.toHole ? 1 - k * 0.7 : 0.7 + k * 0.4), p.rot); break; }
        case 'emojiout': { const k = 1 - p.life / p.max; x.globalAlpha = Math.min(1, p.life * 2); drawEmoji(x, p.ch, p.x, p.y, p.size * (1 + k * p.grow), p.rot + Math.sin(this.t * 6 + p.size) * 0.15); break; }
        case 'emojibig': { const k = 1 - p.life / p.max; const pop = k < 0.15 ? k / 0.15 : 1; x.globalAlpha = Math.min(1, p.life * 1.5); drawEmoji(x, p.ch, p.x + Math.sin(this.t * 3) * 10, p.y, p.size * (0.4 + 0.75 * pop), p.rot + Math.sin(this.t * 4) * 0.12); break; }
      }
      x.restore();
    }

    // weather layer
    const rainRGB = this.sky?.dark ? '205,222,255' : '60,110,170';
    for (const d of this.drops) {
      if (d.snow) {
        x.fillStyle = `rgba(255,255,255,${d.splash != null ? 0.9 * (1 - d.splash / 2.5) : 0.95})`;
        x.beginPath(); x.arc(d.x, d.y, 2.4, 0, 7); x.fill(); x.strokeStyle = 'rgba(80,130,190,0.3)'; x.lineWidth = 0.8; x.stroke();
      } else if (d.splash != null) {
        const k = d.splash / 0.35; x.strokeStyle = `rgba(${rainRGB},${0.4 * (1 - k)})`; x.lineWidth = 1;
        x.beginPath(); x.ellipse(d.x, d.y, 2 + k * 8, 1 + k * 3, 0, 0, 7); x.stroke();
      } else {
        x.strokeStyle = `rgba(${rainRGB},0.4)`; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(d.x, d.y); x.lineTo(d.x - 4, d.y - 18); x.stroke();
      }
    }
    if (this.weather.kind === 'fog') { x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, 0, W, H); }

    // fingertips
    if (this.theirFinger) this.fingerGlow(x, this.theirFinger.x, this.theirFinger.y, '255,60,130');
    if (this.live && this.myFinger) this.fingerGlow(x, this.myFinger.x, this.myFinger.y, '255,255,255');
    if (this.matchT > 0 && this.myFinger && this.theirFinger) {
      const cx = (this.myFinger.x + this.theirFinger.x) / 2, cy = (this.myFinger.y + this.theirFinger.y) / 2;
      x.strokeStyle = `rgba(255,255,255,${Math.min(1, this.matchT)})`; x.lineWidth = 3;
      x.beginPath(); x.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + Math.min(1, this.matchT / 1.1) * Math.PI * 2); x.stroke();
    }
    if (this.flash > 0) { x.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`; x.fillRect(0, 0, W, H); }
    x.restore();
  }

  fingerGlow(x, fx, fy, rgb) {
    const col = rgb === '255,255,255' ? '#FFFFFF' : '#F0588A';
    const r = 34 + Math.sin(this.t * 5) * 3;
    dab(x, col, fx, fy, r * 1.4, 'soft', 0.55);
    dab(x, col, fx, fy, r * 0.45, 'body', 0.85);
  }

  drawBubble(x, w) {
    const h = w.head(), bx = h.x + w.R * 1.6, by = h.y - w.R * 2.6;
    const a = Math.min(1, w.bubble.life, 4 - w.bubble.life);
    x.save(); x.globalAlpha = clamp(a * 2, 0, 1);
    x.fillStyle = '#FFFFFF';
    x.beginPath(); x.arc(h.x + w.R * 0.8, h.y - w.R * 1.3, 3, 0, 7); x.fill();
    x.beginPath(); x.arc(h.x + w.R * 1.15, h.y - w.R * 1.85, 4.5, 0, 7); x.fill();
    x.beginPath(); x.ellipse(bx, by, 19, 15, 0, 0, 7); x.fill();
    x.strokeStyle = '#26324D'; x.lineWidth = 1.3; x.stroke();
    x.translate(bx, by);
    if (w.bubble.need === 'food') drawFood(x, pick(['medialuna']), 8);
    else { x.fillStyle = '#3BA4FF'; x.beginPath(); x.moveTo(0, -9); x.bezierCurveTo(7, 0, 6, 8, 0, 8); x.bezierCurveTo(-6, 8, -7, 0, 0, -9); x.fill(); }
    x.restore();
  }
}
