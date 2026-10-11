// Ataque: archivo de importación malicioso. La página traduce el JSON a PUT en /api/docs; el servidor debe
// aplicar las mismas reglas (SR-24..SR-26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, quickUser, as, docOf, seedBytes, cpDoc, AT } from './_lib.js';

test('personajes con XSS se guardan como texto; con __proto__, legionId, rutas raras o campos extra => rechazo', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const a = as(s, A);
  assert.equal((await a('PUT', `/api/docs/members/${A.id}/characters/imp1`, { name: '<svg onload=alert(1)>', classId: 'asesino', energy: 1 })).statusCode, 200);
  assert.equal((await docOf(s, `members/${A.id}/characters/imp1`)).name, '<svg onload=alert(1)>');
  const raw = (p, body) => s.req('PUT', `/api/docs/${p}`, { payload: body, headers: { 'content-type': 'application/json' }, cookie: `${AT}=${A.at}` });
  assert.equal((await raw(`members/${A.id}/characters/imp2`, '{"name":"x","__proto__":{"isAdmin":true}}')).statusCode, 400);
  assert.equal((await a('PUT', `/api/docs/members/${A.id}/characters/imp3`, { name: 'x', legionId: 'u_' + 'B'.repeat(22) })).statusCode, 400);
  for (const id of ['..', '..%2F..%2Flegions%2Fx', '%2e%2e', 'a%2Fb']) {
    const r = await a('PUT', `/api/docs/members/${A.id}/characters/${id}`, { name: 'x' });
    assert.equal(r.statusCode, 400, `id ${id}`);
  }
  assert.equal(({}).isAdmin, undefined);
  await s.app.close();
});

test('prefs y stats libres o gigantes => 400 (no son objetos libres en el servidor)', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const a = as(s, A);
  const bigLog = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`2026-01-${String(i).padStart(2, '0')}`, { spent: 1, tasks: 1 }]));
  for (const [p, body] of [
    ['settings/prefs', { quietStart: '22:00', anything: 'x'.repeat(1000) }],
    ['settings/prefs', { favEvents: Array.from({ length: 1000 }, () => 'e') }],
    ['settings/prefs', { lang: 'x'.repeat(10_000) }],
    ['settings/stats', { daysLog: bigLog }],
    ['settings/stats', { spentTotal: 'NaN' }],
    ['settings/stats', { daysLog: { '2026-01-01': { spent: 1, tasks: 1, html: '<b>' } } }],
  ]) {
    const r = await a('PUT', `/api/docs/members/${A.id}/${p}`, body);
    assert.ok([400, 413].includes(r.statusCode), `${p} ${JSON.stringify(body).slice(0, 60)} -> ${r.statusCode}`);
  }
  await s.app.close();
});

test('cuota: con 500 documentos propios, el 501.º => 413; con ~2 MB, otro documento grande => 413 (SR-26)', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const a = as(s, A);
  // Estado preparado directamente (500 escrituras chocarían con el límite de 300/min, que es otra defensa).
  for (let i = 0; i < 500; i++) {
    await s.db.query('insert into docs (path, parent, data, updated_at) values ($1, $2, $3::jsonb, $4)',
      [`members/${A.id}/characters/p${i}`, `members/${A.id}/characters`, JSON.stringify({ name: `P${i}` }), s.clock.t]);
  }
  const r = await a('PUT', `/api/docs/members/${A.id}/characters/extra`, { name: 'Uno más' });
  assert.equal(r.statusCode, 413, `501.º documento -> ${r.statusCode}`);
  // Por bytes: 1,99 MB ya ocupados (preparados directamente) y un documento de ~8 KB más.
  const B = await quickUser(s, 'b');
  await seedBytes(s, B.id, 1_990_000);
  const big = cpDoc(0);
  assert.ok(Buffer.byteLength(JSON.stringify(big)) > 7000);
  let status = 200; let n = 0;
  while (status === 200 && n < 40) status = (await as(s, B)('PUT', `/api/docs/members/${B.id}/cp/c${n}`, cpDoc(n++))).statusCode;
  assert.equal(status, 413, `nunca se rechazó por bytes (último ${status})`);
  const rows = (await s.db.query('select data from docs where path like $1', [`members/${B.id}/%`])).rows;
  const total = rows.reduce((t, x) => t + Buffer.byteLength(JSON.stringify(x.data)), 0);
  assert.ok(total <= 2 * 1024 * 1024, `total ${total}`);
  await s.app.close();
});
