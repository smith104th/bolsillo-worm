// /house/: the dev page around the same view the app uses, with the controls we need to look at it.
import { createHouseView } from './world.js';
import { tokyoHours } from './sun.js';

const q = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);
const stage = $('#stage');
const hv = createHouseView(stage, {
  built: q.has('build') ? +q.get('build') : 9999,
  ao: q.get('ao') !== '0',
  hour: q.has('t') ? +q.get('t') : null,
});
window.__house = hv;
if (q.has('view')) hv.view(q.get('view'), true);
else hv.frame(true);
if (q.has('cut')) hv.setCut(+q.get('cut'));

const S = { hour: q.has('t') ? +q.get('t') : tokyoHours() };
const showTime = () => {
  const hh = Math.floor(S.hour), mm = Math.floor((S.hour - hh) * 60);
  $('#time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('#sun').value = S.hour;
};
$('#sun').addEventListener('input', (e) => { S.hour = +e.target.value; hv.setHour(S.hour); $('#tlabel').textContent = 'Tokyo'; showTime(); });
$('#nowbtn').addEventListener('click', () => { S.hour = tokyoHours(); hv.setHour(null); $('#tlabel').textContent = 'Tokyo, now'; showTime(); });
document.querySelectorAll('[data-cut]').forEach((b) => b.addEventListener('click', () => {
  hv.setCut(+b.dataset.cut);
  document.querySelectorAll('[data-cut]').forEach((x) => x.classList.toggle('on', x === b));
}));
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => hv.view(b.dataset.view)));

// build: one piece at a time (what a right answer does), or see it finished
const bcount = () => { $('#bcount').textContent = `${hv.built} / ${hv.total}`; $('#bname').textContent = hv.pieces[hv.built - 1].name; };
$('#addone').addEventListener('click', () => { hv.setBuilt(hv.built + 1, { animate: true }); bcount(); });
$('#addfive').addEventListener('click', () => { hv.setBuilt(hv.built + 5, { animate: true }); bcount(); });
$('#restart').addEventListener('click', () => { hv.setFinished(false); $('#finished').classList.remove('on'); hv.setBuilt(1); bcount(); });
$('#finished').addEventListener('click', (e) => { const on = !hv.finished; hv.setFinished(on); e.currentTarget.classList.toggle('on', on); e.currentTarget.textContent = on ? 'Back to ours' : 'See it finished'; });
$('#buildtoggle').addEventListener('click', () => document.body.classList.toggle('building'));
if (q.has('build')) document.body.classList.add('building');

showTime(); bcount();
hv.start();
document.body.classList.add('ready');
if (q.has('still')) setTimeout(() => hv.stop(), 2500);
