import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';
import { resolveEvent } from '../src/lib/social-events.js';

test('message: un bloqueo entre las partes oculta el mensaje (M1)', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const r = await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: 'hola' });
  const id = r.json().message.id;
  const q = (t, p) => s.db.query(t, p);
  assert.ok(await resolveEvent(q, s.ids.B, { type: 'message', id }));
  await s.block('B', 'A');
  assert.equal(await resolveEvent(q, s.ids.B, { type: 'message', id }), null);
  assert.equal(await resolveEvent(q, s.ids.A, { type: 'message', id }), null);
});

test('presence: informa del estado actual si hay presencia (M3)', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const q = (t, p) => s.db.query(t, p);
  const evt = { type: 'presence', id: s.ids.A, online: true };
  const off = { isOnline: () => false };
  const on = { isOnline: () => true };
  assert.deepEqual(await resolveEvent(q, s.ids.B, evt, { presence: off }), { uid: s.ids.A, online: false });
  assert.deepEqual(await resolveEvent(q, s.ids.B, { ...evt, online: false }, { presence: on }), { uid: s.ids.A, online: true });
  assert.deepEqual(await resolveEvent(q, s.ids.B, evt), { uid: s.ids.A, online: true });
});
