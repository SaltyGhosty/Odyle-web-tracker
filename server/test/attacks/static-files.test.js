// Ataque: descargar archivos no previstos (.env, código del servidor, mapas, listados) (SR-34).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setup, stablePublicDir, removeDir } from './_lib.js';

const pub = stablePublicDir();
after(() => removeDir(pub));
// Señuelos dentro de la copia privada de public/ (lo que dejaría un despliegue descuidado).
writeFileSync(path.join(pub, '.env'), 'JWT_SECRET=SENUELO');
writeFileSync(path.join(pub, 'app.js.map'), '{"sources":["SENUELO"]}');
mkdirSync(path.join(pub, '.git'), { recursive: true });
writeFileSync(path.join(pub, '.git', 'config'), '[core] SENUELO');
writeFileSync(path.join(pub, '.htpasswd'), 'SENUELO');

test('dotfiles, mapas, código del servidor, package.json, carpetas y traversals => 404/403 sin contenido', async () => {
  const s = await setup({ __buildApp: { publicDir: pub } });
  const urls = ['/.env', '/.env.local', '/.git/config', '/.git/', '/.htpasswd', '/app.js.map', '/APP.JS.MAP', '/app.js.map?x=1', '/app.js.map%00.js',
    '/package.json', '/package-lock.json', '/server/src/app.js', '/src/app.js', '/migrations/001_init.sql', '/node_modules/jose/package.json',
    '/vendor/', '/vendor', '/fonts/', '/fonts', '/%2e%2e/package.json', '/..%2fpackage.json', '/..%2f..%2fserver%2fsrc%2fconfig.js',
    '/%2e%2e%2f%2e%2e%2fserver/src/config.js', '/.%2e/package.json', '/%252e%252e/package.json', '/..\\package.json', '/%5c..%5cpackage.json',
    '/.%65nv', '/%2eenv', '/index.html', '/auth.html', '/app.js/', '//etc/passwd', '/../../../../etc/passwd'];
  const problems = [];
  for (const url of urls) {
    const r = await s.req('GET', url);
    if (![403, 404].includes(r.statusCode)) problems.push(`${url} -> ${r.statusCode}`);
    if (/SENUELO|JWT_SECRET|root:x:|"name":\s*"odyle/.test(r.body)) problems.push(`${url} filtra contenido`);
  }
  assert.deepEqual(problems, []);
  await s.app.close();
});

test('HEAD y métodos raros no saltan las reglas de estáticos', async () => {
  const s = await setup({ __buildApp: { publicDir: pub } });
  for (const url of ['/.env', '/app.js.map']) {
    const r = await s.req('HEAD', url);
    assert.equal(r.statusCode, 404, `HEAD ${url}`);
  }
  await s.app.close();
});
