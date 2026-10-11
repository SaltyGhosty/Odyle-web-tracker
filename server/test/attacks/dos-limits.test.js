// Ataque: denegación de servicio con cuerpos enormes, JSON profundo, consultas caras, argon2 en masa y NUL (SR-22, SR-26, SR-27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setup, apiUser, quickUser, as, freshIp, AT, PW } from './_lib.js';

test('cuentas: cuerpo > 8 KB => 413 en login, register, forgot, reset, verify y refresh (SR-26)', async () => {
  const s = await setup();
  const pad = 'x'.repeat(9 * 1024);
  const problems = [];
  for (const [url, body] of [
    ['/api/auth/login', { email: 'a@example.com', password: 'p', pad }],
    ['/api/auth/register', { email: 'a@example.com', password: PW, pad }],
    ['/api/auth/forgot', { email: 'a@example.com', pad }],
    ['/api/auth/reset', { token: 'x'.repeat(43), password: PW, pad }],
    ['/api/auth/verify', { token: 'x'.repeat(43), pad }],
    ['/api/auth/refresh', { pad }],
  ]) {
    const r = await s.req('POST', url, { payload: body, ip: freshIp() });
    if (r.statusCode !== 413) problems.push(`${url} con 9 KB -> ${r.statusCode}`);
  }
  assert.deepEqual(problems, []);
  await s.app.close();
});

test('legiones: cuerpo > 8 KB => 413 (las acciones solo reciben un nombre, un código o un uid)', async () => {
  const s = await setup();
  const L = await quickUser(s, 'l');
  const r = await as(s, L)('POST', '/api/legions', { name: 'Los Albores', pad: 'x'.repeat(60_000) });
  assert.equal(r.statusCode, 413, `POST /api/legions con 60 KB -> ${r.statusCode}`);
  await s.app.close();
});

test('documentos: > 64 KB => 413; profundidad 9 => 400; 501 claves => 400; profundidad 2000 sin 500', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const a = as(s, A);
  const base = `/api/docs/members/${A.id}`;
  assert.equal((await a('PUT', base, { rank: { achievements: { x: 'y'.repeat(66_000) } } })).statusCode, 413);
  let deep = 1; for (let i = 0; i < 9; i++) deep = { d: deep };
  assert.equal((await a('PUT', base, { rank: { achievements: deep } })).statusCode, 400, 'profundidad');
  const many = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k${i}`, 1]));
  assert.equal((await a('PUT', base, { rank: { achievements: many } })).statusCode, 400, 'claves');
  const veryDeep = '{"rank":{"achievements":' + '['.repeat(2000) + ']'.repeat(2000) + '}}';
  const r = await s.req('PUT', base, { payload: veryDeep, headers: { 'content-type': 'application/json' }, cookie: `${AT}=${A.at}` });
  assert.ok(r.statusCode >= 400 && r.statusCode < 500, `profundidad 2000 -> ${r.statusCode}`);
  await s.app.close();
});

test('consultas: limit=10000, limit=0, campo where/orderBy fuera de lista, operadores raros, parámetros desconocidos => 400', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const a = as(s, A);
  const col = `/api/docs/members/${A.id}/events`;
  for (const q of ['limit=10000', 'limit=0', 'limit=-1', 'limit=1e3', 'limit=200&limit=1', 'where=name,==,x', 'where=data,>,0',
    "where=at,==,1'%20or%20'1'='1", 'where=at,LIKE,1', 'where=at,in,1', 'orderBy=name', 'orderBy=at,sideways', 'orderBy=at;drop table docs',
    'where=at,>,1&where=at,<,2&where=at,>,3', 'select=*', 'offset=10', 'where=at,>,NaN', 'where=at,>,Infinity']) {
    const r = await a('GET', `${col}?${q}`);
    assert.equal(r.statusCode, 400, `?${q} -> ${r.statusCode}`);
  }
  assert.equal((await s.db.query("select count(*)::int as n from docs")).rows.length, 1, 'la tabla sigue ahí');
  await s.app.close();
});

test('NUL y caracteres inválidos en campos de cuentas => 4xx, nunca 500 (Postgres rechaza \\u0000)', async () => {
  const s = await setup();
  await apiUser(s, 'ana@example.com');
  const problems = [];
  for (const [url, body] of [
    ['/api/auth/register', { email: 'a\u0000b@example.com', password: PW }],
    ['/api/auth/login', { email: 'ana\u0000@example.com', password: PW }],
    ['/api/auth/forgot', { email: 'ana@exam\u0000ple.com' }],
    ['/api/auth/register', { email: 'x@example.com', password: `${PW}\u0000` }],
    ['/api/auth/login', { email: 'ana@example.com', password: `${PW}\u0000` }],
    ['/api/auth/reset', { token: `${'x'.repeat(42)}\u0000`, password: PW }],
    ['/api/auth/verify', { token: `${'x'.repeat(42)}\u0000` }],
  ]) {
    const r = await s.req('POST', url, { payload: body, ip: freshIp() });
    if (r.statusCode >= 500) problems.push(`${url} ${JSON.stringify(body).slice(0, 50)} -> ${r.statusCode}`);
  }
  const L = await quickUser(s, 'l');
  for (const [method, url, body] of [['POST', '/api/legions', { name: 'Los\u0000Albores' }], ['POST', '/api/legions/join', { code: 'ABCD\u0000EFG' }]]) {
    const r = await as(s, L)(method, url, body, { ip: freshIp() });
    if (r.statusCode >= 500) problems.push(`${url} -> ${r.statusCode}`);
  }
  assert.deepEqual(problems, []);
  await s.app.close();
});

test('argon2 en masa: con la cola llena, cada login espera ≤ 2 s o recibe 503 (SR-22)', async () => {
  const s = await setup();
  await apiUser(s, 'ana@example.com');
  // Mide un login para dimensionar una ráfaga que tarde > 3 s en vaciarse con 4 cálculos a la vez.
  const t0 = performance.now();
  await s.req('POST', '/api/auth/login', { payload: { email: 'ana@example.com', password: 'mala-contrasena-0' }, ip: freshIp() });
  const one = Math.max(5, performance.now() - t0);
  const n = Math.min(400, Math.ceil((3500 / one) * 4) + 8);
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: n }, (_, i) => s.req('POST', '/api/auth/login', {
    payload: { email: `ataque${i}@example.com`, password: 'mala-contrasena-1' }, ip: freshIp(),
  }).then((r) => ({ status: r.statusCode, ms: performance.now() - started }))));
  const slow = results.filter((r) => r.status !== 503 && r.ms > 2000 + 4 * one);
  assert.equal(slow.length, 0, `${n} logins (1 tarda ${one.toFixed(0)} ms): ${slow.length} esperaron más de 2 s sin 503 (máx ${Math.max(...results.map((r) => r.ms)).toFixed(0)} ms)`);
  await s.app.close();
});
