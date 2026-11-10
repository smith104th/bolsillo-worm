// The site: a 4 m gap between towers, a narrow street in front, utility poles and wires.
// Buildings between the camera and the house fade out so you can always see in.
import * as THREE from 'three';
import { facade, asphalt, rr, reseed } from './tex.js';

const SITE = { x0: -2.15, x1: 2.15, z0: -3.55, z1: 4.85 };
const STREET = 6;

export function buildCity() {
  reseed(777);
  const root = new THREE.Group();
  const towers = [];
  const emissives = [];

  const tower = (x0, x1, z0, z1, h, kind, faceAxis) => {
    const w = x1 - x0, d = z1 - z0;
    const faceW = faceAxis === 'x' ? d : w;
    const { map, emissive } = facade(kind, faceW, h);
    const side = (len) => { const t = map.clone(); t.repeat.set(len / faceW, 1); t.needsUpdate = true; return t; };
    const sideE = (len) => { const t = emissive.clone(); t.repeat.set(len / faceW, 1); t.needsUpdate = true; return t; };
    const mk = (len) => {
      const m = new THREE.MeshStandardMaterial({ map: side(len), emissiveMap: sideE(len), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.85, transparent: true, opacity: 1 });
      emissives.push(m);
      return m;
    };
    const roofM = new THREE.MeshStandardMaterial({ color: kind === 'white' ? '#cfccc5' : '#6f6a64', roughness: 0.9, transparent: true });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const matsArr = [mk(d), mk(d), roofM, roofM, mk(w), mk(w)];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matsArr);
    mesh.position.set((x0 + x1) / 2, h / 2 - 0.15, (z0 + z1) / 2);
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.userData.center = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
    mesh.userData.box = new THREE.Box3(new THREE.Vector3(x0, -0.2, z0), new THREE.Vector3(x1, h, z1));
    mesh.userData.fade = 1;
    root.add(mesh); towers.push(mesh);
    return mesh;
  };

  // north: brick-tiled tower; south: white tiled apartments; behind: dark tile; across the street: glass offices
  tower(SITE.x0 - 11, SITE.x0 - 0.05, -13, SITE.z1, 34, 'brick', 'x');
  tower(SITE.x1 + 0.05, SITE.x1 + 12, -11, SITE.z1, 31, 'white', 'x');
  tower(SITE.x0 - 0.05, SITE.x1 + 0.05, -14, SITE.z0 - 0.05, 24, 'dark', 'z');
  tower(-16, -1.5, SITE.z1 + STREET, SITE.z1 + STREET + 14, 29, 'glass', 'z');
  tower(-1.2, 13, SITE.z1 + STREET, SITE.z1 + STREET + 12, 38, 'white', 'z');
  // a few further away, for the skyline
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, r = rr(34, 60), w = rr(10, 22), d = rr(10, 22), h = rr(30, 80);
    tower(Math.cos(a) * r - w / 2, Math.cos(a) * r + w / 2, Math.sin(a) * r - d / 2, Math.sin(a) * r + d / 2, h, ['glass', 'white', 'dark', 'brick'][i % 4], 'z');
  }

  // street, sidewalk strip, yard edge
  const at = asphalt(); at.repeat.set(10, 2);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(80, STREET), new THREE.MeshStandardMaterial({ map: at, roughness: 0.95 }));
  street.rotation.x = -Math.PI / 2; street.position.set(0, -0.15, SITE.z1 + STREET / 2); street.receiveShadow = true;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: '#77787a', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.2; ground.receiveShadow = true;
  const walk = new THREE.Mesh(new THREE.BoxGeometry(80, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.9 }));
  walk.position.set(0, -0.12, SITE.z1 + 0.45); walk.receiveShadow = true;
  // white edge lines
  const lineM = new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.8 });
  for (const z of [SITE.z1 + 1.05, SITE.z1 + STREET - 0.3]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.12), lineM); l.rotation.x = -Math.PI / 2; l.position.set(0, -0.145, z); root.add(l); }
  root.add(ground, street, walk);

  // utility poles and wires (the Tokyo sky)
  const poleM = new THREE.MeshStandardMaterial({ color: '#9a9a96', roughness: 0.8 });
  const wireM = new THREE.MeshStandardMaterial({ color: '#2d2d2d', roughness: 0.7 });
  const poles = [[-7.5, SITE.z1 + 0.35], [8.5, SITE.z1 + 0.35], [24, SITE.z1 + 0.35], [-23, SITE.z1 + 0.35]];
  for (const [x, z] of poles) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 11, 10), poleM); p.position.set(x, 5.4, z); p.castShadow = true; root.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.6), poleM); arm.position.set(x, 9.6, z + 0.4); root.add(arm);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 12), poleM); tr.position.set(x + 0.35, 8.4, z); root.add(tr);
  }
  for (let i = 0; i < poles.length; i++) for (let j = i + 1; j < poles.length; j++) {
    const [ax, az] = poles[i], [bx, bz] = poles[j];
    if (Math.abs(ax - bx) > 17) continue;
    for (const [dy, dz] of [[9.6, -0.3], [9.6, 0.6], [7.9, 0.1]]) {
      const a = new THREE.Vector3(ax, dy, az + dz), b = new THREE.Vector3(bx, dy, bz + dz);
      const mid = a.clone().lerp(b, 0.5); mid.y -= 0.55;
      const c = new THREE.QuadraticBezierCurve3(a, mid, b);
      const w = new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.009, 4), wireM); root.add(w);
    }
  }
  // a wire dropping to the house's corner, like in the photos
  {
    const a = new THREE.Vector3(-7.5, 7.9, SITE.z1 + 0.2), b = new THREE.Vector3(-1.7, 6.2, SITE.z1 - 1.8);
    const mid = a.clone().lerp(b, 0.5); mid.y -= 0.6;
    root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, 0.01, 4), wireM));
  }

  const target = new THREE.Vector3(0, 5.5, 0);
  const probes = [[0, 0.3, 0], [-2, 0.3, 3.3], [2, 0.3, 3.3], [-2, 11, 3.3], [2, 11, 3.3], [0, 6, 3.3], [-2, 6, -3.3], [2, 6, -3.3], [0, 11.5, 0]].map((p) => new THREE.Vector3(...p));
  // fade any tower that sits between the camera and the house
  function update(camera, dt, focus) {
    if (focus) target.copy(focus);
    const k = 1 - Math.exp(-dt * 6);
    for (const t of towers) {
      const hit = blocks(t, camera.position);
      const goal = hit ? 0 : 1;
      t.userData.fade += (goal - t.userData.fade) * k;
      const f = t.userData.fade;
      const arr = Array.isArray(t.material) ? t.material : [t.material];
      for (const m of arr) { m.opacity = f; m.depthWrite = f > 0.97; }
      t.visible = f > 0.03;
    }
  }
  // does the tower's box intersect the segment camera → house?
  const _seg = new THREE.Vector3();
  function blocks(t, cam) {
    const b = t.userData.box;
    if (b.containsPoint(cam)) return true;
    let n = 0;
    for (const p of [target, ...probes]) {
      for (let i = 1; i < 14; i++) { _seg.copy(cam).lerp(p, i / 14); if (b.containsPoint(_seg)) { n++; break; } }
    }
    return n >= 3;
  }

  return { root, towers, emissives, update };
}
