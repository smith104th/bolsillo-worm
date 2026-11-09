// Demo mode (?demo): a pretend partner so you can play without pairing.
import { rand, pick, dayIn } from './util.js';

export function mockBackend() {
  const now = () => new Date().toISOString();
  let id = 100;
  const me = 'me-user', them = 'them-user';
  const hole = { id: 'demo-hole', code: 'DEMO2026', created_at: new Date(Date.now() - 86400000 * 23).toISOString(), tunnel_km: 9800, dug_km: 3120, tunnels_done: 0, touches: 3, reunion_on: new Date(Date.now() + 86400000 * 17).toISOString().slice(0, 10), reunion_note: 'Same pocket' };
  const members = [];
  const events = [];
  const dailies = {};
  const media = new Map();
  let on = {};
  let present = true;
  const theirSlot = () => 1;

  const ev = (from, kind, payload = {}, extra = {}) => {
    const e = { id: ++id, hole_id: hole.id, from_slot: from, kind, payload, media_id: null, created_at: now(), opened_at: null, kept: false, ...extra };
    events.unshift(e);
    setTimeout(() => on.event?.(e, 'INSERT'), 30);
    return e;
  };
  const partner = () => members.find((m) => m.slot === 1);
  const mine = () => members.find((m) => m.slot === 0);

  function seed(name, worm, place) {
    members.push({ hole_id: hole.id, slot: 0, user_id: me, name, worm, place, love: 640, fed_at: now(), misted_at: new Date(Date.now() - 3600e3 * 30).toISOString(), petted_at: now(), seen_at: now(), push: null });
    members.push({ hole_id: hole.id, slot: 1, user_id: them, name: 'Luz', worm: { name: 'Pickle', color: 'lila', pattern: 'spots', acc: 'bow' }, place: { city: 'Madrid', country: 'Spain', lat: 40.42, lon: -3.7, tz: 'Europe/Madrid' }, love: 820, fed_at: new Date(Date.now() - 3600e3 * 30).toISOString(), misted_at: now(), petted_at: now(), seen_at: now(), push: null });
    const old = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    events.push(
      { id: ++id, hole_id: hole.id, from_slot: 1, kind: 'note', payload: { text: 'Found a café that plays only boleros. You would sit there for six hours.', paper: 'rosa' }, created_at: old(5), opened_at: null, kept: false },
      { id: ++id, hole_id: hole.id, from_slot: 1, kind: 'trinket', payload: { what: 'ticket', text: 'Metro', inscription: 'Line 1, thought of you between stops' }, created_at: old(9), opened_at: old(8), kept: true },
      { id: ++id, hole_id: hole.id, from_slot: 1, kind: 'wiggle', payload: { pattern: [120, 90, 120, 90, 400], label: 'te quiero' }, created_at: old(20), opened_at: null, kept: false },
      { id: ++id, hole_id: hole.id, from_slot: 1, kind: 'doodle', payload: { strokes: [{ c: '#C4314B', w: 22, p: [300, 420, 360, 330, 450, 320, 500, 400, 550, 320, 640, 330, 700, 420, 600, 560, 500, 660, 400, 560, 300, 420] }] }, created_at: old(30), opened_at: null, kept: false },
      { id: ++id, hole_id: hole.id, from_slot: 0, kind: 'kiss', payload: { level: 3 }, created_at: old(2), opened_at: null, kept: false },
    );
  }

  function botLoop() {
    setInterval(() => {
      if (!members.length) return;
      const r = Math.random();
      if (r < 0.25) { ev(1, 'pet', { n: 1 }); }
      else if (r < 0.32) ev(1, 'kiss', { level: 1 + Math.floor(Math.random() * 5) });
      else if (r < 0.36) ev(1, 'note', { text: pick(['Your worm keeps stealing my crumbs.', 'Te extraño, gusano.', 'Ate a medialuna in your honor.']), paper: pick(['cream', 'celeste', 'limon']) });
      else if (r < 0.39) ev(1, 'trinket', { what: pick(['pebble', 'leaf', 'coin', 'flower', 'feather']), inscription: 'from my walk' });
      else if (r < 0.41) ev(1, 'knock', {});
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

  return {
    kind: 'mock',
    async init() { return me; },
    get userId() { return me; },
    async load() { return { hole: members.length ? { ...hole } : null, members: members.map((m) => ({ ...m })), events: events.map((e) => ({ ...e })) }; },
    async create(name, worm, place) { seed(name, worm, place); botLoop(); return { hole_id: hole.id, code: hole.code, slot: 0 }; },
    async join(code, name, worm, place) { seed(name, worm, place); botLoop(); return { hole_id: hole.id, code: hole.code, slot: 0 }; },
    async reclaim() { return { hole_id: hole.id, code: hole.code, slot: 0 }; },
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
      if (kind === 'note') setTimeout(() => ev(1, 'note', { text: 'Got it. Folding it into my wallet.', paper: 'cream' }), 5000);
      return e;
    },
    async open(eid, keep) { const e = events.find((x) => x.id === eid); if (e) { if (e.from_slot !== 0) e.opened_at = e.opened_at || now(); if (keep != null) e.kept = keep; on.event?.({ ...e }, 'UPDATE'); } },
    async updateMe(patch) { const m = mine(); if (m) Object.assign(m, patch.name ? { name: patch.name } : {}, patch.worm ? { worm: patch.worm } : {}, patch.place ? { place: patch.place } : {}); },
    async setReunion(on2, note) { hole.reunion_on = on2; hole.reunion_note = note; on.hole?.({ ...hole }); },
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
      const today = dayIn('UTC');
      if (!dailies[today]) dailies[today] = { 0: {}, 1: { answer: 'The bus driver singing along to the radio.' } };
      return Object.entries(dailies).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, v]) => ({
        day, my_answer: v[0].answer || null, their_answer: v[0].answer ? v[1].answer || null : null, their_answered: !!v[1].answer,
        my_photo: v[0].photo || null, my_thumb: v[0].thumb || null, their_photo: v[0].photo ? v[1].photo || null : null, their_thumb: v[0].photo ? v[1].thumb || null : null, their_photographed: !!v[1].photo,
      }));
    },
    async media(mid) { return media.get(mid); },
    async nudge() {},
    connect(holeId, slot, handlers) { on = handlers; setTimeout(() => { on.status?.('SUBSCRIBED'); on.presence?.({ 0: [{ slot: 0 }], 1: [{ slot: 1 }] }); }, 300); },
    async track() {},
    send() {},
    channelState: () => 'joined',
    disconnect() {},
  };
}
