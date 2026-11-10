// The last page: Garden and House (Ryue Nishizawa, Tokyo). Questions about each other build it,
// one piece per right answer, from either of you. Its own dock: Back, Ours / Finished, Questions.
// three.js lives in its own bundle (house/view.js) and only loads the first time you come here.
import { h, store } from './util.js';
import { icon } from './ui.js';
import { questionsSheet } from './housequestions.js';

const HOUSE = __HOUSE__; // ./house/view.js?v=<hash>, set by build.mjs
const TOTAL = 105;       // pieces in the model; the first (the ground slab) is there from the start

const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  ours: I('<path d="M4 20h16"/><path d="M6 20v-5h12v5"/><path d="M5 15h14"/><path d="M9 15v-3"/>'),
  finished: I('<path d="M3 20h18"/><path d="M4.5 6h15M4.5 10.5h15M4.5 15h15"/><path d="M8 6v14M16 6v14"/><path d="M12 3v3"/>'),
  questions: I('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.4"/><circle cx="12" cy="16.6" r=".5" fill="currentColor"/>'),
};
const svgEl = (s) => { const t = document.createElement('template'); t.innerHTML = s; return t.content.firstChild; };

export function HousePage(app, root, { onEdge, onBack } = {}) {
  let view = null, loading = null, visible = false, sky = null, finished = false;
  let st = null; // server state: { pieces, answered_today, next, waiting, mine, theirs, ... }
  const piecesNow = () => Math.min(TOTAL, 1 + (st ? st.pieces : (store('housePieces') ?? 0)));

  const stage = h('div.hp-stage');
  const count = h('p.hp-count');
  const veil = h('div.hp-veil', 'Pouring concrete…');

  const tab = (id, label, onclick) => h('button.tab', { type: 'button', 'aria-label': label, onclick }, svgEl(ICONS[id]), h('span.lbl', label));
  const back = h('button.tab', { type: 'button', 'aria-label': 'Back', onclick: () => onBack?.() }, icon('back'), h('span.lbl', 'Back'));
  const toggle = tab('ours', 'Ours', () => setFinished(!finished));
  const qTab = tab('questions', 'Questions', () => openQuestions());
  const dot = h('span.dot', { hidden: true });
  qTab.append(dot);
  const dock = h('div.hp-dock', h('div.tabbar.glass.hp-bar', back, toggle, qTab));

  root.replaceChildren(stage, h('header.hp-head', h('h1.hp-title', 'Garden & House'), count), dock, veil);

  function label() {
    const n = piecesNow();
    count.textContent = finished || n >= TOTAL ? `Finished · ${TOTAL} pieces` : `${n} of ${TOTAL} pieces`;
    dot.hidden = !(st && !st.answered_today && st.next);
  }

  function setFinished(on) {
    finished = !!on;
    toggle.classList.toggle('on', finished);
    toggle.replaceChildren(svgEl(finished ? ICONS.finished : ICONS.ours), h('span.lbl', finished ? 'Finished' : 'Ours'));
    view?.setFinished(finished);
    label();
  }

  // pull the latest from the server; pieces your person built while you were away drop in
  async function reload() {
    try {
      st = await app.backend.hqState();
      if (!st) return null;
      const n = piecesNow();
      const seen = store('houseSeen') ?? n;
      store('housePieces', st.pieces);
      if (view && visible) { view.setBuilt(n, { animate: n > seen && !finished }); store('houseSeen', n); }
    } catch (e) { console.warn('house state', e); label(); return null; }
    label();
    return st;
  }

  async function ensure() {
    if (view) return view;
    if (!loading) {
      loading = import(new URL(HOUSE, location.href).href).then((m) => {
        const seen = store('houseSeen');
        view = m.createHouseView(stage, { place: app.them()?.place || null, sky, built: seen ? Math.min(seen, piecesNow()) : piecesNow(), onEdge });
        veil.classList.add('gone');
        label();
        return view;
      }).catch((e) => { loading = null; veil.textContent = 'The house needs a signal to load the first time.'; console.warn(e); });
    }
    return loading;
  }

  function openQuestions() {
    return questionsSheet(app, {
      state: () => st,
      reload,
      onRight: () => { if (finished) setFinished(false); view?.setBuilt(piecesNow(), { animate: true }); store('houseSeen', piecesNow()); label(); },
    });
  }

  label();
  return {
    async show() {
      visible = true;
      const v = await ensure();
      if (v && visible) { v.setSky(sky, app.them()?.place || null); v.start(); }
      reload();
    },
    hide() { visible = false; view?.stop(); },
    setSky(s) { sky = s; if (view && visible) view.setSky(s, app.them()?.place || null); },
    async openQuestions() { await reload(); openQuestions(); },
    reload,
  };
}
