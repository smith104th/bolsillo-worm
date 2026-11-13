// Five Letters: one of the games (opens from the Games page). A five-letter word a day, the same one
// for both of you: the New York Times' Wordle answer from two days before (Manu, Nov 13). Six tries.
// Wordle's colors (Manu, after trying blue and pink): green = right spot, yellow = in the word elsewhere, dark gray = not in it.
// Your person's grid stays buried until you've finished yours (the server only hands it over then);
// then the two sit side by side. The stats add up over every day, all time.
// The word comes from wh_fl_state. If the NYT one isn't in yet, the words function fetches it; if that
// fails, the app offers a word from its own list (src/letters/answers.txt), the same on both phones,
// and the server locks in whichever arrives first. Guesses are checked here (the phone has the word),
// so you can play with no signal: each guess waits in store('flOutbox') and goes out in order.
// Look: Design Tinder's (white page, square corners, Geist, red mono meta). In the stats, blue is you, pink is them.
// A day can have extra words (rounds 2+, Manu Nov 13: "let us play one extra game today"): they come in
// state.extra, play the same way, and count in the stats like any other word. Round 1 is the day's word.
import { h, store, hash } from './util.js';
import { sheet, topSheet } from './ui.js';
import { buzz, sfx } from './feel.js';
import { offlineError } from './cache.js';

const WORDS = __WORDS__; // ./letters/words.json?v=<hash>, set by build.mjs
const ROWS = 6, LEN = 5;
const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
const svgEl = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };
const STATS_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"><path d="M5 20v-8M12 20V5M19 20v-5"/></svg>';
const DEL_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M8.5 5H21v14H8.5L2.5 12z"/><path d="m11.5 9 6 6m0-6-6 6" stroke-linecap="round"/></svg>';

// ── the words ───────────────────────────────────────────────
let wordsLoad = null;
export function loadWords() {
  wordsLoad ??= fetch(new URL(WORDS, location.href))
    .then((r) => { if (!r.ok) throw new Error(`words_${r.status}`); return r.json(); })
    .then((j) => { const five = (s) => s.match(/[a-z]{5}/g) || []; return { guesses: new Set(five(j.g)), answers: five(j.a) }; })
    .catch((e) => { wordsLoad = null; throw e; });
  return wordsLoad;
}
// the app's own word for a day, for when the NYT one can't be had: the same on both phones
export const backupWord = (words, day) => words.answers[hash(`five-letters:${day}`) % words.answers.length];

// How a guess scores against the word: 2 = right spot (green), 1 = in the word, elsewhere (yellow),
// 0 = not in it. A repeated letter only counts as often as the word has it, right spots first.
export function score(guess, word) {
  const out = Array(LEN).fill(0), left = {};
  for (let i = 0; i < LEN; i++) { if (guess[i] === word[i]) out[i] = 2; else left[word[i]] = (left[word[i]] || 0) + 1; }
  for (let i = 0; i < LEN; i++) if (!out[i] && left[guess[i]]) { out[i] = 1; left[guess[i]]--; }
  return out;
}

const dayKey = (v) => String(v || '').slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const shortDate = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const points = (g) => (g.solved ? g.n : ROWS + 1); // fewer is better; a miss counts as seven
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timed out')), ms))]);
// the server's today as a list of words: round 1 (the day's word), then any extra ones
const roundsOf = (s) => (s?.word ? [{ round: 1, word: s.word, nyt: s.nyt, mine: s.mine, theirs: s.theirs }, ...(s.extra || [])] : []);
const isDone = (gs, w) => gs[gs.length - 1] === w || gs.length >= ROWS;
const roundName = (r, many) => (r === 1 ? 'Today\'s word' : many ? `Bonus word ${r - 1}` : 'Bonus word');

// a small grid of finished rows (for the results, the stats and Save everything)
function miniGrid(guesses, word, { hidden = false } = {}) {
  return h('div.fl-mini', Array.from({ length: ROWS }, (_, r) => {
    const g = hidden ? '' : guesses?.[r] || '';
    const sc = g && word ? score(g, word) : null;
    return h('div.fl-row', Array.from({ length: LEN }, (_, i) => h(`div.fl-tile${sc ? `.s${sc[i]}` : ''}`, g[i] || '')));
  }));
}

function verdict(me, th, name) {
  if (!me?.done || !th?.done) return null;
  if (me.solved && th.solved) {
    const d = th.n - me.n;
    return d > 0 ? `You won by ${NUM[d]}.` : d < 0 ? `${name} won by ${NUM[-d]}.` : `A tie. Both in ${me.n}.`;
  }
  if (me.solved) return `You got it. ${name} didn't.`;
  if (th.solved) return `${name} got it. You didn't.`;
  return 'Neither of you got it.';
}

// ── the page ────────────────────────────────────────────────
export function LettersPage(app, root, { onBack } = {}) {
  let words = null, st = store('flState') || null, failed = null, visible = false, loading = null;
  let day = null, round = 1, word = null, nyt = null; // the game on screen
  let picked = false;                                // you chose which of today's words to look at
  let mine = [], done = false, solved = false;       // your guesses so far
  let theirs = null;                                 // { n, solved, done, guesses? (only once you're done) }
  let typed = '', revealing = false, play = null, tiles = [], rows = [], keyEls = new Map(), note = null, noteTimer = 0, pollTimer = 0;

  const them = () => app.them()?.name || 'Them';
  const meta = h('div.dt-meta');
  const statsBtn = h('button.dt-sq', { type: 'button', 'aria-label': 'Stats', onclick: () => statsSheet() }, svgEl(STATS_ICON));
  const body = h('div.fl-body');
  root.replaceChildren(
    h('header.fl-head', h('div.dt-top', meta, h('div.dt-tools', statsBtn)), h('h1.dt-title', 'Five Letters')),
    body);

  // ── state ──
  // the server's guesses for a word, plus any still waiting for a signal
  const merged = (g, d, r) => {
    const out = [...(g?.guesses || [])];
    for (const x of (store('flOutbox') || []).filter((o) => o.day === d && (o.round || 1) === r).sort((a, b) => a.n - b.n)) if (x.n === out.length + 1) out.push(x.guess);
    return out;
  };
  function applyState(s) {
    st = s;
    store('flState', s);
    const sday = dayKey(s.today);
    // a game you started before midnight stays on screen until it's finished (the server takes yesterday's for that)
    if (day && day !== sday && mine.length && !done) return;
    const was = `${day}#${round}`;
    if (day !== sday) { typed = ''; play = null; picked = false; }
    const list = roundsOf(s);
    // which word: the one you picked; else one you started and haven't finished; else the day's word until
    // it's done; then the last one you finished (the results have a button for a word still waiting)
    if (!picked || !list.some((x) => x.round === round)) {
      const all = list.map((x) => ({ r: x.round, gs: merged(x.mine, sday, x.round), w: x.word }));
      const open = all.find((x) => x.gs.length && !isDone(x.gs, x.w));
      const lastDone = [...all].reverse().find((x) => x.gs.length && isDone(x.gs, x.w));
      round = open?.r ?? (all[0] && !isDone(all[0].gs, all[0].w) ? 1 : lastDone?.r ?? 1);
    }
    day = sday;
    if (`${day}#${round}` !== was) { typed = ''; play = null; }
    const cur = list.find((x) => x.round === round) || {};
    word = cur.word || null; nyt = cur.nyt ? dayKey(cur.nyt) : null;
    const gs = merged(cur.mine, day, round);
    if (`${day}#${round}` !== was || gs.length >= mine.length) mine = gs;
    theirs = cur.theirs || null;
    solved = !!word && mine[mine.length - 1] === word;
    done = solved || mine.length >= ROWS;
  }
  // switch to another of today's words
  function setRound(r) {
    picked = true;
    if (r === round) return;
    round = r; typed = ''; play = null; mine = [];
    applyState(st);
    render();
    if (!done) body.firstChild?.classList.add('in');
  }
  if (st?.word && dayKey(st.today) === app.today()) applyState(st);

  // keeps the copy on the phone in step with what's on screen
  function saveCopy() {
    if (!st || dayKey(st.today) !== day) return;
    const g = (old) => (mine.length ? { ...(old || {}), n: mine.length, solved, done, guesses: [...mine] } : null);
    st = round === 1 ? { ...st, mine: g(st.mine), theirs }
      : { ...st, extra: (st.extra || []).map((x) => (x.round === round ? { ...x, mine: g(x.mine), theirs } : x)) };
    store('flState', st);
  }

  function load() {
    loading ??= (async () => {
      try { words ??= await loadWords(); } catch (e) { console.warn('five letters words', e); if (!words) { failed = 'words'; render(); return; } }
      await flush();
      try {
        let s = await app.backend.flState();
        if (!s.word) {
          // no word yet today: ask for the NYT one, then offer ours in case that didn't work
          const w = await withTimeout(app.backend.flWords(), 9000).catch((e) => ({ error: String(e?.message || e) }));
          if (!w?.ready) console.warn('five letters: no NYT word', w);
          s = await app.backend.flState(backupWord(words, dayKey(s.today)));
        }
        failed = null;
        applyState(s);
      } catch (e) {
        console.warn('five letters state', e);
        // no signal: play from the copy on the phone if it's today's
        if (st?.word && dayKey(st.today) === app.today()) { if (!word) applyState(st); } else failed = offlineError(e) ? 'offline' : 'state';
      }
      render();
    })().finally(() => { loading = null; });
    return loading;
  }

  // ── guesses go out in order; with no signal they wait on the phone ──
  const queued = () => store('flOutbox') || [];
  const same = (a, b) => a.day === b.day && (a.round || 1) === (b.round || 1) && a.n === b.n;
  function queue(it) { store('flOutbox', [...queued().filter((x) => !same(x, it)), it].slice(-40)); }
  let flushing = false, flushAgain = false;
  async function flush() {
    if (flushing) { flushAgain = true; return; }
    flushing = true;
    let dropped = false, sent = false;
    try {
      do {
        flushAgain = false;
        for (let q = queued(); q.length; q = queued()) {
          const it = q[0];
          try {
            const r = await app.backend.flGuess(it.day, it.n, it.guess, it.round || 1);
            sent = true;
            if (it.day === day && (it.round || 1) === round && r && 'theirs' in r) theirs = r.theirs;
            if (it.finishing) app.backend.nudge('letters', { n: it.n, solved: !!it.solved, both: !!r?.theirs?.done, bonus: (it.round || 1) > 1 });
          } catch (e) {
            if (offlineError(e)) return;
            console.warn('five letters: guess dropped', it, e); // the server knows better (a new day, or it was already saved)
            dropped = true;
          }
          store('flOutbox', queued().filter((x) => !same(x, it)));
        }
      } while (flushAgain);
    } finally {
      flushing = false;
      if (sent) saveCopy();
      if (dropped) setTimeout(load, 0);
      else if (sent && done && !revealing) render();
    }
  }

  // ── drawing ──
  function renderMeta() {
    if (!word) { meta.textContent = ' '; return; }
    if (done && !revealing) { meta.textContent = day !== app.today() ? shortDate(day).toUpperCase() : waiting() ? 'ONE MORE WORD TODAY' : 'NEW WORD TOMORROW'; return; }
    const n = them().toUpperCase(), t = theirs;
    const who = !app.them() ? '' : !t ? `${n} HASN'T PLAYED` : t.done ? (t.solved ? `${n} GOT IT IN ${t.n}` : `${n} DIDN'T GET IT`) : `${n} IS PLAYING`;
    meta.textContent = [round > 1 ? 'BONUS WORD' : shortDate(day).toUpperCase(), who].filter(Boolean).join(' · ');
  }

  function render() {
    renderMeta();
    poll();
    if (revealing) return;
    if (!word) {
      const msg = failed === 'offline' ? 'Today\'s word needs a signal.' : failed ? 'The word didn\'t come through.' : 'Getting today\'s word…';
      body.replaceChildren(h('div.fl-empty', h('p', msg), failed ? exitBtn() : null));
      return;
    }
    if (done) { body.replaceChildren(resultsPanel()); return; }
    if (!play) buildPlay();
    if (body.firstChild !== play) body.replaceChildren(play);
    paintBoard(); paintKeys();
    requestAnimationFrame(fit);
  }

  function buildPlay() {
    rows = []; tiles = []; keyEls = new Map();
    const grid = h('div.fl-grid', Array.from({ length: ROWS }, () => {
      const row = h('div.fl-row', Array.from({ length: LEN }, () => h('div.fl-tile')));
      rows.push(row); tiles.push([...row.children]);
      return row;
    }));
    const key = (id, label, wide = false) => {
      const b = h(`button.fl-key${wide ? '.wide' : ''}`, { type: 'button', 'aria-label': id === 'del' ? 'Delete' : id === 'enter' ? 'Enter' : id.toUpperCase() }, label);
      b.addEventListener('click', () => press(id));
      keyEls.set(id, b);
      return b;
    };
    const keys = h('div.fl-keys', { 'data-nopager': '' }, KEYS.map((r, i) => h('div.fl-krow',
      i === 2 ? key('enter', 'ENTER', true) : null,
      [...r].map((c) => key(c, c)),
      i === 2 ? key('del', svgEl(DEL_ICON), true) : null)));
    note = h('div.fl-note', { role: 'status' });
    play = h('div.fl-play',
      h('div.fl-board', note, grid),
      keys,
      h('div.dt-foot.fl-foot',
        h('button.dt-back', { type: 'button', onclick: () => onBack?.() }, '← BACK'),
        h('button.dt-read', { type: 'button', onclick: () => howSheet() }, 'HOW TO PLAY')));
  }

  // tiles as big as fit between the header and the keyboard (62 px at most)
  function fit() {
    const b = play?.querySelector('.fl-board');
    if (!b?.isConnected) return;
    const cs = getComputedStyle(b);
    const W = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const t = Math.floor(Math.min((W - 6 * (LEN - 1)) / LEN, (H - 6 * (ROWS - 1)) / ROWS, 62));
    if (t > 0) play.style.setProperty('--t', `${Math.max(30, t)}px`);
  }
  window.addEventListener('resize', () => { if (visible) fit(); });

  function paintRow(r, { pop = -1 } = {}) {
    const g = r < mine.length ? mine[r] : r === mine.length ? typed : '';
    const sc = r < mine.length && word ? score(mine[r], word) : null;
    tiles[r].forEach((t, i) => {
      t.textContent = g[i] || '';
      t.className = `fl-tile${sc ? ` s${sc[i]}` : g[i] ? ' typed' : ''}`;
      if (i === pop) { void t.offsetWidth; t.classList.add('pop'); }
    });
  }
  function paintBoard() { for (let r = 0; r < ROWS; r++) paintRow(r); }

  // each key takes the best it has been: green, then yellow, then gray
  function paintKeys() {
    const best = {};
    for (const g of mine) score(g, word).forEach((s, i) => { best[g[i]] = Math.max(best[g[i]] ?? -1, s); });
    for (const [id, el] of keyEls) {
      el.classList.remove('s0', 's1', 's2');
      if (best[id] != null) el.classList.add(`s${best[id]}`);
    }
  }

  function press(k) {
    if (!word || done || revealing) return;
    if (k === 'enter') { submit(); return; }
    if (k === 'del') { if (typed) { typed = typed.slice(0, -1); paintRow(mine.length); } return; }
    if (typed.length >= LEN) return;
    typed += k;
    buzz(4);
    paintRow(mine.length, { pop: typed.length - 1 });
  }
  window.addEventListener('keydown', (e) => {
    if (!visible || e.metaKey || e.ctrlKey || e.altKey || topSheet() || e.target?.closest?.('input, textarea')) return;
    if (e.key === 'Enter') { e.preventDefault(); press('enter'); }
    else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
    else if (/^[a-z]$/i.test(e.key)) press(e.key.toLowerCase());
  });

  // a word that won't do: the row shakes and a little note shows over the grid (right away, not
  // queued behind the app's toasts)
  function shake(text) {
    const row = rows[mine.length];
    row?.classList.remove('shake'); void row?.offsetWidth; row?.classList.add('shake');
    buzz([10, 40, 10]);
    if (!note) return;
    note.textContent = text;
    note.classList.add('on');
    clearTimeout(noteTimer); noteTimer = setTimeout(() => note.classList.remove('on'), 1600);
  }

  function submit() {
    if (typed.length < LEN) { shake('Not enough letters'); return; }
    if (typed !== word && !words?.guesses.has(typed)) { shake('Not in the word list'); return; }
    const g = typed, n = mine.length + 1, r = mine.length;
    typed = '';
    mine.push(g);
    solved = g === word; done = solved || n >= ROWS;
    const finishing = done;
    queue({ day, round, n, guess: g, finishing, solved, at: Date.now() });
    saveCopy();
    flush();
    // the row turns over one tile at a time, then the keyboard catches up
    revealing = true;
    const sc = score(g, word);
    tiles[r].forEach((t, i) => setTimeout(() => { t.className = `fl-tile show s${sc[i]}`; }, i * 140));
    setTimeout(() => {
      paintKeys();
      if (!finishing) { revealing = false; renderMeta(); return; }
      if (solved) {
        rows[r].classList.add('win');
        sfx.chime(); buzz([14, 70, 14]);
      } else buzz(30);
      setTimeout(() => { revealing = false; render(); body.firstChild?.classList.add('in'); }, solved ? 1100 : 700);
    }, LEN * 140 + 180);
  }

  // ── when you're done: the word, the two grids side by side ──
  const exitBtn = () => h('button.dt-wide.dt-exit', { type: 'button', onclick: () => onBack?.() }, 'Exit game');
  function pairPanel(x) {
    const n = them();
    const side = (who, g, mineSide) => {
      const head = h('div.fl-who', h('span', who), h('span', g?.done ? `${g.solved ? g.n : 'X'}/6` : ''));
      if (mineSide || (g?.done && g.guesses)) return h('div.fl-side', head, miniGrid(g?.guesses, x.word));
      const note = !app.them() ? 'Waiting for your person.'
        : !g ? `${n} hasn't played yet.`
          : g.done ? `${n} ${g.solved ? `got it in ${g.n}` : 'didn\'t get it'}. The grid comes in with a signal.`
            : `${n} is playing.`;
      return h('div.fl-side.fl-wait', head, miniGrid(null, null, { hidden: true }),
        h('div.fl-wait-note', h('b', note), g?.done ? null : h('span', `It shows up here when ${n} finishes.`)));
    };
    const v = verdict(x.me, x.them, n);
    const label = x.day === app.today() ? roundName(x.round || 1) : (x.round || 1) > 1 ? `${shortDate(x.day)} · bonus word` : shortDate(x.day);
    return h('div.fl-pair-wrap',
      h('p.dt-done-label', label),
      h('h2.fl-word', x.word),
      h('p.fl-src', x.nyt ? `The NYT Wordle from ${shortDate(x.nyt)}.` : app.backend?.kind === 'mock' ? 'A practice word. The demo plays from the app\'s own list.' : 'From our own list. The NYT word didn\'t come through that day.'),
      h('div.fl-pair', side('You', x.me, true), side(n, x.them, false)),
      v ? h('p.fl-verdict', v) : null);
  }
  // today's words with their state (the one on screen as it is right now)
  const todays = () => (st && dayKey(st.today) === day ? roundsOf(st) : [])
    .map((x) => ({ ...x, gs: x.round === round ? mine : merged(x.mine, day, x.round) }));
  // another of today's words you haven't finished
  const waiting = () => todays().find((x) => x.round !== round && !isDone(x.gs, x.word)) || null;
  function resultsPanel() {
    const list = todays(), next = waiting();
    // with more than one word today: a switch between them
    const tabs = list.length > 1 ? h('div.fl-rounds', list.map((x) => h(`button.fl-round${x.round === round ? '.on' : ''}`, { type: 'button', onclick: () => setRound(x.round) },
      roundName(x.round, list.length > 2)))) : null;
    return h('div.fl-done',
      tabs,
      h('div.fl-done-mid', pairPanel({ day, round, word, nyt, me: { n: mine.length, solved, done, guesses: mine }, them: theirs })),
      h('div.dt-done-foot', exitBtn(), next
        ? h('button.dt-wide', { type: 'button', onclick: () => setRound(next.round) }, next.round === 1 ? 'Play today\'s word' : 'Play the bonus word')
        : h('button.dt-wide', { type: 'button', onclick: () => statsSheet() }, 'See stats')));
  }

  // while their grid is still on its way, look again now and then
  function poll() {
    clearInterval(pollTimer); pollTimer = 0;
    if (visible && done && app.them() && !(theirs?.done && theirs.guesses)) pollTimer = setInterval(() => { if (!document.hidden) load(); }, 20000);
  }
  document.addEventListener('visibilitychange', () => { if (visible && !document.hidden) load(); });

  // ── stats: all time, You and them side by side ──
  // every word either of you played, newest first (a day's bonus words after its own word)
  function history() {
    const m = new Map();
    const put = (d, r, word2, nyt2, me, th) => m.set(`${d}#${r}`, { day: d, round: r, word: word2, nyt: nyt2 ? dayKey(nyt2) : null, me: me || null, them: th || null });
    for (const d of st?.days || []) put(dayKey(d.day), d.round || 1, d.word, d.nyt, d.mine, d.theirs);
    for (const x of roundsOf(st)) put(dayKey(st.today), x.round, x.word, x.nyt, x.mine, x.theirs);
    if (day && word) put(day, round, word, nyt, mine.length ? { n: mine.length, solved, done, guesses: [...mine] } : null, theirs);
    return [...m.values()].filter((x) => x.me || x.them).sort((a, b) => (a.day !== b.day ? (a.day < b.day ? 1 : -1) : b.round - a.round));
  }
  // a run of days in a row, on each day's own word (bonus words don't make or break a streak): the
  // current one ends today if today's is done, else yesterday
  function streaks(all, ok, finished) {
    const list = all.filter((x) => (x.round || 1) === 1);
    const good = new Set(list.filter(ok).map((x) => x.day));
    const today = app.today();
    let d = list.some((x) => x.day === today && finished(x)) ? today : addDays(today, -1), cur = 0;
    while (good.has(d)) { cur++; d = addDays(d, -1); }
    let best = 0, run = 0, prev = null;
    for (const x of [...good].sort()) { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; }
    return { cur, best };
  }
  function person(list, who) {
    const games = list.filter((x) => x[who]?.done), won = games.filter((x) => x[who].solved);
    const dist = Array(ROWS + 1).fill(0);
    for (const x of games) dist[x[who].solved ? x[who].n - 1 : ROWS]++;
    const s = streaks(list, (x) => x[who]?.done && x[who].solved, (x) => x[who]?.done);
    return {
      played: games.length, won: won.length, rate: games.length ? won.length / games.length : null,
      avg: won.length ? won.reduce((t, x) => t + x[who].n, 0) / won.length : null,
      best: won.length ? Math.min(...won.map((x) => x[who].n)) : null, dist, streak: s.cur, longest: s.best,
    };
  }
  function statsSheet() {
    const n = them(), list = history();
    const a = person(list, 'me'), b = person(list, 'them');
    const both = list.filter((x) => x.me?.done && x.them?.done);
    let w = 0, l = 0, t = 0;
    for (const x of both) { const p = points(x.me), q = points(x.them); if (p < q) w++; else if (p > q) l++; else t++; }
    const together = streaks(list, (x) => x.me?.solved && x.them?.solved && x.me.done && x.them.done, (x) => x.me?.done && x.them?.done);
    const pct = (k) => (k == null ? '–' : `${Math.round(k * 100)}%`);
    const num = (v, d = 0) => (v == null ? '–' : d ? v.toFixed(d) : String(v));
    const rowsT = [
      ['Played', num(a.played), num(b.played)],
      ['Solved', a.played ? `${a.won} · ${pct(a.rate)}` : '–', b.played ? `${b.won} · ${pct(b.rate)}` : '–'],
      ['Average', num(a.avg, 1), num(b.avg, 1)],
      ['Best', num(a.best), num(b.best)],
      ['Streak', num(a.streak), num(b.streak)],
      ['Longest', num(a.longest), num(b.longest)],
    ];
    const max = Math.max(1, ...a.dist, ...b.dist);
    const bar = (cls, v) => (v ? h(`div.fl-bar.${cls}`, { style: { width: `max(${(v / max) * 100}%, 22px)` } }, String(v)) : h('div.fl-bar.zero'));
    const dist = h('div.fl-dist', a.dist.map((_, i) => h('div.fl-dist-row',
      h('span.fl-dist-k', i < ROWS ? String(i + 1) : 'X'),
      h('div.fl-bars', bar('me', a.dist[i]), bar('them', b.dist[i])))));
    const label = (x, y) => h('div.dt-label', h('span', x), h('span', y));
    const past = list.filter((x) => !(x.day === day && x.round === round && !done));
    sheet('Stats', [
      h('div.dt-hero.fl-hero',
        h('span.dt-hero-label', 'HEAD TO HEAD, ALL TIME'),
        h('div.dt-hero-num', `${w}–${l}`),
        h('p', both.length ? `You ${w}, ${n} ${l}${t ? `, ${t} tie${t > 1 ? 's' : ''}` : ''}, over the ${both.length === 1 ? 'one word' : `${both.length} words`} you've both played. Fewer guesses wins.` : `Once you and ${n} have both played a word, it counts here. Fewer guesses wins.`)),
      h('section.dt-sec',
        label('YOU AND ' + n.toUpperCase(), `ALL TIME · ${list.length} ${list.length === 1 ? 'WORD' : 'WORDS'}`),
        h('table.dt-stats',
          h('thead', h('tr', h('th', ''), h('th', 'You'), h('th', n))),
          h('tbody', rowsT.map(([k, x, y]) => h('tr', h('th', k), h('td', x), h('td', y))))),
        h('table.dt-stats.two', h('tbody',
          h('tr', h('th', 'Both got it'), h('td', `${both.filter((x) => x.me.solved && x.them.solved).length} of ${both.length}`)),
          h('tr', h('th', 'Together'), h('td', together.cur === 1 ? '1 day in a row' : `${together.cur} days in a row`)),
          h('tr', h('th', 'Best together'), h('td', String(together.best)))))),
      h('section.dt-sec', h('div.dt-label', h('span', 'GUESSES'), h('span.fl-legend', h('i.me'), 'YOU', h('i.them'), n.toUpperCase())), dist),
      h('section.dt-sec', label('PAST DAYS', String(past.length)),
        past.length ? h('div.fl-days', past.map((x) => h('button.fl-day', { type: 'button', onclick: () => daySheet(x) },
          h('span.fl-day-d', shortDate(x.day).toUpperCase(), x.round > 1 ? h('i', 'BONUS') : null),
          h('b.fl-day-w', x.word),
          h('span.fl-day-r', `You ${x.me?.done ? (x.me.solved ? x.me.n : 'X') : '–'} · ${n} ${x.them?.done ? (x.them.solved ? x.them.n : 'X') : '–'}`))))
          : h('p.dt-empty-line', 'Finished days land here.')),
    ], { tall: true, quiet: true, className: 'dt-sheet fl-sheet', pullAnywhere: true });
  }
  function daySheet(x) {
    sheet('', [pairPanel(x)], { quiet: true, className: 'dt-sheet fl-sheet fl-day-sheet', pullAnywhere: true });
  }

  function howSheet() {
    const n = them();
    const ex = (w, at, s, text) => h('div.fl-ex', h('div.fl-row', [...w].map((c, i) => h(`div.fl-tile${i === at ? `.s${s}` : '.typed'}`, c))), h('p', text));
    sheet('How to play', [
      h('p.fl-how', 'Guess the word in six tries. Each guess is a real five-letter word: type it and tap Enter.'),
      ex('worms', 0, 2, 'Green: W is in the word, in the right spot.'),
      ex('heart', 1, 1, 'Yellow: E is in the word, in another spot.'),
      ex('cloud', 3, 0, 'Gray: U isn\'t in the word at all.'),
      h('p.fl-how', `You and ${n} get the same word: the New York Times' Wordle answer from two days before. ${n}'s grid stays hidden until you've finished yours, then they sit side by side.`),
    ], { quiet: true, className: 'dt-sheet fl-sheet' });
  }

  return {
    // for the Games page: what waits here (null = nothing)
    status() {
      const today = app.today();
      if (!(st?.word && dayKey(st.today) === today)) return 'New word';
      const list = roundsOf(st).map((x) => ({ ...x, gs: day === today && x.round === round ? mine : merged(x.mine, today, x.round) }));
      if (!isDone(list[0].gs, list[0].word)) return list[0].gs.length ? 'Your turn' : 'New word';
      return list.slice(1).some((x) => !isDone(x.gs, x.word)) ? 'Bonus word' : null;
    },
    prime: () => (st?.word && dayKey(st.today) === app.today() ? null : load()),
    show() { visible = true; render(); load(); },
    hide() { visible = false; poll(); },
    get visible() { return visible; },
  };
}
