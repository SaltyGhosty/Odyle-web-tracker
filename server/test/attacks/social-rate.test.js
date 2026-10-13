// SR-40: límites por usuario y minuto en las rutas sociales (escritura de amistad, stream, ver perfil).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';

test('amistad: la escritura 21 en un minuto → 429', async () => {
  const s = await socialSetup(2);
  for (let i = 0; i < 20; i++) assert.equal((await s.call('DELETE', `/api/friends/${s.ids.B}`, 'A')).statusCode, 200);
  assert.equal((await s.call('DELETE', `/api/friends/${s.ids.B}`, 'A')).statusCode, 429);
  await s.app.close();
});

test('perfil: la visita 61 en un minuto → 429', async () => {
  const s = await socialSetup(2);
  await s.doc(`members/${s.ids.B}`, { joinedAt: 1, profile: { nick: 'Nahma' } });
  await s.befriend('A', 'B');
  for (let i = 0; i < 60; i++) assert.equal((await s.call('GET', `/api/profiles/${s.ids.B}`, 'A')).statusCode, 200);
  assert.equal((await s.call('GET', `/api/profiles/${s.ids.B}`, 'A')).statusCode, 429);
  await s.app.close();
});

test('stream: la conexión 11 en un minuto → 429', async () => {
  const s = await socialSetup(2);
  await s.app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${s.app.server.address().port}`;
  const get = async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/stream`, { headers: { cookie: `__Host-odyle_at=${s.tokens.A}` }, signal: ctrl.signal });
    const status = res.status;
    ctrl.abort();
    return status;
  };
  for (let i = 0; i < 10; i++) assert.equal(await get(), 200);
  assert.equal(await get(), 429);
  await s.app.close();
});
