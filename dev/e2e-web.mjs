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

// filas: menú ⋯ con teclado y sobreviviendo a un repintado
const rowSel = `article[data-id="${charId}"]`;
await pa.click(`${rowSel} button.more-actions`);
await pa.waitForSelector(`${rowSel} .menu [role="menuitem"]`);
check('⋯: se abre con sus opciones', (await pa.locator(`${rowSel} .menu [role="menuitem"]`).count()) === 4);
check('⋯: el foco pasa a la primera opción', await pa.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'));
await pa.keyboard.press('ArrowDown');
check('⋯: la flecha abajo mueve el foco a la segunda opción', await pa.evaluate(() => document.activeElement?.classList.contains('tasks')));
// Repintado seguro: el cambio del modo compacto llama a render() (un evento «focus» no repinta; un clic fuera cerraría el menú a propósito). La marca en el nodo
// del botón demuestra que la fila se reconstruyó de verdad; el menú debe seguir abierto y con el foco dentro.
await pa.evaluate((sel) => { document.querySelector(sel + ' button.more-actions').dataset.old = '1'; (() => { const c = document.getElementById('compact-toggle'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); })(); }, rowSel);
await pa.waitForTimeout(300);
check('⋯: la fila se reconstruyó en el repintado', await pa.evaluate((sel) => !document.querySelector(sel + ' button.more-actions').dataset.old, rowSel));
check('⋯: sigue abierto tras repintar', await pa.locator(`${rowSel} .menu`).isVisible());
check('⋯: tras repintar el foco sigue dentro del menú', await pa.evaluate(() => !!document.activeElement?.closest('.menu')));
await pa.evaluate(() => (() => { const c = document.getElementById('compact-toggle'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); })()); // restaura el modo normal
await pa.waitForTimeout(300);
await pa.keyboard.press('Escape');
check('⋯: Escape lo cierra y devuelve el foco al botón',
  !(await pa.locator(`${rowSel} .menu`).count()) && (await pa.evaluate(() => document.activeElement?.classList.contains('more-actions'))));
// Notas, +Extra y Quitar viven en el menú: abrirlo y elegir «Notas» abre el formulario de la fila.
await pa.click(`${rowSel} button.more-actions`);
await pa.click(`${rowSel} .menu button.notes`);
await pa.waitForSelector(`#notes-${charId}`);
check('⋯: «Notas» abre su formulario y cierra el menú', !(await pa.locator(`${rowSel} .menu`).count()));
await pa.click(`${rowSel} form button[type=button]`); // Cancelar
// teclado en el disparador: flecha abajo abre el menú y Escape lo cierra con el foco en el botón
await pa.focus(`${rowSel} button.more-actions`);
await pa.keyboard.press('ArrowDown');
check('⋯: flecha abajo en el botón abre el menú y enfoca la primera opción', (await pa.locator(`${rowSel} .menu`).count()) === 1 && await pa.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'));
await pa.keyboard.press('Escape');
check('⋯: Escape (tras flecha abajo) cierra y devuelve el foco', !(await pa.locator(`${rowSel} .menu`).count()) && await pa.evaluate(() => document.activeElement?.classList.contains('more-actions')));
// foco tras elegir una opción: «Tareas» devuelve el foco al botón ⋯ y «Quitar» lo lleva al botón de confirmar
await pa.focus(`${rowSel} button.more-actions`);
await pa.keyboard.press('ArrowDown');
await pa.keyboard.press('ArrowDown');
await pa.keyboard.press('Enter');
check('⋯: tras elegir «Tareas» el foco vuelve al botón ⋯', await pa.evaluate(() => document.activeElement?.classList.contains('more-actions')));
await pa.keyboard.press('ArrowDown');
await pa.keyboard.press('ArrowDown');
await pa.keyboard.press('Enter'); // vuelve a plegar las tareas
await pa.keyboard.press('ArrowDown');
await pa.keyboard.press('End');
await pa.keyboard.press('Enter');
check('⋯: tras elegir «Quitar» el foco pasa al botón de confirmar', await pa.evaluate(() => document.activeElement?.classList.contains('danger')));
await pa.click(`${rowSel} form button[type=button], ${rowSel} button:not(.danger):has-text("Cancelar")`).catch(() => {});
await pa.evaluate(() => { const b = [...document.querySelectorAll('article.card button')].find((x) => x.textContent === 'Cancelar'); b?.click(); });
check('⋯: «Quitar» cancelado no quita el personaje', (await pa.locator(rowSel).count()) === 1);
// atajos globales y Tab con el menú abierto
await pa.focus(`${rowSel} button.more-actions`);
await pa.keyboard.press('ArrowDown');
await pa.keyboard.press('ArrowRight');
check('⋯: las flechas laterales dentro del menú no cambian de sección', !(await pa.locator('#tab-personajes').isHidden()) && (await pa.locator(`${rowSel} .menu`).count()) === 1);
await pa.keyboard.press('Tab');
await pa.waitForTimeout(100);
check('⋯: Tab fuera del menú lo cierra', !(await pa.locator(`${rowSel} .menu`).count()));
// móvil 390: el botón del asistente (se fuerza visible; en la web real solo existe en el artifact) no tapa ninguna fila,
// los botones de fila miden 44 px y la cabecera cabe en una línea
await pa.setViewportSize({ width: 390, height: 844 });
await pa.waitForTimeout(300);
const geo = await pa.evaluate(() => {
  const fab = document.getElementById('ai-fab'); const was = fab.hidden; fab.hidden = false;
  const f = fab.getBoundingClientRect();
  const hit = [...document.querySelectorAll('article.card')].some((c) => { const r = c.getBoundingClientRect(); return !(f.right <= r.left || f.left >= r.right || f.bottom <= r.top || f.top >= r.bottom); });
  const smallB = [...document.querySelectorAll('article.card .r-act button')].filter((b) => b.getBoundingClientRect().height < 43.5); const small = smallB.length;
  const h = document.querySelector('header').getBoundingClientRect();
  fab.hidden = was;
  return { hit, small, headerH: h.height, which: smallB.map((b) => b.className + ':' + b.getBoundingClientRect().height) };
});
check('móvil 390: el botón del asistente no se solapa con ninguna fila', !geo.hit, JSON.stringify(geo));
check('móvil 390: botones de la fila de al menos 44 px', geo.small === 0, JSON.stringify(geo));
check('móvil 390: la cabecera ocupa una sola línea', geo.headerH < 70, JSON.stringify(geo));
await pa.setViewportSize({ width: 1280, height: 900 });

// Banda: con un solo personaje a medias no hay alarma
check('banda: visible y sin tono de alarma con energía a medias', (await visible(pa, '#summary')) && !(await pa.locator('#summary.band-urgent').count()));

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

// ================= Marco: banda carmesí, rail, barra inferior, Más y anchuras (usuario A: con personajes y legión) =================
{
  const p = pa;
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.click('#topnav [data-tab="personajes"]');
  // banda carmesí: un personaje al tope (840)
  await p.click('article[data-id="imp1"] button.primary');
  await p.fill('#energy-imp1', '840');
  await p.press('#energy-imp1', 'Enter');
  await p.waitForSelector('#summary.band-urgent', { timeout: 5000 }).catch(() => {});
  check('banda: carmesí con un personaje al tope', await p.locator('#summary.band-urgent').isVisible() && /al tope · pierd/.test(await text(p, '#sum-tip')), await text(p, '#sum-tip'));

  check('banda: sin aria-live; solo anuncia el cambio por una región de estado aparte',
    (await p.getAttribute('#summary', 'aria-live')) === null && (await p.getAttribute('#band-status', 'role')) === 'status' && /al tope/.test(await text(p, '#band-status')), await text(p, '#band-status'));
  check('banda: «Gastar» mide 44 px', (await p.locator('#band-go').boundingBox())?.height >= 43.5);
  check('rail: columna a 1280 px con Energía activa',
    (await p.locator('#topnav').evaluate((n) => getComputedStyle(n).flexDirection === 'column'))
    && (await p.getAttribute('#topnav [data-tab="personajes"]', 'aria-current')) === 'page');
  await p.click('#topnav [data-tab="legion"]');
  check('rail: navega a Legión', !(await p.locator('#tab-legion').isHidden()));

  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  check('móvil: barra inferior con 4 secciones + Más', (await p.locator('#topnav [data-tab]:visible').count()) === 4 && await p.locator('#topnav [data-more]').isVisible());
  check('móvil: Legión (en Más) marca el botón Más', (await p.getAttribute('#topnav [data-more]', 'aria-current')) === 'page');
  await p.click('#topnav [data-more]');
  await p.waitForSelector('#more-sheet[open]');
  await p.click('#more-sheet [data-tab="ajustes"]');
  check('Más: abre Ajustes y se cierra', !(await p.locator('#tab-ajustes').isHidden()) && !(await p.locator('#more-sheet[open]').count()));

  // Review Focus 1: redimensionar con la hoja abierta
  await p.click('#topnav [data-more]');
  await p.waitForSelector('#more-sheet[open]');
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.waitForTimeout(300);
  check('redimensionar con Más abierto: se cierra y el rail sigue usable', !(await p.locator('#more-sheet[open]').count()) && await p.locator('#topnav [data-tab="eventos"]').isEnabled());
  await p.click('#topnav [data-tab="eventos"]');
  check('redimensionar con Más abierto: la navegación sigue funcionando', !(await p.locator('#tab-eventos').isHidden()));
  await p.click('#topnav [data-tab="personajes"]');

  // Review Focus 4 y 5: 375 px con un nombre de 24 caracteres (el máximo) sin espacios; último botón pulsable
  await p.click('#add-btn');
  await p.fill('#add-name', 'W'.repeat(24));
  await p.selectOption('#add-class', { index: 2 });
  await p.click('#add-form button[type=submit]');
  await p.waitForFunction(() => [...document.querySelectorAll('article.card')].some((c) => /W{24}/.test(c.textContent)));
  await p.setViewportSize({ width: 375, height: 700 });
  await p.waitForTimeout(300);
  check('375 px: sin scroll horizontal en Energía con nombre largo y varios personajes',
    (await p.locator('article.card').count()) >= 3 && await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.waitForSelector('#toast', { state: 'hidden', timeout: 12000 }); // el aviso temporal de «añadido» (8 s) tapa a propósito la parte baja
  const lastBtn = p.locator('article.card button.primary').last();
  await lastBtn.scrollIntoViewIfNeeded();
  const box = await lastBtn.boundingBox();
  const barTop = await p.locator('#topnav').evaluate((n) => n.getBoundingClientRect().top);
  check('375 px: el último botón no queda tapado por la barra', !!box && box.y + box.height <= barTop, JSON.stringify({ box, barTop }));
  const topEl = await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return { ok: !!e?.closest('article.card button.primary'), tag: e?.tagName + '.' + e?.className + '#' + e?.id }; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  check('375 px: el último botón recibe el clic (no hay nada encima)', topEl.ok, JSON.stringify(topEl));
  // cabecera de 375 px con «en línea» forzado visible: una línea y la marca no pisa el reloj
  await p.evaluate(() => { document.getElementById('online-pill').hidden = false; });
  const hd = await p.evaluate(() => {
    const h = document.querySelector('header').getBoundingClientRect();
    const b = document.querySelector('header .brand-name').getBoundingClientRect();
    const c = document.getElementById('profile-chip').getBoundingClientRect();
    const pill = document.getElementById('online-pill');
    return { h: h.height, hit: !(b.right <= c.left || b.left >= c.right || b.bottom <= c.top || b.top >= c.bottom), brandW: b.width,
      pill: getComputedStyle(pill).display };
  });
  check('375 px: con «en línea» visible la cabecera es de una línea', hd.h < 70, JSON.stringify(hd));
  check('375 px: la marca no se solapa con el reloj', !hd.hit && hd.brandW > 40, JSON.stringify(hd));
  check('375 px: «en línea» se oculta en la cabecera', hd.pill === 'none', JSON.stringify(hd));
  check('375 px: ya no existe el botón de movimiento 3D ni el lienzo de la escena', !(await p.locator('#motion-btn, #scene').count()), '');
  await p.evaluate(() => { document.getElementById('online-pill').hidden = true; });
  // el aviso de deshacer en móvil va arriba y no tapa los botones de la última fila
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  const lastCard = p.locator('article.card').last(); // la última fila (la que queda bajo la barra)
  const spendCard = p.locator('article.card:has-text("Importada Dos") button.spend:not(:disabled)').first(); // la última con energía para gastar
  await spendCard.scrollIntoViewIfNeeded();
  await spendCard.click();
  await p.waitForSelector('#toast.show', { timeout: 5000 });
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); // al final de la página: la última fila queda justo sobre la barra
  await p.waitForTimeout(400);
  const tg = await p.evaluate(() => {
    const t = document.getElementById('toast').getBoundingClientRect();
    const hit = [...document.querySelectorAll('article.card button')].filter((b) => b.offsetParent).some((b) => { const r = b.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && !(t.right <= r.left || t.left >= r.right || t.bottom <= r.top || t.top >= r.bottom); });
    const last = [...document.querySelectorAll('article.card')].at(-1).getBoundingClientRect();
    return { hit, toastTop: t.top, toastBottom: t.bottom, lastBottom: last.bottom, barTop: document.getElementById('topnav').getBoundingClientRect().top, innerHeight };
  });
  check('aviso de deshacer (390 px): no tapa los botones de las filas, ni siquiera la última', !tg.hit && tg.toastTop > 0 && tg.toastBottom <= tg.barTop + 0.5, JSON.stringify(tg));
  await p.waitForSelector('#toast', { state: 'hidden', timeout: 12000 });
  // el menú ⋯ de la última fila se abre hacia arriba si no cabe bajo la barra inferior
  await lastCard.scrollIntoViewIfNeeded();
  await lastCard.locator('button.more-actions').click();
  const mg = await lastCard.evaluate((card) => {
    const m = card.querySelector('.menu').getBoundingClientRect();
    return { bottom: m.bottom, barTop: document.getElementById('topnav').getBoundingClientRect().top, up: card.querySelector('.menu').classList.contains('up') };
  });
  check('390 px: el menú ⋯ de la última fila no queda bajo la barra inferior', mg.bottom <= mg.barTop + 0.5, JSON.stringify(mg));
  await p.keyboard.press('Escape');
  // un solo h1 visible y «Más» no se cierra al tocar su relleno
  check('un único h1 visible en móvil', (await p.locator('h1:visible').count()) === 1);
  await p.click('#topnav [data-more]');
  await p.waitForSelector('#more-sheet[open]');
  const sb = await p.locator('#more-sheet').boundingBox();
  await p.mouse.click(sb.x + 6, sb.y + sb.height - 6);
  await p.waitForTimeout(150);
  check('Más: un toque en su relleno no la cierra', (await p.locator('#more-sheet[open]').count()) === 1);
  const tsh = await p.evaluate(() => Math.min(...[...document.querySelectorAll('#more-sheet .theme-switch button')].map((b) => b.getBoundingClientRect().height)));
  check('Más: los botones de tema miden 44 px', tsh >= 43.5, String(tsh));
  await p.mouse.click(sb.x + 6, 5); // la cortina
  await p.waitForTimeout(150);
  check('Más: un toque en la cortina la cierra', (await p.locator('#more-sheet[open]').count()) === 0);
  await p.setViewportSize({ width: 1280, height: 900 });
  check('un único h1 visible en escritorio', (await p.locator('h1:visible').count()) === 1);
  const railTh = await p.evaluate(() => Math.min(...[...document.querySelectorAll('.rail-foot .theme-switch button')].map((b) => b.getBoundingClientRect().height)));
  check('rail: los botones de tema miden 44 px', railTh >= 43.5, String(railTh));

  // Carta celeste, Energía: todas las filas con el orbe y el nombre en la misma x (incluido un nombre de 24 caracteres
  // y un personaje sin clase), gasto rápido que resta energía y Plan de hoy con una fila por personaje.
  await p.click('#topnav [data-tab="personajes"]');
  await p.click('#add-btn');
  await p.fill('#add-name', 'Sin clase');
  await p.selectOption('#add-class', { index: 0 });
  await p.click('#add-form button[type=submit]');
  await p.waitForFunction(() => [...document.querySelectorAll('article.card')].some((c) => /Sin clase/.test(c.textContent)));
  const columns = () => p.evaluate(() => [...document.querySelectorAll('#cards article.card')].map((c) => ({
    orb: c.querySelector('.orb-slot').getBoundingClientRect().left, name: c.querySelector('.name').getBoundingClientRect().left,
    w: c.querySelector('.orb-slot').getBoundingClientRect().width, text: c.querySelector('.name').textContent, cls: !!c.querySelector('.cls-name') })));
  const spread = (xs) => Math.max(...xs) - Math.min(...xs);
  // Orbe 3D (orb3d.js): con WebGL cada hueco lleva un canvas.orb3d de su mismo tamaño y posición, dibujado (no en blanco)
  // si está en pantalla, y ningún <canvas> es mayor que un hueco (nada de partículas ni 3D detrás de la página).
  const orb3d = () => p.evaluate(() => {
    const drawn = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; };
    const slots = [...document.querySelectorAll('#cards .orb-slot')].map((s) => {
      const r = s.getBoundingClientRect(), c = s.querySelector('canvas.orb3d'), b = c?.getBoundingClientRect();
      return { has: !!c, same: !!c && ['left', 'top', 'width', 'height'].every((k) => Math.abs(b[k] - r[k]) < 1),
        onScreen: r.bottom > 0 && r.top < innerHeight, drawn: !!c && c.width > 0 && drawn(c), w: r.width };
    });
    const maxSlot = Math.max(...slots.map((x) => x.w));
    return { gl: !!document.createElement('canvas').getContext('webgl'), slots,
      big: [...document.querySelectorAll('canvas')].filter((c) => { const b = c.getBoundingClientRect(); return b.width > maxSlot + 1 || b.height > maxSlot + 1; }).length };
  });
  const checkOrb3d = async (tag) => {
    const o = await orb3d();
    check(`${tag}: WebGL disponible en Chromium (SwiftShader)`, o.gl, JSON.stringify(o));
    check(`${tag}: cada hueco tiene su canvas.orb3d del tamaño del hueco, dibujado si está en pantalla`,
      o.slots.length >= 4 && o.slots.every((x) => x.has && x.same && (!x.onScreen || x.drawn)) && o.slots.some((x) => x.drawn), JSON.stringify(o));
    check(`${tag}: ningún <canvas> mayor que un hueco`, o.big === 0, JSON.stringify(o));
  };
  for (const w of [1280, 390]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(300);
    const cols = await columns();
    const info = JSON.stringify(cols);
    check(`${w} px: hay filas con nombre de 24 caracteres y sin clase`, cols.length >= 4 && cols.some((c) => /^W{24}$/.test(c.text)) && cols.some((c) => !c.cls), info);
    check(`${w} px: el orbe de cada fila empieza en la misma x`, spread(cols.map((c) => c.orb)) <= 1, info);
    check(`${w} px: el nombre de cada fila empieza en la misma x`, spread(cols.map((c) => c.name)) <= 1, info);
    check(`${w} px: el orbe mide lo mismo en todas las filas`, spread(cols.map((c) => c.w)) <= 1 && cols[0].w >= 72, info);
    await checkOrb3d(`orbe 3D ${w} px`);
  }
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.waitForTimeout(300);
  await p.locator('#cards article.card .r-text').first().dispatchEvent('pointerdown'); // selecciona la primera fila
  const firstName = await p.locator('#cards article.card .name').first().textContent();
  const energies = async () => Object.fromEntries((await dbRows('members/')).filter((r) => r.path.includes('/characters/')).map((r) => [r.path.split('/').pop(), r.data.energy]));
  const before = await energies();
  await p.waitForSelector('#quick-chips [data-quick]');
  check('gastos rápidos: el título nombra al personaje de la primera fila', (await p.locator('#quick-title').textContent()).includes(firstName));
  const chipCost = Number((await p.locator('#quick-chips [data-quick] b').first().textContent()).replace(/\D/g, ''));
  await p.locator('#quick-chips [data-quick]').first().click();
  await p.waitForTimeout(900);
  const after = await energies();
  const lowered = Object.keys(before).filter((id) => after[id] < before[id]);
  check('gasto rápido: baja la energía de un solo personaje en el coste del gasto', lowered.length === 1 && before[lowered[0]] - after[lowered[0]] > 0 && before[lowered[0]] - after[lowered[0]] <= chipCost && chipCost > 0, JSON.stringify({ before, after, chipCost }));
    check('gasto rápido: baja exactamente el coste si no hay recarga por medio', before[lowered[0]] - after[lowered[0]] === chipCost || before[lowered[0]] - after[lowered[0]] === chipCost - 15, JSON.stringify({ before, after, chipCost }));
  // modo compacto: mismas x de orbe y nombre
  await p.waitForSelector('#toast', { state: 'hidden', timeout: 12000 });
  await p.evaluate(() => { const t = document.getElementById('compact-toggle'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); });
  for (const w of [1280, 390]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(300);
    const cols = await columns();
    const info = JSON.stringify(cols);
    check(`compacto ${w} px: el orbe y el nombre de cada fila empiezan en la misma x`, cols.length >= 4 && spread(cols.map((c) => c.orb)) <= 1 && spread(cols.map((c) => c.name)) <= 1 && cols[0].w < 104, info);
    await checkOrb3d(`orbe 3D compacto ${w} px`);
  }
  await p.evaluate(() => { const t = document.getElementById('compact-toggle'); t.checked = false; t.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.waitForTimeout(300);
  // editar a «Sin clase» y deshacer (el servidor rechaza classId null)
  const wRow = p.locator('#cards article.card', { hasText: 'W'.repeat(24) });
  const wId = await wRow.getAttribute('data-id');
  const classOf = async () => (await dbRows('members/')).find((r) => r.path.endsWith('/characters/' + wId))?.data.classId;
  const classBefore = await classOf();
  await wRow.locator('button.primary').click();
  await p.selectOption(`#class-${wId}`, '');
  await wRow.locator('form button[type=submit]').click();
  await p.waitForTimeout(900);
  check('editar a «Sin clase»: se guarda sin error', (await classOf()) === '' && (await p.locator('#notice').isHidden()), String(await classOf()));
  await p.click('#undo');
  await p.waitForTimeout(900);
  check('deshacer la edición a «Sin clase»: vuelve la clase anterior', (await classOf()) === classBefore && !!classBefore, String(await classOf()));
  check('Plan de hoy: una fila por personaje', (await p.locator('#plan tbody tr').count()) === (await p.locator('#cards article.card').count()) && (await p.locator('#plan tbody tr').count()) >= 4);
  check('Plan de hoy: sin NaN ni undefined', !/NaN|undefined/.test(await p.locator('#plan').textContent()));
}

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
  await pc.click('#topnav [data-tab="buscar"]');
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

  // columna lateral: visible y con el amigo en línea a >= 1200 px, oculta por debajo
  await pc.setViewportSize({ width: 1440, height: 900 });
  await pc.waitForFunction(() => /DaniSombra/.test(document.querySelector('#side-online')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  check('columna lateral: a 1440 px se ve y muestra al amigo en línea',
    await pc.locator('#side').isVisible() && /DaniSombra/.test(await text(pc, '#side-online')) && !(await pc.locator('#side-online-box').isHidden()));
  const sideRows = await pc.locator('#side-events li').count();
  check('columna lateral: eventos con 1 a 3 filas', sideRows >= 1 && sideRows <= 3, String(sideRows));
  await pc.click('#side [data-go="eventos"]');
  check('columna lateral: Ver todos abre Eventos', (await pc.getAttribute('#topnav [data-tab="eventos"]', 'aria-current')) === 'page' && await pc.locator('#tab-eventos').isVisible());
  check('columna lateral: sin scroll horizontal a 1440 px', await pc.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pc.setViewportSize({ width: 1000, height: 800 });
  check('columna lateral: a 1000 px está oculta', await pc.locator('#side').isHidden());
  await pc.setViewportSize({ width: 1280, height: 900 });

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
  await pc.click('#topnav [data-theme-choice="asmodian"]');
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
  await pc.click('#topnav [data-tab="buscar"]');
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
  await pf.click('#topnav [data-tab="ajustes"]').catch(() => {});
  await pf.fill('#quiet-start', '01:00');
  await pf.click('#prefs-form button[type=submit]');
  await new Promise((r) => setTimeout(r, 600));
  check('tema primera vez: cambiar las horas de silencio no cambia el tema', (await pf.evaluate(() => document.documentElement.dataset.faction)) === 'asmodian');

  // cuentas Normal y Premium (usuario sin personajes: la cabecera se comprueba contra la mezcla real)
  const pg = pf; // misma sesión de F: sin personajes, el inicio de sesión también tiene tope
  await pg.click('#topnav [data-tab="ajustes"]').catch(() => {});
  await pg.fill('#adjust-minutes', '90'); // sin hora de recarga la cabecera no muestra el contador
  await pg.click('#adjust-form button[type=submit]');
  await pg.waitForTimeout(600);
  await pg.click('#topnav [data-tab="personajes"]').catch(() => {});
  const addChar = async (name, account) => {
    await pg.click('#add-btn');
    await pg.fill('#add-name', name);
    await pg.selectOption('#add-class', { index: 1 });
    if (account) await pg.check(`input[name=add-account][value=${account}]`);
    await pg.click('#add-form button[type=submit]');
    await pg.waitForSelector(`article.card:has-text("${name}")`);
  };
  const rowG = (name) => pg.locator('article.card', { hasText: name });
  const subG = () => pg.evaluate(() => document.getElementById('page-sub').innerText);
  check('cuenta: el formulario de alta empieza en Normal', await pg.evaluate(() => { const r = document.querySelector('input[name=add-account]:checked'); return r?.value === 'normal'; }));
  await addChar('CuentaNormal');
  check('cuenta normal (por defecto): la fila muestra «/ 560» y no tiene marca Premium', /\/ 560/.test(await rowG('CuentaNormal').textContent()) && (await rowG('CuentaNormal').locator('.acct-mark').count()) === 0);
  check('cuenta normal: la cabecera muestra «+15 OD» y «tope 560»', /\+15 OD/.test(await subG()) && /tope 560/.test(await subG()), await subG());
  await addChar('CuentaPremium', 'premium');
  check('cuenta premium: la fila muestra «/ 840» y la marca Premium', /\/ 840/.test(await rowG('CuentaPremium').textContent()) && (await rowG('CuentaPremium').locator('.acct-mark').textContent()) === 'Premium');
  check('cabecera con cuentas mezcladas: «Recarga en» y sin «tope»', /Recarga en/.test(await subG()) && !/tope/.test(await subG()) && await pg.locator('#sub-cap').isHidden(), await subG());
  const gId = await rowG('CuentaPremium').getAttribute('data-id');
  const gEnergy = async () => (await dbRows('members/')).find((r) => r.path.endsWith('/characters/' + gId))?.data;
  await rowG('CuentaPremium').locator('button.primary').click();
  await pg.fill(`#energy-${gId}`, '700');
  await rowG('CuentaPremium').locator('form button[type=submit]').click();
  await pg.waitForTimeout(900);
  await rowG('CuentaPremium').locator('button.primary').click();
  const shown = await pg.inputValue(`#energy-${gId}`);
  await pg.check(`input[name="account-${gId}"][value=normal]`);
  await rowG('CuentaPremium').locator('form button[type=submit]').click();
  await pg.waitForTimeout(900);
  const gd = await gEnergy();
  check('editar Premium a Normal sin tocar la energía: se guarda «normal» y la energía no cambia', gd?.account === 'normal' && gd.energy === 700 && shown === '700', JSON.stringify({ gd, shown }));
  check('editar a Normal: la fila muestra «/ 560» y pierde la marca', /\/ 560/.test(await rowG('CuentaPremium').textContent()) && (await rowG('CuentaPremium').locator('.acct-mark').count()) === 0);
  check('ambas Normal: la cabecera vuelve a «tope 560»', /tope 560/.test(await subG()), await subG());
  const gold = await pg.evaluate(async (p) => (await fetch('/api/docs/' + p, { method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-odyle-csrf': '1' }, body: JSON.stringify({ account: 'gold' }) })).status, gd && (await dbRows('members/')).find((r) => r.path.endsWith('/characters/' + gId)).path);
  check('servidor: PATCH con account «gold» da error de validación', gold === 400, String(gold));
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
