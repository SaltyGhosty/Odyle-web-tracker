import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, navModel, resolveTab, decisionBand, planRows, headerRule } from './layout.js';

test('secciones: Energía primero, ids estables y etiqueta nueva', () => {
  assert.equal(SECTIONS[0].id, 'personajes');
  assert.equal(SECTIONS[0].label, 'Energía');
  assert.deepEqual(SECTIONS.map((s) => s.id),
    ['personajes', 'eventos', 'amigos', 'chat', 'buscar', 'legion', 'estadisticas', 'ajustes', 'novedades']);
  assert.ok(SECTIONS.every((s) => typeof s.icon === 'string'));
});

test('web: rail con todo, barra Energía·Eventos·Amigos·Chat, el resto en Más', () => {
  const m = navModel({ social: true });
  assert.deepEqual(m.rail, SECTIONS.map((s) => s.id));
  assert.deepEqual(m.bar, ['personajes', 'eventos', 'amigos', 'chat']);
  assert.deepEqual(m.more, ['buscar', 'legion', 'estadisticas', 'ajustes', 'novedades']);
});

test('artifact: sin secciones sociales; barra Energía·Eventos·Legión·Estadísticas', () => {
  const m = navModel({ social: false });
  assert.ok(!m.rail.includes('amigos') && !m.rail.includes('chat') && !m.rail.includes('buscar'));
  assert.deepEqual(m.bar, ['personajes', 'eventos', 'legion', 'estadisticas']);
  assert.deepEqual(m.more, ['ajustes', 'novedades']);
});

test('resolveTab: válido se respeta; desconocido o social en artifact → Energía', () => {
  assert.equal(resolveTab('chat', { social: true }), 'chat');
  assert.equal(resolveTab('chat', { social: false }), 'personajes');
  assert.equal(resolveTab('amigos', { social: false }), 'personajes');
  assert.equal(resolveTab('<x>', { social: true }), 'personajes');
  assert.equal(resolveTab(null, { social: true }), 'personajes');
  assert.equal(resolveTab('ajustes', { social: false }), 'ajustes');
});

const H = 3_600_000;
const quiet = { start: '00:00', end: '08:00' };
const row = (id, name, energy, fullAtMs) => ({ id, name, energy, isFull: energy >= 840, fullAtMs, regen: 15, max: 840 });

test('banda: sin personajes no hay banda', () => {
  assert.equal(decisionBand([], 0, { quiet, tzOffsetMin: 0 }), null);
});
test('banda urgente: uno al tope', () => {
  const b = decisionBand([row('a', 'Ana', 300, 10 * H), row('c', 'Casi', 840, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.deepEqual(b, { tone: 'urgent', text: 'Casi está al tope · pierde 15 OD cada 3 h', targetId: 'c' });
});
test('banda urgente: varios al tope', () => {
  const b = decisionBand([row('c', 'Casi', 840, null), row('d', 'Dos', 840, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.equal(b.tone, 'urgent');
  assert.equal(b.text, '2 personajes al tope · pierden 15 OD cada 3 h');
  assert.equal(b.targetId, 'c');
});
const nrow = (id, name, energy, fullAtMs) => ({ id, name, energy, isFull: energy >= 560, fullAtMs, regen: 15, max: 560 });
const prem = (id, name, energy, fullAtMs) => ({ id, name, energy, isFull: energy >= 840, fullAtMs, regen: 30, max: 840 });
test('banda urgente: uno al tope pierde la recarga de su cuenta', () => {
  const b = decisionBand([nrow('a', 'Ana', 300, 10 * H), prem('p', 'Pre', 840, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.deepEqual(b, { tone: 'urgent', text: 'Pre está al tope · pierde 30 OD cada 3 h', targetId: 'p' });
  const n = decisionBand([nrow('n', 'Nor', 560, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.equal(n.text, 'Nor está al tope · pierde 15 OD cada 3 h');
});
test('banda urgente: varios al tope con la misma recarga la nombran; mezclados no', () => {
  const same = decisionBand([prem('p', 'Pre', 840, null), prem('q', 'Qua', 900, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.equal(same.text, '2 personajes al tope · pierden 30 OD cada 3 h');
  const mixed = decisionBand([nrow('n', 'Nor', 560, null), prem('p', 'Pre', 840, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.deepEqual(mixed, { tone: 'urgent', text: '2 personajes al tope · pierden energía cada 3 h', targetId: 'n' });
});
test('banda aviso: se llena antes del final del descanso y perdería energía', () => {
  // ahora 22:00 UTC del día 0; se llena a las 23:00; descanso 00:00–08:00 → pierde recargas
  const now = 22 * H;
  const b = decisionBand([row('a', 'Ana', 825, now + 1 * H), row('b', 'Bea', 100, now + 90 * H)], now, { quiet, tzOffsetMin: 0 });
  assert.equal(b.tone, 'warn');
  assert.equal(b.targetId, 'a');
  assert.match(b.text, /^Ana se llena en 1h 0m · perderías \d+ OD si no juegas antes$/);
});
test('banda en calma: el próximo en llenarse', () => {
  const now = 9 * H; // fuera del descanso; se llena dentro de 3 días, a media tarde
  const b = decisionBand([row('b', 'Bea', 100, now + 72 * H + 6 * H), row('a', 'Ana', 400, now + 30 * H + 6 * H)], now, { quiet, tzOffsetMin: 0 });
  assert.equal(b.tone, 'calm');
  assert.equal(b.targetId, 'a');
  assert.equal(b.text, 'Nadie al tope · el próximo, Ana en 1d 12h 0m');
});
test('banda en calma sin hora de recarga', () => {
  const b = decisionBand([row('a', 'Ana', 400, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.deepEqual(b, { tone: 'calm', text: 'Nadie al tope', targetId: null });
});

// ---- Plan de hoy ----
const eod = 24 * H;
const presets = [{ id: 'p1', name: 'Theobomos', cost: 80 }, { id: 'p2', name: 'Campaña', cost: 40 }];
const prow = (id, name, energy, fullAtMs) => ({ id, name, energy, isFull: energy >= 840, fullAtMs, regen: 15, max: 840 });

test('planRows: mazmorras posibles hoy por preset, contando las recargas hasta medianoche', () => {
  // ancla en 0: recargas a las 3, 6 ... 24 h (8) → +120 OD; 300 + 120 = 420
  const [r] = planRows([prow('a', 'Ana', 300, 20 * H)], presets, { anchorMs: 0, now: 1 * H, endOfDayMs: eod });
  assert.equal(r.id, 'a');
  assert.equal(r.name, 'Ana');
  assert.deepEqual(r.runs, { p1: 5, p2: 10 });
});
test('planRows: sin hora de recarga solo cuenta la energía actual y lo dice', () => {
  const [r] = planRows([prow('a', 'Ana', 300, null)], presets, { anchorMs: null, now: 0, endOfDayMs: eod });
  assert.deepEqual(r.runs, { p1: 3, p2: 7 });
  assert.deepEqual(r.next, { tone: 'empty', text: 'Sin hora de recarga' });
});
test('planRows: al tope → urgente', () => {
  const [r] = planRows([prow('c', 'Casi', 840, null)], presets, { anchorMs: 0, now: 0, endOfDayMs: eod });
  assert.deepEqual(r.next, { tone: 'urgent', text: 'Gastar ya: está al tope' });
  assert.equal(r.runs.p1, 12); // 840 + 8 recargas × 15 = 960 → 12 × 80
});
test('planRows: próxima meta con el primer gasto y el tiempo hasta llenarse', () => {
  const [r] = planRows([prow('a', 'Ana', 700, 3 * H)], presets, { anchorMs: 0, now: 0, endOfDayMs: eod });
  assert.deepEqual(r.next, { tone: 'normal', text: 'Theobomos ×8 en 3h 0m' });
});
test('planRows: sin energía para el primer gasto solo da el tiempo', () => {
  const [r] = planRows([prow('a', 'Ana', 30, 50 * H)], presets, { anchorMs: 0, now: 0, endOfDayMs: eod });
  assert.deepEqual(r.next, { tone: 'normal', text: 'Lleno en 2d 2h 0m' });
});
test('planRows: sin gastos no hay columnas y nada es NaN; sin personajes no hay filas', () => {
  const [r] = planRows([prow('a', 'Ana', 300, 20 * H)], [], { anchorMs: 0, now: 0, endOfDayMs: eod });
  assert.deepEqual(r.runs, {});
  assert.equal(r.next.tone, 'normal');
  assert.ok(!/NaN/.test(r.next.text));
  assert.deepEqual(planRows([], presets, { anchorMs: 0, now: 0, endOfDayMs: eod }), []);
});
test('planRows: un gasto con coste 0 no produce NaN ni Infinity', () => {
  const [r] = planRows([prow('a', 'Ana', 300, 20 * H)], [{ id: 'z', name: 'Cero', cost: 0 }], { anchorMs: 0, now: 0, endOfDayMs: eod });
  assert.equal(r.runs.z, 0);
  assert.equal(r.next.text, 'Lleno en 20h 0m');
});

test('banda urgente: personaje normal al tope de 560', () => {
  const n = { id: 'n', name: 'Norma', account: 'normal', max: 560, regen: 15, energy: 560, isFull: true, fullAtMs: null };
  const b = decisionBand([n], 0, { quiet, tzOffsetMin: 0 });
  assert.equal(b.tone, 'urgent');
  assert.equal(b.targetId, 'n');
});

test('cabecera: cifras solo si todas las cuentas coinciden', () => {
  assert.deepEqual(headerRule([{ regen: 15, max: 560 }, { regen: 15, max: 560 }]), { regen: 15, max: 560 });
  assert.deepEqual(headerRule([{ regen: 30, max: 840 }]), { regen: 30, max: 840 });
  assert.equal(headerRule([{ regen: 15, max: 560 }, { regen: 30, max: 840 }]), null);
  assert.equal(headerRule([]), null);
});
