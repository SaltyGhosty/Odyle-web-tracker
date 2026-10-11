import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { makeTestApp, testEnv } from './helpers.js';
import { loadConfig } from '../src/config.js';
import { createDb, migrate } from '../src/db.js';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'";

test('GET /api/health -> 200 {ok:true}', async () => {
  const { app } = await makeTestApp();
  const r = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { ok: true });
  await app.close();
});

test('cabeceras de seguridad exactas', async () => {
  const { app } = await makeTestApp();
  const h = (await app.inject({ method: 'GET', url: '/api/health' })).headers;
  assert.equal(h['content-security-policy'], CSP);
  assert.equal(h['strict-transport-security'], 'max-age=63072000; includeSubDomains');
  assert.equal(h['x-content-type-options'], 'nosniff');
  assert.equal(h['x-frame-options'], 'DENY');
  assert.equal(h['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(h['cross-origin-opener-policy'], 'same-origin');
  assert.equal(h['cross-origin-resource-policy'], 'same-origin');
  await app.close();
});

test('producción: x-forwarded-proto http -> 301 a https', async () => {
  const { app } = await makeTestApp({ NODE_ENV: 'production' });
  const r = await app.inject({ method: 'GET', url: '/api/health?a=1', headers: { 'x-forwarded-proto': 'http', host: 'odyle.test' } });
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location, 'https://odyle.test/api/health?a=1');
  const ok = await app.inject({ method: 'GET', url: '/api/health', headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(ok.statusCode, 200);
  await app.close();
});

test('POST con text/plain -> 415; JSON se acepta', async () => {
  const { app } = await makeTestApp();
  app.post('/__test/echo', async (req) => ({ got: req.body }));
  const bad = await app.inject({ method: 'POST', url: '/__test/echo', headers: { 'content-type': 'text/plain' }, payload: 'hola' });
  assert.equal(bad.statusCode, 415);
  assert.ok(typeof bad.json().error === 'string');
  const good = await app.inject({ method: 'POST', url: '/__test/echo', headers: { 'content-type': 'application/json', origin: 'https://odyle.test', 'x-odyle-csrf': '1' }, payload: '{"a":1}' });
  assert.equal(good.statusCode, 200);
  await app.close();
});

test('errores 500 sin trazas, en español', async () => {
  const { app } = await makeTestApp();
  app.get('/__test/boom', async () => { throw new Error('secreto interno en /srv/x.js'); });
  const r = await app.inject({ method: 'GET', url: '/__test/boom' });
  assert.equal(r.statusCode, 500);
  assert.deepEqual(r.json(), { error: 'Error interno del servidor.' });
  assert.ok(!r.body.includes('secreto'));
  await app.close();
});

test('cuerpo mayor de 70000 bytes -> 413', async () => {
  const { app } = await makeTestApp();
  app.post('/__test/echo', async () => ({}));
  const r = await app.inject({ method: 'POST', url: '/__test/echo', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ a: 'x'.repeat(70100) }) });
  assert.equal(r.statusCode, 413);
  await app.close();
});

test('loadConfig: variable que falta, secretos cortos y EMAIL_MODE', () => {
  assert.throws(() => loadConfig({}), { message: 'Falta la variable APP_ORIGIN' });
  const e = testEnv();
  delete e.JWT_SECRET;
  assert.throws(() => loadConfig(e), { message: 'Falta la variable JWT_SECRET' });
  assert.throws(() => loadConfig(testEnv({ JWT_SECRET: randomBytes(16).toString('base64') })), /JWT_SECRET/);
  assert.throws(() => loadConfig(testEnv({ CODE_KEY: randomBytes(31).toString('base64') })), /CODE_KEY/);
  assert.throws(() => loadConfig(testEnv({ EMAIL_MODE: 'x' })), /EMAIL_MODE/);
  const e2 = testEnv(); delete e2.EMAIL_MODE;
  assert.throws(() => loadConfig(e2), { message: 'Falta la variable EMAIL_MODE' });
});

test('loadConfig: valores devueltos', () => {
  const c = loadConfig(testEnv({ NODE_ENV: 'production', EMAIL_MODE: 'owner-only', ADMIN_USER_ID: 'u_abc' }));
  assert.equal(c.appOrigin, 'https://odyle.test');
  assert.ok(c.jwtSecret instanceof Uint8Array && c.jwtSecret.length >= 32);
  assert.ok(Buffer.isBuffer(c.codeKey) && c.codeKey.length >= 32);
  assert.equal(c.emailMode, 'owner-only');
  assert.equal(c.adminUserId, 'u_abc');
  assert.equal(c.isProd, true);
  assert.equal(loadConfig(testEnv()).adminUserId, null);
  assert.equal(loadConfig(testEnv()).isProd, false);
  const url = randomBytes(32).toString('base64url');
  assert.equal(loadConfig(testEnv({ JWT_SECRET: url })).jwtSecret.length, 32);
});

test('migrate dos veces no falla y crea las tablas', async () => {
  const db = createDb({ pgMem: true });
  await migrate(db);
  await migrate(db);
  for (const t of ['users', 'refresh_tokens', 'email_tokens', 'docs', 'legion_codes']) {
    const r = await db.query(`select count(*) as n from ${t}`);
    assert.equal(Number(r.rows[0].n), 0, t);
  }
  const v = await db.query('select version from schema_version');
  assert.equal(v.rows.length, 1);
  await db.close();
});

test('loadConfig: DATABASE_SSL', () => {
  assert.equal(loadConfig(testEnv()).databaseSsl, 'verify');
  for (const v of ['off', 'require', 'verify']) assert.equal(loadConfig(testEnv({ DATABASE_SSL: v })).databaseSsl, v);
  assert.throws(() => loadConfig(testEnv({ DATABASE_SSL: 'x' })), /DATABASE_SSL/);
});

test('redirección HTTPS ignora un Host falsificado', async () => {
  const { app, config } = await makeTestApp({ NODE_ENV: 'production' });
  const r = await app.inject({ method: 'GET', url: '/api/health?a=1', headers: { 'x-forwarded-proto': 'http', host: 'evil.example' } });
  assert.equal(r.statusCode, 301);
  assert.ok(r.headers.location.startsWith(config.appOrigin + '/'));
  assert.ok(!r.headers.location.includes('evil'));
  await app.close();
});

test('SR-33: el registro no contiene cookies, autorización ni query', async () => {
  const { Writable } = await import('node:stream');
  const { PROD_LOGGER } = await import('../src/app.js');
  let out = '';
  const stream = new Writable({ write(c, _e, cb) { out += c; cb(); } });
  const { app } = await makeTestApp({ __buildApp: { logger: { ...PROD_LOGGER, stream } } });
  await app.inject({ method: 'GET', url: '/api/health?token=secret123', headers: { cookie: 'sid=cookieval999', authorization: 'Bearer authval888' } });
  await app.close();
  assert.ok(out.includes('/api/health'), 'debe haber registro');
  for (const v of ['secret123', 'cookieval999', 'authval888', 'token=']) assert.ok(!out.includes(v), v);
});
