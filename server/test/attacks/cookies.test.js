// Ataque: robo o fijación de cookies de sesión (SR-11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setup, apiUser, apiLogin, cookiesOf, cookieVal, freshIp, AT, RT, PW } from './_lib.js';

const attrs = (c) => c.split(';').slice(1).map((x) => x.trim().toLowerCase());

test('login: nombres con prefijo, HttpOnly, Secure, SameSite y Path exactos; sin Domain', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const cs = cookiesOf(u.res);
  const at = cs.find((c) => c.startsWith(`${AT}=`));
  const rt = cs.find((c) => c.startsWith(`${RT}=`));
  assert.ok(at && rt, 'ambas cookies');
  for (const [c, same, p] of [[at, 'samesite=lax', 'path=/'], [rt, 'samesite=strict', 'path=/api/auth']]) {
    const a = attrs(c);
    assert.ok(a.includes('httponly'), `${c.split('=')[0]} HttpOnly`);
    assert.ok(a.includes('secure'), 'Secure');
    assert.ok(a.includes(same), same);
    assert.ok(a.includes(p), p);
    assert.ok(!a.some((x) => x.startsWith('domain=')), 'sin Domain');
  }
  // Ninguna respuesta del login devuelve los tokens en el cuerpo.
  assert.ok(!u.res.body.includes(u.at) && !u.res.body.includes(u.rt));
  await s.app.close();
});

test('fijación: cookie de renovación plantada antes del login se descarta y el login emite una familia nueva', async () => {
  const s = await setup();
  const victim = await apiUser(s, 'victima@example.com');
  // El atacante tiene una sesión propia y planta su cookie de renovación en el navegador de la víctima.
  const attacker = await apiUser(s, 'atacante@example.com');
  const l = await s.req('POST', '/api/auth/login', { payload: { email: 'victima@example.com', password: PW }, cookie: `${RT}=${attacker.rt}`, ip: freshIp() });
  assert.equal(l.statusCode, 200);
  const newRt = cookieVal(l, RT);
  assert.ok(newRt && newRt !== attacker.rt && newRt !== victim.rt);
  const fam = async (rt) => (await s.db.query('select family_id from refresh_tokens where token_hash = $1', [createHash('sha256').update(rt).digest('hex')])).rows[0]?.family_id;
  const famNew = await fam(newRt);
  assert.ok(famNew && famNew !== (await fam(attacker.rt)), 'familia nueva');
  // La cookie plantada ya no renueva (familia descartada): el atacante no queda "dentro" del navegador de la víctima.
  assert.equal((await s.req('POST', '/api/auth/refresh', { cookie: `${RT}=${attacker.rt}` })).statusCode, 401);
  await s.app.close();
});

test('logout borra ambas cookies (Max-Age=0, mismos Path) y la renovación vieja deja de valer', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const r = await s.req('POST', '/api/auth/logout', { cookie: `${AT}=${u.at}; ${RT}=${u.rt}` });
  assert.equal(r.statusCode, 200);
  const cs = cookiesOf(r);
  const at = cs.find((c) => c.startsWith(`${AT}=`));
  const rt = cs.find((c) => c.startsWith(`${RT}=`));
  assert.ok(at && /max-age=0/i.test(at) && /path=\/(;|$)/i.test(at));
  assert.ok(rt && /max-age=0/i.test(rt) && /path=\/api\/auth/i.test(rt));
  assert.equal((await s.req('POST', '/api/auth/refresh', { cookie: `${RT}=${u.rt}` })).statusCode, 401);
  // Un segundo login sigue funcionando (logout no bloquea la cuenta).
  await apiLogin(s, 'ana@example.com');
  await s.app.close();
});
