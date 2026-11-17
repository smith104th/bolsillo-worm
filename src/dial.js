// The Dial (Manu, Nov 16): one of the games. A scale like "Cold to Hot" with a target hidden somewhere
// on it. The giver sees the target and gives a clue that lands on it ("soup" sits near Hot); the other
// turns the dial to where they think it is. 4 points in the middle of the target, then 3, then 2, and
// you score together. Each of you gives your own clues, one out at a time, so you can both be giving
// and guessing at once.
// The server picks the target and keeps it from the guesser until they've guessed (wh_dial_*); the app
// picks the scale (src/dialcards.js). While one of you turns the dial, the other one watches the needle
// move live (realtime broadcast { t: 'dial', id, v }); { t: 'dial', ev } tells the other phone to reload.
// Look: Design Tinder's and Five Letters' (white page, square corners, Geist, red mono meta); the target
// in the pink and red pair, the scale's ends in aqua and yellow.
import { h, store, clamp } from './util.js';
import { sheet, toast } from './ui.js';
import { buzz, sfx } from './feel.js';
import { offlineError } from './cache.js';
import { SCALES } from './dialcards.js';

const svgEl = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };
const STATS_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"><path d="M5 20v-8M12 20V5M19 20v-5"/></svg>';
const NS = 'http://www.w3.org/2000/svg';
const VW = 360, VH = 190, CX = 180, CY = 172, R = 164; // the dial: a half circle, its center near the bottom
// each band of the target is 50 wide on a 0..1000 scale (5% of the dial): 4 in the middle, then 3, then 2
const BANDS = [[-125, -75, 2], [-75, -25, 3], [-25, 25, 4], [25, 75, 3], [75, 125, 2]];
export const pointsFor = (t, g) => { const d = Math.abs(g - t); return d <= 25 ? 4 : d <= 75 ? 3 : d <= 125 ? 2 : 0; };
const VERDICT = { 4: 'Bullseye.', 3: 'So close.', 2: 'On the edge.', 0: 'Not this time.' };
const quote = (s) => `“${s}”`;
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const clueSize = (s) => (s.length > 34 ? '.longer' : s.length > 16 ? '.long' : '');

// ── the dial itself: an SVG half circle. Interactive for guessing, still everywhere else ──
const pt = (v, r) => { const a = Math.PI * (1 - v / 1000); return [CX + r * Math.cos(a), CY - r * Math.sin(a)]; };
const f = (n) => n.toFixed(1);
const sector = (a, b, r) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `M${CX} ${CY}L${f(x1)} ${f(y1)}A${r} ${r} 0 0 1 ${f(x2)} ${f(y2)}Z`; };
const ease = (k) => 1 - (1 - k) ** 3;

export function Dial({ interactive = false, onTurn, onLet } = {}) {
  const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const root = el('svg', { viewBox: `0 0 ${VW} ${VH}`, class: `dl-dial${interactive ? ' live' : ''}`, 'aria-hidden': interactive ? 'false' : 'true' });
  const face = el('path', { d: `M${CX - R} ${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}Z`, class: 'dl-face' });
  const target = el('g', { class: 'dl-target' });
  const ticks = el('g', { class: 'dl-ticks' });
  for (let i = 0; i <= 10; i++) {
    const [x1, y1] = pt(i * 100, R - (i % 5 ? 9 : 15)), [x2, y2] = pt(i * 100, R - 3);
    ticks.append(el('line', { x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2) }));
  }
  const needle = el('g', { class: 'dl-needle' });
  needle.append(el('line', { x1: CX, y1: CY, x2: CX, y2: CY - R + 40 }), el('circle', { cx: CX, cy: CY, r: 13 }), el('circle', { class: 'dl-hub', cx: CX, cy: CY, r: 4 }));
  root.append(face, target, ticks, needle);
  let t = null, k = 1, v = null, raf = 0, dragging = false, touched = false;

  function drawTarget() {
    target.replaceChildren();
    if (t == null || k <= 0) return;
    for (const [a, b, p] of BANDS) {
      const lo = clamp(t + a * k, 0, 1000), hi = clamp(t + b * k, 0, 1000);
      if (hi - lo < 0.5) continue;
      target.append(el('path', { d: sector(lo, hi, R), class: `dl-band b${p}` }));
      if (k > 0.85 && hi - lo > 34) {
        const [x, y] = pt((lo + hi) / 2, R - 21);
        const n = el('text', { x: f(x), y: f(y), class: `dl-num b${p}` }); n.textContent = String(p);
        target.append(n);
      }
    }
  }
  function drawNeedle() {
    needle.style.display = v == null ? 'none' : '';
    if (v != null) needle.style.transform = `rotate(${((v / 1000) * 180 - 90).toFixed(2)}deg)`;
    if (interactive) { root.setAttribute('aria-valuenow', String(Math.round((v ?? 500) / 10))); }
  }
  function animate(ms, step, done) {
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      step(ease(p));
      if (p < 1) raf = requestAnimationFrame(tick); else done?.();
    };
    raf = requestAnimationFrame(tick);
  }

  if (interactive) {
    root.setAttribute('role', 'slider');
    root.setAttribute('tabindex', '0');
    root.setAttribute('aria-label', 'The dial');
    root.setAttribute('aria-valuemin', '0'); root.setAttribute('aria-valuemax', '100');
    let lastBuzz = null;
    const at = (e) => {
      const r = root.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * VW, y = ((e.clientY - r.top) / r.height) * VH;
      let a = Math.atan2(CY - y, x - CX);
      if (a < 0) a = x < CX ? Math.PI : 0;
      return clamp(Math.round(1000 * (1 - a / Math.PI)), 0, 1000);
    };
    const turn = (nv) => {
      v = nv; touched = true; drawNeedle();
      const step = Math.round(nv / 50);
      if (step !== lastBuzz) { if (lastBuzz != null) buzz(2); lastBuzz = step; }
      onTurn?.(v);
    };
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = e.pointerId;
      try { root.setPointerCapture(e.pointerId); } catch { /* */ }
      needle.classList.add('snap');
      turn(at(e));
    });
    root.addEventListener('pointermove', (e) => { if (e.pointerId === dragging) turn(at(e)); });
    const up = (e) => { if (e.pointerId !== dragging) return; dragging = false; onLet?.(v); };
    root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
    root.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -10 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 10 : 0;
      if (!d) return;
      e.preventDefault(); turn(clamp((v ?? 500) + d * (e.shiftKey ? 5 : 1), 0, 1000)); onLet?.(v);
    });
  }

  return {
    el: root,
    get value() { return v; },
    get dragging() { return dragging !== false; },
    get touched() { return touched; },
    setTarget(nt) { t = nt; k = 1; drawTarget(); },
    setNeedle(nv, { smooth = false } = {}) {
      needle.classList.toggle('snap', !smooth);
      v = nv; drawNeedle();
    },
    // the target opens up from its middle
    reveal(nt, done) { t = nt; animate(750, (p) => { k = p; drawTarget(); }, done); },
    // the needle swings from where it is to v
    swing(to, done) {
      const from = v ?? 500;
      needle.classList.add('snap');
      animate(900, (p) => { v = from + (to - from) * p; drawNeedle(); }, () => { v = to; drawNeedle(); done?.(); });
    },
    stop() { cancelAnimationFrame(raf); },
  };
}

// a round's scale, under the dial: the left end in aqua, the right in yellow
const ends = (r) => h('div.dl-ends', h('span.dl-end.lo', r?.lo || ' '), h('span.dl-end.hi', r?.hi || ' '));

// ── the page ────────────────────────────────────────────────
export function DialPage(app, root, { onBack, onChange } = {}) {
  let st = store('dlState') || null;  // the server's state, kept on the phone
  let failed = null, visible = false, loading = null, acting = false;
  let result = null;                   // a finished round on screen: { round, mine: true if it was your clue }
  let shown = null, panel = null, dial = null, input = null, liveEl = null;
  let ghostTimer = 0, sendTimer = 0, pollTimer = 0, lastSent = 0, ghostAt = null;
  let rev = 0; // bumped by every change made on this phone, so a state that was already on its way when it happened isn't applied

  const them = () => app.them()?.name || 'Them';
  const slot = () => (st?.slot ?? app.slot());
  const meta = h('div.dt-meta');
  const statsBtn = h('button.dt-sq', { type: 'button', 'aria-label': 'Stats', onclick: () => statsSheet() }, svgEl(STATS_ICON));
  const body = h('div.dl-body');
  const foot = h('div.dt-foot.dl-foot',
    h('button.dt-back', { type: 'button', onclick: () => onBack?.() }, '← BACK'),
    h('button.dt-read', { type: 'button', onclick: () => howSheet() }, 'HOW TO PLAY'));
  root.replaceChildren(h('header.dl-head', h('div.dt-top', meta, h('div.dt-tools', statsBtn)), h('h1.dt-title', 'The Dial')), body, foot);

  // ── state ──
  // your clues whose result you've seen: rounds you gave with an id up to this
  const seenId = () => store('dlSeen') ?? null;
  const unseen = () => {
    if (!st || seenId() == null) return null;
    return (st.past || []).find((r) => r.giver === slot() && r.id > seenId()) || null;
  };
  const markSeen = (id) => { if (id > (seenId() ?? 0)) store('dlSeen', id); };
  const queued = () => store('dlOutbox') || [];
  const queuedFor = (op, id) => queued().find((x) => x.op === op && x.id === id) || null;

  function applyState(s) {
    st = s;
    // first time here: everything already finished counts as seen
    if (seenId() == null) store('dlSeen', Math.max(0, ...(s.past || []).filter((r) => r.giver === s.slot).map((r) => r.id)));
    store('dlState', s);
  }
  function saveCopy() { rev++; if (st) store('dlState', st); }
  // a round just finished on this phone: into the past, totals up
  function finish(r) {
    if (!st) return;
    st.past = [r, ...(st.past || []).filter((x) => x.id !== r.id)];
    if (st.theirs?.id === r.id) st.theirs = null;
    if (st.mine?.id === r.id) st.mine = null;
    const tot = st.totals || (st.totals = []);
    let e = tot.find((x) => x.giver === r.giver);
    if (!e) { e = { giver: r.giver, rounds: 0, points: 0, bulls: 0 }; tot.push(e); tot.sort((a, b) => a.giver - b.giver); }
    e.rounds++; e.points += r.points || 0; if (r.points === 4) e.bulls++;
    saveCopy();
  }

  function load() {
    loading ??= (async () => {
      const watching = shown?.kind === 'wait' && visible ? shown.round?.id : null, from = ghostAt;
      await flush();
      try {
        const r0 = rev, s = await app.backend.dlState();
        if (rev === r0) applyState(s); else setTimeout(load, 800); // older than what's on screen: ask again
        failed = null;
      } catch (e) {
        console.warn('the dial state', e);
        if (!st) failed = offlineError(e) ? 'offline' : 'state';
      }
      // their guess just landed on the clue you were watching: the needle swings in from where you last saw it
      if (watching && !result) { const r = unseen(); if (r?.id === watching) result = { round: r, from }; }
      render();
      onChange?.();
    })().finally(() => { loading = null; });
    return loading;
  }

  // clues and guesses sent with no signal wait on the phone and go out when it's back
  function queue(it) { store('dlOutbox', [...queued().filter((x) => !(x.op === it.op && x.id === it.id)), it].slice(-10)); }
  let flushing = false;
  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      for (let q = queued(); q.length; q = queued()) {
        const it = q[0];
        try {
          if (it.op === 'clue') { const r = await app.backend.dlClue(it.id, it.value); afterClue(r); }
          else if (it.op === 'guess') { const r = await app.backend.dlGuess(it.id, it.value); afterGuess(r, { quiet: true }); }
        } catch (e) {
          if (offlineError(e)) return;
          console.warn('the dial: dropped', it, e); // the server knows better (already sent, or the round is gone)
        }
        store('dlOutbox', queued().filter((x) => !(x.op === it.op && x.id === it.id)));
      }
    } finally { flushing = false; }
  }
  window.addEventListener('online', () => { if (queued().length) load(); });

  // ── what's on screen: a result to see, then their clue to guess, then your clue to give ──
  function pick() {
    if (!st) return { kind: failed ? 'failed' : 'loading' };
    if (!app.them()) return { kind: 'alone' };
    if (result) return { kind: 'result', round: result.round };
    const fresh = unseen();
    if (fresh) { result = { round: fresh }; return { kind: 'result', round: fresh }; }
    const th = st.theirs;
    if (th?.clue && th.guess == null) return { kind: queuedFor('guess', th.id) ? 'sent' : 'guess', round: th };
    if (!st.mine) return { kind: 'deal' };
    if (!st.mine.clue && !queuedFor('clue', st.mine.id)) return { kind: 'give', round: st.mine };
    return { kind: 'wait', round: st.mine };
  }
  const keyOf = (p) => `${p.kind}#${p.round?.id ?? ''}`;

  function renderMeta() {
    const tot = (st?.totals || []).reduce((a, x) => ({ rounds: a.rounds + x.rounds, points: a.points + x.points }), { rounds: 0, points: 0 });
    meta.textContent = tot.rounds
      ? `${tot.points} ${tot.points === 1 ? 'POINT' : 'POINTS'} TOGETHER · ${tot.rounds} ${tot.rounds === 1 ? 'ROUND' : 'ROUNDS'}`
      : 'A SCALE, A TARGET, A CLUE';
  }

  function render({ force = false } = {}) {
    renderMeta();
    poll();
    const p = pick();
    // don't pull the screen away while you're writing a clue or turning the dial
    if (!force && shown && keyOf(p) !== keyOf(shown) && busy()) return;
    // watching for their needle: a new clue from them doesn't take the screen, it gets a button
    if (!force && shown?.kind === 'wait' && p.kind === 'guess') { const a = panel?.querySelector('.dl-act'); if (a) a.replaceWith(waitAction()); return; }
    if (p.kind === 'deal') {
      // a new round (and its target) is only dealt while you're looking at the game
      if (shown?.kind !== 'deal') { shown = p; dial?.stop(); dial = null; input = null; liveEl = null; panel = emptyPanel('Picking a scale…'); body.replaceChildren(panel); }
      if (visible) deal();
      return;
    }
    if (!force && shown && keyOf(p) === keyOf(shown)) { refresh(p); return; }
    shown = p;
    dial?.stop(); dial = null; input = null; liveEl = null;
    clearTimeout(ghostTimer); ghostTimer = 0;
    if (p.kind !== 'wait') ghostAt = null;
    panel = p.kind === 'loading' ? emptyPanel('Turning…')
      : p.kind === 'failed' ? emptyPanel(failed === 'offline' ? 'The Dial needs a signal.' : 'The Dial didn\'t load.', true)
        : p.kind === 'alone' ? emptyPanel('Waiting for your person.', true)
          : p.kind === 'guess' ? guessPanel(p.round)
            : p.kind === 'sent' ? sentPanel(p.round)
              : p.kind === 'give' ? givePanel(p.round)
                : p.kind === 'wait' ? waitPanel(p.round)
                  : resultPanel(result);
    body.replaceChildren(panel);
    requestAnimationFrame(() => panel?.classList.add('in'));
  }
  // the same panel, newer data (a new scale on your round, say)
  function refresh(p) {
    if (p.kind === 'wait' && liveEl && !ghostTimer) liveEl.textContent = waitLabel(p.round);
    if (p.kind === 'give' && panel) {
      const e = panel.querySelector('.dl-ends'); if (e) e.replaceWith(ends(p.round));
      if (dial && p.round.target != null) dial.setTarget(p.round.target);
    }
  }
  const busy = () => (shown?.kind === 'give' && (input?.value.trim() || document.activeElement === input)) || (shown?.kind === 'guess' && dial?.touched);

  const emptyPanel = (msg, exit = false) => h('div.dl-panel.dl-empty', h('p', msg), exit ? h('button.dt-wide.dt-exit', { type: 'button', onclick: () => onBack?.() }, 'Exit game') : null);
  const stage = (d, r) => h('div.dl-stage', { 'data-nopager': '' }, d.el, ends(r));
  const label = (...kids) => h('div.dl-label', ...kids);
  const action = (text, onclick, cls = '') => h('div.dl-act', h(`button.dt-wide${cls}`, { type: 'button', onclick }, text));

  // their clue: turn the dial and lock it in
  function guessPanel(r) {
    dial = Dial({ interactive: true, onTurn: (v) => sendLive(r.id, v), onLet: (v) => sendLive(r.id, v, true) });
    dial.setNeedle(500);
    const lock = h('button.dt-wide', { type: 'button', onclick: () => lockIn(r, lock) }, 'Lock it in');
    return h('div.dl-panel',
      h('div.dl-mid',
        label(h('span', `${them()}'s clue`)),
        h(`h2.dl-clue${clueSize(r.clue)}`, quote(r.clue)),
        stage(dial, r),
        h('p.dl-note', `Turn the dial to where ${quote(r.clue)} sits between ${r.lo} and ${r.hi}.`)),
      h('div.dl-act', lock));
  }
  // locked in with no signal: it goes when you're back
  function sentPanel(r) {
    const q = queuedFor('guess', r.id);
    dial = Dial(); dial.setNeedle(q?.value ?? 500);
    return h('div.dl-panel',
      h('div.dl-mid',
        label(h('span', `${them()}'s clue`), h('span', 'Locked in')),
        h(`h2.dl-clue${clueSize(r.clue)}`, quote(r.clue)),
        stage(dial, r),
        h('p.dl-note', 'No signal. Your guess goes out when you\'re back, then the target shows.')),
      action('Exit game', () => onBack?.(), '.dt-exit'));
  }

  // your turn: you see the target, write a clue that lands on it
  function givePanel(r) {
    dial = Dial(); dial.setTarget(r.target); dial.setNeedle(null);
    input = h('input.dl-input', { type: 'text', maxLength: 60, placeholder: 'Type a clue', enterKeyHint: 'send', autocomplete: 'off', 'aria-label': 'Your clue' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendClue(r, send); } });
    const send = h('button.dt-wide', { type: 'button', onclick: () => sendClue(r, send) }, 'Send the clue');
    const swap = h('button.dl-swap', { type: 'button', onclick: () => swapScale(r, swap) }, 'Another scale');
    return h('div.dl-panel',
      h('div.dl-mid',
        label(h('span', 'Your clue'), swap),
        input,
        stage(dial, r),
        h('p.dl-note', `Only you can see the target. Give ${them()} a clue that lands right on it.`)),
      h('div.dl-act', send));
  }

  // your clue is out: watch for their needle
  function waitPanel(r) {
    dial = Dial(); dial.setTarget(r.target); dial.setNeedle(null);
    liveEl = h('span', waitLabel(r));
    const clue = r.clue || queuedFor('clue', r.id)?.value || '';
    return h('div.dl-panel',
      h('div.dl-mid',
        label(h('span', 'Your clue'), liveEl),
        h(`h2.dl-clue${clueSize(clue)}`, quote(clue)),
        stage(dial, r),
        h('p.dl-note', `${them()} turns the dial next. You'll see where it lands, live if you're both here.`)),
      waitAction());
  }
  const waitLabel = (r) => (queuedFor('clue', r.id) ? 'Sends with a signal' : `Waiting for ${them()}`);
  // while you wait: their clue to guess if one came in, else out
  function waitAction() {
    const th = st?.theirs;
    return th?.clue && th.guess == null && !queuedFor('guess', th.id)
      ? action(`Guess ${them()}'s clue`, () => { shown = null; render({ force: true }); })
      : action('Exit game', () => onBack?.(), '.dt-exit');
  }

  // a finished round: the target, the needle, the points
  function resultPanel(res) {
    const r = res.round, mineClue = r.giver === slot();
    dial = Dial();
    const score = h('div.dl-score', { style: { visibility: 'hidden' } },
      h(`b.dl-pts${r.points === 4 ? '.bull' : ''}`, String(r.points ?? 0)),
      h('div.dl-pts-side', h('span.dl-pts-l', r.points === 1 ? 'Point' : 'Points'), h('span.dl-verdict', VERDICT[r.points ?? 0])));
    const showScore = () => {
      score.style.visibility = '';
      score.classList.add('in');
      if (r.points === 4) { sfx.chime(); buzz([14, 70, 14]); } else buzz(r.points ? 20 : 30);
    };
    if (mineClue) {
      // your clue: you knew the target; their needle swings in
      dial.setTarget(r.target); dial.setNeedle(res.from ?? 500);
      setTimeout(() => dial?.swing(r.guess, showScore), 450);
    } else {
      // their clue: the target opens up under your needle
      dial.setNeedle(r.guess);
      setTimeout(() => dial?.reveal(r.target, showScore), 300);
    }
    const nextUp = () => {
      const th = st?.theirs, more = unseen();
      if (more && more.id !== r.id) return [`See how ${them()} did`, () => done(r)];
      if (th?.clue && th.guess == null) return [`Guess ${them()}'s clue`, () => done(r)];
      if (!st?.mine) return ['Give your clue', () => done(r)];
      return ['Exit game', () => { done(r, false); onBack?.(); }];
    };
    const [text, go] = nextUp();
    return h('div.dl-panel',
      h('div.dl-mid',
        label(h('span', mineClue ? 'Your clue' : `${them()}'s clue`), h('span', mineClue ? `${them()} turned the dial` : 'You turned the dial')),
        h(`h2.dl-clue${clueSize(r.clue)}`, quote(r.clue)),
        stage(dial, r),
        score),
      action(text, go, text === 'Exit game' ? '.dt-exit' : ''));
  }
  function done(r, again = true) {
    if (r.giver === slot()) markSeen(r.id);
    result = null;
    if (again) render({ force: true });
  }

  // ── doing things ──
  function nextScale(except = null) {
    const names = { me: app.me()?.name || 'Me', you: them() };
    const fill = (s) => s.replace(/\{me\}/g, names.me).replace(/\{you\}/g, names.you);
    const all = SCALES.map(([a, b]) => [fill(a), fill(b)]).filter(([a, b]) => a.length <= 40 && b.length <= 40);
    const recent = new Set([...(st?.past || []).slice(0, 80), st?.theirs].filter((x) => x?.lo).map((x) => `${x.lo}|${x.hi}`));
    if (except) recent.add(except);
    const pool = all.filter(([a, b]) => !recent.has(`${a}|${b}`));
    const from = pool.length ? pool : all.filter(([a, b]) => `${a}|${b}` !== except);
    return from[Math.floor(Math.random() * from.length)];
  }

  async function deal() {
    if (acting || st?.mine) return;
    acting = true;
    try {
      const [lo, hi] = nextScale();
      st.mine = await app.backend.dlDeal(lo, hi);
      saveCopy();
    } catch (e) {
      console.warn('the dial: deal', e);
      if (shown?.kind === 'deal') { panel = emptyPanel(offlineError(e) ? 'Your next scale needs a signal.' : 'The scale didn\'t come through.', true); body.replaceChildren(panel); }
      return;
    } finally { acting = false; }
    render({ force: true });
  }

  async function swapScale(r, btn) {
    if (acting) return;
    acting = true; btn.disabled = true;
    try {
      const cur = st?.mine?.id === r.id ? st.mine : r;
      const [lo, hi] = nextScale(`${cur.lo}|${cur.hi}`);
      st.mine = await app.backend.dlCard(r.id, lo, hi);
      saveCopy();
      shown = { kind: 'give', round: st.mine };
      refresh(shown);
      buzz(6);
    } catch (e) {
      toast(offlineError(e) ? 'Another scale needs a signal.' : 'That didn\'t work. Try again.');
      if (!offlineError(e)) load();
    } finally { acting = false; btn.disabled = false; }
  }

  async function sendClue(r, btn) {
    const clue = (input?.value || '').replace(/\s+/g, ' ').trim();
    if (!clue) { input?.focus(); toast('Type a clue first.'); return; }
    if (acting) return;
    acting = true; btn.disabled = true;
    input?.blur();
    try {
      afterClue(await app.backend.dlClue(r.id, clue));
    } catch (e) {
      if (offlineError(e)) { queue({ op: 'clue', id: r.id, value: clue, at: Date.now() }); toast('No signal. Your clue goes out when you\'re back.'); }
      else { console.warn('the dial: clue', e); toast('The clue didn\'t go through. Try again.'); acting = false; btn.disabled = false; load(); return; }
    } finally { acting = false; }
    render({ force: true });
  }
  function afterClue(r) {
    if (st?.mine?.id === r.id) st.mine = r;
    saveCopy();
    app.backend.nudge('dial', { part: 'clue', clue: r.clue, lo: r.lo, hi: r.hi });
    app.backend.send?.({ t: 'dial', ev: 'clue' });
  }

  async function lockIn(r, btn) {
    if (acting || !dial) return;
    const v = Math.round(dial.value ?? 500);
    acting = true; btn.disabled = true;
    try {
      const got = await app.backend.dlGuess(r.id, v);
      afterGuess(got);
    } catch (e) {
      if (offlineError(e)) { queue({ op: 'guess', id: r.id, value: v, at: Date.now() }); toast('No signal. Your guess goes out when you\'re back.'); render({ force: true }); }
      else { console.warn('the dial: guess', e); toast('That didn\'t go through. Try again.'); load(); }
    } finally { acting = false; if (btn.isConnected) btn.disabled = false; }
  }
  function afterGuess(r, { quiet = false } = {}) {
    finish(r);
    app.backend.nudge('dial', { part: 'guess', points: r.points, clue: r.clue });
    app.backend.send?.({ t: 'dial', ev: 'guess', id: r.id });
    if (!quiet || visible) { result = { round: r, mine: false }; render({ force: true }); }
  }

  // the needle, live to the other phone while you turn it (a few times a second at most)
  function sendLive(id, v, now = false) {
    clearTimeout(sendTimer);
    const go = () => { lastSent = performance.now(); app.backend.send?.({ t: 'dial', id, v: Math.round(v) }); };
    if (now || performance.now() - lastSent > 90) go(); else sendTimer = setTimeout(go, 90);
  }

  // ── from the other phone ──
  function live(p) {
    if (!p) return;
    if (p.ev) { load(); return; }
    if (p.v == null || shown?.kind !== 'wait' || shown.round?.id !== p.id || !dial) return;
    ghostAt = p.v;
    dial.setNeedle(p.v, { smooth: true });
    if (liveEl) liveEl.textContent = `${them()} is turning it`;
    clearTimeout(ghostTimer);
    ghostTimer = setTimeout(() => { ghostTimer = 0; dial?.setNeedle(null); if (liveEl && shown?.round) liveEl.textContent = waitLabel(shown.round); }, 6000);
  }

  // while something of theirs is on its way, look again now and then
  function poll() {
    clearInterval(pollTimer); pollTimer = 0;
    const waiting = st && app.them() && (shown?.kind === 'wait' || !st.theirs?.clue);
    if (visible && waiting) pollTimer = setInterval(() => { if (!document.hidden) load(); }, 20000);
  }
  document.addEventListener('visibilitychange', () => { if (visible && !document.hidden) load(); });

  // ── stats: points together, per giver, every round ──
  function statsSheet() {
    const n = them(), me = slot();
    const by = (g) => (st?.totals || []).find((x) => x.giver === g) || { rounds: 0, points: 0, bulls: 0 };
    const a = by(me), b = by(1 - me);
    const rounds = a.rounds + b.rounds, points = a.points + b.points, bulls = a.bulls + b.bulls;
    const avg = (x) => (x.rounds ? (x.points / x.rounds).toFixed(1) : '–');
    const past = st?.past || [];
    sheet('Stats', [
      h('div.dt-hero.dl-hero',
        h('span.dt-hero-label', 'POINTS TOGETHER, ALL TIME'),
        h('div.dt-hero-num', String(points)),
        h('p', rounds ? `Over ${rounds === 1 ? 'one round' : `${rounds} rounds`}: ${avg({ rounds, points })} a round, ${bulls === 1 ? 'one bullseye' : `${bulls} bullseyes`}.` : `Once ${n} turns the dial on your first clue, it counts here.`)),
      h('section.dt-sec',
        h('div.dt-label', h('span', 'HOW YOUR CLUES LANDED'), h('span', `${rounds} ${rounds === 1 ? 'ROUND' : 'ROUNDS'}`)),
        h('table.dt-stats',
          h('thead', h('tr', h('th', ''), h('th', 'Your clues'), h('th', `${n}'s`))),
          h('tbody', [['Clues', a.rounds, b.rounds], ['Points', a.points, b.points], ['Average', avg(a), avg(b)], ['Bullseyes', a.bulls, b.bulls]]
            .map(([k, x, y]) => h('tr', h('th', k), h('td', String(x)), h('td', String(y))))))),
      h('section.dt-sec', h('div.dt-label', h('span', 'EVERY ROUND'), h('span', String(past.length))),
        past.length ? h('div.dl-rounds', past.map((r) => roundRow(r))) : h('p.dt-empty-line', 'Finished rounds land here.')),
    ], { tall: true, quiet: true, className: 'dt-sheet dl-sheet', pullAnywhere: true });
  }
  function roundRow(r) {
    const d = Dial(); d.setTarget(r.target); d.setNeedle(r.guess);
    return h('button.dl-round', { type: 'button', onclick: () => roundSheet(r) },
      h('span.dl-round-dial', d.el),
      h('span.dl-round-mid',
        h('span.dl-round-k', `${r.lo} → ${r.hi}`),
        h('b.dl-round-c', quote(r.clue)),
        h('span.dl-round-k', `${r.giver === slot() ? 'Your clue' : `${them()}'s clue`} · ${shortDate(r.guessed_at || r.at)}`)),
      h(`span.dl-round-p${r.points === 4 ? '.bull' : ''}`, String(r.points ?? 0)));
  }
  function roundSheet(r) {
    const d = Dial(); d.setTarget(r.target); d.setNeedle(r.guess);
    sheet('', [h('div.dl-round-sheet',
      h('div.dl-label', h('span', r.giver === slot() ? 'Your clue' : `${them()}'s clue`), h('span', shortDate(r.guessed_at || r.at))),
      h(`h2.dl-clue${clueSize(r.clue)}`, quote(r.clue)),
      h('div.dl-stage', d.el, ends(r)),
      h('div.dl-score.in', h(`b.dl-pts${r.points === 4 ? '.bull' : ''}`, String(r.points ?? 0)),
        h('div.dl-pts-side', h('span.dl-pts-l', r.points === 1 ? 'Point' : 'Points'), h('span.dl-verdict', VERDICT[r.points ?? 0]))))],
    { quiet: true, className: 'dt-sheet dl-sheet', pullAnywhere: true });
  }

  function howSheet() {
    const n = them();
    const d = Dial(); d.setTarget(780); d.setNeedle(735);
    sheet('How to play', [
      h('p.dl-how', 'One of you gets a scale, like Cold to Hot, with a target hidden somewhere on it. Only the one giving the clue can see it.'),
      h('div.dl-stage.dl-how-dial', d.el, ends({ lo: 'Cold', hi: 'Hot' })),
      h('p.dl-how', `Give a clue that lands right on the target: on Cold to Hot, “soup” sits near Hot and “gazpacho” near Cold. ${n} turns the dial to where they think it is.`),
      h('p.dl-how', 'The closer, the more points: 4 for a bullseye, then 3, then 2. You score together.'),
      h('p.dl-how', `You each give your own clues, one out at a time, so you can both have one waiting. If you're both in the app, you'll see the needle move as ${n} turns it.`),
    ], { quiet: true, className: 'dt-sheet dl-sheet' });
  }

  return {
    // for the Games page: what waits here (null = nothing)
    status() {
      if (!st) return 'New game';
      if (!app.them()) return null;
      if (unseen()) return 'Result in';
      if (st.theirs?.clue && st.theirs.guess == null && !queuedFor('guess', st.theirs.id)) return 'Your guess';
      if (!st.mine || (!st.mine.clue && !queuedFor('clue', st.mine.id))) return 'Your clue';
      return null;
    },
    prime: () => load(),
    live,
    show() { visible = true; render({ force: !shown || shown.kind === 'loading' || shown.kind === 'failed' }); load(); },
    hide() {
      visible = false; poll();
      // a result you've looked at is done with once you leave
      if (result && shown?.kind === 'result' && result.round.giver === slot()) markSeen(result.round.id);
      if (shown?.kind === 'result') { result = null; shown = null; }
    },
    get visible() { return visible; },
  };
}
