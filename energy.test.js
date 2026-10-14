import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticksBetween, nextTickAt, currentEnergy, fullAt, anchorFromCountdown, formatDuration, ACCOUNTS, rulesOf } from './energy.js';

const R = Date.UTC(2026, 9, 10, 12, 0);
const A = R + 37 * 60_000;
const H = 3_600_000;

const N = { account: 'normal' };
// Cuenta normal: +15 por recarga, tope 560.
test('sin tick antes del primer ancla', () => assert.equal(currentEnergy({energy:225, recordedAt:R, ...N}, A, R + 36*60_000), 225));
test('suma 15 justo en el tick', () => assert.equal(currentEnergy({energy:225, recordedAt:R, ...N}, A, A), 240)); // 225+15
test('suma 30 tras dos ticks', () => assert.equal(currentEnergy({energy:225, recordedAt:R, ...N}, A, A + 3*H), 255)); // 225+2*15
test('días después recalcula desde recordedAt', () => assert.equal(currentEnergy({energy:90, recordedAt:R, ...N}, A, A + 49*3*H), 560)); // 90+50*15=840 → tope 560
test('no supera 560', () => assert.equal(currentEnergy({energy:550, recordedAt:R, ...N}, A, A), 560)); // 550+15=565 → 560
test('por encima de 560 se queda igual', () => { assert.equal(currentEnergy({energy:900, recordedAt:R, ...N}, A, A + 9*H), 900); assert.equal(fullAt({energy:900, recordedAt:R, ...N}, A, A), null); });
test('guardado justo en un tick no lo cuenta', () => { assert.equal(ticksBetween(A, A, A), 0); assert.equal(ticksBetween(A, A, A + 3*H), 1); });
test('ancla en el futuro o pasado da igual', () => assert.equal(ticksBetween(A + 30*3*H, R, A + 3*H), 2));
test('nextTickAt', () => { assert.equal(nextTickAt(A, R), A); assert.equal(nextTickAt(A, A), A + 3*H); });
test('fullAt de los tres personajes', () => {
  assert.equal(fullAt({energy:225, recordedAt:R, ...N}, A, R), A + 22*3*H); // (560-225)/15=22.33 → 23 ticks
  assert.equal(fullAt({energy:180, recordedAt:R, ...N}, A, R), A + 25*3*H); // (560-180)/15=25.33 → 26 ticks
  assert.equal(fullAt({energy:90,  recordedAt:R, ...N}, A, R), A + 31*3*H); // (560-90)/15=31.33 → 32 ticks
});
test('anchorFromCountdown', () => assert.equal(anchorFromCountdown(R, 37), A));
test('formatDuration', () => {
  assert.equal(formatDuration(59_999), '<1m');
  assert.equal(formatDuration(37*60_000), '37m');
  assert.equal(formatDuration(2*H + 5*60_000), '2h 5m');
  assert.equal(formatDuration(120*H + 37*60_000), '5d 0h 37m');
});
test('recordedAt en el futuro (reloj distinto) no reduce la energía', () => assert.equal(currentEnergy({energy:225, recordedAt:A + 1, ...N}, A, A - 1), 225));

test('reglas por cuenta: normal 15/560, premium 30/840, sin cuenta = premium', () => {
  assert.deepEqual(ACCOUNTS.normal, { regen: 15, max: 560 });
  assert.deepEqual(ACCOUNTS.premium, { regen: 30, max: 840 });
  assert.deepEqual(rulesOf({}), { account: 'premium', regen: 30, max: 840 });
  assert.deepEqual(rulesOf({ account: 'gold' }), { account: 'premium', regen: 30, max: 840 });
  assert.deepEqual(rulesOf({ account: 'normal' }), { account: 'normal', regen: 15, max: 560 });
});
test('normal: +15 por recarga y tope 560', () => {
  const c = { energy: 225, recordedAt: R, account: 'normal' };
  assert.equal(currentEnergy(c, A, A), 240);
  assert.equal(currentEnergy(c, A, A + 30 * H), 390); // ticks at A, A+3h..A+30h = 11 → 225+11*15
  assert.equal(currentEnergy({ ...c, energy: 550 }, A, A), 560);
  assert.equal(fullAt(c, A, R), A + 22 * 3 * H); // (560-225)/15 = 22.33 → 23 recharges
});
test('premium: +30 por recarga y tope 840', () => {
  const c = { energy: 225, recordedAt: R, account: 'premium' };
  assert.equal(currentEnergy(c, A, A), 255);
  assert.equal(fullAt(c, A, R), A + 20 * 3 * H); // (840-225)/30 = 20.5 → 21 recharges
  assert.equal(currentEnergy({ ...c, energy: 835 }, A, A), 840);
});
test('normal por encima de 560 (venía de premium): se queda, no recarga, ya está lleno', () => {
  const c = { energy: 700, recordedAt: R, account: 'normal' };
  assert.equal(currentEnergy(c, A, A + 9 * H), 700);
  assert.equal(fullAt(c, A, A), null);
});
