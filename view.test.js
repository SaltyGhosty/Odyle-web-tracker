import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView, parseEnergyInput, parseMinutesInput, parseNameInput } from './view.js';
import { formatDuration } from './energy.js';

const R = Date.UTC(2026, 9, 10, 12, 0);
const A = R + 37 * 60_000;
const H = 3_600_000;

test('filas ordenadas por order y con datos calculados', () => {
  const v = buildView([
    {id:'b', name:'shutaruku', energy:180, recordedAt:R, order:2},
    {id:'a', name:'SaltyGhosty', energy:225, recordedAt:R, order:1},
  ], {anchorMs:A}, R);
  assert.deepEqual(v.rows.map(r => r.id), ['a','b']);
  assert.equal(v.nextTickInMs, 37*60_000);
  assert.equal(v.rows[0].energy, 225);
  assert.equal(v.rows[0].percent, 26);              // floor(225/840*100)
  assert.equal(v.rows[0].fullAtMs, A + 40*3*H);
  assert.equal(v.rows[0].fullInText, formatDuration(A + 40*3*H - R));
});
test('lleno', () => { const r = buildView([{id:'a',name:'x',energy:900,recordedAt:R,order:1}], {anchorMs:A}, R).rows[0];
  assert.equal(r.isFull, true); assert.equal(r.percent, 100); assert.equal(r.fullInText, 'Lleno'); assert.equal(r.fullAtMs, null); });
test('sin horario: valor guardado y aviso', () => { const v = buildView([{id:'a',name:'x',energy:90,recordedAt:R,order:1}], null, R + 9*H);
  assert.equal(v.nextTickInMs, null); assert.equal(v.rows[0].energy, 90); assert.equal(v.rows[0].fullInText, 'Falta la hora de recarga'); });
test('lista vacía', () => assert.deepEqual(buildView([], {anchorMs:A}, R).rows, []));
test('parseEnergyInput', () => {
  assert.deepEqual(parseEnergyInput(' 225 '), {ok:true, value:225});
  assert.deepEqual(parseEnergyInput('900'), {ok:true, value:900});
  for (const bad of ['', '-5', '12.5', 'abc', '100000']) assert.equal(parseEnergyInput(bad).ok, false);
});
test('parseMinutesInput', () => {
  assert.deepEqual(parseMinutesInput('37'), {ok:true, value:37});
  for (const bad of ['0', '181', '', '3.5']) assert.equal(parseMinutesInput(bad).ok, false);
});
test('parseNameInput', () => {
  assert.deepEqual(parseNameInput('  PraiseTheSun '), {ok:true, value:'PraiseTheSun'});
  assert.equal(parseNameInput('   ').ok, false);
  assert.equal(parseNameInput('x'.repeat(25)).ok, false);
});
test('ignora documentos mal formados y un horario sin anchorMs', () => {
  const bad = [{id:'x', name:5, energy:1, recordedAt:R, order:1}, {id:'y', name:'Y', energy:NaN, recordedAt:R, order:1},
    {id:'z', name:'Z', energy:1, recordedAt:undefined, order:1}, {id:'ok', name:'Ok', energy:10, recordedAt:R, order:1}];
  assert.deepEqual(buildView(bad, {anchorMs:A}, R).rows.map(r => r.id), ['ok']);
  const v = buildView(bad, {}, R);
  assert.equal(v.nextTickInMs, null);
});
