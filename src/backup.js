// "Save everything": one .zip with every note, answer, photo, song and voice note
// in the pocket, plus the games (Design Tinder swipes, the house and its questions, Five Letters),
// so a server failure can't erase your history.
//   pocket.json   everything, as data (the full record)
//   index.html    a page you can open anywhere, no app needed
//   photos/ today/ whispers/   the full-size media
//   README.txt    what's inside
// Built on the phone (no server change), handed to the share sheet so it lands
// in Files or iCloud Drive. Sealed letters you haven't opened stay sealed: only
// their envelopes are in the file. Their answers to cards and house questions you
// haven't reached yet stay hidden too, same as in the app.
import { h, store } from './util.js';
import { sheet, btn, toast } from './ui.js';
import { loadDeck, LEVEL } from './design.js';
import { TOTAL as HOUSE_PIECES } from './housepage.js';
import { score as letterScore } from './letters.js';

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

// The games: what's on the server, as readable as the app shows it. Each part is optional,
// so a pocket that never opened a game (or an older server) still saves everything else.
async function gatherGames(backend) {
  const out = { design: null, house: null, letters: null };
  try {
    const ds = await backend.dsState();
    let byId = new Map();
    if (ds?.mine?.length) try { byId = new Map((await loadDeck()).editions.flat().map((c) => [c.id, c])); } catch { /* offline: card ids only */ }
    const theirs = new Map((ds?.theirs || []).map((t) => [t.item, t.score]));
    out.design = ds && {
      started: ds.started,
      scale: LEVEL,
      cards: (ds.mine || []).map((s) => {
        const c = byId.get(s.item), them = theirs.has(s.item) ? theirs.get(s.item) : null;
        return {
          item: s.item, day: s.day, name: c?.name ?? null, by: c?.by ?? null, year: c?.year ?? null, kind: c?.kind ?? null, at: c?.at ?? null,
          you: s.score, them, match: them != null && s.score > 0 && them > 0, photo: c?.source ?? null,
        };
      }),
      waiting_for_you: ds.pending?.length || 0,
    };
  } catch { /* no deck yet */ }
  try {
    const hq = await backend.hqState();
    const opt = (q, i) => (i == null ? null : q.options?.[i] ?? null);
    out.house = hq && {
      pieces: Math.min(HOUSE_PIECES, 1 + (hq.pieces || 0)), of: HOUSE_PIECES,
      you_asked: (hq.mine || []).map((q) => ({ question: q.question, kind: q.kind, options: q.options, answer: opt(q, q.answer), they_picked: opt(q, q.picked), right: q.correct ?? null, asked_at: q.created_at, answered_at: q.answered_at ?? null })),
      they_asked: (hq.theirs || []).map((q) => ({ question: q.question, kind: q.kind, options: q.options, answer: opt(q, q.answer), you_picked: opt(q, q.picked), right: q.correct ?? null, answered_at: q.answered_at })),
      waiting_for_you: hq.waiting || 0,
    };
  } catch { /* no house yet */ }
  try {
    const fl = await backend.flState();
    const today = String(fl.today).slice(0, 10);
    const game = (g) => g && { guesses: g.guesses ?? null, tries: g.n, solved: g.solved, done: g.done };
    const days = [{ day: fl.today, word: fl.word, nyt: fl.nyt, mine: fl.mine, theirs: fl.theirs }, ...(fl.days || [])]
      .filter((d) => d.word && (d.mine || d.theirs))
      .map((d) => {
        const day = String(d.day).slice(0, 10);
        // today's word stays out of the file until you've played it
        const word = day === today && !d.mine?.done ? null : d.word;
        return { day, word, from_nyt_wordle_of: d.nyt ? String(d.nyt).slice(0, 10) : null, you: game(d.mine), them: game(d.theirs) };
      });
    out.letters = days.length ? { days } : null;
  } catch { /* never played */ }
  return out;
}

export async function buildBackup(app, onProgress = () => {}) {
  const { backend, S } = app;
  const me = app.me(), them = app.them(), slot = app.slot();
  const nameOf = (s) => (s === slot ? me?.name : them?.name) || (s === slot ? 'You' : 'Them');
  onProgress('Gathering everything you two shared…');
  const events = (await backend.allEvents()).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  let dailies = []; try { dailies = await backend.dailies(100000); } catch { /* none yet */ }
  let planted = []; try { planted = await backend.planted(); } catch { /* none */ }
  dailies = dailies.map((d) => ({ ...d, question: app.questionFor?.(d.day)?.q || null })).sort((a, b) => (a.day < b.day ? -1 : 1));
  const games = await gatherGames(backend);

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
    app: 'Bolsillo Worm', format: 2, exported_at: exportedAt, exported_by: me?.name || null,
    pocket: { code: hole.code, created_at: hole.created_at, reunion_on: hole.reunion_on, reunion_note: hole.reunion_note, tunnel_km: hole.tunnel_km, dug_km: hole.dug_km, tunnels_done: hole.tunnels_done, touches: hole.touches },
    worms: S.members.map(({ slot: s, name, worm, place, love, created_at }) => ({ slot: s, name, worm, place, love, created_at, you: s === slot })),
    events: events.map((e) => ({ ...e, from: nameOf(e.from_slot) })),
    today: dailies,
    planted,
    design: games.design,
    house: games.house,
    letters: games.letters,
    notes: 'Sealed letters you haven\'t opened yet stay sealed: only their envelopes are here. So do your person\'s swipes on cards you haven\'t swiped yet, the house questions waiting for you, and their Five Letters guesses on a day you haven\'t finished. Media files are in photos/, today/ and whispers/.',
  };
  const counts = {
    moments: events.filter((e) => ['note', 'doodle', 'photo', 'whisper', 'wiggle', 'song', 'trinket', 'later'].includes(e.kind)).length,
    days: dailies.length, photos: files.filter((f) => !f.name.startsWith('whispers/')).length,
    whispers: files.filter((f) => f.name.startsWith('whispers/')).length, missing,
    cards: games.design?.cards.length || 0,
    questions: (games.house?.you_asked.length || 0) + (games.house?.they_asked.length || 0),
    words: games.letters?.days.filter((d) => d.you?.done).length || 0,
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
    r.design || r.house || r.letters ? `Games: ${c.cards} Design Tinder cards swiped${r.house ? `, the house at ${r.house.pieces} of ${r.house.of} pieces, ${c.questions} house questions` : ''}${c.words ? `, ${c.words} days of Five Letters` : ''}.` : null,
    '',
    'index.html   open it to read your pocket as a page (any phone or computer)',
    'pocket.json  the complete record, as data',
    'photos/      polaroids',
    'today/       Today photos, one per person per day',
    'whispers/    voice notes',
    '',
    'The games are at the end of index.html, and under "design", "house" and "letters" in pocket.json.',
    '',
    'Sealed letters you haven\'t opened yet stay sealed: only their envelopes are in this file.',
    `Your pocket's code: ${r.pocket.code || '?'} (keep it between you two).`,
    '',
  ].filter((l) => l !== null).join('\n');
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
  const games = gamesHtml(r, slot);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bolsillo Worm · ${title}</title>
<style>body{font:16px/1.45 -apple-system,system-ui,sans-serif;margin:0;padding:28px 20px 60px;max-width:640px;margin:auto;color:#111;background:#fff}h1{font-size:34px;letter-spacing:-.03em;margin:0 0 4px}.sub{color:#666;margin:0 0 28px}h2{font:600 12px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#0F7A4E;margin:34px 0 10px}h1.sec{font-size:28px;margin:56px 0 0;padding-top:28px;border-top:2px solid #111}h3{font-size:17px;margin:26px 0 6px}.ok{color:#1546A8}.miss{color:#D90042}.ev{padding:12px 0;border-top:1px solid #eee}.who{display:block;font:500 11px/1.4 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:#666}.note{white-space:pre-wrap;font-size:18px}.th{width:110px;height:110px;object-fit:cover;border-radius:14px;margin:6px 8px 0 0}.dim{color:#888}a{color:#1546A8}p{margin:6px 0}.fl{display:inline-block;vertical-align:top;margin:6px 22px 0 0}.fl .who{margin-bottom:4px}.t{display:inline-block;width:22px;height:22px;margin:0 2px 2px 0;font:700 12px/22px -apple-system,system-ui,sans-serif;text-align:center;text-transform:uppercase}.t0{background:#787C7E;color:#fff}.t1{background:#C9B458;color:#fff}.t2{background:#6AAA64;color:#fff}</style></head>
<body><h1>${title}</h1><p class="sub">Bolsillo Worm · saved ${esc(new Date(r.exported_at).toDateString())}${games ? ' · <a href="#games">The games</a>' : ''}</p>
${days.map((day) => `<h2>${esc(new Date(day + 'T12:00:00').toDateString())}</h2>${byDay.get(day).join('')}`).join('\n')}
${games}
</body></html>`;
}

// The games, after the days: every card you swiped (and their swipe, once you've both
// swiped it), the house, and the questions you asked each other.
function gamesHtml(r, slot) {
  const me = esc(r.worms.find((w) => w.slot === slot)?.name || 'You'), them = esc(r.worms.find((w) => w.slot !== slot)?.name || 'Them');
  const dt = (s) => (s ? esc(new Date(String(s).length === 10 ? `${s}T12:00:00` : s).toDateString()) : '');
  const out = [];
  const d = r.design;
  if (d?.cards.length) {
    const both = d.cards.filter((c) => c.them != null), agree = both.filter((c) => Math.sign(c.you) === Math.sign(c.them)).length;
    const lvl = (v) => esc(d.scale?.[v] ?? v);
    const yr = (y) => (y == null ? '' : y < 0 ? ` · ${-y} BC` : ` · ${y}`);
    out.push(`<h2>Design Tinder</h2><p class="sub">${d.cards.length} cards swiped since ${dt(d.started)}.${both.length ? ` You landed on the same side for ${agree} of the ${both.length} you've both swiped.` : ''}</p>`);
    for (const c of [...d.cards].reverse()) {
      const title = c.name ? `<b>${esc(c.name)}</b>${c.by ? ` · ${esc(c.by)}` : ''}` : `<b>${esc(c.item)}</b>`;
      const theirs = c.them != null ? ` · ${them}: ${lvl(c.them)}` : '';
      out.push(`<div class="ev"><span class="who">${dt(c.day)}${c.kind ? ` · ${esc(c.kind)}` : ''}${yr(c.year)}</span><p>${title}${c.photo ? ` · <a href="${esc(c.photo)}">photo</a>` : ''}</p><p>${me}: ${lvl(c.you)}${theirs}${c.match ? ' · <b class="ok">a match</b>' : ''}</p></div>`);
    }
  }
  const ho = r.house;
  if (ho && (ho.you_asked.length || ho.they_asked.length || ho.pieces > 1)) {
    const res = (who, pick, right) => (pick == null ? `<span class="dim">${who} hasn't answered yet</span>` : `${who} picked “${esc(pick)}” <b class="${right ? 'ok' : 'miss'}">${right ? 'right' : 'wrong'}</b>`);
    out.push(`<h2>Garden &amp; House</h2><p class="sub">The house is at ${ho.pieces} of ${ho.of} pieces. Every right answer adds one.</p>`);
    if (ho.you_asked.length) {
      out.push(`<h3>${me} asked ${them}</h3>`);
      for (const q of ho.you_asked) out.push(`<div class="ev"><span class="who">${dt(q.asked_at)}</span><p><b>${esc(q.question)}</b></p><p>The answer: “${esc(q.answer)}” · ${res(them, q.they_picked, q.right)}</p></div>`);
    }
    if (ho.they_asked.length) {
      out.push(`<h3>${them} asked ${me}</h3>`);
      for (const q of ho.they_asked) out.push(`<div class="ev"><span class="who">${dt(q.answered_at)}</span><p><b>${esc(q.question)}</b></p><p>The answer: “${esc(q.answer)}” · ${res(me, q.you_picked, q.right)}</p></div>`);
    }
  }
  const fl = r.letters;
  if (fl?.days.length) {
    const grid = (who, g, word) => {
      if (!g) return `<div class="fl"><span class="who">${who}</span><span class="dim">Didn't play</span></div>`;
      const head = `${who} · ${g.done ? `${g.solved ? g.tries : 'X'}/6` : 'not finished'}`;
      if (!g.guesses || !word) return `<div class="fl"><span class="who">${head}</span></div>`;
      const rows = g.guesses.map((w) => `<div>${letterScore(w, word).map((sc, i) => `<span class="t t${sc}">${esc(w[i])}</span>`).join('')}</div>`).join('');
      return `<div class="fl"><span class="who">${head}</span>${rows}</div>`;
    };
    out.push(`<h2>Five Letters</h2><p class="sub">${fl.days.length} ${fl.days.length === 1 ? 'day' : 'days'} played. A letter in the right spot is green, a right letter in the wrong spot yellow.</p>`);
    for (const d of fl.days) {
      const src = d.from_nyt_wordle_of ? ` · the NYT Wordle from ${dt(d.from_nyt_wordle_of)}` : '';
      out.push(`<div class="ev"><span class="who">${dt(d.day)}${src}</span><p><b>${d.word ? esc(d.word.toUpperCase()) : 'Today\'s word (you haven\'t played it yet)'}</b></p>${grid(me, d.you, d.word)}${grid(them, d.them, d.word)}</div>`);
    }
  }
  return out.length ? `<h1 class="sec" id="games">The games</h1>\n${out.join('\n')}` : '';
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
      status.textContent = `${c.moments} things you sent, ${c.days} days of Today, ${c.photos} photos, ${c.whispers} voice notes${c.cards ? `, ${c.cards} Design Tinder cards` : ''}${c.questions ? `, ${c.questions} house questions` : ''}${c.words ? `, ${c.words} days of Five Letters` : ''} · ${mb} MB.${c.missing ? ` ${c.missing} couldn't be fetched.` : ''}`;
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
    h('p.lede', 'One file with every note, answer, photo, song and voice note from your pocket, and the games, plus a page you can open anywhere. Save it to Files or iCloud Drive, once a month.'),
    status, go, saveBtn,
    h('p.small.muted', 'Sealed letters you haven\'t opened stay sealed: only their envelopes are saved.'),
  ]);
}
