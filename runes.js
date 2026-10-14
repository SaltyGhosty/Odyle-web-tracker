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

// Atreia rune alphabet: 28 original glyphs (never official Aion 2 script, NCSOFT art, Latin letters, digits or Elder Futhark).
// Drawing rules, so they read as one family at 7-8 px:
// - 10 × 14 grid (x 0..10, y 0..14, y down); SVG path data with only M, L and at most one A or Q.
// - One main stroke, vertical or diagonal, plus at most 3 more subpaths (M count ≤ 4); no fills.
// - Rendered with one stroke width and square line ends.
// - Atreia vocabulary: wings (short diagonals rising out of the stem, sometimes hooked upward), crescent arcs,
//   chevrons, and crossbars at 1/3 and 2/3 of the height.
export const RUNE_GLYPHS = Object.freeze([
  { name: 'ael', d: 'M5 3.2L5 13 M2 4.5A4 4 0 0 1 8 4.5 M2 9L5 12L8 9' },
  { name: 'dren', d: 'M5 1L5 13 M5 7L8 4L8 2 M2 10L5 10' },
  { name: 'vor', d: 'M3 13L7 1 M6 4L9 4 M1 10L4 10' },
  { name: 'sila', d: 'M5 1L5 13 M3 4L7 4 M2 8.5A4 4 0 0 0 8 8.5' },
  { name: 'tarn', d: 'M5 1L5 13 M5 9A4.5 4.5 0 0 0 8.5 5.5 M2 4L5 4' },
  { name: 'nimo', d: 'M5 1L5 13 M1 5A6 6 0 0 1 9 5 M5 13L8 10' },
  { name: 'oru', d: 'M5 1L5 13 M5 5L2 2 M5 10L8 7' },
  { name: 'ceda', d: 'M5 1L5 13 M1 13A4.5 4.5 0 0 1 9 13 M5 6L2 3' },
  { name: 'lume', d: 'M5 1L5 13 M1.5 3A5 5 0 0 1 1.5 11 M5 11L8 8' },
  { name: 'bran', d: 'M3 13L7 1 M1 4A4 4 0 0 1 1 10' },
  { name: 'zael', d: 'M3 13L7 1 M5 7L8 7L8 10 M1 4L4 4' },
  { name: 'eto', d: 'M5 1L5 13 M5 6L8 3L8 1 M2 13L5 10L8 13' },
  { name: 'mira', d: 'M3 1L7 13 M9 4A4 4 0 0 0 9 10' },
  { name: 'ondo', d: 'M5 1L5 9 M2 10A3 3 0 0 0 8 10 M5 5L8 2' },
  { name: 'fael', d: 'M5 1L5 13 M5 6A4.5 4.5 0 0 0 8.5 2.5 M5 12L2 9L2 7' },
  { name: 'garo', d: 'M3 13L7 1 M5 7L2 4L2 2 M2 11L6 11' },
  { name: 'hela', d: 'M3 13L7 1 M3 6L6 3L9 6 M1 10L4 10' },
  { name: 'iru', d: 'M3 13L7 1 M4 4L8 4 M4 10L1 7L1 5' },
  { name: 'jora', d: 'M3 1L7 13 M2 9.5A4 4 0 0 0 8 9.5' },
  { name: 'cael', d: 'M3 1L7 13 M2 5L6 5 M4 9L8 9' },
  { name: 'lis', d: 'M3 1L7 13 M5 7L8 4L8 2 M1 10L4 10' },
  { name: 'maru', d: 'M3 1L7 13 M2 6L5 3L8 6 M5 10L8 10' },
  { name: 'neva', d: 'M3 1L7 13 M2 3L6 3 M2 9L5 12L8 9' },
  { name: 'osti', d: 'M3 1L7 13 M2 4L6 4 M6 10L3 7L3 5' },
  { name: 'pael', d: 'M5 1L5 13 M1 11A6 6 0 0 1 9 11 M5 5L8 2' },
  { name: 'quen', d: 'M5 1L5 13 M5 6L2 3L2 1 M5 12L8 9L8 7' },
  { name: 'rina', d: 'M5 1L5 13 M2 5L5 5 M5 9L8 9' },
  { name: 'suel', d: 'M5 1L5 13 M1 11A6 6 0 0 1 9 11 M5 6L2 3L2 1' },
]);

export function runeGlyph(i) {
  return RUNE_GLYPHS[((i % RUNE_GLYPHS.length) + RUNE_GLYPHS.length) % RUNE_GLYPHS.length];
}
