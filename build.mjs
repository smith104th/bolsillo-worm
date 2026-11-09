// node build.mjs → docs/ (served by GitHub Pages)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const cfg = existsSync('config.json') ? JSON.parse(readFileSync('config.json', 'utf8')) : {};
const OUT = 'docs';
rmSync(OUT, { recursive: true, force: true });
for (const d of [OUT, `${OUT}/fonts`, `${OUT}/icons`]) mkdirSync(d, { recursive: true });

const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'esm', minify: true, sourcemap: false, write: false,
  target: ['es2020', 'safari15'],
  define: {
    __SUPABASE_URL__: JSON.stringify(cfg.supabaseUrl || ''),
    __SUPABASE_KEY__: JSON.stringify(cfg.supabaseKey || ''),
    __VAPID_PUBLIC__: JSON.stringify(cfg.vapidPublicKey || ''),
    __VERSION__: '"dev"',
  },
});
const js = res.outputFiles[0].text;
const css = readFileSync('src/styles.css', 'utf8');
const version = createHash('sha1').update(js + css).digest('hex').slice(0, 8);
writeFileSync(`${OUT}/app.js`, js.replace('"dev"', JSON.stringify(version)));
writeFileSync(`${OUT}/styles.css`, css);
writeFileSync(`${OUT}/index.html`, readFileSync('src/index.html', 'utf8').replaceAll('__VERSION__', version));
writeFileSync(`${OUT}/sw.js`, readFileSync('src/sw.js', 'utf8').replaceAll('__VERSION__', version));
copyFileSync('src/manifest.webmanifest', `${OUT}/manifest.webmanifest`);
writeFileSync(`${OUT}/.nojekyll`, '');

const fonts = {
  'geist.woff2': '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
  'geist-mono.woff2': '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2',
};
for (const [to, from] of Object.entries(fonts)) copyFileSync(`node_modules/${from}`, `${OUT}/fonts/${to}`);

const icon = readFileSync('src/icon.svg');
await sharp(icon).resize(512, 512).png().toFile(`${OUT}/icons/icon-512.png`);
await sharp(icon).resize(192, 192).png().toFile(`${OUT}/icons/icon-192.png`);
await sharp(icon).resize(180, 180).png().toFile(`${OUT}/icons/apple-touch-icon.png`);
// maskable: worm a bit smaller inside the safe zone
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#A3BEDD' } })
  .composite([{ input: await sharp(icon).resize(420, 420).png().toBuffer(), top: 46, left: 46 }]).png().toFile(`${OUT}/icons/icon-maskable-512.png`);
// monochrome badge for Android's status bar
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M30 70c0-14-6-20-10-26-6-8 0-18 10-17 8 1 12 7 20 3" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><ellipse cx="34" cy="74" rx="20" ry="8" fill="#fff"/></svg>`;
await sharp(Buffer.from(badge)).resize(96, 96).png().toFile(`${OUT}/icons/badge-96.png`);

console.log(`built ${OUT}/ · v${version} · app.js ${(js.length / 1024).toFixed(0)}KB · ${cfg.supabaseUrl ? 'live' : 'demo-only (no config.json)'}`);
