// The house view: Nishizawa's Garden and House on a plinth in the pocket's sky, soft contact
// shadows (N8AO), the sun where your person is, and the two of you living in it.
// Used by the app's last tab (lazy-loaded) and by the dev page at /house/.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { buildHouse, FH } from './model.js';
import { createPeople } from './people.js';
import { wind } from './plants.js';
import { sunAt, TOKYO } from './sun.js';
import { skyForAlt } from './skies.js';

const SITE = { x0: -2.15, x1: 2.15, z0: -3.55, z1: 4.85 };
const now = () => performance.now() / 1000;

// light by sun altitude (deg)
const KEYS = [
  { a: -18, sun: '#000000', hemiS: '#33467a', hemiG: '#14141a', hemi: 0.35, env: 0.12, exp: 1.2 },
  { a: -6, sun: '#000000', hemiS: '#56619a', hemiG: '#202028', hemi: 0.45, env: 0.22, exp: 1.12 },
  { a: 0, sun: '#ff8a4a', hemiS: '#9aa7d6', hemiG: '#544a44', hemi: 0.55, env: 0.38, exp: 1.05 },
  { a: 8, sun: '#ffc184', hemiS: '#c4d6f2', hemiG: '#6e6458', hemi: 0.6, env: 0.5, exp: 1.0 },
  { a: 25, sun: '#fff1dc', hemiS: '#d6e9ff', hemiG: '#7d776d', hemi: 0.62, env: 0.58, exp: 1.0 },
  { a: 70, sun: '#ffffff', hemiS: '#d6e9ff', hemiG: '#7d776d', hemi: 0.65, env: 0.6, exp: 0.95 },
];
const _a = new THREE.Color(), _b = new THREE.Color();
function lightFor(alt) {
  let i = 0; while (i < KEYS.length - 2 && alt > KEYS[i + 1].a) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = THREE.MathUtils.clamp((alt - A.a) / (B.a - A.a), 0, 1);
  const col = (k) => _a.set(A[k]).lerp(_b.set(B[k]), t).clone();
  const num = (k) => A[k] + (B[k] - A[k]) * t;
  return { sun: col('sun'), hemiS: col('hemiS'), hemiG: col('hemiG'), hemi: num('hemi'), env: num('env'), exp: num('exp') };
}

export const VIEWS = {
  corner: { pos: [10.5, 8.5, 17.5], target: [0, 4.6, 0.6] },
  street: { pos: [-0.4, 4.2, 13.5], target: [0, 6.0, 0] },
  side: { pos: [14, 7, 2.5], target: [0, 5.6, 0.4] },
  above: { pos: [6, 24, 12], target: [0, 6.5, 0] },
  roof: { pos: [5.5, 15.5, 7.5], target: [0.4, 11, 1] },
};

export function createHouseView(el, { place = null, sky = null, built = 1, finished = false, onEdge = null, ao = true, hour = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'house-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
  el.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !ao, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 2.5, maxDistance: 40, maxPolarAngle: Math.PI * 0.53, rotateSpeed: 0.7, zoomSpeed: 0.9, enablePan: true });
  controls.target.set(0, 5.4, 0.6);

  // ---- lights
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 14, bottom: -10, near: 1, far: 90 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
  sun.target.position.set(0, 5, 0);
  const hemi = new THREE.HemisphereLight('#cfe6ff', '#8a8378', 0.6);
  scene.add(sun, sun.target, hemi);
  const roomLights = [0, 1, 2, 3].map((L) => { const l = new THREE.PointLight('#ffc78a', 0, 6, 2); l.position.set(0.1, L * FH + 2.25, 0.4); scene.add(l); return l; });

  // ---- the plinth: the 4.3 x 8.4 m lot as a pale block floating in the sky, with its shadow below
  const plinthM = new THREE.MeshStandardMaterial({ color: '#e9e7e2', roughness: 0.9 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(SITE.x1 - SITE.x0, 0.5, SITE.z1 - SITE.z0), plinthM);
  plinth.position.set(0, -0.27, (SITE.z0 + SITE.z1) / 2);
  plinth.receiveShadow = true; plinth.castShadow = true;
  scene.add(plinth);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.16 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = -0.52; catcher.receiveShadow = true;
  scene.add(catcher);

  // ---- the house and the two of you
  const house = buildHouse();
  scene.add(house.root);
  const pieces = house.pieces;
  for (const p of pieces) { p.obj.userData.baseY = p.obj.position.y; }
  const people = createPeople(scene, pieces);
  built = Math.min(built, pieces.length);

  // ---- post: soft contact shadows
  // glass, curtains and the shadow catcher stay out of the AO buffer, so what's behind the glass
  // gets its shadows and the panes don't. Computed at half resolution to stay light on phones.
  let composer = null, aoPass = null;
  if (ao && renderer.capabilities.isWebGL2) {
    try {
      composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
      composer.addPass(new RenderPass(scene, camera));
      aoPass = new GTAOPass(scene, camera, 1, 1);
      aoPass.output = GTAOPass.OUTPUT.Default;
      aoPass.blendIntensity = 1;
      aoPass.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
      aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
      const hide = aoPass._overrideVisibility.bind(aoPass);
      aoPass._overrideVisibility = function () {
        hide();
        scene.traverse((o) => { if (o.isMesh && o.visible && (o.material?.transparent || o.isInstancedMesh && false)) { o.visible = false; this._visibilityCache.push(o); } });
      };
      const setSize = aoPass.setSize.bind(aoPass);
      aoPass.setSize = (w, h) => setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
      composer.addPass(aoPass);
      composer.addPass(new OutputPass());
    } catch (e) { console.warn('AO off', e); composer = null; }
  }

  // ---- state
  const S = { built: Math.max(1, built), finished, cut: 4, place, hourOverride: hour, sky: null, running: false, drops: [] };

  function applyVisibility() {
    pieces.forEach((p, i) => {
      const b = S.finished || i < S.built;
      p.obj.userData.built = b;
      p.obj.visible = b && p.level <= S.cut;
    });
    people.settle();
    people.setVisibleBelow(S.cut);
  }

  // drop new pieces in, one after another; the nearer person sets each one down
  function dropIn(from, to) {
    const t0 = now();
    for (let i = from; i < to; i++) {
      const p = pieces[i];
      p.obj.userData.appear = t0 + (i - from) * 0.45;
      p.obj.position.y = p.obj.userData.baseY + 30; // out of sight until its turn
      const c = new THREE.Box3().setFromObject(p.obj).getCenter(new THREE.Vector3());
      c.y -= 30;
      setTimeout(() => people.place(c), (i - from) * 450);
    }
  }
  function animateDrops(t) {
    for (const p of pieces) {
      const a = p.obj.userData.appear;
      if (a == null) continue;
      if (t < a) { p.obj.position.y = p.obj.userData.baseY + 30; continue; }
      const k = Math.min(1, (t - a) / 0.75), e = 1 - Math.pow(1 - k, 3);
      p.obj.position.y = p.obj.userData.baseY + (1 - e) * 1.6;
      if (k >= 1) { p.obj.position.y = p.obj.userData.baseY; p.obj.userData.appear = null; }
    }
  }

  // ---- sky and sun: where your person is, right now (or a forced hour on the dev page)
  const sunDir = new THREE.Vector3();
  function applySky() {
    const where = S.place && Number.isFinite(+S.place.lat) ? { lat: +S.place.lat, lon: +S.place.lon } : TOKYO;
    let date = new Date();
    if (S.hourOverride != null) {
      const offset = Math.round(where.lon / 15);
      const t = new Date(Date.now() + offset * 3600e3);
      date = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) + (S.hourOverride - offset) * 3600e3);
    }
    const { alt, az } = sunAt(date, where);
    const deg = alt * 180 / Math.PI;
    const sky = S.sky || skyForAlt(deg, az < Math.PI);
    el.style.background = `linear-gradient(${sky.top}, ${sky.mid} 55%, ${sky.bottom})`;
    const n = Math.cos(alt) * Math.cos(az), e = Math.cos(alt) * Math.sin(az);
    sunDir.set(-n, Math.sin(alt), -e).normalize();
    const k = lightFor(deg);
    hemi.color.copy(k.hemiS); hemi.groundColor.copy(k.hemiG); hemi.intensity = k.hemi;
    scene.environmentIntensity = k.env;
    renderer.toneMappingExposure = k.exp;
    const up = THREE.MathUtils.smoothstep(deg, -1, 12);
    sun.intensity = 3.2 * up; sun.color.copy(k.sun); sun.visible = up > 0.001;
    sun.position.copy(sunDir).multiplyScalar(40).add(sun.target.position);
    const lamps = THREE.MathUtils.smoothstep(-deg, -6, 2);
    roomLights.forEach((l) => { l.intensity = 7 * lamps; });
    house.mats.lamp.emissiveIntensity = 3 * lamps;
    house.mats.curtain.emissiveIntensity = 0.32 * lamps;
    catcher.material.opacity = 0.06 + 0.12 * up;
    return deg;
  }

  // ---- camera
  let fly = null;
  function frameFor(v) {
    const to = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target) };
    const k = camera.aspect < 0.8 ? 1.3 : 1; // tall phone screens stand further back
    to.pos.sub(to.target).multiplyScalar(k).add(to.target);
    return to;
  }
  function view(name, instant = false) {
    const to = frameFor(VIEWS[name] || VIEWS.corner);
    if (instant) { camera.position.copy(to.pos); controls.target.copy(to.target); controls.update(); return; }
    fly = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: now(), d: 1.1 };
  }
  // frame what stands: one slab sits big in the middle, the finished house fits whole
  const _dir = new THREE.Vector3();
  function autoFrame(instant = false) {
    let top = 0;
    pieces.forEach((p) => { if (p.obj.userData.built && p.kind !== 'plant') top = Math.max(top, p.level * FH + (p.kind === 'slab' ? 0 : FH)); });
    if (S.finished || S.built >= pieces.length) top = 4 * FH + 1.5;
    const H = Math.max(2.2, top);
    const target = new THREE.Vector3(0, H * 0.4, 0.6);
    const v = VIEWS.corner;
    _dir.set(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]).normalize();
    const half = THREE.MathUtils.degToRad(camera.fov) / 2;
    const fitH = (H / 2 + 1.6) / Math.tan(half);
    const fitW = 5.2 / (Math.tan(half) * camera.aspect);
    const d = Math.max(9, fitH, fitW) * (camera.aspect < 0.8 ? 1.32 : 1.08); // room for the page's header and controls
    const to = { pos: target.clone().addScaledVector(_dir, d), target };
    if (instant) { camera.position.copy(to.pos); controls.target.copy(to.target); controls.update(); return; }
    fly = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: now(), d: 1.2 };
  }
  function flyToFloor(k) {
    if (k >= 4) { autoFrame(); return; }
    const to = frameFor({ pos: [5.5, k * FH + 6.5, 8.5], target: [0, k * FH + 0.8, 0.3] });
    fly = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: now(), d: 1.0 };
  }

  // ---- edges of the screen turn the app's pages, everything else orbits
  if (onEdge) {
    el.addEventListener('pointerdown', (e) => {
      if (e.clientX < 26 || e.clientX > el.clientWidth - 26) { e.stopPropagation(); onEdge(e); }
    }, true);
  }

  function resize() {
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w < h ? 46 : 36; camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  }
  const ro = new ResizeObserver(resize); ro.observe(el);

  let last = now(), skyTick = 0, raf = 0;
  function frame() {
    raf = 0;
    if (!S.running) return;
    const t = now(), dt = Math.min(0.05, t - last); last = t;
    wind.value = t;
    if (fly) {
      const k = Math.min(1, (t - fly.t0) / fly.d), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(fly.from.pos, fly.to.pos, e);
      controls.target.lerpVectors(fly.from.target, fly.to.target, e);
      if (k >= 1) fly = null;
    }
    controls.update();
    if (camera.position.y < -0.3) camera.position.y = -0.3;
    animateDrops(t);
    people.update(dt);
    if ((skyTick += dt) > 30) { skyTick = 0; applySky(); }
    if (composer) composer.render(); else renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  resize();
  applySky();
  applyVisibility();
  autoFrame(true);

  return {
    total: pieces.length,
    pieces,
    get built() { return S.built; },
    start() { if (S.running) return; S.running = true; last = now(); applySky(); raf = requestAnimationFrame(frame); },
    stop() { S.running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    renderOnce() { controls.update(); people.update(0.016); if (composer) composer.render(); else renderer.render(scene, camera); },
    setSky(sky, pl) { S.sky = sky || null; if (pl !== undefined) S.place = pl; applySky(); },
    setHour(h) { S.hourOverride = h; applySky(); },
    // how much is built. animate: new pieces drop in one by one
    setBuilt(n, { animate = false } = {}) {
      n = Math.max(1, Math.min(pieces.length, n));
      const prev = S.built; S.built = n;
      applyVisibility();
      if (animate && n > prev && !S.finished) dropIn(prev, n);
      if (S.cut === 4) autoFrame();
    },
    setFinished(on) { S.finished = !!on; applyVisibility(); if (S.cut === 4) autoFrame(); },
    frame: autoFrame,
    get finished() { return S.finished; },
    setCut(k) { S.cut = k; applyVisibility(); flyToFloor(k); },
    view,
    resize,
    dispose() { this.stop(); ro.disconnect(); renderer.dispose(); canvas.remove(); },
    debug: { scene, camera, controls, renderer, people, house },
  };
}
