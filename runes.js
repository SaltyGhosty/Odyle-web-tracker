// The energy ring geometry: 56 positions around each orb, one per 1/56 of the cap (15 OD premium, 10 OD normal).
// Shared by the star orb (starorb.js) and anything that needs the ring geometry.
import { MAX } from './energy.js';

export const RUNE_COUNT = 56;

export function litRunes(energy, max = MAX) {
  const e = Number(energy);
  if (!Number.isFinite(e) || !(max > 0)) return 0;
  return Math.max(0, Math.min(RUNE_COUNT, Math.floor(e / max * RUNE_COUNT)));
}

// Position of rune i on a circle of radius r around (c, c): 0 at the top, clockwise.
export function runePoint(i, r, c) {
  const angle = -Math.PI / 2 + i * (2 * Math.PI / RUNE_COUNT);
  return { x: c + Math.cos(angle) * r, y: c + Math.sin(angle) * r, angle };
}
