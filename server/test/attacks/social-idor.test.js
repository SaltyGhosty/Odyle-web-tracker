// SR-40, SR-41: nadie lee energía ni mensajes ajenos manipulando ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';

test('C no lee la conversación de A y B ni puede marcarla como leída', async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B');
  await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: 'secreto' });
  assert.equal((await s.call('GET', `/api/messages/${s.ids.A}`, 'C')).statusCode, 404);
  assert.equal((await s.call('POST', `/api/messages/${s.ids.A}/read`, 'C')).statusCode, 404);
  assert.deepEqual((await s.call('GET', '/api/conversations', 'C')).json().conversations, []);
});

test('la energía no sale por docs ni por perfil sin amistad', async () => {
  const s = await socialSetup(2);
  await s.doc(`members/${s.ids.B}/characters/c1`, { name: 'Nahma', energy: 840 });
  assert.notEqual((await s.call('GET', `/api/docs/members/${s.ids.B}/characters`, 'A')).statusCode, 200);
  assert.equal((await s.call('GET', `/api/profiles/${s.ids.B}`, 'A')).json().characters, null);
});

test('respuesta del perfil sin correo ni campos internos', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const body = (await s.call('GET', `/api/profiles/${s.ids.B}`, 'A')).body;
  assert.ok(!body.includes('@example.com'));
  assert.ok(!/password|token|hash|legionEpoch/i.test(body));
});
