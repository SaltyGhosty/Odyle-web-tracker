import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, NEUTRAL_COLOR, classById, liquidColors } from './classes.js';

test('8 clases en orden', () => {
  assert.deepEqual(CLASSES.map(c => c.id),
    ['asesino', 'gladiador', 'templario', 'arquero', 'hechicero', 'espiritista', 'clerigo', 'cantor']);
});
test('classById encuentra por id', () => {
  assert.equal(classById('clerigo').name, 'Clérigo');
  assert.equal(classById('asesino').color, '#b79cff');
});
test('classById desconocida es null', () => {
  assert.equal(classById('x'), null);
  assert.equal(classById(undefined), null);
});
test('cada clase tiene icono y color', () => {
  for (const c of CLASSES) { assert.ok(c.icon.length > 10, c.id); assert.match(c.color, /^#[0-9a-f]{6}$/); }
  assert.equal(NEUTRAL_COLOR, '#e8b85a');
});

const lum = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
test('liquidColors: cada clase da dos hex, arriba más claro que el fondo', () => {
  for (const glass of ['#18203A', ' #0D0A19']) {
    for (const c of CLASSES) {
      const l = liquidColors(c.id, glass);
      assert.match(l.top, /^#[0-9a-f]{6}$/, c.id);
      assert.match(l.deep, /^#[0-9a-f]{6}$/, c.id);
      assert.ok(lum(l.top) > lum(l.deep), `${c.id} ${glass}`);
    }
  }
  assert.equal(liquidColors('gladiador', '#000000').top, '#e9b380');
});
test('liquidColors sin clase o desconocida es null', () => {
  assert.equal(liquidColors(undefined, '#18203A'), null);
  assert.equal(liquidColors('', '#18203A'), null);
  assert.equal(liquidColors('x', '#18203A'), null);
});
