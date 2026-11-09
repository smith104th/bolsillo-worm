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

function ac() {
  if (settings().sound === false || !unlocked) return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}
export function unlockAudio() { unlocked = true; ac(); }

function tone({ f = 440, f2, d = 0.12, type = 'sine', v = 0.12, at = 0 }) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + d + 0.02);
}
function noise({ d = 0.15, v = 0.08, f = 1200, q = 1, type = 'bandpass', f2, at = 0 }) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const len = Math.ceil(a.sampleRate * d);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const fl = a.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  const g = a.createGain(); g.gain.value = v;
  src.connect(fl).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  pop: () => tone({ f: 620, f2: 240, d: 0.09, v: 0.1 }),
  boop: () => { tone({ f: 330, f2: 520, d: 0.08, v: 0.12 }); tone({ f: 520, f2: 300, d: 0.1, v: 0.06, at: 0.07 }); },
  squish: () => noise({ d: 0.12, v: 0.12, f: 500, f2: 1600, q: 3 }),
  coo: () => { tone({ f: 700, f2: 980, d: 0.12, v: 0.05, type: 'triangle' }); tone({ f: 980, f2: 760, d: 0.14, v: 0.05, type: 'triangle', at: 0.12 }); },
  kiss: (lvl = 1) => { noise({ d: 0.06 + lvl * 0.02, v: 0.1 + lvl * 0.02, f: 2400, f2: 700, q: 6 }); tone({ f: 900 + lvl * 80, f2: 400, d: 0.06, v: 0.04, at: 0.03 }); },
  paper: () => { noise({ d: 0.18, v: 0.06, f: 3500, type: 'highpass' }); noise({ d: 0.12, v: 0.04, f: 2500, type: 'highpass', at: 0.12 }); },
  knock: () => { tone({ f: 140, f2: 90, d: 0.09, v: 0.3 }); tone({ f: 140, f2: 90, d: 0.09, v: 0.3, at: 0.16 }); },
  chime: () => { tone({ f: 784, d: 0.5, v: 0.05 }); tone({ f: 1175, d: 0.6, v: 0.04, at: 0.09 }); },
  plop: () => { tone({ f: 200, f2: 700, d: 0.07, v: 0.1 }); },
  chomp: () => noise({ d: 0.05, v: 0.1, f: 900, q: 2 }),
  mist: () => noise({ d: 0.35, v: 0.05, f: 6000, type: 'highpass' }),
  tick: () => tone({ f: 1400, d: 0.03, v: 0.04, type: 'square' }),
  knot: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, d: 0.35, v: 0.05, at: i * 0.08, type: 'triangle' })),
};
