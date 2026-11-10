// The house's questions: you each write as many questions about yourself as you like
// (multiple choice or yes / no) and answer one of the other's a day. Every right answer,
// from either of you, puts up a piece of the same house. The server keeps the answers.
import { h } from './util.js';
import { sheet, btn, toast, icon } from './ui.js';

const PROMPTS = {
  choice: [
    'What do I always order at a café?',
    'What did I want to be when I was little?',
    'Which city would I move to tomorrow?',
    "What's my comfort food when I'm sick?",
    'Which song do I know every word to?',
    'What would I save first in a fire?',
    'Where was my favorite trip?',
    'What do I do first when I get home?',
  ],
  yesno: [
    'Have I ever broken a bone?',
    'Do I sleep with socks on?',
    'Have I ever been on TV?',
    'Did I cry at the end of the last movie we watched?',
    'Would I eat a bug for $100?',
    'Have I ever slept in an airport?',
  ],
};

const errText = (e) => {
  const m = String(e?.message || e);
  if (/one_a_day/.test(m)) return 'You already answered one today. Next one tomorrow.';
  if (/already_answered/.test(m)) return 'That one is already answered.';
  if (/bad_options/.test(m)) return 'Fill in at least two answers.';
  if (/too_many/.test(m)) return 'That is a lot of questions waiting. Let them catch up.';
  if (/Failed to fetch|network|offline/i.test(m)) return 'No signal. Try again in a bit.';
  return 'That didn\'t go through. Try again.';
};

// ctx: { state() → current state, reload() → fresh state, onRight(pieces), backend, them }
export function questionsSheet(app, ctx) {
  const them = app.them()?.name || 'them';
  const body = h('div.hq');
  const s = sheet('Questions', body, { tall: true });

  function render() {
    const st = ctx.state();
    if (!st) { body.replaceChildren(h('p.lede', 'Loading…')); return; }
    body.replaceChildren(
      h('p.hq-lede', `You each answer one of the other's questions a day. Every right answer puts up a piece of the house.`),
      todayCard(st),
      btn([icon('doodle'), ' Write a question'], () => composeSheet(app, ctx, render), 'primary wide'),
      yours(st),
      theirs(st),
    );
  }

  // ── today's question from them
  function todayCard(st) {
    const card = h('div.hq-today');
    if (st.answered_today && st.today_answer) {
      const a = st.today_answer;
      card.append(
        h('span.hq-label', 'TODAY'),
        h('p.hq-q', a.question),
        h('p.hq-result', a.correct ? `Right: “${a.options[a.answer]}”. A piece went up.` : `You said “${a.options[a.picked]}”. It was “${a.options[a.answer]}”.`),
        h('p.hq-foot', 'Next one tomorrow.'),
      );
      return card;
    }
    if (!st.next) {
      card.append(h('span.hq-label', 'TODAY'), h('p.hq-q', `${them} hasn't written you a question yet.`), h('p.hq-foot', 'When they do, it shows up here.'));
      return card;
    }
    const q = st.next;
    let pick = null, done = false;
    const opts = h(`div.hq-opts${q.kind === 'yesno' ? '.yn' : ''}`, q.options.map((o, i) => h('button.hq-opt', {
      type: 'button',
      onclick: () => { if (done) return; pick = i; [...opts.children].forEach((b, k) => b.classList.toggle('on', k === i)); go.disabled = false; },
    }, o)));
    const go = btn('Answer', async () => {
      if (pick == null || done) return;
      go.disabled = true; go.classList.add('busy');
      try {
        const r = await app.backend.hqAnswer(q.id, pick);
        done = true;
        [...opts.children].forEach((b, k) => { b.classList.toggle('right', k === r.answer); b.classList.toggle('wrong', k === pick && !r.correct); b.disabled = true; });
        go.remove();
        card.append(h('p.hq-result', r.correct ? 'Right. A piece goes up.' : `Not this time. It was “${q.options[r.answer]}”.`));
        app.backend.nudge('house', { correct: r.correct, q: q.question.slice(0, 80) });
        await ctx.reload();
        if (r.correct) setTimeout(() => { s.close(); ctx.onRight(r.pieces); }, 1300);
        else setTimeout(render, 2600);
      } catch (e) {
        toast(errText(e)); go.disabled = false; go.classList.remove('busy');
        await ctx.reload(); render();
      }
    }, 'hq-go');
    go.disabled = true;
    card.append(h('span.hq-label', `${them.toUpperCase()} ASKS`), h('p.hq-q', q.question), opts, go,
      st.waiting > 1 ? h('p.hq-foot', `${st.waiting - 1} more waiting for the next days.`) : null);
    return card;
  }

  // ── the ones you wrote
  function yours(st) {
    if (!st.mine.length) return h('div.hq-list', h('h3', 'Yours'), h('p.hq-empty', `Write ${them} a few. They answer one a day.`));
    return h('div.hq-list', h('h3', 'Yours'), st.mine.map((q) => {
      const status = !q.answered_at ? h('span.hq-pill.wait', 'Waiting')
        : q.correct ? h('span.hq-pill.right', `${them} got it`)
          : h('span.hq-pill.wrong', `${them} said “${q.options[q.picked]}”`);
      const take = !q.answered_at ? h('button.hq-x', { type: 'button', 'aria-label': 'Take it back', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { await app.backend.hqDelete(q.id); await ctx.reload(); render(); } catch (err) { toast(errText(err)); }
      } }, icon('close')) : null;
      return h('div.hq-row', h('div.hq-row-main', h('p', q.question), h('span.hq-meta', `${q.kind === 'yesno' ? 'Yes or no' : 'Multiple choice'} · “${q.options[q.answer]}”`), status), take);
    }));
  }

  // ── the ones you answered
  function theirs(st) {
    if (!st.theirs.length) return null;
    const right = st.theirs.filter((q) => q.correct).length;
    return h('div.hq-list', h('h3', `${them}'s`), h('p.hq-empty', `You got ${right} of ${st.theirs.length}.`), st.theirs.slice(0, 20).map((q) =>
      h('div.hq-row', h('div.hq-row-main', h('p', q.question),
        h('span.hq-meta', q.correct ? `“${q.options[q.answer]}”` : `You said “${q.options[q.picked]}” · it was “${q.options[q.answer]}”`),
        h(`span.hq-pill.${q.correct ? 'right' : 'wrong'}`, q.correct ? 'Right' : 'Not this time')))));
  }

  render();
  ctx.reload().then((st) => { if (st) render(); else if (!ctx.state()) body.replaceChildren(h('p.lede', 'Couldn\'t reach the house. Try again when you have signal.')); });
  return s;
}

// ── write one
function composeSheet(app, ctx, after) {
  const them = app.them()?.name || 'them';
  let kind = 'choice', right = 0, yn = 0;
  const ta = h('textarea.hq-input', { rows: 2, maxLength: 200, placeholder: 'Ask something about you…' });
  const inputs = [0, 1, 2, 3].map((i) => h('input.hq-ans', { type: 'text', maxLength: 80, placeholder: i < 2 ? `Answer ${i + 1}` : `Answer ${i + 1} (optional)` }));
  const radios = inputs.map((_, i) => h('button.hq-radio', { type: 'button', 'aria-label': `Answer ${i + 1} is the right one`, onclick: () => { right = i; paint(); } }));
  const choiceBox = h('div.hq-choice', h('p.hq-hint', 'Tap the circle next to the right answer.'), inputs.map((inp, i) => h('div.hq-ans-row', radios[i], inp)));
  const ynBtns = ['Yes', 'No'].map((label, i) => h('button.hq-opt', { type: 'button', onclick: () => { yn = i; paint(); } }, label));
  const ynBox = h('div.hq-yn', h('p.hq-hint', 'The right answer is'), h('div.hq-opts.yn', ynBtns));
  const segs = [['choice', 'Multiple choice'], ['yesno', 'Yes or no']].map(([k, label]) => h('button.hq-seg', { type: 'button', onclick: () => { kind = k; paint(); } }, label));
  const prompts = h('div.hq-prompts');
  const paint = () => {
    segs.forEach((b, i) => b.classList.toggle('on', (i === 0) === (kind === 'choice')));
    radios.forEach((r, i) => r.classList.toggle('on', i === right));
    ynBtns.forEach((b, i) => b.classList.toggle('on', i === yn));
    choiceBox.hidden = kind !== 'choice'; ynBox.hidden = kind !== 'yesno';
    prompts.replaceChildren(...PROMPTS[kind].map((p) => h('button.hq-prompt', { type: 'button', onclick: () => { ta.value = p; ta.focus(); } }, p)));
  };
  const save = btn('Save it', async () => {
    const question = ta.value.trim();
    if (question.length < 3) { ta.focus(); return toast('Write the question first.'); }
    let options = null, answer = yn;
    if (kind === 'choice') {
      const vals = inputs.map((i) => i.value.trim());
      if (!vals[right]) return toast('The right answer is empty.');
      const kept = vals.map((v, i) => [v, i]).filter(([v]) => v);
      if (kept.length < 2) return toast('Fill in at least two answers.');
      options = kept.map(([v]) => v); answer = kept.findIndex(([, i]) => i === right);
    }
    save.disabled = true;
    try {
      await app.backend.hqAdd(kind, question, options, answer);
      app.backend.nudge('hq', {});
      toast(`Saved. ${them} gets it on a day they haven't answered yet.`, { tone: 'love' });
      await ctx.reload(); after();
      s.close();
    } catch (e) { toast(errText(e)); save.disabled = false; }
  }, 'primary wide');
  const s = sheet('Write a question', h('div.hq', h('div.hq-segs', segs), prompts, ta, choiceBox, ynBox, save), { tall: true });
  paint();
  setTimeout(() => ta.focus(), 350);
  return s;
}
