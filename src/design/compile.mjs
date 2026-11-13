// Turns deck.txt + photos.txt into the JSON the app loads (docs/design/deck.json).
// Run by build.mjs; `node src/design/compile.mjs` prints a summary and checks the files.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = new URL('.', import.meta.url);
const KINDS = ['chair', 'lamp', 'furniture', 'house', 'building'];

// Wikimedia keeps files at /<md5[0]>/<md5[0..1]>/<Name>, names with underscores
export const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function imageUrl(file, where) {
  const name = file.replace(/ /g, '_');
  const md5 = createHash('md5').update(name, 'utf8').digest('hex');
  const wiki = where[0] === 'e' ? 'en' : 'commons';
  const path = `${md5[0]}/${md5.slice(0, 2)}/${enc(name)}`;
  if (where[1] === 'o') return `https://upload.wikimedia.org/wikipedia/${wiki}/${path}`;
  return `https://upload.wikimedia.org/wikipedia/${wiki}/thumb/${path}/960px-${enc(name)}${/\.svg$/i.test(name) ? '.png' : ''}`;
}
export const pageUrl = (file, where) => `https://${where[0] === 'e' ? 'en.wikipedia.org' : 'commons.wikimedia.org'}/wiki/File:${enc(file.replace(/ /g, '_'))}`;

const rows = (name) => readFileSync(new URL(name, here), 'utf8').split('\n');

export function compileDeck() {
  const photos = new Map();
  for (const l of rows('photos.txt')) {
    if (!l.trim() || l.startsWith('#')) continue;
    const [id, file, w, h, where, by, lic] = l.split('|');
    photos.set(id, { file, w: +w, h: +h, where, by, lic });
  }
  // Better photos linked from other sites (links.txt). The Wikimedia one stays as the fallback.
  const links = new Map();
  for (const l of rows('links.txt')) {
    if (!l.trim() || l.startsWith('#')) continue;
    const [id, url, w, h, credit, page] = l.split('|');
    if (!/^https:\/\//.test(url) || !(+w > 0) || !(+h > 0)) throw new Error(`links.txt: bad line for ${id}`);
    links.set(id, { url, w: +w, h: +h, credit, page });
  }
  // Manu (Nov 13): nothing older than the Florence Cathedral dome (1436); the deck is about more
  // modern things. Older cards stay in deck.json marked retired so the shuffle, and every day already
  // dealt, stays the same; the app never deals, shows or counts them again (design.js dealtDay).
  const OLDEST = 1436;
  const editions = [];
  const ids = new Set();
  for (const l of rows('deck.txt')) {
    if (/^## edition/.test(l)) { editions.push([]); continue; }
    if (!l.trim() || l.startsWith('#')) continue;
    const f = l.split('|');
    if (f.length !== 12) throw new Error(`deck.txt: ${f.length} fields in "${l.slice(0, 50)}"`);
    const [id, name, by, year, country, at, kind, style, materials, tags, , note] = f;
    if (ids.has(id)) throw new Error(`deck.txt: ${id} twice`);
    ids.add(id);
    if (!KINDS.includes(kind)) throw new Error(`deck.txt: ${id} kind ${kind}`);
    if (!/^[og][cn][me]$/.test(tags)) throw new Error(`deck.txt: ${id} tags ${tags}`);
    const p = photos.get(id);
    if (!p) throw new Error(`photos.txt: no photo for ${id}`);
    if (!editions.length) editions.push([]);
    editions[editions.length - 1].push({
      id, name, by,
      year: +year.replace('~', ''), circa: year.startsWith('~') || undefined,
      country, at: at || undefined, kind, style,
      materials: materials.split(',').map((s) => s.trim()).filter(Boolean),
      form: tags[0] === 'o' ? 'organic' : 'geometric',
      palette: tags[1] === 'c' ? 'color' : 'neutral',
      feel: tags[2] === 'm' ? 'minimal' : 'expressive',
      note,
      retired: +year.replace('~', '') < OLDEST || undefined,
      ...(links.has(id) ? {
        img: links.get(id).url, w: links.get(id).w, h: links.get(id).h,
        credit: links.get(id).credit, source: links.get(id).page,
        fallback: imageUrl(p.file, p.where),
      } : {
        img: imageUrl(p.file, p.where), w: p.w, h: p.h,
        credit: [p.by, p.lic].filter(Boolean).join(' · '),
        source: pageUrl(p.file, p.where),
      }),
    });
  }
  for (const id of links.keys()) if (!ids.has(id)) throw new Error(`links.txt: no card ${id}`);
  return { v: 1, editions };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = compileDeck();
  const all = d.editions.flat();
  const live = all.filter((c) => !c.retired);
  console.log(`${live.length} cards in ${d.editions.length} edition(s) (${all.length - live.length} retired), ${Math.ceil(live.length / 5)} days`);
  if (process.argv[2] === 'urls') console.log(all.map((c) => `${c.id} ${c.img}`).join('\n'));
}
