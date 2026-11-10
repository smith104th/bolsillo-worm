// Canvas-made textures: concrete, board-formed ceilings, soil, leaves, facades.
// Everything is generated on the phone so the page ships no image files.
import * as THREE from 'three';

let seed = 20111;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const rr = (a, b) => a + (b - a) * rnd();
export const reseed = (s) => { seed = s; };

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// soft mottling: many faint blotches + fine grain
function mottle(g, w, h, base, { blot = 260, grain = 9000, dark = 0.05, light = 0.05 } = {}) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < blot; i++) {
    const x = rnd() * w, y = rnd() * h, r = rr(8, 70);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const d = rnd() < 0.5;
    gr.addColorStop(0, d ? `rgba(60,58,54,${dark * rnd()})` : `rgba(255,255,252,${light * rnd()})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < grain; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${0.05 * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, 1, 1);
  }
}

// Fair-faced concrete for columns and slab edges: smooth, with form-tie holes on a 600 x 450 grid.
export function concrete() {
  const [c, g] = canvas(512);
  mottle(g, 512, 512, '#b3b1ac', { blot: 340, dark: 0.09 });
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 512, w = rr(1, 6), h = rr(40, 300), y = rr(-40, 200);
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, `rgba(70,68,62,${rr(0.04, 0.12)})`); gr.addColorStop(1, 'rgba(70,68,62,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  g.strokeStyle = 'rgba(80,78,72,0.10)'; g.lineWidth = 1;
  for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(0, i * 256); g.lineTo(512, i * 256); g.stroke(); }
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.stroke();
  for (let x = 64; x < 512; x += 128) for (let y = 64; y < 512; y += 128) {
    g.fillStyle = 'rgba(90,88,82,0.35)'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(x - 1, y - 1, 1.6, 0, 7); g.fill();
  }
  return tex(c, { repeat: [1, 1] });
}

// Exposed slab soffit: lighter, with plywood formwork joints (900 x 1800 panels).
export function ceiling() {
  const [c, g] = canvas(512);
  mottle(g, 512, 512, '#c9c6c0', { blot: 300, dark: 0.06 });
  g.strokeStyle = 'rgba(70,68,62,0.12)'; g.lineWidth = 1.2;
  for (let x = 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  for (let y = 0; y <= 512; y += 256) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  return tex(c);
}

// Floors: pale trowelled mortar.
export function floor() {
  const [c, g] = canvas(512);
  mottle(g, 512, 512, '#d3d1cc', { blot: 220, dark: 0.045, light: 0.07, grain: 6000 });
  // trowel arcs
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.05 * rnd()})`; g.lineWidth = rr(4, 14);
    g.beginPath(); const x = rnd() * 512, y = rnd() * 512, r = rr(30, 90), a = rnd() * 6;
    g.arc(x, y, r, a, a + rr(0.4, 1.2)); g.stroke();
  }
  return tex(c);
}

// Roof: white waterproof coating.
export function roof() {
  const [c, g] = canvas(256);
  mottle(g, 256, 256, '#ecebe7', { blot: 120, dark: 0.04, light: 0.02, grain: 2500 });
  return tex(c);
}

export function soil() {
  const [c, g] = canvas(256);
  g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(30,22,16,${0.5 * rnd()})` : v < 0.85 ? `rgba(110,88,66,${0.45 * rnd()})` : `rgba(170,160,140,${0.6 * rnd()})`;
    const s = rr(1, 3.5); g.fillRect(rnd() * 256, rnd() * 256, s, s);
  }
  return tex(c);
}

export function asphalt() {
  const [c, g] = canvas(256);
  g.fillStyle = '#5c5d5f'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = rnd() < 0.5 ? 20 : 150; g.fillStyle = `rgba(${v},${v},${v},${0.18 * rnd()})`; g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5); }
  return tex(c);
}

export function terracotta() {
  const [c, g] = canvas(128);
  mottle(g, 128, 128, '#a8644a', { blot: 60, dark: 0.12, light: 0.06, grain: 1500 });
  return tex(c);
}

// Leaf sprites (alpha), 4 x 2 cells of 256 px. Drawn pale so instance colours tint them.
// 0 broad · 1 narrow blade · 2 huge (strelitzia/banana) · 3 small leaflets · 4 split philodendron
// 5 schefflera umbrella · 6 fan palm · 7 ivy strand
export function leafAtlas() {
  const [c, g] = canvas(1024, 512);
  g.clearRect(0, 0, 1024, 512);
  const cell = 256;
  const at = (i) => [(i % 4) * cell, Math.floor(i / 4) * cell];
  const grad = (w) => { const gr = g.createLinearGradient(-w, 0, w, 0); gr.addColorStop(0, '#c8d6be'); gr.addColorStop(0.5, '#f4f8ee'); gr.addColorStop(1, '#b9c9ae'); return gr; };
  const blade = (w, L, tip) => { g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(w, -L * 0.2, w * 0.9, -L * tip, 0, -L); g.bezierCurveTo(-w * 0.9, -L * tip, -w, -L * 0.2, 0, 0); };
  const drawLeaf = (i, w, tip, veins) => {
    const [ox, oy] = at(i);
    g.save(); g.translate(ox + cell / 2, oy + cell - 8);
    const L = cell - 20;
    g.fillStyle = grad(w); blade(w, L, tip); g.fill();
    g.strokeStyle = 'rgba(120,140,100,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L * 0.97); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(130,150,110,0.35)';
    for (let k = 1; k < veins; k++) {
      const y = -L * (k / veins) * 0.95;
      for (const sd of [1, -1]) { g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(sd * w * 0.35, y - 8, sd * w * 0.7 * Math.sin(Math.PI * k / veins), y - 22); g.stroke(); }
    }
    g.restore();
  };
  drawLeaf(0, 70, 0.75, 7);
  drawLeaf(1, 26, 0.85, 3);
  drawLeaf(2, 110, 0.6, 12);
  { // 3 leaflets on a stem
    const [ox, oy] = at(3);
    g.save(); g.translate(ox, oy);
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (k - 4) * 0.28, r = 40 + (k % 3) * 30;
      g.save(); g.translate(cell / 2 + Math.cos(a) * r * 0.6, cell - 30 + Math.sin(a) * r * 1.3); g.rotate(a + Math.PI / 2);
      g.fillStyle = k % 2 ? '#eef4e6' : '#d9e5cd'; g.beginPath(); g.ellipse(0, 0, 13, 30, 0, 0, 7); g.fill(); g.restore();
    }
    g.strokeStyle = 'rgba(140,130,110,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cell / 2, cell - 10); g.lineTo(cell / 2, 60); g.stroke();
    g.restore();
  }
  { // 4 split philodendron / monstera: a broad leaf with deep cuts from the edge
    const [ox, oy] = at(4);
    g.save(); g.translate(ox + cell / 2, oy + cell - 8);
    const L = cell - 16, w = 118;
    g.fillStyle = grad(w); blade(w, L, 0.62); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 7; k++) {
      const y = -L * (0.16 + k * 0.11);
      for (const sd of [1, -1]) {
        g.beginPath(); g.moveTo(sd * 8, y - 4); g.quadraticCurveTo(sd * 60, y - 22, sd * 130, y - 40); g.lineTo(sd * 130, y - 52); g.quadraticCurveTo(sd * 60, y - 30, sd * 10, y - 8); g.closePath(); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(120,140,100,0.6)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L * 0.95); g.stroke();
    g.restore();
  }
  { // 5 schefflera: 8 leaflets fanned around one point (the cell centre)
    const [ox, oy] = at(5);
    g.save(); g.translate(ox + cell / 2, oy + cell / 2);
    for (let k = 0; k < 8; k++) {
      g.save(); g.rotate((k / 8) * Math.PI * 2 + 0.2);
      g.fillStyle = k % 2 ? '#eef4e6' : '#dbe6cf';
      g.beginPath(); g.moveTo(0, -6); g.bezierCurveTo(26, -40, 22, -100, 0, -120); g.bezierCurveTo(-22, -100, -26, -40, 0, -6); g.fill();
      g.strokeStyle = 'rgba(120,140,100,0.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -6); g.lineTo(0, -115); g.stroke();
      g.restore();
    }
    g.restore();
  }
  { // 6 fan palm: narrow segments spread from the bottom centre
    const [ox, oy] = at(6);
    g.save(); g.translate(ox + cell / 2, oy + cell - 10);
    for (let k = 0; k < 19; k++) {
      const a = -Math.PI / 2 + (k - 9) * 0.16;
      g.save(); g.rotate(a + Math.PI / 2);
      g.fillStyle = k % 2 ? '#eef4e6' : '#d6e2ca';
      g.beginPath(); g.moveTo(-3, -10); g.lineTo(0, -232); g.lineTo(3, -10); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(0, -130, 9, 100, 0, 0, 7); g.fill();
      g.restore();
    }
    g.restore();
  }
  { // 7 ivy strand: small leaves alternating down a thin stem
    const [ox, oy] = at(7);
    g.save(); g.translate(ox + cell / 2, oy);
    g.strokeStyle = 'rgba(120,110,90,0.8)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, 4); g.bezierCurveTo(10, 80, -10, 170, 4, 252); g.stroke();
    for (let k = 0; k < 13; k++) {
      const y = 10 + k * 19, sd = k % 2 ? 1 : -1;
      g.save(); g.translate(sd * 4, y); g.rotate(sd * 0.9);
      g.fillStyle = k % 3 ? '#eef4e6' : '#d6e2ca';
      g.beginPath(); g.ellipse(sd * 12, 0, 15, 10, 0, 0, 7); g.fill();
      g.restore();
    }
    g.restore();
  }
  const t = tex(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Neighbour facades: brick tile tower, white tiled apartment, glass office. Returns { map, emissive }.
export function facade(kind, wM, hM) {
  const W = 512, H = Math.min(2048, Math.round(512 * hM / wM / 2) * 2);
  const [c, g] = canvas(W, H);
  const [e, ge] = canvas(W, H);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const px = W / wM;
  const floorH = 3.1 * px;
  if (kind === 'brick') {
    g.fillStyle = '#93705f'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 4) for (let x = (y / 4) % 2 ? 0 : 6; x < W; x += 12) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '40,20,10' : '200,140,110'},${0.18 * rnd()})`; g.fillRect(x, y, 11, 3);
    }
  } else if (kind === 'white') {
    g.fillStyle = '#dedbd4'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 6) { g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(0, y, W, 1); }
  } else if (kind === 'dark') {
    g.fillStyle = '#3d4247'; g.fillRect(0, 0, W, H);
  } else {
    g.fillStyle = '#9aa7ad'; g.fillRect(0, 0, W, H);
  }
  const rows = Math.floor(H / floorH);
  for (let r = 0; r < rows; r++) {
    const y = H - (r + 1) * floorH;
    if (kind === 'brick' || kind === 'white' || kind === 'dark') {
      // punched windows with frames and balconies on the white one
      const n = Math.max(2, Math.round(wM / 3.4));
      for (let i = 0; i < n; i++) {
        const x0 = (i + 0.18) * (W / n), ww = (W / n) * 0.64, wy = y + floorH * 0.22, wh = floorH * 0.55;
        g.fillStyle = kind === 'white' ? '#3e4b55' : '#2a3138';
        g.fillRect(x0, wy, ww, wh);
        g.fillStyle = 'rgba(170,190,205,0.35)'; g.fillRect(x0 + 2, wy + 2, ww * 0.45, wh - 4);
        g.fillStyle = kind === 'white' ? '#f2f0ea' : '#cfcac2'; g.fillRect(x0 + ww * 0.49, wy, 2, wh);
        g.fillRect(x0 - 2, wy - 2, ww + 4, 2); g.fillRect(x0 - 2, wy + wh, ww + 4, 3);
        if (kind === 'white') { g.fillStyle = 'rgba(40,46,52,0.55)'; for (let k = 0; k < ww; k += 5) g.fillRect(x0 + k, wy + wh * 0.62, 1, wh * 0.38); }
        if (rnd() < 0.32) {
          const warm = rnd() < 0.8;
          ge.fillStyle = warm ? `rgb(${255},${200 + rnd() * 40},${130 + rnd() * 50})` : 'rgb(200,225,255)';
          ge.globalAlpha = rr(0.45, 1); ge.fillRect(x0, wy, ww, wh); ge.globalAlpha = 1;
          if (rnd() < 0.5) { ge.fillStyle = 'rgba(0,0,0,0.5)'; ge.fillRect(x0 + ww * rr(0.1, 0.6), wy, ww * 0.25, wh); }
        }
      }
    } else {
      // curtain wall
      g.fillStyle = 'rgba(30,40,46,0.7)'; g.fillRect(0, y + 3, W, floorH - 6);
      for (let x = 0; x < W; x += px * 1.5) { g.fillStyle = '#c7cdd0'; g.fillRect(x, y, 2, floorH); }
      g.fillStyle = '#c7cdd0'; g.fillRect(0, y, W, 3);
      for (let x = 0; x < W; x += px * 1.5) if (rnd() < 0.4) { ge.fillStyle = 'rgb(230,235,255)'; ge.globalAlpha = rr(0.3, 0.8); ge.fillRect(x + 2, y + 3, px * 1.5 - 2, floorH - 6); ge.globalAlpha = 1; }
    }
  }
  return { map: tex(c), emissive: tex(e) };
}
