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
// songs are a thing you can drop in
const song = (await as(U.A, `select * from wh_act('song', '{"provider":"spotify","title":"Bésame Mucho","url":"https://open.spotify.com/track/x"}')`))[0];
assert.equal(song.kind, 'song');
assert.equal((await as(U.B, `select payload->>'title' as t from events where kind = 'song'`))[0].t, 'Bésame Mucho', 'partner sees the song');
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

// photos in R2: the media function makes the row, the app passes "media:<id>"
const r2row = async (slot, key = crypto.randomUUID()) =>
  (await db.query(`insert into media (hole_id, mime, r2, bytes, slot) values ($1, 'image/jpeg', $2, 1234, $3) returning id`, [hole.id, `media/${key}`, slot])).rows[0].id;
const a1 = await r2row(0);
const [pic] = await as(U.A, `select * from wh_act('photo', '{"caption":"from R2"}', $1)`, [`media:${a1}`]);
assert.equal(Number(pic.media_id), Number(a1));
await fails(U.A, `select wh_act('photo', '{}', $1)`, [`media:${a1}`], /bad_media/);           // already attached
const a2 = await r2row(0);
await fails(U.B, `select wh_act('photo', '{}', $1)`, [`media:${a2}`], /bad_media/);           // not theirs
await fails(U.A, `select wh_act('photo', '{}', 'media:abc')`, [], /bad_media/);
await fails(U.A, `select wh_act('photo', '{}', 'media:99999999')`, [], /bad_media/);
await fails(U.A, `select wh_media_ref(m, 'media:1') from members m`, [], /permission denied/);
const yday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const b1 = await r2row(1);
await as(U.B, 'select wh_daily($1, null, $2, $3, $4)', [yday, `media:${b1}`, 'image/jpeg', 'thumbR2']);
assert.equal(Number((await as(U.B, 'select photo from dailies where day = $1', [yday]))[0].photo), Number(b1));
await fails(U.B, 'select wh_daily($1, null, $2, $3, $4)', [yday, `media:${b1}`, 'image/jpeg', 't'], /bad_media/);
const legacy = (await db.query(`select count(*)::int n from media where data is not null and r2 is null`)).rows[0].n;
assert.ok(legacy >= 1, 'old photos keep their bytes until they move');

// the countdown remembers when it started; moving a running one keeps the start
{
  const [{ hd }] = (await db.query(`select wh_today(id)::text hd from holes limit 1`)).rows;
  const plus = (n) => new Date(new Date(hd).getTime() + n * 86400000).toISOString().slice(0, 10);
  await as(U.A, `select wh_set_reunion($1, 'Madrid')`, [plus(20)]);
  let [h1] = await as(U.A, `select reunion_from::text f, reunion_on::text o from holes`);
  assert.equal(h1.f, hd, 'a new countdown starts today');
  await db.query(`update holes set reunion_from = $1`, [plus(-3)]);
  await as(U.B, `select wh_set_reunion($1, 'Lisbon')`, [plus(25)]);
  [h1] = await as(U.A, `select reunion_from::text f, reunion_on::text o from holes`);
  assert.equal(h1.f, plus(-3), 'moving the date keeps the start');
  assert.equal(h1.o, plus(25));
  await db.query(`update holes set reunion_on = $1`, [plus(-1)]);
  await as(U.A, `select wh_set_reunion($1, null)`, [plus(10)]);
  [h1] = await as(U.A, `select reunion_from::text f from holes`);
  assert.equal(h1.f, hd, 'after the last one passed, a new one starts today');
}

// updated_at follows every change to an event
{
  const [e0] = await as(U.A, `select id, updated_at from events order by id limit 1`);
  await db.query(`select pg_sleep(0.01)`);
  await as(U.B, `select wh_open($1, null)`, [e0.id]);
  const [e1] = await as(U.A, `select updated_at from events where id = $1`, [e0.id]);
  assert.ok(new Date(e1.updated_at) > new Date(e0.updated_at), 'opening bumps updated_at');
}

// planted questions: next free day, hidden from the partner until it comes up
const [{ wh_plant: d1 }] = await as(U.A, `select wh_plant('  What would you name our dog?  ')`);
const [{ wh_plant: d2 }] = await as(U.B, `select wh_plant('Where should we go in March?')`);
const [{ hd: holeDay }] = (await db.query(`select wh_today(id) hd from holes`)).rows;
const dayMs = 86400000;
assert.equal(new Date(d1) - new Date(holeDay), dayMs, 'first seed comes up tomorrow');
assert.equal(new Date(d2) - new Date(holeDay), 2 * dayMs, 'second seed takes the next free day');
// seeds always alternate: A plants three more, B one → A B A B A A, no gaps
for (const q of ['A two?', 'A three?', 'A four?']) await as(U.A, `select wh_plant('${q}')`);
const [{ wh_plant: b2 }] = await as(U.B, `select wh_plant('B two?')`);
const dealt = async () => (await db.query(`select from_slot, question, day::text from planted order by day`)).rows;
let deal = await dealt();
assert.deepEqual(deal.map((r) => r.from_slot), [0, 1, 0, 1, 0, 0], 'seeds alternate while both have some');
assert.deepEqual(deal.map((r) => Math.round((new Date(r.day) - new Date(holeDay)) / dayMs)), [1, 2, 3, 4, 5, 6], 'days are dealt from tomorrow with no gaps');
assert.equal(new Date(b2) - new Date(holeDay), 4 * dayMs, 'wh_plant returns the day the new seed landed on');
assert.deepEqual((await as(U.A, `select payload->>'day' d from events where kind = 'plant' order by 1`)).map((r) => r.d), deal.map((r) => r.day), 'plant events carry the re-dealt days');
await as(U.A, `select wh_unplant($1)`, [deal[2].day]);
deal = await dealt();
assert.deepEqual(deal.map((r) => r.from_slot), [0, 1, 0, 1, 0], 'digging one up closes the gap');
assert.deepEqual(deal.map((r) => Math.round((new Date(r.day) - new Date(holeDay)) / dayMs)), [1, 2, 3, 4, 5], 'still no gaps');
assert.equal((await db.query(`select count(*)::int n from events where kind = 'plant'`)).rows[0].n, 5, 'its plant event went too');
for (let x; (x = (await dealt()).find((r) => /^[AB] /.test(r.question)));) await as(x.from_slot === 0 ? U.A : U.B, `select wh_unplant($1)`, [x.day]);
deal = await dealt();
assert.deepEqual(deal.map((r) => Math.round((new Date(r.day) - new Date(holeDay)) / dayMs)), [1, 2], 'back to the first two seeds');
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

// ── the house: questions build it, one answer a day each, answers hidden until answered
{
  const A = '00000000-0000-0000-0000-0000000000e1', B = '00000000-0000-0000-0000-0000000000e2', C = '00000000-0000-0000-0000-0000000000e3';
  for (const id of [A, B, C]) await db.query('insert into auth.users values ($1)', [id]);
  const [{ wh_create: hc }] = await as(A, 'select wh_create($1,$2,$3)', ['Manu', worm('Fideo'), BA]);
  await as(B, 'select wh_join($1,$2,$3,$4)', [hc.code, 'Vio', worm('Pickle'), MAD]);
  const U = { A, B, C };
  const add = (u, kind, q, opts, ans) => as(u, 'select wh_hq_add($1,$2,$3,$4) id', [kind, q, JSON.stringify(opts), ans]);
  const [{ id: q1 }] = await add(U.A, 'choice', 'What do I eat when I am sick?', ['Soup', 'Medialunas', 'Arroz'], 2);
  const [{ id: q2 }] = await add(U.A, 'yesno', 'Have I ever been to Japan?', null, 1);
  await add(U.A, 'choice', 'Favorite worm?', ['Fideo', 'Pickle'], 0);
  await fails(U.A, 'select wh_hq_add($1,$2,$3,$4)', ['choice', 'One option?', JSON.stringify(['Only']), 0], /bad_options/);
  await fails(U.A, 'select wh_hq_add($1,$2,$3,$4)', ['choice', 'Blank option', JSON.stringify(['A', ' ']), 0], /bad_options/);
  await fails(U.A, 'select wh_hq_add($1,$2,$3,$4)', ['choice', 'Out of range', JSON.stringify(['A', 'B']), 2], /bad_answer/);
  await fails(U.A, 'select wh_hq_add($1,$2,$3,$4)', ['essay', 'Nope', null, 0], /bad_kind/);
  // the table itself is out of reach; the partner's open question comes without its answer
  await fails(U.B, 'select * from house_questions', [], /permission denied/);
  let [{ wh_hq_state: st }] = await as(U.B, 'select wh_hq_state()');
  assert.equal(st.waiting, 3); assert.equal(st.pieces, 0); assert.equal(st.answered_today, false);
  assert.equal(st.next.id, q1); assert.equal(st.next.answer, undefined); assert.deepEqual(st.next.options, ['Soup', 'Medialunas', 'Arroz']);
  await fails(U.A, 'select wh_hq_answer($1,$2)', [q1, 2], /own_question/);
  await fails(U.B, 'select wh_hq_answer($1,$2)', [q1, 7], /bad_pick/);
  const [{ wh_hq_answer: r1 }] = await as(U.B, 'select wh_hq_answer($1,$2)', [q1, 2]);
  assert.equal(r1.correct, true); assert.equal(r1.pieces, 1);
  await fails(U.B, 'select wh_hq_answer($1,$2)', [q2, 1], /one_a_day/);
  await fails(U.B, 'select wh_hq_answer($1,$2)', [q1, 2], /already_answered/);
  [{ wh_hq_state: st }] = await as(U.B, 'select wh_hq_state()');
  assert.equal(st.answered_today, true); assert.equal(st.next, null); assert.equal(st.today_answer.correct, true); assert.equal(st.theirs.length, 1);
  // the other direction counts toward the same house
  const [{ id: q3 }] = await add(U.B, 'yesno', 'Do I sleep with socks on?', null, 0);
  const [{ wh_hq_answer: r3 }] = await as(U.A, 'select wh_hq_answer($1,$2)', [q3, 1]);
  assert.equal(r3.correct, false); assert.equal(r3.answer, 0); assert.equal(r3.pieces, 1);
  const [{ wh_hq_state: sa }] = await as(U.A, 'select wh_hq_state()');
  assert.equal(sa.mine.length, 3); assert.equal(sa.mine.find((q) => q.id === q1).correct, true); assert.equal(sa.pieces, 1);
  // take back an open one, not an answered one; outsiders get nothing
  await as(U.A, 'select wh_hq_delete($1)', [q2]);
  await as(U.A, 'select wh_hq_delete($1)', [q1]);
  const [{ wh_hq_state: sa2 }] = await as(U.A, 'select wh_hq_state()');
  assert.equal(sa2.mine.length, 2); assert.ok(sa2.mine.some((q) => q.id === q1));
  await fails(U.C, 'select wh_hq_state()', [], /no_hole/);
  console.log('house questions ok');
}

// ── Design Tinder: the deck starts once per pocket; their swipe is hidden until you swipe that card
{
  const A = '00000000-0000-0000-0000-0000000000f1', B = '00000000-0000-0000-0000-0000000000f2', C = '00000000-0000-0000-0000-0000000000f3';
  for (const id of [A, B, C]) await db.query('insert into auth.users values ($1)', [id]);
  const [{ wh_create: hc }] = await as(A, 'select wh_create($1,$2,$3)', ['Manu', worm('Fideo'), BA]);
  await as(B, 'select wh_join($1,$2,$3,$4)', [hc.code, 'Vio', worm('Pickle'), MAD]);
  await fails(B, 'select * from design_swipes', [], /permission denied/);
  await fails(B, 'select * from design_decks', [], /permission denied/);
  let [{ wh_ds_state: sa }] = await as(A, 'select wh_ds_state()');
  assert.equal(sa.started, sa.today); assert.deepEqual(sa.mine, []); assert.deepEqual(sa.theirs, []); assert.deepEqual(sa.pending, []);
  const swipe = (u, item, score, day = sa.today) => as(u, 'select wh_ds_swipe($1,$2,$3) r', [item, day, score]);
  await fails(A, 'select wh_ds_swipe($1,$2,$3)', ['Bad Item!', sa.today, 1], /bad_item/);
  await fails(A, 'select wh_ds_swipe($1,$2,$3)', ['egg', '2030-01-01', 1], /bad_day/);
  await fails(A, 'select wh_ds_swipe($1,$2,$3)', ['egg', sa.today, null], /bad_swipe/);
  await fails(A, 'select wh_ds_swipe($1,$2,$3)', ['egg', sa.today, 0], /bad_swipe/);
  await fails(A, 'select wh_ds_swipe($1,$2,$3)', ['egg', sa.today, 4], /bad_swipe/);
  let [{ r }] = await swipe(A, 'egg', 3);
  assert.equal(r.theirs, null);
  await swipe(A, 'pantheon', -2);
  // B sees that A swiped two cards, not which way
  let [{ wh_ds_state: sb }] = await as(B, 'select wh_ds_state()');
  assert.equal(sb.started, sa.started); assert.deepEqual(sb.pending, ['egg', 'pantheon']); assert.deepEqual(sb.theirs, []);
  [{ r }] = await swipe(B, 'egg', 1);
  assert.equal(r.theirs, 3); // a match: A adores it, B likes it
  [{ wh_ds_state: sb }] = await as(B, 'select wh_ds_state()');
  assert.deepEqual(sb.pending, ['pantheon']); assert.equal(sb.theirs.length, 1); assert.equal(sb.theirs[0].score, 3);
  // changing your mind keeps one row; undo removes yours only
  await swipe(A, 'pantheon', 2);
  [{ wh_ds_state: sa }] = await as(A, 'select wh_ds_state()');
  assert.equal(sa.mine.length, 2); assert.equal(sa.mine.find((x) => x.item === 'pantheon').score, 2);
  await as(B, 'select wh_ds_undo($1)', ['egg']);
  [{ wh_ds_state: sa }] = await as(A, 'select wh_ds_state()');
  assert.equal(sa.mine.length, 2); assert.deepEqual(sa.theirs, []);
  await fails(C, 'select wh_ds_state()', [], /no_hole/);
  console.log('design tinder ok');
}

// ── Five Letters: one word a day per pocket, locked on the first open; their guesses hidden until you're done
{
  const A = '00000000-0000-0000-0000-0000000000a1', B = '00000000-0000-0000-0000-0000000000a2', C = '00000000-0000-0000-0000-0000000000a3';
  const P = '00000000-0000-0000-0000-0000000000a4', Q = '00000000-0000-0000-0000-0000000000a5';
  for (const id of [A, B, C, P, Q]) await db.query('insert into auth.users values ($1)', [id]);
  const [{ wh_create: hc }] = await as(A, 'select wh_create($1,$2,$3)', ['Manu', worm('Fideo'), BA]);
  await as(B, 'select wh_join($1,$2,$3,$4)', [hc.code, 'Vio', worm('Pickle'), MAD]);
  const holeId = hc.hole_id;
  const plus = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const day = (v) => String(v).slice(0, 10);
  for (const t of ['fl_words', 'fl_days', 'fl_games']) await fails(B, `select * from ${t}`, [], /permission denied/);
  await fails(B, `select wh_fl_game(null::fl_games, true)`, [], /permission denied/);
  const state = async (u, fb = null) => (await as(u, 'select wh_fl_state($1) s', [fb]))[0].s;
  const guess = async (u, d, n, g) => (await as(u, 'select wh_fl_guess($1,$2,$3) r', [d, n, g]))[0].r;

  // no NYT word yet and no fallback: nothing locked in
  let sa = await state(A);
  const today = day(sa.today);
  assert.equal(sa.word, null); assert.equal(day(sa.nyt_day), plus(today, -2)); assert.equal(sa.mine, null); assert.deepEqual(sa.days, []);
  await fails(A, 'select wh_fl_guess($1,$2,$3)', [today, 1, 'crane'], /no_word/);
  // the words function puts the NYT answer from two days before in; the next open locks it for both
  await db.query(`insert into fl_words (day, word) values ($1, 'crane'), ($2, 'zesty')`, [plus(today, -2), plus(today, -1)]);
  sa = await state(A, 'proud'); // a fallback is ignored when the NYT word is there
  assert.equal(sa.word, 'crane'); assert.equal(day(sa.nyt), plus(today, -2));
  let sb = await state(B);
  assert.equal(sb.word, 'crane'); assert.equal(sb.theirs, null);

  await fails(A, 'select wh_fl_guess($1,$2,$3)', [today, 1, 'cran'], /bad_guess/);
  await fails(A, 'select wh_fl_guess($1,$2,$3)', [today, 1, 'cr4ne'], /bad_guess/);
  await fails(A, 'select wh_fl_guess($1,$2,$3)', [today, 2, 'slate'], /out_of_order/);
  await fails(A, 'select wh_fl_guess($1,$2,$3)', [plus(today, 1), 1, 'slate'], /no_word/);
  let r = await guess(A, today, 1, 'SLATE');
  assert.deepEqual(r.mine.guesses, ['slate']); assert.equal(r.mine.done, false); assert.equal(r.theirs, null);
  r = await guess(A, today, 2, 'trace');
  r = await guess(A, today, 2, 'trace'); // sent again after a dropped connection: saved once
  assert.deepEqual(r.mine.guesses, ['slate', 'trace']);
  await fails(A, 'select wh_fl_guess($1,$2,$3)', [today, 2, 'brace'], /out_of_order/);
  // Vio sees how far Manu got, never his guesses
  sb = await state(B);
  assert.equal(sb.theirs.n, 2); assert.equal(sb.theirs.done, false); assert.equal(sb.theirs.guesses, undefined);
  r = await guess(A, today, 3, 'crane');
  assert.equal(r.mine.solved, true); assert.equal(r.mine.done, true); assert.equal(r.mine.n, 3);
  await fails(A, 'select wh_fl_guess($1,$2,$3)', [today, 4, 'proud'], /done/);
  r = await guess(A, today, 3, 'crane'); // retry of the winning guess is fine
  assert.equal(r.mine.n, 3);
  sb = await state(B);
  assert.equal(sb.theirs.solved, true); assert.equal(sb.theirs.n, 3); assert.equal(sb.theirs.guesses, undefined);
  // Vio misses all six; finishing shows her Manu's grid, and shows him hers
  for (const [i, g] of ['about', 'house', 'pride', 'quiet', 'lemon', 'fight'].entries()) r = await guess(B, today, i + 1, g);
  assert.equal(r.mine.done, true); assert.equal(r.mine.solved, false); assert.equal(r.mine.n, 6);
  assert.deepEqual(r.theirs.guesses, ['slate', 'trace', 'crane']);
  await fails(B, 'select wh_fl_guess($1,$2,$3)', [today, 7, 'crane'], /done/);
  sa = await state(A);
  assert.deepEqual(sa.theirs.guesses, ['about', 'house', 'pride', 'quiet', 'lemon', 'fight']); assert.equal(sa.mine.solved, true);

  // earlier days: yesterday stays open only to finish a game started before midnight, and their
  // guesses stay hidden while yours is unfinished; older days show everything
  const y = plus(today, -1), old = plus(today, -3);
  await db.query(`insert into fl_days (hole_id, day, word, nyt_day) values ($1, $2, 'zesty', $3), ($1, $4, 'moist', null)`, [holeId, y, plus(today, -3), old]);
  await db.query(`insert into fl_games (hole_id, slot, day, guesses, solved, done) values
    ($1, 0, $2, '{nymph}', false, false), ($1, 1, $2, '{zesty}', true, true), ($1, 1, $3, '{moist}', true, true)`, [holeId, y, old]);
  sa = await state(A);
  assert.equal(sa.days.length, 2); assert.equal(day(sa.days[0].day), y); assert.equal(day(sa.days[1].day), old);
  assert.equal(sa.days[0].theirs.guesses, undefined); assert.equal(sa.days[0].theirs.n, 1);
  assert.deepEqual(sa.days[1].theirs.guesses, ['moist']); assert.equal(sa.days[1].mine, null); assert.equal(sa.days[1].word, 'moist'); assert.equal(sa.days[1].nyt, null);
  sb = await state(B);
  assert.equal(sb.days[0].theirs.n, 1); assert.deepEqual(sb.days[0].theirs.guesses, ['nymph']); // she finished yesterday's
  await fails(B, 'select wh_fl_guess($1,$2,$3)', [old, 2, 'crane'], /bad_day|done/);
  r = await guess(A, y, 2, 'zesty');
  assert.equal(r.mine.solved, true); assert.deepEqual(r.theirs.guesses, ['zesty']);
  sa = await state(A);
  assert.deepEqual(sa.days[0].theirs.guesses, ['zesty']);
  // a day you never started can't be played after it's over
  await db.query(`insert into fl_days (hole_id, day, word) values ($1, $2, 'fjord')`, [holeId, plus(today, -4)]);
  await fails(A, 'select wh_fl_guess($1,$2,$3)', [plus(today, -4), 1, 'fjord'], /bad_day/);
  assert.equal((await db.query(`select count(*)::int n from fl_games where day = $1`, [plus(today, -4)])).rows[0].n, 0);

  // a pocket that opens before the NYT word is in: the app's word from its own list is locked in for the day
  const [{ wh_create: pc }] = await as(P, 'select wh_create($1,$2,$3)', ['Ana', worm('Tito'), MAD]);
  await as(Q, 'select wh_join($1,$2,$3,$4)', [pc.code, 'Leo', worm('Bo'), BA]);
  let sp = await state(P);
  const ptoday = day(sp.today);
  await db.query(`delete from fl_words where day = $1`, [plus(ptoday, -2)]);
  await db.query(`delete from fl_days where hole_id = $1`, [pc.hole_id]);
  sp = await state(P, ' Proud ');
  assert.equal(sp.word, 'proud'); assert.equal(sp.nyt, null);
  await db.query(`insert into fl_words (day, word) values ($1, 'crane') on conflict do nothing`, [plus(ptoday, -2)]);
  assert.equal((await state(Q, 'other')).word, 'proud');
  assert.equal((await state(P)).word, 'proud');
  await fails(C, 'select wh_fl_state()', [], /no_hole/);
  await fails(C, 'select wh_fl_guess($1,$2,$3)', [today, 1, 'crane'], /no_hole/);
  // deleting a pocket takes its days and games with it; the NYT words stay
  await as(P, 'select wh_leave()'); await as(Q, 'select wh_leave()');
  assert.equal((await db.query(`select count(*)::int n from fl_days where hole_id = $1`, [pc.hole_id])).rows[0].n, 0);
  assert.ok((await db.query(`select count(*)::int n from fl_words`)).rows[0].n >= 2);
  console.log('five letters ok');
}
