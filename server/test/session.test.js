import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestApp } from './helpers.js';

const H = { origin: 'https://odyle.test', 'x-odyle-csrf': '1' };
const PW = 'una-contrasena-larga-1';
const post = (app, url, payload, headers = H) => app.inject({ method: 'POST', url, payload, headers });
const cookiesOf = (r) => [].concat(r.headers['set-cookie'] || []);
const jar = (r) => cookiesOf(r).map((c) => c.split(';')[0]).join('; ');
const cookieVal = (r, name) => { const c = cookiesOf(r).find((x) => x.startsWith(`${name}=`)); return c ? c.split(';')[0].slice(name.length + 1) : null; };
const tick = () => new Promise((res) => setImmediate(res));
const tokenFrom = (sent) => /#t=([A-Za-z0-9_-]+)/.exec(sent[sent.length - 1].text)[1];
const AT = '__Host-odyle_at';
const RT = '__Secure-odyle_rt';

// Cuenta verificada con reloj controlable.
async function setup(over = {}, email = 'ana@example.com') {
  const clock = { t: Date.UTC(2026, 9, 11, 12, 0, 0) };
  const t = await makeTestApp({ ...over, __buildApp: { now: () => clock.t, ...(over.__buildApp || {}) } });
  await post(t.app, '/api/auth/register', { email, password: PW });
  await tick();
  if (t.config.emailMode === 'full') await post(t.app, '/api/auth/verify', { token: tokenFrom(t.sent), password: PW });
  return { ...t, clock };
}
const login = (app, email = 'ana@example.com', password = PW, headers = H) => post(app, '/api/auth/login', { email, password }, headers);
const refresh = (app, rt) => app.inject({ method: 'POST', url: '/api/auth/refresh', payload: {}, headers: { ...H, cookie: `${RT}=${rt}` } });
const me = (app, at) => app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `${AT}=${at}` } });

test('refresh: nuevas cookies y token distinto; el nuevo funciona', async () => {
  const { app, clock } = await setup();
  const l = await login(app);
  const rt0 = cookieVal(l, RT);
  clock.t += 60_000;
  const r = await refresh(app, rt0);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { ok: true });
  assert.equal(r.headers['cache-control'], 'no-store');
  const rt1 = cookieVal(r, RT);
  assert.ok(rt1 && rt1 !== rt0);
  assert.equal((await me(app, cookieVal(r, AT))).statusCode, 200);
  const c = cookiesOf(r).find((x) => x.startsWith(`${RT}=`));
  assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Strict/); assert.match(c, /Path=\/api\/auth/);
  clock.t += 60_000;
  assert.equal((await refresh(app, rt1)).statusCode, 200);
  await app.close();
});

test('refresh: token viejo tras 20 s revoca la familia entera', async () => {
  const { app, clock, db } = await setup();
  const rt0 = cookieVal(await login(app), RT);
  const r1 = await refresh(app, rt0);
  const rt1 = cookieVal(r1, RT);
  clock.t += 21_000;
  const bad = await refresh(app, rt0);
  assert.equal(bad.statusCode, 401);
  assert.deepEqual(bad.json(), { error: 'Sesión caducada' });
  assert.equal(bad.headers['cache-control'], 'no-store');
  assert.ok(cookiesOf(bad).every((c) => /Max-Age=0/.test(c)) && cookiesOf(bad).length === 2);
  assert.equal((await refresh(app, rt1)).statusCode, 401); // el sucesor tampoco sirve
  const open = (await db.query('select count(*)::int as n from refresh_tokens where revoked_at is null')).rows[0].n;
  assert.equal(open, 0);
  await app.close();
});

test('refresh: dos usos dentro de 20 s -> ambos 200 con la misma sesión nueva (gracia)', async () => {
  const { app, clock, db } = await setup();
  const rt0 = cookieVal(await login(app), RT);
  clock.t += 1000;
  const [a, b] = await Promise.all([refresh(app, rt0), refresh(app, rt0)]);
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  assert.equal(cookieVal(a, RT), cookieVal(b, RT));
  assert.equal((await me(app, cookieVal(b, AT))).statusCode, 200);
  clock.t += 10_000;
  const c = await refresh(app, rt0);
  assert.equal(c.statusCode, 200);
  assert.equal(cookieVal(c, RT), cookieVal(a, RT));
  // solo un sucesor vigente
  const live = (await db.query('select count(*)::int as n from refresh_tokens where used_at is null and revoked_at is null')).rows[0].n;
  assert.equal(live, 1);
  // el sucesor sigue sirviendo y la gracia no devuelve nada pasados 20 s
  assert.equal((await refresh(app, cookieVal(a, RT))).statusCode, 200);
  await app.close();
});

test('refresh: el uso es una sola actualización atómica (SR-9)', async () => {
  const { app, db } = await setup();
  const rt0 = cookieVal(await login(app), RT);
  const seen = [];
  const orig = db.query.bind(db);
  db.query = async (text, params) => { seen.push(String(text)); return orig(text, params); };
  const origTx = db.tx.bind(db);
  db.tx = (fn) => origTx((q) => fn(async (text, params) => { seen.push(String(text)); return q(text, params); }));
  await refresh(app, rt0);
  const consume = seen.filter((s) => /update refresh_tokens/i.test(s) && /used_at is null/i.test(s) && /returning/i.test(s));
  assert.equal(consume.length, 1);
  assert.match(consume[0], /revoked_at is null/i);
  assert.match(consume[0], /expires_at >/i);
  await app.close();
});

test('refresh: sin cookie, desconocido o caducado -> 401 y cookies borradas', async () => {
  const { app, clock } = await setup();
  let r = await post(app, '/api/auth/refresh', {});
  assert.equal(r.statusCode, 401);
  r = await refresh(app, 'x'.repeat(43));
  assert.equal(r.statusCode, 401);
  assert.equal(cookiesOf(r).length, 2);
  const rt0 = cookieVal(await login(app), RT);
  clock.t += 31 * 24 * 3600 * 1000;
  assert.equal((await refresh(app, rt0)).statusCode, 401);
  await app.close();
});

test('refresh: tras cerrar sesión el token ya no sirve', async () => {
  const { app } = await setup();
  const l = await login(app);
  await app.inject({ method: 'POST', url: '/api/auth/logout', payload: {}, headers: { ...H, cookie: jar(l) } });
  assert.equal((await refresh(app, cookieVal(l, RT))).statusCode, 401);
  await app.close();
});

test('logout-all: sube token_version, caché al instante, JWT previo da 401 y refresh muere', async () => {
  const { app, db } = await setup();
  const l1 = await login(app);
  const l2 = await login(app);
  assert.equal((await me(app, cookieVal(l1, AT))).statusCode, 200); // calienta la caché
  const before = (await db.query('select token_version from users')).rows[0].token_version;
  const r = await app.inject({ method: 'POST', url: '/api/auth/logout-all', payload: {}, headers: { ...H, cookie: jar(l2) } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { ok: true });
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(cookiesOf(r).length, 2);
  const after = (await db.query('select token_version from users')).rows[0].token_version;
  assert.equal(after, before + 1);
  assert.equal((await me(app, cookieVal(l1, AT))).statusCode, 401);
  assert.equal((await me(app, cookieVal(l2, AT))).statusCode, 401);
  assert.equal((await refresh(app, cookieVal(l1, RT))).statusCode, 401);
  assert.equal((await refresh(app, cookieVal(l2, RT))).statusCode, 401);
  const noAuth = await post(app, '/api/auth/logout-all', {});
  assert.equal(noAuth.statusCode, 401);
  await app.close();
});

test('forgot (full): 202 genérico, correo con enlace en fragmento; mismo cuerpo si no existe', async () => {
  const { app, sent, db } = await setup();
  const n = sent.length;
  const a = await post(app, '/api/auth/forgot', { email: ' Ana@Example.com ' });
  const b = await post(app, '/api/auth/forgot', { email: 'nadie@example.com' });
  const c = await post(app, '/api/auth/forgot', { email: 'basura' });
  for (const r of [a, b, c]) {
    assert.equal(r.statusCode, 202);
    assert.deepEqual(r.json(), { message: 'Si el correo es válido, te hemos enviado un enlace' });
    assert.equal(r.headers['cache-control'], 'no-store');
  }
  await tick();
  assert.equal(sent.length, n + 1);
  assert.equal(sent[n].to, 'ana@example.com');
  assert.match(sent[n].text, /https:\/\/odyle\.test\/restablecer#t=[A-Za-z0-9_-]{43}/);
  const rows = (await db.query("select token_hash from email_tokens where kind = 'reset'")).rows;
  assert.equal(rows.length, 1);
  assert.ok(!sent[n].text.includes(rows[0].token_hash));
  await app.close();
});

test('forgot (owner-only): 503', async () => {
  const { app } = await setup({ EMAIL_MODE: 'owner-only' });
  const r = await post(app, '/api/auth/forgot', { email: 'ana@example.com' });
  assert.equal(r.statusCode, 503);
  assert.deepEqual(r.json(), { error: 'La recuperación por correo aún no está disponible' });
  await app.close();
});

test('forgot: un token nuevo anula el anterior', async () => {
  const { app, sent, clock } = await setup();
  await post(app, '/api/auth/forgot', { email: 'ana@example.com' }); await tick();
  const t1 = tokenFrom(sent);
  await post(app, '/api/auth/forgot', { email: 'ana@example.com' }); await tick();
  const t2 = tokenFrom(sent);
  assert.notEqual(t1, t2);
  assert.equal((await post(app, '/api/auth/reset', { token: t1, password: 'otra-contrasena-99' })).statusCode, 400);
  assert.equal((await post(app, '/api/auth/reset', { token: t2, password: 'otra-contrasena-99' })).statusCode, 200);
  void clock;
  await app.close();
});

test('reset: cambia contraseña, invalida sesiones, un solo uso', async () => {
  const { app, sent, db } = await setup();
  const l = await login(app);
  await post(app, '/api/auth/forgot', { email: 'ana@example.com' }); await tick();
  const token = tokenFrom(sent);
  const NEW = 'nueva-contrasena-77';
  const r = await post(app, '/api/auth/reset', { token, password: NEW });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { message: 'Contraseña cambiada. Ya puedes entrar.' });
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal((await me(app, cookieVal(l, AT))).statusCode, 401);
  assert.equal((await refresh(app, cookieVal(l, RT))).statusCode, 401);
  assert.equal((await login(app, 'ana@example.com', PW)).statusCode, 401);
  assert.equal((await login(app, 'ana@example.com', NEW)).statusCode, 200);
  const again = await post(app, '/api/auth/reset', { token, password: 'tercera-contrasena-5' });
  assert.equal(again.statusCode, 400);
  assert.deepEqual(again.json(), { error: 'El enlace no es válido o ha caducado' });
  assert.equal((await db.query('select count(*)::int as n from users')).rows[0].n, 1);
  await app.close();
});

test('reset: caduca a los 30 min; contraseña débil -> 400; kind verify no sirve; marca correo verificado', async () => {
  const { app, sent, clock, db } = await setup();
  await post(app, '/api/auth/forgot', { email: 'ana@example.com' }); await tick();
  const token = tokenFrom(sent);
  const weak = await post(app, '/api/auth/reset', { token, password: 'corta' });
  assert.equal(weak.statusCode, 400);
  assert.match(weak.json().error, /10 caracteres/);
  clock.t += 31 * 60_000;
  const late = await post(app, '/api/auth/reset', { token, password: 'nueva-contrasena-77' });
  assert.equal(late.statusCode, 400);
  assert.deepEqual(late.json(), { error: 'El enlace no es válido o ha caducado' });
  assert.equal((await post(app, '/api/auth/reset', { token: 'zzzzzzzzzzzzzzzzzzzzzzzz', password: 'nueva-contrasena-77' })).statusCode, 400);
  assert.equal((await post(app, '/api/auth/reset', { token: 5, password: 'nueva-contrasena-77' })).statusCode, 400);
  await app.close();
  // correo sin verificar queda verificado al restablecer
  const t2 = await setup({}, 'bea@example.com');
  await t2.db.query('update users set email_verified_at = null');
  await post(t2.app, '/api/auth/forgot', { email: 'bea@example.com' }); await tick();
  assert.equal((await post(t2.app, '/api/auth/reset', { token: tokenFrom(t2.sent), password: 'nueva-contrasena-77' })).statusCode, 200);
  assert.ok((await t2.db.query('select email_verified_at from users')).rows[0].email_verified_at);
  void db;
  await t2.app.close();
});

test('reset: un token de verificación pendiente no puede pisar la contraseña nueva después', async () => {
  const { app, sent, db } = await setup();
  await post(app, '/api/auth/register', { email: 'ana@example.com', password: 'contrasena-atacante-1' }); await tick();
  const verifyTok = tokenFrom(sent);
  await post(app, '/api/auth/forgot', { email: 'ana@example.com' }); await tick();
  await post(app, '/api/auth/reset', { token: tokenFrom(sent), password: 'nueva-contrasena-77' });
  assert.equal((await post(app, '/api/auth/verify', { token: verifyTok })).statusCode, 400);
  assert.equal((await login(app, 'ana@example.com', 'nueva-contrasena-77')).statusCode, 200);
  void db;
  await app.close();
});

test('login: el 6.º intento en un minuto con la misma IP+correo -> 429 en español', async () => {
  const { app } = await setup({}, 'ana@example.com');
  for (let i = 0; i < 5; i++) assert.equal((await login(app, 'ana@example.com', 'mala-contrasena-1')).statusCode, 401);
  const r = await login(app, 'ana@example.com', PW);
  assert.equal(r.statusCode, 429);
  assert.deepEqual(r.json(), { error: 'Demasiados intentos. Prueba más tarde.' });
  assert.equal(r.headers['cache-control'], 'no-store');
  // otro correo desde la misma IP aún entra
  assert.equal((await login(app, 'otro@example.com', PW)).statusCode, 401);
  await app.close();
});

test('login: 30/h por IP aunque cambie el correo', async () => {
  const { app } = await setup();
  for (let i = 0; i < 30; i++) assert.equal((await login(app, `u${i}@example.com`, PW)).statusCode, 401);
  assert.equal((await login(app, 'u99@example.com', PW)).statusCode, 429);
  await app.close();
});

test('X-Forwarded-For: cuenta el último salto de confianza; falsificar el primero no reinicia', async () => {
  const { app } = await setup();
  const hdr = (i) => ({ ...H, 'x-forwarded-for': `${i}.${i}.${i}.${i}, 9.9.9.9` });
  for (let i = 1; i <= 5; i++) assert.equal((await login(app, 'ana@example.com', 'mala-contrasena-1', hdr(i))).statusCode, 401);
  assert.equal((await login(app, 'ana@example.com', PW, hdr(77))).statusCode, 429);
  // otra IP real (último salto distinto) tiene contadores propios
  const other = { ...H, 'x-forwarded-for': '1.1.1.1, 8.8.8.8' };
  assert.equal((await login(app, 'ana@example.com', PW, other)).statusCode, 200);
  await app.close();
});

test('bloqueo: 10 fallos seguidos -> 15 min de 429 aunque cambie la IP y la clave sea buena; exista o no', async () => {
  const { app, clock } = await setup();
  const ipH = (i) => ({ ...H, 'x-forwarded-for': `10.0.0.${i}` });
  for (let i = 0; i < 10; i++) {
    assert.equal((await login(app, 'ana@example.com', 'mala-contrasena-1', ipH(i + 1))).statusCode, 401);
    clock.t += 15_000; // separa los intentos fuera de la ventana de 1 min no hace falta: IP distinta
  }
  let r = await login(app, 'ana@example.com', PW, ipH(50));
  assert.equal(r.statusCode, 429);
  assert.deepEqual(r.json(), { error: 'Demasiados intentos. Prueba más tarde.' });
  clock.t += 14 * 60_000;
  assert.equal((await login(app, 'ana@example.com', PW, ipH(51))).statusCode, 429);
  clock.t += 2 * 60_000;
  assert.equal((await login(app, 'ana@example.com', PW, ipH(52))).statusCode, 200);
  // correo inexistente: se bloquea igual (SR-15)
  for (let i = 0; i < 10; i++) await login(app, 'fantasma@example.com', PW, ipH(100 + i));
  assert.equal((await login(app, 'fantasma@example.com', PW, ipH(120))).statusCode, 429);
  await app.close();
});

test('bloqueo: un login correcto reinicia el contador de fallos', async () => {
  const { app } = await setup();
  const ipH = (i) => ({ ...H, 'x-forwarded-for': `10.1.0.${i}` });
  for (let i = 0; i < 9; i++) await login(app, 'ana@example.com', 'mala-contrasena-1', ipH(i + 1));
  assert.equal((await login(app, 'ana@example.com', PW, ipH(20))).statusCode, 200);
  for (let i = 0; i < 9; i++) assert.equal((await login(app, 'ana@example.com', 'mala-contrasena-1', ipH(30 + i))).statusCode, 401);
  assert.equal((await login(app, 'ana@example.com', PW, ipH(60))).statusCode, 200);
  await app.close();
});

test('registro: 5/h por IP; forgot: 3/h por correo y 10/h por IP', async () => {
  const { app } = await setup();
  for (let i = 0; i < 4; i++) assert.equal((await post(app, "/api/auth/register", { email: `r${i}@example.com`, password: PW })).statusCode, 202);
  const r = await post(app, '/api/auth/register', { email: 'r9@example.com', password: PW });
  assert.equal(r.statusCode, 429);
  assert.deepEqual(r.json(), { error: 'Demasiados intentos. Prueba más tarde.' });
  for (let i = 0; i < 3; i++) assert.equal((await post(app, '/api/auth/forgot', { email: 'ana@example.com' })).statusCode, 202);
  assert.equal((await post(app, '/api/auth/forgot', { email: 'ANA@example.com' })).statusCode, 429);
  for (let i = 0; i < 6; i++) assert.equal((await post(app, "/api/auth/forgot", { email: `f${i}@example.com` })).statusCode, 202);
  assert.equal((await post(app, '/api/auth/forgot', { email: 'f9@example.com' })).statusCode, 429);
  await app.close();
});

// ---- Fix round 1 ----
test('gracia: el texto cifrado del predecesor se borra pasados 20 s (en cualquier refresh o login)', async () => {
  for (const trigger of ['refresh', 'login']) {
    const { app, clock, db } = await setup();
    const l = await login(app);
    const rt0 = cookieVal(l, RT);
    const r1 = await refresh(app, rt0);
    assert.ok((await db.query('select 1 from refresh_tokens where grace_token_enc is not null')).rows.length === 1);
    clock.t += 21_000;
    if (trigger === 'refresh') assert.equal((await refresh(app, cookieVal(r1, RT))).statusCode, 200);
    else assert.equal((await login(app)).statusCode, 200);
    const left = (await db.query('select count(*)::int as n from refresh_tokens where grace_token_enc is not null and rotated_at < $1', [new Date(clock.t - 20_000)])).rows[0].n;
    assert.equal(left, 0, trigger);
    await app.close();
  }
});

test('gracia: solo el token inmediatamente anterior; rt0 tras rt0->rt1->rt2 revoca la familia', async () => {
  const { app, clock, db } = await setup();
  const rt0 = cookieVal(await login(app), RT);
  const r1 = await refresh(app, rt0);
  clock.t += 1000;
  const r2 = await refresh(app, cookieVal(r1, RT));
  assert.equal(r2.statusCode, 200);
  clock.t += 1000;
  const bad = await refresh(app, rt0);
  assert.equal(bad.statusCode, 401);
  assert.equal((await refresh(app, cookieVal(r2, RT))).statusCode, 401);
  assert.equal((await db.query('select count(*)::int as n from refresh_tokens where revoked_at is null')).rows[0].n, 0);
  await app.close();
});

test('reset: un token inválido no calcula argon2', async () => {
  let calls = 0;
  const { hashPassword } = await import('../src/lib/passwords.js');
  const { app, sent } = await setup({ __buildApp: { hasher: (pw) => { calls++; return hashPassword(pw); } } });
  const n0 = calls;
  const r = await post(app, '/api/auth/reset', { token: 'q'.repeat(43), password: 'nueva-contrasena-77' });
  assert.equal(r.statusCode, 400);
  assert.equal(calls, n0);
  await post(app, '/api/auth/forgot', { email: 'ana@example.com' }); await tick();
  assert.equal((await post(app, '/api/auth/reset', { token: tokenFrom(sent), password: 'nueva-contrasena-77' })).statusCode, 200);
  assert.equal(calls, n0 + 1);
  await app.close();
});

test('reset: limpia el bloqueo del correo', async () => {
  const { app, sent } = await setup();
  const ipH = (i) => ({ ...H, 'x-forwarded-for': `10.2.0.${i}` });
  for (let i = 0; i < 10; i++) await login(app, 'ana@example.com', 'mala-contrasena-1', ipH(i + 1));
  assert.equal((await login(app, 'ana@example.com', PW, ipH(40))).statusCode, 429);
  await post(app, '/api/auth/forgot', { email: 'ana@example.com' }, ipH(41)); await tick();
  assert.equal((await post(app, '/api/auth/reset', { token: tokenFrom(sent), password: 'nueva-contrasena-77' }, ipH(42))).statusCode, 200);
  assert.equal((await login(app, 'ana@example.com', 'nueva-contrasena-77', ipH(43))).statusCode, 200);
  await app.close();
});
