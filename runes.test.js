// runes.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNE_COUNT, litRunes, runePoint, RUNE_GLYPHS, runeGlyph } from './runes.js';

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
test('la runa 0 esta arriba y la 14 a la derecha (sentido horario)', () => {
  const top = runePoint(0, 10, 50);
  assert.ok(Math.abs(top.x - 50) < 1e-9 && Math.abs(top.y - 40) < 1e-9);
  const right = runePoint(14, 10, 50);
  assert.ok(Math.abs(right.x - 60) < 1e-9 && Math.abs(right.y - 50) < 1e-9);
});

test('runas: cada una vale tope/56 (10 OD en normal, 15 en premium)', () => {
  assert.equal(litRunes(15, 560), 1);
  assert.equal(litRunes(30, 560), 3);
  assert.equal(litRunes(559, 560), 55);
  assert.equal(litRunes(560, 560), 56);
  assert.equal(litRunes(700, 560), 56);
  assert.equal(litRunes(9999, 560), 56);
  assert.equal(litRunes(-1, 560), 0);
  assert.equal(litRunes(30, 840), 2);
});

test('alfabeto de Atreia: 28 runas con nombre y trazo únicos', () => {
  assert.equal(RUNE_GLYPHS.length, 28);
  assert.equal(new Set(RUNE_GLYPHS.map(g => g.name)).size, 28);
  assert.equal(new Set(RUNE_GLYPHS.map(g => g.d)).size, 28);
  assert.equal(runeGlyph(30), RUNE_GLYPHS[2]);
});
test('reglas de dibujo: rejilla 10×14, ≤ 4 trazos, solo M/L y como mucho un arco', () => {
  for (const { name, d } of RUNE_GLYPHS) {
    assert.match(d, /^[MLAQ0-9 .,-]+$/, name);
    assert.ok((d.match(/M/g) || []).length <= 4, `${name}: más de 4 trazos`);
    assert.ok((d.match(/[AQ]/g) || []).length <= 1, `${name}: más de un arco`);
    // Every coordinate pair, per command: M/L/Q take pairs (Q's control point too), A only its endpoint (last two numbers).
    const nums = [...d.matchAll(/([MLAQ])([^MLAQ]*)/g)].flatMap(([, cmd, args]) => {
      const n = args.trim().split(/[ ,]+/).map(Number);
      return cmd === 'A' ? n.slice(-2) : n;
    });
    assert.ok(nums.length % 2 === 0 && nums.every(Number.isFinite), `${name}: coordenadas mal formadas`);
    for (let i = 0; i < nums.length; i += 2) {
      assert.ok(nums[i] >= 0 && nums[i] <= 10 && nums[i + 1] >= 0 && nums[i + 1] <= 14, `${name}: fuera de la rejilla`);
    }
  }
});
