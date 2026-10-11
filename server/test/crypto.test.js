import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { hashPassword, verifyPassword, DUMMY_HASH, checkPasswordPolicy } from '../src/lib/passwords.js';
import { randomToken, sha256hex, newUserId } from '../src/lib/tokens.js';
import { signAccess, verifyAccess } from '../src/lib/jwt.js';
import { encryptCode, decryptCode } from '../src/lib/codecrypt.js';

const config = { jwtSecret: new Uint8Array(randomBytes(48)), codeKey: randomBytes(32) };
const SUB = 'u_' + 'a'.repeat(22);
const NOW = 1_800_000_000_000;

test('política de contraseñas', () => {
  assert.ok(checkPasswordPolicy('corta'));
  assert.ok(checkPasswordPolicy('password123'));
  assert.ok(checkPasswordPolicy('PassWord123'));
  assert.equal(checkPasswordPolicy('x7Kq-2mZp9!'), null);
  assert.ok(checkPasswordPolicy('a1B2c3D4e5'.repeat(13)));
  assert.equal(checkPasswordPolicy('a1B2c3D4e5'.repeat(12) + 'xxxxxxxx'), null);
});

test('hash y verificación', async () => {
  const h = await hashPassword('Abc-12345-xyz');
  assert.match(h, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(await verifyPassword(h, 'Abc-12345-xyz'), true);
  assert.equal(await verifyPassword(h, 'otra-cosa-larga'), false);
  assert.equal(await verifyPassword(DUMMY_HASH, 'x'), false);
  assert.equal(await verifyPassword('basura', 'x'), false);
});

test('semáforo: muchas verificaciones simultáneas terminan', async () => {
  const h = await hashPassword('Abc-12345-xyz');
  const r = await Promise.all(Array.from({ length: 10 }, () => verifyPassword(h, 'Abc-12345-xyz')));
  assert.ok(r.every(Boolean));
});

test('tokens e ids', () => {
  assert.match(randomToken(), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(randomToken(), randomToken());
  assert.match(sha256hex('a'), /^[0-9a-f]{64}$/);
  for (let i = 0; i < 50; i++) assert.match(newUserId(), /^u_[A-Za-z0-9]{22}$/);
});

test('JWT válido y rechazos', async () => {
  const t = await signAccess(config, { sub: SUB, ver: 3 }, NOW);
  assert.deepEqual(await verifyAccess(config, t, NOW + 1000), { sub: SUB, ver: 3 });
  assert.equal(await verifyAccess(config, t, NOW + 16 * 60_000), null);
  assert.equal(await verifyAccess(config, t.slice(0, -3) + 'AAA', NOW), null);
  assert.equal(await verifyAccess(config, 'basura', NOW), null);

  const other = { jwtSecret: new Uint8Array(randomBytes(48)) };
  assert.equal(await verifyAccess(other, t, NOW), null);

  const mk = (alg, o = {}) =>
    new SignJWT({ ver: 1 })
      .setProtectedHeader({ alg })
      .setSubject(o.sub ?? SUB)
      .setIssuer(o.iss ?? 'odyle')
      .setAudience(o.aud ?? 'odyle-web')
      .setIssuedAt(Math.floor(NOW / 1000))
      .setExpirationTime(Math.floor(NOW / 1000) + 900)
      .sign(config.jwtSecret);
  assert.deepEqual(await verifyAccess(config, await mk('HS256'), NOW), { sub: SUB, ver: 1 });
  assert.equal(await verifyAccess(config, await mk('HS512'), NOW), null);
  assert.equal(await verifyAccess(config, await mk('HS256', { aud: 'x' }), NOW), null);
  assert.equal(await verifyAccess(config, await mk('HS256', { iss: 'x' }), NOW), null);
  assert.equal(await verifyAccess(config, await mk('HS256', { sub: 'u_corto' }), NOW), null);

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: SUB, ver: 1, iss: 'odyle', aud: 'odyle-web', exp: Math.floor(NOW / 1000) + 900 })}.`;
  assert.equal(await verifyAccess(config, none, NOW), null);

  const noExp = await new SignJWT({ ver: 1 }).setProtectedHeader({ alg: 'HS256' }).setSubject(SUB)
    .setIssuer('odyle').setAudience('odyle-web').sign(config.jwtSecret);
  assert.equal(await verifyAccess(config, noExp, NOW), null);
});

test('cifrado de códigos', () => {
  const b = encryptCode(config.codeKey, 'K7Q2XM9P', 'L1');
  assert.equal(b.split('.').length, 3);
  assert.notEqual(b, encryptCode(config.codeKey, 'K7Q2XM9P', 'L1'));
  assert.equal(decryptCode(config.codeKey, b, 'L1'), 'K7Q2XM9P');
  assert.equal(decryptCode(config.codeKey, b, 'L2'), null);
  assert.equal(decryptCode(config.codeKey, b), null);
  const [iv, tag, c] = b.split('.');
  const flipped = Buffer.from(c, 'base64url'); flipped[0] ^= 1;
  assert.equal(decryptCode(config.codeKey, [iv, tag, flipped.toString('base64url')].join('.'), 'L1'), null);
  assert.equal(decryptCode(config.codeKey, 'a.b', 'L1'), null);
  assert.equal(decryptCode(randomBytes(32), b, 'L1'), null);
});

test('createLimiter: pico de concurrencia <= max, incluso con rechazos', async () => {
  const { createLimiter } = await import('../src/lib/passwords.js');
  const limited = createLimiter(4);
  let running = 0, peak = 0, done = 0;
  const task = (i) => limited(async () => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--; done++;
    if (i % 3 === 0) throw new Error('boom');
    return i;
  });
  const res = await Promise.allSettled(Array.from({ length: 40 }, (_, i) => task(i)));
  // also launch late arrivals while slots are being released
  const late = [];
  for (let i = 0; i < 20; i++) { late.push(task(1)); await new Promise((r) => setImmediate(r)); }
  await Promise.all(late);
  assert.equal(done, 60);
  assert.equal(res.filter((r) => r.status === 'rejected').length, 14);
  assert.ok(peak <= 4 && peak >= 2, `peak=${peak}`);
});
