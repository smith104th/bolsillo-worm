// Integration test for supabase/functions/media: the real function under Deno, Postgres via
// PGlite's wire-protocol server, and a fake auth + R2 server in this process.
// npm run test:media  (needs deno on PATH, or DENO=/path/to/deno)
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

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
await as(B, 'select wh_join($1,$2,$3,$4)', [c.code, 'Her', worm('Pickle'), BA]);
// an old photo with its bytes in the database, and her daily photo (you haven't posted yours)
const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const dataUrl = 'data:image/jpeg;base64,' + jpeg.toString('base64');
await as(A, `select wh_act('photo', '{}', $1, 'image/jpeg')`, [dataUrl]);
await as(A, `select wh_act('whisper', '{}', $1, 'audio/mp4')`, ['data:audio/mp4;base64,' + Buffer.from('whisper!').toString('base64')]);
const today = new Date().toISOString().slice(0, 10);
await as(B, 'select wh_daily($1, null, $2, $3, $4)', [today, dataUrl, 'image/jpeg', 'thumbB']);

const pgServer = new PGLiteSocketServer({ db, port: 55433, host: '127.0.0.1' });
await pgServer.start();

// fake Supabase auth + fake R2
const users = { tokA: A, tokB: B, tokC: C };
const bucket = new Map();
const http = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const chunks = []; for await (const ch of req) chunks.push(ch);
  const body = Buffer.concat(chunks);
  if (url.pathname === '/auth/v1/user') {
    const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!users[tok]) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"msg":"bad jwt"}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ id: users[tok], aud: 'authenticated', role: 'authenticated' }));
  }
  if (url.pathname.startsWith('/bolsillo-worm/')) {
    const key = url.pathname.slice('/bolsillo-worm/'.length);
    if (req.method === 'PUT') {
      assert.match(req.headers.authorization || '', /^AWS4-HMAC-SHA256 Credential=KEYID\/\d{8}\/auto\/s3\/aws4_request/);
      bucket.set(key, { type: req.headers['content-type'], body }); res.writeHead(200); return res.end();
    }
    if (req.method === 'GET') {
      if (!url.searchParams.get('X-Amz-Signature') || url.searchParams.get('X-Amz-Expires') !== '3600') { res.writeHead(403); return res.end(); }
      const o = bucket.get(key); if (!o) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': o.type }); return res.end(o.body);
    }
    if (req.method === 'DELETE') { bucket.delete(key); res.writeHead(204); return res.end(); }
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => http.listen(55999, '127.0.0.1', r));

const env = { ...process.env, SUPABASE_URL: 'http://127.0.0.1:55999', SUPABASE_ANON_KEY: 'anon',
  SUPABASE_DB_URL: 'postgres://postgres:pw@127.0.0.1:55433/postgres', R2_ENDPOINT: 'http://127.0.0.1:55999',
  R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'KEYID', R2_SECRET_ACCESS_KEY: 'SECRET', PORT: '55800' };
const fn = spawn(DENO, ['run', '-A', '--no-prompt', '--no-config', '--node-modules-dir=none', `${REPO}/supabase/functions/media/index.ts`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; fn.stdout.on('data', (d) => (log += d)); fn.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 300 && !/Listening on/.test(log); i++) await new Promise((r) => setTimeout(r, 200));
if (!/Listening on/.test(log)) { console.log(log); throw new Error('function did not start'); }
const port = (log.match(/Listening on https?:\/\/[^:]+:(\d+)/) || [])[1] || '8000';
const call = async (op, tok, { body, type, json } = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}/?op=${op}`, { method: 'POST', headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(json ? { 'content-type': 'application/json' } : type ? { 'content-type': type } : {}) }, body: json ? JSON.stringify(json) : body });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
try {
  let r = await call('ping'); ok(r.status === 200 && r.body.ready === true, `ping → ${JSON.stringify(r.body)}`);
  r = await call('put', 'nope', { body: jpeg, type: 'image/jpeg' }); ok(r.status === 401, `bad token → ${r.status}`);
  r = await call('put', 'tokC', { body: jpeg, type: 'image/jpeg' }); ok(r.status === 403, `not in a pocket → ${r.status}`);
  r = await call('put', 'tokA', { body: jpeg, type: 'text/html' }); ok(r.status === 415, `wrong type → ${r.status}`);
  r = await call('put', 'tokA', { body: Buffer.alloc(4_000_001), type: 'image/jpeg' }); ok(r.status === 413, `too big → ${r.status}`);
  r = await call('put', 'tokA', { body: Buffer.alloc(0), type: 'image/jpeg' }); ok(r.status === 400, `empty → ${r.status}`);

  r = await call('put', 'tokA', { body: jpeg, type: 'image/jpeg' });
  const newId = r.body?.id;
  ok(r.status === 200 && Number.isInteger(newId), `put → ${JSON.stringify(r.body)}`);
  const row = (await db.query('select * from media where id = $1', [newId])).rows[0];
  ok(row && row.data === null && /^media\/[0-9a-f-]{36}$/.test(row.r2) && row.slot === 0 && row.bytes === jpeg.length && bucket.get(row.r2)?.body.equals(jpeg), 'row has the key, no bytes; the file is in the bucket');
  // the app then attaches it
  const [pic] = await as(A, `select * from wh_act('photo', '{}', $1)`, [`media:${newId}`]);
  ok(Number(pic.media_id) === newId, 'wh_act takes the media:<id> ref');

  r = await call('url', 'tokB', { json: { ids: [newId, 'x', -1] } });
  const link = r.body?.urls?.[newId];
  ok(r.status === 200 && link && Object.keys(r.body.urls).length === 1, 'her phone gets a link for your photo');
  const got = await fetch(link); const gotBytes = Buffer.from(await got.arrayBuffer());
  ok(got.ok && gotBytes.equals(jpeg), 'the link downloads the same bytes');
  r = await call('url', 'tokC', { json: { ids: [newId] } }); ok(r.status === 403, 'outsider gets nothing');

  // move the old ones
  r = await call('migrate', 'tokA');
  ok(r.status === 200 && r.body.moved === 3 && r.body.left === 0, `migrate → ${JSON.stringify(r.body)}`);
  const left = (await db.query('select count(*)::int n from media where data is not null')).rows[0].n;
  const moved = (await db.query('select id, mime, r2, bytes from media order by id')).rows;
  ok(left === 0 && moved.every((m) => m.r2 && bucket.has(m.r2)), 'every old row moved to the bucket');
  const whisperRow = moved.find((m) => m.mime === 'audio/mp4');
  ok(bucket.get(whisperRow.r2).body.toString() === 'whisper!' && bucket.get(whisperRow.r2).type === 'audio/mp4', 'bytes and type survive the move');
  r = await call('migrate', 'tokB'); ok(r.body.moved === 0 && r.body.left === 0, 'second run has nothing to do');

  // her daily photo stays buried until you post yours
  const herDaily = (await db.query('select photo from dailies where slot = 1')).rows[0].photo;
  r = await call('url', 'tokA', { json: { ids: [Number(herDaily)] } });
  ok(Object.keys(r.body.urls).length === 0, 'her daily photo: no link before yours');
  r = await call('url', 'tokB', { json: { ids: [Number(herDaily)] } });
  ok(Object.keys(r.body.urls).length === 1, 'she can always see her own');
  const mine = (await call('put', 'tokA', { body: jpeg, type: 'image/jpeg' })).body.id;
  await as(A, 'select wh_daily($1, null, $2, $3, $4)', [today, `media:${mine}`, 'image/jpeg', 'thumbA']);
  r = await call('url', 'tokA', { json: { ids: [Number(herDaily), mine] } });
  ok(Object.keys(r.body.urls).length === 2, 'after you post yours, both links');
  r = await call('bogus', 'tokA'); ok(r.status === 400, 'unknown op → 400');
} finally {
  fn.kill(); http.close(); await pgServer.stop();
  if (/error/i.test(log) && fails) console.log(log.slice(-3000));
}
console.log(fails ? `\n${fails} failed` : '\nall good');
process.exit(fails ? 1 : 0);
