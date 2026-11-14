// What the phone keeps of the pocket's events.
// The newest EVENT_CAP events, plus anything older that's still in the pocket: unopened things
// (either side) and opened ones that haven't composted yet. Nov 14: at a couple of hundred events a
// day (mostly kisses, pets and feeds), 500 reached back only 2–3 days, and an unopened doodle had
// dropped out of the pocket and off the badge.
export const ITEM_KINDS = ['note', 'doodle', 'photo', 'whisper', 'wiggle', 'song', 'trinket'];
export const EVENT_CAP = 500;
export const COMPOST_H = 72; // opened things settle into the soil after three days

const newestFirst = (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

// still floating in the pocket: an item that isn't kept and is unopened or opened < COMPOST_H ago
export function stillInPocket(e, now = Date.now()) {
  if (!ITEM_KINDS.includes(e.kind) || e.kept) return false;
  return !e.opened_at || now - Date.parse(e.opened_at) <= COMPOST_H * 3600e3;
}

// lists of events → one list, newest first, each id once (a later list's copy wins)
export function mergeEvents(...lists) {
  const byId = new Map();
  for (const list of lists) for (const e of list || []) byId.set(e.id, byId.has(e.id) ? { ...byId.get(e.id), ...e } : e);
  return [...byId.values()].sort(newestFirst);
}

// newest `cap`, then the older ones still in the pocket. Sorts in place and returns the same array.
export function trimEvents(events, cap = EVENT_CAP, now = Date.now()) {
  events.sort(newestFirst);
  if (events.length <= cap) return events;
  const older = events.slice(cap).filter((e) => stillInPocket(e, now));
  events.length = cap;
  events.push(...older);
  return events;
}

// created_at of the oldest event in the unbroken newest run (where "Show older" pages back from);
// the older items kept by trimEvents sit past it with gaps between them
export function windowEdge(events, cap = EVENT_CAP) {
  const n = Math.min(events.length, cap);
  return n ? events[n - 1].created_at : null;
}

// when the server loads: the time from which opened things still count as in the pocket
export const compostFrom = (now = Date.now()) => new Date(now - COMPOST_H * 3600e3).toISOString();
