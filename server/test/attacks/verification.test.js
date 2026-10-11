// Ataque: saltarse la verificación del correo y hacerse administrador; secuestro previo de cuentas (SR-21, SR-20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { testEnv } from '../helpers.js';
import { setup, apiUser, apiLogin, lastToken, tick, freshIp, AT, PW } from './_lib.js';

const VICTIM_PW = 'contrasena-de-la-victima-1';
const ATTACKER_PW = 'contrasena-del-atacante-2';

test('full: una cuenta sin verificar no entra (ni con la contraseña correcta)', async () => {
  const s = await setup();
  await s.req('POST', '/api/auth/register', { payload: { email: 'nuevo@example.com', password: PW }, ip: freshIp() });
  const r = await s.req('POST', '/api/auth/login', { payload: { email: 'nuevo@example.com', password: PW }, ip: freshIp() });
  assert.equal(r.statusCode, 403);
  assert.equal([].concat(r.headers['set-cookie'] || []).length, 0);
  await s.app.close();
});

test('owner-only -> full: las cuentas creadas sin verificar no pueden entrar hasta verificar', async () => {
  const s = await setup({ EMAIL_MODE: 'owner-only' });
  // Un atacante registra en owner-only el correo de otra persona y entra.
  await s.req('POST', '/api/auth/register', { payload: { email: 'victima@example.com', password: ATTACKER_PW }, ip: freshIp() });
  await apiLogin(s, 'victima@example.com', ATTACKER_PW);
  // El dueño pasa a full con la misma base.
  const config = loadConfig(testEnv({ EMAIL_MODE: 'full' }));
  const full = buildApp({ config, db: s.db, mailer: { async send() {} }, logger: false });
  const r = await full.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'victima@example.com', password: ATTACKER_PW }, headers: { origin: 'https://odyle.test', 'x-odyle-csrf': '1' }, remoteAddress: freshIp() });
  assert.equal(r.statusCode, 403);
  await full.close(); await s.app.close();
});

test('ADMIN_EMAIL (o cualquier correo) no da acceso a feedback: solo ADMIN_USER_ID verificado, en ambos modos', async () => {
  for (const mode of ['owner-only', 'full']) {
    const s = await setup({ EMAIL_MODE: mode, ADMIN_EMAIL: 'jefe@example.com' });
    await s.req('POST', '/api/auth/register', { payload: { email: 'jefe@example.com', password: PW }, ip: freshIp() });
    await tick();
    if (mode === 'owner-only') {
      const u = await apiLogin(s, 'jefe@example.com');
      assert.equal((await s.req('GET', '/api/auth/me', { cookie: `${AT}=${u.at}` })).json().isAdmin, false, `${mode}: isAdmin`);
      assert.equal((await s.req('GET', '/api/docs/feedback', { cookie: `${AT}=${u.at}` })).statusCode, 403, `${mode}: listar feedback`);
    } else {
      // full: sin verificar ni siquiera entra; verificado tampoco es admin sin ADMIN_USER_ID.
      await s.req('POST', '/api/auth/verify', { payload: { token: lastToken(s.sent), password: PW } });
      const u = await apiLogin(s, 'jefe@example.com');
      assert.equal((await s.req('GET', '/api/docs/feedback', { cookie: `${AT}=${u.at}` })).statusCode, 403, `${mode}: listar feedback`);
    }
    await s.app.close();
  }
});

test('ADMIN_USER_ID sin correo verificado no es admin; verificado sí (control)', async () => {
  const s = await setup({ EMAIL_MODE: 'owner-only' });
  await s.req('POST', '/api/auth/register', { payload: { email: 'owner@example.com', password: PW }, ip: freshIp() });
  const u = await apiLogin(s, 'owner@example.com');
  const s2cfg = loadConfig(testEnv({ EMAIL_MODE: 'owner-only', ADMIN_USER_ID: u.id }));
  const app2 = buildApp({ config: { ...s2cfg, jwtSecret: s.config.jwtSecret }, db: s.db, mailer: { async send() {} }, logger: false, now: () => s.clock.t });
  const list = () => app2.inject({ method: 'GET', url: '/api/docs/feedback', headers: { cookie: `${AT}=${u.at}` } });
  assert.equal((await list()).statusCode, 403, 'sin verificar');
  await s.db.query('update users set email_verified_at = $1 where id = $2', [new Date(s.clock.t), u.id]);
  const { invalidateUserCache } = await import('../../src/lib/session.js');
  invalidateUserCache(u.id);
  assert.equal((await list()).statusCode, 200, 'verificado');
  await app2.close(); await s.app.close();
});

test('secuestro previo (atacante primero): la víctima se registra y verifica; la contraseña del atacante no vale', async () => {
  const s = await setup();
  await s.req('POST', '/api/auth/register', { payload: { email: 'victima@example.com', password: ATTACKER_PW }, ip: freshIp() });
  await tick();
  await s.req('POST', '/api/auth/register', { payload: { email: 'victima@example.com', password: VICTIM_PW }, ip: freshIp() });
  await tick();
  assert.equal((await s.req('POST', '/api/auth/verify', { payload: { token: lastToken(s.sent), password: VICTIM_PW } })).statusCode, 200);
  assert.equal((await s.req('POST', '/api/auth/login', { payload: { email: 'victima@example.com', password: ATTACKER_PW }, ip: freshIp() })).statusCode, 401);
  await apiLogin(s, 'victima@example.com', VICTIM_PW);
  await s.app.close();
});

test('secuestro previo (atacante DESPUÉS): cada enlace exige SU contraseña; el atacante no queda con la cuenta', async () => {
  const s = await setup();
  // 1) La víctima se registra con su contraseña; recibe el correo 1.
  await s.req('POST', '/api/auth/register', { payload: { email: 'victima@example.com', password: VICTIM_PW }, ip: freshIp() });
  await tick();
  const victimLink = lastToken(s.sent);
  // 2) El atacante registra el mismo correo con la suya: la víctima recibe el correo 2 (ligado a la del atacante).
  await s.req('POST', '/api/auth/register', { payload: { email: 'victima@example.com', password: ATTACKER_PW }, ip: freshIp() });
  await tick();
  assert.equal(s.sent.length, 2);
  const newestLink = lastToken(s.sent);
  assert.notEqual(newestLink, victimLink);
  const verify = (token, password) => s.req('POST', '/api/auth/verify', { payload: { token, password } });
  // 3) La víctima abre el más reciente y escribe SU contraseña: rechazado y sin consumir nada.
  assert.equal((await verify(newestLink, VICTIM_PW)).statusCode, 400);
  // 4) Su propio enlace (el primero) con su contraseña sigue vivo y funciona.
  assert.equal((await verify(victimLink, VICTIM_PW)).statusCode, 200);
  assert.equal((await s.req('POST', '/api/auth/login', { payload: { email: 'victima@example.com', password: ATTACKER_PW }, ip: freshIp() })).statusCode, 401, 'el atacante no entra');
  assert.equal((await s.req('POST', '/api/auth/login', { payload: { email: 'victima@example.com', password: VICTIM_PW }, ip: freshIp() })).statusCode, 200, 'la víctima entra');
  // 5) El enlace del atacante, con su contraseña, ya no sirve (cuenta verificada, enlaces anulados).
  assert.equal((await verify(newestLink, ATTACKER_PW)).statusCode, 400);
  await s.app.close();
});

test('verify: un token sin contraseña ligada (pending nulo) se rechaza siempre', async () => {
  const s = await setup();
  await s.req('POST', '/api/auth/register', { payload: { email: 'ana@example.com', password: VICTIM_PW }, ip: freshIp() });
  await tick();
  const { sha256hex } = await import('../../src/lib/tokens.js');
  const raw = 'n'.repeat(43);
  await s.db.query('update email_tokens set token_hash = $1, pending_password_hash = null', [sha256hex(raw)]);
  for (const password of [VICTIM_PW, '', undefined]) {
    const r = await s.req('POST', '/api/auth/verify', { payload: { token: raw, password } });
    assert.equal(r.statusCode, 400);
    assert.deepEqual(r.json(), { error: 'El enlace o la contraseña no son válidos' });
  }
  assert.equal((await s.db.query('select email_verified_at from users')).rows[0].email_verified_at, null);
  await s.app.close();
});
