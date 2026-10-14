import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';

async function withProfiles() {
  const s = await socialSetup(4);
  const { A, B, C, D } = s.ids;
  await s.doc(`members/${A}`, { joinedAt: 1, profile: { nick: 'Salty', server: 'Nezakan', faction: 'elyos' } });
  await s.doc(`members/${B}`, { joinedAt: 1, profile: { nick: 'Nahma', server: 'Nezakan', faction: 'elyos', mainCharId: 'n1' } });
  await s.doc(`members/${B}/characters/n1`, { name: 'Nahma', classId: 'clerigo', energy: 840, recordedAt: 5, notes: 'privado' });
  await s.doc(`members/${C}`, { joinedAt: 1, profile: { nick: 'Nahmira', searchable: false } });
  await s.doc(`members/${D}`, { joinedAt: 1, profile: { nick: 'Nahrun' } });
  return s;
}

test('búsqueda por prefijo sin distinguir mayúsculas; excluye no buscables, bloqueados y a uno mismo', async () => {
  const s = await withProfiles();
  await s.block('D', 'A');
  const r = await s.call('GET', '/api/profiles/search?q=nah', 'A');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().results.map((x) => x.nick), ['Nahma']);
  assert.equal(r.json().results[0].relation, 'none');
  assert.equal('searchable' in r.json().results[0], false);
  assert.equal((await s.call('GET', '/api/profiles/search?q=salty', 'A')).json().results.length, 0);
});

test('búsqueda: q de 1 o de más de 20 caracteres → 400; comodines SQL no amplían', async () => {
  const s = await withProfiles();
  assert.equal((await s.call('GET', '/api/profiles/search?q=n', 'A')).statusCode, 400);
  assert.equal((await s.call('GET', `/api/profiles/search?q=${'n'.repeat(21)}`, 'A')).statusCode, 400);
  assert.equal((await s.call('GET', '/api/profiles/search?q=%25%25', 'A')).statusCode, 400);
  assert.deepEqual((await s.call('GET', '/api/profiles/search?q=n_h', 'A')).json().results, []);
});

test('perfil: energía solo para amigos con shareEnergy y sin campos privados', async () => {
  const s = await withProfiles();
  const { B } = s.ids;
  const stranger = (await s.call('GET', `/api/profiles/${B}`, 'A')).json();
  assert.equal(stranger.relation, 'none');
  assert.equal(stranger.characters, null);
  assert.equal(stranger.profile.mainClass, 'clerigo');
  await s.befriend('A', 'B');
  const friend = (await s.call('GET', `/api/profiles/${B}`, 'A')).json();
  assert.equal(friend.relation, 'friends');
  assert.deepEqual(friend.characters, [{ name: 'Nahma', classId: 'clerigo', energy: 840, recordedAt: 5 }]);
  await s.doc(`members/${B}/characters/n2`, { name: 'Norm', classId: 'clerigo', energy: 10, recordedAt: 6, account: 'normal' });
  const two = (await s.call('GET', `/api/profiles/${B}`, 'A')).json().characters;
  assert.equal('account' in two[0], false);
  assert.equal(two[1].account, 'normal');
  await s.db.query('update docs set data = $1::jsonb where path = $2', [JSON.stringify({ joinedAt: 1, profile: { nick: 'Nahma', mainCharId: 'n1', shareEnergy: false } }), `members/${B}`]);
  assert.equal((await s.call('GET', `/api/profiles/${B}`, 'A')).json().characters, null);
});

test('perfil: desconocido, mal formado, propio y bloqueado → mismo 404', async () => {
  const s = await withProfiles();
  await s.block('B', 'A');
  const bodies = [];
  for (const uid of ['u_' + 'z'.repeat(22), 'basura', s.ids.A, s.ids.B]) {
    const r = await s.call('GET', `/api/profiles/${uid}`, 'A');
    assert.equal(r.statusCode, 404);
    bodies.push(r.body);
  }
  assert.equal(new Set(bodies).size, 1);
});

test('búsqueda: 31.ª en un minuto → 429', async () => {
  const s = await withProfiles();
  for (let i = 0; i < 30; i++) assert.equal((await s.call('GET', '/api/profiles/search?q=na', 'A')).statusCode, 200);
  assert.equal((await s.call('GET', '/api/profiles/search?q=na', 'A')).statusCode, 429);
});

test('búsqueda: nicks con _ o % se encuentran y los comodines no amplían (M4)', async () => {
  const s = await withProfiles();
  await s.doc(`members/${s.ids.E || 'u_extra_dk'}`, { joinedAt: 1, profile: { nick: 'Dark_Knight' } });
  await s.doc('members/u_extra_dx', { joinedAt: 1, profile: { nick: 'DarkXKnight' } });
  const r = (await s.call('GET', '/api/profiles/search?q=dark_k', 'A')).json().results;
  assert.deepEqual(r.map((x) => x.nick), ['Dark_Knight']);
  assert.equal((await s.call('GET', '/api/profiles/search?q=%25%25', 'A')).statusCode, 400);
  assert.equal((await s.call('GET', '/api/profiles/search?q=__', 'A')).statusCode, 400);
});
