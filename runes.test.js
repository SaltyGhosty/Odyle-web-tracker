// runes.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNE_COUNT, litRunes, runePoint } from './runes.js';

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
