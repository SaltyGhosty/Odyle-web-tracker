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

const pairIds = (s, x, y) => (s.ids[x] < s.ids[y] ? [s.ids[x], s.ids[y]] : [s.ids[y], s.ids[x]]);

test('bloqueo previo: aceptar o pedir a quien te bloqueó → 404 y sin amistad', async () => {
  const s = await socialSetup(2);
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  await s.block('B', 'A');
  assert.equal((await s.call('POST', `/api/friends/${s.ids.A}/accept`, 'B')).statusCode, 404);
  assert.equal((await s.call('POST', `/api/friends/${s.ids.B}`, 'A')).statusCode, 404);
  assert.equal((await s.db.query("select 1 from friendships where status = 'accepted'")).rows.length, 0);
});

test('bloqueo entre la comprobación y la escritura: la aceptación se deshace sin notificar', async () => {
  const s = await socialSetup(2);
  const got = []; s.app.bus.subscribe(s.ids.B, (e) => got.push(e.type));
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  await new Promise((r) => setTimeout(r, 10)); got.length = 0;
  const orig = s.db.query.bind(s.db);
  let injected = false;
  s.db.query = async (text, params) => {
    if (!injected && text.startsWith("update friendships set status = 'accepted'")) {
      injected = true;
      await orig('insert into blocks (blocker, blocked, created_at) values ($1, $2, $3)', [s.ids.A, s.ids.B, s.NOW]);
    }
    return orig(text, params);
  };
  assert.equal((await s.call('POST', `/api/friends/${s.ids.A}/accept`, 'B')).statusCode, 404);
  assert.equal((await orig('select 1 from friendships', [])).rows.length, 0);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got, []);
});

test('aceptar tras borrar la solicitud → 404 sin evento', async () => {
  const s = await socialSetup(2);
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  const got = []; s.app.bus.subscribe(s.ids.B, (e) => got.push(e.type));
  await s.call('DELETE', `/api/friends/${s.ids.B}`, 'A');
  await new Promise((r) => setTimeout(r, 10)); got.length = 0;
  assert.equal((await s.call('POST', `/api/friends/${s.ids.A}/accept`, 'B')).statusCode, 404);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got, []);
});

test('amistad obsoleta con bloqueo: no aparece en la lista', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  await s.block('B', 'A');
  const list = (await s.call('GET', '/api/friends', 'A')).json();
  assert.deepEqual(list.friends.map((x) => x.uid), []);
});

test('solicitud cruzada concurrente: el INSERT pierde contra la contraparte y se acepta', async () => {
  const s = await socialSetup(2);
  const [a, b] = pairIds(s, 'A', 'B');
  const orig = s.db.query.bind(s.db);
  let injected = false;
  s.db.query = async (text, params) => {
    if (!injected && text.startsWith('insert into friendships')) {
      injected = true;
      await orig("insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, 'pending', $3, 1)", [a, b, s.ids.B]);
    }
    return orig(text, params);
  };
  assert.deepEqual((await s.call('POST', `/api/friends/${s.ids.B}`, 'A')).json(), { status: 'friends' });
  assert.equal((await orig("select status from friendships where status = 'accepted'", [])).rows.length, 1);
});

test('aceptar con 500 amigos → 409', async () => {
  const s = await socialSetup(2);
  const { newUserId } = await import('../src/lib/tokens.js');
  for (let i = 0; i < 500; i++) {
    const u = newUserId();
    await s.db.query('insert into users (id, email, password_hash) values ($1, $2, $3)', [u, `${u}@x.test`, 'x']);
    const [a, b] = s.ids.B < u ? [s.ids.B, u] : [u, s.ids.B];
    await s.db.query("insert into friendships (user_a, user_b, status, requested_by, created_at, accepted_at) values ($1, $2, 'accepted', $3, 1, 1)", [a, b, u]);
  }
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  const r = await s.call('POST', `/api/friends/${s.ids.A}/accept`, 'B');
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.json(), { error: 'Has llegado al máximo de amigos.' });
});

test('bus.publish que falla no rompe las acciones de amistad (best-effort)', async () => {
  const s = await socialSetup(2);
  s.app.bus.publish = async () => { throw new Error('boom'); };
  assert.equal((await s.call('POST', `/api/friends/${s.ids.B}`, 'A')).statusCode, 200);
  assert.equal((await s.call('POST', `/api/friends/${s.ids.A}/accept`, 'B')).statusCode, 200);
});
