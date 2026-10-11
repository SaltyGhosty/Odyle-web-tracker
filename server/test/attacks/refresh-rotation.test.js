// Ataque: reutilizar un token de renovación robado (SR-9, SR-10, SR-20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, apiUser, cookieVal, AT, RT } from './_lib.js';

const refresh = (s, rt) => s.req('POST', '/api/auth/refresh', { cookie: `${RT}=${rt}` });
const me = (s, at) => s.req('GET', '/api/auth/me', { cookie: `${AT}=${at}` });

test('ladrón reutiliza un token antiguo fuera de la gracia: se revoca toda la familia (ladrón y víctima fuera)', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const stolen = u.rt;
  s.clock.t += 60_000;
  const r1 = await refresh(s, stolen); // la víctima renueva
  const rt1 = cookieVal(r1, RT);
  s.clock.t += 60_000;
  const r2 = await refresh(s, rt1);
  const rt2 = cookieVal(r2, RT);
  s.clock.t += 21_000;
  assert.equal((await refresh(s, stolen)).statusCode, 401, 'el token robado no renueva');
  assert.equal((await refresh(s, rt2)).statusCode, 401, 'la familia queda revocada (aviso de robo)');
  await s.app.close();
});

test('dentro de la gracia, un token MÁS antiguo que el anterior (dos rotaciones atrás) revoca la familia', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const r1 = await refresh(s, u.rt);
  const rt1 = cookieVal(r1, RT);
  s.clock.t += 1000;
  const r2 = await refresh(s, rt1);
  const rt2 = cookieVal(r2, RT);
  s.clock.t += 1000;
  assert.equal((await refresh(s, u.rt)).statusCode, 401, 'token de hace dos rotaciones');
  assert.equal((await refresh(s, rt2)).statusCode, 401, 'familia revocada');
  await s.app.close();
});

test('tras reset de contraseña y tras logout-all, ningún token de renovación previo funciona (ni en gracia)', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const r1 = await refresh(s, u.rt);
  const rt1 = cookieVal(r1, RT);
  await s.req('POST', '/api/auth/forgot', { payload: { email: 'ana@example.com' } });
  await new Promise((r) => setImmediate(r));
  const tok = /#t=([A-Za-z0-9_-]+)/.exec(s.sent.at(-1).text)[1];
  assert.equal((await s.req('POST', '/api/auth/reset', { payload: { token: tok, password: 'otra-contrasena-larga-3' } })).statusCode, 200);
  assert.equal((await refresh(s, u.rt)).statusCode, 401, 'anterior en gracia tras reset');
  assert.equal((await refresh(s, rt1)).statusCode, 401, 'vigente tras reset');

  const s2 = await setup();
  const v = await apiUser(s2, 'bea@example.com');
  const v1 = cookieVal(await refresh(s2, v.rt), RT);
  const v1at = cookieVal(await refresh(s2, v1), AT); // rotación 2; v1 queda como "anterior"
  assert.equal((await s2.req('POST', '/api/auth/logout-all', { cookie: `${AT}=${v1at}` })).statusCode, 200);
  assert.equal((await refresh(s2, v1)).statusCode, 401, 'anterior en gracia tras logout-all');
  await s.app.close(); await s2.app.close();
});

test('token de renovación caducado (30 días) no renueva', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  s.clock.t += 30 * 24 * 3600 * 1000 + 1000;
  assert.equal((await refresh(s, u.rt)).statusCode, 401);
  assert.equal((await me(s, u.at)).statusCode, 401);
  await s.app.close();
});
