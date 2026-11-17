// Walks the built app (docs/) in ?demo, a pretend partner and no server, the way a person would:
// the pocket's four tabs, the shelf, the Games page and every game, by day and at night.
// Fails on any page error, any console error (except outside hosts, which are blocked so the walk
// never depends on them), or a page or game that doesn't come up with its own name on it.
// Screenshots of failures go to test-results/.
//   node test/walk.test.mjs   (needs Chromium: `npx playwright install chromium`, or PW_CHROMIUM=/path/to/chrome)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../docs/', import.meta.url));
const SHOTS = 'test-results';
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};

// a static server for docs/ on a free port
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// in the page: is this screen on screen (not slid off to a side), with this text on it?
const showing = ([sel, re]) => {
  const el = document.querySelector(sel);
  if (!el) return `${sel} isn't there`;
  const r = el.getBoundingClientRect();
  // a game slides in with a CSS transition (games.js GameStack); with no GPU the house's first
  // frames are so slow that the slide can lag far behind, so for games the end position the app
  // set counts too
  const slidIn = el.style.visibility === 'visible' && /^translate3d\(0(px)?,/.test(el.style.transform);
  if (!slidIn && (Math.abs(r.left) > 4 || r.width < 300)) return `${sel} isn't on screen (left ${Math.round(r.left)}, width ${Math.round(r.width)})`;
  if (!new RegExp(re, 'i').test(el.innerText)) return `${sel} doesn't say /${re}/`;
  return true;
};
const sheetOpen = () => (document.querySelectorAll('.sheet').length ? true : 'no sheet opened');
const tap = (label) => `(() => { const b = [...document.querySelectorAll('#dock button')].find((x) => x.textContent.trim().toLowerCase().startsWith('${label}')); if (!b) throw new Error('no ${label} tab'); b.click(); })()`;

const GAMES = [['soil', 'Soil'], ['design', 'Design Tinder'], ['art', 'Art Tinder'], ['letters', 'Five Letters'], ['house', 'Garden']];

async function walk(browser, label, query, { tabs }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1[:/])/, (r) => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('bw:welcomed', 'true'));
  const page = await ctx.newPage();
  const problems = [];
  let step = 'opening';
  page.on('pageerror', (e) => problems.push(`${label} · ${step}: page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`${label} · ${step}: console error: ${m.text()}`);
  });

  // run a step, then wait until it shows (checking every 250 ms, up to `max` ms)
  async function check(name, run, test, arg, max = 5000) {
    step = name;
    try {
      if (run) await page.evaluate(run);
      const until = Date.now() + max;
      let ok;
      do { await page.waitForTimeout(250); ok = await page.evaluate(test, arg); } while (ok !== true && Date.now() < until);
      if (ok !== true) throw new Error(ok);
      await page.waitForTimeout(300); // let it settle before the next step
      console.log(`ok   ${label} · ${name}`);
    } catch (e) {
      problems.push(`${label} · ${name}: ${e.message.split('\n')[0]}`);
      console.log(`FAIL ${label} · ${name}`);
      await page.screenshot({ path: `${SHOTS}/${label}-${name}.png` }).catch(() => {});
    }
  }

  await page.goto(BASE + query, { waitUntil: 'networkidle' });
  await check('pocket', null, () => (window.__bwDebug?.S?.hole && document.querySelector('#screen-pocket canvas') ? true : 'the pocket never opened'), null, 8000);
  if (tabs) {
    for (const t of ['feed', 'drop', 'today', 'us']) {
      await check(`tab ${t}`, tap(t), sheetOpen);
      await page.evaluate('window.__bw.app.goTo(0)'); await page.waitForTimeout(500);
    }
  }
  await check('shelf', 'window.__bw.app.goTo(1)', showing, ['#screen-shelf', 'open when']);
  await check('games', 'window.__bw.app.goTo(2)', showing, ['#screen-games', 'five letters']);
  for (const [id, name] of GAMES) {
    await check(`game ${id}`, `window.__bw.app.openGame('${id}')`, showing, [`#screen-${id}`, name], id === 'house' ? 12000 : 6000);
    await page.evaluate('window.__bw.app.goTo(2)'); await page.waitForTimeout(700);
  }
  await check('back to the pocket', 'window.__bw.app.goTo(0)', showing, ['#screen-pocket', '']);
  await ctx.close();
  return problems;
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], // WebGL for the house, no GPU
});
const problems = [
  ...(await walk(browser, 'day', '?demo', { tabs: true })),
  ...(await walk(browser, 'night', '?demo&alt=-8', { tabs: true })),
];
await browser.close();
server.close();

if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('\nall good');
