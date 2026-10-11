// Ataque: CSRF desde otra web (formularios, fetch sin cabecera, login CSRF, logout forzado) (SR-12, SR-13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, apiUser, quickUser, legionWith, ORIGIN, AT, RT, PW } from './_lib.js';

const BAD_HEADERS = {
  'sin Origin ni cabecera': {},
  'sin Origin, con cabecera': { 'x-odyle-csrf': '1' },
  'Origin ajeno + cabecera': { origin: 'https://evil.example', 'x-odyle-csrf': '1' },
  'Origin null + cabecera': { origin: 'null', 'x-odyle-csrf': '1' },
  'Origin http (sin TLS) + cabecera': { origin: 'http://odyle.test', 'x-odyle-csrf': '1' },
  'Origin subdominio + cabecera': { origin: 'https://evil.odyle.test', 'x-odyle-csrf': '1' },
  'Origin con sufijo + cabecera': { origin: 'https://odyle.test.evil.example', 'x-odyle-csrf': '1' },
  'Origin con barra final + cabecera': { origin: 'https://odyle.test/', 'x-odyle-csrf': '1' },
  'Origin correcto sin cabecera': { origin: ORIGIN },
  'Origin correcto, cabecera 0': { origin: ORIGIN, 'x-odyle-csrf': '0' },
  'Origin correcto, cabecera true': { origin: ORIGIN, 'x-odyle-csrf': 'true' },
  'Referer propio sin Origin + cabecera': { referer: `${ORIGIN}/`, 'x-odyle-csrf': '1' },
};

test('escrituras sin Origin propio o sin X-Odyle-CSRF: 403 en todas las rutas, con o sin sesión, y sin efecto', async () => {
  const s = await setup();
  const victim = await apiUser(s, 'victima@example.com');
  const L = await quickUser(s, 'lider');
  const M = await quickUser(s, 'miembro');
  await legionWith(s, L, [M]);
  const cookie = `${AT}=${victim.at}; ${RT}=${victim.rt}`;
  const lcookie = `${AT}=${L.at}`;
  const routes = [
    ['POST', '/api/auth/register', { email: 'nuevo@example.com', password: PW }, ''],
    ['POST', '/api/auth/login', { email: 'victima@example.com', password: PW }, ''],
    ['POST', '/api/auth/logout', {}, cookie],
    ['POST', '/api/auth/logout-all', {}, cookie],
    ['POST', '/api/auth/refresh', {}, cookie],
    ['POST', '/api/auth/verify', { token: 'x'.repeat(43) }, ''],
    ['POST', '/api/auth/forgot', { email: 'victima@example.com' }, ''],
    ['POST', '/api/auth/reset', { token: 'x'.repeat(43), password: 'otra-contrasena-larga-1' }, ''],
    ['PUT', `/api/docs/members/${victim.id}`, { profile: { nick: 'pwned' } }, cookie],
    ['PATCH', `/api/docs/members/${victim.id}`, { profile: { nick: 'pwned' } }, cookie],
    ['DELETE', `/api/docs/members/${victim.id}/characters/c1`, undefined, cookie],
    ['POST', '/api/legions', { name: 'Legión CSRF' }, cookie],
    ['POST', '/api/legions/join', { code: 'ABCDEFGH' }, cookie],
    ['POST', '/api/legions/mine/code', {}, lcookie],
    ['PATCH', '/api/legions/mine', { name: 'Hackeada' }, lcookie],
    ['POST', '/api/legions/mine/kick', { uid: M.id }, lcookie],
    ['POST', '/api/legions/leave', {}, `${AT}=${M.at}`],
    ['DELETE', '/api/legions/mine', undefined, lcookie],
  ];
  const usersBefore = (await s.db.query('select count(*)::int as n from users')).rows[0].n;
  for (const [method, url, payload, ck] of routes) {
    for (const [label, headers] of Object.entries(BAD_HEADERS)) {
      const r = await s.app.inject({ method, url, payload, headers: { ...headers, ...(ck ? { cookie: ck } : {}) } });
      assert.equal(r.statusCode, 403, `${method} ${url} [${label}] -> ${r.statusCode}`);
      assert.ok(![].concat(r.headers['set-cookie'] || []).length, `${method} ${url} [${label}] no debe tocar cookies`);
    }
  }
  // Sin efectos: la sesión de la víctima sigue viva, nada se creó ni se cambió.
  assert.equal((await s.req('GET', '/api/auth/me', { cookie: `${AT}=${victim.at}` })).statusCode, 200);
  assert.equal((await s.db.query('select count(*)::int as n from users')).rows[0].n, usersBefore);
  assert.equal((await s.db.query('select data from docs where path = $1', [`legions/${L.id}`])).rows[0].data.name, 'Los Albores');
  assert.equal((await s.db.query('select count(*)::int as n from docs where path = $1', [`members/${victim.id}`])).rows[0].n, 0);
  await s.app.close();
});

test('tipos de contenido "simples" o no JSON con Origin y cabecera correctos: 415 (sin parser text/plain)', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const types = {
    'text/plain': JSON.stringify({ email: 'ana@example.com', password: PW }),
    'text/plain;charset=UTF-8': JSON.stringify({ email: 'ana@example.com', password: PW }),
    'application/x-www-form-urlencoded': `email=ana%40example.com&password=${encodeURIComponent(PW)}`,
    'multipart/form-data; boundary=x': `--x\r\nContent-Disposition: form-data; name="email"\r\n\r\nana@example.com\r\n--x--\r\n`,
    'application/csp-report': '{"csp-report":{}}',
    'text/json': '{}',
    'application/jsonp': '{}',
  };
  for (const [ct, body] of Object.entries(types)) {
    for (const [method, url, ck] of [['POST', '/api/auth/login', ''], ['PUT', `/api/docs/members/${u.id}`, `${AT}=${u.at}`], ['POST', '/api/legions', `${AT}=${u.at}`]]) {
      const r = await s.req(method, url, { payload: body, headers: { 'content-type': ct, ...(ck ? { cookie: ck } : {}) } });
      assert.equal(r.statusCode, 415, `${method} ${url} con ${ct} -> ${r.statusCode}`);
    }
  }
  await s.app.close();
});

test('login CSRF: un formulario de otra web no puede iniciar sesión a la víctima en la cuenta del atacante', async () => {
  const s = await setup();
  await apiUser(s, 'atacante@example.com');
  const r = await s.app.inject({
    method: 'POST', url: '/api/auth/login',
    headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
    payload: `email=atacante%40example.com&password=${encodeURIComponent(PW)}`,
  });
  assert.equal(r.statusCode, 403);
  assert.ok(![].concat(r.headers['set-cookie'] || []).length);
  // También con JSON enviado vía fetch no-cors (text/plain): rechazado antes de parsear.
  const r2 = await s.app.inject({
    method: 'POST', url: '/api/auth/login',
    headers: { origin: 'https://evil.example', 'content-type': 'text/plain' },
    payload: JSON.stringify({ email: 'atacante@example.com', password: PW }),
  });
  assert.equal(r2.statusCode, 403);
  await s.app.close();
});

test('GET nunca cambia estado (no hay rutas de escritura por GET): logout/kick/refresh por GET no existen', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  for (const url of ['/api/auth/logout', '/api/auth/logout-all', '/api/auth/refresh', '/api/legions/leave', '/api/legions/mine/kick']) {
    const r = await s.req('GET', url, { cookie: `${AT}=${u.at}; ${RT}=${u.rt}` });
    assert.ok([404, 405].includes(r.statusCode), `GET ${url} -> ${r.statusCode}`);
  }
  assert.equal((await s.req('POST', '/api/auth/refresh', { cookie: `${RT}=${u.rt}` })).statusCode, 200, 'la sesión sigue');
  await s.app.close();
});
