// End-to-end check of the page through its own UI, with an in-memory stand-in for window.claude
// (db, user, room, sample, downloads). Usage: node dev/e2e.mjs   (serves the repo itself)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const ROOT = new URL('..', import.meta.url).pathname;
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const THREE_SRC = readFileSync(path.join(ROOT, 'node_modules/three/build/three.module.js'));
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
  try { const body = readFileSync(f); r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); r.end(body); }
  catch { r.writeHead(404); r.end(); }
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;

// ---- window.claude stand-in (runs in the page before its scripts) ----
const STUB = () => {
  const now = Date.now();
  const docs = new Map(Object.entries({
    'settings/schedule': { anchorMs: now - 60 * 60_000 },
    'members/u_me': { joinedAt: now - 86_400_000 },
    'members/u_me/characters/c1': { name: 'SaltyGhosty', classId: 'asesino', energy: 300, recordedAt: now, order: 1 },
    'members/u_me/characters/c2': { name: 'Shutaruku', classId: 'gladiador', energy: 200, recordedAt: now, order: 2 },
    'members/u_me/settings/presets': { items: [{ id: 'p1', name: 'Mazmorra', cost: 40 }] },
    'members/u_ana': { joinedAt: now, rank: { weekSpent: 400, cpMax: 90000, achievements: 5, updatedAt: now } },
    'members/u_ana/characters/a1': { name: 'Anita', classId: 'clerigo', energy: 500, recordedAt: now, order: 1 },
  }));
  window.__docs = docs;
  const subs = new Set(); let n = 0;
  const notify = () => setTimeout(() => subs.forEach(f => f()), 0);
  const parentOf = k => k.slice(0, k.lastIndexOf('/'));
  const clone = v => JSON.parse(JSON.stringify(v));
  const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? merge(o[k], v) : v; return o; };
  const snapDoc = p => ({ id: p.split('/').pop(), exists: docs.has(p), data: () => clone(docs.get(p)) });
  const doc = p => ({
    id: p.split('/').pop(), path: p,
    get: async () => snapDoc(p),
    set: async d => { docs.set(p, clone(d)); notify(); },
    update: async d => { if (!docs.has(p)) throw { code: 'not_found' }; docs.set(p, merge(docs.get(p), clone(d))); notify(); },
    delete: async () => { docs.delete(p); notify(); },
    onSnapshot(next) { const f = () => next(snapDoc(p)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
    collection: sub => collection(p + '/' + sub),
  });
  const query = (name, filters = [], order = null, lim = 1000) => ({
    where: (f, op, v) => query(name, [...filters, [f, op, v]], order, lim),
    orderBy: (f, dir = 'asc') => query(name, filters, [f, dir], lim),
    limit: k => query(name, filters, order, k),
    run() {
      const ops = { '>': (a, b) => a > b, '<': (a, b) => a < b, '==': (a, b) => a === b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b };
      let ks = [...docs.keys()].filter(k => parentOf(k) === name).filter(k => filters.every(([f, op, v]) => ops[op](docs.get(k)[f], v)));
      if (order) ks.sort((a, b) => (docs.get(a)[order[0]] - docs.get(b)[order[0]]) * (order[1] === 'desc' ? -1 : 1));
      return { docs: ks.slice(0, lim).map(snapDoc) };
    },
    get: async function () { return this.run(); },
    onSnapshot(next) { const f = () => next(this.run()); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
  });
  const collection = name => Object.assign(query(name), {
    path: name,
    doc: id => doc(name + '/' + (id || 'id' + (++n) + Math.random().toString(36).slice(2, 6))),
  });
  const names = { u_me: 'Salty', u_ana: 'Ana' };
  const user = {
    id: async () => 'u_me', isOwner: async () => true, can: async () => true, canEdit: async () => true,
    profiles: async ids => Object.fromEntries(ids.map(i => [i, { id: i, name: names[i] || '' }])),
  };
  // room: two people here (me + Ana); tests inject Ana's messages with __room.receive
  const handlers = {}; const peerFns = [];
  const peers = [
    { peer: 'p-me', by: 'u_me', isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: {}, updatedAt: now },
    { peer: 'p-ana', by: 'u_ana', isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: { uid: 'u_ana', char: 'Anita' }, updatedAt: now },
  ];
  window.__emits = [];
  const room = {
    presence: async patch => { peers[0] = { ...peers[0], presence: { ...peers[0].presence, ...patch } }; window.__presence = peers[0].presence; peerFns.forEach(f => f({ peers: [...peers], joined: [], left: [], updated: [] })); },
    onPeers(fn) { peerFns.push(fn); setTimeout(() => fn({ peers: [...peers], joined: [...peers], left: [], updated: [] }), 0); return () => {}; },
    on(topic, fn) { (handlers[topic] ||= []).push(fn); return () => {}; },
    emit: async (topic, data) => { window.__emits.push({ topic, data }); (handlers[topic] || []).forEach(f => f({ topic, data, by: 'u_me', peer: 'p-me', isMe: true, sameTab: true, kind: 'viewer', guest: false })); },
  };
  window.__room = { receive: (topic, data, by = 'u_ana') => (handlers[topic] || []).forEach(f => f({ topic, data, by, peer: 'p-' + by, isMe: false, sameTab: false, kind: 'viewer', guest: false })) };
  // sample: streams a short reply; window.__sampleFail makes the next call reject
  window.__sampleInputs = [];
  const sample = async (input, opts = {}) => {
    window.__sampleInputs.push(JSON.parse(JSON.stringify(input)));
    if (window.__sampleFail) { const code = window.__sampleFail; window.__sampleFail = null; throw { code, message: code }; }
    const text = 'Juega primero con **SaltyGhosty**:\n- 2 mazmorras ahora\n- Shugo a las 12';
    await new Promise(r => setTimeout(r, 50));
    opts.onText?.({ text: text.slice(0, 20), delta: text.slice(0, 20) });
    await new Promise(r => setTimeout(r, 50));
    opts.onText?.({ text, delta: text.slice(20) });
    return { text, truncated: false };
  };
  const caps = { db: { doc, collection }, user, room, sample, downloads: { save: async () => {} } };
  window.claude = { use: async name => caps[name] ?? null };
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? '✔' : '✘'} ${name}${ok ? '' : ' ' + extra}`); };
const errors = [];

async function open(width, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.route(THREE_URL, r => r.fulfill({ contentType: 'text/javascript', body: THREE_SRC }));
  page.on('pageerror', e => errors.push(`${width}px: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${width}px console: ${m.text()}`); });
  await page.addInitScript(STUB);
  await page.addInitScript(() => { try { localStorage.setItem('odyle-lang', 'es'); localStorage.removeItem('odyle-tab'); } catch {} });
  await page.goto(BASE);
  await page.waitForSelector('article.card');
  await page.waitForTimeout(400);
  return page;
}
const db = (page, p) => page.evaluate(k => window.__docs.get(k) ?? null, p);
const text = (page, sel) => page.evaluate(s => document.querySelector(s)?.textContent ?? '', sel);
const visible = (page, sel) => page.locator(sel).first().isVisible();

// ================= Desktop =================
{
  const page = await open(1280);
  // nav bar
  check('escritorio: barra de navegación con 6 secciones', await visible(page, '#topnav') && await page.locator('#topnav button').count() === 6);
  check('escritorio: sin menú ☰', !(await visible(page, '#menu-btn')));
  check('tarjetas propias: 2', await page.locator('#cards article.card').count() === 2);
  check('tarjeta: mazmorras de hoy', /^Mazmorras \(40\): 7 ahora · \d+ antes de medianoche$/.test(await text(page, 'article[data-id=c1] .runs')), await text(page, 'article[data-id=c1] .runs'));

  // keyboard shortcuts
  await page.click('article[data-id=c2] .card-head'); // select Shutaruku
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  check('atajo 1: gasta 40 en el personaje seleccionado', (await db(page, 'members/u_me/characters/c2')).energy === 160 && (await db(page, 'members/u_me/characters/c1')).energy === 300);
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  check('atajo Z: deshace', (await db(page, 'members/u_me/characters/c2')).energy === 200);
  await page.click('article[data-id=c1] button.primary'); // Actualizar opens the form
  await page.focus('#energy-c1'); await page.keyboard.press('1');
  await page.waitForTimeout(200);
  check('atajos: no actúan mientras escribes', (await db(page, 'members/u_me/characters/c1')).energy === 300);

  // CP and goal
  await page.fill('#energy-c1', '300'); await page.fill('#cp-c1', '50000'); await page.fill('#goal-c1', '60000');
  await page.press('#energy-c1', 'Enter'); await page.waitForTimeout(400);
  check('objetivo de PC: barra al 83 %', await page.locator('article[data-id=c1] .goal-bar').getAttribute('aria-valuenow') === '83');
  check('objetivo de PC guardado', (await db(page, 'members/u_me/characters/c1')).cpGoal === 60000);
  await page.click('article[data-id=c1] button.primary');
  await page.fill('#goal-c1', ''); await page.press('#energy-c1', 'Enter'); await page.waitForTimeout(400);
  check('objetivo de PC: vaciar el campo lo quita', !(await db(page, 'members/u_me/characters/c1')).cpGoal && await page.locator('article[data-id=c1] .goal-bar').count() === 0);

  await page.keyboard.press('?');
  check('atajo ?: abre la ayuda', await visible(page, '#keys-help'));
  await page.keyboard.press('Escape');
  check('Esc: cierra la ayuda', !(await visible(page, '#keys-help')));
  await page.keyboard.press('ArrowRight');
  check('atajo →: siguiente sección (Eventos)', await visible(page, '#tab-eventos') && !(await visible(page, '#tab-personajes')));

  // custom timers (Eventos)
  check('eventos: panel de temporizadores', await visible(page, '#timers-panel'));
  await page.fill('#timer-name', 'Prueba'); await page.fill('#timer-min', '0.05');
  await page.click('#timer-form button[type=submit]');
  await page.waitForTimeout(500);
  check('temporizador: aparece con cuenta atrás', /^00:00:0\d$/.test(await text(page, '#timer-list .t-left')), await text(page, '#timer-list .t-left'));
  await page.waitForTimeout(3500);
  check('temporizador: aviso al terminar', await visible(page, '#alert') && (await text(page, '#alert-text')) === '⏰ Prueba: ¡tiempo!');
  check('temporizador: marcado como terminado', (await text(page, '#timer-list .t-left')) === '¡Terminado!');
  await page.click('#alert-close');
  await page.click('#timer-list button');
  await page.waitForTimeout(300);
  check('temporizador: se puede quitar', (await db(page, 'members/u_me/settings/timers')).items.length === 0);
  await page.keyboard.press('ArrowLeft');
  check('atajo ←: sección anterior (Personajes)', await visible(page, '#tab-personajes'));

  // statistics: pace simulator
  await page.click('#topnav [data-tab=estadisticas]');
  check('simulador: una línea por personaje', await page.locator('#sim-list li').count() === 2);
  await page.fill('#sim-runs', '0'); await page.dispatchEvent('#sim-runs', 'input'); await page.waitForTimeout(100);
  const sim0 = await text(page, '#sim-list');
  await page.fill('#sim-runs', '10'); await page.dispatchEvent('#sim-runs', 'input'); await page.waitForTimeout(100);
  const sim10 = await text(page, '#sim-list');
  check('simulador: 0 al día desperdicia, 10 al día se queda sin OD', /desperdicias/.test(sim0) && /te quedas sin OD/.test(sim10), `${sim0} | ${sim10}`);

  // legion: online, LFG, calendar, ranking, wall
  await page.click('#topnav [data-tab=legion]');
  await page.waitForTimeout(200);
  check('en línea: 2 personas (Tú y Ana)', (await text(page, '#online-title')) === 'En línea (2)' && /Tú/.test(await text(page, '#online-list')) && /Ana/.test(await text(page, '#online-list')));
  check('en línea: aviso en la cabecera', (await text(page, '#online-pill')) === '● 2 en línea');
  check('presencia: publica tu primer personaje', await page.evaluate(() => window.__presence?.char) === 'SaltyGhosty');
  await page.evaluate(() => window.__room.receive('lfg', { id: 'gana1', act: 'Shugo', text: 'faltan 2', char: 'Anita' }));
  await page.waitForTimeout(200);
  check('busco grupo: llega el aviso de Ana con "Voy"', /Ana busca grupo: Shugo/.test(await text(page, '#alert-text')) && await visible(page, '#alert-action'));
  await page.click('#alert-action');
  await page.waitForTimeout(200);
  check('busco grupo: "Voy" responde a Ana', await page.evaluate(() => window.__emits.some(e => e.topic === 'lfg-reply' && e.data.id === 'gana1')));
  check('busco grupo: la oferta queda como apuntado', /Apuntado/.test(await text(page, '#lfg-list')));
  await page.evaluate(() => window.__room.receive('lfg', { id: 'gana2', act: 'Shugo' }));
  await page.waitForTimeout(100);
  check('busco grupo: sin spam (un aviso cada 30 s por persona)', await page.locator('#lfg-list li').count() === 1);
  await page.fill('#lfg-text', 'nivel 45+'); await page.click('#lfg-send');
  await page.waitForTimeout(200);
  const mine = await page.evaluate(() => window.__emits.find(e => e.topic === 'lfg'));
  check('busco grupo: tu aviso se envía', mine && mine.data.text === 'nivel 45+' && mine.data.char === 'SaltyGhosty');
  await page.evaluate(id => window.__room.receive('lfg-reply', { id }), mine.data.id);
  await page.waitForTimeout(200);
  check('busco grupo: cuenta las respuestas', (await text(page, '#lfg-state')) === 'Respuestas: 1 · Ana');

  // calendar
  const at = new Date(Date.now() + 2 * 3_600_000);
  const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.fill('#cal-title', 'Asedio'); await page.fill('#cal-at', local); await page.fill('#cal-dur', '90');
  await page.click('#cal-form button[type=submit]');
  await page.waitForTimeout(400);
  check('calendario: la cita aparece', /Asedio/.test(await text(page, '#cal-list')) && /Voy 1 · Quizá 0 · No 0/.test(await text(page, '#cal-list')));
  await page.click('#cal-list .rsvp button:nth-child(2)');
  await page.waitForTimeout(400);
  const cal = await page.evaluate(() => [...window.__docs].find(([k]) => k.startsWith('calendar/')));
  check('calendario: "Quizá" se guarda', cal && cal[1].rsvp.u_me === 'maybe' && /Voy 0 · Quizá 1/.test(await text(page, '#cal-list')));
  await page.evaluate(k => { window.__docs.get(k).rsvp.u_ana = 'yes'; }, cal[0]);
  await page.click('#cal-list .rsvp button:nth-child(1)'); await page.waitForTimeout(400);
  check('calendario: las respuestas de otros se mantienen', (await db(page, cal[0])).rsvp.u_ana === 'yes' && /Voy 2/.test(await text(page, '#cal-list')));
  await page.fill('#cal-title', 'Pasada'); await page.fill('#cal-at', '2020-01-01T10:00');
  await page.click('#cal-form button[type=submit]');
  check('calendario: rechaza fechas pasadas', (await text(page, '#cal-error')) === 'Elige una fecha futura');
  await page.click('#cal-list .rsvp button[aria-label^="Borrar"]'); await page.waitForTimeout(300);
  check('calendario: el autor la borra', !(await page.evaluate(() => [...window.__docs.keys()].some(k => k.startsWith('calendar/')))));

  // calendar alert 15 min before
  await page.evaluate(() => { window.__docs.set('calendar/soon', { uid: 'u_ana', title: 'Kaira', at: Date.now() + 10 * 60_000, durationMin: 30, rsvp: {} }); });
  await page.click('#cal-list'); // any action; then trigger a db notify via a harmless write
  await page.fill('#wall-text', 'hola legión'); await page.click('#wall-form button[type=submit]');
  await page.waitForTimeout(1500);
  check('calendario: aviso 15 min antes', /📅 Kaira empieza a las/.test(await text(page, '#alert-text')));

  // wall
  check('muro: tu mensaje aparece', /hola legión/.test(await text(page, '#wall-list')) && /Tú/.test(await text(page, '#wall-list')));
  await page.fill('#wall-text', 'otro'); await page.click('#wall-form button[type=submit]');
  check('muro: espera entre mensajes', (await text(page, '#wall-error')) === 'Espera unos segundos entre mensajes');
  await page.click('#wall-list button'); await page.waitForTimeout(300);
  check('muro: el autor borra su mensaje', !(await page.evaluate(() => [...window.__docs.keys()].some(k => k.startsWith('wall/')))));

  // ranking
  check('ranking: visible con Ana y contigo', await visible(page, '#rank-panel') && /Ana/.test(await text(page, '#rank-cols')) && /Tú/.test(await text(page, '#rank-cols')));
  await page.click('#topnav [data-tab=personajes]');
  await page.click('article[data-id=c1] button.spend'); await page.waitForTimeout(500);
  check('ranking: publicas tus números al gastar', (await db(page, 'members/u_me')).rank?.weekSpent === 40, 'tras deshacer un gasto debería contar solo el último');

  // assistant
  check('asistente: botón visible', await visible(page, '#ai-fab'));
  await page.click('#ai-fab');
  await page.click('#ai-quick button:first-child');
  await page.waitForTimeout(400);
  check('asistente: respuesta con formato', (await page.locator('#ai-log .ai-msg.bot strong').last().textContent()) === 'SaltyGhosty' && await page.locator('#ai-log .ai-msg.bot li').count() === 2);
  const in1 = await page.evaluate(() => window.__sampleInputs[0]);
  check('asistente: envía tus datos y la pregunta', in1[0].role === 'user' && /"name":"SaltyGhosty"/.test(in1[0].content) && /Answer in Spanish/.test(in1[0].content) && in1.at(-1).content === '¿Qué hago hoy?');
  await page.evaluate(() => { window.__sampleFail = 'rate_limited'; });
  await page.fill('#ai-input', 'segunda'); await page.press('#ai-input', 'Enter'); await page.waitForTimeout(300);
  check('asistente: error de límite se explica', /Demasiadas preguntas/.test(await text(page, '#ai-log')));
  await page.fill('#ai-input', 'tercera'); await page.press('#ai-input', 'Enter'); await page.waitForTimeout(400);
  const in3 = await page.evaluate(() => window.__sampleInputs[2]);
  const roles = in3.slice(1).map(t => t.role).join(',');
  check('asistente: sin preguntas huérfanas tras un error', roles === 'user,assistant,user', roles);
  await page.keyboard.press('1'); await page.waitForTimeout(200);
  check('atajos: no actúan con el asistente abierto', (await db(page, 'members/u_me/characters/c1')).energy === 260);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check('asistente: Esc lo cierra', !(await visible(page, '#ai-panel')));

  // compact mode + language (Ajustes)
  await page.click('#topnav [data-tab=ajustes]');
  await page.check('#compact-toggle');
  await page.click('#topnav [data-tab=estadisticas]');
  check('modo compacto: sin gráficos', await page.evaluate(() => document.body.classList.contains('compact')) && !(await visible(page, '#forecast-panel')));
  await page.click('#topnav [data-tab=ajustes]');
  await page.uncheck('#compact-toggle');
  await page.selectOption('#lang-select', 'en');
  await page.waitForTimeout(300);
  check('idioma: cambia a inglés al momento', (await text(page, '#topnav [data-tab=personajes]')) === 'Characters' && (await text(page, '#ai-fab')) === '✦ Assistant');
  await page.click('#topnav [data-tab=personajes]');
  check('idioma: los datos siguen ahí', await page.locator('#cards article.card').count() === 2);
  await page.click('#topnav [data-tab=ajustes]');
  await page.selectOption('#lang-select', 'es');
  await page.close();
}

// ================= Narrow window (side panel) =================
{
  const page = await open(760);
  check('760 px: barra de navegación visible', await visible(page, '#topnav'));
  await page.close();
}

// ================= Phone =================
{
  const page = await open(390, 844);
  check('móvil: barra de navegación visible, sin ☰', await visible(page, '#topnav') && !(await visible(page, '#menu-btn')));
  check('móvil: la barra no ensancha la página', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.click('#topnav [data-tab=legion]');
  check('móvil: en línea y calendario en Legión', await page.locator('#online-panel').isVisible() && await page.locator('#calendar-panel').isVisible());
  await page.click('#topnav [data-tab=personajes]');
  await page.click('article[data-id=c1] button.spend'); await page.waitForTimeout(300);
  await page.waitForTimeout(400);
  const fab = await page.locator('#ai-fab').boundingBox(), toast = await page.locator('#toast').boundingBox();
  check('móvil: el asistente no tapa el aviso de deshacer', fab && toast && (fab.y + fab.height <= toast.y || fab.y >= toast.y + toast.height || fab.x >= toast.x + toast.width));
  await page.close();
}

check('sin errores de JavaScript', errors.length === 0, errors.join(' | '));
await browser.close(); server.close();
const failed = results.filter(r => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);
