import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('./social-api.js', import.meta.url), 'utf8');

function load({ fetchImpl } = {}) {
  const calls = [], timers = [], sources = [];
  class FakeES {
    constructor(url) { this.url = url; this.listeners = {}; this.closed = false; sources.push(this); }
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
    emit(t, data) { for (const fn of this.listeners[t] || []) fn(data === undefined ? {} : { data }); }
    close() { this.closed = true; }
  }
  const ctx = {
    EventSource: FakeES,
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cleared = true; },
    encodeURIComponent, JSON, Error, Promise, Math, String,
  };
  ctx.window = ctx;
  ctx.claude = {
    __fetch: async (method, url, body) => { calls.push([method, url, body]); return fetchImpl ? fetchImpl(method, url, body) : { ok: true, status: 200, json: async () => ({}) }; },
  };
  vm.runInNewContext(SRC, ctx);
  return { api: ctx.odyleSocialApi, calls, timers, sources };
}
const flush = () => new Promise((r) => setImmediate(r));

test('connect: abre /api/stream y avisa de "live" al conectar', () => {
  const { api, sources } = load();
  const status = [];
  api.connect({ onEvent() {}, onStatus: (s, i) => status.push([s, i && i.resumed]) });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, '/api/stream');
  sources[0].emit('open');
  assert.deepEqual(status, [['live', false]]);
});

test('reconexión: espera 1, 2, 4, 8, 16, 30, 30 s; renueva la sesión antes de reabrir', async () => {
  const { api, sources, timers, calls } = load();
  const status = [];
  api.connect({ onEvent() {}, onStatus: (s) => status.push(s) });
  const waits = [];
  for (let i = 0; i < 7; i++) {
    sources.at(-1).emit('error');
    assert.equal(sources.at(-1).closed, true);
    const t = timers.at(-1);
    waits.push(t.ms);
    await t.fn();
    await flush();
  }
  assert.deepEqual(waits, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  assert.equal(sources.length, 8);
  assert.ok(calls.filter(([m, u]) => m === 'GET' && u === '/api/auth/me').length === 7);
  assert.deepEqual(status, ['reconnecting']); // un solo aviso por corte
});

test('al volver: "live" con resumed y la espera vuelve a 1 s', async () => {
  const { api, sources, timers } = load();
  const status = [];
  api.connect({ onEvent() {}, onStatus: (s, i) => status.push([s, !!(i && i.resumed)]) });
  sources[0].emit('error'); await timers.at(-1).fn(); await flush();
  sources[0].emit('open'); // la vieja ya no cuenta, pero no debe romper nada
  sources[1].emit('open');
  assert.deepEqual(status.at(-1), ['live', true]);
  sources[1].emit('error');
  assert.equal(timers.at(-1).ms, 1000);
});

test('eventos: JSON válido llega a onEvent; JSON roto se ignora; un fallo de la vista no rompe el canal', () => {
  const { api, sources } = load();
  const got = [];
  api.connect({ onEvent: (t, d) => { got.push([t, d]); if (t === 'presence') throw new Error('vista'); }, onStatus() {} });
  sources[0].emit('message', JSON.stringify({ id: 'm1' }));
  sources[0].emit('read', '{roto');
  sources[0].emit('presence', JSON.stringify({ uid: 'u', online: true }));
  sources[0].emit('friend', JSON.stringify({ uid: 'u', relation: 'friends' }));
  assert.deepEqual(got.map(([t]) => t), ['message', 'presence', 'friend']);
});

test('disconnect: cierra, cancela la espera y no reabre', async () => {
  const { api, sources, timers } = load();
  const stop = api.connect({ onEvent() {}, onStatus() {} });
  sources[0].emit('error');
  const t = timers.at(-1);
  stop();
  assert.equal(t.cleared, true);
  await t.fn();
  assert.equal(sources.length, 1);
});

test('REST: rutas, cuerpo y errores con el mensaje del servidor', async () => {
  const { api, calls } = load({
    fetchImpl: (m, u) => (u.startsWith('/api/messages/bad')
      ? { ok: false, status: 404, json: async () => ({ error: 'No encontrado.' }) }
      : { ok: true, status: 200, json: async () => ({ results: [{ uid: 'a' }], message: { id: 'm' }, conversations: [], blocked: [] }) }),
  });
  assert.deepEqual(await api.search('ana b'), [{ uid: 'a' }]);
  assert.deepEqual((await api.send('u1', { kind: 'text', text: 'hola', clientId: 'abcdefgh' })), { id: 'm' });
  await api.messages('u1', 123);
  await api.removeFriend('u1');
  assert.deepEqual(calls.map(([m, u]) => `${m} ${u}`), [
    'GET /api/profiles/search?q=ana%20b', 'POST /api/messages/u1', 'GET /api/messages/u1?before=123', 'DELETE /api/friends/u1']);
  await assert.rejects(api.messages('bad'), (e) => e.status === 404 && e.message === 'No encontrado.');
});

test('REST sin conexión: status 0 y mensaje claro', async () => {
  const { api } = load({ fetchImpl: () => { throw new Error('net'); } });
  await assert.rejects(api.friends(), (e) => e.status === 0 && /No se pudo conectar/.test(e.message));
});
