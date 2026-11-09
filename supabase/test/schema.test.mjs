// Runs schema.sql against an in-memory Postgres with a stubbed Supabase auth layer.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
`);
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
await db.exec(schema);
await db.exec(schema); // re-runnable

const U = { A: '00000000-0000-0000-0000-00000000000a', B: '00000000-0000-0000-0000-00000000000b',
            C: '00000000-0000-0000-0000-00000000000c', D: '00000000-0000-0000-0000-00000000000d' };
for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);

async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try { return (await db.query(sql, params)).rows; }
  finally { await db.exec('reset role;'); }
}
async function fails(user, sql, params, msg) {
  await assert.rejects(() => as(user, sql, params), (e) => { assert.match(e.message, msg); return true; });
}

const worm = (n) => JSON.stringify({ name: n, color: 'pink', pattern: 'rings', acc: 'none' });
const BA = JSON.stringify({ city: 'Buenos Aires', lat: -34.6, lon: -58.38, tz: 'America/Argentina/Buenos_Aires' });
const MAD = JSON.stringify({ city: 'Madrid', lat: 40.42, lon: -3.7, tz: 'Europe/Madrid' });

// pairing
const [{ wh_create: created }] = await as(U.A, 'select wh_create($1,$2,$3)', ['Manu', worm('Fideo'), BA]);
assert.equal(created.code.length, 8);
assert.match(created.code, /^[A-HJ-NP-Z2-9]{8}$/);
await fails(U.A, 'select wh_create($1,$2,$3)', ['Manu', worm('x'), BA], /already_in_hole/);
await fails(U.B, 'select wh_join($1,$2,$3,$4)', ['NOPE1234', 'Her', worm('Pickle'), MAD], /no_such_hole/);
const [{ wh_join: joined }] = await as(U.B, 'select wh_join($1,$2,$3,$4)', [created.code.toLowerCase().replace(/(....)/, '$1-'), 'Her', worm('Pickle'), MAD]);
assert.equal(joined.slot, 1);
const [{ wh_join: full }] = await as(U.C, 'select wh_join($1,$2,$3,$4)', [created.code, 'Intruder', worm('x'), BA]);
assert.equal(full.full, true);
assert.equal(full.worms.length, 2);

const [hole] = await as(U.A, 'select * from holes');
assert.ok(hole.tunnel_km > 9000 && hole.tunnel_km < 10500, 'BA-Madrid ≈ 10,000 km, got ' + hole.tunnel_km);

// RLS: outsiders see nothing
assert.equal((await as(U.C, 'select * from members')).length, 0);
assert.equal((await as(U.C, 'select * from events')).length, 0);
assert.equal((await as(U.B, 'select * from members')).length, 2);
await fails(U.B, `update members set love = 999`, [], /permission denied/);
await fails(U.C, `insert into events (hole_id, from_slot, kind) values ($1, 0, 'note')`, [hole.id], /permission denied/);

// acting
await as(U.A, `select wh_act('pet', '{}')`);
await as(U.A, `select wh_act('pet', '{}')`);
await as(U.A, `select wh_act('pet', '{}')`);
let pets = await as(U.B, `select * from events where kind = 'pet'`);
assert.equal(pets.length, 1, 'pets coalesce');
assert.equal(pets[0].payload.n, 3);
await as(U.A, `select wh_act('kiss', '{"level":4}')`);
await as(U.A, `select wh_act('note', '{"text":"hola gusanita"}')`);
await as(U.A, `select wh_act('photo', '{"caption":"medialunas"}', 'data:image/jpeg;base64,AAAA', 'image/jpeg')`);
await fails(U.A, `select wh_act('rm -rf', '{}')`, [], /bad_kind/);
await as(U.B, `select wh_act('react', '{"emoji":"🥺"}')`);
assert.equal((await as(U.A, `select payload->>'emoji' e from events where kind = 'react'`))[0].e, '🥺');
const her = (await as(U.B, 'select * from members where slot = 1'))[0];
assert.equal(her.love, 3 + 8 + 4 + 4, 'love: 3 pets + kiss lvl4 + note + photo');
const photo = (await as(U.B, `select * from events where kind = 'photo'`))[0];
assert.ok(photo.media_id);
assert.equal((await as(U.B, 'select data from media where id = $1', [photo.media_id]))[0].data, 'data:image/jpeg;base64,AAAA');
assert.equal((await as(U.C, 'select data from media')).length, 0);

// opening
const note = (await as(U.B, `select * from events where kind = 'note'`))[0];
await as(U.A, 'select wh_open($1, null)', [note.id]);
assert.equal((await as(U.B, 'select opened_at from events where id = $1', [note.id]))[0].opened_at, null, 'sender opening does not count');
await as(U.B, 'select wh_open($1, true)', [note.id]);
const opened = (await as(U.B, 'select * from events where id = $1', [note.id]))[0];
assert.ok(opened.opened_at); assert.equal(opened.kept, true);

// daily: halves stay buried until you do yours
const today = new Date().toISOString().slice(0, 10);
await as(U.A, 'select wh_daily($1, $2)', [today, 'the 152 bus']);
let bDay = (await as(U.B, 'select * from wh_dailies(10)'))[0];
assert.equal(bDay.their_answer, null); assert.equal(bDay.their_answered, true);
const [{ wh_daily: r }] = await as(U.B, 'select wh_daily($1, $2)', [today, 'your laugh']);
assert.equal(r.both, true);
bDay = (await as(U.B, 'select * from wh_dailies(10)'))[0];
assert.equal(bDay.their_answer, 'the 152 bus'); assert.equal(bDay.my_answer, 'your laugh');
await as(U.B, 'select wh_daily($1, null, $2, $3, $4)', [today, 'data:image/jpeg;base64,BBBB', 'image/jpeg', 'thumbB']);
let aDay = (await as(U.A, 'select * from wh_dailies(10)'))[0];
assert.equal(aDay.their_photo, null); assert.equal(aDay.their_thumb, null); assert.equal(aDay.their_photographed, true);
await as(U.A, 'select wh_daily($1, null, $2, $3, $4)', [today, 'data:image/jpeg;base64,AAAA', 'image/jpeg', 'thumbA']);
aDay = (await as(U.A, 'select * from wh_dailies(10)'))[0];
assert.ok(aDay.their_photo); assert.equal(aDay.their_thumb, 'thumbB');
await fails(U.A, 'select wh_daily($1, $2)', ['2001-01-01', 'old'], /bad_day/);
const dailyEvents = await as(U.A, `select * from events where kind = 'daily' order by id`);
assert.equal(dailyEvents.length, 4);
assert.equal(dailyEvents[3].payload.both, true);
assert.equal((await as(U.A, 'select * from dailies')).length, 1, 'own daily rows only');

// planted questions: next free day, hidden from the partner until it comes up
const [{ wh_plant: d1 }] = await as(U.A, `select wh_plant('  What would you name our dog?  ')`);
const [{ wh_plant: d2 }] = await as(U.B, `select wh_plant('Where should we go in March?')`);
const [{ hd: holeDay }] = (await db.query(`select wh_today(id) hd from holes`)).rows;
const dayMs = 86400000;
assert.equal(new Date(d1) - new Date(holeDay), dayMs, 'first seed comes up tomorrow');
assert.equal(new Date(d2) - new Date(holeDay), 2 * dayMs, 'second seed takes the next free day');
let seen = await as(U.A, 'select * from wh_planted()');
assert.deepEqual(seen.map((r) => r.question), ['What would you name our dog?'], 'only my own future seed');
await db.query(`update planted set day = $1 where question like 'Where%'`, [holeDay]);
seen = await as(U.A, 'select * from wh_planted()');
assert.equal(seen.length, 2, 'their seed shows once it is up');
await fails(U.A, `select wh_plant('hi')`, [], /bad_question/);
await fails(U.C, `select wh_plant('Who are you?')`, [], /no_hole/);
await as(U.B, `select wh_unplant($1)`, [holeDay]);
assert.equal((await db.query(`select count(*)::int n from planted`)).rows[0].n, 2, 'cannot dig up a seed that already came up');
await as(U.A, `select wh_unplant($1)`, [d1]);
assert.equal((await as(U.A, 'select * from wh_planted()')).length, 1, 'dug up');
assert.equal((await as(U.B, `select * from events where kind = 'plant'`)).length, 1, 'its plant event goes too');
for (let i = 0; i < 7; i++) await as(U.A, `select wh_plant('Question number ${i}?')`);
await fails(U.A, `select wh_plant('One too many?')`, [], /too_many_seeds/);
await fails(U.A, `select * from planted`, [], /permission denied/);
const stats = await as(U.A, `select * from wh_stats(now() - interval '1 day', now() + interval '1 day')`);
assert.ok(stats.find((r) => r.kind === 'plant' && r.from_slot === 0 && Number(r.n) === 7), 'stats count plants');

// the shelf: sealed until opened, capsules locked until their day
const tomorrow = new Date(new Date(holeDay).getTime() + dayMs).toISOString().slice(0, 10);
const [env] = await as(U.A, `select * from wh_seal('{"mode":"when","label":"you are sad","paper":"celeste"}', '{"text":"You are my favorite person."}')`);
assert.equal(env.kind, 'later'); assert.equal(env.payload.label, 'you are sad'); assert.equal(env.payload.photo, false);
assert.equal(JSON.stringify(env.payload).includes('favorite'), false, 'the outside of the envelope does not carry the letter');
const [cap] = await as(U.A, `select * from wh_seal($1, '{"text":"Merry worm-mas","caption":"us"}', 'data:image/jpeg;base64,AAAA', 'image/jpeg')`, [JSON.stringify({ mode: 'date', on: tomorrow })]);
assert.equal(cap.payload.photo, true);
await fails(U.B, `select * from sealed`, [], /permission denied/);
await fails(U.A, `select * from wh_seal('{"mode":"date","on":"2001-01-01"}', '{"text":"x"}')`, [], /bad_date/);
await fails(U.A, `select * from wh_seal('{"mode":"when","label":""}', '{"text":"x"}')`, [], /bad_label/);
await fails(U.A, `select * from wh_seal('{"mode":"when","label":"bored"}', '{}')`, [], /empty/);
await fails(U.A, `select * from wh_seal('{"mode":"never"}', '{"text":"x"}')`, [], /bad_mode/);
await fails(U.C, `select * from wh_seal('{"mode":"when","label":"hi"}', '{"text":"x"}')`, [], /no_hole/);
await fails(U.B, `select wh_unseal($1)`, [cap.id], /not_yet/);
const [{ wh_unseal: mine }] = await as(U.A, `select wh_unseal($1)`, [cap.id]);
assert.equal(mine.body.text, 'Merry worm-mas', 'sender can look inside their own');
assert.equal(mine.opened_at, null, 'looking at your own does not open it');
const [{ wh_unseal: envOpen }] = await as(U.B, `select wh_unseal($1)`, [env.id]);
assert.equal(envOpen.body.text, "You are my favorite person."); assert.ok(envOpen.opened_at);
const unsealedEv = await as(U.A, `select * from events where kind = 'unsealed'`);
assert.equal(unsealedEv.length, 1); assert.equal(unsealedEv[0].payload.label, 'you are sad');
await as(U.B, `select wh_unseal($1)`, [env.id]);
assert.equal((await as(U.A, `select * from events where kind = 'unsealed'`)).length, 1, 'opening twice tells them once');
await db.query(`update events set payload = jsonb_set(payload, '{on}', to_jsonb($1::text)) where id = $2`, [holeDay, cap.id]);
const [{ wh_unseal: capOpen }] = await as(U.B, `select wh_unseal($1)`, [cap.id]);
assert.equal(capOpen.photo, 'data:image/jpeg;base64,AAAA', 'capsule opens on its day');

// tunnel completes and loops
await db.exec(`update holes set tunnel_km = 100, dug_km = 90`);
await as(U.B, `select wh_act('note', '{"text":"x"}')`);
const h2 = (await as(U.A, 'select * from holes'))[0];
assert.equal(h2.tunnels_done, 1); assert.equal(Math.round(h2.dug_km), 30);
assert.equal((await as(U.A, `select * from events where kind = 'tunnel'`)).length, 1);

// reunion, push, reclaim, leave
await as(U.A, `select wh_set_reunion('2026-11-26', 'Medellín')`);
assert.equal((await as(U.B, 'select reunion_note from holes'))[0].reunion_note, 'Medellín');
await as(U.B, `select wh_update_me('{"push":{"endpoint":"https://x"}}')`);
assert.equal((await as(U.A, 'select push from members where slot = 1'))[0].push.endpoint, 'https://x');
await as(U.A, 'select wh_drop_push(1::smallint)');
assert.equal((await as(U.A, 'select push from members where slot = 1'))[0].push, null);
await as(U.B, `select wh_update_me('{"name":"Ella","place":${BA}}')`);
assert.equal((await as(U.A, 'select tunnel_km from holes'))[0].tunnel_km, 50, 'same city floors at 50km');
await as(U.D, 'select wh_reclaim($1, 1::smallint)', [created.code]);
assert.equal((await as(U.B, 'select * from members')).length, 0, 'old phone loses access');
assert.equal((await as(U.D, 'select name from members where slot = 1'))[0].name, 'Ella');
await as(U.D, 'select wh_leave()');
await as(U.A, 'select wh_leave()');
assert.equal((await db.query('select count(*)::int n from holes')).rows[0].n, 0);

// push keys are out of reach for app users
await fails(U.A, 'select * from private.vapid', [], /permission denied/);

console.log('all schema tests passed');
