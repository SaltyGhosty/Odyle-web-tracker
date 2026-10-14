// SR-48: borrar la cuenta borra amistades, bloqueos, mensajes y denuncias propias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';
import { REAL_PG } from '../helpers.js';

test('cascada al borrar un usuario', { skip: !REAL_PG && 'pg-mem no aplica ON DELETE CASCADE de forma fiable; corre con scripts/test-pg.sh' }, async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B'); await s.block('A', 'C');
  await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: 'hola' });
  await s.call('POST', '/api/reports', 'A', { uid: s.ids.C, reason: 'spam' });
  await s.db.query('delete from users where id = $1', [s.ids.A]);
  for (const t of ['friendships', 'blocks', 'messages', 'reports']) {
    assert.equal((await s.db.query(`select count(*)::int as n from ${t}`)).rows[0].n, 0, t);
  }
});
