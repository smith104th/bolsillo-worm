// A copy of the pocket on the phone (IndexedDB), so the app opens from what it already
// has and only asks the server for what changed. Also the outbox: things sent with no
// signal wait here and go when it's back. Everything is best-effort: no IndexedDB, no cache.
const DB = 'bw', STORE = 'kv';
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((ok, no) => {
    if (!('indexedDB' in window)) return no(new Error('no_idb'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error);
    req.onblocked = () => no(new Error('blocked'));
    // iOS sometimes never answers indexedDB.open after the app was suspended: give up, open without the copy
    setTimeout(() => no(new Error('idb_timeout')), 2500);
  }).catch((e) => { dbp = null; throw e; });
  return dbp;
}
const tx = (mode, fn) => open().then((db) => new Promise((ok, no) => {
  const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
  t.oncomplete = () => ok(req?.result);
  t.onerror = () => no(t.error);
  t.onabort = () => no(t.error);
}));

export const cache = {
  get: (key) => tx('readonly', (s) => s.get(key)).catch(() => undefined),
  set: (key, val) => tx('readwrite', (s) => s.put(val, key)).catch(() => {}),
  del: (key) => tx('readwrite', (s) => s.delete(key)).catch(() => {}),
  clear: () => tx('readwrite', (s) => s.clear()).catch(() => {}),
};

// "Couldn't reach the server" as opposed to "the server said no"
export const offlineError = (e) => !navigator.onLine || /fetch|network|load failed|timed? ?out|connection/i.test(String(e?.message || e));
