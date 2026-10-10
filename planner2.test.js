import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runsToday, simulate, cpEta } from './planner.js';

const H = 3_600_000, D = 24 * H;
const T0 = Date.UTC(2026, 9, 11, 0, 0); // recharges at 00:00, 03:00, 06:00…

test('runsToday: mazmorras ahora y antes de medianoche', () => {
  // 10:00 → recargas a las 12, 15, 18, 21 (4 × 15 = 60) hasta las 23:59
  const r = runsToday(100, 40, T0, T0 + 10 * H, T0 + D - 1);
  assert.deepEqual(r, { now: 2, byMidnight: 4 });
});
test('runsToday: sin hora de recarga solo cuenta lo que hay', () => {
  assert.deepEqual(runsToday(95, 40, null, T0, T0 + D), { now: 2, byMidnight: 2 });
});
test('runsToday: coste inválido', () => {
  assert.deepEqual(runsToday(500, 0, T0, T0, T0 + D), { now: 0, byMidnight: 0 });
});
test('simulate: lleno y sin jugar desperdicia 120 de OD al día', () => {
  const s = simulate(840, T0, T0 + H, 0, 40, 7);
  assert.equal(s.wasteOD, 7 * 120);
  assert.equal(s.emptyOn, null);
});
test('simulate: 3 mazmorras de 40 al día = 120, igual a lo que recarga, sin desperdicio', () => {
  const s = simulate(400, T0, T0 + H, 3, 40, 7);
  assert.equal(s.wasteOD, 0);
  assert.equal(s.emptyOn, null);
});
test('simulate: demasiadas mazmorras se queda sin OD', () => {
  const s = simulate(80, T0, T0 + H, 10, 40, 7);
  assert.ok(s.emptyOn !== null && s.emptyOn > T0 + H && s.emptyOn < T0 + 2 * D);
});
test('simulate: el desperdicio nunca supera lo recargado', () => {
  const s = simulate(830, T0, T0 + H, 1, 40, 7);
  assert.ok(s.wasteOD > 0 && s.wasteOD <= 7 * 120);
});
test('cpEta: fecha estimada por el ritmo', () => {
  const pts = [{ at: T0, cp: 10_000 }, { at: T0 + D, cp: 11_000 }, { at: T0 + 2 * D, cp: 12_000 }];
  const e = cpEta(pts, 15_000, T0 + 2 * D);
  assert.equal(e.reached, false);
  assert.equal(e.at, T0 + 5 * D);
});
test('cpEta: objetivo cumplido', () => {
  const pts = [{ at: T0, cp: 10_000 }, { at: T0 + D, cp: 20_000 }];
  assert.deepEqual(cpEta(pts, 15_000, T0 + D), { reached: true, at: T0 + D });
});
test('cpEta: sin datos suficientes o bajando no estima', () => {
  assert.equal(cpEta([{ at: T0, cp: 1 }], 5, T0), null);
  assert.deepEqual(cpEta([{ at: T0, cp: 2000 }, { at: T0 + D, cp: 1000 }], 5000, T0 + D), { reached: false, at: null });
});
test('cpEta: tendencia casi plana no da fechas imposibles', () => {
  const pts = [100000, 100100, 99950, 100050, 100001].map((cp, i) => ({ at: T0 + i * D, cp }));
  const e = cpEta(pts, 9_000_000, T0 + 4 * D);
  assert.equal(e.at, null);
});
test('cpEta: ignora apuntes de hace más de 30 días', () => {
  const pts = [{ at: T0 - 60 * D, cp: 0 }, { at: T0, cp: 10_000 }];
  assert.equal(cpEta(pts, 20_000, T0), null);
});

import { bumped, EMPTY_STATS } from './achievements.js';
test('estadísticas: deshacer un gasto lo resta, sin bajar de cero', () => {
  const a = bumped(EMPTY_STATS, '2026-10-11', { spent: 40, spends: 1 });
  const b = bumped(a, '2026-10-11', { spent: -40, spends: -1 });
  assert.equal(b.spentTotal, 0); assert.equal(b.spendCount, 0); assert.equal(b.daysLog['2026-10-11'].spent, 0);
  const c = bumped(EMPTY_STATS, '2026-10-11', { spent: -40, spends: -1 });
  assert.equal(c.spentTotal, 0); assert.equal(c.spendCount, 0);
});
