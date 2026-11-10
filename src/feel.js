// Haptics + tiny synthesized sounds. No audio files.
import { store } from './util.js';

let ctx = null;
let unlocked = false;
const settings = () => store('settings') || {};

// iOS Safari has no vibration API; toggling a native switch gives a haptic tick on iOS 18+.
let iosSwitch = null;
function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.append(input);
    document.body.append(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

export function buzz(pattern = 12) {
  if (settings().haptics === false) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(pattern); return; }
    const arr = Array.isArray(pattern) ? pattern : [pattern];
    let t = 0;
    arr.forEach((ms, i) => { if (i % 2 === 0) setTimeout(iosTick, t); t += ms; });
  } catch { /* fine */ }
}

let out = null;
function ac() {
  if (settings().sound === false || !unlocked) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // a soft bus: a warm lowpass + a small echo so every ding rings out.
      // Softened Nov 9 (Manu: "a little more subtle and softer"): quieter, rounder, less echo.
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.2;
      const master = ctx.createGain(); master.gain.value = 0.55;
      const delay = ctx.createDelay(1); delay.delayTime.value = 0.21;
      const fb = ctx.createGain(); fb.gain.value = 0.2;
      const wet = ctx.createGain(); wet.gain.value = 0.14;
      master.connect(lp); lp.connect(ctx.destination);
      lp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ctx.destination);
      out = master;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
export function unlockAudio() { unlocked = true; ac(); }

// a little bell: a sine with two faint overtones, a gentle start and a long soft tail
function ding(freq, { at = 0, vol = 0.07, dur = 0.9 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  for (const [mult, v] of [[1, 1], [2, 0.1], [3.01, 0.02]]) {
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq * mult, t);
    const og = a.createGain(); og.gain.value = v;
    o.connect(og).connect(g);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
// notes from A5 on a major pentatonic, so anything played together sounds sweet
// (a little lower than the old C6, which read as pingy)
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const note = (step, base = 880) => base * Math.pow(2, (PENTA[((step % PENTA.length) + PENTA.length) % PENTA.length] + 12 * Math.floor(step / PENTA.length)) / 12);
let petStep = 0;

export const sfx = {
  pop: () => ding(note(3), { vol: 0.05, dur: 0.6 }),
  boop: () => { ding(note(0), { vol: 0.06, dur: 0.6 }); ding(note(2), { at: 0.08, vol: 0.05, dur: 0.7 }); },
  squish: () => ding(note(-3), { vol: 0.05, dur: 0.7 }),
  coo: () => { petStep = (petStep + 1 + (Math.random() < 0.3 ? 1 : 0)) % 8; ding(note(petStep), { vol: 0.035, dur: 0.8 }); },
  kiss: (lvl = 1, only = 0) => {
    if (only) return ding(note(only + 1), { vol: 0.045, dur: 0.7 });
    for (let i = 0; i < lvl; i++) ding(note(i * 1 + 2), { at: i * 0.09, vol: 0.05, dur: 0.9 });
  },
  paper: () => ding(note(7), { vol: 0.012, dur: 0.35 }),
  knock: () => { ding(note(-2), { vol: 0.07, dur: 0.5 }); ding(note(-2), { at: 0.17, vol: 0.06, dur: 0.6 }); },
  chime: () => [0, 2, 4].forEach((s, i) => ding(note(s + 2), { at: i * 0.11, vol: 0.05, dur: 1.1 })),
  plop: () => ding(note(1), { vol: 0.04, dur: 0.5 }),
  chomp: () => ding(note(-4 + ((Math.random() * 3) | 0)), { vol: 0.025, dur: 0.3 }),
  mist: () => [8, 7, 6, 5, 4].forEach((s, i) => ding(note(s), { at: i * 0.05, vol: 0.022, dur: 0.6 })),
  tick: () => ding(note(5), { vol: 0.02, dur: 0.25 }),
  knot: () => [0, 2, 3, 5, 7, 9].forEach((s, i) => ding(note(s), { at: i * 0.075, vol: 0.045, dur: 1.2 })),
  react: () => { ding(note(4), { vol: 0.045, dur: 0.7 }); ding(note(7), { at: 0.1, vol: 0.04, dur: 0.9 }); },
};
