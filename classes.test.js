import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, NEUTRAL_COLOR, classById } from './classes.js';

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
