import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, nextOccurrence } from './events.js';
import { headerClocks, sortEvents, RESET_IDS } from './clocks.js';

const NOW = Date.UTC(2026, 9, 27, 6, 0);
const M = 60_000;
const byId = id => EVENTS.find(e => e.id === id);
// Evento de prueba: cada hora en el minuto `minute`, dura `durationMin`.
const hourly = (id, minute, durationMin) => ({ id, name: id, rule: { every: 'hour', minute }, durationMin });

test('RESET_IDS', () => assert.deepEqual(RESET_IDS, ['daily', 'weekly']));
test('daily: próximo reinicio diario a las 07:00 UTC', () => {
  const c = headerClocks(NOW);
  assert.equal(c.daily.startMs, nextOccurrence(byId('daily'), NOW).startMs);
  assert.equal(c.daily.startMs, Date.UTC(2026, 9, 27, 7, 0));
  assert.equal(c.weekly.startMs, nextOccurrence(byId('weekly'), NOW).startMs);
});
test('solo reinicios: next es null', () => {
  const c = headerClocks(NOW, [byId('daily'), byId('weekly')]);
  assert.equal(c.next, null);
});
test('un evento activo gana a uno que empieza antes de acabar', () => {
  const evs = [hourly('a', 50, 30), hourly('b', 5, 10)]; // a empezó 06:50? no: now 06:00 -> a activo desde 05:50 hasta 06:20
  const c = headerClocks(NOW, evs);
  assert.equal(c.next.id, 'a');
  assert.equal(c.next.active, true);
  assert.equal(c.next.endMs, NOW + 20 * M);
});
test('dos próximos: gana el de inicio más temprano', () => {
  const c = headerClocks(NOW, [hourly('late', 30, 5), hourly('soon', 10, 5)]);
  assert.equal(c.next.id, 'soon');
  assert.equal(c.next.active, false);
  assert.equal(c.next.startMs, NOW + 10 * M);
});
test('varios activos: el que acaba antes', () => {
  const c = headerClocks(NOW, [hourly('x', 50, 60), hourly('y', 50, 30)]);
  assert.equal(c.next.id, 'y');
});
test('sortEvents: reinicios primero y resto estable', () => {
  const mk = id => ({ e: { id }, o: {}, f: false });
  const out = sortEvents([mk('shugo'), mk('weekly'), mk('rift'), mk('daily')]);
  assert.deepEqual(out.map(i => i.e.id), ['daily', 'weekly', 'shugo', 'rift']);
});
test('sortEvents devuelve un array nuevo', () => {
  const items = [{ e: { id: 'weekly' }, o: {}, f: false }];
  assert.notEqual(sortEvents(items), items);
});
