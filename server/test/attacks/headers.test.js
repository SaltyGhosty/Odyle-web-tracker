// Ataque: clickjacking, CSP debilitada, downgrade a HTTP (SR-1, SR-5, SR-35).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, stablePublicDir, removeDir, quickUser, AT } from './_lib.js';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
const pub = stablePublicDir();
after(() => removeDir(pub));

function assertSecurityHeaders(r, label) {
  assert.equal(r.headers['content-security-policy'], CSP, `${label}: CSP exacta`);
  assert.equal(r.headers['x-frame-options'], 'DENY', `${label}: X-Frame-Options`);
  assert.equal(r.headers['strict-transport-security'], 'max-age=63072000; includeSubDomains', `${label}: HSTS`);
  assert.equal(r.headers['x-content-type-options'], 'nosniff', `${label}: nosniff`);
  assert.equal(r.headers['cross-origin-opener-policy'], 'same-origin', `${label}: COOP`);
  assert.equal(r.headers['cross-origin-resource-policy'], 'same-origin', `${label}: CORP`);
  assert.ok(['strict-origin-when-cross-origin', 'no-referrer'].includes(r.headers['referrer-policy']), `${label}: Referrer-Policy`);
}

test('HTML (/, páginas de cuenta): CSP exacta del diseño, sin orígenes externos ni unsafe-inline en scripts; anti-framing', async () => {
  const s = await setup({ __buildApp: { publicDir: pub } });
  for (const url of ['/', '/login', '/registro', '/verificar', '/restablecer']) {
    const r = await s.req('GET', url);
    assert.equal(r.statusCode, 200, url);
    assertSecurityHeaders(r, url);
    assert.ok(!/https?:/.test(r.headers['content-security-policy']), 'CSP sin orígenes externos (SR-5)');
  }
  assert.equal((await s.req('GET', '/login')).headers['referrer-policy'], 'no-referrer');
  await s.app.close();
});

test('cabeceras también en respuestas de error y rechazo (401, 403 CSRF, 404, 413, 415)', async () => {
  const s = await setup({ __buildApp: { publicDir: pub } });
  const u = await quickUser(s);
  const cases = {
    '401 sin sesión': await s.req('GET', '/api/auth/me'),
    '403 CSRF': await s.req('POST', '/api/auth/logout', { csrf: false, headers: { origin: 'https://evil.example' } }),
    '404': await s.req('GET', '/no-existe'),
    '413': await s.req('PUT', `/api/docs/members/${u.id}`, { cookie: `${AT}=${u.at}`, payload: { x: 'a'.repeat(80000) } }),
    '415': await s.req('POST', '/api/auth/login', { payload: 'a=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } }),
  };
  for (const [label, r] of Object.entries(cases)) assertSecurityHeaders(r, label);
  await s.app.close();
});

test('producción: x-forwarded-proto http => 301 a https://APP_ORIGIN (sin usar Host); https no redirige (SR-35)', async () => {
  const s = await setup({ NODE_ENV: 'production', __buildApp: { publicDir: pub } });
  for (const proto of ['http']) {
    const r = await s.req('GET', '/login?next=%2F', { headers: { 'x-forwarded-proto': proto, host: 'evil.example' } });
    assert.equal(r.statusCode, 301, `x-forwarded-proto: ${proto}`);
    assert.equal(r.headers.location, 'https://odyle.test/login?next=%2F', proto);
  }
  // POST por HTTP también se redirige (nunca se procesa en claro).
  const p = await s.req('POST', '/api/auth/login', { headers: { 'x-forwarded-proto': 'http' }, payload: { email: 'a@b.cc', password: 'x' } });
  assert.equal(p.statusCode, 301);
  const ok = await s.req('GET', '/login', { headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(ok.statusCode, 200);
  await s.app.close();
});
