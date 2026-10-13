// server/test/messages.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';

const say = (s, from, to, text, extra = {}) => s.call('POST', `/api/messages/${s.ids[to]}`, from, { kind: 'text', text, ...extra });

test('amigos se escriben; el texto se limpia; historial del más nuevo al más viejo', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const r = await say(s, 'A', 'B', '  hola\u202E Nahma  ');
  assert.equal(r.statusCode, 200);
  const m = r.json().message;
  assert.deepEqual({ from: m.from, to: m.to, kind: m.kind, body: m.body, readAt: m.readAt }, { from: s.ids.A, to: s.ids.B, kind: 'text', body: { text: 'hola Nahma' }, readAt: null });
  await say(s, 'B', 'A', 'buenas');
  const h = (await s.call('GET', `/api/messages/${s.ids.A}`, 'B')).json().messages;
  assert.deepEqual(h.map((x) => x.body.text), ['buenas', 'hola Nahma']);
});

test('no amigos, pendientes y bloqueados no pueden escribir: mismo 404', async () => {
  const s = await socialSetup(3);
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  await s.befriend('A', 'C'); await s.block('C', 'A');
  const bodies = new Set();
  for (const to of ['B', 'C']) { const r = await say(s, 'A', to, 'hola'); assert.equal(r.statusCode, 404); bodies.add(r.body); }
  const r = await s.call('POST', `/api/messages/u_${'z'.repeat(22)}`, 'A', { kind: 'text', text: 'hola' });
  bodies.add(r.body);
  assert.equal(bodies.size, 1);
});

test('validación: vacío, demasiado largo, tipo desconocido e invitación', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  assert.equal((await say(s, 'A', 'B', '   ')).statusCode, 400);
  assert.equal((await say(s, 'A', 'B', 'x'.repeat(1001))).statusCode, 400);
  assert.equal((await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'html', text: 'x' })).statusCode, 400);
  const inv = await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'invite', title: 'Theobomos', at: s.NOW + 3600_000, slots: 6, cost: 80 });
  assert.equal(inv.statusCode, 200);
  assert.deepEqual(inv.json().message.body, { title: 'Theobomos', at: s.NOW + 3600_000, slots: 6, cost: 80 });
  assert.equal((await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'invite', title: 'x', at: 1, slots: 13, cost: 0 })).statusCode, 400);
});

test('reintento con el mismo clientId no duplica (Review Focus 4)', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const one = (await say(s, 'A', 'B', 'hola', { clientId: 'abcdefgh1' })).json().message;
  const two = (await say(s, 'A', 'B', 'hola', { clientId: 'abcdefgh1' })).json().message;
  assert.equal(one.id, two.id);
  assert.equal((await s.call('GET', `/api/messages/${s.ids.B}`, 'A')).json().messages.length, 1);
});

test('te eliminan mientras escribes: enviar 404, historial legible (Review Focus 5)', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  await say(s, 'A', 'B', 'antes');
  await s.call('DELETE', `/api/friends/${s.ids.A}`, 'B');
  assert.equal((await say(s, 'A', 'B', 'después')).statusCode, 404);
  assert.deepEqual((await s.call('GET', `/api/messages/${s.ids.B}`, 'A')).json().messages.map((m) => m.body.text), ['antes']);
  await s.block('B', 'A');
  assert.equal((await s.call('GET', `/api/messages/${s.ids.B}`, 'A')).statusCode, 404);
});

test('paginación con before y límite de 50', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  for (let i = 0; i < 60; i++) {
    await s.db.query(`insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id) values ($1, $2, $3, $4, 'text', $5::jsonb, $6, $1)`,
      [`m${i}`, [s.ids.A, s.ids.B].sort().join('|'), s.ids.A, s.ids.B, JSON.stringify({ text: String(i) }), 1000 + i]);
  }
  const p1 = (await s.call('GET', `/api/messages/${s.ids.B}`, 'A')).json().messages;
  assert.equal(p1.length, 50); assert.equal(p1[0].body.text, '59');
  const p2 = (await s.call('GET', `/api/messages/${s.ids.B}?before=${p1[49].at}`, 'A')).json().messages;
  assert.deepEqual(p2.map((m) => m.body.text), ['9', '8', '7', '6', '5', '4', '3', '2', '1', '0']);
  assert.equal((await s.call('GET', `/api/messages/${s.ids.B}?before=abc`, 'A')).statusCode, 400);
});

test('leído, no leídos y lista de conversaciones', async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B'); await s.befriend('A', 'C');
  await s.doc(`members/${s.ids.B}`, { joinedAt: 1, profile: { nick: 'Nahma' } });
  await say(s, 'B', 'A', 'uno'); await say(s, 'B', 'A', 'dos'); await say(s, 'A', 'C', 'hola C');
  const c1 = (await s.call('GET', '/api/conversations', 'A')).json().conversations;
  const byB = c1.find((c) => c.profile.uid === s.ids.B);
  assert.equal(byB.unread, 2); assert.equal(byB.last.body.text, 'dos'); assert.equal(byB.profile.nick, 'Nahma'); assert.equal(byB.friend, true);
  assert.deepEqual((await s.call('POST', `/api/messages/${s.ids.B}/read`, 'A')).json(), { ok: true });
  assert.equal((await s.call('GET', '/api/conversations', 'A')).json().conversations.find((c) => c.profile.uid === s.ids.B).unread, 0);
});

test('eventos: message al remitente y al destinatario; read al otro', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const got = { A: [], B: [] };
  s.app.bus.subscribe(s.ids.A, (e) => got.A.push(e.type));
  s.app.bus.subscribe(s.ids.B, (e) => got.B.push(e.type));
  await say(s, 'A', 'B', 'hola');
  await s.call('POST', `/api/messages/${s.ids.A}/read`, 'B');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got.A, ['message', 'read']);
  assert.deepEqual(got.B, ['message']);
});

test('31.º mensaje en un minuto → 429', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  for (let i = 0; i < 30; i++) assert.equal((await say(s, 'A', 'B', `m${i}`)).statusCode, 200);
  assert.equal((await say(s, 'A', 'B', 'm30')).statusCode, 429);
});
