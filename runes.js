// The energy rune ring: 56 original runes around each orb, one per +15 OD (840 = 56 x 15).
// Shared by the star orb (starorb.js) and anything that needs the ring geometry.
import { MAX, REGEN } from './energy.js';

export const RUNE_COUNT = MAX / REGEN; // 56

export function litRunes(energy) {
  const e = Number(energy);
  if (!Number.isFinite(e)) return 0;
  return Math.max(0, Math.min(RUNE_COUNT, Math.floor(e / REGEN)));
}

// 12 glyphs drawn for Odyle (not taken from the game): strokes [x1, y1, x2, y2] on a 64x64 grid.
export const RUNE_STROKES = [
  [[32, 10, 32, 54], [32, 20, 46, 30]], [[24, 10, 24, 54], [24, 14, 42, 26], [24, 30, 42, 42]], [[32, 10, 32, 54], [18, 24, 46, 24]],
  [[20, 54, 32, 10], [32, 10, 44, 54], [24, 38, 40, 38]], [[22, 10, 22, 54], [22, 32, 42, 14], [22, 32, 42, 54]], [[32, 10, 32, 54], [18, 18, 46, 46]],
  [[18, 32, 32, 12], [32, 12, 46, 32], [46, 32, 32, 52], [32, 52, 18, 32]], [[24, 10, 24, 54], [40, 10, 40, 54], [24, 32, 40, 32]],
  [[32, 10, 32, 54], [20, 20, 32, 32], [44, 20, 32, 32]], [[20, 12, 44, 52], [44, 12, 20, 52]], [[32, 10, 32, 54], [32, 40, 46, 52], [32, 40, 18, 52]],
  [[22, 12, 42, 12], [42, 12, 22, 52], [22, 52, 42, 52]],
];
export const glyphFor = (i) => RUNE_STROKES[i % RUNE_STROKES.length];

// Position of rune i on a circle of radius r around (c, c): 0 at the top, clockwise.
export function runePoint(i, r, c) {
  const angle = -Math.PI / 2 + i * (2 * Math.PI / RUNE_COUNT);
  return { x: c + Math.cos(angle) * r, y: c + Math.sin(angle) * r, angle };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const n2 = (v) => v.toFixed(2);

// SVG ring for the flat orb (no WebGL / reduced motion) and, as dots, for small friend orbs.
export function buildRuneRing(doc, lit, { size = 150, glyphs = true, full = false } = {}) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'rune-ring' + (glyphs ? '' : ' dots') + (full ? ' full' : ''));
  svg.setAttribute('aria-hidden', 'true');
  const c = size / 2, r = size / 2 - (glyphs ? 5 : 2.5);
  const scale = 6 / 64; // each glyph fits a 6-unit box
  for (let i = 0; i < RUNE_COUNT; i++) {
    const p = runePoint(i, r, c);
    let node;
    if (glyphs) {
      node = doc.createElementNS(SVG_NS, 'path');
      node.setAttribute('d', glyphFor(i).map(([x1, y1, x2, y2]) =>
        `M${n2(p.x + (x1 - 32) * scale)} ${n2(p.y + (y1 - 32) * scale)}L${n2(p.x + (x2 - 32) * scale)} ${n2(p.y + (y2 - 32) * scale)}`).join(''));
    } else {
      node = doc.createElementNS(SVG_NS, 'circle');
      node.setAttribute('cx', n2(p.x)); node.setAttribute('cy', n2(p.y)); node.setAttribute('r', '1.1');
    }
    node.setAttribute('class', i < lit ? 'rune on' : 'rune');
    svg.append(node);
  }
  return svg;
}
