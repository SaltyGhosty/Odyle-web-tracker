import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticksBetween, nextTickAt, currentEnergy, fullAt, anchorFromCountdown, formatDuration } from './energy.js';

const R = Date.UTC(2026, 9, 10, 12, 0);
const A = R + 37 * 60_000;
const H = 3_600_000;

test('sin tick antes del primer ancla', () => assert.equal(currentEnergy({energy:225, recordedAt:R}, A, R + 36*60_000), 225));
test('suma 15 justo en el tick', () => assert.equal(currentEnergy({energy:225, recordedAt:R}, A, A), 240));
test('suma 30 tras dos ticks', () => assert.equal(currentEnergy({energy:225, recordedAt:R}, A, A + 3*H), 255));
test('días después recalcula desde recordedAt', () => assert.equal(currentEnergy({energy:90, recordedAt:R}, A, A + 49*3*H), 840));
test('no supera 840', () => assert.equal(currentEnergy({energy:835, recordedAt:R}, A, A), 840));
test('por encima de 840 se queda igual', () => { assert.equal(currentEnergy({energy:900, recordedAt:R}, A, A + 9*H), 900); assert.equal(fullAt({energy:900, recordedAt:R}, A, A), null); });
test('guardado justo en un tick no lo cuenta', () => { assert.equal(ticksBetween(A, A, A), 0); assert.equal(ticksBetween(A, A, A + 3*H), 1); });
test('ancla en el futuro o pasado da igual', () => assert.equal(ticksBetween(A + 30*3*H, R, A + 3*H), 2));
test('nextTickAt', () => { assert.equal(nextTickAt(A, R), A); assert.equal(nextTickAt(A, A), A + 3*H); });
test('fullAt de los tres personajes', () => {
  assert.equal(fullAt({energy:225, recordedAt:R}, A, R), A + 40*3*H); // 41 ticks
  assert.equal(fullAt({energy:180, recordedAt:R}, A, R), A + 43*3*H); // 44 ticks
  assert.equal(fullAt({energy:90,  recordedAt:R}, A, R), A + 49*3*H); // 50 ticks
});
test('anchorFromCountdown', () => assert.equal(anchorFromCountdown(R, 37), A));
test('formatDuration', () => {
  assert.equal(formatDuration(59_999), '<1m');
  assert.equal(formatDuration(37*60_000), '37m');
  assert.equal(formatDuration(2*H + 5*60_000), '2h 5m');
  assert.equal(formatDuration(120*H + 37*60_000), '5d 0h 37m');
});
