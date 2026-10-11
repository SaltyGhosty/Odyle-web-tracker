import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCode, normalizeCode, hashCode, roomName, parseLegionName, parseProfile, legionOf, sameLegion, legionTitle } from './legion.js';

test('makeCode: 8 caracteres sin letras confusas', () => {
  const seq = [0, 0.5, 0.99, 0.1, 0.2, 0.3, 0.4, 0.6];
  let i = 0;
  const c = makeCode(() => seq[i++ % seq.length]);
  assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(c[0], 'A');
  for (let k = 0; k < 50; k++) assert.doesNotMatch(makeCode(), /[IOL01]/);
});
test('normalizeCode: acepta minúsculas, espacios y guiones', () => {
  assert.equal(normalizeCode(' k7q2-xm9p '), 'K7Q2XM9P');
  assert.equal(normalizeCode('K7Q2 XM9P'), 'K7Q2XM9P');
  assert.equal(normalizeCode('K7Q2XM'), null);
  assert.equal(normalizeCode('K7Q2XM9O'), null); // O no existe en el alfabeto
  assert.equal(normalizeCode(''), null);
});
test('hashCode: estable, distinto por código, sin el código en claro', async () => {
  const a = await hashCode('K7Q2XM9P'), b = await hashCode('K7Q2XM9P'), c = await hashCode('K7Q2XM9Q');
  assert.equal(a, b); assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});
test('roomName: válido para salas y distinto por legión', async () => {
  const r = await roomName('u_6bkB4WTru3rOkPlUWHQWKQ');
  assert.match(r, /^lg-[0-9a-f]{16}$/);
  assert.notEqual(r, await roomName('u_other'));
});
test('parseLegionName', () => {
  assert.deepEqual(parseLegionName('  Guardianes del Alba '), { ok: true, value: 'Guardianes del Alba' });
  assert.equal(parseLegionName('ab').ok, false);
  assert.equal(parseLegionName('x'.repeat(25)).ok, false);
});
test('parseProfile: válido y errores', () => {
  const ok = parseProfile({ nick: ' Salty ', server: 'Israphel', bio: 'Hola', faction: 'elyos', mainCharId: 'c1' }, ['c1', 'c2']);
  assert.deepEqual(ok, { ok: true, value: { nick: 'Salty', server: 'Israphel', bio: 'Hola', faction: 'elyos', mainCharId: 'c1' } });
  assert.equal(parseProfile({ nick: 'S', faction: 'elyos' }, []).ok, false);
  assert.equal(parseProfile({ nick: 'Salty', faction: 'x' }, []).ok, false);
  assert.equal(parseProfile({ nick: 'Salty', faction: 'elyos', bio: 'x'.repeat(81) }, []).ok, false);
  assert.equal(parseProfile({ nick: 'Salty', faction: 'asmodian', mainCharId: 'zz' }, ['c1']).value.mainCharId, null);
});
test('legionOf: existe y no estás expulsado', () => {
  const legions = new Map([['L1', { name: 'A', banned: ['u3'] }]]);
  assert.equal(legionOf({ legionId: 'L1' }, legions, 'u2').name, 'A');
  assert.equal(legionOf({ legionId: 'L1' }, legions, 'u3'), null);
  assert.equal(legionOf({ legionId: 'L9' }, legions, 'u2'), null);
  assert.equal(legionOf({}, legions, 'u2'), null);
});
test('sameLegion: solo compañeros válidos de mi legión', () => {
  const legions = new Map([['L1', { name: 'A', banned: ['u4'] }], ['L2', { name: 'B', banned: [] }]]);
  const members = new Map([['me', { legionId: 'L1' }], ['u2', { legionId: 'L1' }], ['u3', { legionId: 'L2' }], ['u4', { legionId: 'L1' }], ['u5', {}]]);
  assert.deepEqual(sameLegion(members, 'me', legions), ['u2']);
  assert.deepEqual(sameLegion(new Map([['me', {}], ['u2', { legionId: 'L1' }]]), 'me', legions), []);
});
test('legionTitle', () => {
  assert.equal(legionTitle({ id: 'L1', name: 'Alba' }, 'u2'), '‹Alba›');
  assert.equal(legionTitle({ id: 'L1', name: 'Alba' }, 'L1'), 'Líder · ‹Alba›');
  assert.equal(legionTitle(null, 'u2'), '');
});
