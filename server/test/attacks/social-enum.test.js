// SR-42: desconocido, bloqueado y "me bloqueó" dan exactamente la misma respuesta (Review Focus 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';

test('mismo código y cuerpo en perfil, amistad, aceptar y mensajes', async () => {
  const s = await socialSetup(3);
  await s.block('B', 'A');
  await s.block('A', 'C');
  const ghost = `u_${'q'.repeat(22)}`;
  const probes = [
    (u) => s.call('GET', `/api/profiles/${u}`, 'A'),
    (u) => s.call('POST', `/api/friends/${u}`, 'A'),
    (u) => s.call('POST', `/api/friends/${u}/accept`, 'A'),
    (u) => s.call('POST', `/api/messages/${u}`, 'A', { kind: 'text', text: 'hola' }),
    (u) => s.call('GET', `/api/messages/${u}`, 'A'),
  ];
  for (const probe of probes) {
    const seen = new Set();
    for (const u of [ghost, s.ids.B, s.ids.C]) {
      const r = await probe(u);
      seen.add(`${r.statusCode} ${r.body}`);
    }
    assert.equal(seen.size, 1, [...seen].join(' | '));
    assert.match([...seen][0], /^404 /);
  }
});

test('la búsqueda no revela a quien te bloqueó ni a quien bloqueaste', async () => {
  const s = await socialSetup(3);
  await s.doc(`members/${s.ids.B}`, { joinedAt: 1, profile: { nick: 'Nahma' } });
  await s.doc(`members/${s.ids.C}`, { joinedAt: 1, profile: { nick: 'Nahrun' } });
  await s.block('B', 'A'); await s.block('A', 'C');
  assert.deepEqual((await s.call('GET', '/api/profiles/search?q=nah', 'A')).json().results, []);
});
