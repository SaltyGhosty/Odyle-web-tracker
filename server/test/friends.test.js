import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';

const rel = async (s, me, other) => (await s.call('GET', `/api/profiles/${s.ids[other]}`, me)).json().relation;

test('pedir, aceptar, listar y eliminar', async () => {
  const s = await socialSetup(3);
  const { A, B } = s.ids;
  const r = await s.call('POST', `/api/friends/${B}`, 'A');
  assert.deepEqual(r.json(), { status: 'pending-out' });
  assert.deepEqual((await s.call('GET', '/api/friends', 'B')).json().incoming.map((x) => x.uid), [A]);
  assert.deepEqual((await s.call('GET', '/api/friends', 'A')).json().outgoing.map((x) => x.uid), [B]);
  assert.deepEqual((await s.call('POST', `/api/friends/${A}/accept`, 'B')).json(), { status: 'friends' });
  const list = (await s.call('GET', '/api/friends', 'A')).json();
  assert.deepEqual(list.friends.map((x) => x.uid), [B]);
  assert.equal(list.friends[0].online, false);
  assert.deepEqual((await s.call('DELETE', `/api/friends/${B}`, 'A')).json(), { ok: true });
  assert.equal(await rel(s, 'A', 'B'), 'none');
});

test('petición cruzada: la segunda acepta la primera', async () => {
  const s = await socialSetup(2);
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  assert.deepEqual((await s.call('POST', `/api/friends/${s.ids.A}`, 'B')).json(), { status: 'friends' });
});

test('aceptar algo que no es una solicitud recibida → 404', async () => {
  const s = await socialSetup(2);
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  assert.equal((await s.call('POST', `/api/friends/${s.ids.B}/accept`, 'A')).statusCode, 404);
});

test('bloquear elimina la amistad, oculta y es idempotente; desbloquear no la restaura', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  assert.deepEqual((await s.call('POST', `/api/blocks/${s.ids.B}`, 'A')).json(), { ok: true });
  assert.deepEqual((await s.call('POST', `/api/blocks/${s.ids.B}`, 'A')).json(), { ok: true });
  assert.equal((await s.call('GET', `/api/profiles/${s.ids.A}`, 'B')).statusCode, 404);
  assert.equal((await s.call('POST', `/api/friends/${s.ids.A}`, 'B')).statusCode, 404);
  assert.deepEqual((await s.call('GET', '/api/blocks', 'A')).json().blocked.map((x) => x.uid), [s.ids.B]);
  await s.call('DELETE', `/api/blocks/${s.ids.B}`, 'A');
  assert.equal(await rel(s, 'A', 'B'), 'none');
});

test('máximo 50 solicitudes enviadas pendientes', async () => {
  const s = await socialSetup(2);
  const { newUserId } = await import('../src/lib/tokens.js');
  for (let i = 0; i < 50; i++) {
    const u = newUserId();
    await s.db.query('insert into users (id, email, password_hash) values ($1, $2, $3)', [u, `${u}@x.test`, 'x']);
    const [a, b] = s.ids.A < u ? [s.ids.A, u] : [u, s.ids.A];
    await s.db.query('insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, $3, $4, 1)', [a, b, 'pending', s.ids.A]);
  }
  const r = await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.json(), { error: 'Tienes demasiadas solicitudes pendientes.' });
});

test('eventos friend al pedir, aceptar y eliminar; bloquear solo avisa a quien bloquea', async () => {
  const s = await socialSetup(2);
  const got = { A: [], B: [] };
  s.app.bus.subscribe(s.ids.A, (e) => got.A.push(e.type));
  s.app.bus.subscribe(s.ids.B, (e) => got.B.push(e.type));
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  await s.call('POST', `/api/friends/${s.ids.A}/accept`, 'B');
  await s.call('POST', `/api/blocks/${s.ids.B}`, 'A');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got.A, ['friend', 'friend', 'friend']);
  assert.deepEqual(got.B, ['friend', 'friend']);
});
