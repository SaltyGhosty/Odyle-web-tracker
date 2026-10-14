import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary, wasteWarning, projectEnergy, simulate, runsToday } from './planner.js';

const Z = (d, h, m = 0) => Date.UTC(2026, 9, d, h, m);
const H = 3_600_000;
const NIGHT = { start: '00:00', end: '08:00' };

test('wasteWarning: se llena durante el descanso', () => {
  const now = Z(10, 20);
  assert.deepEqual(wasteWarning(Z(11, 2), now, NIGHT, 0, 15), { lossOD: 30, deadlineMs: Z(11, 2) });
  assert.equal(wasteWarning(Z(11, 7), now, NIGHT, 0, 15), null);
  assert.equal(wasteWarning(Z(11, 9), now, NIGHT, 0, 15), null);
  assert.equal(wasteWarning(null, now, NIGHT, 0, 15), null);
});
test('wasteWarning: descanso que cruza medianoche', () => {
  const now = Z(10, 20), q = { start: '23:00', end: '07:00' };
  assert.deepEqual(wasteWarning(Z(11, 1), now, q, 0, 15), { lossOD: 30, deadlineMs: Z(11, 1) });
  assert.equal(wasteWarning(Z(11, 4, 30), now, q, 0, 15), null);
});
test('wasteWarning: dentro del descanso ahora mismo', () => {
  const now = Z(11, 1); // 01:00, descanso 00:00–08:00
  assert.deepEqual(wasteWarning(Z(11, 2), now, NIGHT, 0, 15), { lossOD: 30, deadlineMs: Z(11, 2) });
});
test('wasteWarning: respeta la zona horaria (UTC+2)', () => {
  // 02:00 local = 00:00Z; ventana local 00:00–08:00 = 22:00Z–06:00Z
  assert.deepEqual(wasteWarning(Z(11, 0), Z(10, 18), NIGHT, -120, 15), { lossOD: 30, deadlineMs: Z(11, 0) });
});
test('projectEnergy: cada recarga hasta 24 h', () => {
  const R = Z(10, 12), A = R + 37 * 60_000;
  const pts = projectEnergy({ energy: 225, recordedAt: R, account: 'normal' }, A, R, 1);
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[0], { t: R, energy: 225 });
  assert.deepEqual(pts[1], { t: A, energy: 240 });
  assert.equal(pts.at(-1).energy, 345); // 225 + 8 ticks * 15
  const capped = projectEnergy({ energy: 830, recordedAt: R }, A, R, 1);
  assert.ok(capped.every(p => p.energy <= 840) && capped.at(-1).energy === 840);
});
test('summary: total, lleno, siguiente y sugerencia', () => {
  const now = Z(10, 12);
  const rows = [
    { id: 'a', name: 'A', energy: 840, isFull: true, fullAtMs: null },
    { id: 'b', name: 'B', energy: 300, isFull: false, fullAtMs: now + 5 * H },
    { id: 'c', name: 'C', energy: 100, isFull: false, fullAtMs: now + 9 * H },
  ];
  const s = summary(rows, now);
  assert.equal(s.total, 1240);
  assert.deepEqual(s.fullNow, ['A']);
  assert.deepEqual(s.nextFull, { id: 'b', name: 'B', fullAtMs: now + 5 * H });
  assert.equal(s.tip, 'A está lleno: gasta energía para no perder recargas');
  assert.equal(summary(rows.slice(1), now).tip, 'Juega con B: se llena en 5h 0m');
  assert.equal(summary([{ id: 'x', name: 'X', energy: 10, isFull: false, fullAtMs: null }], now).tip, '');
});

test('premium pierde 30 por recarga desperdiciada; normal 15', () => {
  const quiet = { start: '00:00', end: '06:00' };
  const now = Date.UTC(2026, 9, 14, 23, 0), full = Date.UTC(2026, 9, 15, 0, 0);
  // full at 00:00, rest ends 06:00: 2 recharges lost (03:00, 06:00) = 2 x regen
  assert.equal(wasteWarning(full, now, quiet, 0, 30).lossOD, 60);
  assert.equal(wasteWarning(full, now, quiet, 0, 15).lossOD, 30);
});
test('simulate respeta el tope de la cuenta', () => {
  const r = simulate(550, 0, 1, 0, 100, 1, { regen: 15, max: 560 });
  assert.equal(r.wasteOD, 8 * 15 - 10); // the first recharge fills 10, the rest are lost
});
test('runsToday con recarga premium', () => {
  assert.equal(runsToday(0, 30, 0, 1, 3 * 10_800_000, 30).byMidnight, 3);
});
