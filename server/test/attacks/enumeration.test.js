// Ataque: averiguar qué correos tienen cuenta por mensajes, códigos o tiempos (SR-15, SR-16).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { hashPassword } from '../../src/lib/passwords.js';
import { newUserId } from '../../src/lib/tokens.js';
import { setup, apiUser, freshIp, tick, PW } from './_lib.js';

const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
async function timed(fn) { const t = performance.now(); const r = await fn(); return { r, ms: performance.now() - t }; }
const shape = (r) => ({ status: r.statusCode, body: r.body, cookies: [].concat(r.headers['set-cookie'] || []).length });

test('mismas respuestas (código y cuerpo) para correo existente e inexistente en register, login, forgot, en full y owner-only', async () => {
  for (const mode of ['full', 'owner-only']) {
    const s = await setup({ EMAIL_MODE: mode });
    await apiUser(s, 'existe@example.com');
    const pairs = [
      ['register', { email: 'existe@example.com', password: PW }, { email: 'noexiste@example.com', password: PW }],
      ['register (contraseña distinta)', { email: 'existe@example.com', password: 'otra-contrasena-9z' }, { email: 'noexiste2@example.com', password: 'otra-contrasena-9z' }],
      ['login (contraseña mala)', { email: 'existe@example.com', password: 'mala-contrasena-1' }, { email: 'noexiste@example.com', password: 'mala-contrasena-1' }],
      ['forgot', { email: 'existe@example.com' }, { email: 'noexiste3@example.com' }],
    ];
    for (const [label, a, b] of pairs) {
      const url = `/api/auth/${label.split(' ')[0]}`;
      const ra = await s.req('POST', url, { payload: a, ip: freshIp() });
      const rb = await s.req('POST', url, { payload: b, ip: freshIp() });
      assert.deepEqual(shape(ra), shape(rb), `${mode} ${label}`);
    }
    await s.app.close();
  }
});

test('tras 10 fallos, la respuesta de bloqueo es igual exista o no la cuenta (el 429 no delata cuentas)', async () => {
  const s = await setup();
  await apiUser(s, 'existe@example.com');
  const out = {};
  for (const email of ['existe@example.com', 'fantasma@example.com']) {
    for (let i = 0; i < 10; i++) await s.req('POST', '/api/auth/login', { payload: { email, password: 'mala-contrasena-1' }, ip: freshIp() });
    out[email] = shape(await s.req('POST', '/api/auth/login', { payload: { email, password: 'mala-contrasena-1' }, ip: freshIp() }));
  }
  assert.equal(out['existe@example.com'].status, 429);
  assert.deepEqual(out['existe@example.com'], out['fantasma@example.com']);
  await s.app.close();
});

test('tiempos: mediana(existente) - mediana(inexistente) < 50 ms en 30 muestras para register, login y forgot (SR-16)', async () => {
  const s = await setup();
  // Cuentas reales (hash argon2 auténtico) para que el login con contraseña mala haga el trabajo completo.
  const realHash = await hashPassword(PW);
  const existing = [];
  for (let i = 0; i < 15; i++) {
    const email = `real${i}@example.com`;
    await s.db.query('insert into users (id, email, password_hash, email_verified_at) values ($1, $2, $3, $4)', [newUserId(), email, realHash, new Date(s.clock.t)]);
    existing.push(email);
  }
  const N = 30;
  const results = {};
  for (const [label, url, mk] of [
    ['register', '/api/auth/register', (email) => ({ email, password: PW })],
    ['login', '/api/auth/login', (email) => ({ email, password: 'mala-contrasena-1' })],
    ['forgot', '/api/auth/forgot', (email) => ({ email })],
  ]) {
    const ex = []; const no = [];
    for (let i = 0; i < N; i++) {
      // Alterna el orden para no sesgar por calentamiento.
      const e = existing[i % 15]; // cada correo existente se usa 2 veces (forgot: 3/h por correo)
      const fe = `${label}-fantasma${i}@example.com`;
      const pairs = i % 2 ? [[e, ex], [fe, no]] : [[fe, no], [e, ex]];
      for (const [email, bucket] of pairs) {
        const { r, ms } = await timed(() => s.req('POST', url, { payload: mk(email), ip: freshIp() }));
        assert.ok([202, 401, 429].includes(r.statusCode), `${label} ${r.statusCode}`);
        bucket.push(ms);
        await tick();
      }
    }
    results[label] = { existente: median(ex), inexistente: median(no) };
  }
  for (const [label, m] of Object.entries(results)) {
    assert.ok(Math.abs(m.existente - m.inexistente) < 50, `${label}: ${m.existente.toFixed(1)} ms vs ${m.inexistente.toFixed(1)} ms`);
  }
  await s.app.close();
});
