// End-to-end check of the WEB build (server/public served by the real Fastify app over pg-mem).
// Usage: node dev/e2e-web.mjs   (builds first; needs Playwright + chromium from /opt/npm-tools)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-web.mjs')], { cwd: ROOT, stdio: 'inherit' });

const { loadConfig } = await import('../server/src/config.js');
const { createDb, migrate } = await import('../server/src/db.js');
const { buildApp } = await import('../server/src/app.js');

// ---- servidor local con pg-mem en un puerto libre ----
const port = await new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const ORIGIN = `http://127.0.0.1:${port}`;
const config = loadConfig({
  APP_ORIGIN: ORIGIN, JWT_SECRET: randomBytes(32).toString('base64'), CODE_KEY: randomBytes(32).toString('base64'),
  RESEND_API_KEY: 're_test', MAIL_FROM: 'Odyle <no-reply@odyle.test>', EMAIL_MODE: 'owner-only', ADMIN_USER_ID: '',
  DATABASE_URL: 'postgres://unused', NODE_ENV: 'test',
});
const db = createDb({ pgMem: true });
await migrate(db);
const app = buildApp({ config, db, mailer: { async send() {} }, logger: false });
await app.listen({ port, host: '127.0.0.1' });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (name, ok, extra = '') => { results.push(!!ok); console.log(`${ok ? '✔' : '✘'} ${name}${ok ? '' : ' ' + extra}`); };
const errors = [];
const violations = [];
const dialogs = [];

async function newUser(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    try { localStorage.setItem('odyle-lang', 'es'); } catch {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // 401/404 esperados (sesión caducada, favicon)
    errors.push(`${label} console: ${t}`);
  });
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  return { ctx, page };
}
const collectCsp = async (page, label) => { for (const v of await page.evaluate(() => window.__csp).catch(() => [])) violations.push(`${label}: ${v}`); };
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);
const visible = (page, sel) => page.locator(sel).first().isVisible();
const dbRows = async (prefix) => (await db.query('select path, data from docs where path like $1 order by path', [prefix + '%'])).rows;

async function register(page, email, password) {
  await page.goto(`${ORIGIN}/registro`);
  await page.fill('#email', email); await page.fill('#password', password); await page.fill('#password2', password);
  await page.click('form button[type=submit]');
  await page.waitForSelector('p.ok');
}
async function login(page, email, password) {
  await page.goto(`${ORIGIN}/login`);
  await page.fill('#email', email); await page.fill('#password', password);
  await page.click('form button[type=submit]');
  await page.waitForURL(`${ORIGIN}/`);
  await page.waitForSelector('#profile-chip:not([hidden])');
}
// La primera visita abre el perfil: se rellena para dejar la página lista.
async function fillProfile(page, nick) {
  await page.waitForSelector('#profile-modal:not([hidden])');
  await page.fill('#profile-nick', nick);
  await page.click('#profile-form button[type=submit]');
  await page.waitForSelector('#profile-modal', { state: 'hidden' });
}

const PW = 'una contraseña larga y rara 42';

// ================= Sin sesión =================
{
  const { ctx, page } = await newUser('anon');
  await page.goto(`${ORIGIN}/#legion`);
  await page.waitForURL(/\/login\?next=/);
  check('sin sesión: / redirige a /login?next=/#legion', new URL(page.url()).searchParams.get('next') === '/#legion', page.url());
  await page.goto(`${ORIGIN}/#<script>`);
  await page.waitForURL(/\/login\?next=/);
  check('sin sesión: un fragmento raro se descarta (next=/)', new URL(page.url()).searchParams.get('next') === '/', page.url());
  await ctx.close();
}

// ================= Usuario A =================
const A = await newUser('A');
const pa = A.page;
await register(pa, 'ana@example.com', PW);
check('registro: muestra el mensaje del servidor', (await text(pa, 'p.ok')).length > 5);
await login(pa, 'ana@example.com', PW);
check('login: llega a la página principal con sus cookies HttpOnly', (await A.ctx.cookies()).some((c) => c.name === '__Host-odyle_at' && c.httpOnly));
await fillProfile(pa, 'AnaDaeva');
check('perfil: se guarda en el servidor', (await dbRows('members/')).some((r) => r.data.profile?.nick === 'AnaDaeva'));

// añadir personaje
await pa.click('#add-btn');
await pa.fill('#add-name', 'SaltyGhosty');
await pa.selectOption('#add-class', { index: 1 });
await pa.click('#add-form button[type=submit]');
await pa.waitForSelector('article.card');
check('personaje: aparece la tarjeta y se guarda', (await pa.locator('article.card').count()) === 1 && (await dbRows('members/')).some((r) => r.path.includes('/characters/') && r.data.name === 'SaltyGhosty'));
const charId = await pa.locator('article.card').first().getAttribute('data-id');

// energía y gasto
await pa.click(`article[data-id="${charId}"] button.primary`);
await pa.fill(`#energy-${charId}`, '300');
await pa.press(`#energy-${charId}`, 'Enter');
await pa.waitForTimeout(600);
await pa.click('#presets-btn');
await pa.fill('#preset-name', 'Mazmorra'); await pa.fill('#preset-cost', '40');
await pa.click('#preset-form button[type=submit]');
await pa.waitForTimeout(600);
await pa.keyboard.press('Escape');
await pa.waitForSelector(`article[data-id="${charId}"] button.spend`);
await pa.click(`article[data-id="${charId}"] button.spend`);
await pa.waitForTimeout(800);
const energyOf = async () => (await dbRows('members/')).find((r) => r.path.endsWith('/characters/' + charId))?.data.energy;
check('gasto: resta 40 de 300 en el servidor', (await energyOf()) === 260, String(await energyOf()));

// recargar y seguir ahí
await pa.reload();
await pa.waitForSelector('article.card');
check('recarga: el personaje sigue ahí con su energía', (await pa.locator('article.card').count()) === 1 && /SaltyGhosty/.test(await text(pa, 'article.card')));
check('recarga: no vuelve a pedir el perfil', !(await visible(pa, '#profile-modal')));

// exportar (descarga real) -> importar
await pa.click('#topnav [data-tab=ajustes]');
const [download] = await Promise.all([pa.waitForEvent('download'), pa.click('#export-btn')]);
const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
check('exportar: descarga un JSON del formato de la página', exported.app === 'energia-odyle' && exported.characters.length === 1, JSON.stringify(Object.keys(exported)));
const imported = {
  ...exported, exportedAt: new Date().toISOString(),
  characters: [
    { id: 'imp1', name: 'Importada Uno', classId: 'asesino', energy: 500, recordedAt: Date.now(), order: 1 },
    { id: 'imp2', name: 'Importada Dos', classId: 'gladiador', energy: 120, recordedAt: Date.now(), order: 2, cp: 12345 },
  ],
};
await pa.setInputFiles('#import-file', { name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
await pa.waitForSelector('#import-confirm:not([hidden])');
await pa.click('#import-confirm');
await pa.waitForFunction(() => /Datos importados/.test(document.getElementById('import-state').textContent));
await pa.click('#topnav [data-tab=personajes]');
await pa.waitForFunction(() => document.querySelectorAll('article.card').length === 2);
const names = (await dbRows('members/')).filter((r) => r.path.includes('/characters/')).map((r) => r.data.name).sort();
check('importar: sustituye los personajes por los de la copia', names.join('|') === 'Importada Dos|Importada Uno', names.join('|'));

// legión
await pa.click('#topnav [data-tab=legion]');
await pa.fill('#lg-name', 'Guardianes');
await pa.click('#lg-create button[type=submit]');
await pa.waitForFunction(() => /Guardianes/.test(document.getElementById('lg-name-text')?.textContent || ''));
const code = (await text(pa, '#lg-code-text')).trim();
check('legión: se crea y se muestra el código de invitación', /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code), code);
check('legión: el código solo vive en el servidor (cifrado, sin código ni hash en el documento)', await (async () => {
  const l = (await dbRows('legions/'))[0]?.data;
  return l && l.name === 'Guardianes' && !('codeHash' in l) && !JSON.stringify(l).includes(code.replace('-', ''));
})());

// ================= Usuario B =================
const B = await newUser('B');
const pb = B.page;
await register(pb, 'bob@example.com', PW);
await login(pb, 'bob@example.com', PW);
await fillProfile(pb, 'BobOtro');
await pb.click('#topnav [data-tab=legion]');
await pb.fill('#lg-code', 'ZZZZ-ZZZZ');
await pb.click('#lg-join button[type=submit]');
await pb.waitForFunction(() => document.getElementById('lg-error') && !document.getElementById('lg-error').hidden);
check('legión: un código falso da el error del servidor', /no es válido/.test(await text(pb, '#lg-error')), await text(pb, '#lg-error'));
await pb.fill('#lg-code', code);
await pb.click('#lg-join button[type=submit]');
await pb.waitForFunction(() => /Guardianes/.test(document.getElementById('lg-name-text')?.textContent || ''));
check('legión: el segundo usuario se une con el código', (await dbRows('members/')).some((r) => r.data.legionId && r.data.profile?.nick === 'BobOtro'));
await pb.waitForSelector('#wall-panel:not([hidden])');

// muro con carga útil de XSS
const XSS = '<img src=x onerror=alert(1)>';
await pb.fill('#wall-text', XSS);
await pb.click('#wall-form button[type=submit]');
await pb.waitForFunction(() => document.querySelector('#wall-list li'));
await pb.waitForTimeout(300);
check('muro: el HTML se muestra como texto, sin elemento <img>', (await text(pb, '#wall-list')).includes(XSS) && (await pb.locator('#wall-list img').count()) === 0);
await pa.evaluate(() => window.claude.__refreshAll());
await pa.waitForFunction(() => document.querySelector('#wall-list li'));
check('muro: A (legión) lo ve también como texto', (await text(pa, '#wall-list')).includes(XSS) && (await pa.locator('#wall-list img').count()) === 0);
check('muro: nada se ejecutó (sin diálogos)', dialogs.length === 0, dialogs.join(','));

// B ve a A en la legión
await pb.evaluate(() => window.claude.__refreshAll());
await pb.waitForTimeout(800);
check('legión: B ve a A entre los miembros', /AnaDaeva/.test(await text(pb, '#legion')), await text(pb, '#lg-members'));

// ================= Renovación silenciosa (401 -> refresh -> reintento) =================
{
  const cookies = await A.ctx.cookies();
  const rt = cookies.find((c) => c.name === '__Secure-odyle_rt');
  const before = cookies.find((c) => c.name === '__Host-odyle_at');
  await A.ctx.clearCookies({ name: '__Host-odyle_at' });
  check('renovación: sin cookie de acceso pero con la de renovación', !!rt && !(await A.ctx.cookies()).some((c) => c.name === '__Host-odyle_at'));
  // acción de legión (líder A) por la API compartida del adaptador
  const got = await pa.evaluate(() => window.odyleLegionApi.rename('Guardianes II').then(() => 'ok', (e) => 'err:' + e.message));
  check('renovación: la acción de legión tiene éxito tras renovar en silencio', got === 'ok', got);
  const after = (await A.ctx.cookies()).find((c) => c.name === '__Host-odyle_at');
  check('renovación: hay cookie de acceso nueva y seguimos en la página', !!after && after.value !== before.value && new URL(pa.url()).pathname === '/', pa.url());
  check('renovación: el nombre se cambió en el servidor', (await dbRows('legions/'))[0]?.data.name === 'Guardianes II');
}

// ================= Cerrar sesión =================
await pa.click('#profile-chip');
await pa.waitForSelector('#profile-modal:not([hidden])');
check('perfil: botones de sesión visibles en la web', await visible(pa, '#profile-logout') && await visible(pa, '#profile-logout-all'));
await collectCsp(pa, 'A'); await collectCsp(pb, 'B');
await pa.click('#profile-logout');
await pa.waitForURL(`${ORIGIN}/login`);
check('cerrar sesión: vuelve a /login y las cookies desaparecen', !(await A.ctx.cookies()).some((c) => c.name === '__Host-odyle_at' && c.value));
const me = await pa.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'same-origin' })).status);
check('cerrar sesión: /api/auth/me da 401', me === 401, String(me));
await pa.goto(`${ORIGIN}/`);
await pa.waitForURL(/\/login\?next=/);
check('cerrar sesión: el navegador está en /login', new URL(pa.url()).pathname === '/login', pa.url());

// B: cerrar todas las sesiones; guardamos sus cookies de antes para repetirlas
const bCookies = await B.ctx.cookies();
const bHeader = (names) => bCookies.filter((c) => names.includes(c.name)).map((c) => `${c.name}=${c.value}`).join('; ');
await pb.click('#profile-chip');
await pb.click('#profile-logout-all');
await pb.waitForURL(`${ORIGIN}/login`);
check('cerrar todas las sesiones: vuelve a /login', new URL(pb.url()).pathname === '/login');
const replay = async (url, method, cookie) => (await fetch(ORIGIN + url, { method, headers: { cookie, origin: ORIGIN, 'x-odyle-csrf': '1', 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined })).status;
check('cerrar todas: la cookie de acceso vieja de B da 401 en /api/auth/me', (await replay('/api/auth/me', 'GET', bHeader(['__Host-odyle_at']))) === 401);
check('cerrar todas: la cookie de renovación vieja de B no renueva', (await replay('/api/auth/refresh', 'POST', bHeader(['__Secure-odyle_rt']))) === 401);

check('consola: ningún error de CSP, Trusted Types ni JavaScript', errors.length === 0, '\n  ' + errors.join('\n  '));
check('CSP: ningún evento securitypolicyviolation', violations.length === 0, violations.join(', '));

await browser.close();
await app.close();
const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} comprobaciones correctas`);
process.exit(ok ? 0 : 1);
