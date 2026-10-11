// Ataque: asignación masiva — escribir legionId/legionEpoch u otros campos a mano en /api/docs (SR-24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, quickUser, as, legionWith, docOf } from './_lib.js';

test('PUT/PATCH members/{yo} con legionId/legionEpoch => rechazo (403) y valores intactos', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const A = await quickUser(s, 'atacante');
  const g = await legionWith(s, L, []);
  const a = as(s, A);
  assert.equal((await a('PUT', `/api/docs/members/${A.id}`, { profile: { nick: 'Ana' } })).statusCode, 200);
  const before = await docOf(s, `members/${A.id}`);
  for (const [method, body] of [
    ['PUT', { profile: { nick: 'Ana' }, legionId: L.id, legionEpoch: g.epoch }],
    ['PUT', { legionId: L.id }],
    ['PATCH', { legionId: L.id, legionEpoch: g.epoch }],
    ['PATCH', { legionEpoch: g.epoch }],
    ['PATCH', { legionId: null }],
  ]) {
    const r = await a(method, `/api/docs/members/${A.id}`, body);
    assert.ok([400, 403].includes(r.statusCode), `${method} ${JSON.stringify(body)} -> ${r.statusCode}`);
  }
  assert.deepEqual(await docOf(s, `members/${A.id}`), before);
  // El atacante no ve nada de la legión.
  assert.equal((await a('GET', `/api/docs/legionData/${g.key}/wall`)).statusCode, 403);
  await s.app.close();
});

test('PUT sin los campos reservados conserva legionId/legionEpoch del miembro (no se puede "salir" borrándolos)', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const M = await quickUser(s, 'miembro');
  const g = await legionWith(s, L, [M]);
  const r = await as(s, M)('PUT', `/api/docs/members/${M.id}`, { profile: { nick: 'Nuevo' } });
  assert.equal(r.statusCode, 200);
  const d = await docOf(s, `members/${M.id}`);
  assert.equal(d.legionId, L.id); assert.equal(d.legionEpoch, g.epoch);
  await s.app.close();
});

test('campos desconocidos, anidados o con otra grafía => 400 (esquemas estrictos)', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const a = as(s, A);
  const cases = [
    [`members/${A.id}`, { isAdmin: true }],
    [`members/${A.id}`, { LegionId: 'x' }],
    [`members/${A.id}`, { profile: { nick: 'x', legionId: 'y' } }],
    [`members/${A.id}`, { profile: { nick: 'x', role: 'admin' } }],
    [`members/${A.id}/characters/c1`, { name: 'Ok', legionId: 'x' }],
    [`members/${A.id}/characters/c1`, { name: 'Ok', uid: 'u_' + 'A'.repeat(22) }],
    [`members/${A.id}/settings/prefs`, { quietStart: '22:00', theme: { evil: true } }],
    [`members/${A.id}/settings/stats`, { daysLog: { 'not-a-day': { spent: 1, tasks: 1 } } }],
    [`members/${A.id}/settings/schedule`, { anchorMs: 1, owner: 'x' }],
    [`feedback/${A.id}`, { items: [{ at: 1, text: 'hola', admin: true }] }],
  ];
  for (const [p, body] of cases) {
    const r = await a('PUT', `/api/docs/${p}`, body);
    assert.equal(r.statusCode, 400, `PUT ${p} ${JSON.stringify(body)} -> ${r.statusCode}`);
  }
  await s.app.close();
});

test('importación (PUT en bloque como hace la página) con legionId en la ficha o en personajes => rechazada, nada cambia', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const A = await quickUser(s, 'atacante');
  const g = await legionWith(s, L, []);
  const a = as(s, A);
  const file = { characters: [{ id: 'c1', name: 'X', legionId: L.id }], profile: { nick: 'A' }, legionId: L.id, legionEpoch: g.epoch };
  assert.equal((await a('PUT', `/api/docs/members/${A.id}/characters/c1`, file.characters[0])).statusCode, 400);
  assert.ok([400, 403].includes((await a('PUT', `/api/docs/members/${A.id}`, { profile: file.profile, legionId: file.legionId, legionEpoch: file.legionEpoch })).statusCode));
  assert.equal(await docOf(s, `members/${A.id}`), undefined);
  await s.app.close();
});
