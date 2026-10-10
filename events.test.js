import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, nextOccurrence } from './events.js';

const ev = id => EVENTS.find(e => e.id === id);
const Z = (d, h, m = 0, s = 0) => Date.UTC(2026, 9, d, h, m, s);
const NOW = Z(10, 17, 25, 54); // sáb 10/10/2026

test('8 eventos con ids fijos', () => {
  assert.deepEqual(EVENTS.map(e => e.id), ['daily', 'weekly', 'shugo', 'rift', 'kaira', 'siege', 'siegeBosses', 'nahma']);
});
test('Shugo: cada hora, 10 min', () => {
  assert.deepEqual(nextOccurrence(ev('shugo'), NOW), { startMs: Z(10, 18), endMs: Z(10, 18, 10), active: false });
  assert.deepEqual(nextOccurrence(ev('shugo'), Z(10, 18, 5)), { startMs: Z(10, 18), endMs: Z(10, 18, 10), active: true });
});
test('grieta y Kaira: cada 3 h', () => {
  assert.equal(nextOccurrence(ev('rift'), NOW).startMs, Z(10, 18));
  assert.equal(nextOccurrence(ev('kaira'), NOW).startMs, Z(10, 19));
});
test('reinicios', () => {
  assert.equal(nextOccurrence(ev('daily'), NOW).startMs, Z(11, 7));
  assert.equal(nextOccurrence(ev('weekly'), NOW).startMs, Z(14, 7));
});
test('semanales: asedio y Nahma', () => {
  assert.equal(nextOccurrence(ev('siege'), NOW).startMs, Z(12, 12));
  assert.equal(nextOccurrence(ev('nahma'), NOW).startMs, Z(11, 12));
  assert.deepEqual(nextOccurrence(ev('siege'), Z(10, 12, 10)), { startMs: Z(10, 12), endMs: Z(10, 12, 30), active: true });
  assert.equal(nextOccurrence(ev('siegeBosses'), NOW).startMs, Z(12, 12, 30));
});
