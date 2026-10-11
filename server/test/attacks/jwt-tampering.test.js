// Ataque: fabricar o reutilizar tokens de acceso (SR-6, SR-8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { setup, apiUser, cookieVal, AT, RT } from './_lib.js';

const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function hs256(secret, header, payload) {
  const data = `${b64u(header)}.${b64u(payload)}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}
const me = (s, token) => s.req('GET', '/api/auth/me', { cookie: `${AT}=${token}` });

test('tokens falsificados o alterados => 401 en /api/auth/me y en /api/docs', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  const now = Math.floor(s.clock.t / 1000);
  const good = { sub: u.id, ver: 0, iss: 'odyle', aud: 'odyle-web', iat: now, exp: now + 900 };
  assert.equal((await me(s, u.at)).statusCode, 200, 'control: el token legítimo vale');
  const key = s.config.jwtSecret;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
  const [h, p] = u.at.split('.');
  const forged = {
    'alg none': `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u(good)}.`,
    'alg None sin firma': `${b64u({ alg: 'None' })}.${b64u(good)}.`,
    'RS256 firmado con clave ajena': await new SignJWT(good).setProtectedHeader({ alg: 'RS256' }).sign(privateKey),
    'confusión HS256 con la clave pública como secreto': hs256(pubPem, { alg: 'HS256', typ: 'JWT' }, good),
    'HS512 con el secreto real': await new SignJWT(good).setProtectedHeader({ alg: 'HS512' }).sign(key),
    'firma cambiada': `${h}.${p}.${'A'.repeat(43)}`,
    'payload cambiado (otro sub) con firma original': `${h}.${b64u({ ...good, sub: 'u_' + 'Z'.repeat(22) })}.${u.at.split('.')[2]}`,
    'caducado (exp hace 10 s)': await new SignJWT({ ...good, exp: now - 10 }).setProtectedHeader({ alg: 'HS256' }).sign(key),
    'sin exp': await new SignJWT({ sub: u.id, ver: 0, iss: 'odyle', aud: 'odyle-web', iat: now }).setProtectedHeader({ alg: 'HS256' }).sign(key),
    'iss ajeno': await new SignJWT({ ...good, iss: 'evil' }).setProtectedHeader({ alg: 'HS256' }).sign(key),
    'aud ajena': await new SignJWT({ ...good, aud: 'other' }).setProtectedHeader({ alg: 'HS256' }).sign(key),
    'sub con formato raro': await new SignJWT({ ...good, sub: `${u.id}' or '1'='1` }).setProtectedHeader({ alg: 'HS256' }).sign(key),
    'sub inexistente bien formado': await new SignJWT({ ...good, sub: 'u_' + 'Q'.repeat(22) }).setProtectedHeader({ alg: 'HS256' }).sign(key),
    'ver no entero': await new SignJWT({ ...good, ver: '0' }).setProtectedHeader({ alg: 'HS256' }).sign(key),
    'ver futuro': await new SignJWT({ ...good, ver: 5 }).setProtectedHeader({ alg: 'HS256' }).sign(key),
    'kid/jku inyectados': await new SignJWT(good).setProtectedHeader({ alg: 'HS256', jku: 'https://evil.example/k', kid: '../../dev/null' }).sign(Buffer.alloc(32)),
    'basura': 'not.a.jwt',
  };
  for (const [label, tok] of Object.entries(forged)) {
    const r = await me(s, tok);
    assert.equal(r.statusCode, 401, `${label} -> ${r.statusCode}`);
    const d = await s.req('GET', `/api/docs/members/${u.id}`, { cookie: `${AT}=${tok}` });
    assert.equal(d.statusCode, 401, `${label} en docs -> ${d.statusCode}`);
  }
  // Tolerancia de reloj ≤ 5 s: 6 s tras exp ya no vale.
  const edge = await new SignJWT({ ...good, exp: now - 6 }).setProtectedHeader({ alg: 'HS256' }).sign(key);
  assert.equal((await me(s, edge)).statusCode, 401, 'tolerancia > 5 s');
  await s.app.close();
});

test('token de acceso con ver antiguo tras logout-all, reset o verificación => 401 en la petición siguiente (SR-8)', async () => {
  const s = await setup();
  const u = await apiUser(s, 'ana@example.com');
  assert.equal((await me(s, u.at)).statusCode, 200); // llena la caché
  const second = await (await import('./_lib.js')).apiLogin(s, 'ana@example.com');
  const out = await s.req('POST', '/api/auth/logout-all', { cookie: `${AT}=${second.at}` });
  assert.equal(out.statusCode, 200);
  assert.equal((await me(s, u.at)).statusCode, 401, 'el token de la otra sesión cae al momento');
  assert.equal((await me(s, second.at)).statusCode, 401);
  assert.equal((await s.req('POST', '/api/auth/refresh', { cookie: `${RT}=${u.rt}` })).statusCode, 401);
  // Reset: el token emitido antes del cambio de contraseña deja de valer.
  const third = await (await import('./_lib.js')).apiLogin(s, 'ana@example.com');
  assert.equal((await me(s, third.at)).statusCode, 200);
  await s.req('POST', '/api/auth/forgot', { payload: { email: 'ana@example.com' } });
  await new Promise((r) => setImmediate(r));
  const tok = /#t=([A-Za-z0-9_-]+)/.exec(s.sent.at(-1).text)[1];
  assert.equal((await s.req('POST', '/api/auth/reset', { payload: { token: tok, password: 'otra-contrasena-nueva-9' } })).statusCode, 200);
  assert.equal((await me(s, third.at)).statusCode, 401, 'tras reset');
  assert.equal(cookieVal(third.res, AT), third.at);
  await s.app.close();
});
