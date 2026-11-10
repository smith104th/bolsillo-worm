// Songs: read a Spotify, Apple Music or YouTube link (or a whole share text with
// a link in it), get its title, artist and cover, and build the player embed.
// All three answer browsers directly (CORS), so this runs on the phone.

export const PROVIDERS = {
  spotify: { name: 'Spotify', accent: '#1DB954' },
  apple: { name: 'Apple Music', accent: '#FA2D48' },
  youtube: { name: 'YouTube', accent: '#FF0033' },
};

const firstUrl = (text) => (String(text || '').match(/https?:\/\/[^\s<>"']+/) || [null])[0];

// What we can tell from the link alone, before asking anyone.
export function parseSong(text) {
  const url = firstUrl(text);
  if (!url) return null;
  let m;
  if ((m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/i))) {
    const [, type, id] = m;
    return { provider: 'spotify', type, id, url: `https://open.spotify.com/${type}/${id}`, embed: `https://open.spotify.com/embed/${type}/${id}` };
  }
  if (/spotify\.link\/|spotify\.app\.link\//i.test(url)) return { provider: 'spotify', type: null, id: null, url, embed: null, short: true };
  if ((m = url.match(/music\.apple\.com\/([a-z]{2})\/(album|song|playlist|music-video|station)\/([^/?#]*)\/?([^/?#]*)/i))) {
    let [, cc, type, slug, id] = m;
    if (!id) { id = slug; slug = ''; }
    const i = (url.match(/[?&]i=(\d+)/) || [])[1] || null;
    const path = `${cc}/${type}/${slug ? slug + '/' : ''}${id}${i ? `?i=${i}` : ''}`;
    return { provider: 'apple', type: i || type === 'song' ? 'song' : type, id: i || id, cc, slug, url: `https://music.apple.com/${path}`, embed: `https://embed.music.apple.com/${path}` };
  }
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i))) {
    const id = m[1];
    return { provider: 'youtube', type: 'video', id, url: `https://www.youtube.com/watch?v=${id}`, embed: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0` };
  }
  return null;
}

const getJSON = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`http_${r.status}`); return r.json(); };
const titleCase = (slug) => decodeURIComponent(slug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// A small square JPEG of the cover, kept in the payload like a photo thumb
// (so the pocket, shelf and printed zine can draw it without asking again).
export async function coverThumb(src, size = 240) {
  if (!src) return null;
  try {
    const blob = await (await fetch(src)).blob();
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = c.height = size;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    URL.revokeObjectURL(url);
    return c.toDataURL('image/jpeg', 0.82);
  } catch { return null; }
}

// Everything the song needs to travel: { provider, type, url, embed, title, artist, cover }.
export async function songInfo(text) {
  let s = parseSong(text);
  if (!s) throw new Error('not_a_song');
  let title = null, artist = null, art = null;
  if (s.provider === 'spotify') {
    const o = await getJSON(`https://open.spotify.com/oembed?url=${encodeURIComponent(s.url)}`);
    if (s.short || !s.embed) {
      const m = String(o.iframe_url || '').match(/embed\/(\w+)\/([A-Za-z0-9]+)/);
      if (!m) throw new Error('not_a_song');
      s = { ...s, type: m[1], id: m[2], url: `https://open.spotify.com/${m[1]}/${m[2]}`, embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}` };
    }
    title = o.title || null; art = o.thumbnail_url || null;
  } else if (s.provider === 'apple') {
    try {
      const o = await getJSON(`https://itunes.apple.com/lookup?id=${encodeURIComponent(s.id)}&country=${s.cc}`);
      const r = o.results?.[0];
      if (r) { title = r.trackName || r.collectionName || null; artist = r.artistName || null; art = r.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/300x300bb.') || null; }
    } catch { /* playlists and stations aren't in the lookup; the link still plays */ }
    if (!title && s.slug) title = titleCase(s.slug);
  } else if (s.provider === 'youtube') {
    const o = await getJSON(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(s.url)}`);
    title = o.title || null; artist = (o.author_name || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim() || null;
    art = `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg`;
    // "Artist - Song (Official Video)" → song title, artist from the title
    const m = title?.match(/^(.+?)\s+[-–—]\s+(.+?)(?:\s*[([](?:official|video|audio|lyric|visualizer|en vivo|live)[^)\]]*[)\]])*\s*$/i);
    if (m) { artist = m[1].trim(); title = m[2].trim(); }
  }
  const cover = await coverThumb(art);
  return { provider: s.provider, type: s.type, url: s.url, embed: s.embed, title, artist, cover };
}

// Player height for the embed, by what it is.
export function embedHeight(p) {
  if (p.provider === 'spotify') return ['track', 'episode'].includes(p.type) ? 152 : 352;
  if (p.provider === 'apple') return p.type === 'song' ? 175 : 450;
  return null; // YouTube: 16:9 by CSS
}
