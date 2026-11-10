// Two people who live in the house: they walk the floors, take the spiral stair, sit at the
// tables, water the plants that exist, sometimes meet up, and turn to place each new piece.
import * as THREE from 'three';
import { FH, SW, SD, spiralA0 } from './model.js';

const X = (xp) => xp - SW / 2, Z = (zp) => zp - SD / 2;
const FL = (L) => L * FH;

// ---------------------------------------------------------------------------------------------
// Walkable graph, per floor, in plan meters (x from the left edge, z from the back edge).
// Edges avoid glass, columns and the stair openings; doors are where the glass slides open.
const SPIRAL = { x: 1.1, z: 3.45, sweep: Math.PI * 2 * 0.93 };
const onCircle = (a, r) => [SPIRAL.x + Math.cos(a) * r, SPIRAL.z - Math.sin(a) * r];
const stairBottom = (L) => onCircle(spiralA0(L) - 0.35, 1.05);
const stairTop = (L) => onCircle(spiralA0(L) + SPIRAL.sweep + 0.2, 1.05);

const FLOORS = [
  { // 1F
    nodes: { up: stairBottom(0), n1: [0.7, 5.15], n2: [2.3, 5.0], door: [2.3, 5.6], step: [2.3, 6.2], yard: [2.5, 6.85], n3: [2.45, 3.5], n4: [2.1, 1.65], dineA: [1.25, 1.42], browseA: [0.85, 1.1] },
    edges: [['up', 'n1'], ['n1', 'n2'], ['n2', 'door'], ['door', 'step'], ['step', 'yard'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'dineA'], ['dineA', 'browseA'], ['n1', 'up']],
    spots: [
      { id: 'kitchen', at: [2.6, 1.45], yaw: Math.PI, pose: 'cook', near: 'n4', needs: 'room' },
      { id: 'dine0', at: [1.25, 1.85], yaw: 0, pose: 'sit', near: 'dineA', needs: 'room', pair: 'dine' },
      { id: 'sofa', at: [3.2, 4.6], yaw: -Math.PI / 2, pose: 'sit', seat: 0.44, near: 'n3', needs: 'room' },
      { id: 'books', at: [0.62, 1.1], yaw: -Math.PI / 2, pose: 'browse', near: 'browseA', needs: 'room' },
      { id: 'yard', at: [2.5, 6.85], yaw: 0, pose: 'look', near: 'yard' },
    ],
  },
  { // 2F
    nodes: { down: stairTop(0), up: stairBottom(1), b1: [1.85, 4.25], b2: [1.9, 2.45], bedA: [1.3, 2.4], rail: [0.95, 2.72], dIn: [2.15, 3.05], dOut: [2.62, 3.05], gW: [2.95, 3.75], mIn: [1.85, 4.88], m2: [2.95, 5.05], win: [2.6, 5.98] },
    edges: [['down', 'up'], ['up', 'b1'], ['down', 'b1'], ['b1', 'b2'], ['b2', 'bedA'], ['b2', 'rail'], ['b2', 'dIn'], ['dIn', 'dOut'], ['dOut', 'gW'], ['b1', 'mIn'], ['mIn', 'm2'], ['m2', 'win']],
    spots: [
      { id: 'bed2', at: [1.3, 2.05], yaw: 0, pose: 'sit', seat: 0.42, near: 'bedA', needs: 'room' },
      { id: 'clothes', at: [0.95, 2.72], yaw: Math.PI, pose: 'browse', near: 'rail', needs: 'room' },
      { id: 'meet0', at: [1.75, 5.95], yaw: Math.PI, pose: 'sit', near: 'win', needs: 'room', pair: 'meet' },
      { id: 'meet1', at: [2.45, 5.95], yaw: Math.PI, pose: 'sit', near: 'win', needs: 'room', pair: 'meet' },
      { id: 'garden2', at: [2.95, 3.75], yaw: Math.PI / 2, pose: 'look', near: 'gW' },
    ],
  },
  { // 3F: glass room (stair, desk) and bath; everything else is the jungle
    nodes: { down: stairTop(1), up: stairBottom(2), rIn: [1.75, 4.35], dOut: [2.3, 4.35], n2: [2.35, 3.2], front: [1.4, 5.95], n3: [1.55, 1.8], bathIn: [1.5, 1.2], basin: [0.8, 0.5], deskA: [1.45, 2.6] },
    edges: [['down', 'up'], ['up', 'rIn'], ['down', 'rIn'], ['rIn', 'dOut'], ['dOut', 'n2'], ['dOut', 'front'], ['rIn', 'deskA'], ['deskA', 'n3'], ['n3', 'bathIn'], ['bathIn', 'basin']],
    spots: [
      { id: 'desk', at: [0.98, 2.2], yaw: -Math.PI / 2, pose: 'sit', near: 'deskA', needs: 'room' },
      { id: 'bath', at: [0.8, 0.5], yaw: -Math.PI / 2, pose: 'browse', near: 'basin', needs: 'room' },
      { id: 'jungle', at: [2.35, 3.2], yaw: 0.67, pose: 'look', near: 'n2' },
      { id: 'front3', at: [1.4, 5.95], yaw: 0, pose: 'look', near: 'front' },
    ],
  },
  { // 4F
    nodes: { down: stairTop(2), fIn: [2.0, 4.42], fOut: [2.0, 4.95], tree: [2.3, 5.05], n1: [2.65, 4.3], n2: [2.75, 2.95], bedA: [2.05, 2.98], bIn: [3.0, 1.78], bOut: [3.0, 1.32], back: [2.1, 1.42], bW: [1.25, 1.42], up: [3.45, 0.95] },
    edges: [['down', 'fIn'], ['down', 'n1'], ['fIn', 'fOut'], ['fOut', 'tree'], ['fIn', 'n1'], ['n1', 'n2'], ['n2', 'bedA'], ['n2', 'bIn'], ['bIn', 'bOut'], ['bOut', 'back'], ['back', 'bW'], ['bOut', 'up']],
    spots: [
      { id: 'bed4', at: [1.6, 2.78], yaw: 0, pose: 'sit', seat: 0.42, near: 'bedA', needs: 'room' },
      { id: 'desk4', at: [2.22, 5.38], yaw: -Math.PI / 2, pose: 'sit', near: 'fOut', needs: 'room' },
      { id: 'tree4', at: [2.3, 5.05], yaw: 0.6, pose: 'look', near: 'tree' },
    ],
  },
  { // roof
    nodes: { down: [1.55, 1.6], r1: [2.6, 1.95], tA: [3.0, 3.75], tB: [3.45, 2.15], r2: [2.4, 4.15], tree: [2.0, 5.0], r3: [1.0, 4.62], look: [1.2, 5.72] },
    edges: [['down', 'r1'], ['r1', 'tA'], ['r1', 'tB'], ['r1', 'r2'], ['r2', 'tree'], ['r2', 'r3'], ['r3', 'look'], ['tA', 'r2']],
    spots: [
      { id: 'roof0', at: [3.0, 3.25], yaw: Math.PI, pose: 'sit', near: 'tA', needs: 'roofroom', pair: 'roof' },
      { id: 'roof1', at: [3.0, 2.15], yaw: 0, pose: 'sit', near: 'tB', needs: 'roofroom', pair: 'roof' },
      { id: 'treeR', at: [2.0, 5.0], yaw: 0.8, pose: 'look', near: 'tree' },
      { id: 'view', at: [1.2, 5.72], yaw: 0, pose: 'look', near: 'look' },
    ],
  },
];
// the 1F dining pair's second chair
FLOORS[0].spots.push({ id: 'dine1', at: [0.75, 2.2], yaw: Math.PI / 2, pose: 'sit', near: 'browseA', needs: 'room', pair: 'dine' });

const key = (L, n) => `${L}:${n}`;
function graph() {
  const G = new Map();
  const node = (L, n) => { const k = key(L, n); if (!G.has(k)) { const [x, z] = FLOORS[L].nodes[n]; G.set(k, { k, L, p: new THREE.Vector3(X(x), FL(L), Z(z)), nb: [] }); } return G.get(k); };
  FLOORS.forEach((F, L) => {
    for (const n of Object.keys(F.nodes)) node(L, n);
    for (const [a, b] of F.edges) { const A = node(L, a), B = node(L, b); const d = A.p.distanceTo(B.p); A.nb.push({ to: B.k, d }); B.nb.push({ to: A.k, d }); }
  });
  // stairs between floors (spiral for 1F→4F, the ship's stair to the roof)
  for (let L = 0; L < 4; L++) {
    const A = G.get(key(L, 'up')), B = G.get(key(L + 1, 'down'));
    A.nb.push({ to: B.k, d: 6, stair: L, dir: 1 }); B.nb.push({ to: A.k, d: 6, stair: L, dir: -1 });
  }
  return G;
}

// ---------------------------------------------------------------------------------------------
// The figures: soft, simple bodies, like scale figures in an architect's model.
function makeFigure({ shirt, pants, skin, hair, height = 1.0, beanie = false, ponytail = false }) {
  const M = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const mShirt = M(shirt), mPants = M(pants), mSkin = M(skin, 0.6), mHair = M(hair, 0.85), mShoe = M('#ece9e2', 0.6);
  const cap = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.receiveShadow = true; return m; };
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body); // bobs and sinks when sitting
  body.position.y = STAND;

  const torso = cap(0.15, 0.3, mShirt); torso.position.y = 0.3; torso.scale.set(1, 1, 0.72); body.add(torso);
  const hips = cap(0.13, 0.08, mPants); hips.rotation.z = Math.PI / 2; hips.position.y = 0.04; hips.scale.set(1, 1.1, 0.8); body.add(hips);
  const neck = cap(0.045, 0.06, mSkin); neck.position.y = 0.56; body.add(neck);
  const head = new THREE.Group(); head.position.y = 0.68; body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), mSkin); skull.scale.set(0.92, 1.05, 1); skull.castShadow = true; head.add(skull);
  if (beanie) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M('#3f73e0', 0.9)); b.position.y = 0.012; b.castShadow = true; head.add(b);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 8, 24), M('#3466cc', 0.9)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; head.add(rim);
  } else {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), mHair); h.rotation.x = -0.35; h.position.set(0, 0.01, -0.012); h.castShadow = true; head.add(h);
    if (ponytail) { const p = cap(0.04, 0.12, mHair); p.position.set(0, -0.02, -0.11); p.rotation.x = 0.5; head.add(p); }
  }

  const limb = (parent, x, y, r1, l1, r2, l2, m1, m2, foot) => {
    const j1 = new THREE.Group(); j1.position.set(x, y, 0); parent.add(j1);
    const a = cap(r1, l1, m1); a.position.y = -l1 / 2 - r1 * 0.3; j1.add(a);
    const j2 = new THREE.Group(); j2.position.y = -l1 - r1 * 0.2; j1.add(j2);
    const b = cap(r2, l2, m2); b.position.y = -l2 / 2 - r2 * 0.4; j2.add(b);
    if (foot) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.2), mShoe); f.position.set(0, -l2 - r2 * 0.9, 0.04); f.castShadow = true; j2.add(f); }
    else { const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), mSkin); hnd.position.y = -l2 - r2 * 1.6; j2.add(hnd); j2.userData.hand = hnd; }
    return { j1, j2 };
  };
  const legL = limb(body, 0.085, 0, 0.065, 0.34, 0.055, 0.34, mPants, mPants, true);
  const legR = limb(body, -0.085, 0, 0.065, 0.34, 0.055, 0.34, mPants, mPants, true);
  const armL = limb(body, 0.205, 0.43, 0.045, 0.2, 0.04, 0.19, mShirt, mSkin, false);
  const armR = limb(body, -0.205, 0.43, 0.045, 0.2, 0.04, 0.19, mShirt, mSkin, false);

  // watering can, held in the right hand when watering
  const can = new THREE.Group();
  const cm = M('#5f8f6a', 0.5);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 14), cm); can.add(tank);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.22, 6), cm); spout.position.set(0, 0.03, 0.14); spout.rotation.x = 1.0; can.add(spout);
  can.position.set(0, -0.08, 0.06); can.visible = false;
  armR.j2.userData.hand.add(can);

  root.add(new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75).rotateX(-Math.PI / 2).translate(0, 0.012, 0), blobMat()));
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.person = true; } });
  root.scale.setScalar(height);
  return { root, body, head, legL, legR, armL, armR, can, h: height };
}

const STAND = 0.775;
let _blob;
function blobMat() {
  if (_blob) return _blob;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _blob = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  return _blob;
}
const ease = (t) => t * t * (3 - 2 * t);
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

// ---------------------------------------------------------------------------------------------
export function createPeople(scene, pieces) {
  const G = graph();
  const byName = new Map(pieces.map((p) => [p.name, p]));
  const isBuilt = (name) => !!byName.get(name)?.obj.userData.built;
  const SLABS = ['Ground slab', '2F slab', '3F slab', '4F slab', 'Roof slab'];
  const STAIRS = ['Spiral stair 1F', 'Spiral stair 2F', 'Spiral stair 3F', 'Stair to the roof'];
  const ROOMS = ['Living, kitchen, dining 1F', 'Bedroom and meeting room 2F', 'Bath, study, bedroom 3F', 'Extra room 4F'];
  const floorOk = (L) => isBuilt(SLABS[L]) && (L === 0 || floorOk(L - 1) && isBuilt(STAIRS[L - 1]));
  const spotOk = (L, s) => floorOk(L) && (!s.needs || (s.needs === 'roofroom' ? isBuilt('Roof table') : isBuilt(ROOMS[L])));

  const people = [
    { name: 'him', fig: makeFigure({ shirt: '#f1eee6', pants: '#2c2f36', skin: '#d6a887', hair: '#2a211c', height: 1.05, beanie: true }) },
    { name: 'her', fig: makeFigure({ shirt: '#c8372d', pants: '#344a6e', skin: '#e3b59a', hair: '#1f1a17', height: 0.97, ponytail: true }) },
  ];
  people.forEach((P, i) => {
    scene.add(P.fig.root);
    Object.assign(P, { node: key(0, i ? 'n3' : 'n2'), pos: new THREE.Vector3(), yaw: 0, path: null, pose: 'stand', poseT: 1, phase: 0, wait: 1 + i * 2, spot: null, level: 0, seat: 0.45, gesture: 0 });
    P.pos.copy(G.get(P.node).p);
  });

  // ---- path finding over floors that exist right now
  function route(fromK, toK) {
    const dist = new Map([[fromK, 0]]), prev = new Map(), open = new Set([fromK]);
    while (open.size) {
      let u = null, best = Infinity;
      for (const k of open) if (dist.get(k) < best) { best = dist.get(k); u = k; }
      open.delete(u);
      if (u === toK) break;
      for (const e of G.get(u).nb) {
        const v = G.get(e.to);
        if (!floorOk(v.L)) continue;
        if (e.stair != null && !(floorOk(e.stair) && floorOk(e.stair + 1))) continue;
        const nd = best + e.d;
        if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { from: u, e }); open.add(e.to); }
      }
    }
    if (!dist.has(toK)) return null;
    const legs = [];
    for (let k = toK; k !== fromK;) { const p = prev.get(k); legs.unshift({ a: p.from, b: k, e: p.e }); k = p.from; }
    return legs;
  }

  // turn a route into a list of points, sampling stairs along their real paths
  function pathPoints(legs) {
    const pts = [];
    for (const { a, b, e } of legs) {
      const A = G.get(a).p, B = G.get(b).p;
      if (e.stair == null) { pts.push(A.clone(), B.clone()); continue; }
      const L = e.stair, n = 60, seg = [];
      if (L < 3) {
        const a0 = spiralA0(L);
        for (let i = 0; i <= n; i++) {
          const t = i / n, ang = a0 - 0.35 + (SPIRAL.sweep + 0.55) * t;
          const r = t < 0.12 ? 1.05 - (0.6 * t / 0.12) : t > 0.88 ? 0.45 + 0.6 * (t - 0.88) / 0.12 : 0.45;
          const y = FL(L) + FH * THREE.MathUtils.clamp((t - 0.08) / 0.84, 0, 1);
          const [x, z] = onCircle(ang, r);
          seg.push(new THREE.Vector3(X(x), y, Z(z)));
        }
      } else {
        for (const [x, z, y] of [[3.45, 0.95, FL(3)], [3.22, 0.95, FL(3)], [1.98, 0.95, FL(4)], [1.75, 1.05, FL(4)], [1.55, 1.6, FL(4)]]) seg.push(new THREE.Vector3(X(x), y, Z(z)));
      }
      if (e.dir < 0) seg.reverse();
      pts.push(...seg);
    }
    // drop duplicates
    return pts.filter((p, i) => !i || p.distanceToSquared(pts[i - 1]) > 1e-6);
  }

  // ---- what to do next
  const PLANT_NODES = 1.9;
  function choices(P, other) {
    const out = [];
    FLOORS.forEach((F, L) => {
      if (!floorOk(L)) return;
      for (const s of F.spots) {
        if (!spotOk(L, s)) continue;
        if (other.spot && other.spot.id === s.id) continue;
        out.push({ ...s, L, w: s.pose === 'sit' ? 1.2 : 1 });
      }
      // water a plant that exists on this floor, from the nearest node
      for (const p of pieces) {
        if (p.kind !== 'plant' || p.level !== L || !p.obj.userData.built) continue;
        const pp = p.obj.position;
        let best = null, bd = PLANT_NODES;
        for (const [n] of Object.entries(F.nodes)) { const q = G.get(key(L, n)).p; const d = Math.hypot(q.x - pp.x, q.z - pp.z); if (d < bd) { bd = d; best = n; } }
        if (best) { const q = G.get(key(L, best)).p; out.push({ id: `water:${p.name}:${pp.x.toFixed(2)}`, L, near: best, at: null, yaw: Math.atan2(pp.x - q.x, pp.z - q.z), pose: 'water', w: 0.35 }); }
      }
    });
    return out;
  }
  function pickWeighted(list) { const sum = list.reduce((s, c) => s + c.w, 0); let r = Math.random() * sum; for (const c of list) { if ((r -= c.w) <= 0) return c; } return list[list.length - 1]; }

  function goTo(P, spot) {
    const legs = route(P.node, key(spot.L, spot.near));
    if (!legs) return false;
    const pts = [P.pos.clone(), ...pathPoints(legs)];
    if (spot.at) pts.push(new THREE.Vector3(X(spot.at[0]), FL(spot.L), Z(spot.at[1])));
    P.path = { pts, i: 0 };
    P.node = key(spot.L, spot.near);
    P.spot = spot; P.level = spot.L;
    P.pose = 'walk'; P.poseT = 0;
    return true;
  }

  function plan(P, other) {
    // sometimes meet up: dinner, the meeting table, the roof
    if (Math.random() < 0.22) {
      const pairs = ['dine', 'meet', 'roof'].map((pr) => FLOORS.flatMap((F, L) => F.spots.filter((s) => s.pair === pr).map((s) => ({ ...s, L })))).filter((ss) => ss.length === 2 && ss.every((s) => spotOk(s.L, s)));
      if (pairs.length && other.pose !== 'walk' && !other.together) {
        const pr = pairs[Math.floor(Math.random() * pairs.length)];
        if (goTo(P, pr[0]) && goTo(other, pr[1])) { P.together = other.together = true; P.wait = other.wait = 18 + Math.random() * 10; return; }
      }
    }
    const c = choices(P, other);
    for (let tries = 0; tries < 6 && c.length; tries++) {
      const s = pickWeighted(c);
      if (goTo(P, s)) { P.wait = s.pose === 'sit' ? 9 + Math.random() * 10 : 5 + Math.random() * 6; return; }
    }
    P.wait = 3;
  }

  // ---- keep them on floors that exist (when the build state changes)
  function settle() {
    for (const P of people) {
      if (floorOk(P.level) && (!P.spot || spotOk(P.spot.L, P.spot))) continue;
      P.path = null; P.spot = null; P.level = 0; P.node = key(0, P === people[0] ? 'n2' : 'n3');
      P.pos.copy(G.get(P.node).p); P.pose = 'stand'; P.wait = 1 + Math.random() * 2; P.together = false;
    }
  }

  // a new piece arrived: whoever is nearer turns to it and sets it down
  function place(target) {
    let best = people[0], bd = Infinity;
    for (const P of people) { const d = P.pos.distanceTo(target); if (d < bd) { bd = d; best = P; } }
    best.gesture = 1.6; best.gestureAt = target.clone();
  }

  // ---- animation
  const SPEED = 0.85;
  function update(dt) {
    people.forEach((P, i) => {
      const other = people[1 - i];
      const F = P.fig;
      if (P.gesture > 0) P.gesture -= dt;
      if (P.path) {
        const { pts } = P.path;
        let move = SPEED * dt * (P.onStair ? 0.6 : 1);
        while (move > 0 && P.path) {
          const tgt = pts[P.path.i];
          const d = P.pos.distanceTo(tgt);
          if (d <= move) { P.pos.copy(tgt); move -= d; P.path.i++; if (P.path.i >= pts.length) { P.path = null; P.pose = P.spot?.pose || 'stand'; P.poseT = 0; P.seat = P.spot?.seat ?? 0.45; } }
          else {
            const dir = tgt.clone().sub(P.pos).normalize();
            P.onStair = Math.abs(dir.y) > 0.15;
            P.pos.addScaledVector(dir, move); move = 0;
            if (Math.hypot(dir.x, dir.z) > 0.05) P.yaw = angLerp(P.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 9));
            P.phase += dt * SPEED * (P.onStair ? 0.6 : 1) / 0.62 * Math.PI;
          }
        }
      } else {
        if (P.spot) P.yaw = angLerp(P.yaw, P.spot.yaw, Math.min(1, dt * 4));
        if (P.gesture > 0 && P.gestureAt) P.yaw = angLerp(P.yaw, Math.atan2(P.gestureAt.x - P.pos.x, P.gestureAt.z - P.pos.z), Math.min(1, dt * 6));
        P.wait -= dt;
        if (P.wait <= 0 && P.gesture <= 0) { P.together = false; plan(P, other); }
      }
      P.poseT = Math.min(1, P.poseT + dt * 2.5);
      pose(P, dt);
      F.root.position.copy(P.pos);
      F.root.rotation.y = P.yaw;
    });
  }

  function pose(P) {
    const F = P.fig, t = performance.now() / 1000;
    const walking = !!P.path;
    let hipL = 0, hipR = 0, kneeL = 0.05, kneeR = 0.05, shL = 0.05, shR = 0.05, elL = -0.15, elR = -0.15, bodyY = STAND, lean = 0, headY = 0, headX = 0, armOut = 0.08;
    F.can.visible = false;
    if (walking) {
      const s = Math.sin(P.phase), c = Math.cos(P.phase), lift = P.onStair ? 1.6 : 1;
      hipL = -s * 0.42 * lift; hipR = s * 0.42 * lift;
      kneeL = 0.1 + Math.max(0, c) * 0.75 * lift; kneeR = 0.1 + Math.max(0, -c) * 0.75 * lift;
      shL = s * 0.35; shR = -s * 0.35; elL = elR = -0.3;
      bodyY = STAND + Math.abs(Math.cos(P.phase)) * 0.025 - 0.015;
      lean = P.onStair ? 0.12 : 0.04;
    } else {
      const k = ease(P.poseT), breathe = Math.sin(t * 1.6 + (P === people[0] ? 0 : 2)) * 0.008;
      const p = P.pose;
      if (p === 'sit') {
        const seat = (P.seat ?? 0.45) / F.h + 0.1;
        bodyY = THREE.MathUtils.lerp(STAND, seat, k); hipL = hipR = -1.45 * k; kneeL = kneeR = 1.45 * k;
        shL = shR = -0.35 * k; elL = elR = -0.75 * k; lean = 0.05; headX = -0.05 + breathe;
      } else if (p === 'water') {
        F.can.visible = true;
        shR = -1.05 * k; elR = -0.25 * k; armOut = 0.12; shL = 0.1; headX = 0.35 * k; lean = 0.08 * k;
        F.can.rotation.x = 0.4 + Math.sin(t * 2.2) * 0.1;
      } else if (p === 'cook') {
        shL = shR = -0.75 * k; elL = elR = -0.9 * k; headX = 0.35 * k; lean = 0.06;
        shL += Math.sin(t * 5) * 0.08 * k;
      } else if (p === 'browse') {
        shR = -1.0 * k; elR = -0.5 * k; headX = 0.1; headY = Math.sin(t * 0.6) * 0.25;
      } else if (p === 'look') {
        headY = Math.sin(t * 0.4) * 0.45; headX = -0.08; shL = shR = 0.12; elL = elR = -0.35;
      }
      bodyY += breathe;
    }
    // set a piece down: crouch, both hands forward
    if (P.gesture > 0) {
      const g = Math.sin(Math.min(1, (1.6 - P.gesture) / 1.6) * Math.PI);
      bodyY -= 0.22 * g; hipL = hipR = -0.7 * g; kneeL = kneeR = 1.2 * g; shL = shR = -1.2 * g; elL = elR = -0.3 * g; lean = 0.25 * g;
    }
    F.body.position.y = bodyY; F.body.rotation.x = lean;
    F.legL.j1.rotation.x = hipL; F.legR.j1.rotation.x = hipR; F.legL.j2.rotation.x = kneeL; F.legR.j2.rotation.x = kneeR;
    F.armL.j1.rotation.x = shL; F.armR.j1.rotation.x = shR; F.armL.j2.rotation.x = elL; F.armR.j2.rotation.x = elR;
    F.armL.j1.rotation.z = armOut; F.armR.j1.rotation.z = -armOut;
    F.head.rotation.y = headY; F.head.rotation.x = headX;
  }

  function setVisibleBelow(cut) { for (const P of people) P.fig.root.visible = P.level <= cut; }

  return { people, update, settle, place, setVisibleBelow };
}
