// Ataque: fuerza bruta y relleno de credenciales; esquivar límites falseando X-Forwarded-For (SR-15, SR-17, SR-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, apiUser, quickUser, as, legionWith, freshIp, captureLogger, PW } from './_lib.js';

const PROXY = '10.200.0.1'; // el balanceador de Render: el par inmediato
// El proxy añade la IP real del cliente al final; el atacante controla todo lo que va antes.
const viaProxy = (realIp, spoof) => ({ ip: PROXY, headers: { 'x-forwarded-for': spoof ? `${spoof}, ${realIp}` : realIp } });
const rnd = () => `${1 + Math.floor(Math.random() * 223)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${1 + Math.floor(Math.random() * 254)}`;

test('login: 6.º intento por IP+correo en un minuto => 429, aunque cada intento falsee X-Forwarded-For', async () => {
  const s = await setup();
  await apiUser(s, 'ana@example.com');
  const codes = [];
  for (let i = 0; i < 7; i++) {
    const r = await s.req('POST', '/api/auth/login', { payload: { email: 'ana@example.com', password: `mala-${i}-contrasena` }, ...viaProxy('203.0.113.7', `${rnd()}, ${rnd()}`) });
    codes.push(r.statusCode);
  }
  assert.deepEqual(codes.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.equal(codes[5], 429, `6.º intento: ${codes[5]}`);
  // La IP real distinta (otro cliente) no queda bloqueada por el atacante.
  const other = await s.req('POST', '/api/auth/login', { payload: { email: 'ana@example.com', password: PW }, ...viaProxy('198.51.100.9') });
  assert.equal(other.statusCode, 200);
  await s.app.close();
});

test('login: 31.º intento por IP en una hora (correos distintos) => 429; XFF variable no lo evita', async () => {
  const s = await setup();
  let last;
  for (let i = 0; i < 31; i++) {
    last = await s.req('POST', '/api/auth/login', { payload: { email: `x${i}@example.com`, password: 'mala-contrasena-1' }, ...viaProxy('203.0.113.8', rnd()) });
    if (i < 30) assert.equal(last.statusCode, 401, `intento ${i + 1}: ${last.statusCode}`);
  }
  assert.equal(last.statusCode, 429);
  await s.app.close();
});

test('registro 5/h por IP, forgot 3/h por correo y 10/h por IP: 429 al superarlos, con XFF falseado', async () => {
  const s = await setup();
  const reg = [];
  for (let i = 0; i < 6; i++) reg.push((await s.req('POST', '/api/auth/register', { payload: { email: `r${i}@example.com`, password: PW }, ...viaProxy('203.0.113.9', rnd()) })).statusCode);
  assert.deepEqual(reg, [202, 202, 202, 202, 202, 429]);
  const perEmail = [];
  for (let i = 0; i < 4; i++) perEmail.push((await s.req('POST', '/api/auth/forgot', { payload: { email: 'objetivo@example.com' }, ...viaProxy(rnd()) })).statusCode);
  assert.deepEqual(perEmail, [202, 202, 202, 429], 'forgot por correo (bombardeo del buzón de la víctima)');
  const perIp = [];
  for (let i = 0; i < 11; i++) perIp.push((await s.req('POST', '/api/auth/forgot', { payload: { email: `f${i}@example.com` }, ...viaProxy('203.0.113.10', rnd()) })).statusCode);
  assert.equal(perIp[10], 429);
  assert.ok(perIp.slice(0, 10).every((c) => c === 202));
  await s.app.close();
});

test('join de legión: 31.º intento por IP en una hora (usuarios distintos) => 429 (SR-17)', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider');
  await legionWith(s, L, []);
  let last;
  for (let i = 0; i < 31; i++) {
    const u = await quickUser(s, `j${i}`);
    last = await as(s, u)('POST', '/api/legions/join', { code: 'ABCDEFGH' }, viaProxy('203.0.113.11', rnd()));
    if (i < 30) assert.equal(last.statusCode, 400, `intento ${i + 1}: ${last.statusCode}`);
  }
  assert.equal(last.statusCode, 429);
  await s.app.close();
});

test('bloqueo: 10 fallos desde IPs distintas => 15 min de bloqueo incluso con la contraseña buena; se registra sin datos personales', async () => {
  const cap = captureLogger();
  const s = await setup({ __buildApp: { logger: cap.logger } });
  await apiUser(s, 'ana@example.com');
  for (let i = 0; i < 10; i++) {
    const r = await s.req('POST', '/api/auth/login', { payload: { email: 'ana@example.com', password: `mala-${i}-contrasena` }, ip: freshIp() });
    assert.equal(r.statusCode, 401);
  }
  assert.equal((await s.req('POST', '/api/auth/login', { payload: { email: 'ana@example.com', password: PW }, ip: freshIp() })).statusCode, 429);
  s.clock.t += 14 * 60_000;
  assert.equal((await s.req('POST', '/api/auth/login', { payload: { email: 'ANA@example.com ', password: PW }, ip: freshIp() })).statusCode, 429, 'variante de mayúsculas/espacios');
  s.clock.t += 61_000;
  assert.equal((await s.req('POST', '/api/auth/login', { payload: { email: 'ana@example.com', password: PW }, ip: freshIp() })).statusCode, 200);
  const log = cap.text();
  assert.match(log, /bloquead/i, 'se registra el bloqueo');
  assert.ok(!log.includes('ana@example.com') && !log.toLowerCase().includes('ana%40'), 'sin el correo en el registro');
  await s.app.close();
});
