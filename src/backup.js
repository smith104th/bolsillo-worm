// "Save everything": one .zip with every note, answer, photo, song and voice note
// in the pocket, so a server failure can't erase your history.
//   pocket.json   everything, as data (the full record)
//   index.html    a page you can open anywhere, no app needed
//   photos/ today/ whispers/   the full-size media
//   README.txt    what's inside
// Built on the phone (no server change), handed to the share sheet so it lands
// in Files or iCloud Drive. Sealed letters you haven't opened stay sealed: only
// their envelopes are in the file.
import { h, store } from './util.js';
import { sheet, btn, toast } from './ui.js';

const DAY = 86400000;
export const lastBackup = () => store('lastBackup') || null;
// Due when it's been a month since the last save (and the pocket is a week old).
export function backupDue(app) {
  const born = Date.parse(app.S.hole?.created_at || '') || Date.now();
  if (Date.now() - born < 7 * DAY) return false;
  const last = Date.parse(lastBackup() || '') || 0;
  return Date.now() - last > 30 * DAY;
}

// ── a tiny zip writer (stored, no compression: photos and audio are already compressed)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function dosTime(d) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const { time, date } = dosTime(f.date || new Date()), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
    head.setUint16(10, time, true); head.setUint16(12, date, true); head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    parts.push(head, name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true); cd.setUint16(14, date, true); cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    central.push(cd, name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

// ── gathering
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/mpeg': 'mp3' };
const extFor = (mime = '') => EXT[mime.split(';')[0]] || (mime.startsWith('audio') ? 'm4a' : 'jpg');
function dataUrlBytes(s) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(s || '');
  if (!m) return null;
  if (!m[2]) return { mime: m[1], bytes: new TextEncoder().encode(decodeURIComponent(m[3])) };
  const bin = atob(m[3]); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes: out };
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'someone';

export async function buildBackup(app, onProgress = () => {}) {
  const { backend, S } = app;
  const me = app.me(), them = app.them(), slot = app.slot();
  const nameOf = (s) => (s === slot ? me?.name : them?.name) || (s === slot ? 'You' : 'Them');
  onProgress('Gathering everything you two shared…');
  const events = (await backend.allEvents()).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  let dailies = []; try { dailies = await backend.dailies(100000); } catch { /* none yet */ }
  let planted = []; try { planted = await backend.planted(); } catch { /* none */ }
  dailies = dailies.map((d) => ({ ...d, question: app.questionFor?.(d.day)?.q || null })).sort((a, b) => (a.day < b.day ? -1 : 1));

  // full-size media: photos and whispers from events, both of you from Today
  const jobs = [];
  for (const e of events) if (e.media_id) jobs.push({ id: e.media_id, folder: e.kind === 'whisper' ? 'whispers' : 'photos', base: `${e.created_at.slice(0, 10)}_${e.kind === 'photo' ? 'polaroid' : e.kind}_${slug(nameOf(e.from_slot))}_${e.id}`, ref: e });
  for (const d of dailies) {
    if (d.my_photo) jobs.push({ id: d.my_photo, folder: 'today', base: `${d.day}_${slug(nameOf(slot))}`, ref: d, field: 'my_photo_file' });
    if (d.their_photo) jobs.push({ id: d.their_photo, folder: 'today', base: `${d.day}_${slug(nameOf(1 - slot))}`, ref: d, field: 'their_photo_file' });
  }
  const files = [];
  let done = 0, missing = 0;
  for (const j of jobs) {
    onProgress(`Saving photos and voice notes… ${++done} of ${jobs.length}`);
    try {
      const m = await backend.media(j.id);
      const got = dataUrlBytes(m?.data);
      if (!got) { missing++; continue; }
      const name = `${j.folder}/${j.base}.${extFor(m.mime || got.mime)}`;
      files.push({ name, data: got.bytes, date: new Date(j.ref.created_at || `${j.ref.day}T12:00:00`) });
      if (j.field) j.ref[j.field] = name; else j.ref.file = name;
    } catch { missing++; }
  }

  onProgress('Writing it all down…');
  const exportedAt = new Date().toISOString();
  const hole = S.hole || {};
  const record = {
    app: 'Bolsillo Worm', format: 1, exported_at: exportedAt, exported_by: me?.name || null,
    pocket: { code: hole.code, created_at: hole.created_at, reunion_on: hole.reunion_on, reunion_note: hole.reunion_note, tunnel_km: hole.tunnel_km, dug_km: hole.dug_km, tunnels_done: hole.tunnels_done, touches: hole.touches },
    worms: S.members.map(({ slot: s, name, worm, place, love, created_at }) => ({ slot: s, name, worm, place, love, created_at, you: s === slot })),
    events: events.map((e) => ({ ...e, from: nameOf(e.from_slot) })),
    today: dailies,
    planted,
    notes: 'Sealed letters you haven\'t opened yet stay sealed: only their envelopes are here. Media files are in photos/, today/ and whispers/.',
  };
  const counts = {
    moments: events.filter((e) => ['note', 'doodle', 'photo', 'whisper', 'wiggle', 'song', 'trinket', 'later'].includes(e.kind)).length,
    days: dailies.length, photos: files.filter((f) => !f.name.startsWith('whispers/')).length,
    whispers: files.filter((f) => f.name.startsWith('whispers/')).length, missing,
  };
  const stamp = exportedAt.slice(0, 10);
  files.unshift(
    { name: 'README.txt', data: readme(record, counts) },
    { name: 'index.html', data: page(record, nameOf, slot) },
    { name: 'pocket.json', data: JSON.stringify(record, null, 1) },
  );
  const blob = zip(files);
  const file = new File([blob], `bolsillo-worm-${stamp}.zip`, { type: 'application/zip' });
  return { file, counts, size: blob.size };
}

function readme(r, c) {
  const names = r.worms.map((w) => `${w.name} (${w.worm?.name || 'worm'})`).join(' and ');
  return [
    'Bolsillo Worm · everything from your pocket',
    `Saved ${new Date(r.exported_at).toLocaleString()} by ${r.exported_by || 'you'}.`,
    `Worms: ${names}.`,
    '',
    `${c.moments} things you sent each other, ${c.days} days of Today, ${c.photos} photos, ${c.whispers} voice notes.`,
    '',
    'index.html   open it to read your pocket as a page (any phone or computer)',
    'pocket.json  the complete record, as data',
    'photos/      polaroids',
    'today/       Today photos, one per person per day',
    'whispers/    voice notes',
    '',
    'Sealed letters you haven\'t opened yet stay sealed: only their envelopes are in this file.',
    `Your pocket's code: ${r.pocket.code || '?'} (keep it between you two).`,
    '',
  ].join('\n');
}

// A static page (no scripts, so it opens in the Files preview too): day by day.
function page(r, nameOf, slot) {
  const byDay = new Map();
  const add = (day, html) => { if (!byDay.has(day)) byDay.set(day, []); byDay.get(day).push(html); };
  const img = (src, cls = 'th') => (src ? `<img class="${cls}" src="${esc(src)}" alt="">` : '');
  for (const e of r.events) {
    const p = e.payload || {}, who = esc(e.from), day = e.created_at.slice(0, 10), t = e.created_at.slice(11, 16);
    const link = e.file ? ` <a href="${esc(e.file)}">full size</a>` : '';
    const line = {
      note: () => `<p class="note">${esc(p.text)}</p>`,
      photo: () => `${img(p.thumb)}${p.caption ? `<p>${esc(p.caption)}</p>` : ''}${link}`,
      doodle: () => '<p class="dim">A doodle</p>',
      whisper: () => `<p>A ${Math.round(p.dur || 0)}s whisper.${e.file ? ` <a href="${esc(e.file)}">Listen</a>` : ''}</p>`,
      wiggle: () => `<p>A wiggle${p.label ? `: “${esc(p.label)}”` : ''}</p>`,
      song: () => `${img(p.cover)}<p><b>${esc(p.title || 'A song')}</b>${p.artist ? ` · ${esc(p.artist)}` : ''}${p.line ? `<br>“${esc(p.line)}”` : ''}${p.url ? `<br><a href="${esc(p.url)}">${esc(p.url)}</a>` : ''}</p>`,
      trinket: () => `<p>Something found: ${esc(p.what)}${p.inscription ? ` · “${esc(p.inscription)}”` : ''}</p>`,
      later: () => `<p>${p.mode === 'date' ? `A time capsule for ${esc(p.on)}` : `An envelope: open when ${esc(p.label)}`}</p>`,
      reunion: () => `<p>Set the countdown${p.on ? ` to ${esc(p.on)}` : ''}${p.note ? ` · ${esc(p.note)}` : ''}</p>`,
    }[e.kind];
    if (line) add(day, `<div class="ev"><span class="who">${who} · ${t}</span>${line()}</div>`);
  }
  for (const d of r.today) {
    const me = r.worms.find((w) => w.slot === slot)?.name || 'You', them = r.worms.find((w) => w.slot !== slot)?.name || 'Them';
    const ans = (n, a) => (a ? `<p><span class="who">${esc(n)}</span> ${esc(a)}</p>` : '');
    add(d.day, `<div class="ev today"><span class="who">Today's question</span><p><b>${esc(d.question || '')}</b></p>${ans(me, d.my_answer)}${ans(them, d.their_answer)}${img(d.my_thumb)}${img(d.their_thumb)}</div>`);
  }
  const days = [...byDay.keys()].sort().reverse();
  const title = r.worms.map((w) => esc(w.name)).join(' & ');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bolsillo Worm · ${title}</title>
<style>body{font:16px/1.45 -apple-system,system-ui,sans-serif;margin:0;padding:28px 20px 60px;max-width:640px;margin:auto;color:#111;background:#fff}h1{font-size:34px;letter-spacing:-.03em;margin:0 0 4px}.sub{color:#666;margin:0 0 28px}h2{font:600 12px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#0F7A4E;margin:34px 0 10px}.ev{padding:12px 0;border-top:1px solid #eee}.who{display:block;font:500 11px/1.4 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:#666}.note{white-space:pre-wrap;font-size:18px}.th{width:110px;height:110px;object-fit:cover;border-radius:14px;margin:6px 8px 0 0}.dim{color:#888}a{color:#1546A8}p{margin:6px 0}</style></head>
<body><h1>${title}</h1><p class="sub">Bolsillo Worm · saved ${esc(new Date(r.exported_at).toDateString())}</p>
${days.map((day) => `<h2>${esc(new Date(day + 'T12:00:00').toDateString())}</h2>${byDay.get(day).join('')}`).join('\n')}
</body></html>`;
}

// ── the sheet: get it ready, then hand it to the share sheet (needs a fresh tap)
export function backupSheet(app) {
  let built = null;
  const status = h('p.small.backup-status', lastBackup() ? `Last saved ${new Date(lastBackup()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.` : 'Never saved yet.');
  const go = btn('Get it ready', async () => {
    go.disabled = true; go.classList.add('busy');
    try {
      built = await buildBackup(app, (msg) => { status.textContent = msg; });
      const c = built.counts, mb = (built.size / 1048576).toFixed(built.size > 10485760 ? 0 : 1);
      status.textContent = `${c.moments} things you sent, ${c.days} days of Today, ${c.photos} photos, ${c.whispers} voice notes · ${mb} MB.${c.missing ? ` ${c.missing} couldn't be fetched.` : ''}`;
      go.hidden = true; saveBtn.hidden = false;
    } catch (err) {
      status.textContent = `Couldn't gather everything: ${String(err?.message || err).slice(0, 80)}. Try again.`;
      go.disabled = false; go.classList.remove('busy');
    }
  }, 'primary');
  const saveBtn = btn('Save the file', async () => {
    if (!built) return;
    const { file } = built;
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: file.name });
      else { const a = h('a', { href: URL.createObjectURL(file), download: file.name }); document.body.append(a); a.click(); a.remove(); }
      store('lastBackup', new Date().toISOString());
      status.textContent = 'Saved. See you next month.';
      toast('Saved. Keep it in Files or iCloud Drive.');
      app.backupChanged?.();
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Couldn\'t hand it over. Try again.');
    }
  }, 'primary');
  saveBtn.hidden = true;
  sheet('Save everything', [
    h('p.lede', 'One file with every note, answer, photo, song and voice note from your pocket, plus a page you can open anywhere. Save it to Files or iCloud Drive, once a month.'),
    status, go, saveBtn,
    h('p.small.muted', 'Sealed letters you haven\'t opened stay sealed: only their envelopes are saved.'),
  ]);
}
