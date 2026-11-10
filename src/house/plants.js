// Procedural potted plants and trees. Each plant is its own Group (one "piece" for the build game),
// with its leaves in one InstancedMesh so even a leafy tree is a couple of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { leafAtlas, terracotta, soil, rnd, rr } from './tex.js';

export const wind = { value: 0 };
let atlas, leafMat, leafDepth, geos, mats;

function leafGeo(cell) {
  const g = new THREE.PlaneGeometry(1, 1, 2, 5);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = p.getX(i);
    p.setZ(i, 0.22 * y * y - 0.12 * Math.abs(x) * y); // arch + slight fold along the midrib
  }
  const col = cell % 2, row = Math.floor(cell / 2);
  const u0 = col * 0.5, v0 = 1 - (row + 1) * 0.5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  g.computeVertexNormals();
  return g;
}

function init() {
  if (leafMat) return;
  atlas = leafAtlas();
  leafMat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, metalness: 0 });
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float ph = ip.x * 1.7 + ip.z * 1.3 + ip.y * 0.6;
        float k = position.y * position.y;
        transformed.x += sin(uWind * 1.6 + ph) * 0.05 * k;
        transformed.z += cos(uWind * 1.1 + ph * 1.3) * 0.035 * k;
      #endif`);
  };
  leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.45, side: THREE.DoubleSide });
  geos = [0, 1, 2, 3].map(leafGeo);
  const soilT = soil(); soilT.repeat.set(0.6, 0.6);
  mats = {
    bark: new THREE.MeshStandardMaterial({ color: '#6b5a4a', roughness: 0.95 }),
    barkLight: new THREE.MeshStandardMaterial({ color: '#9a8d7c', roughness: 0.9 }),
    stem: new THREE.MeshStandardMaterial({ color: '#5d7046', roughness: 0.8 }),
    terracotta: new THREE.MeshStandardMaterial({ map: terracotta(), roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#8d8880', roughness: 0.92 }),
    white: new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6 }),
    soil: new THREE.MeshStandardMaterial({ map: soilT, roughness: 1 }),
  };
}

const GREENS = {
  deep: ['#2f5a2a', '#3a6a30', '#456f35', '#2c4f2a'],
  fresh: ['#5d8c3a', '#6e9a43', '#7aa64a', '#557f35'],
  olive: ['#6f7f55', '#7b8a60', '#88956b', '#667652'],
  yellow: ['#8fa64a', '#9fb257', '#a7b964', '#7f9a3e'],
  banana: ['#4f7e34', '#5c8a3b', '#6a9845', '#4a7330'],
  snake: ['#3e5e33', '#4d6b3b', '#6a7f46', '#2f4a2a'],
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

class Leaves {
  constructor() { this.list = []; }
  add(kind, pos, yaw, pitch, roll, size, color) { this.list.push({ kind, pos: pos.clone(), yaw, pitch, roll, size, color }); }
  build(group) {
    for (let kind = 0; kind < 4; kind++) {
      const L = this.list.filter((l) => l.kind === kind);
      if (!L.length) continue;
      const im = new THREE.InstancedMesh(geos[kind], leafMat, L.length);
      L.forEach((l, i) => {
        _e.set(l.pitch, l.yaw, l.roll, 'YXZ'); _q.setFromEuler(_e);
        _s.set(l.size * (kind === 1 ? 0.45 : kind === 3 ? 0.9 : 0.75), l.size, l.size);
        _m.compose(l.pos, _q, _s); im.setMatrixAt(i, _m);
        im.setColorAt(i, _c.set(l.color));
      });
      im.castShadow = true; im.receiveShadow = true;
      im.customDepthMaterial = leafDepth;
      im.computeBoundingSphere();
      group.add(im);
    }
  }
}

function pick(a) { return a[Math.floor(rnd() * a.length)]; }

// A tapered pot with soil. Returns its rim height.
function pot(group, kind, r, h) {
  init();
  const mat = mats[kind] || mats.terracotta;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.78, h, 24, 1, true), mat);
  body.position.y = h / 2; body.castShadow = body.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, kind === 'concrete' ? 0.025 : 0.012, 6, 24), mat);
  rim.rotation.x = Math.PI / 2; rim.position.y = h;
  const base = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 20), mat);
  base.rotation.x = Math.PI / 2; base.position.y = 0.002;
  const earth = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 20), mats.soil);
  earth.rotation.x = -Math.PI / 2; earth.position.y = h - 0.03; earth.receiveShadow = true;
  const pm = new THREE.Mesh(mergeGeometries([body, rim, base].map((m) => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); g.deleteAttribute('uv'); return g; }), false), mat);
  pm.castShadow = pm.receiveShadow = true;
  group.add(pm, earth);
  return h - 0.03;
}

function tube(points, r0, r1, mat, seg = 12) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, seg, 1, 6, false);
  // taper
  const p = g.attributes.position, n = g.attributes.normal;
  const rings = seg + 1, per = 7;
  for (let i = 0; i < rings; i++) {
    const t = i / seg, r = r0 + (r1 - r0) * t;
    const c = curve.getPointAt(t);
    for (let j = 0; j < per; j++) {
      const k = i * per + j;
      p.setXYZ(k, c.x + n.getX(k) * r, c.y + n.getY(k) * r, c.z + n.getZ(k) * r);
    }
  }
  return [{ geo: g, mat }, curve];
}

// group.add() stand-in used by recipes: stems are collected and merged per material
class Bag {
  constructor(group) { this.group = group; this.byMat = new Map(); }
  add(...items) {
    for (const it of items) {
      if (it.isObject3D) { this.group.add(it); continue; }
      if (!this.byMat.has(it.mat)) this.byMat.set(it.mat, []);
      this.byMat.get(it.mat).push(it.geo.index ? it.geo.toNonIndexed() : it.geo);
    }
  }
  flush() {
    for (const [mat, geos] of this.byMat) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
  }
}

// ---- plant recipes ----------------------------------------------------------------------------
// All take (group, base y, scale) and add leaves to a Leaves collector.

function tree(group, L, y0, s, opts = {}) {
  const H = (opts.h || rr(1.8, 2.8)) * s;
  const lean = rr(-0.25, 0.25), lean2 = rr(-0.25, 0.25);
  const pts = [new THREE.Vector3(0, y0, 0), new THREE.Vector3(lean * 0.2, y0 + H * 0.35, lean2 * 0.2), new THREE.Vector3(lean * 0.5, y0 + H * 0.7, lean2 * 0.4), new THREE.Vector3(lean * 0.6, y0 + H, lean2 * 0.6)];
  const [trunk, curve] = tube(pts, 0.03 * s + 0.01, 0.008, opts.light ? mats.barkLight : mats.bark, 14);
  group.add(trunk);
  const greens = GREENS[opts.green || pick(['fresh', 'olive', 'deep'])];
  const kind = opts.leaf ?? (rnd() < 0.5 ? 3 : 0);
  const branches = Math.round(rr(5, 9));
  for (let b = 0; b < branches; b++) {
    const t = rr(0.4, 0.95);
    const o = curve.getPointAt(t);
    const a = rnd() * Math.PI * 2, len = rr(0.35, 0.8) * s * (1.1 - t * 0.4);
    const end = o.clone().add(new THREE.Vector3(Math.cos(a) * len, rr(0.15, 0.45) * len, Math.sin(a) * len));
    const mid = o.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.08, 0));
    const [br] = tube([o, mid, end], 0.012, 0.004, mats.bark, 6);
    group.add(br);
    const n = Math.round(rr(22, 40) * (opts.dense || 1));
    for (let i = 0; i < n; i++) {
      const q = o.clone().lerp(end, rr(0.25, 1.05)).add(new THREE.Vector3(rr(-0.22, 0.22) * s, rr(-0.12, 0.2) * s, rr(-0.22, 0.22) * s));
      L.add(kind, q, rnd() * 6.28, rr(0.2, 1.3), rr(-0.4, 0.4), rr(0.13, 0.22) * s * (kind === 3 ? 1.3 : 1), pick(greens));
    }
  }
  // crown filler
  const top = curve.getPointAt(1);
  for (let i = 0; i < 40 * (opts.dense || 1); i++) {
    const q = top.clone().add(new THREE.Vector3(rr(-0.4, 0.4) * s, rr(-0.35, 0.15) * s, rr(-0.4, 0.4) * s));
    L.add(kind, q, rnd() * 6.28, rr(0.2, 1.2), rr(-0.4, 0.4), rr(0.13, 0.2) * s, pick(greens));
  }
}

function shrub(group, L, y0, s, opts = {}) {
  const greens = GREENS[opts.green || pick(['deep', 'fresh', 'yellow'])];
  const R = rr(0.22, 0.38) * s, H = rr(0.35, 0.7) * s;
  const stems = Math.round(rr(4, 7));
  for (let k = 0; k < stems; k++) {
    const a = rnd() * 6.28, r = rr(0.3, 1) * R;
    const end = new THREE.Vector3(Math.cos(a) * r, y0 + H * rr(0.6, 1), Math.sin(a) * r);
    const [st] = tube([new THREE.Vector3(0, y0, 0), new THREE.Vector3(end.x * 0.4, y0 + H * 0.4, end.z * 0.4), end], 0.008, 0.004, mats.stem, 5);
    group.add(st);
  }
  const n = Math.round(rr(70, 130) * (opts.dense || 1));
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * R, h = y0 + H * (0.25 + 0.75 * rnd());
    L.add(0, new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r), a + rr(-0.6, 0.6), rr(0.5, 1.4), rr(-0.3, 0.3), rr(0.12, 0.2) * s, pick(greens));
  }
}

function banana(group, L, y0, s) {
  const greens = GREENS.banana;
  const n = Math.round(rr(6, 10));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rr(-0.3, 0.3);
    const len = rr(0.4, 0.9) * s;
    const base = new THREE.Vector3(0, y0, 0), tip = new THREE.Vector3(Math.cos(a) * len * 0.35, y0 + len, Math.sin(a) * len * 0.35);
    const [st] = tube([base, base.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.05, 0)), tip], 0.012, 0.007, mats.stem, 5);
    group.add(st);
    L.add(2, tip, -a + Math.PI / 2, rr(0.5, 1.1), rr(-0.25, 0.25), rr(0.55, 0.95) * s, pick(greens));
  }
}

function grass(group, L, y0, s, opts = {}) {
  const greens = GREENS[opts.green || pick(['yellow', 'fresh', 'olive'])];
  const n = Math.round(rr(40, 80));
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, r = rr(0, 0.1) * s;
    L.add(1, new THREE.Vector3(Math.cos(a) * r, y0, Math.sin(a) * r), a, rr(0.05, 0.6), rr(-0.2, 0.2), rr(0.35, 0.75) * s, pick(greens));
  }
}

function snake(group, L, y0, s) {
  const n = Math.round(rr(8, 14));
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, r = rr(0, 0.07) * s;
    L.add(1, new THREE.Vector3(Math.cos(a) * r, y0, Math.sin(a) * r), a, rr(0.02, 0.18), rr(-0.08, 0.08), rr(0.5, 0.95) * s, pick(GREENS.snake));
  }
}

function palm(group, L, y0, s) {
  const greens = GREENS.fresh;
  const fronds = Math.round(rr(6, 9));
  const H = rr(0.5, 1.3) * s;
  const [trunk] = tube([new THREE.Vector3(0, y0, 0), new THREE.Vector3(0.02, y0 + H * 0.5, 0), new THREE.Vector3(0, y0 + H, 0.02)], 0.03, 0.02, mats.barkLight, 6);
  group.add(trunk);
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * 6.28 + rr(-0.2, 0.2), len = rr(0.6, 1.0) * s;
    const o = new THREE.Vector3(0, y0 + H, 0);
    const end = new THREE.Vector3(Math.cos(a) * len, y0 + H + rr(-0.1, 0.2) * s, Math.sin(a) * len);
    const mid = o.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.18 * s, 0));
    const c = new THREE.QuadraticBezierCurve3(o, mid, end);
    const [st] = tube([o, mid, end], 0.008, 0.003, mats.stem, 6); group.add(st);
    const k = 14;
    for (let i = 1; i <= k; i++) {
      const t = i / (k + 1), p = c.getPoint(t);
      for (const side of [-1, 1]) L.add(1, p, -a + side * 1.1, rr(1.0, 1.5), side * 0.3, rr(0.22, 0.32) * s * (1 - t * 0.5), pick(greens));
    }
  }
}

const RECIPES = { tree, shrub, banana, grass, snake, palm };

// Make one plant. type: tree | shrub | banana | grass | snake | palm. pot: terracotta | concrete | white | black | null (in soil)
export function makePlant(type, { pot: potKind = 'terracotta', potR, potH, scale = 1, seed: sd, ...opts } = {}) {
  init();
  const g = new THREE.Group();
  g.userData.kind = 'plant';
  let y0 = 0;
  if (potKind) {
    const r = potR || (type === 'tree' ? rr(0.2, 0.28) : type === 'banana' ? rr(0.2, 0.26) : rr(0.12, 0.2));
    const h = potH || r * rr(1.3, 1.8);
    y0 = pot(g, potKind, r, h);
  }
  const L = new Leaves();
  const bag = new Bag(g);
  RECIPES[type](bag, L, y0, scale, opts);
  bag.flush();
  L.build(g);
  return g;
}

export const plantMats = () => { init(); return mats; };
