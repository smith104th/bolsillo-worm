// Medellín (Manu, Nov 26): Vio lands in Medellín. From noon (Bogotá = EST) both worms live in
// the same pocket and both headers say Medellín, until the visit ends. Two things stay on after
// the visit: the Colombian foods and the sombrero vueltiao. To go back to the old foods, set
// FOOD_SET to 'classic'. To move the dates, change VISIT. `?together` forces it all on in the
// demo, `?apart` forces it off.
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

export const VISIT = {
  from: Date.parse('2026-11-26T12:00:00-05:00'),
  to: Date.parse('2026-11-30T00:00:00-05:00'),
  place: { city: 'Medellín', country: 'Colombia', lat: 6.2442, lon: -75.5812, tz: 'America/Bogota' },
};
export const FOOD_SET = 'colombia'; // 'classic' = medialunas, alfajores and co. (archived in draw.js)

const forced = params.has('together') ? true : params.has('apart') ? false : null;
// on from noon on Nov 26, and stays on (foods, vueltiao)
export const colombiaOn = (now = Date.now()) => forced ?? now >= VISIT.from;
// the visit itself: same pocket, Medellín on both phones
export const together = (now = Date.now()) => forced ?? (now >= VISIT.from && now < VISIT.to);

// What a worm wears: during the visit both put on the vueltiao, unless their person picked
// something else after it started (`accAt`, set by the worm editor).
export function wornAcc(design = {}) {
  if (!together() || design.acc === 'vueltiao') return design.acc;
  if ((design.accAt || 0) >= VISIT.from && !forced) return design.acc;
  return 'vueltiao';
}

// Their member row as the pocket sees it: in Medellín during the visit.
export const seen = (m) => (m && together() ? { ...m, place: { ...(m.place || {}), ...VISIT.place } } : m);
