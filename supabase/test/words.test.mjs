// Integration test for supabase/functions/words: the real function under Deno, Postgres via
// PGlite's wire-protocol server, and a fake auth + fake NYT + fake public answer list in this process.
// npm run test:words  (needs deno on PATH, or DENO=/path/to/deno)
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const REPO = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const DENO = process.env.DENO || 'deno';
const db = await PGlite.create();
await db.exec(`
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated; grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated; create publication supabase_realtime;`);
await db.exec(readFileSync(`${REPO}/supabase/schema.sql`, 'utf8'));
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
for (const id of [A, B, C]) await db.query('insert into auth.users values ($1)', [id]);
const as = async (u, q, p = []) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${u}', false); set role authenticated;`); try { return (await db.query(q, p)).rows; } finally { await db.exec('reset role;'); } };
const worm = (n) => JSON.stringify({ name: n, color: 'pink' });
const BA = JSON.stringify({ city: 'Buenos Aires', lat: -34.6, lon: -58.38, tz: 'America/Argentina/Buenos_Aires' });
const [{ wh_create: c }] = await as(A, 'select wh_create($1,$2,$3)', ['Manu', worm('Fideo'), BA]);
await as(B, 'select wh_join($1,$2,$3,$4)', [c.code, 'Vio', worm('Pickle'), BA]);
const state = async (u, fb = null) => (await as(u, 'select wh_fl_state($1) s', [fb]))[0].s;
const today = String((await state(A)).today).slice(0, 10);
const plus = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const pgServer = new PGLiteSocketServer({ db, port: 55434, host: '127.0.0.1' });
await pgServer.start();

// fake Supabase auth + a fake NYT that knows two dates (and can be switched off)
const users = { tokA: A, tokB: B, tokC: C };
const answers = { [plus(today, -2)]: 'CRANE', [plus(today, -1)]: 'zesty' };
let nytUp = true, nytHits = [], listUp = false;
// the public list's shape: { WORD: [[puzzle number, "M/D/YY"]] }; puzzle 0 = 2021-06-19
const puzzle = (day) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.UTC(2021, 5, 19)) / 86400000);
const mdy = (day) => { const [y, m, d] = day.split('-').map(Number); return `${m}/${d}/${String(y).slice(2)}`; };
const listed = { [plus(today, -2)]: 'TRUCE', [plus(today, -1)]: 'GHOST', [plus(today, -9)]: 'OLDER' };
const http = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  for await (const _ of req) { /* drain */ }
  if (url.pathname === '/auth/v1/user') {
    const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!users[tok]) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"msg":"bad jwt"}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ id: users[tok], aud: 'authenticated', role: 'authenticated' }));
  }
  if (url.pathname === '/list.json') {
    if (!listUp) { res.writeHead(500); return res.end('down'); }
    const out = {};
    for (const [day, w] of Object.entries(listed)) (out[w] ||= []).push([puzzle(day), mdy(day)]);
    out.WRONG = [[puzzle(plus(today, -2)) + 1, mdy(plus(today, -2))]]; // a number that doesn't fit its date is ignored
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(out));
  }
  const m = url.pathname.match(/^\/svc\/wordle\/v2\/(\d{4}-\d{2}-\d{2})\.json$/);
  if (m) {
    nytHits.push(m[1]);
    if (!nytUp) { res.writeHead(503); return res.end('down'); }
    if (!answers[m[1]]) { res.writeHead(404); return res.end('{"status":"ERROR"}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ id: 1, solution: answers[m[1]], print_date: m[1], days_since_launch: 1, editor: 'x' }));
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => http.listen(55998, '127.0.0.1', r));

const env = { ...process.env, SUPABASE_URL: 'http://127.0.0.1:55998', SUPABASE_ANON_KEY: 'anon',
  SUPABASE_DB_URL: 'postgres://postgres:pw@127.0.0.1:55434/postgres', NYT_URL: 'http://127.0.0.1:55998/svc/wordle/v2', WORDLIST_URL: 'http://127.0.0.1:55998/list.json', PORT: '55801' };
const fn = spawn(DENO, ['run', '-A', '--no-prompt', '--no-config', '--node-modules-dir=none', `${REPO}/supabase/functions/words/index.ts`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; fn.stdout.on('data', (d) => (log += d)); fn.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 300 && !/Listening on/.test(log); i++) await new Promise((r) => setTimeout(r, 200));
if (!/Listening on/.test(log)) { console.log(log); throw new Error('function did not start'); }
const port = (log.match(/Listening on https?:\/\/[^:]+:(\d+)/) || [])[1] || '8000';
const call = async (tok) => {
  const r = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', headers: tok ? { authorization: `Bearer ${tok}` } : {} });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let fails = 0;
const ok = (cond, m) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}`); if (!cond) fails++; };
try {
  let r = await call('nope'); ok(r.status === 401, `bad token → ${r.status}`);
  r = await call('tokC'); ok(r.status === 403, `not in a pocket → ${r.status}`);

  // NYT and the list both down: nothing stored, the app falls back to its own word
  nytUp = false;
  r = await call('tokA');
  ok(r.status === 200 && r.body.ready === false && r.body.missing.length === 2, `NYT down → ${JSON.stringify(r.body)}`);
  ok((await db.query('select count(*)::int n from fl_words')).rows[0].n === 0, 'nothing stored');

  nytUp = true; nytHits = [];
  r = await call('tokA');
  ok(r.status === 200 && r.body.ready === true && r.body.got.length === 2, `fetch → ${JSON.stringify(r.body)}`);
  const rows = (await db.query('select day::text, word from fl_words order by day')).rows;
  ok(JSON.stringify(rows) === JSON.stringify([{ day: plus(today, -2), word: 'crane' }, { day: plus(today, -1), word: 'zesty' }]), `today's word and tomorrow's, lowercased: ${JSON.stringify(rows)}`);
  ok(JSON.stringify(nytHits.sort()) === JSON.stringify([plus(today, -2), plus(today, -1)]), `asked NYT for two days before and the day before: ${nytHits}`);
  const s = await state(B);
  ok(s.word === 'crane' && String(s.nyt).slice(0, 10) === plus(today, -2), 'the next open locks in the NYT word from two days before');

  nytHits = [];
  r = await call('tokB');
  ok(r.body.ready === true && r.body.got.length === 0 && nytHits.length === 0, 'already there: NYT isn\'t asked again');
  ok(!JSON.stringify(r.body).includes('crane'), 'the word itself never comes back from the function');

  // a bad answer from NYT isn't stored
  await db.query('delete from fl_words');
  answers[plus(today, -2)] = 'cran3'; answers[plus(today, -1)] = 'toolong';
  r = await call('tokA');
  ok(r.body.ready === false && (await db.query('select count(*)::int n from fl_words')).rows[0].n === 0, 'a word that isn\'t five letters is ignored');
  ok(/nyt no solution/.test(r.body.why?.[plus(today, -2)] || ''), `why says what happened: ${JSON.stringify(r.body.why)}`);

  // NYT turns us away, the public list has them: stored from the list
  nytUp = false; listUp = true;
  r = await call('tokA');
  ok(r.body.ready === true && r.body.got.length === 2, `NYT down, list up → ${JSON.stringify(r.body)}`);
  const fromList = (await db.query('select day::text, word from fl_words order by day')).rows;
  ok(JSON.stringify(fromList) === JSON.stringify([{ day: plus(today, -2), word: 'truce' }, { day: plus(today, -1), word: 'ghost' }]), `the list's words, lowercased, by date: ${JSON.stringify(fromList)}`);
  // both up: NYT's answer wins
  await db.query('delete from fl_words'); nytUp = true; answers[plus(today, -2)] = 'crane'; answers[plus(today, -1)] = 'zesty';
  r = await call('tokA');
  ok((await db.query(`select word from fl_words where day = $1`, [plus(today, -2)])).rows[0]?.word === 'crane', 'NYT and the list both answer: NYT wins');
} finally {
  fn.kill(); http.close(); await pgServer.stop();
  if (fails) console.log(log.slice(-3000));
}
console.log(fails ? `\n${fails} failed` : '\nall good');
process.exit(fails ? 1 : 0);
