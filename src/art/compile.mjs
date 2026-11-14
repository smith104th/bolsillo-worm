// Turns the Art Tinder files (deck.txt, photos.txt, links.txt) into docs/art/deck.json.
// Run by build.mjs; `node src/art/compile.mjs` prints a summary and checks the files.
// Same shape as the design deck (src/design/compile.mjs), so design.js deals and shows both.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { enc, pageUrl } from '../design/compile.mjs';

const here = new URL('.', import.meta.url);
const KINDS = ['painting', 'sculpture', 'installation', 'paper'];
const WIDTH = 1280; // paintings are looked at closely: a bigger thumbnail than the design deck's 960

// Wikimedia keeps files at /<md5[0]>/<md5[0..1]>/<Name>; smaller files are used whole
function imageUrl(file, where, w) {
  const name = file.replace(/ /g, '_');
  const md5 = createHash('md5').update(name, 'utf8').digest('hex');
  const wiki = where[0] === 'e' ? 'en' : 'commons';
  const path = `${md5[0]}/${md5.slice(0, 2)}/${enc(name)}`;
  if (w <= WIDTH) return `https://upload.wikimedia.org/wikipedia/${wiki}/${path}`;
  return `https://upload.wikimedia.org/wikipedia/${wiki}/thumb/${path}/${WIDTH}px-${enc(name)}${/\.(tiff?|svg)$/i.test(name) ? '.jpg' : ''}`;
}

const rows = (name) => readFileSync(new URL(name, here), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));

export function compileArt() {
  const photos = new Map();
  for (const l of rows('photos.txt')) {
    const [id, file, w, h, where, by, lic] = l.split('|');
    if (!(+w > 0) || !(+h > 0)) throw new Error(`art photos.txt: bad size for ${id}`);
    photos.set(id, { file, w: +w, h: +h, where, by, lic });
  }
  // Photos linked from museums and elsewhere (Manu: keep linking). A Wikimedia one, if there is one,
  // stays as the fallback; most modern works have none (they're still under copyright).
  const links = new Map();
  for (const l of rows('links.txt')) {
    const [id, url, w, h, credit, page] = l.split('|');
    if (!/^https:\/\//.test(url) || /\s/.test(url) || !(+w > 0) || !(+h > 0)) throw new Error(`art links.txt: bad line for ${id}`);
    links.set(id, { url, w: +w, h: +h, credit, page });
  }
  const editions = [];
  const ids = new Set();
  for (const l of readFileSync(new URL('deck.txt', here), 'utf8').split('\n')) {
    if (/^## edition/.test(l)) { editions.push([]); continue; }
    if (!l.trim() || l.startsWith('#')) continue;
    const f = l.split('|');
    if (f.length !== 12) throw new Error(`art deck.txt: ${f.length} fields in "${l.slice(0, 50)}"`);
    const [id, name, by, year, country, at, kind, style, medium, tags, , note] = f;
    if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error(`art deck.txt: bad id ${id}`);
    if (ids.has(id)) throw new Error(`art deck.txt: ${id} twice`);
    ids.add(id);
    if (!KINDS.includes(kind)) throw new Error(`art deck.txt: ${id} kind ${kind}`);
    if (!/^[fa][cn][me]$/.test(tags)) throw new Error(`art deck.txt: ${id} tags ${tags}`);
    if (/—/.test(l)) throw new Error(`art deck.txt: ${id} has an em dash`);
    const p = photos.get(id), k = links.get(id);
    if (!p && !k) throw new Error(`art: no photo for ${id}`);
    if (!editions.length) editions.push([]);
    const wiki = p && { img: imageUrl(p.file, p.where, p.w), w: p.w, h: p.h, credit: [p.by, p.lic].filter(Boolean).join(' · '), source: pageUrl(p.file, p.where) };
    editions[editions.length - 1].push({
      id, name, by,
      year: +year.replace('~', ''), circa: year.startsWith('~') || undefined,
      country, at: at || undefined, kind, style,
      materials: medium.split(',').map((s) => s.trim()).filter(Boolean),
      form: tags[0] === 'f' ? 'figurative' : 'abstract',
      palette: tags[1] === 'c' ? 'color' : 'muted',
      feel: tags[2] === 'm' ? 'calm' : 'intense',
      note,
      ...(k ? { img: k.url, w: k.w, h: k.h, credit: k.credit, source: k.page, fallback: wiki?.img } : wiki),
    });
  }
  for (const id of [...links.keys(), ...photos.keys()]) if (!ids.has(id)) throw new Error(`art: photo for a card that isn't in the deck: ${id}`);
  return { v: 1, editions };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = compileArt();
  const all = d.editions.flat();
  const count = (f) => Object.entries(all.reduce((m, c) => ({ ...m, [f(c)]: (m[f(c)] || 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`${all.length} cards in ${d.editions.length} editions: ${count((c) => c.kind)}`);
  console.log(count((c) => (c.year < 1850 ? 'before 1850' : c.year < 1945 ? '1850-1944' : '1945 on')));
  console.log(`${all.filter((c) => !/wikimedia/.test(c.img)).length} linked photos, ${all.filter((c) => !/wikimedia/.test(c.img) && !c.fallback).length} without a Wikimedia fallback`);
  console.log(`days: 10 + ${Math.floor((all.length - 10) / 5)} x 5 = ${1 + Math.floor((all.length - 10) / 5)} days`);
  if (process.argv[2] === 'urls') console.log(all.map((c) => `${c.id} ${c.img}`).join('\n'));
}
