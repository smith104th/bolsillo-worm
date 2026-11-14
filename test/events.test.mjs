// What the phone keeps of the pocket's events (src/events.js) and the queries load() sends for it.
// node test/events.test.mjs
import assert from 'node:assert/strict';
import { trimEvents, mergeEvents, stillInPocket, windowEdge, EVENT_CAP, COMPOST_H } from '../src/events.js';

let failed = 0;
const ok = async (name, fn) => {
  try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n', e); }
};

const NOW = Date.parse('2026-11-14T15:00:00Z');
const at = (h) => new Date(NOW - h * 3600e3).toISOString(); // h hours ago
let id = 0;
const ev = (kind, hoursAgo, more = {}) => ({ id: ++id, kind, from_slot: 0, created_at: at(hoursAgo), opened_at: null, kept: false, ...more });
// a busy pocket: 600 kisses over the last 60 hours, newest first
const kisses = () => Array.from({ length: 600 }, (_, i) => ev('kiss', i / 10));

await ok('an unopened doodle older than the newest 500 stays', () => {
  const doodle = ev('doodle', 80);
  const kept = trimEvents([...kisses(), doodle], EVENT_CAP, NOW);
  assert.equal(kept.length, EVENT_CAP + 1);
  assert.equal(kept.at(-1), doodle);
  assert.ok(kept.slice(0, EVENT_CAP).every((e) => e.kind === 'kiss'));
});

await ok('opened things stay until they compost, then go', () => {
  const fresh = ev('note', 90, { opened_at: at(COMPOST_H - 1) });
  const old = ev('note', 100, { opened_at: at(COMPOST_H + 1) });
  const kept = trimEvents([...kisses(), fresh, old], EVENT_CAP, NOW);
  assert.ok(kept.includes(fresh));
  assert.ok(!kept.includes(old));
});

await ok('kept things and kisses past the window go (kept ones live on the shelf)', () => {
  const kept = trimEvents([...kisses(), ev('photo', 90, { kept: true }), ev('kiss', 95)], EVENT_CAP, NOW);
  assert.equal(kept.length, EVENT_CAP);
});

await ok('under the cap nothing is dropped, and it comes back newest first', () => {
  const list = [ev('kiss', 5), ev('note', 1, { opened_at: at(200), kept: true }), ev('pet', 3)];
  const kept = trimEvents(list.slice(), EVENT_CAP, NOW);
  assert.deepEqual(kept.map((e) => e.created_at), [at(1), at(3), at(5)]);
});

await ok('trimming keeps the same array (S.events is trimmed in place)', () => {
  const list = [...kisses(), ev('song', 70)];
  assert.equal(trimEvents(list, EVENT_CAP, NOW), list);
});

await ok('mergeEvents: each id once, newest first, the later copy wins', () => {
  const a = { id: 1, kind: 'note', created_at: at(2), opened_at: null };
  const b = { id: 2, kind: 'kiss', created_at: at(1) };
  const a2 = { ...a, opened_at: at(0) };
  const m = mergeEvents([a, b], [a2], null);
  assert.deepEqual(m.map((e) => e.id), [2, 1]);
  assert.equal(m[1].opened_at, at(0));
});

await ok('windowEdge is the end of the newest run, not an older kept item', () => {
  const list = trimEvents([...kisses(), ev('doodle', 80)], EVENT_CAP, NOW);
  assert.equal(windowEdge(list), list[EVENT_CAP - 1].created_at);
  assert.equal(windowEdge([]), null);
});

await ok('stillInPocket: only things that float in the pocket', () => {
  assert.equal(stillInPocket(ev('kiss', 1), NOW), false);
  assert.equal(stillInPocket(ev('whisper', 500), NOW), true);
  assert.equal(stillInPocket(ev('wiggle', 500, { kept: true }), NOW), false);
});

// load(): the queries it sends (fetch stubbed; the URLs are PostgREST filters)
await ok('load() asks for the newest 500 plus unopened and not-yet-composted items, and merges them', async () => {
  const urls = [];
  const rows = {
    newest: Array.from({ length: EVENT_CAP }, (_, i) => ({ id: 10000 - i, kind: 'kiss', created_at: at(i / 10), opened_at: null, kept: false })),
    unopened: [{ id: 5, kind: 'doodle', created_at: at(80), opened_at: null, kept: false }],
    opened: [{ id: 6, kind: 'note', created_at: at(90), opened_at: at(10), kept: false }],
  };
  globalThis.fetch = async (input) => {
    const url = decodeURIComponent(String(input.url || input));
    urls.push(url);
    let body = [];
    if (url.includes('/rest/v1/events')) body = url.includes('opened_at=is.null') ? rows.unopened : url.includes('opened_at=gt.') ? rows.opened : rows.newest;
    if (url.includes('/rest/v1/holes')) body = { id: 'h' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const { supabaseBackend } = await import('../src/backend.js');
  const backend = supabaseBackend({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'key' });
  const data = await backend.load();
  const events = urls.filter((u) => u.includes('/rest/v1/events'));
  assert.equal(events.length, 3, events.join('\n'));
  const items = events.filter((u) => u.includes('kind=in.(note,doodle,photo,whisper,wiggle,song,trinket)'));
  assert.equal(items.length, 2);
  assert.ok(items.every((u) => u.includes('kept=eq.false')));
  assert.ok(items.some((u) => u.includes('opened_at=is.null')));
  assert.ok(items.some((u) => /opened_at=gt\.\d{4}-\d\d-\d\dT/.test(u)));
  assert.ok(events.some((u) => u.includes('limit=500') && !u.includes('kind=')));
  assert.equal(data.capped, true);
  assert.equal(data.events.length, EVENT_CAP + 2);
  assert.deepEqual(data.events.slice(-2).map((e) => e.id), [5, 6]);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall good');
