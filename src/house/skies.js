// The app's sky palettes (same as src/draw.js skyFor), so the house sits in the pocket's sky.
export const SKY = { top: '#6FBEFF', mid: '#B7E0FF', bottom: '#EEF6FF' };
const SKIES = {
  goldDusk: { top: '#80A8EA', mid: '#F3C2B1', bottom: '#FFE3C2' },
  goldDawn: { top: '#8AB3F0', mid: '#F5C8D6', bottom: '#FFEEDF' },
  twiDusk: { top: '#33458E', mid: '#7D70B3', bottom: '#E9A28D' },
  twiDawn: { top: '#3C4F97', mid: '#8C7EBE', bottom: '#F1B2B4' },
  night: { top: '#0A1331', mid: '#15275C', bottom: '#2A4584' },
};
const mixHex = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
};
const mix = (a, b, t) => ({ top: mixHex(a.top, b.top, t), mid: mixHex(a.mid, b.mid, t), bottom: mixHex(a.bottom, b.bottom, t) });

export function skyForAlt(alt, am) {
  const gold = am ? SKIES.goldDawn : SKIES.goldDusk, twi = am ? SKIES.twiDawn : SKIES.twiDusk;
  let pal;
  if (alt >= 8) pal = SKY;
  else if (alt >= 1) pal = mix(gold, SKY, (alt - 1) / 7);
  else if (alt >= -5) pal = mix(twi, gold, (alt + 5) / 6);
  else if (alt >= -12) pal = mix(SKIES.night, twi, (alt + 12) / 7);
  else pal = SKIES.night;
  return { ...pal, night: Math.max(0, Math.min(1, (-alt - 3) / 7)), alt };
}
