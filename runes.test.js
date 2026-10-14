// runes.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNE_COUNT, litRunes, RUNE_STROKES, glyphFor, runePoint, buildRuneRing } from './runes.js';

test('56 runas: una por cada 15 OD hasta 840', () => {
  assert.equal(RUNE_COUNT, 56);
  assert.equal(litRunes(0), 0);
  assert.equal(litRunes(14), 0);
  assert.equal(litRunes(15), 1);
  assert.equal(litRunes(839), 55);
  assert.equal(litRunes(840), 56);
  assert.equal(litRunes(900), 56);
  assert.equal(litRunes(-30), 0);
  assert.equal(litRunes(NaN), 0);
  assert.equal(litRunes('300'), 20);
});
test('12 glifos propios que se repiten alrededor del anillo', () => {
  assert.equal(RUNE_STROKES.length, 12);
  for (const g of RUNE_STROKES) for (const s of g) { assert.equal(s.length, 4); for (const v of s) assert.ok(v >= 0 && v <= 64); }
  assert.equal(glyphFor(0), RUNE_STROKES[0]);
  assert.equal(glyphFor(13), RUNE_STROKES[1]);
});
test('la runa 0 esta arriba y la 14 a la derecha (sentido horario)', () => {
  const top = runePoint(0, 10, 50);
  assert.ok(Math.abs(top.x - 50) < 1e-9 && Math.abs(top.y - 40) < 1e-9);
  const right = runePoint(14, 10, 50);
  assert.ok(Math.abs(right.x - 60) < 1e-9 && Math.abs(right.y - 50) < 1e-9);
});

function fakeDoc() {
  const make = (tag) => ({ tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = String(v); }, append(...n) { this.children.push(...n); } });
  return { createElementNS: (_ns, tag) => make(tag) };
}
test('buildRuneRing: 56 elementos, los encendidos con la clase on', () => {
  const svg = buildRuneRing(fakeDoc(), 20);
  assert.equal(svg.tag, 'svg');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  assert.equal(svg.children.length, 56);
  assert.equal(svg.children.filter((c) => c.attrs.class === 'rune on').length, 20);
  assert.ok(svg.children.every((c) => c.tag === 'path' && /^M[\d.]+ [\d.]+L/.test(c.attrs.d)));
});
test('buildRuneRing en modo puntos (orbes pequenos) y al tope', () => {
  const svg = buildRuneRing(fakeDoc(), 56, { size: 44, glyphs: false, full: true });
  assert.equal(svg.attrs.class, 'rune-ring dots full');
  assert.ok(svg.children.every((c) => c.tag === 'circle' && c.attrs.class === 'rune on'));
});
