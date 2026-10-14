// server/test/reports.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';
import { purgeOldMessages, RETENTION_MS } from '../src/lib/retention.js';

test('denunciar a un usuario y un mensaje de la conversación; nota limpiada', async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B');
  const m = (await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: 'spam!' })).json().message;
  const r = await s.call('POST', '/api/reports', 'B', { uid: s.ids.A, messageId: m.id, reason: 'spam', note: 'mucho\u202E spam' });
  assert.deepEqual(r.json(), { ok: true });
  const row = (await s.db.query('select * from reports')).rows[0];
  assert.equal(row.reporter, s.ids.B); assert.equal(row.reported, s.ids.A); assert.equal(row.message_id, m.id); assert.equal(row.note, 'mucho spam');
  assert.equal((await s.call('POST', '/api/reports', 'C', { uid: s.ids.A, messageId: m.id, reason: 'spam' })).statusCode, 404);
  assert.equal((await s.call('POST', '/api/reports', 'B', { uid: s.ids.A, reason: 'odio' })).statusCode, 400);
  assert.equal((await s.call('POST', '/api/reports', 'B', { uid: s.ids.B, reason: 'spam' })).statusCode, 404);
});

test('11.ª denuncia en una hora → 429', async () => {
  const s = await socialSetup(2);
  for (let i = 0; i < 10; i++) assert.equal((await s.call('POST', '/api/reports', 'B', { uid: s.ids.A, reason: 'other' })).statusCode, 200);
  assert.equal((await s.call('POST', '/api/reports', 'B', { uid: s.ids.A, reason: 'other' })).statusCode, 429);
});

test('retención: borra solo mensajes de más de 365 días', async () => {
  const s = await socialSetup(2);
  const ins = (id, at) => s.db.query(`insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id) values ($1, 'k', $2, $3, 'text', '{"text":"x"}'::jsonb, $4, $1)`, [id, s.ids.A, s.ids.B, at]);
  await ins('viejo', s.NOW - RETENTION_MS - 1);
  await ins('nuevo', s.NOW - RETENTION_MS + 1);
  assert.equal(await purgeOldMessages(s.db, s.NOW), 1);
  assert.deepEqual((await s.db.query('select id from messages')).rows.map((r) => r.id), ['nuevo']);
});
