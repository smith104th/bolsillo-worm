// Talks to Supabase: anonymous sign-in, RPCs, realtime presence + fingertips.
import { createClient } from '@supabase/supabase-js';

const EVENT_COLS = 'id,hole_id,from_slot,kind,payload,media_id,created_at,opened_at,kept,updated_at';
const ARCHIVE_KINDS = ['note', 'doodle', 'photo', 'whisper', 'wiggle', 'song', 'trinket'];

export function supabaseBackend(cfg) {
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bw-auth', detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 30 } },
  });
  let channel = null;
  let userId = null;
  let mySlot = 0;
  const mediaCache = new Map();

  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(error.message || String(error));
    return data;
  };

  // ── photos and whispers in R2 (supabase/functions/media) ─────────────
  // Uploads go through the media function, which keeps the bucket's keys; reads come
  // straight from R2 through short-lived links. Each file is downloaded once per phone
  // and kept in Cache Storage ('bw-media'). Until R2 is set up (ping says not ready),
  // everything keeps working the old way, with the bytes in the database.
  const fnUrl = `${cfg.supabaseUrl}/functions/v1/media`;
  const callMedia = async (op, { body = null, type = null, json = null } = {}) => {
    const { data: { session } } = await sb.auth.getSession();
    const headers = { apikey: cfg.supabaseKey, Authorization: `Bearer ${session?.access_token || cfg.supabaseKey}` };
    if (json) headers['content-type'] = 'application/json';
    else if (type) headers['content-type'] = type;
    const res = await fetch(`${fnUrl}?op=${op}`, { method: 'POST', headers, body: json ? JSON.stringify(json) : body });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `media_${res.status}`);
    return out;
  };
  // asked once per session; if the function can't be reached, ask again in 10 minutes
  let r2 = null;
  const r2Ready = () => (r2 ??= callMedia('ping').then((o) => !!o.ready, () => { setTimeout(() => { r2 = null; }, 600000); return false; }));
  const MEDIA_CACHE = 'bw-media';
  const cacheKey = (id) => new URL(`./__media/${id}`, location.href).href;
  const toDataUrl = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
  async function cached(id) {
    try { const res = await (await caches.open(MEDIA_CACHE)).match(cacheKey(id)); if (res) { const blob = await res.blob(); return { mime: blob.type || res.headers.get('content-type'), data: await toDataUrl(blob) }; } } catch { /* no cache here */ }
    return null;
  }
  async function keep(id, blob) {
    try { await (await caches.open(MEDIA_CACHE)).put(cacheKey(id), new Response(blob, { headers: { 'content-type': blob.type } })); } catch { /* it'll download again next time */ }
  }
  // a data URL from the app → "media:<id>" once it's in R2, or the data URL itself if R2 isn't there
  async function stash(dataUrl, mime) {
    if (!dataUrl || !String(dataUrl).startsWith('data:') || !(await r2Ready())) return dataUrl;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const type = mime || blob.type || 'application/octet-stream';
      const { id } = await callMedia('put', { body: blob, type });
      keep(id, blob.type === type ? blob : new Blob([blob], { type }));
      return `media:${id}`;
    } catch { return dataUrl; } // the old way still works; never lose a photo over this
  }
  // links are asked for in batches, so "Save everything" doesn't make one call per photo
  let want = new Map(), wantTimer = null;
  function linkFor(id) {
    return new Promise((ok, no) => {
      want.set(id, [...(want.get(id) || []), { ok, no }]);
      if (wantTimer) return;
      wantTimer = setTimeout(async () => {
        const batch = want; want = new Map(); wantTimer = null;
        const ids = [...batch.keys()];
        for (let i = 0; i < ids.length; i += 200) {
          const part = ids.slice(i, i + 200);
          try {
            const { urls } = await callMedia('url', { json: { ids: part } });
            for (const k of part) for (const w of batch.get(k)) urls?.[k] ? w.ok(urls[k]) : w.no(new Error('no_link'));
          } catch (e) { for (const k of part) for (const w of batch.get(k)) w.no(e); }
        }
      }, 25);
    });
  }

  return {
    kind: 'supabase',
    async init() {
      // getSession can hang on iPhone (token refresh on a dead connection, a stuck auth lock).
      // After 6 s fall back to the user id already stored on the phone; the client keeps refreshing on its own.
      const stalled = new Promise((ok) => setTimeout(() => ok('stalled'), 6000));
      const got = await Promise.race([sb.auth.getSession(), stalled]);
      if (got === 'stalled') {
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem('bw-auth') || 'null'); } catch {}
        const id = stored?.user?.id || stored?.currentSession?.user?.id;
        if (!id) throw new Error('Signing in timed out');
        userId = id;
        return userId;
      }
      let { data: { session } } = got;
      if (!session) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw new Error(error.message);
        session = data.session;
      }
      userId = session.user.id;
      return userId;
    },
    get userId() { return userId; },
    async load() {
      const [h, m, e] = await Promise.all([
        sb.from('holes').select('*').maybeSingle(),
        sb.from('members').select('*').order('slot'),
        sb.from('events').select(EVENT_COLS).order('created_at', { ascending: false }).limit(500),
      ]);
      for (const r of [h, m, e]) if (r.error) throw new Error(r.error.message);
      return { hole: h.data, members: m.data || [], events: e.data || [] };
    },
    // what changed since the phone last looked (new things, opens, keeps, pet counts), oldest first.
    // Comes back full (`more`) when there's too much to merge; the caller reloads instead.
    async since(ts, limit = 400) {
      const [h, m, e] = await Promise.all([
        sb.from('holes').select('*').maybeSingle(),
        sb.from('members').select('*').order('slot'),
        sb.from('events').select(EVENT_COLS).gt('updated_at', ts).order('updated_at', { ascending: true }).limit(limit),
      ]);
      for (const r of [h, m, e]) if (r.error) throw new Error(r.error.message);
      return { hole: h.data, members: m.data || [], events: e.data || [], more: (e.data || []).length >= limit };
    },
    create: (name, worm, place) => rpc('wh_create', { p_name: name, p_worm: worm, p_place: place }),
    join: (code, name, worm, place) => rpc('wh_join', { p_code: code, p_name: name, p_worm: worm, p_place: place }),
    reclaim: (code, slot) => rpc('wh_reclaim', { p_code: code, p_slot: slot }),
    leave: () => rpc('wh_leave'),
    act: async (kind, payload = {}, media = null, mime = null) => rpc('wh_act', { p_kind: kind, p_payload: payload, p_media: await stash(media, mime), p_mime: mime }),
    open: (id, keep = null) => rpc('wh_open', { p_id: id, p_keep: keep }),
    updateMe: (patch) => rpc('wh_update_me', { p: patch }),
    setReunion: (on, note) => rpc('wh_set_reunion', { p_on: on, p_note: note }),
    daily: async (day, { answer = null, photo = null, mime = null, thumb = null }) =>
      rpc('wh_daily', { p_day: day, p_answer: answer, p_photo: await stash(photo, mime), p_mime: mime, p_thumb: thumb }),
    dailies: (limit = 120) => rpc('wh_dailies', { p_limit: limit }),
    plant: (question) => rpc('wh_plant', { p_question: question }),
    unplant: (day) => rpc('wh_unplant', { p_day: day }),
    planted: () => rpc('wh_planted'),
    stats: (from, to) => rpc('wh_stats', { p_from: from, p_to: to }),
    seal: (payload, body, photo = null, mime = null) => rpc('wh_seal', { p_payload: payload, p_body: body, p_photo: photo, p_mime: mime }),
    unseal: (id) => rpc('wh_unseal', { p_id: id }),
    // the house: questions about each other, one answer a day, right answers build it
    hqState: () => rpc('wh_hq_state'),
    hqAdd: (kind, question, options, answer) => rpc('wh_hq_add', { p_kind: kind, p_question: question, p_options: options, p_answer: answer }),
    hqAnswer: (id, pick) => rpc('wh_hq_answer', { p_id: id, p_pick: pick }),
    hqDelete: (id) => rpc('wh_hq_delete', { p_id: id }),
    // Design Tinder: the deck's start day for this pocket and who swiped what (theirs only once you have)
    dsState: () => rpc('wh_ds_state'),
    dsSwipe: (item, day, score) => rpc('wh_ds_swipe', { p_item: item, p_day: day, p_score: score }),
    dsUndo: (item) => rpc('wh_ds_undo', { p_item: item }),
    // the shelf: everything left for later, plus what either of you kept
    async shelf() {
      const { data, error } = await sb.from('events').select(EVENT_COLS).or('kind.eq.later,kept.eq.true').order('created_at', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      return data || [];
    },
    // everything that ever came through the hole, newest first, a page at a time
    async archive({ before = null, after = null, limit = 80 } = {}) {
      let q = sb.from('events').select(EVENT_COLS).in('kind', ARCHIVE_KINDS).order('created_at', { ascending: false }).limit(limit);
      if (before) q = q.lt('created_at', before);
      if (after) q = q.gte('created_at', after);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data || [];
    },
    // every event in the pocket, oldest first (for "Save everything")
    async allEvents() {
      const out = [], page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await sb.from('events').select(EVENT_COLS).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + page - 1);
        if (error) throw new Error(error.message);
        out.push(...(data || []));
        if (!data || data.length < page) break;
      }
      return out;
    },
    // { mime, data } with data as a data URL, wherever the file lives
    media(id) {
      if (mediaCache.has(id)) return mediaCache.get(id);
      const p = (async () => {
        const hit = await cached(id);
        if (hit) return hit;
        const { data: row, error } = await sb.from('media').select('mime,data,r2').eq('id', id).single();
        if (error) throw new Error(error.message);
        if (row.data) return { mime: row.mime, data: row.data }; // not moved to R2 yet
        const res = await fetch(await linkFor(id));
        if (!res.ok) throw new Error(`media_${res.status}`);
        const blob = await res.blob();
        keep(id, blob);
        return { mime: row.mime, data: await toDataUrl(blob) };
      })();
      mediaCache.set(id, p);
      p.catch(() => mediaCache.delete(id));
      return p;
    },
    // moves old photos out of the database into R2, a few at a time (once a day is plenty)
    async moveOldMedia() {
      if (!(await r2Ready())) return { moved: 0, left: null };
      let total = 0;
      for (let i = 0; i < 100; i++) {
        const { moved, left } = await callMedia('migrate');
        total += moved;
        if (!moved || !left) return { moved: total, left };
      }
      return { moved: total, left: null };
    },
    async vapidKey() {
      const { data, error } = await sb.functions.invoke('nudge', { body: { kind: 'vapid' } });
      if (error || !data?.publicKey) throw new Error(error?.message || 'no push key');
      return data.publicKey;
    },
    async nudge(kind, extra = {}) {
      try { await sb.functions.invoke('nudge', { body: { kind, extra } }); } catch { /* push is best-effort */ }
    },
    connect(holeId, slot, on) {
      mySlot = slot;
      if (channel) sb.removeChannel(channel);
      const ch = sb.channel(`hole:${holeId}`, { config: { broadcast: { self: false, ack: false }, presence: { key: String(slot) } } });
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `hole_id=eq.${holeId}` }, (p) => on.event?.(p.new, p.eventType))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `hole_id=eq.${holeId}` }, (p) => on.member?.(p.new, p.eventType))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'holes', filter: `id=eq.${holeId}` }, (p) => on.hole?.(p.new))
        .on('presence', { event: 'sync' }, () => on.presence?.(ch.presenceState()))
        .on('broadcast', { event: 'live' }, ({ payload }) => on.live?.(payload))
        .on('system', {}, (m) => { if (m?.status === 'ok' || m?.extension === 'postgres_changes') on.ready?.(); })
        .subscribe(async (status) => {
          on.status?.(status);
          if (status === 'SUBSCRIBED') { try { await ch.track({ slot, at: Date.now() }); } catch { /* */ } }
        });
      channel = ch;
    },
    async track(here) {
      if (!channel) return;
      try { here ? await channel.track({ slot: mySlot, at: Date.now() }) : await channel.untrack(); } catch { /* */ }
    },
    send(payload) {
      if (channel) channel.send({ type: 'broadcast', event: 'live', payload }).catch(() => {});
    },
    channelState: () => channel?.state,
    disconnect() { if (channel) { sb.removeChannel(channel); channel = null; } },
  };
}
