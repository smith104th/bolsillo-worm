// node build.mjs → docs/ (served by GitHub Pages)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { compileDeck } from './src/design/compile.mjs';

const cfg = existsSync('config.json') ? JSON.parse(readFileSync('config.json', 'utf8')) : {};
const OUT = 'docs';
rmSync(OUT, { recursive: true, force: true });
for (const d of [OUT, `${OUT}/fonts`, `${OUT}/icons`]) mkdirSync(d, { recursive: true });

// Garden & House: its own bundles so the app only loads three.js when the House tab opens.
// house/view.js = what the app imports; house/ = the dev page around the same view.
mkdirSync(`${OUT}/house`, { recursive: true });
const houseOpts = { bundle: true, format: 'esm', minify: true, write: false, target: ['es2020', 'safari15'], logLevel: 'error' };
const hView = (await build({ ...houseOpts, entryPoints: ['src/house/entry.js'] })).outputFiles[0].text;
const hDev = (await build({ ...houseOpts, entryPoints: ['src/house/dev.js'] })).outputFiles[0].text;
const HOUSE_V = createHash('sha1').update(hView).digest('hex').slice(0, 8);
writeFileSync(`${OUT}/house/view.js`, hView);
writeFileSync(`${OUT}/house/dev.js`, hDev);
writeFileSync(`${OUT}/house/index.html`, readFileSync('src/house/index.html', 'utf8').replaceAll('__HVERSION__', createHash('sha1').update(hDev).digest('hex').slice(0, 8)));
console.log(`built ${OUT}/house/ · v${HOUSE_V} · view.js ${(hView.length / 1024).toFixed(0)}KB`);

// Design Tinder: the deck (src/design/deck.txt + photos.txt) as one JSON file the page fetches
mkdirSync(`${OUT}/design`, { recursive: true });
const deckJson = JSON.stringify(compileDeck());
const DECK_V = createHash('sha1').update(deckJson).digest('hex').slice(0, 8);
const DECK_URL = `./design/deck.json?v=${DECK_V}`;
writeFileSync(`${OUT}/design/deck.json`, deckJson);
console.log(`built ${OUT}/design/ · v${DECK_V} · deck.json ${(deckJson.length / 1024).toFixed(0)}KB`);

const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'esm', minify: true, sourcemap: false, write: false,
  target: ['es2020', 'safari15'],
  define: {
    __SUPABASE_URL__: JSON.stringify(cfg.supabaseUrl || ''),
    __SUPABASE_KEY__: JSON.stringify(cfg.supabaseKey || ''),
    __VAPID_PUBLIC__: JSON.stringify(cfg.vapidPublicKey || ''),
    __VERSION__: '"dev"',
    __HOUSE__: JSON.stringify(`./house/view.js?v=${HOUSE_V}`),
    __DECK__: JSON.stringify(DECK_URL),
  },
});
const js = res.outputFiles[0].text;
const css = readFileSync('src/styles.css', 'utf8');
const version = createHash('sha1').update(js + css + DECK_V).digest('hex').slice(0, 8);
writeFileSync(`${OUT}/app.js`, js.replace('"dev"', JSON.stringify(version)));
writeFileSync(`${OUT}/styles.css`, css);
writeFileSync(`${OUT}/index.html`, readFileSync('src/index.html', 'utf8').replaceAll('__VERSION__', version));
writeFileSync(`${OUT}/sw.js`, readFileSync('src/sw.js', 'utf8').replaceAll('__VERSION__', version).replaceAll('__DECK__', DECK_URL));
copyFileSync('src/manifest.webmanifest', `${OUT}/manifest.webmanifest`);
writeFileSync(`${OUT}/.nojekyll`, '');
// /deck/: a page to look through every Design Tinder card (reads design/deck.json, same photos as the app).
mkdirSync(`${OUT}/deck`, { recursive: true });
writeFileSync(`${OUT}/deck/index.html`, readFileSync('src/deck/index.html', 'utf8'));

const fonts = {
  'geist.woff2': '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
  'geist-mono.woff2': '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2',
  // the game names on the Games page (Manu: a display serif)
  'instrument-serif.woff2': '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2',
};
for (const [to, from] of Object.entries(fonts)) copyFileSync(`node_modules/${from}`, `${OUT}/fonts/${to}`);

// The app icon and share image are the pocket's sky: Manu's gradient, the two soft glows and the fine grain,
// edge to edge. Same recipe as makeSky() in src/draw.js. The worm drawing stays as the in-app logo.
const SKY = { top: [0x6F, 0xBE, 0xFF], mid: [0xB7, 0xE0, 0xFF], bottom: [0xEE, 0xF6, 0xFF] };
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
async function skyPNG(W, H, file, { jpeg = false } = {}) {
  const R = Math.max(W, H);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex(SKY.top)}"/><stop offset="0.55" stop-color="${hex(SKY.mid)}"/><stop offset="1" stop-color="${hex(SKY.bottom)}"/></linearGradient>
      <radialGradient id="b1" gradientUnits="userSpaceOnUse" cx="${W * 0.22}" cy="${H * 0.78}" r="${R * 0.95}"><stop offset="0" stop-color="${hex(SKY.bottom)}" stop-opacity="0.5"/><stop offset="1" stop-color="${hex(SKY.bottom)}" stop-opacity="0"/></radialGradient>
      <radialGradient id="b2" gradientUnits="userSpaceOnUse" cx="${W * 0.85}" cy="${H * 0.18}" r="${R * 0.8}"><stop offset="0" stop-color="${hex(SKY.top)}" stop-opacity="0.35"/><stop offset="1" stop-color="${hex(SKY.top)}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#b1)"/><rect width="${W}" height="${H}" fill="url(#b2)"/>
  </svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // fine grain, seeded so builds are stable; a touch finer on small icons
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const amp = W < 300 ? 9 : 14;
  for (let i = 0; i < data.length; i += 3) {
    const n = (rnd() - 0.5) * amp;
    for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, data[i + k] + n));
  }
  const img = sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } });
  await (jpeg ? img.jpeg({ quality: 82, mozjpeg: true }) : img.png()).toFile(file);
}
await skyPNG(512, 512, `${OUT}/icons/icon-512.png`);
await skyPNG(192, 192, `${OUT}/icons/icon-192.png`);
await skyPNG(180, 180, `${OUT}/icons/apple-touch-icon.png`);
await skyPNG(512, 512, `${OUT}/icons/icon-maskable-512.png`);
await skyPNG(1200, 630, `${OUT}/og.jpg`, { jpeg: true });
await skyPNG(64, 64, `${OUT}/icons/favicon-64.png`);
// the worm drawing lives on as the in-app logo
await sharp(readFileSync('src/icon.svg')).resize(192, 192).png().toFile(`${OUT}/icons/logo-192.png`);
// monochrome badge for Android's status bar
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M30 70c0-14-6-20-10-26-6-8 0-18 10-17 8 1 12 7 20 3" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><ellipse cx="34" cy="74" rx="20" ry="8" fill="#fff"/></svg>`;
await sharp(Buffer.from(badge)).resize(96, 96).png().toFile(`${OUT}/icons/badge-96.png`);

// Garden & House: standalone 3D page at /house/ (dev). Its own bundle so the app doesn't carry three.js.

console.log(`built ${OUT}/ · v${version} · app.js ${(js.length / 1024).toFixed(0)}KB · ${cfg.supabaseUrl ? 'live' : 'demo-only (no config.json)'}`);
