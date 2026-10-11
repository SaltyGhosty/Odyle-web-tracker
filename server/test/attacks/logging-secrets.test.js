// Ataque: obtener secretos, cookies, contraseñas o tokens leyendo los registros (logs de Render) (SR-33).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, apiUser, cookieVal, lastToken, tick, captureLogger, freshIp, AT, RT, PW } from './_lib.js';

test('tras register/verify/login/refresh/forgot/reset/docs/errores, el registro no contiene secretos ni datos personales', async () => {
  const cap = captureLogger();
  const s = await setup({ __buildApp: { logger: cap.logger } });
  const u = await apiUser(s, 'ana.secreta@example.com', PW);
  const verifyTok = s.sent[0].text.match(/#t=([A-Za-z0-9_-]+)/)[1];
  const r1 = await s.req('POST', '/api/auth/refresh', { cookie: `${RT}=${u.rt}` });
  const rt1 = cookieVal(r1, RT); const at1 = cookieVal(r1, AT);
  await s.req('POST', '/api/auth/forgot', { payload: { email: 'ana.secreta@example.com' }, ip: freshIp() });
  await tick();
  const resetTok = lastToken(s.sent);
  const NEW = 'nueva-contrasena-secreta-4';
  await s.req('POST', '/api/auth/reset', { payload: { token: resetTok, password: NEW } });
  // Errores y entradas raras que suelen acabar en el log con su contenido.
  await s.req('POST', '/api/auth/login', { payload: `{"email":"ana.secreta@example.com","password":"${PW}"`, headers: { 'content-type': 'application/json' }, ip: freshIp() });
  await s.req('POST', '/api/auth/login', { payload: `password=${PW}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, ip: freshIp() });
  await s.req('POST', '/api/auth/login', { payload: { email: 'ana.secreta@example.com', password: PW }, ip: freshIp() }); // 401 (contraseña vieja)
  await s.req('GET', `/api/auth/me?token=${u.at}&email=ana.secreta@example.com`, { cookie: `${AT}=${u.at}`, headers: { authorization: `Bearer ${u.at}` } });
  await s.req('PUT', `/api/docs/members/${u.id}`, { payload: { profile: { bio: 'mi-bio-privada-123' } }, cookie: `${AT}=${at1}` });
  await s.req('PUT', `/api/docs/members/${u.id}`, { payload: `{"profile":{"bio":"mi-bio-privada-123"`, headers: { 'content-type': 'application/json' }, cookie: `${AT}=${at1}` });
  // Fallo forzado de la base: el error de SQL tampoco debe registrar parámetros.
  const q = s.db.query;
  s.db.query = async () => { throw Object.assign(new Error(`duplicate key ${PW} ana.secreta@example.com`), { code: '23505', detail: `Key (email)=(ana.secreta@example.com)` }); };
  await s.req('POST', '/api/auth/login', { payload: { email: 'ana.secreta@example.com', password: PW }, ip: freshIp() });
  s.db.query = q;
  const log = cap.text();
  assert.ok(log.length > 0, 'el logger capturó algo');
  const secrets = {
    contraseña: PW, 'contraseña nueva': NEW, 'token verify': verifyTok, 'token reset': resetTok,
    'refresh inicial': u.rt, 'refresh rotado': rt1, 'acceso inicial': u.at, 'acceso rotado': at1,
    'correo': 'ana.secreta@example.com', 'bio': 'mi-bio-privada-123',
    JWT_SECRET: Buffer.from(s.config.jwtSecret).toString('base64'), CODE_KEY: s.config.codeKey.toString('base64'), RESEND_API_KEY: s.config.resendKey,
  };
  const leaks = Object.entries(secrets).filter(([, v]) => log.includes(v)).map(([k]) => k);
  assert.deepEqual(leaks, [], `aparece en el registro: ${leaks.join(', ')}`);
  for (const h of ['cookie', 'authorization', 'set-cookie']) assert.ok(!new RegExp(`"${h}"`, 'i').test(log), `cabecera ${h} registrada`);
  await s.app.close();
});
