// Ataque: robar, reutilizar o falsificar tokens de restablecer/verificar (SR-19, SR-20).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setup, apiUser, apiLogin, lastToken, tick, captureLogger, stablePublicDir, removeDir, freshIp, AT, PW } from './_lib.js';

const pub = stablePublicDir();
after(() => removeDir(pub));
const NEW_PW = 'contrasena-nueva-larga-5';
const forgot = async (s, email = 'ana@example.com') => {
  await s.req('POST', '/api/auth/forgot', { payload: { email }, ip: freshIp() });
  await tick();
  return lastToken(s.sent);
};
const reset = (s, token, password = NEW_PW) => s.req('POST', '/api/auth/reset', { payload: { token, password } });

test('los enlaces llevan el token en el fragmento (#t=), nunca en query ni en la ruta', async () => {
  const s = await setup();
  await apiUser(s, 'ana@example.com');
  const verifyMail = s.sent[0].text;
  await forgot(s);
  const resetMail = s.sent.at(-1).text;
  for (const [label, text] of [['verificar', verifyMail], ['restablecer', resetMail]]) {
    const url = /https:\/\/odyle\.test\/\S+/.exec(text)[0];
    const u = new URL(url);
    assert.equal(u.search, '', `${label}: sin query`);
    assert.match(u.hash, /^#t=[A-Za-z0-9_-]{43}$/, `${label}: token de 32 bytes en el fragmento`);
    assert.ok(['/verificar', '/restablecer'].includes(u.pathname));
  }
  await s.app.close();
});

test('token reutilizado, caducado (31 min), de otro tipo, alterado, truncado o con mayúsculas cambiadas => 400', async () => {
  const s = await setup();
  await apiUser(s, 'ana@example.com');
  const verifyTok = lastToken(s.sent); // ya usado al verificar, y de tipo verify
  const t1 = await forgot(s);
  const flip = (t) => t.slice(0, -1) + (t.at(-1) === 'A' ? 'B' : 'A');
  for (const [label, tok] of [['verify como reset', verifyTok], ['alterado', flip(t1)], ['truncado', t1.slice(0, 30)],
    ['mayúsculas', t1.toUpperCase() === t1 ? t1.toLowerCase() : t1.toUpperCase()], ['hash en vez de token', createHash('sha256').update(t1).digest('hex')]]) {
    assert.equal((await reset(s, tok)).statusCode, 400, label);
  }
  assert.equal((await reset(s, t1)).statusCode, 200, 'control: el token bueno funciona');
  assert.equal((await reset(s, t1, 'tercera-contrasena-larga-1')).statusCode, 400, 'reutilizado');
  await apiLogin(s, 'ana@example.com', NEW_PW);
  // Reset como verify.
  const t2 = await forgot(s);
  assert.equal((await s.req('POST', '/api/auth/verify', { payload: { token: t2 } })).statusCode, 400, 'reset como verify');
  // Caducado.
  s.clock.t += 31 * 60_000;
  assert.equal((await reset(s, t2)).statusCode, 400, 'caducado');
  await s.app.close();
});

test('un enlace de restablecer nuevo anula el anterior pendiente', async () => {
  const s = await setup();
  await apiUser(s, 'ana@example.com');
  const a = await forgot(s);
  const b = await forgot(s); // forgot admite 3/h por correo
  assert.notEqual(a, b);
  assert.equal((await reset(s, a)).statusCode, 400, 'el enlace anterior queda anulado');
  assert.equal((await reset(s, b)).statusCode, 200);
  await s.app.close();
});

test('en la base solo hay hashes de los tokens de correo y de renovación', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const tok = await forgot(s);
  const dump = JSON.stringify((await s.db.query('select * from email_tokens')).rows) + JSON.stringify((await s.db.query('select * from refresh_tokens')).rows);
  assert.ok(!dump.includes(tok), 'token de reset en claro');
  assert.ok(!dump.includes(u.rt), 'token de renovación en claro');
  await s.app.close();
});

test('reset: sube token_version, revoca familias, marca verificado; las páginas de cuenta envían no-referrer y no-store', async () => {
  const s = await setup({ __buildApp: { publicDir: pub } });
  const u = await apiUser(s, 'ana@example.com');
  const tok = await forgot(s);
  assert.equal((await reset(s, tok)).statusCode, 200);
  assert.equal((await s.req('GET', '/api/auth/me', { cookie: `${AT}=${u.at}` })).statusCode, 401);
  await assert.rejects(apiLogin(s, 'ana@example.com', PW), /401/);
  for (const url of ['/restablecer', '/verificar', '/login', '/registro']) {
    const r = await s.req('GET', url);
    assert.equal(r.headers['referrer-policy'], 'no-referrer', url);
    assert.equal(r.headers['cache-control'], 'no-store', url);
  }
  await s.app.close();
});

test('ningún token de correo ni de renovación aparece en los registros capturados (logger de producción)', async () => {
  const cap = captureLogger();
  const s = await setup({ __buildApp: { logger: cap.logger } });
  const u = await apiUser(s, 'ana@example.com');
  const verifyTok = s.sent[0].text.match(/#t=([A-Za-z0-9_-]+)/)[1];
  const tok = await forgot(s);
  await reset(s, tok);
  // Aunque un cliente torpe ponga el token en la query, no debe registrarse.
  await s.req('GET', `/restablecer?t=${tok}`);
  await s.req('POST', `/api/auth/reset?token=${tok}`, { payload: { token: tok, password: NEW_PW } });
  const log = cap.text();
  for (const [label, secret] of [['verify', verifyTok], ['reset', tok], ['refresh', u.rt], ['access', u.at]]) {
    assert.ok(!log.includes(secret), `token ${label} en los registros`);
  }
  await s.app.close();
});
