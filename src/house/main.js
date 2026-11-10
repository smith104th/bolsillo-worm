// Garden and House: a live 3D model. Standalone dev page (docs/house/), later a page in the app.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildHouse, FH, SW, SD } from './model.js';
import { buildCity } from './city.js';
import { wind } from './plants.js';
import { sunAt, tokyoDate, tokyoHours } from './sun.js';

const q = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);

// ---- renderer, scene, camera
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 900);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 2.5; controls.maxDistance = 42;
controls.maxPolarAngle = Math.PI * 0.56;
controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.9;
controls.target.set(0, 5.2, 0.6);

// ---- sky dome
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: {
    uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uStars: { value: 0 }, uTime: { value: 0 },
  },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `uniform vec3 uTop,uHorizon,uGround,uSunCol,uSunDir; uniform float uStars,uTime; varying vec3 vDir;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      vec3 col = mix(uHorizon, uTop, pow(clamp(h,0.0,1.0), 0.5));
      col = mix(col, uGround, smoothstep(0.0, -0.12, h));
      float s = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSunCol * (pow(s, 900.0) * 14.0 + pow(s, 14.0) * 0.28);
      if (uStars > 0.0) { vec3 q = floor(d * 380.0); float r = hash(q); float st = step(0.9972, r);
        col += vec3(st) * uStars * smoothstep(0.08, 0.35, h) * (0.55 + 0.45 * sin(uTime * 1.7 + r * 60.0)); }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
sky.frustumCulled = false;
scene.add(sky);
scene.fog = new THREE.Fog('#cfe2f0', 60, 260);

// ---- lights
const sun = new THREE.DirectionalLight('#ffffff', 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 13, bottom: -9, near: 1, far: 90 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
sun.target.position.set(0, 5, 0);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#cfe6ff', '#8a8378', 1);
scene.add(hemi);
const roomLights = [0, 1, 2, 3].map((L) => {
  const l = new THREE.PointLight('#ffc78a', 0, 6, 2);
  l.position.set(0.1, L * FH + 2.25, 0.4);
  scene.add(l);
  return l;
});

// ---- the site and the house
const city = buildCity();
scene.add(city.root);
const house = buildHouse();
scene.add(house.root);
const pieces = house.pieces;
for (const p of pieces) { p.obj.userData.baseY = p.obj.position.y; p.obj.userData.baseS = p.obj.scale.x; }

// ---- state: time of day, cutaway floor, build progress
const S = {
  hour: q.has('t') ? +q.get('t') : tokyoHours(),
  live: !q.has('t'),
  cut: q.has('cut') ? +q.get('cut') : 4,
  built: q.has('build') ? Math.min(+q.get('build'), pieces.length) : pieces.length,
};

const KEYS = [ // altitude (deg) → sky and light
  { a: -18, top: '#03060f', hor: '#0b1226', gnd: '#05070c', sun: '#000000', hemiS: '#22304f', hemiG: '#0b0b0d', hemi: 0.22, env: 0.08, exp: 1.25, fog: '#0b1226' },
  { a: -7, top: '#14234a', hor: '#5b5f86', gnd: '#141824', sun: '#000000', hemiS: '#3b4a78', hemiG: '#16161a', hemi: 0.35, env: 0.18, exp: 1.15, fog: '#3a4062' },
  { a: -1, top: '#3c5f9e', hor: '#f0a37c', gnd: '#3a3a40', sun: '#ff8a4a', hemiS: '#8aa0d0', hemiG: '#4d4440', hemi: 0.55, env: 0.35, exp: 1.05, fog: '#d9a088' },
  { a: 6, top: '#5a8fd6', hor: '#ffd1a1', gnd: '#5a5650', sun: '#ffb070', hemiS: '#b9d0f0', hemiG: '#6e6458', hemi: 0.5, env: 0.45, exp: 1.05, fog: '#f0d2b4' },
  { a: 22, top: '#4a8fe0', hor: '#cfe4f5', gnd: '#6d6a64', sun: '#fff1dc', hemiS: '#cfe4ff', hemiG: '#7d776d', hemi: 0.55, env: 0.55, exp: 1.0, fog: '#cfe2f0' },
  { a: 70, top: '#3b84e6', hor: '#d5e9fa', gnd: '#6d6a64', sun: '#ffffff', hemiS: '#d6e9ff', hemiG: '#7d776d', hemi: 0.6, env: 0.6, exp: 0.95, fog: '#d5e9fa' },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function lerpKey(alt) {
  let i = 0; while (i < KEYS.length - 2 && alt > KEYS[i + 1].a) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = THREE.MathUtils.clamp((alt - A.a) / (B.a - A.a), 0, 1);
  const col = (k) => _ca.set(A[k]).lerp(_cb.set(B[k]), t).clone();
  const num = (k) => A[k] + (B[k] - A[k]) * t;
  return { top: col('top'), hor: col('hor'), gnd: col('gnd'), sun: col('sun'), hemiS: col('hemiS'), hemiG: col('hemiG'), hemi: num('hemi'), env: num('env'), exp: num('exp'), fog: col('fog') };
}

const sunDir = new THREE.Vector3();
let night = 0;
function applyTime() {
  const { alt, az } = sunAt(tokyoDate(S.hour));
  const deg = alt * 180 / Math.PI;
  // north = -x, east = -z, south = +x, west = +z (the street faces west)
  const n = Math.cos(alt) * Math.cos(az), e = Math.cos(alt) * Math.sin(az);
  sunDir.set(-n, Math.sin(alt), -e).normalize();
  const k = lerpKey(deg);
  const U = sky.material.uniforms;
  U.uTop.value.copy(k.top); U.uHorizon.value.copy(k.hor); U.uGround.value.copy(k.gnd);
  U.uSunDir.value.copy(sunDir); U.uSunCol.value.copy(k.sun).multiplyScalar(deg > -3 ? 1 : 0);
  night = THREE.MathUtils.smoothstep(-deg, -4, 8);
  U.uStars.value = THREE.MathUtils.smoothstep(-deg, 6, 14);
  scene.fog.color.copy(k.fog);
  hemi.color.copy(k.hemiS); hemi.groundColor.copy(k.hemiG); hemi.intensity = k.hemi;
  scene.environmentIntensity = k.env;
  renderer.toneMappingExposure = k.exp;
  const up = THREE.MathUtils.smoothstep(deg, -1, 12);
  sun.intensity = 3.2 * up; sun.color.copy(k.sun);
  sun.visible = up > 0.001;
  sun.position.copy(sunDir).multiplyScalar(40).add(sun.target.position);
  // lights on inside, neighbours' windows, curtains glow
  const lampsOn = THREE.MathUtils.smoothstep(-deg, -6, 2);
  roomLights.forEach((l) => { l.intensity = 7 * lampsOn; });
  house.mats.lamp.emissiveIntensity = 3 * lampsOn;
  house.mats.curtain.emissiveIntensity = 0.32 * lampsOn;
  city.emissives.forEach((m) => { m.emissiveIntensity = 1.1 * lampsOn; });
  const hh = Math.floor(S.hour), mm = Math.floor((S.hour - hh) * 60);
  $('#time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('#tlabel').textContent = S.live ? 'Tokyo, now' : 'Tokyo';
  $('#sun').value = S.hour;
}

// ---- visibility: built pieces, cut at a floor
const now = () => performance.now() / 1000;
function applyVisibility(animateFrom = -1) {
  pieces.forEach((p, i) => {
    const built = i < S.built;
    const show = built && p.level <= S.cut;
    p.obj.visible = show;
    if (built && i >= animateFrom && animateFrom >= 0) p.obj.userData.appear = now();
  });
  document.querySelectorAll('[data-cut]').forEach((b) => b.classList.toggle('on', +b.dataset.cut === S.cut));
  $('#bcount').textContent = `${S.built} / ${pieces.length}`;
  $('#build').value = S.built;
  $('#bname').textContent = S.built ? pieces[S.built - 1].name : 'Empty lot';
}
function animatePieces() {
  const t = now();
  for (const p of pieces) {
    const a = p.obj.userData.appear;
    if (a == null) continue;
    const k = Math.min(1, (t - a) / 0.7);
    const e = 1 - Math.pow(1 - k, 3);
    p.obj.position.y = p.obj.userData.baseY + (1 - e) * 1.2;
    if (k >= 1) { p.obj.position.y = p.obj.userData.baseY; p.obj.userData.appear = null; }
  }
}

// ---- views
const VIEWS = {
  street: { pos: [-0.6, 1.4, 10.4], target: [0, 6.2, 0] },
  corner: { pos: [7.5, 6.5, 13], target: [0, 5.4, 0.6] },
  aerial: { pos: [3, 26, 14], target: [0, 7.5, 0] },
  side: { pos: [13, 6.5, 2.5], target: [0, 5.6, 0.4] },
  roof: { pos: [5.5, 15.5, 7.5], target: [0.4, 11, 1] },
};
let fly = null;
function goView(name, instant = false) {
  const v = VIEWS[name]; if (!v) return;
  const to = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target) };
  // tall phone screens need to stand further back to fit the building
  const k = camera.aspect < 0.8 ? 1.45 : 1;
  to.pos.sub(to.target).multiplyScalar(k).add(to.target);
  if (instant) { camera.position.copy(to.pos); controls.target.copy(to.target); controls.update(); return; }
  fly = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: now(), d: 1.1 };
}
function flyCut(k) {
  if (k >= 4) return;
  const y = k * FH;
  const to = { pos: new THREE.Vector3(5.5, y + 6.5, 8.5), target: new THREE.Vector3(0, y + 0.8, 0.3) };
  const f = camera.aspect < 0.8 ? 1.45 : 1;
  to.pos.sub(to.target).multiplyScalar(f).add(to.target);
  fly = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: now(), d: 1.0 };
}

// ---- UI
$('#sun').addEventListener('input', (e) => { S.hour = +e.target.value; S.live = false; applyTime(); });
$('#nowbtn').addEventListener('click', () => { S.hour = tokyoHours(); S.live = true; applyTime(); });
document.querySelectorAll('[data-cut]').forEach((b) => b.addEventListener('click', () => { S.cut = +b.dataset.cut; applyVisibility(); flyCut(S.cut); }));
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { if (S.cut !== 4) { S.cut = 4; applyVisibility(); } goView(b.dataset.view); }));
$('#build').max = pieces.length;
$('#build').addEventListener('input', (e) => { const prev = S.built; S.built = +e.target.value; applyVisibility(S.built > prev ? prev : -1); });
$('#addone').addEventListener('click', () => { if (S.built < pieces.length) { S.built++; applyVisibility(S.built - 1); } });
$('#buildtoggle').addEventListener('click', () => document.body.classList.toggle('building'));
if (q.has('build')) document.body.classList.add('building');

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 46 : 36;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

goView(q.get('view') || 'corner', true);
if (S.cut < 4) { flyCut(S.cut); fly.d = 0.001; }
applyTime();
applyVisibility();

// ---- loop
let last = now(), liveTick = 0;
function frame() {
  const t = now(), dt = Math.min(0.05, t - last); last = t;
  wind.value = t;
  sky.material.uniforms.uTime.value = t;
  if (fly) {
    const k = Math.min(1, (t - fly.t0) / fly.d), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(fly.from.pos, fly.to.pos, e);
    controls.target.lerpVectors(fly.from.target, fly.to.target, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  if (camera.position.y < 0.3) camera.position.y = 0.3;
  city.update(camera, dt, controls.target);
  animatePieces();
  if (S.live && (liveTick += dt) > 30) { liveTick = 0; S.hour = tokyoHours(); applyTime(); }
  renderer.render(scene, camera);
  frames++;
  if (!STILL || frames < 3) requestAnimationFrame(frame);
}
const STILL = q.has('still');
let frames = 0;
document.body.classList.add('ready');
requestAnimationFrame(frame);

window.__house = { frame: () => { frames = 0; requestAnimationFrame(frame); }, scene, camera, controls, renderer, S, pieces, goView, applyTime, applyVisibility, setHour: (h) => { S.hour = h; S.live = false; applyTime(); }, info: () => renderer.info, dims: { SW, SD, FH } };
