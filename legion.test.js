import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCode, normalizeCode, hashCode, roomName, parseLegionName, parseProfile, legionOf, sameLegion, legionTitle, proofFor, pickLegion, legionKey } from './legion.js';

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
  assert.deepEqual(ok, { ok: true, value: { nick: 'Salty', server: 'Israphel', bio: 'Hola', faction: 'elyos', mainCharId: 'c1', searchable: true, shareEnergy: true } });
  assert.equal(parseProfile({ nick: 'S', faction: 'elyos' }, []).ok, false);
  assert.equal(parseProfile({ nick: 'Salty', faction: 'x' }, []).ok, false);
  assert.equal(parseProfile({ nick: 'Salty', faction: 'elyos', bio: 'x'.repeat(81) }, []).ok, false);
  assert.equal(parseProfile({ nick: 'Salty', faction: 'asmodian', mainCharId: 'zz' }, ['c1']).value.mainCharId, null);
});
test('parseProfile conserva la privacidad: visible y comparte por defecto, false explícito se respeta', () => {
  const base = { nick: 'Ana', server: '', bio: '', faction: 'elyos', mainCharId: null };
  assert.deepEqual([parseProfile(base).value.searchable, parseProfile(base).value.shareEnergy], [true, true]);
  const off = parseProfile({ ...base, searchable: false, shareEnergy: false }).value;
  assert.deepEqual([off.searchable, off.shareEnergy], [false, false]);
  const odd = parseProfile({ ...base, searchable: 'no', shareEnergy: 0 }).value;
  assert.deepEqual([odd.searchable, odd.shareEnergy], [true, true]);
});
test('legionOf: existe, misma época y no estás expulsado', () => {
  const legions = new Map([['L1', { name: 'A', epoch: 'e2', banned: ['u3'] }]]);
  assert.equal(legionOf({ legionId: 'L1', legionEpoch: 'e2' }, legions, 'u2').name, 'A');
  assert.equal(legionOf({ legionId: 'L1', legionEpoch: 'e2' }, legions, 'u3'), null);
  assert.equal(legionOf({ legionId: 'L9', legionEpoch: 'e2' }, legions, 'u2'), null);
  assert.equal(legionOf({}, legions, 'u2'), null);
  // a legion dissolved and re-created by the same leader does not take old members back
  assert.equal(legionOf({ legionId: 'L1', legionEpoch: 'e1' }, legions, 'u2'), null);
  assert.equal(legionOf({ legionId: 'L1' }, legions, 'u2'), null);
});
test('sameLegion: solo compañeros válidos de mi legión', () => {
  const legions = new Map([['L1', { name: 'A', epoch: 'x', banned: ['u4'] }], ['L2', { name: 'B', epoch: 'y', banned: [] }]]);
  const m = (id, ep) => ({ legionId: id, legionEpoch: ep });
  const members = new Map([['me', m('L1', 'x')], ['u2', m('L1', 'x')], ['u3', m('L2', 'y')], ['u4', m('L1', 'x')], ['u5', {}], ['u6', m('L1', 'old')]]);
  assert.deepEqual(sameLegion(members, 'me', legions), ['u2']);
  assert.deepEqual(sameLegion(new Map([['me', {}], ['u2', m('L1', 'x')]]), 'me', legions), []);
});
test('legionKey: id y época', () => {
  assert.equal(legionKey({ id: 'u_A', epoch: 'k1' }), 'u_A-k1');
  assert.equal(legionKey(null), null);
});
test('pickLegion: el código solo vale para la legión que lo creó (no para copias)', async () => {
  const code = 'K7Q2XM9P';
  const real = { id: 'u_leader', proof: await proofFor('u_leader', code) };
  const clone = { id: 'u_thief', proof: real.proof }; // copied fields from the public legion doc
  assert.equal((await pickLegion([clone, real], code)).id, 'u_leader');
  assert.equal(await pickLegion([clone], code), null);
  assert.equal(await pickLegion([real], 'K7Q2XM9Q'), null);
});
test('legionTitle', () => {
  assert.equal(legionTitle({ id: 'L1', name: 'Alba' }, 'u2'), '‹Alba›');
  assert.equal(legionTitle({ id: 'L1', name: 'Alba' }, 'L1'), 'Líder · ‹Alba›');
  assert.equal(legionTitle(null, 'u2'), '');
});
