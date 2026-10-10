import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, detectGains, rollValue } from './motion.js';

test('formatClock', () => {
  assert.equal(formatClock(37 * 60_000), '00:37:00');
  assert.equal(formatClock(3 * 3_600_000 - 1000), '02:59:59');
  assert.equal(formatClock(-5), '00:00:00');
});
const prev = new Map([['a', { energy: 225, recordedAt: 1 }]]);
test('detectGains: subida por recarga', () => {
  assert.deepEqual(detectGains(prev, [{ id: 'a', energy: 240, recordedAt: 1 }]), [{ id: 'a', gain: 15 }]);
});
test('detectGains: edición manual no cuenta', () => {
  assert.deepEqual(detectGains(prev, [{ id: 'a', energy: 300, recordedAt: 2 }]), []);
});
test('detectGains: personaje nuevo no cuenta', () => {
  assert.deepEqual(detectGains(prev, [{ id: 'b', energy: 300, recordedAt: 1 }]), []);
});
test('detectGains: varios ticks perdidos dan un solo evento', () => {
  assert.deepEqual(detectGains(prev, [{ id: 'a', energy: 255, recordedAt: 1 }]), [{ id: 'a', gain: 30 }]);
});
test('detectGains: bajada no cuenta', () => {
  assert.deepEqual(detectGains(prev, [{ id: 'a', energy: 200, recordedAt: 1 }]), []);
});
test('rollValue', () => {
  assert.equal(rollValue(0, 100, 0), 0);
  assert.equal(rollValue(0, 100, 1), 100);
  assert.equal(rollValue(0, 100, 0.5), 88);
  assert.equal(rollValue(0, 100, 2), 100);
});
