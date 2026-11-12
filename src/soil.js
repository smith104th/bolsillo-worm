// The soil, one of the games. Questions you grow together, mostly words:
// today's question, the ones you plant for each other, and every answer so far.
import { h, prettyDay } from './util.js';
import { sheet, btn, toast, icon } from './ui.js';
import { reactRow, theirReactions } from './compose.js';
import { sfx } from './feel.js';
import { zineSheet } from './zine.js';

export const SOIL_BG = '#0F7A4E', SOIL_FG = '#FFD84A';
const monthName = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
const yearOf = (day) => day.slice(0, 4);
const dayKey = (r) => String(r.day).slice(0, 10);
const PRINT = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/></svg>';

export function SoilPage(app, root, { onBack } = {}) {
  let rows = null, visible = false;
  const scroll = h('div.soil-scroll');
  const print = h('button.soil-print', { type: 'button', 'aria-label': 'Print our year', onclick: () => zineSheet(app), html: PRINT });
  // Back to Games, in the same glass bar the House uses
  const back = h('button.tab', { type: 'button', 'aria-label': 'Back', onclick: () => onBack?.() }, icon('back'), h('span.lbl', 'Back'));
  root.replaceChildren(scroll, print, h('div.hp-dock.soil-dock', h('div.tabbar.glass.hp-bar', back)));

  async function load() {
    try { rows = await app.backend.dailies(400); } catch { /* keep what we have */ }
    render();
  }

  function render() {
    const them = app.them()?.name || 'Them';
    const today = app.today();
    const list = rows || [];
    const t = list.find((r) => dayKey(r) === today) || {};
    const Q = app.questionFor(today);
    const both = list.filter((r) => r.my_answer && r.their_answer).length;
    const out = [];

    out.push(h('header.s-head',
      h('div.s-meta', both ? `${both} ANSWERED TOGETHER` : 'QUESTIONS FOR TWO'),
      h('h1.s-title', 'Soil'),
      h('p.s-lede', 'What you grow together, one question at a time.')));

    // today
    const ans = h('textarea.s-input', { rows: 3, maxLength: 1000, placeholder: 'Your answer…' });
    const mine = t.my_answer
      ? h('div.s-ans', h('span.s-who', 'You'), h('p', t.my_answer), theirReactions(app, { day: today, part: 'answer' }))
      : h('div.s-form', ans, btn('Bury my answer', async (e) => {
        const v = ans.value.trim(); if (!v) return ans.focus();
        const b = e.currentTarget; b.disabled = true;
        try { const r = await app.backend.daily(today, { answer: v }); app.backend.nudge('daily', { part: 'answer', both: r.both }); await load(); }
        catch { b.disabled = false; toast('Couldn\'t bury it. Try again.'); }
      }, 's-btn'));
    const theirs = t.their_answer
      ? h('div.s-ans', h('span.s-who', them), h('p', t.their_answer), reactRow(app, { day: today, part: 'answer', about: 'answer' }))
      : h('div.s-ans.waiting', h('span.s-who', them), h('p', t.their_answered ? `Buried. Answer yours and ${them}'s comes up.` : `Hasn't answered yet.`));
    out.push(h('section.s-today',
      h('div.s-label', `Today · ${prettyDay(today)}`),
      Q.by ? h('div.s-planted', Q.mine ? '🌱 You planted this one' : `🌱 ${Q.by} planted this one`) : null,
      h('h2.s-q', Q.q),
      mine, theirs));

    // planting
    const seedIn = h('textarea.s-input', { rows: 2, maxLength: 200, placeholder: `Ask ${them} something…` });
    const seeds = [...app.S.planted.values()].filter((p) => p.from_slot === app.slot() && String(p.day).slice(0, 10) > today).sort((a, b) => (a.day > b.day ? 1 : -1));
    out.push(h('section.s-plant',
      h('div.s-label', 'Plant a question'),
      h('p.s-note', `It becomes the question of the day on the next free day. ${them} won't see it until it comes up.`),
      h('div.s-form', seedIn, btn('Plant it', async (e) => {
        const q = seedIn.value.trim(); if (q.length < 3) return seedIn.focus();
        const b = e.currentTarget; b.disabled = true;
        try {
          const day = String(await app.backend.plant(q)).slice(0, 10);
          app.backend.nudge('plant', { when: app.whenDay(day) });
          toast(`Planted. It comes up ${app.whenDay(day)}.`, { tone: 'love' });
          await app.loadPlanted(); render();
        } catch (err) { b.disabled = false; toast(/too_many/.test(err.message) ? 'Seven seeds in the ground already. Let one come up first.' : 'Couldn\'t plant it. Try again.'); }
      }, 's-btn')),
      seeds.length ? h('div.s-seeds', seeds.map((p) => h('div.s-seed',
        h('div', h('span.s-when', `Comes up ${app.whenDay(String(p.day).slice(0, 10))}`), h('p', p.question)),
        h('button.s-dig', { type: 'button', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { await app.backend.unplant(String(p.day).slice(0, 10)); await app.loadPlanted(); render(); toast('Dug up.'); } catch { toast('Couldn\'t dig it up.'); }
        } }, 'Dig up')))) : null));

    // everything answered before today, newest first, by month
    const past = list.filter((r) => dayKey(r) < today && (r.my_answer || r.their_answer || r.my_thumb || r.their_thumb)).sort((a, b) => (dayKey(a) < dayKey(b) ? 1 : -1));
    const earlier = [h('div.s-label', 'Earlier')];
    let month = null;
    for (const r of past) {
      const d = dayKey(r), m = d.slice(0, 7);
      if (m !== month) { month = m; earlier.push(h('h3.s-month', monthName(d), yearOf(d) !== today.slice(0, 4) ? h('span', ` ${yearOf(d)}`) : null)); }
      const q = app.questionFor(d);
      // that day's photo sits under each answer, in the same column (Manu, Nov 10)
      const pic = (mediaId, thumb, who) => (thumb ? h('button.s-pic', { type: 'button', 'aria-label': `${who}'s photo, ${prettyDay(d)}`, onclick: () => viewPhoto(app, mediaId, thumb, prettyDay(d)) }, h('img', { src: thumb, alt: '' })) : null);
      earlier.push(h('article.s-entry',
        h('div.s-date', prettyDay(d).toUpperCase(), q.by ? h('span', q.mine ? ' · YOU PLANTED THIS' : ` · ${q.by.toUpperCase()} PLANTED THIS`) : null),
        h('h3.s-eq', q.q),
        h('div.s-pair',
          h('div', h('span.s-who', 'You'), h(`p${r.my_answer ? '' : '.none'}`, r.my_answer || 'No answer'), pic(r.my_photo, r.my_thumb, 'Your')),
          h('div', h('span.s-who', them), h(`p${r.their_answer ? '' : '.none'}`, r.their_answer || (r.their_answered ? 'Buried. You never dug it up.' : 'No answer')), pic(r.their_photo, r.their_thumb, them)))));
    }
    if (!past.length) earlier.push(h('p.s-note', rows ? 'Every question you both answer settles here, newest on top.' : 'Digging…'));
    out.push(h('section.s-earlier', earlier));

    const foot = h('footer.s-foot', btn('Print our year', () => zineSheet(app), 's-btn'), h('p.s-note', 'A half-letter zine of every question, photo and note from the year.'));
    // what's new sits on white; everything that came before stays green
    const [header, todaySec, plantSec, earlierSec] = out;
    const y = scroll.scrollTop;
    scroll.replaceChildren(h('div.s-top', header, todaySec, plantSec), h('div.s-bottom', earlierSec, foot));
    scroll.scrollTop = y;
  }

  app.onDaily(() => { if (visible) load(); });
  return {
    // seeds get re-dealt whenever either of you plants or digs up: refresh them on
    // every visit too (loadPlanted fires onDaily, which re-renders)
    show() { visible = true; render(); load(); app.loadPlanted(); },
    hide() { visible = false; },
    refresh() { if (visible) load(); },
  };
}

export async function viewPhoto(app, mediaId, thumb, title = 'Photo of the day') {
  const img = h('img', { src: thumb, alt: '' });
  sheet(title, h('div.polaroid', h('div.polaroid-img', img)), { quiet: true });
  if (mediaId) try { const m = await app.backend.media(mediaId); if (m?.data) img.src = m.data; } catch { /* thumb is fine */ }
}

// ── planting a question for them
export function plantSheet(app) {
  const them = app.them()?.name || 'them';
  const ta = h('textarea', { rows: 3, maxLength: 200, placeholder: `Ask ${them} something…` });
  const count = h('span.small.muted', '0 / 200');
  ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / 200`; });
  const seeds = h('div.seeds');
  const renderSeeds = () => {
    const today = app.today();
    const mine = [...app.S.planted.values()].filter((p) => p.from_slot === app.slot() && String(p.day).slice(0, 10) > today).sort((a, b) => (a.day > b.day ? 1 : -1));
    seeds.replaceChildren(...(mine.length ? [h('h3', 'Your seeds'), ...mine.map((p) => h('div.seed-row',
      h('div', h('span.mono.tiny', `COMES UP ${app.whenDay(String(p.day).slice(0, 10)).toUpperCase()}`), h('p', p.question)),
      btn('Dig up', async (e) => {
        e.currentTarget.disabled = true;
        try { await app.backend.unplant(String(p.day).slice(0, 10)); await app.loadPlanted(); renderSeeds(); toast('Dug up.'); } catch { toast('Couldn\'t dig it up.'); e.currentTarget.disabled = false; }
      }, 'ghost small')))] : []));
  };
  const s = sheet('Plant a question', [
    h('p.small.muted', `It comes up as your question of the day on the next free day. ${them} won't see it until then, and you both answer it like any other.`),
    h('div.paper-card', { style: { background: '#FFFFFF' } }, ta),
    h('div.row.between', count, btn('Plant it', async (e) => {
      const q = ta.value.trim();
      if (q.length < 3) return ta.focus();
      const b = e.currentTarget; b.disabled = true;
      try {
        const day = String(await app.backend.plant(q)).slice(0, 10);
        app.backend.nudge('plant', { when: app.whenDay(day) });
        toast(`Planted. It comes up ${app.whenDay(day)}.`, { tone: 'love' });
        ta.value = ''; count.textContent = '0 / 200';
        await app.loadPlanted(); renderSeeds();
      } catch (err) {
        toast(/too_many/.test(err.message) ? 'Seven seeds in the ground already. Let one come up first.' : 'Couldn\'t plant it. Try again.');
      }
      b.disabled = false;
    }, 'primary')),
    seeds,
  ]);
  renderSeeds();
  setTimeout(() => ta.focus(), 350);
  return s;
}

