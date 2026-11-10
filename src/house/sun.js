// Where the sun is over Tokyo at a given moment (after suncalc, V. Agafonkin).
const rad = Math.PI / 180, e = rad * 23.4397;
const toDays = (date) => date.valueOf() / 86400000 - 0.5 + 2440588 - 2451545;

export const TOKYO = { lat: 35.684, lon: 139.711 };

export function sunAt(date, { lat, lon } = TOKYO) {
  const lw = rad * -lon, phi = rad * lat, d = toDays(date);
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const H = rad * (280.16 + 360.9856235 * d) - lw - ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { alt, az: azS + Math.PI }; // az: from north, clockwise
}

// Tokyo is UTC+9 all year.
export function tokyoDate(hours, base = new Date()) {
  const t = new Date(base.valueOf() + 9 * 3600e3);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) + (hours - 9) * 3600e3);
}
export function tokyoHours(now = new Date()) {
  const t = new Date(now.valueOf() + 9 * 3600e3);
  return t.getUTCHours() + t.getUTCMinutes() / 60;
}
