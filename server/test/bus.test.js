import { test } from 'node:test';
import { EventEmitter } from 'node:events';
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

// Pruebas sin Postgres: un cliente falso que emula connect/query/end y cuenta instancias.
class FakeClient extends EventEmitter {
  static instances = [];
  constructor(opts) {
    super();
    this.opts = opts;
    this.ended = false;
    FakeClient.instances.push(this);
  }
  async connect() {}
  async query() {}
  async end() { this.ended = true; }
}
const resetFake = () => { FakeClient.instances = []; };

test('PgBus: tras un error el cliente se cierra y se crea UNO nuevo tras el retardo', async () => {
  resetFake();
  const bus = new PgBus({ query: async () => ({}) }, {}, { Client: FakeClient, retryMs: 5 });
  await bus.start();
  assert.equal(FakeClient.instances.length, 1);
  assert.equal(FakeClient.instances[0].opts.keepAlive, true);
  FakeClient.instances[0].emit('error', new Error('caída'));
  assert.equal(FakeClient.instances[0].ended, true);
  await wait(30);
  assert.equal(FakeClient.instances.length, 2);
  await bus.close();
});

test('PgBus: dos errores seguidos producen un solo cliente nuevo', async () => {
  resetFake();
  const bus = new PgBus({ query: async () => ({}) }, {}, { Client: FakeClient, retryMs: 5 });
  await bus.start();
  const first = FakeClient.instances[0];
  first.emit('error', new Error('a'));
  first.emit('error', new Error('b'));
  await wait(30);
  assert.equal(FakeClient.instances.length, 2);
  await bus.close();
});

test('PgBus: close() durante el reintento pendiente no crea clientes', async () => {
  resetFake();
  const bus = new PgBus({ query: async () => ({}) }, {}, { Client: FakeClient, retryMs: 5 });
  await bus.start();
  FakeClient.instances[0].emit('error', new Error('caída'));
  await bus.close();
  await wait(30);
  assert.equal(FakeClient.instances.length, 1);
});

test('PgBus: una notificación de un cliente reemplazado se ignora', async () => {
  resetFake();
  const bus = new PgBus({ query: async () => ({}) }, {}, { Client: FakeClient, retryMs: 5 });
  await bus.start();
  const old = FakeClient.instances[0];
  const got = [];
  bus.subscribe('u_a', (e) => got.push(e));
  old.emit('error', new Error('caída'));
  await wait(30);
  const fresh = FakeClient.instances[1];
  const payload = JSON.stringify({ to: 'u_a', type: 'read', id: 'u_b' });
  old.emit('notification', { payload });
  assert.deepEqual(got, []);
  fresh.emit('notification', { payload });
  await wait(5);
  assert.deepEqual(got, [{ type: 'read', id: 'u_b' }]);
  await bus.close();
});

test('PgBus: publish solo envía los campos del contrato de evento', async () => {
  const sent = [];
  const db = { query: async (sql, params) => { sent.push(params); return {}; } };
  const bus = new PgBus(db, {}, { Client: FakeClient, retryMs: 5 });
  await bus.publish('u_a', { type: 'presence', id: 'u_b', online: true, extra: 'x', secret: 'y' });
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(sent[0][1]), { to: 'u_a', type: 'presence', id: 'u_b', online: true });
});

test('PgBus: keepAlive con retardo inicial y sonda que detecta un LISTEN muerto', async () => {
  resetFake();
  const bus = new PgBus({ query: async () => ({}) }, {}, { Client: FakeClient, retryMs: 5, probeMs: 20, probeTimeoutMs: 20 });
  await bus.start();
  const first = FakeClient.instances[0];
  assert.equal(first.opts.keepAliveInitialDelayMillis, 10_000);
  first.query = () => new Promise(() => {}); // nunca responde
  await wait(120);
  assert.equal(first.ended, true);
  assert.equal(FakeClient.instances.length, 2);
  await bus.close();
});

test('PgBus: close() detiene la sonda', async () => {
  resetFake();
  let probes = 0;
  const bus = new PgBus({ query: async () => ({}) }, {}, { Client: FakeClient, retryMs: 5, probeMs: 10, probeTimeoutMs: 10 });
  await bus.start();
  const c = FakeClient.instances[0];
  c.query = async (sql) => { if (/select 1/i.test(sql)) probes++; };
  await wait(40);
  assert.ok(probes > 0);
  await bus.close();
  const n = probes;
  await wait(50);
  assert.equal(probes, n);
  assert.equal(FakeClient.instances.length, 1);
});
