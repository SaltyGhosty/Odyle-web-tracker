import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyBudget, stepMote } from './sky.js';

test('skyBudget: movimiento reducido o modo ligero da un fotograma quieto', () => {
  const still = { animate: false, motes: 0, fps: 0, scale: 0.5 };
  assert.deepEqual(skyBudget({ width: 1280, reduceMotion: true, lite: false, hidden: false }), still);
  assert.deepEqual(skyBudget({ width: 390, reduceMotion: false, lite: true, hidden: false }), still);
});
test('skyBudget: pestaña oculta no anima', () => {
  assert.deepEqual(skyBudget({ width: 1280, reduceMotion: false, lite: false, hidden: true }), { animate: false, motes: 40, fps: 30, scale: 0.5 });
  assert.deepEqual(skyBudget({ width: 390, reduceMotion: false, lite: false, hidden: true }), { animate: false, motes: 16, fps: 24, scale: 0.35 });
});
test('skyBudget: móvil', () => {
  assert.deepEqual(skyBudget({ width: 899, reduceMotion: false, lite: false, hidden: false }), { animate: true, motes: 16, fps: 24, scale: 0.35 });
});
test('skyBudget: escritorio', () => {
  assert.deepEqual(skyBudget({ width: 900, reduceMotion: false, lite: false, hidden: false }), { animate: true, motes: 40, fps: 30, scale: 0.5 });
});

test('stepMote: sube con su velocidad', () => {
  assert.deepEqual(stepMote({ x: 10, y: 100, r: 2, v: 0.02, a: 0.3 }, 500, 600), { x: 10, y: 90, r: 2, v: 0.02, a: 0.3 });
});
test('stepMote: al salir por arriba vuelve por abajo', () => {
  assert.deepEqual(stepMote({ x: 10, y: 1, r: 2, v: 0.02, a: 0.3 }, 500, 600), { x: 10, y: 602, r: 2, v: 0.02, a: 0.3 });
});
test('stepMote: no muta la entrada', () => {
  const m = { x: 10, y: 100, r: 2, v: 0.02, a: 0.3 };
  const out = stepMote(m, 500, 600);
  assert.notEqual(out, m);
  assert.deepEqual(m, { x: 10, y: 100, r: 2, v: 0.02, a: 0.3 });
});
