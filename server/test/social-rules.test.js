import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestDb } from './helpers.js';
import { newUserId } from '../src/lib/tokens.js';
import { pairKey, relation, visible, friendIds, blockedEither, publicProfile, toPublic } from '../src/lib/social-rules.js';

async function setup() {
  const db = await makeTestDb();
  const q = (t, p) => db.query(t, p);
  const ids = {};
  for (const k of ['A', 'B', 'C']) {
    ids[k] = newUserId();
    await q('insert into users (id, email, password_hash) values ($1, $2, $3)', [ids[k], `${k}@x.test`, 'x']);
  }
  const friend = async (x, y, status, by) => {
    const [a, b] = ids[x] < ids[y] ? [ids[x], ids[y]] : [ids[y], ids[x]];
    await q('insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, $3, $4, 1)', [a, b, status, ids[by]]);
  };
  const doc = (path, data) => q('insert into docs (path, parent, data, updated_at) values ($1, $2, $3::jsonb, 1)', [path, path.slice(0, path.lastIndexOf('/')), JSON.stringify(data)]);
  return { q, ids, friend, doc };
}

test('pairKey es simétrico', () => {
  assert.equal(pairKey('u_b', 'u_a'), 'u_a|u_b');
  assert.equal(pairKey('u_a', 'u_b'), 'u_a|u_b');
});

test('relation cubre todos los estados', async () => {
  const s = await setup();
  const { A, B, C } = s.ids;
  assert.equal(await relation(s.q, A, A), 'self');
  assert.equal(await relation(s.q, A, B), 'none');
  await s.friend('A', 'B', 'pending', 'A');
  assert.equal(await relation(s.q, A, B), 'pending-out');
  assert.equal(await relation(s.q, B, A), 'pending-in');
  await s.q('update friendships set status = $1', ['accepted']);
  assert.equal(await relation(s.q, A, B), 'friends');
  await s.q('insert into blocks (blocker, blocked, created_at) values ($1, $2, 1)', [C, A]);
  assert.equal(await relation(s.q, A, C), 'blocked');
  assert.equal(await relation(s.q, C, A), 'blocked');
});

test('visible: falso para mal formado, inexistente, uno mismo y bloqueo en cualquier sentido', async () => {
  const s = await setup();
  const { A, B, C } = s.ids;
  assert.equal(await visible(s.q, A, B), true);
  assert.equal(await visible(s.q, A, A), false);
  assert.equal(await visible(s.q, A, 'u_nope'), false);
  assert.equal(await visible(s.q, A, newUserId()), false);
  await s.q('insert into blocks (blocker, blocked, created_at) values ($1, $2, 1)', [B, A]);
  assert.equal(await visible(s.q, A, B), false);
  assert.equal(await visible(s.q, B, A), false);
  assert.deepEqual([...await blockedEither(s.q, A)], [B]);
  assert.equal(await visible(s.q, A, C), true);
});

test('friendIds solo devuelve amistades aceptadas', async () => {
  const s = await setup();
  await s.friend('A', 'B', 'accepted', 'A');
  await s.friend('A', 'C', 'pending', 'A');
  assert.deepEqual(await friendIds(s.q, s.ids.A), [s.ids.B]);
});

test('publicProfile: lista blanca, legión por nombre, clase del principal y opciones por defecto', async () => {
  const s = await setup();
  const { A } = s.ids;
  await s.doc(`members/${A}`, { joinedAt: 1, legionId: A, legionEpoch: 'e', profile: { nick: 'Salty', server: 'Nezakan', faction: 'elyos', bio: 'hola', mainCharId: 'c1' } });
  await s.doc(`legions/${A}`, { name: 'Alas', epoch: 'e', banned: [], createdAt: 1, leader: A, codeHash: 'secreto' });
  await s.doc(`members/${A}/characters/c1`, { name: 'Salty', classId: 'templario', energy: 612 });
  const p = await publicProfile(s.q, A);
  assert.deepEqual(p, { uid: A, nick: 'Salty', server: 'Nezakan', faction: 'elyos', bio: 'hola', legion: 'Alas', mainClass: 'templario', searchable: true, shareEnergy: true });
  assert.deepEqual(toPublic(p), { uid: A, nick: 'Salty', server: 'Nezakan', faction: 'elyos', bio: 'hola', legion: 'Alas', mainClass: 'templario' });
  const empty = await publicProfile(s.q, s.ids.B);
  assert.deepEqual(empty, { uid: s.ids.B, nick: '', server: '', faction: null, bio: '', legion: null, mainClass: null, searchable: true, shareEnergy: true });
});

test('publicProfile: la legión respeta época y expulsiones (igual que legionOf)', async () => {
  const s = await setup();
  const { A, B, C } = s.ids;
  // época distinta: la legión se disolvió y se recreó, el miembro pertenece a la anterior
  await s.doc(`members/${A}`, { joinedAt: 1, legionId: A, legionEpoch: 'old', profile: { nick: 'Salty' } });
  await s.doc(`legions/${A}`, { name: 'Alas', epoch: 'new', banned: [], createdAt: 1, leader: A });
  assert.equal((await publicProfile(s.q, A)).legion, null);
  // expulsado: su uid está en banned
  await s.doc(`members/${B}`, { joinedAt: 1, legionId: A, legionEpoch: 'new', profile: { nick: 'Bea' } });
  await s.q('update docs set data = $2::jsonb where path = $1', [`legions/${A}`, JSON.stringify({ name: 'Alas', epoch: 'new', banned: [B], createdAt: 1, leader: A })]);
  assert.equal((await publicProfile(s.q, B)).legion, null);
  // legionId colgante: la legión no existe
  await s.doc(`members/${C}`, { joinedAt: 1, legionId: 'u_gone', legionEpoch: 'e', profile: { nick: 'Cy' } });
  assert.equal((await publicProfile(s.q, C)).legion, null);
});
