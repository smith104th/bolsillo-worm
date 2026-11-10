// Garden and House (Ryue Nishizawa, Tokyo, 2011), modelled from the published plans, elevations
// and MoMA's section through the spiral stair.
//
// Units are meters. World axes: +x = plan right (south), +y = up, +z = plan bottom = the street (west).
// Slabs 3.8 x 6.6 m, 250 mm thick, 2.8 m floor to floor (14 risers of 200), levels 1F 2F 3F 4F RF.
// Structure: three reinforced concrete wall-columns at the same spots on every floor + one thin steel post.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as T from './tex.js';
import { makePlant, plantMats } from './plants.js';

export const SW = 3.8, SD = 6.6, FH = 2.8, ST = 0.25, LEVELS = 5;
const X = (xp) => xp - SW / 2, Z = (zp) => zp - SD / 2;
const P = (xp, zp) => [X(xp), Z(zp)];
const FL = (i) => i * FH;
export const spiralA0 = (L) => Math.PI * (-0.5 + L * 0.07);

// ---------------------------------------------------------------------------------------------
let M;
function mats() {
  if (M) return M;
  const fl = T.floor(); fl.repeat.set(0.32, 0.32);
  const ce = T.ceiling(); ce.repeat.set(0.28, 0.28);
  const co = T.concrete(); co.repeat.set(0.45, 0.45);
  const ro = T.roof(); ro.repeat.set(0.4, 0.4);
  const so = T.soil(); so.repeat.set(0.7, 0.7);
  M = {
    floor: new THREE.MeshStandardMaterial({ map: fl, color: '#ffffff', roughness: 0.62 }),
    ceiling: new THREE.MeshStandardMaterial({ map: ce, color: '#f4f2ee', roughness: 0.9 }),
    edge: new THREE.MeshStandardMaterial({ map: co, color: '#eceae5', roughness: 0.85 }),
    column: new THREE.MeshStandardMaterial({ map: co, color: '#e2dfd9', roughness: 0.78 }),
    roof: new THREE.MeshStandardMaterial({ map: ro, roughness: 0.75 }),
    soil: new THREE.MeshStandardMaterial({ map: so, roughness: 1 }),
    steel: new THREE.MeshStandardMaterial({ color: '#f3f3f0', roughness: 0.35, metalness: 0.15 }),
    steelDark: new THREE.MeshStandardMaterial({ color: '#cfd1d0', roughness: 0.4, metalness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#dcebea', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.09, envMapIntensity: 0.9, side: THREE.DoubleSide, depthWrite: false, reflectivity: 0.35 }),
    rail: new THREE.MeshPhysicalMaterial({ color: '#d6ecea', roughness: 0.02, transparent: true, opacity: 0.045, envMapIntensity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    curtain: new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.95, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, emissive: '#ffd9a6', emissiveIntensity: 0 }),
    wood: new THREE.MeshStandardMaterial({ color: '#a8603f', roughness: 0.55 }),
    woodLight: new THREE.MeshStandardMaterial({ color: '#c99b6d', roughness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.45 }),
    porcelain: new THREE.MeshStandardMaterial({ color: '#fbfbfa', roughness: 0.18 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#e7e1d6', roughness: 0.95 }),
    linen: new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.95 }),
    throwRed: new THREE.MeshStandardMaterial({ color: '#b5583a', roughness: 0.95 }),
    rug: new THREE.MeshStandardMaterial({ color: '#cfc3ae', roughness: 1 }),
    black: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.5 }),
    redChair: new THREE.MeshStandardMaterial({ color: '#8e2c22', roughness: 0.5 }),
    stainless: new THREE.MeshStandardMaterial({ color: '#c9cbcc', roughness: 0.3, metalness: 0.8 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, emissive: '#ffcf96', emissiveIntensity: 0 }),
    unit: new THREE.MeshStandardMaterial({ color: '#d9dad6', roughness: 0.6 }),
    doorDark: new THREE.MeshStandardMaterial({ color: '#2c3133', roughness: 0.2, metalness: 0.2 }),
    tinted: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  };
  return M;
}

// --- small geometry helpers --------------------------------------------------------------------
const shadowed = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
function mesh(geo, mat, cast = true) { return shadowed(new THREE.Mesh(geo, mat), cast); }
function box(w, h, d, x, y, z, mat, cast = true) { const m = mesh(new THREE.BoxGeometry(w, h, d), mat, cast); m.position.set(x, y, z); return m; }
// box from plan corners (meters on the plan) and a vertical span
function pbox(xp0, zp0, xp1, zp1, y0, y1, mat, cast = true) {
  return box(Math.abs(xp1 - xp0), y1 - y0, Math.abs(zp1 - zp0), X((xp0 + xp1) / 2), (y0 + y1) / 2, Z((zp0 + zp1) / 2), mat, cast);
}
function cyl(r0, r1, h, x, y, z, mat, seg = 20) { const m = mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.set(x, y + h / 2, z); return m; }
// a thin box running from a to b ([x,z] world) at height y..y+h, thickness w
function segGeo(a, b, y, h, w) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(L, h, w);
  g.rotateY(-Math.atan2(dz, dx));
  g.translate((a[0] + b[0]) / 2, y + h / 2, (a[1] + b[1]) / 2);
  return g;
}
function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const merge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);

// rounded rectangle in world xz from plan coords; r per corner [backLeft, backRight, frontRight, frontLeft]
function rrect(xp0, zp0, xp1, zp1, r = [0, 0, 0, 0], seg = 10) {
  const [x0, z0, x1, z1] = [X(xp0), Z(zp0), X(xp1), Z(zp1)];
  const pts = [];
  const corner = (cx, cz, rad, a0) => {
    if (!rad) { pts.push([cx, cz]); return; }
    const ox = cx + (a0 === 0 || a0 === 3 ? 0 : 0);
    for (let i = 0; i <= seg; i++) {
      const a = (a0 + i / seg) * Math.PI / 2;
      pts.push([ox + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
    }
  };
  // walk: back-left -> back-right -> front-right -> front-left (z grows to the street)
  r[0] ? corner(x0 + r[0], z0 + r[0], r[0], 2) : pts.push([x0, z0]);
  r[1] ? corner(x1 - r[1], z0 + r[1], r[1], 3) : pts.push([x1, z0]);
  r[2] ? corner(x1 - r[2], z1 - r[2], r[2], 0) : pts.push([x1, z1]);
  r[3] ? corner(x0 + r[3], z1 - r[3], r[3], 1) : pts.push([x0, z1]);
  return pts;
}
function circle(xp, zp, r, n = 40) { const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([X(xp) + Math.cos(a) * r, Z(zp) + Math.sin(a) * r]); } return pts; }
// D-shaped opening around the spiral stair: half circle at the back, straight sides toward the street
function dshape(xp, zp, r, ext) {
  const cx = X(xp), cz = Z(zp), pts = [[cx + r, cz + ext]];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI; pts.push([cx + Math.cos(a) * r, cz - Math.sin(a) * r]); }
  pts.push([cx - r, cz + ext]);
  return pts;
}
// resample a polyline/curve to evenly spaced points
function resample(pts, step, closed = false) {
  const P3 = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const c = new THREE.CatmullRomCurve3(P3, closed, 'centripetal', 0.5);
  const n = Math.max(2, Math.round(c.getLength() / step));
  return c.getSpacedPoints(n).map((v) => [v.x, v.z]);
}
const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

// --- architecture pieces -----------------------------------------------------------------------
const toShape = (pts, flip) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, flip ? z : -z)));
const toPath = (pts, flip) => new THREE.Path(pts.map(([x, z]) => new THREE.Vector2(x, flip ? z : -z)));

function slab(level, holes = [], { roof = false, ground = false } = {}) {
  const m = mats();
  const g = new THREE.Group();
  const outline = rrect(0, 0, SW, SD);
  const y = FL(level);
  const t = ground ? 0.3 : ST;
  // body (edges)
  const s = toShape(outline); holes.forEach((h) => s.holes.push(toPath(h)));
  const body = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 24 });
  body.rotateX(-Math.PI / 2); body.translate(0, y - t, 0);
  g.add(mesh(body, m.edge));
  // finished top
  const top = new THREE.ShapeGeometry(s, 24); top.rotateX(-Math.PI / 2); top.translate(0, y + 0.002, 0);
  g.add(mesh(top, roof ? m.roof : m.floor, false));
  // exposed soffit
  if (!ground) {
    const s2 = toShape(outline, true); holes.forEach((h) => s2.holes.push(toPath(h, true)));
    const bot = new THREE.ShapeGeometry(s2, 24); bot.rotateX(Math.PI / 2); bot.translate(0, y - t - 0.002, 0);
    g.add(mesh(bot, m.ceiling, false));
  }
  return g;
}

// the three wall-columns + the thin steel post, between level i and i+1
const COLUMNS = [[1.04, 0.0, 2.04, 0.85], [2.9, 2.28, 3.8, 3.14], [0.88, 4.94, 1.39, 5.6]];
const POST = [0.17, 4.92];
function columns(level) {
  const m = mats();
  const g = new THREE.Group();
  const y0 = FL(level), y1 = FL(level + 1) - ST;
  for (const [a, b, c, d] of COLUMNS) g.add(pbox(a, b, c, d, y0, y1, m.column));
  g.add(cyl(0.032, 0.032, y1 - y0, X(POST[0]), y0, Z(POST[1]), m.steel, 12));
  return g;
}

// sliding glass: panes along a path with thin white frames and mullions about every 1.1 m
function glazing(pts, level, { closed = false, h = FH - ST, mull = 1.1, curved = false } = {}) {
  const m = mats();
  const y0 = FL(level), path = closed ? [...pts, pts[0]] : pts;
  const glass = [], frame = [];
  const post = (x, z) => { const mg = new THREE.BoxGeometry(0.035, h, 0.035); mg.translate(x, y0 + h / 2, z); frame.push(mg); };
  let run = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-4) continue;
    glass.push(segGeo(a, b, y0 + 0.03, h - 0.06, 0.008));
    frame.push(segGeo(a, b, y0, 0.035, 0.05), segGeo(a, b, y0 + h - 0.04, 0.04, 0.05));
    if (!curved) {
      // a post at each corner and sliding-pane meeting rails about every 1.1 m along the run
      post(a[0], a[1]);
      const n = Math.round(L / mull);
      for (let k = 1; k < n; k++) post(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n);
    } else {
      if (i === 0 || run > mull) { run = 0; post(a[0], a[1]); }
      run += L;
    }
  }
  const last = path[path.length - 1];
  post(last[0], last[1]);
  const g = new THREE.Group();
  const gm = new THREE.Mesh(merge(glass), m.glass); gm.renderOrder = 2;
  g.add(gm, mesh(merge(frame), m.steel));
  g.userData.glass = gm;
  return g;
}

// sheer curtain hung from a track: folds, partly gathered
function curtain(pts, level, { from = 0, to = 1, gathered = 0.25, h = FH - ST - 0.04 } = {}) {
  const m = mats();
  const fine = resample(pts, 0.02);
  const L = polyLen(fine), y0 = FL(level) + 0.01;
  const pos = [], idx = [];
  let s = 0;
  const keep = [];
  for (let i = 0; i < fine.length; i++) {
    if (i) s += Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]);
    const u = s / L;
    if (u >= from && u <= to) keep.push([fine[i], u, i]);
  }
  keep.forEach(([p, u, i], k) => {
    const q = fine[Math.min(i + 1, fine.length - 1)], o = fine[Math.max(i - 1, 0)];
    let tx = q[0] - o[0], tz = q[1] - o[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    const loc = (u - from) / (to - from || 1);
    const amp = loc < gathered ? 0.055 : 0.028;
    const per = loc < gathered ? 0.06 : 0.16;
    const f = Math.sin((s => s)(k * 0.02) * Math.PI * 2 / per) * amp;
    for (const yy of [0, 1]) {
      const sway = yy ? 0 : f * 0.4;
      pos.push(p[0] + nx * (f + sway), y0 + yy * h, p[1] + nz * (f + sway));
    }
    if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const c = new THREE.Mesh(g, m.curtain); c.renderOrder = 3; c.castShadow = true;
  // ceiling track
  const tr = [];
  for (let i = 0; i < fine.length - 1; i += 4) tr.push(segGeo(fine[i], fine[Math.min(i + 4, fine.length - 1)], FL(level) + FH - ST - 0.03, 0.025, 0.03));
  const grp = new THREE.Group();
  grp.add(c, mesh(merge(tr), m.steel, false));
  grp.userData.curtain = c;
  return grp;
}

// glass balustrade along open slab edges
function balustrade(pts, level, h = 1.1) {
  const m = mats();
  const y0 = FL(level), gl = [], fr = [];
  // frameless: glass clamped into a slot in the slab edge, only a slim shoe shows
  for (let i = 0; i < pts.length - 1; i++) {
    gl.push(segGeo(pts[i], pts[i + 1], y0, h, 0.012));
    fr.push(segGeo(pts[i], pts[i + 1], y0, 0.04, 0.03));
  }
  const g = new THREE.Group();
  const gm = new THREE.Mesh(merge(gl), m.rail); gm.renderOrder = 2;
  g.add(gm, mesh(merge(fr), m.steelDark, false));
  return g;
}

// white steel spiral: 14 risers of 200 over 2.8 m, helical outer stringer and handrail
function spiral(xp, zp, level, a0 = Math.PI * 0.5) {
  const m = mats();
  const cx = X(xp), cz = Z(zp), y0 = FL(level);
  const R = 0.7, n = 14, sweep = Math.PI * 2 * 0.93, da = sweep / n;
  const treads = [];
  for (let i = 0; i < n - 1; i++) {
    const a = a0 + i * da;
    const sh = new THREE.Shape();
    const ri = 0.07, w = da * 1.12;
    sh.moveTo(Math.cos(a) * ri, Math.sin(a) * ri);
    sh.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    sh.absarc(0, 0, R, a, a + w, false);
    sh.lineTo(Math.cos(a + w) * ri, Math.sin(a + w) * ri);
    const tg = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: false, curveSegments: 6 });
    tg.rotateX(-Math.PI / 2); // shape xy -> world x,-z ; extrude +y
    tg.translate(cx, y0 + (i + 1) * 0.2 - 0.014, cz);
    treads.push(tg);
  }
  // outer stringer ribbon + handrail
  const pos = [], idx = [], rail = [];
  const steps = 90;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, a = a0 - da * 0.2 + (sweep + da * 0.3) * t;
    const y = y0 + ((a - a0) / da) * 0.2 + 0.2;
    const x = cx + Math.cos(a) * (R + 0.01), z = cz - Math.sin(a) * (R + 0.01);
    pos.push(x, y - 0.3, z, x, y + 0.03, z);
    if (k) { const b = (k - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    rail.push(new THREE.Vector3(cx + Math.cos(a) * (R + 0.02), y + 0.88, cz - Math.sin(a) * (R + 0.02)));
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); sg.computeVertexNormals();
  const stringer = new THREE.Mesh(sg, m.steel.clone()); stringer.material.side = THREE.DoubleSide; shadowed(stringer);
  const hr = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 120, 0.017, 6), m.steel);
  // balusters every other tread
  const bal = [];
  for (let i = 0; i < n - 1; i += 2) {
    const a = a0 + i * da + da * 0.5;
    const b = new THREE.CylinderGeometry(0.007, 0.007, 0.86, 5);
    b.translate(cx + Math.cos(a) * (R + 0.015), y0 + (i + 1) * 0.2 + 0.43, cz - Math.sin(a) * (R + 0.015));
    bal.push(b);
  }
  const g = new THREE.Group();
  g.add(mesh(merge(treads), m.steel), stringer, hr, mesh(merge(bal), m.steel));
  return g;
}

// steep ship's stair from 4F to the roof: plate stringers, open plate treads
function straightStair() {
  const m = mats();
  const g = new THREE.Group();
  const x0 = X(3.18), x1 = X(1.98), z0 = Z(0.66), z1 = Z(1.24), y0 = FL(3), n = 14;
  const parts = [];
  for (let i = 0; i < n - 1; i++) {
    const t = (i + 1) / n, x = x0 + (x1 - x0) * t, y = y0 + (i + 1) * 0.2;
    const tg = new THREE.BoxGeometry(0.16, 0.012, z1 - z0 - 0.04); tg.translate(x, y - 0.006, (z0 + z1) / 2); parts.push(tg);
  }
  for (const z of [z0, z1]) {
    const sh = new THREE.Shape();
    const L = Math.hypot(x0 - x1, FH), ang = Math.atan2(FH, x0 - x1);
    sh.moveTo(0, -0.12); sh.lineTo(L, -0.12); sh.lineTo(L, 0.1); sh.lineTo(0, 0.1);
    const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: false });
    sg.rotateZ(ang); sg.rotateY(Math.PI); sg.translate(x0, y0, z + (z === z0 ? 0.01 : 0));
    parts.push(sg);
  }
  g.add(mesh(merge(parts), m.steel));
  return g;
}

// --- furniture ---------------------------------------------------------------------------------
function table(xp, zp, w, d, level, mat, { round = false, h = 0.72 } = {}) {
  const m = mats(), y = FL(level), g = new THREE.Group(), x = X(xp), z = Z(zp);
  if (round) g.add(cyl(w / 2, w / 2, 0.03, x, y + h - 0.03, z, mat, 32), cyl(0.03, 0.03, h - 0.03, x, y, z, m.steel, 10), cyl(0.22, 0.24, 0.02, x, y, z, m.steel, 24));
  else {
    g.add(box(w, 0.03, d, x, y + h - 0.015, z, mat));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.025, h - 0.03, 0.025, x + sx * (w / 2 - 0.05), y + (h - 0.03) / 2, z + sz * (d / 2 - 0.05), m.steel));
  }
  return g;
}
function chair(xp, zp, level, yaw = 0, mat) {
  const m = mats(), y = FL(level), g = new THREE.Group();
  const mm = mat || m.black;
  g.add(box(0.4, 0.02, 0.4, 0, 0.45, 0, mm), box(0.4, 0.34, 0.02, 0, 0.64, -0.19, mm));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.016, 0.45, 0.016, sx * 0.18, 0.225, sz * 0.18, mm));
  g.position.set(X(xp), y, Z(zp)); g.rotation.y = yaw;
  return g;
}
function bed(xp0, zp0, xp1, zp1, level, alongX = true) {
  const m = mats(), y = FL(level), g = new THREE.Group();
  g.add(pbox(xp0, zp0, xp1, zp1, y, y + 0.22, m.woodLight), pbox(xp0 + 0.02, zp0 + 0.02, xp1 - 0.02, zp1 - 0.02, y + 0.22, y + 0.4, m.linen));
  // throw over the foot half, pillows at the head
  if (alongX) {
    const mid = (xp0 + xp1) / 2;
    g.add(pbox(mid, zp0 - 0.01, xp1 + 0.01, zp1 + 0.01, y + 0.3, y + 0.42, m.throwRed));
    g.add(pbox(xp0 + 0.08, zp0 + 0.1, xp0 + 0.45, zp1 - 0.1, y + 0.4, y + 0.5, m.linen));
  } else {
    const mid = (zp0 + zp1) / 2;
    g.add(pbox(xp0 - 0.01, mid, xp1 + 0.01, zp1 + 0.01, y + 0.3, y + 0.42, m.throwRed));
    g.add(pbox(xp0 + 0.1, zp0 + 0.08, xp1 - 0.1, zp0 + 0.42, y + 0.4, y + 0.5, m.linen));
  }
  return g;
}
const GARMENTS = ['#2f3b4c', '#e8e2d6', '#9aa58a', '#c98f6a', '#e3c7c3', '#55606b', '#f1f0ec', '#7a6a58', '#b9c7cf'];
function clothesRail(xp0, zp0, xp1, zp1, level) {
  const m = mats(), y = FL(level), g = new THREE.Group();
  const a = P(xp0, zp0), b = P(xp1, zp1);
  g.add(mesh(segGeo(a, b, y + 1.62, 0.02, 0.02), m.steel));
  for (const p of [a, b]) g.add(cyl(0.012, 0.012, 1.62, p[0], y, p[1], m.steel, 6));
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / 0.11);
  const garments = [];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const hgt = T.rr(0.6, 1.05);
    const gg = new THREE.BoxGeometry(0.04, hgt, 0.42);
    gg.rotateY(-ang); gg.translate(x, y + 1.6 - hgt / 2, z);
    garments.push(tint(gg, GARMENTS[i % GARMENTS.length]));
  }
  g.add(mesh(merge(garments), mats().tinted));
  return g;
}
function lamp(xp, zp, level) {
  const m = mats(), y = FL(level + 1) - ST;
  return cyl(0.07, 0.07, 0.025, X(xp), y - 0.025, Z(zp), m.lamp, 20);
}

// --- the model ---------------------------------------------------------------------------------
// pieces: [{ obj, level, kind, name }], in build order (structure → envelope → rooms → gardens)
export function buildHouse() {
  const m = mats();
  const root = new THREE.Group();
  const pieces = [];
  const add = (obj, level, kind, name) => { obj.userData.level = level; obj.userData.kind = kind; obj.name = name; root.add(obj); pieces.push({ obj, level, kind, name }); return obj; };
  const lamps = [];

  const SPIRAL = [1.1, 3.45];
  const dHole = dshape(SPIRAL[0], SPIRAL[1], 0.8, 0.62);
  const roofStair = rrect(1.95, 0.66, 3.0, 1.24);
  const skylight = rrect(0.32, 2.16, 1.92, 3.78);
  const roofHole = circle(2.68, 5.66, 0.72);

  // ---- structure, floor by floor
  add(slab(0, [], { ground: true }), 0, 'slab', 'Ground slab');
  for (let L = 0; L < 4; L++) {
    add(columns(L), L, 'columns', `Columns ${L + 1}F`);
    if (L < 3) add(spiral(SPIRAL[0], SPIRAL[1], L, spiralA0(L)), L, 'stair', `Spiral stair ${L + 1}F`);
    else add(straightStair(), 3, 'stair', 'Stair to the roof');
    add(slab(L + 1, L < 3 ? [dHole] : [roofStair, skylight, roofHole], { roof: L === 3 }), L + 1, 'slab', L < 3 ? `${L + 2}F slab` : 'Roof slab');
  }

  // ---- envelope
  // 1F: glass all round, set in from the slab edge; the front strip is a covered step to the yard
  add(glazing(rrect(0.05, 0.02, 3.74, 5.8), 0, { closed: true }), 0, 'glass', 'Glass 1F');
  // 2F: bedroom box around the stair, meeting room in curved glass at the front
  add(glazing(rrect(0.26, 0.88, 2.36, 4.62), 1, { closed: true }), 1, 'glass', 'Glass 2F bedroom');
  add(glazing(resample(rrect(0.68, 4.66, 3.68, 6.36, [0.62, 0.62, 0.62, 0.62]), 0.12, true), 1, { closed: true, curved: true }), 1, 'glass', 'Glass 2F meeting room');
  // 3F: bath at the back, then a big room with a curved front-left corner and a garden inside it
  add(glazing(rrect(0.05, 0.02, 3.74, 1.5), 2, { closed: true }), 2, 'glass', 'Glass 3F bath');
  add(glazing(resample(rrect(0.08, 1.5, 3.72, 6.32, [0, 0, 0.0, 1.5]), 0.12, true), 2, { closed: true, curved: true }), 2, 'glass', 'Glass 3F room');
  // 4F: one room in the middle, gardens front and back
  add(glazing(rrect(0.23, 1.52, 3.71, 4.66), 3, { closed: true }), 3, 'glass', 'Glass 4F');
  for (let L = 1; L <= 3; L++) add(balustrade(rrect(0.015, 0.015, SW - 0.015, SD - 0.015).concat([[X(0.015), Z(0.015)]]), L), L, 'rail', `Rail ${L + 1}F`);

  // roof: curved steel tube rail, skylight, stair hatch, the round opening's lip, a little AC unit
  {
    const g = new THREE.Group();
    const s = 97.6, o = [413, 28];
    const raw = [[515, 120], [440, 100], [425, 140], [428, 300], [425, 480], [435, 555], [470, 600], [540, 622], [640, 622], [705, 600], [752, 545], [768, 450], [765, 260], [745, 200], [700, 165], [640, 152]];
    const path = resample(raw.map(([px, py]) => P((px - o[0]) / s, (py - o[1]) / s)), 0.08);
    const pts = path.map(([x, z]) => new THREE.Vector3(x, FL(4) + 1.1, z));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.018, 6), m.steel));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(FL(4) + 0.55))), 240, 0.01, 6), m.steel));
    const L = polyLen(path);
    let acc = 0;
    for (let i = 0; i < path.length; i++) {
      if (i) acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      if (i === 0 || acc > 1.0 || i === path.length - 1) { acc = 0; g.add(cyl(0.012, 0.012, 1.1, path[i][0], FL(4), path[i][1], m.steel, 6)); }
    }
    void L;
    add(g, 4, 'rail', 'Roof rail');
    // skylight curb and glass over the 4F stair
    const sk = new THREE.Group();
    const curb = new THREE.Shape(); const so = rrect(0.17, 2.02, 2.07, 3.91);
    so.forEach(([x, z], i) => (i ? curb.lineTo(x, -z) : curb.moveTo(x, -z)));
    curb.holes.push(toPath(skylight));
    const cg = new THREE.ExtrudeGeometry(curb, { depth: 0.32, bevelEnabled: false }); cg.rotateX(-Math.PI / 2); cg.translate(0, FL(4), 0);
    sk.add(mesh(cg, m.white));
    const glassTop = pbox(0.2, 2.05, 2.04, 3.88, FL(4) + 0.32, FL(4) + 0.34, m.glass, false); glassTop.renderOrder = 2; sk.add(glassTop);
    add(sk, 4, 'roofbits', 'Skylight');
    // stair hatch: a white box with a glass door to the roof
    const hb = new THREE.Group();
    hb.add(pbox(1.05, 0.61, 3.04, 1.27, FL(4), FL(4) + 1.35, m.white));
    const door = pbox(1.2, 1.268, 1.9, 1.29, FL(4) + 0.02, FL(4) + 1.25, m.doorDark, false); hb.add(door);
    add(hb, 4, 'roofbits', 'Roof hatch');
    // lip around the round opening
    const lip = new THREE.Shape(); circle(2.68, 5.66, 0.8).forEach(([x, z], i) => (i ? lip.lineTo(x, -z) : lip.moveTo(x, -z)));
    lip.holes.push(toPath(roofHole));
    const lg = new THREE.ExtrudeGeometry(lip, { depth: 0.16, bevelEnabled: false, curveSegments: 32 }); lg.rotateX(-Math.PI / 2); lg.translate(0, FL(4), 0);
    add(mesh(lg, m.edge), 4, 'roofbits', 'Round opening');
    add(pbox(0.33, 4.0, 1.18, 4.34, FL(4), FL(4) + 0.62, m.unit), 4, 'roofbits', 'Outdoor unit');
  }

  // ---- rooms
  // 1F: long shelf on the left, kitchen at the back, round dining table on a rug, sofa, the yard step
  {
    const g = new THREE.Group();
    g.add(pbox(0.1, 0.18, 0.42, 5.7, 0, 0.42, m.white));
    const books = [];
    for (let i = 0; i < 36; i++) { const z = 0.3 + i * 0.15, d = T.rr(0.03, 0.08), h = T.rr(0.16, 0.28); const bg = new THREE.BoxGeometry(0.25, h, d); bg.translate(X(0.255), 0.42 + h / 2, Z(z + d / 2)); books.push(tint(bg, GARMENTS[(i * 7) % GARMENTS.length])); }
    g.add(mesh(merge(books), m.tinted));
    g.add(pbox(2.1, 0.12, 3.1, 0.8, 0, 0.86, m.white), pbox(2.1, 0.12, 3.1, 0.8, 0.86, 0.9, m.stainless));
    for (const [a, b] of [[2.45, 0.3], [2.75, 0.62], [2.55, 0.6]]) g.add(cyl(0.08, 0.08, 0.012, X(a), 0.9, Z(b), m.black, 16));
    g.add(pbox(3.1, 1.47, 3.62, 2.2, 0, 0.86, m.white), pbox(3.1, 1.47, 3.62, 2.2, 0.86, 0.9, m.stainless));
    g.add(pbox(2.12, 0.9, 3.1, 1.25, 0, 0.86, m.white));
    g.add(pbox(0.5, 1.78, 2.16, 3.0, 0, 0.012, m.rug, false));
    g.add(table(1.23, 2.25, 0.85, 0, 0, m.wood, { round: true }));
    g.add(chair(0.75, 2.2, 0, Math.PI / 2, m.redChair), chair(1.7, 2.3, 0, -Math.PI / 2, m.redChair), chair(1.25, 1.85, 0, 0, m.redChair));
    g.add(pbox(2.95, 3.7, 3.65, 5.7, 0, 0.42, m.fabric), pbox(3.45, 3.7, 3.65, 5.7, 0.42, 0.78, m.fabric));
    g.add(table(1.75, 5.2, 0.42, 0, 0, m.white, { round: true, h: 0.45 }));
    g.add(pbox(0.05, 5.82, 3.75, 6.6, 0, 0.04, m.edge));
    g.add(lamp(1.2, 2.2, 0), lamp(2.6, 4.6, 0), lamp(1.4, 5.0, 0));
    lamps.push(...g.children.slice(-3));
    add(g, 0, 'room', 'Living, kitchen, dining 1F');
  }
  // 2F: bedroom with a clothes rail, meeting room with its table, planter inside the glass
  {
    const g = new THREE.Group(), L = 1, y = FL(L);
    g.add(bed(0.34, 0.99, 2.18, 1.97, L));
    g.add(clothesRail(0.39, 2.4, 1.6, 2.4, L));
    g.add(table(2.1, 5.43, 1.38, 0.62, L, m.wood));
    g.add(chair(1.75, 5.95, L, Math.PI, m.black), chair(2.45, 5.95, L, Math.PI, m.black), chair(2.1, 4.95, L, 0, m.black));
    g.add(pbox(1.55, 6.05, 3.05, 6.3, y, y + 0.42, m.column));
    g.add(pbox(1.58, 6.08, 3.02, 6.27, y + 0.42, y + 0.43, m.soil, false));
    g.add(pbox(2.93, 0.86, 3.76, 2.27, y, y + 0.45, m.column), pbox(2.96, 0.9, 3.73, 2.24, y + 0.45, y + 0.46, m.soil, false));
    g.add(lamp(1.3, 2.6, L), lamp(2.2, 5.5, L));
    lamps.push(...g.children.slice(-2));
    add(g, L, 'room', 'Bedroom and meeting room 2F');
  }
  // 3F: bath (tub, toilet, basin), desk, bed by the curved glass; soil bed for the indoor garden
  {
    const g = new THREE.Group(), L = 2, y = FL(L);
    g.add(pbox(2.93, 0.12, 3.72, 1.45, y, y + 0.55, m.porcelain), pbox(3.0, 0.2, 3.65, 1.37, y + 0.548, y + 0.555, new THREE.MeshStandardMaterial({ color: '#dfe8ea', roughness: 0.1 }), false));
    g.add(cyl(0.2, 0.17, 0.4, X(0.4), y, Z(1.2), m.porcelain), pbox(0.12, 1.0, 0.68, 1.12, y, y + 0.75, m.porcelain));
    g.add(pbox(0.13, 0.12, 0.6, 0.79, y, y + 0.8, m.white), cyl(0.17, 0.12, 0.12, X(0.37), y + 0.8, Z(0.45), m.porcelain));
    g.add(table(0.39, 2.15, 0.62, 0.97, L, m.wood, {}));
    g.add(chair(0.95, 2.2, L, -Math.PI / 2, m.redChair));
    g.add(bed(2.85, 4.43, 3.67, 5.96, L, false));
    g.add(cyl(0.16, 0.16, 0.45, X(1.25), y, Z(6.0), m.white), cyl(0.16, 0.16, 0.45, X(1.42), y, Z(6.25), m.white));
    g.add(pbox(1.2, 1.6, 2.6, 2.6, y, y + 0.05, m.soil, false), pbox(2.4, 2.6, 3.7, 4.2, y, y + 0.05, m.soil, false), pbox(0.25, 4.95, 2.6, 6.25, y, y + 0.05, m.soil, false));
    g.add(lamp(1.1, 2.0, L), lamp(2.7, 4.0, L), lamp(0.9, 1.0, L));
    lamps.push(...g.children.slice(-3));
    add(g, L, 'room', 'Bath, study, bedroom 3F');
  }
  // 4F: extra room (bed, shelf, cabinet, clothes rail), desk out in the front garden, planter strip
  {
    const g = new THREE.Group(), L = 3, y = FL(L);
    g.add(bed(0.56, 1.71, 2.28, 2.7, L));
    g.add(pbox(0.26, 1.72, 0.54, 3.3, y, y + 1.1, m.white));
    g.add(pbox(1.9, 3.2, 2.4, 4.07, y, y + 0.75, m.white));
    g.add(clothesRail(3.4, 3.2, 3.4, 4.5, L));
    g.add(table(1.71, 5.38, 0.58, 0.72, L, m.wood), chair(2.22, 5.38, L, -Math.PI / 2, m.black));
    g.add(pbox(0.1, 6.15, 2.0, 6.5, y, y + 0.4, m.column), pbox(0.13, 6.18, 1.97, 6.47, y + 0.4, y + 0.41, m.soil, false));
    g.add(pbox(0.2, 0.15, 1.85, 1.35, y, y + 0.05, m.soil, false), pbox(2.4, 4.85, 3.7, 6.4, y, y + 0.06, m.soil, false));
    g.add(lamp(2.6, 2.5, L), lamp(1.0, 3.8, L));
    lamps.push(...g.children.slice(-2));
    add(g, L, 'room', 'Extra room 4F');
  }
  // roof table
  {
    const g = new THREE.Group(), L = 4;
    g.add(table(3.0, 2.7, 0.7, 0.7, L, m.white), chair(3.0, 3.25, L, Math.PI, m.white), chair(3.0, 2.15, L, 0, m.white));
    add(g, 4, 'room', 'Roof table');
  }

  // ---- curtains (sheer, on ceiling tracks)
  add(curtain(rrect(0.12, 0.08, 3.68, 5.74).slice(2).concat([P(0.12, 0.08)]), 0, { from: 0.0, to: 0.16, gathered: 0.6 }), 0, 'curtain', 'Curtain 1F');
  add(curtain(resample(rrect(0.78, 4.76, 3.58, 6.26, [0.55, 0.55, 0.55, 0.55]), 0.1, true), 1, { from: 0.1, to: 0.42, gathered: 0.35 }), 1, 'curtain', 'Curtain 2F');
  add(curtain(resample(rrect(0.18, 1.6, 3.62, 6.22, [0, 0, 0, 1.4]).slice(3), 0.1), 2, { from: 0.3, to: 1, gathered: 0.35 }), 2, 'curtain', 'Curtain 3F');
  add(curtain(resample([P(3.0, 0.05), P(3.55, 0.35), P(3.72, 0.9), P(3.7, 1.45)], 0.08), 3, { from: 0, to: 1, gathered: 0.5 }), 3, 'curtain', 'Curtain 4F back');
  add(curtain(resample([P(3.72, 4.75), P(3.68, 5.8), P(3.3, 6.35), P(2.4, 6.5)], 0.08), 3, { from: 0, to: 1, gathered: 0.3 }), 3, 'curtain', 'Curtain 4F front');

  // ---- gardens
  T.reseed(4242);
  const plant = (L, xp, zp, type, opts = {}) => {
    const p = makePlant(type, opts);
    p.position.set(X(xp), FL(L) + (opts.lift || 0), Z(zp));
    p.rotation.y = T.rnd() * Math.PI * 2;
    return add(p, L, 'plant', `${type} ${L + 1}F`);
  };
  // the yard in front of 1F, planted straight in the ground
  {
    const yard = mesh(new THREE.BoxGeometry(4.2, 0.2, 1.6), m.soil);
    yard.position.set(0, -0.08, Z(7.42)); add(yard, 0, 'room', 'Front yard');
  }
  plant(0, 0.56, 7.22, 'tree', { pot: null, h: 3.4, scale: 1.25, green: 'fresh' });
  plant(0, 1.64, 7.4, 'tree', { pot: null, h: 2.4, scale: 1.0, leaf: 3, green: 'olive' });
  plant(0, 3.18, 7.5, 'tree', { pot: null, h: 2.9, scale: 1.1 });
  plant(0, 0.15, 6.9, 'shrub', { pot: null, scale: 1.2 });
  plant(0, 1.33, 6.9, 'shrub', { pot: 'terracotta' });
  plant(0, 0.1, 7.85, 'banana', { pot: null, scale: 1.0 });
  plant(0, 1.28, 7.85, 'grass', { pot: null });
  plant(0, 3.85, 6.95, 'banana', { pot: 'concrete', scale: 1.1 });
  plant(0, 2.35, 6.3, 'shrub', { pot: 'terracotta', lift: 0.04 });
  plant(0, 3.4, 6.25, 'snake', { pot: 'white', lift: 0.04 });
  plant(0, 0.5, 6.2, 'grass', { pot: 'black', lift: 0.04 });
  plant(0, 3.45, 0.45, 'snake', { pot: 'white' });
  // 2F
  plant(1, 2.39, 0.38, 'tree', { pot: 'concrete', h: 1.9, scale: 0.9 });
  plant(1, 3.05, 0.2, 'shrub', { pot: 'terracotta' });
  plant(1, 3.5, 0.24, 'banana', { pot: 'terracotta', scale: 0.9 });
  plant(1, 2.85, 0.6, 'grass', { pot: 'black' });
  plant(1, 3.3, 1.25, 'grass', { pot: null, lift: 0.45 });
  plant(1, 3.35, 1.9, 'shrub', { pot: null, lift: 0.45, scale: 1.1 });
  plant(1, 3.5, 3.6, 'shrub', { pot: 'terracotta' });
  plant(1, 3.45, 4.1, 'tree', { pot: 'terracotta', h: 1.7, scale: 0.85, leaf: 3 });
  plant(1, 3.0, 3.9, 'snake', { pot: 'white' });
  plant(1, 0.34, 5.3, 'tree', { pot: 'concrete', h: 2.1, scale: 1.0 });
  plant(1, 0.32, 6.15, 'banana', { pot: 'terracotta', scale: 1.0 });
  plant(1, 0.95, 6.2, 'shrub', { pot: 'terracotta' });
  plant(1, 0.5, 0.35, 'palm', { pot: 'terracotta', scale: 0.7 });
  plant(1, 1.85, 6.18, 'grass', { pot: null, lift: 0.42 });
  plant(1, 2.35, 6.18, 'grass', { pot: null, lift: 0.42 });
  plant(1, 2.8, 6.18, 'grass', { pot: null, lift: 0.42 });
  plant(1, 3.38, 5.15, 'shrub', { pot: 'black', scale: 0.7 });
  plant(1, 3.38, 5.55, 'snake', { pot: 'white' });
  // 3F: the garden inside the glass, plus the front corner outside it
  plant(2, 1.47, 1.95, 'shrub', { pot: null, scale: 1.1 });
  plant(2, 1.9, 2.25, 'grass', { pot: null });
  plant(2, 2.9, 1.86, 'palm', { pot: 'terracotta', scale: 0.85 });
  plant(2, 3.5, 1.92, 'shrub', { pot: 'terracotta' });
  plant(2, 2.6, 2.95, 'shrub', { pot: null });
  plant(2, 2.95, 3.6, 'tree', { pot: null, h: 2.2, scale: 1.05, green: 'fresh' });
  plant(2, 3.5, 3.0, 'shrub', { pot: 'terracotta' });
  plant(2, 3.42, 4.07, 'grass', { pot: 'black' });
  plant(2, 0.5, 5.15, 'shrub', { pot: null });
  plant(2, 0.55, 5.85, 'banana', { pot: null, scale: 1.05 });
  plant(2, 1.7, 5.15, 'shrub', { pot: null, scale: 0.9 });
  plant(2, 1.85, 6.0, 'snake', { pot: null });
  plant(2, 2.4, 5.9, 'grass', { pot: 'terracotta' });
  plant(2, 0.15, 6.5, 'shrub', { pot: 'terracotta', scale: 0.8 });
  plant(2, 3.35, 6.4, 'tree', { pot: 'concrete', h: 1.9, scale: 0.9, leaf: 3 });
  // 4F: back garden around the roof stair, front garden with the tree that grows through the roof
  plant(3, 0.36, 0.45, 'shrub', { pot: null });
  plant(3, 0.55, 1.0, 'grass', { pot: null });
  plant(3, 1.02, 0.8, 'shrub', { pot: null, scale: 0.9 });
  plant(3, 1.55, 0.4, 'banana', { pot: null, scale: 0.9 });
  plant(3, 2.3, 0.3, 'tree', { pot: 'terracotta', h: 1.5, scale: 0.8 });
  plant(3, 3.5, 0.3, 'shrub', { pot: 'terracotta' });
  plant(3, 0.5, 5.0, 'shrub', { pot: 'terracotta' });
  plant(3, 0.5, 5.65, 'palm', { pot: 'terracotta', scale: 0.75 });
  plant(3, 3.4, 5.05, 'shrub', { pot: null });
  plant(3, 2.3, 6.15, 'shrub', { pot: null });
  plant(3, 3.1, 6.2, 'banana', { pot: null, scale: 0.95 });
  for (const x of [0.35, 0.8, 1.25, 1.7]) plant(3, x, 6.32, 'grass', { pot: null, lift: 0.4 });
  // roof: big tapered concrete pots by the opening
  plant(4, 1.6, 5.15, 'tree', { pot: 'concrete', potR: 0.3, potH: 0.55, h: 1.4, scale: 0.75, leaf: 3 });
  plant(4, 2.05, 4.75, 'shrub', { pot: 'concrete', potR: 0.26, potH: 0.5 });
  plant(4, 2.62, 4.55, 'shrub', { pot: 'concrete', potR: 0.24, potH: 0.48 });
  plant(4, 3.2, 4.72, 'tree', { pot: 'concrete', potR: 0.28, potH: 0.52, h: 1.2, scale: 0.7 });
  plant(4, 1.55, 5.85, 'grass', { pot: 'concrete', potR: 0.22, potH: 0.45 });
  plant(4, 3.45, 1.9, 'snake', { pot: 'concrete', potR: 0.18, potH: 0.4 });
  // last: the tree in the 4F garden that rises through the round opening in the roof
  plant(3, 2.68, 5.66, 'tree', { pot: null, h: 4.8, scale: 1.35, green: 'fresh', dense: 1.3 });

  return { root, pieces, lamps, mats: m };
}

export { mats as houseMats, plantMats };
