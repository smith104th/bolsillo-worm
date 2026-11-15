// The daily rows (wh_dailies: each day's answers and photo previews) kept on the phone, so Today
// and Soil open at once from what the phone already has and catch up when the server answers.
// Manu, Nov 14: Today sat on "Digging…" on slow wifi while the rest of the app (which opens from
// the phone's copy) was snappy. Soil asks for every day's previews; Today only shows today's, so
// it asks for today's alone (p_thumb_days = 1) and older ones stay as the copy has them.
import { cache } from './cache.js';
import { dayNumber } from './util.js';

const KEY = 'dailies';
export const WAIT = 12000; // with nothing on the phone, past this say there's no signal (a late answer still shows)
const dayKey = (r) => String(r.day).slice(0, 10);

// Server rows with the previews it left out (days before the thumb window) taken from the copy.
// A preview is only reused for the same photo. Rows older than the server's list (it hit the
// limit) stay as the copy has them.
export function mergeDailies(fresh, old, { today, limit = 120, thumbDays = null } = {}) {
  if (!old?.length) return fresh;
  const byDay = new Map(old.map((r) => [dayKey(r), r]));
  const from = thumbDays ? dayNumber(today) - thumbDays + 1 : -Infinity;
  const out = fresh.map((r) => {
    const o = byDay.get(dayKey(r));
    if (!o || dayNumber(dayKey(r)) >= from) return r;
    return {
      ...r,
      my_thumb: r.my_thumb ?? (r.my_photo && r.my_photo === o.my_photo ? o.my_thumb : null),
      their_thumb: r.their_thumb ?? (r.their_photo && r.their_photo === o.their_photo ? o.their_thumb : null),
    };
  });
  if (fresh.length >= limit && fresh.length) {
    const last = dayKey(fresh[fresh.length - 1]);
    out.push(...old.filter((r) => dayKey(r) < last));
  }
  return out;
}

export function Dailies(app, { demo = false } = {}) {
  let rows = null, read = null;
  // the phone's copy is read once; after that the rows in memory are the newest
  const fromPhone = () => (read ??= (demo ? Promise.resolve(null) : cache.get(KEY))
    .then((c) => { if (!rows && Array.isArray(c)) rows = c; }, () => {})).then(() => rows);

  async function fetch({ limit = 120, thumbDays = null } = {}) {
    await fromPhone();
    const fresh = await app.backend.dailies(limit, thumbDays);
    rows = mergeDailies(fresh || [], rows, { today: app.today(), limit, thumbDays });
    if (!demo) cache.set(KEY, rows);
    return rows;
  }

  return {
    get rows() { return rows; },
    fetch,
    // draw(rows, state): first from the phone ('copy', or 'waiting' when it has nothing), then
    // from the server ('fresh'). With nothing on the phone and no answer within WAIT (or an
    // error), draw(null, 'offline'); a late answer still draws. Pass first = false on redraws
    // after something changed, so the old copy doesn't flash back before the new rows.
    async show(draw, opts = {}, { first = true } = {}) {
      if (first) { const have = await fromPhone(); draw(have, have ? 'copy' : 'waiting'); }
      let settled = false;
      const timer = setTimeout(() => { if (!settled && !rows) draw(null, 'offline'); }, WAIT);
      try { const r = await fetch(opts); settled = true; draw(r, 'fresh'); }
      catch (e) { settled = true; console.warn('dailies', e); if (!rows) draw(null, 'offline'); }
      finally { clearTimeout(timer); }
    },
  };
}
