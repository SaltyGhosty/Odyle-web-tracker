// SR-44: el stream exige sesión válida y no acepta tokens por URL; con token alterado → 401.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';

test('token en la URL, token alterado y POST al stream', async (t) => {
  const s = await socialSetup(1);
  await s.app.listen({ port: 0, host: '127.0.0.1' });
  t.after(() => s.app.close());
  const base = `http://127.0.0.1:${s.app.server.address().port}`;
  assert.equal((await fetch(`${base}/api/stream?token=${s.tokens.A}`)).status, 401);
  assert.equal((await fetch(`${base}/api/stream`, { headers: { cookie: `__Host-odyle_at=${s.tokens.A.slice(0, -3)}AAA` } })).status, 401);
  const post = await fetch(`${base}/api/stream`, { method: 'POST', headers: { cookie: `__Host-odyle_at=${s.tokens.A}`, origin: 'https://evil.test' } });
  assert.ok([403, 404].includes(post.status));
});

test('un evento de un mensaje ajeno publicado a mano no llega (se relee y se filtra)', async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B');
  const m = (await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: 'secreto' })).json().message;
  const { resolveEvent } = await import('../../src/lib/social-events.js');
  assert.equal(await resolveEvent((q, p) => s.db.query(q, p), s.ids.C, { type: 'message', id: m.id }), null);
  assert.equal(await resolveEvent((q, p) => s.db.query(q, p), s.ids.C, { type: 'presence', id: s.ids.A, online: true }), null);
});
