import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestApp } from './helpers.js';
import { safeNext } from '../src/lib/session.js';

const H = { origin: 'https://odyle.test', 'x-odyle-csrf': '1' };
const PW = 'una-contrasena-larga-1';
const post = (app, url, payload, headers = H) => app.inject({ method: 'POST', url, payload, headers });
const cookiesOf = (r) => [].concat(r.headers['set-cookie'] || []);
const jar = (r) => cookiesOf(r).map((c) => c.split(';')[0]).join('; ');
const tick = () => new Promise((res) => setImmediate(res));

async function registered(over = {}, email = 'ana@example.com') {
  const t = await makeTestApp(over);
  await post(t.app, '/api/auth/register', { email, password: PW });
  await tick();
  return t;
}
const tokenFrom = (sent) => /#t=([A-Za-z0-9_-]+)/.exec(sent[sent.length - 1].text)[1];

test('registro: 202, correo con enlace en fragmento, repetir no duplica', async () => {
  const { app, db, sent } = await makeTestApp();
  const r = await post(app, '/api/auth/register', { email: ' Ana@Example.com ', password: PW });
  assert.equal(r.statusCode, 202);
  assert.deepEqual(r.json(), { message: 'Si el correo es válido, te hemos enviado un enlace' });
  assert.equal(r.headers['cache-control'], 'no-store');
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ana@example.com');
  assert.match(sent[0].text, /https:\/\/odyle\.test\/verificar#t=[A-Za-z0-9_-]{43}/);
  assert.ok(!sent[0].text.includes('?token='));
  const r2 = await post(app, '/api/auth/register', { email: 'ana@example.com', password: PW });
  assert.equal(r2.statusCode, 202);
  assert.deepEqual(r2.json(), r.json());
  await tick();
  assert.equal((await db.query('select count(*)::int as n from users')).rows[0].n, 1);
  assert.equal(sent.length, 2); // cuenta sin verificar: correo nuevo
  await app.close();
});

test('registro de cuenta verificada no envía correo', async () => {
  const { app, sent } = await registered();
  await post(app, '/api/auth/verify', { token: tokenFrom(sent) });
  const n = sent.length;
  const r = await post(app, '/api/auth/register', { email: 'ana@example.com', password: PW });
  assert.equal(r.statusCode, 202);
  await tick();
  assert.equal(sent.length, n);
  await app.close();
});

test('registro: entradas inválidas -> 400', async () => {
  const { app } = await makeTestApp();
  let r = await post(app, '/api/auth/register', { email: 'nope', password: PW });
  assert.equal(r.statusCode, 400);
  assert.deepEqual(r.json(), { error: 'Escribe un correo válido' });
  r = await post(app, '/api/auth/register', { email: 'a@b.co', password: 'corta' });
  assert.equal(r.statusCode, 400);
  assert.match(r.json().error, /10 caracteres/);
  r = await post(app, '/api/auth/register', { email: 123, password: PW });
  assert.equal(r.statusCode, 400);
  await app.close();
});

test('el correo se envía después de responder (SR-16)', async () => {
  let release;
  const gate = new Promise((res) => { release = res; });
  const sent = [];
  const { app } = await makeTestApp({ __buildApp: { mailer: { async send(m) { await gate; sent.push(m); } } } });
  const r = await post(app, '/api/auth/register', { email: 'ana@example.com', password: PW });
  assert.equal(r.statusCode, 202); // responde aunque el envío siga bloqueado
  assert.equal(sent.length, 0);
  release();
  await app.close();
});

test('un fallo del mailer no rompe la petición', async () => {
  const { app } = await makeTestApp({ __buildApp: { mailer: { async send() { throw new Error('boom'); } } } });
  const r = await post(app, '/api/auth/register', { email: 'ana@example.com', password: PW });
  assert.equal(r.statusCode, 202);
  await tick();
  await app.close();
});

test('login sin verificar 403; tras verificar 200 con cookies exactas; token de un solo uso', async () => {
  const { app, sent } = await registered();
  let r = await post(app, '/api/auth/login', { email: 'ana@example.com', password: PW });
  assert.equal(r.statusCode, 403);
  assert.deepEqual(r.json(), { error: 'Verifica tu correo para entrar' });
  const token = tokenFrom(sent);
  r = await post(app, '/api/auth/verify', { token });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { message: 'Correo verificado' });
  r = await post(app, '/api/auth/verify', { token });
  assert.equal(r.statusCode, 400);
  assert.deepEqual(r.json(), { error: 'El enlace no es válido o ha caducado' });
  r = await post(app, '/api/auth/login', { email: 'ANA@example.com', password: PW });
  assert.equal(r.statusCode, 200);
  const body = r.json();
  assert.match(body.id, /^u_/);
  assert.equal(body.email, 'ana@example.com');
  assert.equal(body.verified, true);
  assert.equal(r.headers['cache-control'], 'no-store');
  const cs = cookiesOf(r);
  const at = cs.find((c) => c.startsWith('__Host-odyle_at='));
  const rt = cs.find((c) => c.startsWith('__Secure-odyle_rt='));
  assert.match(at, /; Path=\/;/);
  assert.match(at, /Max-Age=900/);
  assert.match(at, /HttpOnly/);
  assert.match(at, /Secure/);
  assert.match(at, /SameSite=Lax/);
  assert.ok(!/Domain=/i.test(at));
  assert.match(rt, /Path=\/api\/auth/);
  assert.match(rt, /Max-Age=2592000/);
  assert.match(rt, /HttpOnly/);
  assert.match(rt, /Secure/);
  assert.match(rt, /SameSite=Strict/);
  await app.close();
});

test('verify: token caducado o inexistente -> 400', async () => {
  let t = 1_000_000;
  const { app, sent } = await makeTestApp({ __buildApp: { now: () => t } });
  await post(app, '/api/auth/register', { email: 'ana@example.com', password: PW });
  await tick();
  const token = tokenFrom(sent);
  t += 24 * 3600 * 1000 + 1000;
  assert.equal((await post(app, '/api/auth/verify', { token })).statusCode, 400);
  assert.equal((await post(app, '/api/auth/verify', { token: 'x' })).statusCode, 400);
  assert.equal((await post(app, '/api/auth/verify', {})).statusCode, 400);
  await app.close();
});

test('login: contraseña incorrecta y correo inexistente dan el mismo 401', async () => {
  const { app, sent } = await registered();
  await post(app, '/api/auth/verify', { token: tokenFrom(sent) });
  const a = await post(app, '/api/auth/login', { email: 'ana@example.com', password: 'otra-contrasena-1' });
  const b = await post(app, '/api/auth/login', { email: 'nadie@example.com', password: PW });
  for (const r of [a, b]) {
    assert.equal(r.statusCode, 401);
    assert.deepEqual(r.json(), { error: 'Correo o contraseña incorrectos' });
    assert.equal(cookiesOf(r).length, 0);
  }
  const c = await post(app, '/api/auth/login', { email: 5, password: PW });
  assert.equal(c.statusCode, 401);
  await app.close();
});

test('me: con cookie devuelve usuario; sin cookie o con cookie falsa 401', async () => {
  const { app, sent } = await registered();
  await post(app, '/api/auth/verify', { token: tokenFrom(sent) });
  const l = await post(app, '/api/auth/login', { email: 'ana@example.com', password: PW });
  const r = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: jar(l) } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { id: l.json().id, email: 'ana@example.com', verified: true });
  assert.equal(r.headers['cache-control'], 'no-store');
  const n = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(n.statusCode, 401);
  assert.deepEqual(n.json(), { error: 'Sesión caducada' });
  const f = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: '__Host-odyle_at=basura' } });
  assert.equal(f.statusCode, 401);
  await app.close();
});

test('me: token_version distinto -> 401 (y la caché se puede invalidar)', async () => {
  const { app, db, sent } = await registered();
  await post(app, '/api/auth/verify', { token: tokenFrom(sent) });
  const l = await post(app, '/api/auth/login', { email: 'ana@example.com', password: PW });
  const headers = { cookie: jar(l) };
  assert.equal((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode, 200);
  await db.query('update users set token_version = token_version + 1');
  const { invalidateUserCache } = await import('../src/lib/session.js');
  invalidateUserCache(l.json().id);
  assert.equal((await app.inject({ method: 'GET', url: '/api/auth/me', headers })).statusCode, 401);
  await app.close();
});

test('CSRF: POST sin cabecera, sin Origin o con Origin ajeno -> 403; GET libre', async () => {
  const { app } = await makeTestApp();
  const body = { email: 'ana@example.com', password: PW };
  for (const url of ['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/verify']) {
    for (const headers of [
      { origin: 'https://odyle.test' },
      { 'x-odyle-csrf': '1' },
      { origin: 'https://evil.example', 'x-odyle-csrf': '1' },
      { origin: 'https://odyle.test', 'x-odyle-csrf': '0' },
    ]) {
      const r = await post(app, url, body, headers);
      assert.equal(r.statusCode, 403, url);
      assert.deepEqual(r.json(), { error: 'Petición rechazada' });
    }
  }
  assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 200);
  await app.close();
});

test('EMAIL_MODE=owner-only: entra sin verificar, sin correos, verified:false', async () => {
  const { app, sent } = await makeTestApp({ EMAIL_MODE: 'owner-only' });
  const g = await post(app, '/api/auth/register', { email: 'ana@example.com', password: PW });
  assert.equal(g.statusCode, 202);
  await tick();
  assert.equal(sent.length, 0);
  const r = await post(app, '/api/auth/login', { email: 'ana@example.com', password: PW });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().verified, false);
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: jar(r) } });
  assert.equal(me.json().verified, false);
  await app.close();
});

test('logout: borra cookies y revoca la familia', async () => {
  const { app, db, sent } = await registered();
  await post(app, '/api/auth/verify', { token: tokenFrom(sent) });
  const l = await post(app, '/api/auth/login', { email: 'ana@example.com', password: PW });
  const r = await post(app, '/api/auth/logout', undefined, { ...H, cookie: jar(l) });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { ok: true });
  const cs = cookiesOf(r);
  assert.ok(cs.find((c) => c.startsWith('__Host-odyle_at=;') && /Max-Age=0/.test(c) && /Path=\/;/.test(c)));
  assert.ok(cs.find((c) => c.startsWith('__Secure-odyle_rt=;') && /Max-Age=0/.test(c) && /Path=\/api\/auth/.test(c)));
  const rows = (await db.query('select revoked_at from refresh_tokens')).rows;
  assert.equal(rows.length, 1);
  assert.ok(rows.every((x) => x.revoked_at));
  // sin sesión también responde 200
  const r2 = await post(app, '/api/auth/logout');
  assert.equal(r2.statusCode, 200);
  await app.close();
});

test('login siempre crea una familia nueva; user_agent truncado', async () => {
  const { app, db, sent } = await registered();
  await post(app, '/api/auth/verify', { token: tokenFrom(sent) });
  for (let i = 0; i < 2; i++) {
    await post(app, '/api/auth/login', { email: 'ana@example.com', password: PW }, { ...H, 'user-agent': 'x'.repeat(500) });
  }
  const rows = (await db.query('select family_id, user_agent, token_hash from refresh_tokens')).rows;
  assert.equal(new Set(rows.map((x) => x.family_id)).size, 2);
  assert.ok(rows.every((x) => x.user_agent.length === 200 && /^[0-9a-f]{64}$/.test(x.token_hash)));
  await app.close();
});

test('SR-15: registrar un correo existente cuesta lo mismo y responde igual', async () => {
  const { app } = await registered();
  const t0 = performance.now();
  const a = await post(app, '/api/auth/register', { email: 'nuevo@example.com', password: PW });
  const dNew = performance.now() - t0;
  const t1 = performance.now();
  const b = await post(app, '/api/auth/register', { email: 'ana@example.com', password: PW });
  const dOld = performance.now() - t1;
  assert.equal(a.statusCode, b.statusCode);
  assert.deepEqual(a.json(), b.json());
  assert.ok(dOld > dNew * 0.4, `existente ${dOld}ms vs nuevo ${dNew}ms`);
  await app.close();
});

test('safeNext (SR-14)', () => {
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil', '/estadisticas', '/#', undefined, 5, '/#Legion', '/#' + 'a'.repeat(33), '/#a b']) {
    assert.equal(safeNext(bad), bad === '/#' ? '/#' : '/');
  }
  assert.equal(safeNext('/#legion'), '/#legion');
  assert.equal(safeNext('/'), '/');
});

test('createMailer: POST a Resend, sin lanzar ni registrar el cuerpo', async () => {
  const { createMailer } = await import('../src/lib/mail.js');
  const cfg = { resendKey: 're_secret', mailFrom: 'Odyle <no-reply@odyle.test>' };
  let call;
  const logs = [];
  const log = { error: (...a) => logs.push(JSON.stringify(a)) };
  await createMailer(cfg, { log, fetchImpl: async (url, init) => { call = { url, init }; return { ok: true }; } })
    .send({ to: 'a@b.co', subject: 'S', text: 'cuerpo secreto' });
  assert.equal(call.url, 'https://api.resend.com/emails');
  assert.equal(call.init.headers.authorization, 'Bearer re_secret');
  assert.deepEqual(JSON.parse(call.init.body), { from: cfg.mailFrom, to: ['a@b.co'], subject: 'S', text: 'cuerpo secreto' });
  await createMailer(cfg, { log, fetchImpl: async () => { throw Object.assign(new Error('x re_secret cuerpo secreto'), { code: 'ECONNRESET' }); } })
    .send({ to: 'a@b.co', subject: 'S', text: 'cuerpo secreto' });
  await createMailer(cfg, { log, fetchImpl: async () => ({ ok: false, status: 500 }) }).send({ to: 'a@b.co', subject: 'S', text: 'cuerpo secreto' });
  assert.ok(logs.length === 2 && logs.every((l) => !l.includes('re_secret') && !l.includes('cuerpo')));
});
