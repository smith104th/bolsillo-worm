// Demo mode (?demo): a pretend partner so you can play without pairing.
import { rand, pick, dayIn, hash } from './util.js';
import { loadDeck, dealOrder } from './design.js';
import { loadWords, backupWord } from './letters.js';

export function mockBackend() {
  const now = () => new Date().toISOString();
  let id = 100;
  const me = 'me-user', them = 'them-user';
  const hole = { id: 'demo-hole', code: 'DEMO2026', created_at: new Date(Date.now() - 86400000 * 23).toISOString(), tunnel_km: 9800, dug_km: 3120, tunnels_done: 0, touches: 3, reunion_on: new Date(Date.now() + 86400000 * 17).toISOString().slice(0, 10), reunion_from: new Date(Date.now() - 86400000 * 6).toISOString().slice(0, 10), reunion_note: 'Same pocket' };
  const members = [];
  const events = [];
  const dailies = {};
  const planted = {};
  const sealed = new Map();
  const hq = [];
  const media = new Map();
  const ds = { started: null, swipes: [new Map(), new Map()] }; // Design Tinder: your swipes, Luz's
  const fl = { days: new Map(), games: [new Map(), new Map()], seeded: false }; // Five Letters: day → word; each of you: day → game
  let on = {};
  let present = true;
  const theirSlot = () => 1;

  const ev = (from, kind, payload = {}, extra = {}) => {
    const e = { id: ++id, hole_id: hole.id, from_slot: from, kind, payload, media_id: null, created_at: now(), opened_at: null, kept: false, ...extra };
    events.unshift(e);
    setTimeout(() => on.event?.(e, 'INSERT'), 30);
    return e;
  };
  // the house in the demo: a dozen right answers already, and three of Luz's questions waiting
  function seedHouse(today) {
    const past = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const done = (from, question, options, answer, picked, d) => hq.push({ id: `q${++id}`, from_slot: from, kind: options.length === 2 && options[0] === 'Yes' ? 'yesno' : 'choice', question, options, answer, created_at: past(d + 2), answered_at: past(d), answered_day: dayIn(mine()?.place?.tz || 'UTC', new Date(Date.now() - d * 86400000)), picked, correct: picked === answer });
    for (let i = 0; i < 12; i++) done(i % 2, `Old question ${i + 1}`, ['Yes', 'No'], 0, 0, 14 - i);
    done(1, 'What do I order every time at the café?', ['Cortado', 'Matcha', 'Submarino', 'Nothing, just water'], 2, 1, 1);
    const open = (question, options, answer, d) => hq.push({ id: `q${++id}`, from_slot: 1, kind: options.length === 2 && options[0] === 'Yes' ? 'yesno' : 'choice', question, options, answer, created_at: past(d), answered_at: null, answered_day: null, picked: null, correct: null });
    open('What did I want to be when I was little?', ['Astronaut', 'Vet', 'Architect', 'Pop star'], 2, 3);
    open('Have I ever slept in an airport?', ['Yes', 'No'], 0, 2);
    open('Which city would I move to tomorrow?', ['Lisbon', 'Mexico City', 'Tokyo'], 2, 1);
    void today;
  }
  const partner = () => members.find((m) => m.slot === 1);
  const mine = () => members.find((m) => m.slot === 0);

  function seed(name, worm, place) {
    members.push({ hole_id: hole.id, slot: 0, user_id: me, name, worm, place, love: 640, fed_at: now(), misted_at: new Date(Date.now() - 3600e3 * 30).toISOString(), petted_at: now(), seen_at: now(), push: null });
    members.push({ hole_id: hole.id, slot: 1, user_id: them, name: 'Luz', worm: { name: 'Pickle', color: 'lila', pattern: 'spots', acc: 'bow' }, place: { city: 'Madrid', country: 'Spain', lat: 40.42, lon: -3.7, tz: 'Europe/Madrid' }, love: 820, fed_at: new Date(Date.now() - 3600e3 * 30).toISOString(), misted_at: now(), petted_at: now(), seen_at: now(), push: null });
    const old = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    events.push(
      { id: ++id, hole_id: hole.id, from_slot: 1, kind: 'note', payload: { text: 'Found a café that plays only boleros. You would sit there for six hours.', paper: 'rosa' }, created_at: old(5), opened_at: null, kept: false },
      { id: ++id, hole_id: hole.id, from_slot: 1, kind: 'trinket', payload: { what: 'ticket', text: 'Metro', inscription: 'Line 1, thought of you between stops' }, created_at: old(9), opened_at: old(8), kept: true },
      { id: ++id, hole_id: hole.id, from_slot: 1, kind: 'song', payload: { provider: 'spotify', type: 'track', url: 'https://open.spotify.com/track/0nrRP2bk19rLc0orkWPQk2', embed: 'https://open.spotify.com/embed/track/0nrRP2bk19rLc0orkWPQk2', title: 'Wake Me Up', artist: 'Avicii', cover: fakeThumb(['#F6416C', '#FFF6B7'], '💿'), line: 'Para el viaje.' }, created_at: old(3), opened_at: null, kept: false },
      { id: ++id, hole_id: hole.id, from_slot: 1, kind: 'wiggle', payload: { pattern: [120, 90, 120, 90, 400], label: 'te quiero' }, created_at: old(20), opened_at: null, kept: false },
      { id: ++id, hole_id: hole.id, from_slot: 1, kind: 'doodle', payload: { strokes: [{ c: '#C4314B', w: 22, p: [300, 420, 360, 330, 450, 320, 500, 400, 550, 320, 640, 330, 700, 420, 600, 560, 500, 660, 400, 560, 300, 420] }] }, created_at: old(30), opened_at: null, kept: false },
      { id: ++id, hole_id: hole.id, from_slot: 0, kind: 'kiss', payload: { level: 3 }, created_at: old(2), opened_at: null, kept: false },
    );
    history(old);
  }

  // a few weeks of soil so the archive has layers
  function history(old) {
    const tz = mine()?.place?.tz || 'UTC';
    const add = (from, kind, payload, hAgo, openedAfter = 2) => events.push({ id: ++id, hole_id: hole.id, from_slot: from, kind, payload, media_id: null, created_at: old(hAgo), opened_at: old(hAgo - openedAfter), kept: false });
    add(1, 'note', { text: 'Bought the wrong oranges again. They taste like you being far away.', paper: 'limon' }, 24 * 4 + 3);
    add(0, 'note', { text: 'Your worm slept on my phone all night. I let him.', paper: 'celeste' }, 24 * 5 + 7);
    add(1, 'photo', { thumb: fakeThumb(['#F7B267', '#F4845F'], '🌇'), caption: 'Gran Vía at 8' }, 24 * 6 + 2);
    add(1, 'trinket', { what: 'leaf', inscription: 'Retiro, the big tree' }, 24 * 8 + 5);
    add(0, 'song', { provider: 'apple', type: 'song', url: 'https://music.apple.com/us/album/wahdon/1421088406?i=1421088814', embed: 'https://embed.music.apple.com/us/album/wahdon/1421088406?i=1421088814', title: 'Wahdon', artist: 'Fairouz', cover: fakeThumb(['#2B5876', '#4E4376'], '🎶'), line: 'Sunday morning.' }, 24 * 10 + 3);
    add(0, 'photo', { thumb: fakeThumb(['#8EC5FC', '#E0C3FC'], '🥐'), caption: 'medialuna count: 3' }, 24 * 9 + 1);
    add(1, 'wiggle', { pattern: [80, 90, 140, 420, 80, 90, 140], label: 'heartbeat' }, 24 * 11 + 4);
    add(0, 'doodle', { strokes: [{ c: '#2F7BFF', w: 14, p: [200, 700, 300, 500, 420, 640, 520, 420, 640, 600, 760, 380] }] }, 24 * 13 + 8);
    add(1, 'note', { text: 'Counting sleeps. Too many still.', paper: 'rosa' }, 24 * 16 + 1);
    const answers = [
      ['Choripán from the stand by the river.', 'Tortilla, still warm, eaten standing up.'],
      ['Buses and a guy practicing trumpet.', 'Rain on the skylight.'],
      ['The yellow light on the balcony at six.', 'Blue and cold. Very Madrid.'],
      ['Probably arguing about where to eat.', 'Walking with no plan, which is the plan.'],
      ['A train ticket with your name on it.', 'Your hoodie. The grey one.'],
      ['9. Lost a point for the subte.', '8 worms. Coffee was perfect.'],
    ];
    answers.forEach(([a, b], i) => {
      const day = dayIn(tz, new Date(Date.now() - (i + 1) * (i < 3 ? 1 : 2) * 86400000));
      dailies[day] = { 0: { answer: a }, 1: { answer: b } };
      if (i % 2 === 0) { dailies[day][0].thumb = fakeThumb(['#FFD3A5', '#FD6585'], ['☕', '🌳', '🚲'][i / 2]); dailies[day][0].photo = -1; dailies[day][1].thumb = fakeThumb(['#A1C4FD', '#C2E9FB'], ['🌧', '🍊', '🧣'][i / 2]); dailies[day][1].photo = -1; }
    });
    const day = (n) => dayIn(tz, new Date(Date.now() + n * 86400000));
    const later = (from, payload, body, hAgo, opened = null, photo = null) => {
      const e = { id: ++id, hole_id: hole.id, from_slot: from, kind: 'later', payload: { paper: 'rosa', photo: !!photo, ...payload }, media_id: null, created_at: old(hAgo), opened_at: opened, kept: false };
      events.push(e); sealed.set(e.id, { body, photo, mime: photo ? 'image/jpeg' : null });
    };
    later(1, { mode: 'when', label: 'you\'re sad', paper: 'rosa' }, { text: 'Hey. Put the kettle on, then read this twice. You are the best thing in my week, every week. The sad part ends. I will be right here when it does.' }, 40);
    later(1, { mode: 'when', label: 'you can\'t sleep', paper: 'celeste' }, { text: 'Count my worms. There are two. One is yours. Now close your eyes, gusano.' }, 24 * 6, old(24 * 3));
    later(1, { mode: 'when', label: 'you miss me', paper: 'limon' }, { text: 'Look at the moon. Same one. I am looking too, probably with a croissant.' }, 24 * 2);
    later(1, { mode: 'date', on: day(45) }, { text: 'Merry worm-mas.', caption: 'for December' }, 24 * 3, null, fakeThumb(['#FF9A8B', '#FF6A88'], '🎄'));
    later(1, { mode: 'date', on: day(-1) }, { text: 'One month of this pocket. Look how small we were.', caption: 'month one' }, 24 * 9, null, fakeThumb(['#A18CD1', '#FBC2EB'], '🪱'));
    later(0, { mode: 'when', label: 'you need a laugh', paper: 'limon' }, { text: 'Remember the pigeon at Retiro that stole your entire sandwich and then looked at you like you owed it more.' }, 24 * 4);
    later(0, { mode: 'date', on: day(17) }, { text: 'See you tomorrow. For real.', caption: '' }, 24 * 1);
    events.push({ id: ++id, hole_id: hole.id, from_slot: 1, kind: 'photo', payload: { thumb: fakeThumb(['#F6D365', '#FDA085'], '🌅'), caption: 'our sunset' }, media_id: null, created_at: old(24 * 7), opened_at: old(24 * 7 - 1), kept: true });
    events.push({ id: ++id, hole_id: hole.id, from_slot: 1, kind: 'note', payload: { text: 'You make Tuesdays feel like Fridays.', paper: 'celeste' }, media_id: null, created_at: old(24 * 12), opened_at: old(24 * 12 - 1), kept: true });
    const y = dayIn(tz, new Date(Date.now() - 2 * 86400000));
    planted[y] = { from_slot: 1, question: 'What is a song you would play at our worm wedding?' };
    planted[dayIn(tz, new Date(Date.now() + 3 * 86400000))] = { from_slot: 1, question: 'A secret for later.' };
  }
  function fakeThumb([a, b], emo) {
    const c = document.createElement('canvas'); c.width = c.height = 220;
    const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 220, 220);
    g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, 220, 220);
    x.font = '96px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emo, 110, 118);
    return c.toDataURL('image/jpeg', 0.7);
  }

  function botLoop() {
    setInterval(() => {
      if (!members.length) return;
      const r = Math.random();
      if (r < 0.25) { ev(1, 'pet', { n: 1 }); }
      else if (r < 0.32) ev(1, 'kiss', { level: 1 + Math.floor(Math.random() * 5) });
      else if (r < 0.36) ev(1, 'note', { text: pick(['Your worm keeps stealing my crumbs.', 'Te extraño, gusano.', 'Ate a medialuna in your honor.']), paper: pick(['white', 'celeste', 'limon']) });
      else if (r < 0.39) ev(1, 'song', { provider: 'youtube', type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', embed: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0', title: pick(['Never Gonna Give You Up', 'Lo que siento', 'Ojitos lindos']), artist: pick(['Rick Astley', 'Cuco', 'Bad Bunny']), cover: fakeThumb(['#43CBFF', '#9708CC'], '🎧'), line: 'listen to this one' });
      else if (r < 0.41) ev(1, 'knock', {});
      else if (r < 0.46) ev(1, 'react', { emoji: pick(['❤️', '🥺', '✨', '🔥']) });
    }, 9000);
    // live fingertip: lazy circles while "present"
    let a = 0, touching = false;
    setInterval(() => {
      if (!present) return;
      a += 0.06;
      if (Math.random() < 0.01) touching = !touching;
      on.live?.(touching ? { t: 'f', x: 0.5 + Math.cos(a) * 0.25, y: 0.45 + Math.sin(a * 1.3) * 0.2, d: 1 } : { t: 'f', d: 0 });
    }, 70);
    setInterval(() => { present = Math.random() < 0.7; on.presence?.(present ? { 0: [{ slot: 0 }], 1: [{ slot: 1 }] } : { 0: [{ slot: 0 }] }); }, 30000);
  }

  // Design Tinder in the demo: the deck started two days ago. You swiped the first day; Luz has
  // swiped both earlier days and three of today's, so there's a pile to catch up on and matches to find.
  async function seedDesign() {
    if (ds.started) return;
    const tz = mine()?.place?.tz || 'UTC';
    const day = (n) => dayIn(tz, new Date(Date.now() + n * 86400000));
    ds.started = day(-2);
    try {
      const order = dealOrder(await loadDeck(), hole.id);
      const score = (id, salt) => { const k = hash(id + salt) % 100; return k < 14 ? -3 : k < 28 ? -2 : k < 42 ? -1 : k < 62 ? 1 : k < 82 ? 2 : 3; };
      order.slice(0, 5).forEach((c) => { ds.swipes[0].set(c.id, { score: score(c.id, 'm'), day: day(-2) }); ds.swipes[1].set(c.id, { score: score(c.id, 'l'), day: day(-2) }); });
      order.slice(5, 10).forEach((c) => ds.swipes[1].set(c.id, { score: score(c.id, 'l'), day: day(-1) }));
      order.slice(10, 13).forEach((c) => ds.swipes[1].set(c.id, { score: score(c.id, 'l'), day: day(0) }));
    } catch (e) { console.warn('demo deck', e); }
  }

  // Five Letters in the demo: words from the app's own list (the demo never asks the NYT). The last nine
  // days have games for both of you (each of you skipped one), Luz already got today's in 4, and today
  // has a bonus word that Luz got in 3. Games are keyed "day#round".
  const flGame = (guesses, w) => ({ guesses, solved: guesses[guesses.length - 1] === w, done: guesses[guesses.length - 1] === w || guesses.length >= 6, at: now() });
  const flView = (g, full) => (g ? { n: g.guesses.length, solved: g.solved, done: g.done, at: g.at, ...(full ? { guesses: [...g.guesses] } : {}) } : null);
  async function seedLetters() {
    if (fl.seeded) return;
    const words = await loadWords();
    fl.seeded = true;
    const tz = mine()?.place?.tz || 'UTC';
    const day = (n) => dayIn(tz, new Date(Date.now() + n * 86400000));
    const other = (w, salt, i) => { const g = words.answers[hash(`${w}:${salt}:${i}`) % words.answers.length]; return g === w ? 'pique' : g; };
    const got = (w, k, salt) => [...Array.from({ length: k - 1 }, (_, i) => other(w, salt, i)), w];
    const miss = (w, salt) => Array.from({ length: 6 }, (_, i) => other(w, salt, i));
    for (let i = 9; i >= 1; i--) {
      const d = day(-i), w = backupWord(words, d);
      fl.days.set(`${d}#1`, { word: w, nyt: null });
      const play = (salt) => (hash(`${d}:${salt}:x`) % 8 === 0 ? miss(w, salt) : got(w, 2 + (hash(`${d}:${salt}`) % 5), salt));
      if (i !== 4) fl.games[0].set(`${d}#1`, flGame(play('m'), w));
      if (i !== 6) fl.games[1].set(`${d}#1`, flGame(play('l'), w));
    }
    const t = day(0), w = backupWord(words, t), wb = backupWord(words, `${t}:bonus`);
    fl.days.set(`${t}#1`, { word: w, nyt: null });
    fl.games[1].set(`${t}#1`, flGame(got(w, 4, 'today'), w));
    fl.days.set(`${t}#2`, { word: wb, nyt: null });
    fl.games[1].set(`${t}#2`, flGame(got(wb, 3, 'bonus'), wb));
  }

  return {
    kind: 'mock',
    async init() { return me; },
    get userId() { return me; },
    async since() { return { hole: members.length ? { ...hole } : null, members: members.map((m) => ({ ...m })), events: [], more: true }; },
    async load() { return { hole: members.length ? { ...hole } : null, members: members.map((m) => ({ ...m })), events: events.map((e) => ({ ...e })) }; },
    async create(name, worm, place) { seed(name, worm, place); botLoop(); return { hole_id: hole.id, code: hole.code, slot: 0 }; },
    async join(code, name, worm, place) { seed(name, worm, place); botLoop(); return { hole_id: hole.id, code: hole.code, slot: 0 }; },
    async reclaim() {
      if (!members.length) { seed('Manu', { name: 'Fideo', color: 'lombriz', pattern: 'rings', acc: 'beanie' }, { city: 'Buenos Aires', country: 'Argentina', lat: -34.6, lon: -58.38, tz: 'America/Argentina/Buenos_Aires' }); botLoop(); }
      return { hole_id: hole.id, code: hole.code, slot: 0 };
    },
    async allEvents() { return events.map((e) => ({ ...e })).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)); },
    async leave() { members.length = 0; },
    async act(kind, payload = {}, data = null, mime = null) {
      let e;
      if (kind === 'pet' || kind === 'boop') {
        e = events.find((x) => x.kind === kind && x.from_slot === 0 && Date.now() - new Date(x.created_at) < 180e3);
        if (e) { e.payload = { ...e.payload, n: (e.payload.n || 1) + 1 }; setTimeout(() => on.event?.(e, 'UPDATE'), 20); }
      }
      if (!e) {
        let mid = null;
        if (data) { mid = ++id; media.set(mid, { mime, data }); }
        e = ev(0, kind, payload, { media_id: mid });
      }
      const p = partner();
      if (p) { p.love += 3; if (kind === 'feed') p.fed_at = now(); if (kind === 'mist') p.misted_at = now(); if (['pet', 'boop', 'kiss'].includes(kind)) p.petted_at = now(); setTimeout(() => on.member?.({ ...p }, 'UPDATE'), 40); }
      hole.dug_km += 40; setTimeout(() => on.hole?.({ ...hole }), 50);
      if (kind === 'kiss') setTimeout(() => ev(1, 'kiss', { level: Math.min(5, (payload.level || 1) + 1) }), 2500);
      if (kind === 'note') setTimeout(() => ev(1, 'note', { text: 'Got it. Folding it into my wallet.', paper: 'rosa' }), 5000);
      if (kind === 'react' && !payload.to && !payload.day) setTimeout(() => ev(1, 'react', { emoji: pick(['🥰', '🫶', '😂', '🥺']) }), 2200);
      return e;
    },
    async open(eid, keep) { const e = events.find((x) => x.id === eid); if (e) { if (e.from_slot !== 0) e.opened_at = e.opened_at || now(); if (keep != null) e.kept = keep; on.event?.({ ...e }, 'UPDATE'); } },
    async updateMe(patch) { const m = mine(); if (m) Object.assign(m, patch.name ? { name: patch.name } : {}, patch.worm ? { worm: patch.worm } : {}, patch.place ? { place: patch.place } : {}); },
    async setReunion(on2, note) { const t = new Date().toISOString().slice(0, 10); if (!hole.reunion_on || hole.reunion_on < t || !hole.reunion_from) hole.reunion_from = t; hole.reunion_on = on2; hole.reunion_note = note; on.hole?.({ ...hole }); },
    async daily(day, d) {
      const k = day; dailies[k] = dailies[k] || { 0: {}, 1: {} };
      if (d.answer) dailies[k][0].answer = d.answer;
      if (d.photo) { const mid = ++id; media.set(mid, { mime: d.mime, data: d.photo }); dailies[k][0].photo = mid; dailies[k][0].thumb = d.thumb; }
      // the bot does theirs a few seconds later
      setTimeout(() => {
        if (d.answer && !dailies[k][1].answer) { dailies[k][1].answer = 'Honestly? Your voice note from this morning.'; ev(1, 'daily', { day, part: 'answer', both: true }); }
        if (d.photo && !dailies[k][1].photo) { dailies[k][1].photo = dailies[k][0].photo; dailies[k][1].thumb = d.thumb; ev(1, 'daily', { day, part: 'photo', both: true }); }
      }, 4000);
      return { both: false, fresh: true };
    },
    async dailies() {
      const today = dayIn(mine()?.place?.tz || 'UTC');
      if (!dailies[today]) dailies[today] = { 0: {}, 1: { answer: 'The bus driver singing along to the radio.' } };
      return Object.entries(dailies).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, v]) => ({
        day, my_answer: v[0].answer || null, their_answer: v[0].answer ? v[1].answer || null : null, their_answered: !!v[1].answer,
        my_photo: v[0].photo || null, my_thumb: v[0].thumb || null, their_photo: v[0].photo ? v[1].photo || null : null, their_thumb: v[0].photo ? v[1].thumb || null : null, their_photographed: !!v[1].photo,
      }));
    },
    async media(mid) { return media.get(mid); },
    async shelf() { return events.filter((e) => e.kind === 'later' || e.kept).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((e) => ({ ...e })); },
    async seal(payload, body, photo = null, mime = null) {
      const e = ev(0, 'later', { mode: payload.mode, label: payload.label || null, on: payload.on || null, photo: !!photo, paper: payload.paper || 'rosa' });
      sealed.set(e.id, { body, photo, mime });
      if (payload.mode === 'when') setTimeout(() => { e.opened_at = now(); on.event?.({ ...e }, 'UPDATE'); ev(1, 'unsealed', { to: e.id, label: payload.label, mode: 'when' }); }, 9000);
      return e;
    },
    async unseal(eid) {
      const e = events.find((x) => x.id === eid); const s2 = sealed.get(eid);
      if (!e || !s2) throw new Error('not_found');
      if (e.from_slot !== 0) {
        if (e.payload.mode === 'date' && e.payload.on > dayIn(mine()?.place?.tz || 'UTC')) throw new Error('not_yet');
        if (!e.opened_at) { e.opened_at = now(); setTimeout(() => on.event?.({ ...e }, 'UPDATE'), 20); }
      }
      return { body: s2.body, photo: s2.photo, mime: s2.mime, opened_at: e.opened_at };
    },
    async planted() {
      const today = dayIn(mine()?.place?.tz || 'UTC');
      return Object.entries(planted).filter(([d, v]) => v.from_slot === 0 || d <= today).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, v]) => ({ day, ...v }));
    },
    async plant(question) {
      const tz = mine()?.place?.tz || 'UTC';
      let t = Date.now() + 86400000; let d = dayIn(tz, new Date(t));
      while (planted[d]) { t += 86400000; d = dayIn(tz, new Date(t)); }
      planted[d] = { from_slot: 0, question: question.trim() };
      ev(0, 'plant', { day: d });
      return d;
    },
    async unplant(day) { if (planted[day]?.from_slot === 0) delete planted[day]; },
    async stats(from, to) {
      const m = new Map();
      for (const e of events) if (e.created_at >= from && e.created_at < to) { const k = e.kind + ':' + e.from_slot; m.set(k, (m.get(k) || 0) + (e.payload?.n || 1)); }
      return [...m].map(([k, n]) => ({ kind: k.split(':')[0], from_slot: +k.split(':')[1], n }));
    },
    async archive({ before = null, after = null, limit = 80 } = {}) {
      return events.filter((e) => ['note', 'doodle', 'photo', 'whisper', 'wiggle', 'song', 'trinket'].includes(e.kind) && (!before || e.created_at < before) && (!after || e.created_at >= after))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit).map((e) => ({ ...e }));
    },
    async hqState() {
      const today = dayIn(mine()?.place?.tz || 'UTC');
      if (!hq.length) seedHouse(today);
      const theirs = hq.filter((q) => q.from_slot === 1);
      const todayQ = theirs.find((q) => q.answered_day === today);
      const open = theirs.filter((q) => !q.answered_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      const strip = ({ answer, picked, correct, answered_at, answered_day, from_slot, ...rest }) => rest;
      return {
        today, pieces: hq.filter((q) => q.correct).length, answered_today: !!todayQ,
        today_answer: todayQ ? { ...todayQ } : null,
        next: todayQ ? null : (open[0] ? strip(open[0]) : null),
        waiting: open.length,
        mine: hq.filter((q) => q.from_slot === 0).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((q) => ({ ...q })),
        theirs: theirs.filter((q) => q.answered_at).sort((a, b) => (a.answered_at < b.answered_at ? 1 : -1)).map((q) => ({ ...q })),
      };
    },
    async hqAdd(kind, question, options, answer) {
      const opts = kind === 'yesno' ? ['Yes', 'No'] : options.map((o) => String(o).trim());
      if (opts.length < 2 || opts.some((o) => !o)) throw new Error('bad_options');
      if (answer < 0 || answer >= opts.length) throw new Error('bad_answer');
      const q = { id: `q${++id}`, from_slot: 0, kind, question: question.trim(), options: opts, answer, created_at: now(), answered_at: null, answered_day: null, picked: null, correct: null };
      hq.push(q);
      // in the demo, Luz answers your new question a little later
      setTimeout(() => { if (q.answered_at) return; q.answered_at = now(); q.answered_day = dayIn(mine()?.place?.tz || 'UTC'); q.picked = Math.random() < 0.7 ? q.answer : (q.answer + 1) % opts.length; q.correct = q.picked === q.answer; }, 8000);
      return q.id;
    },
    async hqAnswer(qid, pickI) {
      const today = dayIn(mine()?.place?.tz || 'UTC');
      const q = hq.find((x) => x.id === qid);
      if (!q) throw new Error('not_found');
      if (q.from_slot === 0) throw new Error('own_question');
      if (q.answered_at) throw new Error('already_answered');
      if (hq.some((x) => x.from_slot === 1 && x.answered_day === today)) throw new Error('one_a_day');
      Object.assign(q, { answered_at: now(), answered_day: today, picked: pickI, correct: pickI === q.answer });
      return { correct: q.correct, answer: q.answer, picked: pickI, pieces: hq.filter((x) => x.correct).length };
    },
    async dsState() {
      await seedDesign();
      const [m, t] = ds.swipes;
      return {
        today: dayIn(mine()?.place?.tz || 'UTC'), started: ds.started,
        mine: [...m].map(([item, v]) => ({ item, ...v })),
        theirs: [...t].filter(([k]) => m.has(k)).map(([item, v]) => ({ item, ...v })),
        pending: [...t.keys()].filter((k) => !m.has(k)),
      };
    },
    async dsSwipe(item, day, score) { ds.swipes[0].set(item, { score, day }); const t = ds.swipes[1].get(item); return { item, score, theirs: t ? t.score : null }; },
    async dsUndo(item) { ds.swipes[0].delete(item); },
    async flState() {
      await seedLetters();
      const today = dayIn(mine()?.place?.tz || 'UTC');
      if (!fl.days.has(`${today}#1`)) fl.days.set(`${today}#1`, { word: backupWord(await loadWords(), today), nyt: null });
      const one = (k) => { const [d, r] = k.split('#'); const m = fl.games[0].get(k); return { day: d, round: +r, word: fl.days.get(k).word, nyt: null, mine: flView(m, true), theirs: flView(fl.games[1].get(k), !!m?.done) }; };
      const keys = [...fl.days.keys()].sort((a, b) => (a < b ? 1 : -1));
      const t = one(`${today}#1`);
      return {
        today, nyt_day: null, word: t.word, nyt: null, mine: t.mine, theirs: t.theirs,
        extra: keys.filter((k) => k.startsWith(`${today}#`) && !k.endsWith('#1')).sort().map(one).map(({ day: _d, ...x }) => x),
        days: keys.filter((k) => k.split('#')[0] < today).map((k) => ({ ...one(k), theirs: flView(fl.games[1].get(k), true) })),
      };
    },
    async flGuess(day, n, guess, round = 1) {
      const k = `${day}#${round}`, d = fl.days.get(k);
      if (!d) throw new Error('no_word');
      let g = fl.games[0].get(k);
      if (!g) { g = flGame([], d.word); g.done = false; fl.games[0].set(k, g); }
      if (!(n === g.guesses.length && g.guesses[n - 1] === guess)) {
        if (g.done) throw new Error('done');
        if (n !== g.guesses.length + 1) throw new Error('out_of_order');
        g.guesses.push(guess); g.solved = guess === d.word; g.done = g.solved || g.guesses.length >= 6; g.at = now();
      }
      return { day, round, mine: flView(g, true), theirs: flView(fl.games[1].get(k), g.done) };
    },
    async flWords() { return { ready: false, got: [], missing: [] }; },
    async hqDelete(qid) { const i = hq.findIndex((x) => x.id === qid && x.from_slot === 0 && !x.answered_at); if (i >= 0) hq.splice(i, 1); },
    async nudge() {},
    connect(holeId, slot, handlers) { on = handlers; setTimeout(() => { on.status?.('SUBSCRIBED'); on.presence?.({ 0: [{ slot: 0 }], 1: [{ slot: 1 }] }); }, 300); },
    async track() {},
    send() {},
    channelState: () => 'joined',
    disconnect() {},
  };
}
