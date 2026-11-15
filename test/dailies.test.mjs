// Today's and Soil's rows kept on the phone (src/dailies.js): the merge, and what gets drawn when.
// node test/dailies.test.mjs
import assert from 'node:assert/strict';
import { mergeDailies, Dailies, WAIT } from '../src/dailies.js';

let failed = 0;
const ok = async (name, fn) => {
  try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n', e); }
};
const row = (day, more = {}) => ({ day, my_answer: null, their_answer: null, their_answered: false, my_photo: null, my_thumb: null, their_photo: null, their_thumb: null, their_photographed: false, ...more });
const full = [
  row('2026-11-14', { my_photo: 17, my_thumb: 'T17', their_photo: 18, their_thumb: 'T18' }),
  row('2026-11-13', { my_photo: 15, my_thumb: 'T15', their_photo: 16, their_thumb: 'T16', my_answer: 'a' }),
  row('2026-11-12', { my_photo: 13, my_thumb: 'T13', their_photo: 14, their_thumb: 'T14' }),
];
// what the server sends Today with p_thumb_days = 1
const lite = (rows) => rows.map((r) => (r.day === '2026-11-14' ? r : { ...r, my_thumb: null, their_thumb: null }));

await ok('older previews come from the copy, today\'s from the server', () => {
  const fresh = lite(full).map((r) => (r.day === '2026-11-13' ? { ...r, my_answer: 'b' } : r));
  const out = mergeDailies(fresh, full, { today: '2026-11-14', thumbDays: 1 });
  assert.deepEqual(out.map((r) => [r.my_thumb, r.their_thumb]), [['T17', 'T18'], ['T15', 'T16'], ['T13', 'T14']]);
  assert.equal(out[1].my_answer, 'b'); // everything else is the server's
});

await ok('a preview is only reused for the same photo', () => {
  const fresh = lite(full).map((r) => (r.day === '2026-11-13' ? { ...r, my_photo: 99 } : r));
  const out = mergeDailies(fresh, full, { today: '2026-11-14', thumbDays: 1 });
  assert.equal(out[1].my_thumb, null);
  assert.equal(out[1].their_thumb, 'T16');
});

await ok('their preview stays buried when the server buries it', () => {
  const copy = [row('2026-11-14', { their_photographed: true })];
  const fresh = [row('2026-11-14', { their_photographed: true })];
  assert.equal(mergeDailies(fresh, copy, { today: '2026-11-14', thumbDays: 1 })[0].their_thumb, null);
});

await ok('a full fetch is taken as it comes', () => {
  const fresh = full.map((r) => ({ ...r, my_thumb: r.my_thumb + 'x' }));
  assert.deepEqual(mergeDailies(fresh, full, { today: '2026-11-14' }).map((r) => r.my_thumb), ['T17x', 'T15x', 'T13x']);
});

await ok('rows past the server\'s limit stay from the copy', () => {
  const out = mergeDailies(full.slice(0, 2), full, { today: '2026-11-14', limit: 2 });
  assert.deepEqual(out.map((r) => r.day), ['2026-11-14', '2026-11-13', '2026-11-12']);
  assert.equal(mergeDailies(full.slice(0, 2), full, { today: '2026-11-14', limit: 120 }).length, 2);
});

await ok('no copy: the server\'s rows', () => {
  assert.equal(mergeDailies(full, null, { today: '2026-11-14', thumbDays: 1 }), full);
});

// show(): demo mode skips IndexedDB; seed the copy with a first fetch
const fakeApp = (answer) => ({ today: () => '2026-11-14', backend: { dailies: answer } });

await ok('nothing on the phone: Digging, then the rows', async () => {
  const d = Dailies(fakeApp(async () => full), { demo: true });
  const seen = [];
  await d.show((r, st) => seen.push([st, r?.length ?? null]));
  assert.deepEqual(seen, [['waiting', null], ['fresh', 3]]);
});

await ok('a copy on the phone draws first, then the server\'s rows', async () => {
  let n = 0;
  const d = Dailies(fakeApp(async () => (n++ ? lite(full) : full)), { demo: true });
  await d.fetch({ limit: 400 });
  const seen = [];
  await d.show((r, st) => seen.push([st, r?.[1]?.my_thumb ?? null]), { thumbDays: 1 });
  assert.deepEqual(seen, [['copy', 'T15'], ['fresh', 'T15']]);
});

await ok('redraws skip the copy', async () => {
  const d = Dailies(fakeApp(async () => full), { demo: true });
  await d.fetch();
  const seen = [];
  await d.show((r, st) => seen.push(st), {}, { first: false });
  assert.deepEqual(seen, ['fresh']);
});

await ok('no signal and nothing on the phone: says so, keeps the copy otherwise', async () => {
  const fail = async () => { throw new Error('Failed to fetch'); };
  const seen = [];
  await Dailies(fakeApp(fail), { demo: true }).show((r, st) => seen.push(st));
  assert.deepEqual(seen, ['waiting', 'offline']);
  let n = 0;
  const d = Dailies(fakeApp(async () => { if (n++) throw new Error('Failed to fetch'); return full; }), { demo: true });
  await d.fetch();
  const seen2 = [];
  await d.show((r, st) => seen2.push(st));
  assert.deepEqual(seen2, ['copy']);
});

await ok(`slow server, nothing on the phone: offline after ${WAIT / 1000} s, then the rows`, async () => {
  const realSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => realSet(fn, ms === WAIT ? 5 : ms); // don't really wait
  try {
    const d = Dailies(fakeApp(() => new Promise((r) => realSet(() => r(full), 30))), { demo: true });
    const seen = [];
    await d.show((r, st) => seen.push(st));
    assert.deepEqual(seen, ['waiting', 'offline', 'fresh']);
  } finally { globalThis.setTimeout = realSet; }
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall good');
