import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestDb } from './helpers.js';
import { newUserId } from '../src/lib/tokens.js';

test('migración 005: tablas sociales usables y únicos en vigor', async () => {
  const db = await makeTestDb();
  const a = newUserId(); const b = newUserId();
  for (const id of [a, b]) await db.query('insert into users (id, email, password_hash) values ($1, $2, $3)', [id, `${id}@x.test`, 'x']);
  const [ua, ub] = a < b ? [a, b] : [b, a];
  await db.query('insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, $3, $4, $5)', [ua, ub, 'pending', a, 1]);
  await assert.rejects(db.query('insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, $3, $4, $5)', [ua, ub, 'pending', b, 2]));
  await db.query('insert into blocks (blocker, blocked, created_at) values ($1, $2, $3)', [a, b, 1]);
  await db.query(`insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id)
                  values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`, ['m1', `${ua}|${ub}`, a, b, 'text', '{"text":"hola"}', 10, 'c1']);
  await assert.rejects(db.query(`insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id)
                  values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`, ['m2', `${ua}|${ub}`, a, b, 'text', '{"text":"x"}', 11, 'c1']));
  await db.query('insert into reports (id, reporter, reported, message_id, reason, created_at) values ($1, $2, $3, $4, $5, $6)', ['r1', b, a, 'm1', 'spam', 12]);
  const m = (await db.query('select * from messages where id = $1', ['m1'])).rows[0];
  assert.equal(m.body.text, 'hola');
  assert.equal(Number(m.created_at), 10);
  assert.equal(m.read_at, null);
});
