import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickStage, stageCaption, cardOrbMode, CARD_3D_LIMIT } from './stage.js';

const row = (id, o = {}) => ({ id, name: id, isFull: false, fullAtMs: null, regen: 0, ...o });

test('pickStage: sin filas → null', () => {
  assert.equal(pickStage([]), null);
});
test('pickStage: el fijado manda; si está lleno es urgente', () => {
  const rows = [row('a', { isFull: true }), row('b'), row('c', { isFull: true })];
  assert.deepEqual(pickStage(rows, { pinnedId: 'b' }), { id: 'b', tone: 'pinned' });
  assert.deepEqual(pickStage(rows, { pinnedId: 'c' }), { id: 'c', tone: 'urgent' });
});
test('pickStage: fijado que no existe → cae al lleno', () => {
  const rows = [row('a'), row('b', { isFull: true })];
  assert.deepEqual(pickStage(rows, { pinnedId: 'zzz' }), { id: 'b', tone: 'urgent' });
});
test('pickStage: dos llenos → el primero', () => {
  const rows = [row('a'), row('b', { isFull: true }), row('c', { isFull: true })];
  assert.deepEqual(pickStage(rows), { id: 'b', tone: 'urgent' });
});
test('pickStage: sin llenos → el de menor fullAtMs (ignora null)', () => {
  const rows = [row('a'), row('b', { fullAtMs: 900 }), row('c', { fullAtMs: 500 })];
  assert.deepEqual(pickStage(rows), { id: 'c', tone: 'next' });
});
test('pickStage: sin horas → la primera fila', () => {
  assert.deepEqual(pickStage([row('a'), row('b')]), { id: 'a', tone: 'next' });
});
test('stageCaption: lleno, sin hora y cuenta atrás', () => {
  assert.equal(stageCaption(row('a', { isFull: true, regen: 30 }), 0), 'pierde 30 OD cada 3 h');
  assert.equal(stageCaption(row('a'), 0), 'Sin hora de recarga');
  assert.equal(stageCaption(row('a', { fullAtMs: undefined }), 0), 'Sin hora de recarga');
  assert.match(stageCaption(row('a', { fullAtMs: 3_600_000 }), 0), /^Lleno en .+/);
});
test('cardOrbMode: 3d hasta 8, 2d desde 9', () => {
  assert.equal(CARD_3D_LIMIT, 8);
  assert.equal(cardOrbMode(8), '3d');
  assert.equal(cardOrbMode(9), '2d');
});
