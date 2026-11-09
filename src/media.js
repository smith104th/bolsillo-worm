// Photos get squeezed small enough to fit through the hole. Voices too.

export function fileToImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = rej;
    img.src = url;
  });
}

export function squeeze(img, max = 1280, quality = 0.74, square = false) {
  let sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height, sx = 0, sy = 0;
  if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const x = c.getContext('2d');
  x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export async function photoFromFile(file) {
  const img = await fileToImage(file);
  return { full: squeeze(img, 1280, 0.74), thumb: squeeze(img, 220, 0.62, true) };
}

// ── whispers
export class Recorder {
  constructor() { this.chunks = []; this.mode = null; }
  static pickType() {
    if (!window.MediaRecorder) return null;
    for (const t of ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac']) if (MediaRecorder.isTypeSupported?.(t)) return t;
    return null;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = Recorder.pickType();
    this.t0 = performance.now();
    if (type) {
      this.mode = 'rec'; this.type = type;
      this.rec = new MediaRecorder(this.stream, { mimeType: type, audioBitsPerSecond: 48000 });
      this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
      this.rec.start(250);
    } else {
      // WAV fallback so every phone can play it back
      this.mode = 'wav';
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = new AC();
      const src = this.ac.createMediaStreamSource(this.stream);
      this.proc = this.ac.createScriptProcessor(4096, 1, 1);
      this.pcm = []; this.rate = this.ac.sampleRate;
      this.proc.onaudioprocess = (e) => this.pcm.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(this.proc); this.proc.connect(this.ac.destination);
    }
    this.analyser = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.vac = this.ac || new AC();
      const s2 = this.vac.createMediaStreamSource(this.stream);
      this.analyser = this.vac.createAnalyser(); this.analyser.fftSize = 256;
      s2.connect(this.analyser);
    } catch { /* level meter is optional */ }
  }
  level() {
    if (!this.analyser) return 0.3 + Math.random() * 0.3;
    const d = new Uint8Array(this.analyser.fftSize); this.analyser.getByteTimeDomainData(d);
    let m = 0; for (const v of d) m = Math.max(m, Math.abs(v - 128)); return m / 128;
  }
  elapsed() { return (performance.now() - this.t0) / 1000; }
  async stop() {
    const dur = this.elapsed();
    let blob;
    if (this.mode === 'rec') {
      await new Promise((r) => { this.rec.onstop = r; this.rec.stop(); });
      blob = new Blob(this.chunks, { type: this.type.split(';')[0] });
    } else {
      this.proc.disconnect();
      blob = encodeWav(this.pcm, this.rate, 16000);
    }
    this.stream.getTracks().forEach((t) => t.stop());
    try { this.vac?.close(); } catch { /* */ }
    try { if (this.ac && this.ac !== this.vac) this.ac.close(); } catch { /* */ }
    return { blob, dur };
  }
}

function encodeWav(chunks, inRate, outRate) {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const all = new Float32Array(len); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = inRate / outRate, n = Math.floor(len / ratio);
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (p, s) => [...s].forEach((ch, i) => v.setUint8(p + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, all[Math.floor(i * ratio)])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

export const blobToDataURL = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
