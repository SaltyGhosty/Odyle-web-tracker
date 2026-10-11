// Ataque: reutilizar, adivinar o romper códigos de legión (SR-31, SR-32).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setup, quickUser, as, legionWith, freshIp } from './_lib.js';
import { sealCode, openCode, codeHash, generateCode } from '../../src/lib/legion-codes.js';

const join = (s, u, code) => as(s, u)('POST', '/api/legions/join', { code }, { ip: freshIp() });

test('el código antiguo deja de valer tras new-code y tras kick; el expulsado no vuelve ni con el código nuevo', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const K = await quickUser(s, 'expulsado'); const N = await quickUser(s, 'nuevo'); const N2 = await quickUser(s, 'nuevo2');
  const g = await legionWith(s, L, [K]);
  const lead = as(s, L);
  assert.equal((await lead('POST', '/api/legions/mine/kick', { uid: K.id })).statusCode, 200);
  assert.equal((await join(s, K, g.code)).statusCode, 400, 'expulsado con el código antiguo');
  assert.equal((await join(s, N, g.code)).statusCode, 400, 'cualquiera con el código antiguo tras kick');
  const fresh = (await lead('GET', '/api/legions/mine/code')).json().code;
  assert.notEqual(fresh, g.code);
  assert.equal((await join(s, K, fresh)).statusCode, 403, 'expulsado con el código nuevo');
  const rotated = (await lead('POST', '/api/legions/mine/code', {})).json().code;
  assert.equal((await join(s, N, fresh)).statusCode, 400, 'código anterior tras new-code');
  assert.equal((await join(s, N2, rotated)).statusCode, 200, 'control');
  await s.app.close();
});

test('code_hash no es SHA-256 simple del código (ni con el prefijo de legion.js); la tabla no guarda el código en claro', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider');
  const g = await legionWith(s, L, []);
  const row = (await s.db.query('select code_hash, code_enc from legion_codes where legion_id = $1', [L.id])).rows[0];
  const sha = (x) => createHash('sha256').update(x).digest('hex');
  for (const guess of [sha(g.code), sha(`odyle:${g.code}`), sha(g.code.toLowerCase()), sha(`${L.id}:${g.code}`)]) assert.notEqual(row.code_hash, guess);
  assert.ok(!row.code_enc.includes(g.code) && !Buffer.from(row.code_enc.replace(/\./g, ''), 'base64url').toString('latin1').includes(g.code));
  await s.app.close();
});

test('code_enc de una legión copiado en otra no descifra (AAD = id de legión) y el líder B no obtiene el código de A', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a'); const B = await quickUser(s, 'b');
  const ga = await legionWith(s, A, [], 'Legión A');
  await legionWith(s, B, [], 'Legión B');
  const encA = (await s.db.query('select code_enc from legion_codes where legion_id = $1', [A.id])).rows[0].code_enc;
  assert.equal(openCode(s.config.codeKey, encA, B.id), null, 'descifra con el id de otra legión');
  await s.db.query('update legion_codes set code_enc = $1 where legion_id = $2', [encA, B.id]);
  const r = await as(s, B)('GET', '/api/legions/mine/code');
  assert.notEqual(r.statusCode, 200);
  assert.ok(!r.body.includes(ga.code), 'B ve el código de A');
  await s.app.close();
});

test('dos cifrados del mismo código difieren (nonce aleatorio de 12 bytes); los códigos no se repiten ni siguen un patrón', () => {
  const key = Buffer.alloc(32, 5);
  const a = sealCode(key, 'ABCDEFGH', 'u_x'); const b = sealCode(key, 'ABCDEFGH', 'u_x');
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a.split('.')[0], 'base64url').length, 12);
  assert.notEqual(a.split('.')[0], b.split('.')[0]);
  assert.equal(openCode(key, a, 'u_x'), 'ABCDEFGH');
  const codes = new Set(Array.from({ length: 5000 }, generateCode));
  assert.equal(codes.size, 5000, 'colisiones en 5000 códigos');
  // Distribución por carácter razonablemente uniforme (31 símbolos).
  const freq = {};
  for (const c of codes) for (const ch of c) freq[ch] = (freq[ch] || 0) + 1;
  assert.equal(Object.keys(freq).length, 31);
  const exp = (5000 * 8) / 31;
  for (const [ch, n] of Object.entries(freq)) assert.ok(Math.abs(n - exp) < exp * 0.25, `${ch}: ${n}`);
  // El HMAC depende de la clave: otra CODE_KEY da otro hash.
  assert.notEqual(codeHash(Buffer.alloc(32, 1), 'ABCDEFGH'), codeHash(Buffer.alloc(32, 2), 'ABCDEFGH'));
});

test('fuerza bruta del código: 11.º intento por usuario en una hora => 429, aunque cambie la IP', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const X = await quickUser(s, 'x');
  const g = await legionWith(s, L, []);
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await join(s, X, 'ZZZZZZZZ')).statusCode);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(400));
  assert.equal(codes[10], 429);
  assert.equal((await join(s, X, g.code)).statusCode, 429, 'ni con el código bueno mientras dura el límite');
  await s.app.close();
});
