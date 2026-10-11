// Ataque: provocar errores para leer trazas, SQL o rutas internas (SR-33).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, quickUser, as, freshIp, AT } from './_lib.js';

const LEAK = /at\s+\S+\s+\(|\/home\/|node_modules|\.js:\d+|stack|select\s|insert\s|update\s|relation\s"|syntax error|duplicate key|pg-mem|postgres|SQLSTATE|TypeError|ReferenceError|Unexpected token|in JSON at position/i;

function assertClean(r, label) {
  assert.match(String(r.headers['content-type']), /^application\/json/, `${label}: JSON`);
  const body = r.json();
  assert.deepEqual(Object.keys(body), ['error'], `${label}: solo {error}`);
  assert.ok(!LEAK.test(r.body), `${label}: filtra detalles internos: ${r.body}`);
}

test('JSON roto, tipos erróneos y valores extremos => 4xx con {error} en español, sin trazas', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const raw = (method, url, payload, ck) => s.req(method, url, { payload, headers: { 'content-type': 'application/json' }, cookie: ck, ip: freshIp() });
  const cases = [
    ['POST', '/api/auth/login', '{"email":'],
    ['POST', '/api/auth/login', '{"email":"a@b.cc","password":12345678901}'],
    ['POST', '/api/auth/login', '{"email":{"$gt":""},"password":["x"]}'],
    ['POST', '/api/auth/register', '{"email":"a@b.cc","password":{"length":20}}'],
    ['POST', '/api/auth/register', '[]'],
    ['POST', '/api/auth/register', 'null'],
    ['POST', '/api/auth/register', '"texto"'],
    ['POST', '/api/auth/verify', '{"token":["a"]}'],
    ['POST', '/api/auth/reset', '{"token":123,"password":"x"}'],
    ['POST', '/api/auth/login', '\u0000'],
    ['PUT', `/api/docs/members/${A.id}`, '{"profile":', `${AT}=${A.at}`],
    ['PUT', `/api/docs/members/${A.id}`, '[1,2,3]', `${AT}=${A.at}`],
    ['PUT', `/api/docs/members/${A.id}`, '{"joinedAt":1e999}', `${AT}=${A.at}`],
    ['PATCH', `/api/docs/members/${A.id}`, '{"profile":{"nick":"x"}}', `${AT}=${A.at}`],
    ['POST', '/api/legions/join', '{"code":{"toUpperCase":1}}', `${AT}=${A.at}`],
    ['POST', '/api/legions/mine/kick', '{"uid":{"$ne":null}}', `${AT}=${A.at}`],
  ];
  for (const [method, url, payload, ck] of cases) {
    const r = await raw(method, url, payload, ck);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, `${method} ${url} ${payload} -> ${r.statusCode} ${r.body}`);
    assertClean(r, `${method} ${url} ${payload}`);
  }
  await s.app.close();
});

test('fallo forzado de la base (consulta que lanza con SQL y datos en el mensaje) => 500 {error} genérico, sin SQL ni traza', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const q = s.db.query; const tx = s.db.tx;
  const boom = async () => { const e = new Error('syntax error at or near "select * from users where email = \'ana@example.com\'"'); e.code = '42601'; e.detail = 'password_hash=$argon2id$...'; throw e; };
  s.db.query = boom;
  s.db.tx = boom;
  const reqs = [
    ['POST', '/api/auth/login', { email: 'ana@example.com', password: 'x'.repeat(12) }],
    ['POST', '/api/auth/register', { email: 'ana@example.com', password: 'contrasena-larga-1' }],
    ['GET', '/api/auth/me'],
    ['GET', `/api/docs/members/${A.id}`],
    ['PUT', `/api/docs/members/${A.id}`, { profile: { nick: 'x' } }],
    ['POST', '/api/legions', { name: 'Los Albores' }],
  ];
  for (const [method, url, payload] of reqs) {
    const r = await as(s, A)(method, url, payload, { ip: freshIp() });
    assert.equal(r.statusCode, 500, `${method} ${url} -> ${r.statusCode}`);
    assertClean(r, `${method} ${url}`);
  }
  s.db.query = q; s.db.tx = tx;
  await s.app.close();
});

test('rutas inexistentes y métodos no admitidos: 404 JSON sin listar rutas', async () => {
  const s = await setup();
  for (const [method, url] of [['GET', '/api/admin'], ['DELETE', '/api/auth/me'], ['PUT', '/api/legions/join'], ['GET', '/api/docs'], ['TRACE', '/']]) {
    const r = await s.req(method, url, { payload: method === 'GET' || method === 'TRACE' ? undefined : {} });
    assert.ok([400, 403, 404, 405].includes(r.statusCode), `${method} ${url} -> ${r.statusCode}`);
    assert.ok(!LEAK.test(r.body) && !/Route .* not found/i.test(r.body), `${method} ${url}: ${r.body}`);
  }
  await s.app.close();
});
