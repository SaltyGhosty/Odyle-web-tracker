import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDelta, parsePreset, parseExtraInput, dailySpent, staleEvents } from './spend.js';

test('applyDelta', () => {
  assert.deepEqual(applyDelta(100, -40), { ok: true, energy: 60 });
  assert.deepEqual(applyDelta(30, -40), { ok: false, error: 'No hay energía suficiente' });
  assert.deepEqual(applyDelta(840, 15), { ok: true, energy: 855 });
  assert.equal(applyDelta(99990, 50).energy, 99999);
});
test('parsePreset', () => {
  assert.deepEqual(parsePreset(' Mazmorra ', '40'), { ok: true, value: { name: 'Mazmorra', cost: 40 } });
  for (const c of ['0', '841', '4.5', '']) assert.equal(parsePreset('X', c).ok, false);
  assert.equal(parsePreset('x'.repeat(21), '10').ok, false);
  assert.equal(parsePreset('  ', '10').ok, false);
});
test('parseExtraInput', () => {
  assert.deepEqual(parseExtraInput('50'), { ok: true, value: 50 });
  for (const b of ['0', '10000', 'a', '']) assert.equal(parseExtraInput(b).ok, false);
});
test('dailySpent: 7 días locales, solo gasto', () => {
  const now = Date.UTC(2026, 9, 10, 12);
  const ev = [
    { at: Date.UTC(2026, 9, 9, 23, 30), kind: 'spend', amount: 40 },
    { at: Date.UTC(2026, 9, 10, 0, 30), kind: 'spend', amount: 20 },
    { at: Date.UTC(2026, 9, 10, 1), kind: 'extra', amount: 100 },
    { at: Date.UTC(2026, 9, 1), kind: 'spend', amount: 999 },
  ];
  const d = dailySpent(ev, now, 0);
  assert.equal(d.length, 7);
  assert.deepEqual(d.at(-1), { day: '2026-10-10', spent: 20 });
  assert.deepEqual(d.at(-2), { day: '2026-10-09', spent: 40 });
  assert.equal(d[0].day, '2026-10-04');
  // en UTC+2 (offset -120) el gasto de las 23:30Z cuenta como 10/10
  assert.deepEqual(dailySpent(ev, now, -120).at(-1), { day: '2026-10-10', spent: 60 });
});
test('staleEvents: más de 30 días', () => {
  const now = Date.UTC(2026, 9, 10);
  assert.deepEqual(staleEvents([{ id: 'old', at: now - 31 * 86400000 }, { id: 'new', at: now - 29 * 86400000 }], now), ['old']);
});
