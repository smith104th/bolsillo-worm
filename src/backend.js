// Talks to Supabase: anonymous sign-in, RPCs, realtime presence + fingertips.
import { createClient } from '@supabase/supabase-js';

const EVENT_COLS = 'id,hole_id,from_slot,kind,payload,media_id,created_at,opened_at,kept';
const ARCHIVE_KINDS = ['note', 'doodle', 'photo', 'whisper', 'wiggle', 'trinket'];

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

  return {
    kind: 'supabase',
    async init() {
      let { data: { session } } = await sb.auth.getSession();
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
    create: (name, worm, place) => rpc('wh_create', { p_name: name, p_worm: worm, p_place: place }),
    join: (code, name, worm, place) => rpc('wh_join', { p_code: code, p_name: name, p_worm: worm, p_place: place }),
    reclaim: (code, slot) => rpc('wh_reclaim', { p_code: code, p_slot: slot }),
    leave: () => rpc('wh_leave'),
    act: (kind, payload = {}, media = null, mime = null) => rpc('wh_act', { p_kind: kind, p_payload: payload, p_media: media, p_mime: mime }),
    open: (id, keep = null) => rpc('wh_open', { p_id: id, p_keep: keep }),
    updateMe: (patch) => rpc('wh_update_me', { p: patch }),
    setReunion: (on, note) => rpc('wh_set_reunion', { p_on: on, p_note: note }),
    daily: (day, { answer = null, photo = null, mime = null, thumb = null }) =>
      rpc('wh_daily', { p_day: day, p_answer: answer, p_photo: photo, p_mime: mime, p_thumb: thumb }),
    dailies: (limit = 120) => rpc('wh_dailies', { p_limit: limit }),
    plant: (question) => rpc('wh_plant', { p_question: question }),
    unplant: (day) => rpc('wh_unplant', { p_day: day }),
    planted: () => rpc('wh_planted'),
    stats: (from, to) => rpc('wh_stats', { p_from: from, p_to: to }),
    // everything that ever came through the hole, newest first, a page at a time
    async archive({ before = null, after = null, limit = 80 } = {}) {
      let q = sb.from('events').select(EVENT_COLS).in('kind', ARCHIVE_KINDS).order('created_at', { ascending: false }).limit(limit);
      if (before) q = q.lt('created_at', before);
      if (after) q = q.gte('created_at', after);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data || [];
    },
    async media(id) {
      if (mediaCache.has(id)) return mediaCache.get(id);
      const { data, error } = await sb.from('media').select('mime,data').eq('id', id).single();
      if (error) throw new Error(error.message);
      mediaCache.set(id, data);
      return data;
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
