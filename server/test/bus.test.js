import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBus, PgBus } from '../src/lib/bus.js';
import { REAL_PG } from './helpers.js';
import { createDb } from '../src/db.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('MemoryBus entrega solo al destinatario y respeta la baja', async () => {
  const bus = new MemoryBus();
  const got = { a: [], b: [] };
  const offA = bus.subscribe('u_a', (e) => got.a.push(e));
  bus.subscribe('u_b', (e) => got.b.push(e));
  await bus.publish('u_a', { type: 'message', id: 'm1' });
  await wait(5);
  assert.deepEqual(got.a, [{ type: 'message', id: 'm1' }]);
  assert.deepEqual(got.b, []);
  offA();
  await bus.publish('u_a', { type: 'message', id: 'm2' });
  await wait(5);
  assert.equal(got.a.length, 1);
});

test('MemoryBus: un suscriptor que lanza no rompe a los demás', async () => {
  const bus = new MemoryBus();
  const got = [];
  bus.subscribe('u_a', () => { throw new Error('boom'); });
  bus.subscribe('u_a', (e) => got.push(e.id));
  await bus.publish('u_a', { type: 'read', id: 'u_b' });
  await wait(5);
  assert.deepEqual(got, ['u_b']);
});

test('PgBus: NOTIFY llega al suscriptor (solo con Postgres real)', { skip: !REAL_PG }, async () => {
  const db = await createDb({ connectionString: process.env.TEST_DATABASE_URL, ssl: 'off' });
  const bus = new PgBus(db, { connectionString: process.env.TEST_DATABASE_URL });
  await bus.start();
  const got = [];
  bus.subscribe('u_a', (e) => got.push(e));
  await bus.publish('u_a', { type: 'presence', id: 'u_b', online: true });
  for (let i = 0; i < 50 && !got.length; i++) await wait(20);
  assert.deepEqual(got, [{ type: 'presence', id: 'u_b', online: true }]);
  await bus.close(); await db.close();
});
