import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TWEEN_MS, retarget, valueAt, running } from './tween.js';

test('empieza en from y termina exactamente en to', () => {
  const tw = retarget(retarget(undefined, 840, 0), 120, 1000);
  assert.equal(valueAt(tw, 1000), 840);
  assert.equal(valueAt(tw, 1000 + TWEEN_MS), 120);
  assert.equal(valueAt(tw, 1000 + TWEEN_MS * 3), 120);
  assert.equal(running(tw, 1000 + TWEEN_MS / 2), true);
  assert.equal(running(tw, 1000 + TWEEN_MS), false);
});
test('monótono y con salida rápida (ease-out)', () => {
  const tw = retarget(retarget(undefined, 0, 0), 560, 0);
  let prev = -1;
  for (let t = 0; t <= TWEEN_MS; t += 10) { const v = valueAt(tw, t); assert.ok(v >= prev, `t=${t}`); prev = v; }
  assert.ok(valueAt(tw, TWEEN_MS / 2) > 280);
});
test('primer valor y mismo objetivo: sin animación ni reinicio', () => {
  const first = retarget(undefined, 300, 5);
  assert.equal(valueAt(first, 5), 300);
  assert.equal(running(first, 5), false);
  const tw = retarget(first, 100, 10);
  assert.equal(retarget(tw, 100, 400), tw); // the per-second repaint keeps the running glide
});
test('cambio a mitad: parte del valor mostrado', () => {
  const tw = retarget(retarget(undefined, 0, 0), 800, 0);
  const mid = valueAt(tw, 200);
  const again = retarget(tw, 100, 200);
  assert.equal(valueAt(again, 200), mid);
  assert.equal(valueAt(again, 200 + TWEEN_MS), 100);
});
test('instantáneo (calm / reduced motion)', () => {
  const tw = retarget(retarget(undefined, 0, 0), 800, 0, true);
  assert.equal(valueAt(tw, 0), 800);
  assert.equal(running(tw, 0), false);
});
test('pasar a instantáneo a mitad de un deslizamiento lo termina', () => {
  const tw = retarget(retarget(undefined, 0, 0), 800, 0);
  const now = retarget(tw, 800, 100, true);
  assert.equal(valueAt(now, 100), 800);
  assert.equal(running(now, 100), false);
});
