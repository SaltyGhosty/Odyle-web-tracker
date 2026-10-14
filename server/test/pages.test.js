import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync, existsSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeTestApp } from './helpers.js';
import { CSP } from '../src/app.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PUBLIC = path.join(ROOT, 'server/public');

before(() => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-web.mjs')], { cwd: ROOT, stdio: 'pipe' });
});

const get = async (url, over = {}) => {
  const { app } = await makeTestApp(over);
  const r = await app.inject({ method: 'GET', url });
  await app.close();
  return r;
};

test('/: 200 HTML con la CSP exacta, sin <script> en línea ni <style>; carga shim, API de legión, app.css y app.js', async () => {
  const r = await get('/');
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['content-type'], /^text\/html/);
  assert.equal(r.headers['content-security-policy'], CSP);
  assert.equal(r.headers['x-frame-options'], 'DENY');
  const html = r.body;
  assert.ok(!/<style[\s>]/i.test(html), 'sin <style>');
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) assert.match(m[0], /\ssrc="/, `script sin src: ${m[0]}`);
  assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/<script[\s\S]*?<\/script>/gi, '')), 'sin manejadores on* en el HTML');
  assert.ok(!/https?:\/\//.test(html), 'sin orígenes externos');
  assert.ok(html.indexOf('claude-shim.js') < html.indexOf('legion-api.js') && html.indexOf('legion-api.js') < html.indexOf('social-api.js') && html.indexOf('social-api.js') < html.indexOf('app.js'));
  assert.match(html, /<link rel="stylesheet" href="fonts.css"><link rel="stylesheet" href="app.css">/);
  assert.match(html, /<script type="module" src="app.js"><\/script>/);
});

test('/app.js, /claude-shim.js, /legion-api.js y /starorb.js con Content-Type JavaScript', async () => {
  const { app } = await makeTestApp();
  for (const url of ['/app.js', '/claude-shim.js', '/legion-api.js', '/social-api.js', '/starorb.js', '/auth.js', '/store.js']) {
    const r = await app.inject({ method: 'GET', url });
    assert.equal(r.statusCode, 200, url);
    assert.match(r.headers['content-type'], /javascript/, url);
  }
  const orb = (await app.inject({ method: 'GET', url: '/starorb.js' })).body;
  assert.match(orb, /export function buildStarOrb/);
  assert.ok(!orb.includes('three') && !orb.includes('cdn.jsdelivr.net'));
  const css = await app.inject({ method: 'GET', url: '/app.css' });
  assert.match(css.headers['content-type'], /text\/css/);
  await app.close();
});

test('fuentes propias: fonts.css con @font-face locales y woff2 servidos (SR-5)', async () => {
  const { app } = await makeTestApp();
  const css = (await app.inject({ method: 'GET', url: '/fonts.css' })).body;
  assert.ok(!/https?:\/\//.test(css));
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''));
  assert.ok(urls.length >= 10, 'latin + latin-ext de 5 pesos');
  for (const fam of ['Cinzel', 'Figtree']) assert.match(css, new RegExp(`font-family: '${fam}'`));
  assert.match(css, /font-display: swap/);
  for (const u of urls) {
    const r = await app.inject({ method: 'GET', url: '/' + u });
    assert.equal(r.statusCode, 200, u);
    assert.match(r.headers['content-type'], /font\/woff2/, u);
  }
  await app.close();
});

test('páginas de cuenta: auth.html con no-referrer y no-store (SR-19)', async () => {
  const { app } = await makeTestApp();
  for (const url of ['/login', '/registro', '/verificar', '/restablecer', '/login?next=%2F%23legion']) {
    const r = await app.inject({ method: 'GET', url });
    assert.equal(r.statusCode, 200, url);
    assert.match(r.headers['content-type'], /^text\/html/);
    assert.equal(r.headers['referrer-policy'], 'no-referrer', url);
    assert.equal(r.headers['cache-control'], 'no-store', url);
    assert.equal(r.headers['content-security-policy'], CSP);
    assert.match(r.body, /<script src="auth.js"><\/script>/);
    assert.ok(!/<style[\s>]/i.test(r.body));
    for (const m of r.body.matchAll(/<script\b[^>]*>/gi)) assert.match(m[0], /\ssrc="/);
    assert.ok(!/https?:\/\//.test(r.body));
  }
  await app.close();
});

test('estáticos: sin dotfiles, sin listado, sin *.map, nada fuera de public (SR-34)', async () => {
  // Copia privada: la prueba escribe .env y .map sin tocar el server/public compartido con otras pruebas.
  const dir = mkdtempSync(path.join(tmpdir(), 'odyle-public-'));
  cpSync(PUBLIC, dir, { recursive: true });
  writeFileSync(path.join(dir, '.env'), 'SECRET=1');
  writeFileSync(path.join(dir, 'app.js.map'), '{}');
  try {
    const { app } = await makeTestApp({ __buildApp: { publicDir: dir } });
    assert.equal((await app.inject({ method: 'GET', url: '/app.js' })).statusCode, 200);
    for (const url of ['/.env', '/app.js.map', '/vendor/', '/vendor', '/fonts/', '/package.json', '/server/src/app.js',
      '/../package.json', '/%2e%2e/package.json', '/index.html/', '/.%65nv', '/auth.html', '/index.html', '/AUTH.HTML']) {
      const r = await app.inject({ method: 'GET', url });
      assert.equal(r.statusCode, 404, `${url} -> ${r.statusCode}`);
      assert.ok(!r.body.includes('SECRET'));
    }
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sin compilar: el servidor arranca y las páginas dan 503; la API sigue viva', async () => {
  const { app } = await makeTestApp({ __buildApp: { publicDir: path.join(ROOT, 'server/no-existe') } });
  for (const url of ['/', '/login', '/registro', '/verificar', '/restablecer']) {
    const r = await app.inject({ method: 'GET', url });
    assert.equal(r.statusCode, 503, url);
    assert.deepEqual(r.json(), { error: 'La web aún no está compilada' });
  }
  assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 200);
  await app.close();
});

// SR-2: ningún archivo servido contiene sumideros de HTML/código.
test('sin sumideros prohibidos en server/public (SR-2)', () => {
  const SINKS = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function\s*\(/,
    /setTimeout\(\s*['"`]/, /setInterval\(\s*['"`]/];
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const files = walk(PUBLIC).filter((f) => /\.(js|html|css)$/.test(f));
  assert.ok(files.length > 15);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const re of SINKS) assert.ok(!re.test(src), `${path.relative(PUBLIC, f)} contiene ${re}`);
  }
  assert.ok(!existsSync(path.join(PUBLIC, 'vendor')) && !existsSync(path.join(PUBLIC, 'orb.js')));
});
