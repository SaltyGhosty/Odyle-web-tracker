// Ataque/abuso: dos pestañas renuevan a la vez (SR-9, SR-10). La versión con Postgres real y reloj real está en
// pg-concurrency.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setup, apiUser, cookieVal, AT, RT } from './_lib.js';

const refresh = (s, rt) => s.req('POST', '/api/auth/refresh', { cookie: `${RT}=${rt}` });
const me = (s, at) => s.req('GET', '/api/auth/me', { cookie: `${AT}=${at}` });
const h = (x) => createHash('sha256').update(x).digest('hex');
const liveInFamily = async (s, rt) => {
  const fam = (await s.db.query('select family_id from refresh_tokens where token_hash = $1', [h(rt)])).rows[0].family_id;
  return (await s.db.query('select token_hash from refresh_tokens where family_id = $1 and used_at is null and revoked_at is null', [fam])).rows;
};

test('dos renovaciones simultáneas con el mismo token: ambas pestañas siguen con sesión; un solo sucesor vigente', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  s.clock.t += 60_000;
  const [a, b] = await Promise.all([refresh(s, u.rt), refresh(s, u.rt)]);
  assert.equal(a.statusCode, 200, `pestaña 1: ${a.statusCode}`);
  assert.equal(b.statusCode, 200, `pestaña 2: ${b.statusCode} (falso positivo de robo)`);
  const ra = cookieVal(a, RT); const rb = cookieVal(b, RT);
  assert.equal((await me(s, cookieVal(a, AT))).statusCode, 200);
  assert.equal((await me(s, cookieVal(b, AT))).statusCode, 200);
  const live = await liveInFamily(s, ra);
  assert.equal(live.length, 1, `sucesores vigentes: ${live.length}`);
  assert.equal(ra, rb, 'las dos pestañas acaban con el mismo token vigente (la cookie es compartida)');
  s.clock.t += 1000;
  assert.equal((await refresh(s, rb)).statusCode, 200, 'la sesión continúa');
  await s.app.close();
});

test('secuencial (la 2.ª pestaña llega 5 s tarde con el token recién usado): no revoca y recibe el vigente', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const a = await refresh(s, u.rt);
  s.clock.t += 5000;
  const b = await refresh(s, u.rt);
  assert.equal(b.statusCode, 200);
  assert.equal(cookieVal(b, RT), cookieVal(a, RT));
  assert.equal((await refresh(s, cookieVal(a, RT))).statusCode, 200);
  await s.app.close();
});

test('reutilización a los 21 s sí revoca la familia', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const a = await refresh(s, u.rt);
  s.clock.t += 21_000;
  assert.equal((await refresh(s, u.rt)).statusCode, 401);
  assert.equal((await refresh(s, cookieVal(a, RT))).statusCode, 401);
  await s.app.close();
});

test('tres pestañas a la vez + reloj que retrocede 1 ms entre ellas: nadie pierde la sesión', async () => {
  // Las peticiones leen la hora antes de competir por la fila: la perdedora puede tener una hora ANTERIOR a la
  // rotación de la ganadora. No debe tomarse por reutilización.
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const base = s.clock.t + 60_000;
  let calls = 0;
  s.clock.t = base;
  // Cada lectura de la hora devuelve un valor algo menor que la anterior (orden de llegada invertido).
  const times = [base + 3, base + 2, base + 1, base];
  Object.defineProperty(s.clock, 't', { get: () => times[Math.min(calls++, times.length - 1)], set: () => {}, configurable: true });
  const rs = await Promise.all([refresh(s, u.rt), refresh(s, u.rt), refresh(s, u.rt)]);
  Object.defineProperty(s.clock, 't', { value: base + 1000, writable: true, configurable: true });
  for (const [i, r] of rs.entries()) assert.equal(r.statusCode, 200, `pestaña ${i + 1}: ${r.statusCode}`);
  const last = cookieVal(rs[0], RT);
  assert.equal((await refresh(s, last)).statusCode, 200, 'la familia sigue viva');
  await s.app.close();
});
