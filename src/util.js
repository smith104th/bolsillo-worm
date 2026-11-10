export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// tiny hyperscript: h('div.card#x', {onclick}, 'text', child)
export function h(tag, attrs, ...kids) {
  const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9-]+)?(.*)$/i);
  const el = document.createElement(name);
  for (const m of rest.matchAll(/([.#])([\w-]+)/g)) {
    if (m[1] === '.') el.classList.add(m[2]); else el.id = m[2];
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && k !== 'type') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (k) => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) return k.forEach(add);
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return el;
}

export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
export const hoursSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : 999);

export function timeIn(tz, opts = {}) {
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined, ...opts }).format(new Date());
  } catch { return ''; }
}
export function hourIn(tz) {
  try {
    return +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz || undefined }).format(new Date());
  } catch { return new Date().getHours(); }
}
// YYYY-MM-DD in a given timezone
export function dayIn(tz, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch { return date.toISOString().slice(0, 10); }
}
export const dayNumber = (key) => Math.round(Date.parse(key + 'T00:00:00Z') / 86400000);
export function prettyDay(key) {
  const d = new Date(key + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
export const myTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function fmtDistance(km, units) {
  if (units === 'km') return `${Math.round(km).toLocaleString()} km`;
  return `${Math.round(km * 0.621371).toLocaleString()} mi`;
}

export function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem('bw:' + key));
    localStorage.setItem('bw:' + key, JSON.stringify(val));
  } catch { return undefined; }
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// iOS home-screen apps (iOS 26) draw behind the status bar but report a page one
// status-bar shorter than the screen, so everything pinned to the bottom stops
// early and a band of background shows below it. On an iPhone home-screen app,
// when the page comes up short, size the body to the real screen and make it the
// containing block for every fixed element (html.fullfix). Elsewhere: no change.
// `?fitgap=54` fakes the gap for testing in a desktop browser.
let fullH = 0;
export const viewH = () => fullH || window.innerHeight;
export function fitScreen() {
  const portrait = window.innerHeight >= window.innerWidth;
  const sh = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width);
  const fake = Number(new URLSearchParams(location.search).get('fitgap')) || 0;
  const target = fake ? window.innerHeight + fake : sh;
  const gap = target - window.innerHeight;
  const iphoneApp = /iphone/i.test(navigator.userAgent) && isStandalone();
  const fix = (iphoneApp || fake > 0) && gap > 8 && gap < 140;
  fullH = fix ? target : 0;
  const root = document.documentElement;
  root.classList.toggle('fullfix', fix);
  if (fix) root.style.setProperty('--app-h', `${target}px`); else root.style.removeProperty('--app-h');
}
let fitting = false;
export function watchScreen() {
  if (fitting) return; fitting = true;
  fitScreen();
  window.addEventListener('resize', fitScreen);
  window.addEventListener('orientationchange', () => setTimeout(fitScreen, 250));
}
