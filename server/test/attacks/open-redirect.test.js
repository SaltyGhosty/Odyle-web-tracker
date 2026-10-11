// Ataque: redirección abierta en "volver tras entrar" (SR-14). El navegador se prueba en dev/e2e-web.mjs;
// aquí se ejercita la regla del servidor y la del auth.js construido (la que se sirve a los usuarios).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { safeNext } from '../../src/lib/session.js';
import { setup, stablePublicDir, removeDir } from './_lib.js';

const pub = stablePublicDir();
after(() => removeDir(pub));

const EVIL = ['//evil.com', '/\\evil.com', '\\\\evil.com', 'https://evil.com', 'http:evil.com', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)',
  '%2F%2Fevil.com', '/%2F%2Fevil.com', '/%5Cevil.com', ' //evil.com', '\t//evil.com', '/\t/evil.com', '///evil.com', '/#/../..//evil.com',
  '/#a b', '/#' + 'a'.repeat(33), '/#A', '/#<script>', '/x', '/login', '/#legion\n//evil.com', 'data:text/html,<script>alert(1)</script>',
  '/ //evil.com', '/.evil.com', '/@evil.com', null, undefined, 42, ['/'], {}];

// Carga la función safeNext del auth.js construido en un contexto aislado (sin DOM).
function builtSafeNext() {
  const src = readFileSync(path.join(pub, 'auth.js'), 'utf8');
  const m = /const safeNext = (\([^)]*\) => [^\n]+);/.exec(src);
  assert.ok(m, 'auth.js construido define safeNext');
  return vm.runInNewContext(`(${m[1]})`);
}

test('servidor: safeNext solo deja "/" o "/#[a-z0-9-]{0,32}"', () => {
  for (const v of EVIL) assert.equal(safeNext(v), '/', `safeNext(${JSON.stringify(v)})`);
  for (const ok of ['/', '/#', '/#legion', '/#ajustes', '/#a-b-9']) assert.equal(safeNext(ok), ok);
});

test('auth.js servido: la misma regla; después de decodificar el parámetro next (URLSearchParams) nunca sale del origen', () => {
  const fn = builtSafeNext();
  for (const v of EVIL) {
    assert.equal(fn(v), '/', `auth.js safeNext(${JSON.stringify(v)})`);
    if (typeof v === 'string') {
      const decoded = new URLSearchParams(`next=${encodeURIComponent(v)}`).get('next');
      const target = new URL(fn(decoded), 'https://odyle.test/login');
      assert.equal(target.origin, 'https://odyle.test', `next=${v} sale a ${target.href}`);
    }
  }
  // Doble codificación: lo que llega decodificado una vez sigue siendo inocuo.
  const dbl = new URLSearchParams('next=%252F%252Fevil.com').get('next');
  assert.equal(fn(dbl), '/');
});

test('el servidor no redirige a "next" por su cuenta: /login?next=//evil.com responde 200 HTML sin Location', async () => {
  const s = await setup({ __buildApp: { publicDir: pub } });
  for (const q of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)']) {
    const r = await s.req('GET', `/login?next=${encodeURIComponent(q)}`);
    assert.equal(r.statusCode, 200, q);
    assert.equal(r.headers.location, undefined, q);
    assert.ok(!r.body.includes('evil.com'), 'el HTML no refleja el parámetro');
  }
  await s.app.close();
});
