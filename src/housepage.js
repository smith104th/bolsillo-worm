// The last page: Garden and House (Ryue Nishizawa, Tokyo). Questions about each other build it,
// one piece per right answer. You see your house as it stands, and can peek at it finished.
// three.js lives in its own bundle (house/view.js) and only loads the first time you come here.
import { h, store } from './util.js';

const HOUSE = __HOUSE__; // ./house/view.js?v=<hash>, set by build.mjs

export function HousePage(app, root, { onEdge, demo = false } = {}) {
  let view = null, loading = null, visible = false, sky = null;
  const built = () => Math.max(1, store('housePieces') || 1);

  const stage = h('div.hp-stage');
  const count = h('p.hp-count');
  const finishedBtn = h('button.hp-seg', { type: 'button', onclick: () => setFinished(true) }, 'Finished');
  const oursBtn = h('button.hp-seg.on', { type: 'button', onclick: () => setFinished(false) }, 'Ours');
  const floors = [['All', 4], ['4F', 3], ['3F', 2], ['2F', 1], ['1F', 0]].map(([label, k]) =>
    h(k === 4 ? 'button.hp-floor.on' : 'button.hp-floor', { type: 'button', onclick: (e) => { view?.setCut(k); floorsRow.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, label));
  const floorsRow = h('div.hp-floors.glass', floors);
  const addBtn = demo ? h('button.hp-add.glass', { type: 'button', onclick: () => addPieces(1) }, '+ piece') : null;
  const veil = h('div.hp-veil', 'Pouring concrete…');

  root.replaceChildren(
    stage,
    h('header.hp-head', h('h1.hp-title', 'Garden & House'), count),
    h('div.hp-toggle.glass', oursBtn, finishedBtn),
    h('div.hp-bottom', addBtn, floorsRow),
    veil,
  );

  function label() {
    const n = view ? (view.finished ? view.total : view.built) : built();
    const total = view?.total || 105;
    count.textContent = view?.finished ? `Finished · ${total} pieces` : n >= total ? `Finished · ${total} pieces` : `${n} of ${total} pieces`;
  }

  function setFinished(on) {
    finishedBtn.classList.toggle('on', on); oursBtn.classList.toggle('on', !on);
    view?.setFinished(on);
    label();
  }

  // a right answer: n new pieces drop in (the nearer of you sets each one down)
  function addPieces(n) {
    const next = Math.min((view?.total || 105), built() + n);
    store('housePieces', next);
    if (view) { if (view.finished) setFinished(false); view.setBuilt(next, { animate: true }); }
    label();
  }

  async function ensure() {
    if (view) return view;
    if (!loading) {
      loading = import(new URL(HOUSE, location.href).href).then((m) => {
        view = m.createHouseView(stage, { place: app.them()?.place || null, sky, built: built(), onEdge });
        veil.classList.add('gone');
        label();
        return view;
      }).catch((e) => { loading = null; veil.textContent = 'The house needs a signal to load the first time.'; console.warn(e); });
    }
    return loading;
  }

  label();
  return {
    async show() { visible = true; const v = await ensure(); if (v && visible) { v.setSky(sky, app.them()?.place || null); v.start(); } },
    hide() { visible = false; view?.stop(); },
    setSky(s) { sky = s; if (view && visible) view.setSky(s, app.them()?.place || null); },
    addPieces,
  };
}
