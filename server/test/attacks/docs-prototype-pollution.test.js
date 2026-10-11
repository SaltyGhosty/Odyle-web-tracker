// Ataque: contaminación de prototipo por el PATCH (fusión profunda) o el PUT (SR-25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, quickUser, as, legionWith, docOf } from './_lib.js';

const RAW = [
  '{"__proto__":{"polluted":"yes","isAdmin":true}}',
  '{"profile":{"__proto__":{"polluted":"yes"}}}',
  '{"constructor":{"prototype":{"polluted":"yes"}}}',
  '{"profile":{"constructor":{"prototype":{"polluted":"yes"}}}}',
  '{"profile":{"nick":"x","constructor":"y"}}',
  '{"rank":{"achievements":{"prototype":{"polluted":"yes"}}}}',
  '{"rank":{"achievements":{"a":{"b":{"__proto__":{"polluted":"yes"}}}}}}',
  '{"rank":{"achievements":{"__pro\\u0074o__":{"polluted":"yes"}}}}',
  '{"rank":{"achievements":{"constructor":{"prototype":{"polluted":"yes"}}}}}',
];

test('PATCH/PUT con __proto__, constructor o prototype a cualquier profundidad => 400 y el proceso queda limpio', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const a = as(s, A);
  assert.equal((await a('PUT', `/api/docs/members/${A.id}`, { profile: { nick: 'Ana' }, rank: { achievements: { x: 1 } } })).statusCode, 200);
  const before = await docOf(s, `members/${A.id}`);
  for (const body of RAW) {
    for (const method of ['PATCH', 'PUT']) {
      const r = await s.req(method, `/api/docs/members/${A.id}`, { payload: body, headers: { 'content-type': 'application/json' }, cookie: `__Host-odyle_at=${A.at}` });
      assert.equal(r.statusCode, 400, `${method} ${body} -> ${r.statusCode}`);
    }
  }
  assert.equal(({}).polluted, undefined, 'Object.prototype contaminado');
  assert.equal(({}).isAdmin, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
  assert.deepEqual(await docOf(s, `members/${A.id}`), before);
  await s.app.close();
});

test('legionData (RSVP con fusión): claves envenenadas => 400; un objeto contaminado no da permisos a otro', async () => {
  const s = await setup();
  const L = await quickUser(s, 'l'); const M = await quickUser(s, 'm');
  const g = await legionWith(s, L, [M]);
  const ev = `/api/docs/legionData/${g.key}/calendar/e1`;
  assert.equal((await as(s, L)('PUT', ev, { title: 'Raid', at: 1_800_000_000_000, durationMin: 60 })).statusCode, 200);
  for (const body of [`{"rsvp":{"__proto__":{"${M.id}":"yes"}}}`, `{"rsvp":{"constructor":{"prototype":{"uid":"${M.id}"}}}}`, '{"__proto__":{"uid":"x"}}']) {
    const r = await s.req('PATCH', ev, { payload: body, headers: { 'content-type': 'application/json' }, cookie: `__Host-odyle_at=${M.at}` });
    assert.ok([400, 403].includes(r.statusCode), `${body} -> ${r.statusCode}`);
  }
  assert.equal(({}).uid, undefined);
  // M sigue sin poder editar el título del evento del líder.
  assert.equal((await as(s, M)('PATCH', ev, { title: 'Hackeado' })).statusCode, 403);
  assert.equal((await docOf(s, `legionData/${g.key}/calendar/e1`)).title, 'Raid');
  await s.app.close();
});
