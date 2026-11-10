// The red number on the home-screen icon, and the bit of state the service worker reads
// (src/sw.js): the badge count, their name for grouped pushes, and the running counts.
const STATE = 'bw-state';
const GROUPED = ['kiss', 'react', 'knock'];
const stateUrl = () => new URL('./__bw-state', location.href).href;

// one write at a time, so two quick patches can't undo each other
let queue = Promise.resolve();
function patchState(fn) {
  if (!('caches' in window)) return queue;
  queue = queue.then(async () => {
    try {
      const c = await caches.open(STATE);
      const r = await c.match(stateUrl());
      const next = fn(r ? await r.json() : {});
      await c.put(stateUrl(), new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } }));
    } catch { /* the badge is a nicety */ }
  });
  return queue;
}

let shown = null;
// n = things still waiting for you (unopened in the pocket, capsules whose day has come)
export function setBadge(n, name) {
  if (shown && shown.n === n && shown.name === name) return;
  shown = { n, name };
  try {
    if (n > 0) navigator.setAppBadge?.(n)?.catch?.(() => {});
    else navigator.clearAppBadge?.()?.catch?.(() => {});
  } catch { /* */ }
  patchState((s) => ({ ...s, badge: n, name: name || s.name || null }));
}

// Back in the app: grouped pushes start counting from one again, the old grouped
// notifications go away (what they announced is in the pocket now), and the next
// setBadge writes the exact count even if it hasn't changed on this side.
export function freshOpen() {
  shown = null;
  patchState((s) => ({ ...s, groups: {} }));
  navigator.serviceWorker?.getRegistration?.()
    .then((r) => r?.getNotifications?.())
    .then((list) => (list || []).forEach((n) => { if (GROUPED.includes(n.tag)) n.close(); }))
    .catch(() => {});
}
