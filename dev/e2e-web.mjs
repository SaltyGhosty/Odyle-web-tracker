// End-to-end check of the WEB build (server/public served by the real Fastify app over pg-mem).
// Usage: node dev/e2e-web.mjs   (builds first; needs Playwright + chromium from /opt/npm-tools)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadChromium } from './pw.mjs';
const chromium = await loadChromium();

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
const db = await createDb({ pgMem: true });
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
    // __keeplang (sessionStorage) deja que una comprobación cambie el idioma sin que este script lo fuerce de nuevo.
    try { if (!sessionStorage.getItem('__keeplang')) localStorage.setItem('odyle-lang', 'es'); } catch {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // 401/404 esperados (sesión caducada, favicon)
    if (/No se pudo cerrar la sesión/.test(t)) return; // fallo de cierre provocado a propósito
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
// Espera la condición real: el mensaje ya pintado como texto (un <li> previo no basta).
await pb.waitForFunction((x) => (document.getElementById('wall-list')?.textContent || '').includes(x), XSS);
check('muro: el HTML se muestra como texto, sin elemento <img>', (await text(pb, '#wall-list')).includes(XSS) && (await pb.locator('#wall-list img').count()) === 0);
await pa.evaluate(() => window.claude.__refreshAll());
await pa.waitForFunction((x) => (document.getElementById('wall-list')?.textContent || '').includes(x), XSS);
check('muro: A (legión) lo ve también como texto', (await text(pa, '#wall-list')).includes(XSS) && (await pa.locator('#wall-list img').count()) === 0);
check('muro: nada se ejecutó (sin diálogos)', dialogs.length === 0, dialogs.join(','));

// B ve a A en la legión
await pb.evaluate(() => window.claude.__refreshAll());
await pb.waitForTimeout(800);
check('legión: B ve a A entre los miembros', /AnaDaeva/.test(await text(pb, '#legion')), await text(pb, '#lg-members'));

// ================= ATAQUE (Task 8): XSS almacenado en todos los textos pintados =================
// B (miembro) y A (líder) escriben cargas por la API, como lo haría un atacante con su sesión; luego ambos recargan.
{
  const P = '"><img src=x onerror=alert(7)>';
  const NICK = '<svg onload=alert()>'; // 20 caracteres (límite del nick)
  const LNAME = '<svg onload=alert(3)>'; // ≤ 24 caracteres (nombre de legión)
  const okB = await pb.evaluate(async ({ P, NICK }) => {
    const db = await window.claude.use('db');
    const uid = await (await window.claude.use('user')).id();
    await db.doc('members/' + uid).update({ profile: { nick: NICK, bio: P, server: '<b>x</b>' } });
    await db.collection('members/' + uid + '/characters').doc('xss1').set({ name: P, notes: P, classId: 'asesino', energy: 100, recordedAt: Date.now(), order: 9 });
    return 'ok';
  }, { P, NICK }).catch((e) => 'err:' + (e && (e.message || e.code)));
  const okA = await pa.evaluate(async ({ P, LNAME }) => {
    await window.odyleLegionApi.rename(LNAME);
    const db = await window.claude.use('db');
    const uid = await (await window.claude.use('user')).id();
    const l = await db.doc('legions/' + uid).get();
    await db.collection('legionData/' + uid + '-' + l.data().epoch + '/calendar').doc('xss1').set({ title: P, at: Date.now() + 86400000, durationMin: 60 });
    return 'ok';
  }, { P, LNAME }).catch((e) => 'err:' + (e && (e.message || e.code)));
  check('ATAQUE xss: el atacante pudo guardar las cargas (nick, bio, personaje, nombre de legión, calendario)', okA === 'ok' && okB === 'ok', `${okA} ${okB}`);
  const injected = (page) => page.evaluate(() => document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onload], script:not([src])').length);
  for (const [label, page] of [['B', pb], ['A', pa]]) {
    await page.reload();
    await page.waitForSelector('#profile-chip:not([hidden])');
    await page.click('#topnav [data-tab=personajes]');
    await page.waitForTimeout(400);
    await page.click('#topnav [data-tab=legion]');
    await page.waitForFunction((n) => (document.getElementById('lg-name-text')?.textContent || '').includes(n), LNAME, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const legionText = await text(page, '#legion');
    // A (líder) ve el nick de B en la lista de miembros; B ve el nombre de la legión.
    const nickOk = label === 'B' || legionText.includes(NICK);
    check(`ATAQUE xss (${label}): el nombre de legión${label === 'A' ? ' y el nick del miembro' : ''} se pintan como texto literal`, (await text(page, '#lg-name-text')).includes(LNAME) && nickOk, (await text(page, '#lg-name-text')) + ' | ' + legionText.slice(0, 200));
    check(`ATAQUE xss (${label}): ningún elemento ni manejador inyectado en el DOM`, (await injected(page)) === 0, String(await injected(page)));
  }
  await pb.click('#topnav [data-tab=personajes]');
  await pb.waitForTimeout(400);
  check('ATAQUE xss (B): el nombre de personaje malicioso aparece como texto', (await text(pb, '#cards, main')).includes(P) || (await pb.locator('article.card').allTextContents()).some((t) => t.includes(P)));
  check('ATAQUE xss: ningún alert ni diálogo se ejecutó', dialogs.length === 0, dialogs.join(','));
}

// ================= ATAQUE (Task 8): CSP + Trusted Types bloquean ejecución en el origen =================
// Contexto aparte, sin los oyentes de errores: aquí las violaciones de CSP son el resultado esperado.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const atkDialogs = [];
  page.on('dialog', (d) => { atkDialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(`${ORIGIN}/login`);
  // Los intentos van en una tarea posterior (setTimeout): durante page.evaluate, DevTools permite eval aunque la
  // CSP lo prohíba (Runtime.evaluate allowUnsafeEvalBlockedByCSP); en una tarea normal rige la CSP de la página.
  const r = await page.evaluate(() => new Promise((done) => setTimeout(async () => {
    const out = {};
    const tryIt = (k, fn) => { try { fn(); out[k] = 'ejecutado'; } catch (e) { out[k] = e.name; } };
    tryIt('innerHTML', () => { document.body.innerHTML += '<img src=x onerror="window.__xss=1">'; });
    tryIt('insertAdjacentHTML', () => document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__xss=2">'));
    tryIt('eval', () => eval('window.__xss=3'));
    tryIt('Function', () => new Function('window.__xss=4')());
    tryIt('setTimeout(string)', () => setTimeout('window.__xss=5', 0));
    tryIt('script.textContent', () => { const s = document.createElement('script'); s.textContent = 'window.__xss=6'; document.body.append(s); });
    tryIt('script.src data:', () => { const s = document.createElement('script'); s.src = 'data:text/javascript,window.__xss=7'; document.body.append(s); });
    tryIt('iframe srcdoc', () => { const f = document.createElement('iframe'); f.srcdoc = '<script>parent.__xss=8<\/script>'; document.body.append(f); });
    // Elemento creado por DOM con un manejador inline (sin sumidero HTML): la CSP no permite inline.
    tryIt('setAttribute(onerror)', () => { const img = document.createElement('img'); img.setAttribute('onerror', 'window.__xss=9'); img.src = 'data:,x'; document.body.append(img); });
    tryIt('a href javascript:', () => { const a = document.createElement('a'); a.href = 'javascript:window.__xss=10'; document.body.append(a); a.click(); });
    // Recurso propio de la API como script (bypass de CSP con 'self').
    const s2 = document.createElement('script');
    try { s2.src = '/api/health'; } catch (e) { out['script /api'] = e.name; }
    await new Promise((res) => setTimeout(res, 800));
    out.marker = window.__xss === undefined ? 'sin ejecutar' : 'EJECUTADO ' + window.__xss;
    done(out);
  }, 0)));
  // a.click() con javascript: no lanza: su bloqueo se ve en el marcador (window.__xss sigue sin definir).
  const blocked = Object.entries(r).filter(([k]) => k !== 'marker' && k !== 'a href javascript:').every(([, v]) => v !== 'ejecutado');
  check('ATAQUE CSP/TT: innerHTML, eval, Function, setTimeout(string), <script> creado, srcdoc y javascript: quedan bloqueados', blocked && r.marker === 'sin ejecutar' && atkDialogs.length === 0, JSON.stringify(r));
  await ctx.close();
}

// ================= ATAQUE (Task 8): redirección abierta tras entrar =================
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await register(page, 'redir@example.com', PW);
  const landed = [];
  for (const next of ['//evil.example/', '/\\evil.example', 'https://evil.example/', 'javascript:alert(1)']) {
    await page.goto(`${ORIGIN}/login?next=${encodeURIComponent(next)}`);
    await page.fill('#email', 'redir@example.com'); await page.fill('#password', PW);
    await page.click('form button[type=submit]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 5000 }).catch(() => {});
    landed.push(`${next} -> ${page.url()}`);
  }
  check('ATAQUE redirect: next=//evil, /\\evil, https://evil, javascript: acaban en el propio origen', landed.every((l) => l.endsWith(` -> ${ORIGIN}/`)), landed.join(' | '));
  await ctx.close();
}

// ================= Selector de idioma en las pantallas de cuenta =================
{
  const ctx = await browser.newContext({ locale: 'es-ES' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${ORIGIN}/login`);
  check('idioma: botón hamburguesa con bandera, menú cerrado al inicio',
    await visible(page, '.lang-toggle') && (await page.locator('.lang-toggle svg.flag').count()) === 1 && !(await visible(page, '#lang-list')));
  await page.click('.lang-toggle');
  const opts = await page.locator('#lang-list [role=menuitemradio]').evaluateAll((bs) => bs.map((b) => b.dataset.lang + ':' + !!b.querySelector('svg.flag')));
  check('idioma: el menú muestra las 4 lenguas con su bandera', opts.join(',') === 'es:true,en:true,it:true,pt:true', opts.join(','));
  await page.fill('#email', 'algo@example.com');
  await page.click('#lang-list [data-lang=en]');
  check('idioma: inglés traduce la vista, conserva lo escrito y cierra el menú',
    (await text(page, 'h2, .auth')).includes('Log in') && (await page.inputValue('#email')) === 'algo@example.com' && !(await visible(page, '#lang-list')) &&
    (await page.evaluate(() => document.documentElement.lang)) === 'en');
  await page.fill('#password', 'contraseña-mala-123');
  await page.click('form button[type=submit]');
  await page.waitForSelector('.error:not(:empty)', { timeout: 5000 }).catch(() => {});
  check('idioma: los errores del servidor también se traducen', /Incorrect email or password/.test(await text(page, '.auth')), await text(page, '.auth'));
  await page.goto(`${ORIGIN}/registro`);
  check('idioma: la elección se recuerda al cambiar de página', /Create account/.test(await text(page, '.auth')) && (await page.evaluate(() => localStorage.getItem('odyle-lang'))) === 'en');
  await page.click('.lang-toggle');
  await page.keyboard.press('Escape');
  check('idioma: Escape cierra el menú', !(await visible(page, '#lang-list')));
  // El 401 del login fallido provocado arriba es esperado; cualquier otro error cuenta.
  const realErrs = errs.filter((e) => !/status of 401/.test(e));
  check('idioma: sin errores de consola ni violaciones de CSP', realErrs.length === 0, realErrs.join(' | '));
  await ctx.close();
}

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
// Cierre fallido (red caída): sin redirección, mensaje visible y cookies intactas.
await pa.route('**/api/auth/logout', (r) => r.abort());
await pa.click('#profile-logout');
await pa.waitForSelector('#odyle-session-error');
check('cerrar sesión fallido: sigue en la página con mensaje y sin perder cookies',
  new URL(pa.url()).pathname === '/' && (await A.ctx.cookies()).some((c) => c.name === '__Host-odyle_at'), pa.url());
await pa.unroute('**/api/auth/logout');
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

// ================= Verificación por correo (EMAIL_MODE full) =================
{
  const port2 = await new Promise((res) => { const sv = net.createServer().listen(0, '127.0.0.1', () => { const p = sv.address().port; sv.close(() => res(p)); }); });
  const origin2 = `http://127.0.0.1:${port2}`;
  const sent = [];
  const cfg2 = loadConfig({
    APP_ORIGIN: origin2, JWT_SECRET: randomBytes(32).toString('base64'), CODE_KEY: randomBytes(32).toString('base64'),
    RESEND_API_KEY: 're_test', MAIL_FROM: 'Odyle <no-reply@odyle.test>', EMAIL_MODE: 'full', ADMIN_USER_ID: '',
    DATABASE_URL: 'postgres://unused', NODE_ENV: 'test',
  });
  const db2 = await createDb({ pgMem: true });
  await migrate(db2);
  const app2 = buildApp({ config: cfg2, db: db2, mailer: { async send(m) { sent.push(m); } }, logger: false });
  await app2.listen({ port: port2, host: '127.0.0.1' });
  const V = await newUser('V');
  const pv = V.page;
  const VPW = 'contrasena-verificada-9';
  await pv.goto(`${origin2}/registro`);
  await pv.fill('#email', 'vera@example.com'); await pv.fill('#password', VPW); await pv.fill('#password2', VPW);
  await pv.click('form button[type=submit]');
  await pv.waitForSelector('p.ok');
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((r) => setTimeout(r, 50));
  const link = /(https?:\/\/\S+\/verificar#t=[A-Za-z0-9_-]+)/.exec(sent[0]?.text || '')?.[1];
  check('verificación: llega el enlace por correo', !!link);
  await pv.goto(link);
  await pv.waitForSelector('#password');
  check('verificación: pide la contraseña elegida al registrarte', /contraseña que elegiste/.test(await text(pv, '#panel')));
  await pv.fill('#password', 'otra-contrasena-mala-1');
  await pv.click('form button[type=submit]');
  await pv.waitForSelector('p.error:not([hidden])');
  check('verificación: contraseña equivocada da el error uniforme y no consume el enlace', /El enlace o la contraseña no son válidos/.test(await text(pv, '#panel')));
  await pv.fill('#password', VPW);
  await pv.click('form button[type=submit]');
  await pv.waitForSelector('p.ok');
  check('verificación: con la contraseña correcta, correo verificado', /Correo verificado/.test(await text(pv, '#panel')));
  await pv.goto(`${origin2}/login`);
  await pv.fill('#email', 'vera@example.com'); await pv.fill('#password', VPW);
  await pv.click('form button[type=submit]');
  await pv.waitForURL(`${origin2}/`);
  check('verificación: después puede entrar', true);
  await collectCsp(pv, 'V');
  await V.ctx.close();
  await app2.close();
}

// ================= Social: buscar, amistad, chat en vivo, bloqueo y tema =================
{
  const C = await newUser('C'); const D = await newUser('D');
  const pc = C.page, pd = D.page;
  await register(pc, 'carla@example.com', PW); await login(pc, 'carla@example.com', PW); await fillProfile(pc, 'CarlaLuz');
  await register(pd, 'dani@example.com', PW); await login(pd, 'dani@example.com', PW); await fillProfile(pd, 'DaniSombra');

  // buscar y pedir amistad
  await pc.click('[data-tab="buscar"]');
  await pc.fill('#search-q', 'Dani');
  await pc.waitForSelector('#social-buscar .social-list li');
  check('buscar: encuentra a DaniSombra', /DaniSombra/.test(await text(pc, '#social-buscar')));
  await pc.click('#social-buscar .social-list li button.primary');
  await pc.waitForSelector('#social-buscar >> text=Solicitud enviada');
  check('buscar: la solicitud se envía', true);

  // D ve la insignia y acepta
  await pd.waitForSelector('[data-tab="amigos"] .badge', { timeout: 10000 });
  check('amigos: insignia de solicitud en vivo', (await text(pd, '[data-tab="amigos"] .badge')) === '1');
  await pd.click('[data-tab="amigos"]');
  await pd.click('#social-amigos [role="tab"]:nth-child(2)');
  await pd.click('#social-amigos .social-list li button.primary');
  await pd.waitForSelector('#social-amigos [role="tab"]:nth-child(1) .count >> text=1');
  await pd.click('#social-amigos [role="tab"]:nth-child(1)');
  await pd.waitForSelector('#social-amigos .social-list li');
  check('amigos: D acepta y C aparece como amigo', /CarlaLuz/.test(await text(pd, '#social-amigos')));

  // chat en vivo C → D, con texto que coincide con la interfaz y un mensaje largo
  await pc.click('[data-tab="amigos"]');
  await pc.waitForSelector('#social-amigos .social-list li button.primary');
  await pc.click('#social-amigos .social-list li button.primary'); // «Mensaje»
  await pc.waitForSelector('#chat-text');
  await pc.fill('#chat-text', 'Amigos');
  await pc.press('#chat-text', 'Enter');
  await pc.waitForFunction(() => document.querySelectorAll('#social-chat .msg-text').length === 1); // el primer envío termina antes del segundo
  const LONG = 'x'.repeat(600);
  await pc.fill('#chat-text', LONG);
  await pc.press('#chat-text', 'Enter');
  await pc.waitForFunction(() => document.querySelectorAll('#social-chat .msg-text').length === 2);
  await pd.waitForSelector('[data-tab="chat"] .badge', { timeout: 10000 });
  check('chat: D recibe los mensajes en vivo (insignia)', Number(await text(pd, '[data-tab="chat"] .badge')) >= 1);
  await pd.click('[data-tab="chat"]');
  await pd.click('#social-chat .conv');
  await pd.waitForFunction(() => document.querySelectorAll('#social-chat .msg-text').length >= 2);
  check('chat: D ve los mensajes de C', (await pd.locator('#social-chat .msg-text').count()) === 2);
  check('chat: el mismo mensaje no aparece dos veces en C', (await pc.locator('#social-chat .msg-text').count()) === 2);

  // texto de usuario igual a un texto de la interfaz: no se traduce.
  // __keeplang evita que el script de arranque vuelva a forzar 'es' (sessionStorage sobrevive a recargar en la pestaña).
  await pd.evaluate(() => { sessionStorage.setItem('__keeplang', '1'); localStorage.setItem('odyle-lang', 'en'); });
  await collectCsp(pd, 'D');
  await pd.reload(); await pd.waitForSelector('#profile-chip:not([hidden])');
  await pd.click('[data-tab="chat"]'); await pd.click('#social-chat .conv'); await pd.waitForSelector('#social-chat .msg-text');
  check('i18n: la pestaña se traduce (Friends) pero el mensaje «Amigos» queda literal',
    /Friends/.test(await text(pd, '[data-tab="amigos"]')) && (await pd.locator('#social-chat .msg-text').first().textContent()) === 'Amigos');
  await pd.evaluate(() => { sessionStorage.removeItem('__keeplang'); localStorage.setItem('odyle-lang', 'es'); });

  // móvil: el mensaje largo no crea scroll horizontal
  await pd.setViewportSize({ width: 375, height: 812 });
  await collectCsp(pd, 'D');
  await pd.reload(); await pd.waitForSelector('#profile-chip:not([hidden])');
  await pd.click('[data-tab="chat"]'); await pd.click('#social-chat .conv'); await pd.waitForSelector('#social-chat .msg-text');
  check('móvil: sin scroll horizontal con un mensaje de 600 caracteres', await pd.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await pd.screenshot({ path: 'dev/screens/e2e-chat-mobile.png' });
  await pd.setViewportSize({ width: 1280, height: 900 });

  // tema: Sombra se guarda en prefs.theme, sobrevive a recargar y guardar el perfil no lo cambia
  await pc.click('#theme-slot-header [data-theme-choice="asmodian"]');
  const cUid = (await dbRows('members/')).find((r) => r.data.profile?.nick === 'CarlaLuz')?.path.split('/')[1];
  let themeSaved = false;
  for (let i = 0; i < 50 && !themeSaved; i++) {
    themeSaved = (await dbRows('members/' + cUid + '/settings/prefs')).some((r) => r.path === 'members/' + cUid + '/settings/prefs' && r.data.theme === 'asmodian');
    if (!themeSaved) await new Promise((r) => setTimeout(r, 100));
  }
  check('tema: Sombra se guarda en el servidor (prefs de C)', !!cUid && themeSaved);
  await collectCsp(pc, 'C');
  await pc.reload(); await pc.waitForSelector('#profile-chip:not([hidden])');
  check('tema: sigue en Sombra tras recargar', (await pc.evaluate(() => document.documentElement.dataset.faction)) === 'asmodian');
  await pc.click('#profile-chip');
  await pc.selectOption('#profile-faction', 'elyos');
  await pc.click('#profile-form button[type=submit]');
  await pc.waitForSelector('#profile-modal', { state: 'hidden' });
  check('tema: guardar el perfil con facción Elyos no cambia el tema', (await pc.evaluate(() => document.documentElement.dataset.faction)) === 'asmodian');

  // privacidad: dejar de aparecer en Buscar
  await pd.click('#profile-chip');
  await pd.uncheck('#profile-searchable');
  await pd.click('#profile-form button[type=submit]');
  await pd.waitForSelector('#profile-modal', { state: 'hidden' });
  await pc.click('[data-tab="buscar"]');
  await pc.fill('#search-q', '');
  await pc.fill('#search-q', 'Dani');
  await pc.waitForSelector('#social-buscar >> text=Nadie se llama así');
  check('privacidad: quien se oculta no aparece en Buscar', !/DaniSombra/.test(await text(pc, '#social-buscar')));

  // bloqueo: D bloquea a C desde la ficha; C ya no puede escribir
  await pd.click('[data-tab="amigos"]');
  await pd.click('#social-amigos .social-list li button.grow');
  await pd.waitForSelector('.sheet[open] button.danger');
  await pd.click('.sheet[open] button.danger');
  await pd.click('.sheet[open] button.danger');
  await pd.waitForSelector('.sheet[open]', { state: 'detached' }).catch(() => {});
  await pc.click('[data-tab="chat"]');
  await pc.waitForSelector('#social-chat .conv');
  await pc.click('#social-chat .conv');
  const endedNote = pc.locator('#social-chat .social-note', { hasText: 'Ya no sois amigos' });
  let blockedNow = await endedNote.waitFor({ timeout: 3000 }).then(() => true, () => false);
  if (!blockedNow && (await pc.locator('#chat-text').count()) === 1) {
    await pc.fill('#chat-text', 'hola'); await pc.press('#chat-text', 'Enter');
    blockedNow = await endedNote.waitFor({ timeout: 5000 }).then(() => true, () => false);
  }
  check('bloqueo: C ya no puede escribir a D', blockedNow);

  await collectCsp(pc, 'C'); await collectCsp(pd, 'D');
  await C.ctx.close(); await D.ctx.close();

  // tema la primera vez: sin prefs.theme, la facción del perfil que se guarda en el aviso inicial manda y queda fija
  const F = await newUser('F');
  const pf = F.page;
  await login(pf, 'redir@example.com', PW); // cuenta sin perfil de la comprobación de redirección (el registro tiene tope por IP)
  await pf.waitForSelector('#profile-modal:not([hidden])');
  check('tema primera vez: sin perfil la página es Elyos', (await pf.evaluate(() => document.documentElement.dataset.faction)) === 'elyos');
  await pf.fill('#profile-nick', 'FedeSombra');
  await pf.selectOption('#profile-faction', 'asmodian');
  await pf.click('#profile-form button[type=submit]');
  await pf.waitForSelector('#profile-modal', { state: 'hidden' });
  await pf.waitForFunction(() => document.documentElement.dataset.faction === 'asmodian', null, { timeout: 5000 }).catch(() => {});
  check('tema primera vez: guardar el perfil con facción Asmodiano vuelve la página Sombra', (await pf.evaluate(() => document.documentElement.dataset.faction)) === 'asmodian');
  const fUid = (await dbRows('members/')).find((r) => r.data.profile?.nick === 'FedeSombra')?.path.split('/')[1];
  let fSaved = false;
  for (let i = 0; i < 50 && !fSaved; i++) {
    fSaved = (await dbRows('members/' + fUid + '/settings/prefs')).some((r) => r.data.theme === 'asmodian');
    if (!fSaved) await new Promise((r) => setTimeout(r, 100));
  }
  check('tema primera vez: prefs.theme se guarda con la facción del perfil', fSaved);
  await pf.click('[data-tab="ajustes"]').catch(() => {});
  await pf.fill('#quiet-start', '01:00');
  await pf.click('#prefs-form button[type=submit]');
  await new Promise((r) => setTimeout(r, 600));
  check('tema primera vez: cambiar las horas de silencio no cambia el tema', (await pf.evaluate(() => document.documentElement.dataset.faction)) === 'asmodian');
  await collectCsp(pf, 'F');
  await F.ctx.close();
}

check('consola: ningún error de CSP, Trusted Types ni JavaScript', errors.length === 0, '\n  ' + errors.join('\n  '));
check('CSP: ningún evento securitypolicyviolation', violations.length === 0, violations.join(', '));

await browser.close();
await app.close();
const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} comprobaciones correctas`);
process.exit(ok ? 0 : 1);
