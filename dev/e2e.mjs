// End-to-end check of the page through its own UI, with an in-memory stand-in for window.claude
// (db, user, room, sample, downloads). Usage: node dev/e2e.mjs   (serves the repo itself)
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium } from './pw.mjs';
const chromium = await loadChromium();

const ROOT = fileURLToPath(new URL('..', import.meta.url));
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
    'members/u_me': window.__noProfile ? { joinedAt: now - 86_400_000 }
      : { joinedAt: now - 86_400_000, profile: { nick: 'SaltyMain', server: 'Israphel', bio: '', faction: 'elyos', mainCharId: 'c1' } },
    'members/u_me/characters/c1': { name: 'SaltyGhosty', classId: 'asesino', energy: 300, recordedAt: now, order: 1 },
    'members/u_me/characters/c2': { name: 'Shutaruku', classId: 'gladiador', energy: 200, recordedAt: now, order: 2 },
    'members/u_me/settings/presets': { items: [{ id: 'p1', name: 'Mazmorra', cost: 40 }] },
    // Ana leads "Guardianes" (code K7Q2XM9P); in the leader scenario she is a member of my legion instead
    ...(window.__leader ? { 'members/u_ana_x': {} } : {
      'legions/u_ana': { name: 'Guardianes', epoch: 'ep1', codeHash: 'f55d80307efb8130b5768dc57d8cc0534bf13252195f36a4db55d629be3a1fba', proof: 'a002748188da70352af0609b604e23261274851660e638b96f69b265cabfcef1', banned: [], createdAt: now },
      // an impostor copied Guardianes' public fields: the code must not take anyone there
      'legions/u_evil': { name: 'Falsa', epoch: 'ev', codeHash: 'f55d80307efb8130b5768dc57d8cc0534bf13252195f36a4db55d629be3a1fba', proof: 'a002748188da70352af0609b604e23261274851660e638b96f69b265cabfcef1', banned: [], createdAt: now - 1 },
    }),
    ...(window.__prefsAsmodian ? { 'members/u_me/settings/prefs': { faction: 'asmodian' } } : {}),
    'members/u_ana': { joinedAt: now, legionId: window.__leader ? null : 'u_ana', legionEpoch: 'ep1', profile: { nick: 'AnaDaeva', server: 'Israphel', bio: '', faction: 'elyos', mainCharId: 'a1' }, rank: { weekSpent: 400, cpMax: 90000, achievements: 5, updatedAt: now } },
    'legions/u_bob': { name: 'Otros', epoch: 'b', codeHash: 'x'.repeat(64), proof: 'y', banned: [], createdAt: now },
    'members/u_bob': { joinedAt: now, legionId: 'u_bob', legionEpoch: 'b', profile: { nick: 'BobOtro', server: 'Israphel', bio: '', faction: 'elyos', mainCharId: 'b1' }, rank: { weekSpent: 900, cpMax: 200000, achievements: 9, updatedAt: now } },
    'members/u_bob/characters/b1': { name: 'Bobby', classId: 'templario', energy: 600, recordedAt: now, order: 1 },
    'members/u_ana/characters/a1': { name: 'Anita', classId: 'clerigo', energy: 500, recordedAt: now, order: 1 },
  }));
  window.__docs = docs;
  const subs = new Set(); let n = 0;
  const notify = () => setTimeout(() => subs.forEach(f => f()), 0);
  window.__notify = notify;
  const parentOf = k => k.slice(0, k.lastIndexOf('/'));
  const clone = v => JSON.parse(JSON.stringify(v));
  const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? merge(o[k], v) : v; return o; };
  const snapDoc = p => ({ id: p.split('/').pop(), exists: docs.has(p), data: () => clone(docs.get(p)) });
  const doc = p => ({
    id: p.split('/').pop(), path: p,
    get: async () => snapDoc(p),
    set: async d => { if (window.__failLegion && p.startsWith('legions/')) throw { code: 'invalid_argument' }; docs.set(p, clone(d)); notify(); },
    update: async d => { if (window.__failLegion && p.startsWith('legions/')) throw { code: 'invalid_argument' }; if (!docs.has(p)) throw { code: 'not_found' }; docs.set(p, merge(docs.get(p), clone(d))); notify(); },
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
  const names = { u_me: 'Salty', u_ana: 'Ana', u_bob: 'Bob' };
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
  // named rooms (one per legion): me + Ana; tests deliver Ana's messages to the room the page joined
  const named = new Map();
  window.__joined = [];
  room.join = async name => {
    if (named.has(name)) return named.get(name);
    const h = {}, pf = [];
    const rp = [{ ...peers[0], presence: {} }, peers[1]];
    const r = {
      name,
      presence: async patch => { rp[0] = { ...rp[0], presence: { ...rp[0].presence, ...patch } }; window.__presence = rp[0].presence; pf.forEach(f => f({ peers: [...rp], joined: [], left: [], updated: [] })); },
      onPeers(fn) { pf.push(fn); setTimeout(() => fn({ peers: [...rp], joined: [...rp], left: [], updated: [] }), 0); return () => {}; },
      on(topic, fn) { (h[topic] ||= []).push(fn); return () => {}; },
      emit: async (topic, data) => { window.__emits.push({ topic, data, room: name }); (h[topic] || []).forEach(f => f({ topic, data, by: 'u_me', peer: 'p-me', isMe: true, sameTab: true, kind: 'viewer', guest: false })); },
      peers: () => [...rp], connected: () => true, onConnection: () => () => {},
      leave: async () => { named.delete(name); window.__joined = window.__joined.filter(n => n !== name); },
      _h: h,
    };
    named.set(name, r); window.__joined.push(name);
    return r;
  };
  window.__room = { receive: (topic, data, by = 'u_ana') => { for (const r of named.values()) (r._h[topic] || []).forEach(f => f({ topic, data, by, peer: 'p-' + by, isMe: false, sameTab: false, kind: 'viewer', guest: false })); } };
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

async function open(width, height = 900, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${width}px: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${width}px console: ${m.text()}`); });
  if (opts.noProfile) await page.addInitScript(() => { window.__noProfile = true; });
  if (opts.leader) await page.addInitScript(() => { window.__leader = true; });
  if (opts.prefsAsmodian) await page.addInitScript(() => { window.__prefsAsmodian = true; });
  await page.addInitScript(STUB);
  await page.addInitScript(l => { try { localStorage.setItem('odyle-lang', l); localStorage.removeItem('odyle-tab'); } catch {} }, opts.lang || 'es');
  await page.goto(BASE);
  await page.waitForSelector('article.card');
  await page.waitForTimeout(400);
  return page;
}
const db = (page, p) => page.evaluate(k => window.__docs.get(k) ?? null, p);
const text = (page, sel) => page.evaluate(s => document.querySelector(s)?.textContent ?? '', sel);
const visible = (page, sel) => page.locator(sel).first().isVisible();

// ================= Top bar «Engaste» (one line, three clocks) =================
// Bar contract: header.topbar (≤ 72 px tall, one line) with .brand, nav#topnav and .clocks (refill · daily · event).
const barFits = page => page.evaluate(() => {
  const h = document.querySelector('header.topbar'), hr = h.getBoundingClientRect();
  const out = [...document.querySelectorAll('header.topbar .clocks > *, header.topbar .topnav > *, header.topbar .bar-right > *')]
    .filter(n => n.offsetParent !== null)
    .filter(n => { const r = n.getBoundingClientRect(); return r.right > hr.right + 0.5 || r.left < hr.left - 0.5 || r.bottom > hr.bottom + 0.5 || r.top < hr.top - 0.5; })
    .map(n => n.dataset.clock || n.dataset.tab || n.className || n.tagName);
  const clocksOverflow = [...h.querySelectorAll('.clocks .ck')].filter(n => n.offsetParent !== null)
    .filter(n => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1).map(n => n.dataset.clock);
  const nav = h.querySelector('.topnav');
  return { scrollHeight: h.scrollHeight, height: hr.height, out, clocksOverflow, navOverflow: nav ? nav.scrollWidth > nav.clientWidth + 1 : true,
    pageWide: document.documentElement.scrollWidth > innerWidth };
});
{
  const page = await open(1440);
  check('barra: una línea de 72 px con logo, menú y tres relojes', await page.evaluate(() => {
    const h = document.querySelector('header.topbar');
    return h && h.getBoundingClientRect().height === 72 && h.querySelector('.brand') && h.querySelector('nav#topnav')
      && ['refill', 'daily', 'event'].every(k => h.querySelector(`.clocks button.ck[data-clock="${k}"] small.k`) && h.querySelector(`.clocks button.ck[data-clock="${k}"] b.v`));
  }));
  const fit = await barFits(page);
  check('barra 1440: nada se sale ni se parte', fit.scrollHeight <= 72 && !fit.out.length && !fit.clocksOverflow.length && !fit.navOverflow && !fit.pageWide, JSON.stringify(fit));
  check('barra: menú del artifact (Energía, Eventos, Legión, Estadísticas) + Más', await page.evaluate(() =>
    [...document.querySelectorAll('#topnav [data-tab]')].filter(b => b.offsetParent !== null).map(b => b.dataset.tab).join() === 'personajes,eventos,legion,estadisticas'
    && document.querySelector('#topnav [data-more]').offsetParent !== null));
  check('relojes: recarga = #next-tick con hh:mm:ss, diario y evento cuentan', await page.evaluate(() =>
    document.querySelector('[data-clock="refill"] #next-tick') && /^\d\d:\d\d:\d\d$/.test(document.getElementById('next-tick').textContent)
    && /^\d\d:\d\d:\d\d$/.test(document.querySelector('.clocks [data-clock="daily"] .v').textContent)
    && /\d/.test(document.querySelector('.clocks [data-clock="event"] .v').textContent)
    && document.querySelector('.clocks [data-clock="daily"]').classList.contains('reset')
    && !document.querySelector('header.topbar [aria-live]')));
  const t0 = await text(page, '#next-tick'); await page.waitForTimeout(1100);
  check('relojes: avanzan cada segundo', (await text(page, '#next-tick')) !== t0);
  await page.screenshot({ path: 'dev/screens/topbar-luz-1440.png' });
  await page.click('#topnav [data-more]'); await page.waitForTimeout(100);
  const pop = await page.evaluate(() => {
    const m = document.getElementById('more-menu'), b = document.querySelector('#topnav [data-more]').getBoundingClientRect(), r = m.getBoundingClientRect();
    return { open: m.matches(':popover-open'), under: r.top >= b.bottom && Math.abs(r.left - b.left) < 2, tabs: [...m.querySelectorAll('[data-tab]')].map(x => x.dataset.tab).join() };
  });
  check('Más ▾: se abre bajo el botón con Ajustes, Novedades y Acerca de', pop.open && pop.under && pop.tabs === 'ajustes,novedades,acerca', JSON.stringify(pop));
  await page.click('#more-menu [data-tab="ajustes"]'); await page.waitForTimeout(200);
  check('Más ▾: elegir una sección la abre, cierra el menú y marca Más', !(await page.evaluate(() => document.getElementById('more-menu').matches(':popover-open')))
    && await visible(page, '#tab-ajustes') && (await page.getAttribute('#topnav [data-more]', 'aria-current')) === 'page'
    && await page.evaluate(() => document.getElementById('tab-ajustes').firstElementChild.id === 'page-title') && (await text(page, '#page-title')) === 'Ajustes');
  await page.click('.clocks [data-clock="daily"]'); await page.waitForTimeout(200);
  check('reloj diario: lleva a Eventos', await visible(page, '#tab-eventos') && (await text(page, '#page-title')) === 'Eventos');
  await page.click('.clocks [data-clock="refill"]'); await page.waitForTimeout(200);
  check('reloj de recarga: lleva a ajustar la recarga', await visible(page, '#tab-ajustes') && await page.evaluate(() => document.activeElement?.id === 'adjust-minutes'));
  check('pie: aviso de fans al final de la página', await page.evaluate(() => {
    const f = document.querySelectorAll('footer.fan-foot');
    return f.length === 1 && f[0].previousElementSibling === document.querySelector('.page') && /no oficial/.test(f[0].textContent);
  }));
  await page.click('#topnav [data-tab="personajes"]');
  await page.click('header.topbar [data-theme-choice="asmodian"]'); await page.waitForTimeout(300);
  check('barra: Luz/Sombra cambia el tema', await page.evaluate(() => document.documentElement.dataset.faction) === 'asmodian');
  await page.screenshot({ path: 'dev/screens/topbar-sombra-1440.png' });
  await page.close();
}
{
  // Italian at 1000 px: the longest labels, refill and event clocks folded into «Relojes ▾»; still one line.
  const page = await open(1000, 900, { lang: 'it' });
  await page.waitForTimeout(300);
  const fit = await barFits(page);
  check('barra it 1000: una línea (scrollHeight ≤ 72), sin desbordes en los relojes', fit.scrollHeight <= 72 && !fit.out.length && !fit.clocksOverflow.length && !fit.navOverflow && !fit.pageWide, JSON.stringify(fit));
  check('barra 900–1199: el diario a la vista, recarga y evento en «Relojes ▾»', await page.evaluate(() =>
    document.querySelector('.clocks [data-clock="daily"]').offsetParent !== null
    && document.querySelector('.clocks [data-clock="refill"]').offsetParent === null && document.querySelector('.clocks [data-clock="event"]').offsetParent === null
    && document.getElementById('clocks-btn').offsetParent !== null));
  await page.screenshot({ path: 'dev/screens/topbar-it-1000.png' });
  await page.click('#clocks-btn'); await page.waitForTimeout(150);
  check('Relojes ▾: muestra recarga y evento con la cuenta', await page.evaluate(() => {
    const m = document.getElementById('clocks-menu');
    return m.matches(':popover-open') && /^\d\d:\d\d:\d\d$/.test(m.querySelector('[data-clock="refill"] .v').textContent) && /\d/.test(m.querySelector('[data-clock="event"] .v').textContent);
  }));
  await page.close();
}
{
  const page = await open(390, 844);
  const m = await page.evaluate(() => {
    const strip = document.querySelector('.clock-strip'), h = document.querySelector('header.topbar');
    const kids = [...strip.querySelectorAll('.ck')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    return { inStrip: !!strip.querySelector('.clocks') && !strip.hidden, first: kids[0]?.dataset.clock, sticky: getComputedStyle(strip).position === 'sticky',
      under: Math.abs(strip.getBoundingClientRect().top - h.getBoundingClientRect().bottom) < 1,
      head: !!h.querySelector('.brand') && !!h.querySelector('.theme-switch') && !h.querySelector('.clocks'),
      wide: document.documentElement.scrollWidth > innerWidth, bottomBar: getComputedStyle(document.getElementById('topnav')).position === 'fixed' };
  });
  check('móvil: tira fija de relojes bajo la cabecera, el diario primero', m.inStrip && m.first === 'daily' && m.sticky && m.under && m.head && !m.wide && m.bottomBar, JSON.stringify(m));
  await page.screenshot({ path: 'dev/screens/topbar-390.png' });
  await page.evaluate(() => scrollTo(0, 600)); await page.waitForTimeout(100);
  check('móvil: al bajar, la tira de relojes sigue arriba', await page.evaluate(() => Math.abs(document.querySelector('.clock-strip').getBoundingClientRect().top) < 1));
  await page.close();
}

// ================= Desktop =================
{
  const page = await open(1280);
  // nav bar
  check('escritorio: barra superior con 4 secciones + Más', await visible(page, '#topnav') && await page.locator('#topnav button:visible').count() === 5);
  check('escritorio: sin menú ☰', !(await visible(page, '#menu-btn')));
  check('perfil: tarjeta en la cabecera con tu nombre', await visible(page, '#profile-chip') && /SaltyMain/.test(await text(page, '#profile-chip')));
  check('perfil: no se abre solo si ya existe', !(await visible(page, '#profile-modal')));
  // legion: join Ana's with her code
  await page.click('#topnav [data-tab=legion]');
  check('alcance: sin legión no ves a otros miembros', !/AnaDaeva|BobOtro/.test(await text(page, '#legion')) && !(await visible(page, '#calendar-panel')) && !(await visible(page, '#wall-panel')) && !(await visible(page, '#rank-panel')));
  check('alcance: sin legión, En línea pide unirse', /Únete a una legión/.test(await text(page, '#online-panel')) && !(await visible(page, '#lfg-form')));
  check('legión: sin legión, ofrece crear o unirse', await visible(page, '#lg-create') && await visible(page, '#lg-join'));
  await page.fill('#lg-code', 'AAAA-BBBB'); await page.click('#lg-join button[type=submit]'); await page.waitForTimeout(300);
  check('legión: código incorrecto', /no es válido/.test(await text(page, '#lg-error')));
  await page.fill('#lg-code', 'k7q2-xm9p'); await page.click('#lg-join button[type=submit]'); await page.waitForTimeout(500);
  check('legión: te unes con el código (a la de verdad, no a la copia)', (await db(page, 'members/u_me')).legionId === 'u_ana' && (await db(page, 'members/u_me')).legionEpoch === 'ep1' && /Guardianes/.test(await text(page, '#lg-mine')));
  check('legión: el título sale bajo tu nombre', (await text(page, '#pc-title')) === '‹Guardianes›');
  check('legión: un miembro no ve el código, puede salir', !(await visible(page, '#lg-leader')) && await visible(page, '#lg-leave'));
  await page.waitForTimeout(300);
  check('perfil: los demás aparecen con su nombre del juego', /AnaDaeva/.test(await text(page, '#legion')));
  check('alcance: solo ves a tu legión', !/BobOtro|Bobby/.test(await text(page, '#legion')));
  check('alcance: estás en la sala de tu legión', await page.evaluate(() => window.__joined.length === 1 && /^lg-[0-9a-f]{16}$/.test(window.__joined[0])));
  await page.click('#topnav [data-tab=personajes]');
  check('tarjetas propias: 2', await page.locator('#cards article.card').count() === 2);
  check('personajes: sin formulario en medio, con botón +', !(await visible(page, '#add-form')) && await visible(page, '#add-btn'));
  await page.click('#add-btn');
  check('+: abre la ventana con el foco en el nombre', await visible(page, '#add-modal') && await page.evaluate(() => document.activeElement?.id === 'add-name'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check('ventana: Esc la cierra y el foco vuelve al +', !(await visible(page, '#add-modal')) && await page.evaluate(() => document.activeElement?.id === 'add-btn'));
  check('gastos: botón junto al +', await visible(page, '#presets-btn') && !(await page.evaluate(() => document.getElementById('tab-ajustes').contains(document.getElementById('presets-panel')))));
  await page.click('#presets-btn');
  check('gastos: abre la ventana con tus botones', await visible(page, '#presets-modal') && /Mazmorra · 40/.test(await text(page, '#preset-list')));
  await page.fill('#preset-name', 'Jefe'); await page.fill('#preset-cost', '80'); await page.click('#preset-form button[type=submit]'); await page.waitForTimeout(400);
  check('gastos: añadir un botón', (await db(page, 'members/u_me/settings/presets')).items.some(p => p.name === 'Jefe' && p.cost === 80) && await page.locator('article[data-id=c1] button.spend').count() === 2);
  await page.click('#preset-list li:last-child button'); await page.waitForTimeout(400);
  check('gastos: quitar un botón', (await db(page, 'members/u_me/settings/presets')).items.length === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check('gastos: Esc cierra la ventana', !(await visible(page, '#presets-modal')) && await page.evaluate(() => document.activeElement?.id === 'presets-btn'));
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
  const acts = await page.$$eval('#lfg-act option', os => os.map(o => o.textContent));
  check('busco grupo: sin reinicios en las opciones', !acts.some(t => /Reinicio/.test(t)) && acts.includes('Festival Shugo'), acts.join(','));
  check('en línea: aviso en la cabecera', (await text(page, '#online-pill')) === '● 2 en línea');
  check('presencia: publica tu primer personaje', await page.evaluate(() => window.__presence?.char) === 'SaltyGhosty');
  await page.evaluate(() => window.__room.receive('lfg', { id: 'gana1', act: 'Shugo', text: 'faltan 2', char: 'Anita' }));
  await page.waitForTimeout(200);
  check('busco grupo: llega el aviso de Ana con "Voy"', /AnaDaeva busca grupo: Shugo/.test(await text(page, '#alert-text')) && await visible(page, '#alert-action'));
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
  check('busco grupo: tu aviso se envía a la sala de tu legión', mine && mine.data.text === 'nivel 45+' && mine.data.char === 'SaltyGhosty' && /^lg-/.test(mine.room));
  await page.evaluate(id => window.__room.receive('lfg-reply', { id }), mine.data.id);
  await page.waitForTimeout(200);
  check('busco grupo: cuenta las respuestas', (await text(page, '#lfg-state')) === 'Respuestas: 1 · AnaDaeva');

  // calendar
  const at = new Date(Date.now() + 2 * 3_600_000);
  const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.fill('#cal-title', 'Asedio'); await page.fill('#cal-at', local); await page.fill('#cal-dur', '90');
  await page.click('#cal-form button[type=submit]');
  await page.waitForTimeout(400);
  check('calendario: la cita aparece', /Asedio/.test(await text(page, '#cal-list')) && /Voy 1 · Quizá 0 · No 0/.test(await text(page, '#cal-list')));
  await page.click('#cal-list .rsvp button:nth-child(2)');
  await page.waitForTimeout(400);
  const cal = await page.evaluate(() => [...window.__docs].find(([k]) => k.startsWith('legionData/u_ana-ep1/calendar/')));
  check('calendario: "Quizá" se guarda', cal && cal[1].rsvp.u_me === 'maybe' && /Voy 0 · Quizá 1/.test(await text(page, '#cal-list')));
  await page.evaluate(k => { window.__docs.get(k).rsvp.u_ana = 'yes'; }, cal[0]);
  await page.click('#cal-list .rsvp button:nth-child(1)'); await page.waitForTimeout(400);
  check('calendario: las respuestas de otros se mantienen', (await db(page, cal[0])).rsvp.u_ana === 'yes' && /Voy 2/.test(await text(page, '#cal-list')));
  await page.fill('#cal-title', 'Pasada'); await page.fill('#cal-at', '2020-01-01T10:00');
  await page.click('#cal-form button[type=submit]');
  check('calendario: rechaza fechas pasadas', (await text(page, '#cal-error')) === 'Elige una fecha futura');
  await page.click('#cal-list .rsvp button[aria-label^="Borrar"]'); await page.waitForTimeout(300);
  check('calendario: el autor la borra', !(await page.evaluate(() => [...window.__docs.keys()].some(k => k.startsWith('legionData/u_ana-ep1/calendar/')))));

  // calendar alert 15 min before
  await page.evaluate(() => { window.__docs.set('legionData/u_ana-ep1/calendar/soon', { uid: 'u_ana', title: 'Kaira', at: Date.now() + 10 * 60_000, durationMin: 30, rsvp: {} }); });
  await page.click('#cal-list'); // any action; then trigger a db notify via a harmless write
  await page.fill('#wall-text', 'hola legión'); await page.click('#wall-form button[type=submit]');
  await page.waitForTimeout(1500);
  check('calendario: aviso 15 min antes', /📅 Kaira empieza a las/.test(await text(page, '#alert-text')));

  // wall
  check('muro: tu mensaje aparece', /hola legión/.test(await text(page, '#wall-list')) && /Tú/.test(await text(page, '#wall-list')));
  await page.fill('#wall-text', 'otro'); await page.click('#wall-form button[type=submit]');
  check('muro: espera entre mensajes', (await text(page, '#wall-error')) === 'Espera unos segundos entre mensajes');
  await page.click('#wall-list button'); await page.waitForTimeout(300);
  check('muro: el autor borra su mensaje', !(await page.evaluate(() => [...window.__docs.keys()].some(k => k.startsWith('legionData/u_ana-ep1/wall/')))));

  // ranking
  check('ranking: visible con Ana y contigo', await visible(page, '#rank-panel') && /AnaDaeva/.test(await text(page, '#rank-cols')) && /Tú/.test(await text(page, '#rank-cols')));
  check('ranking: solo tu legión', !/BobOtro/.test(await text(page, '#rank-cols')));
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

  // leave the legion
  await page.click('#topnav [data-tab=legion]');
  await page.click('#lg-leave'); await page.click('#lg-leave'); await page.waitForTimeout(400);
  check('legión: sales (con confirmación)', !(await db(page, 'members/u_me')).legionId && await visible(page, '#lg-join') && (await text(page, '#pc-title')) === '');

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

// ================= First visit: create your profile =================
{
  const page = await open(1280, 900, { noProfile: true, prefsAsmodian: true });
  await page.waitForTimeout(300);
  check('primera visita: la facción viene de tus ajustes', (await page.inputValue('#profile-faction')) === 'asmodian');
  check('primera visita: se abre "Tu perfil"', await visible(page, '#profile-modal') && await page.evaluate(() => document.activeElement?.id === 'profile-nick'));
  await page.fill('#profile-nick', 'S');
  await page.click('#profile-form button[type=submit]');
  check('perfil: valida el nombre', /entre 2 y 20/.test(await text(page, '#profile-error')));
  await page.fill('#profile-nick', 'NuevoDaeva'); await page.fill('#profile-server', 'Israphel'); await page.fill('#profile-bio', 'Asesino de noche');
  await page.selectOption('#profile-main', 'c2'); await page.selectOption('#profile-faction', 'asmodian');
  await page.click('#profile-form button[type=submit]'); await page.waitForTimeout(500);
  const prof = (await db(page, 'members/u_me')).profile;
  check('perfil: se guarda', prof && prof.nick === 'NuevoDaeva' && prof.server === 'Israphel' && prof.mainCharId === 'c2' && prof.faction === 'asmodian' && !(await visible(page, '#profile-modal')));
  check('perfil: la facción cambia el tema', await page.evaluate(() => document.documentElement.dataset.faction) === 'asmodian');
  check('perfil: la cabecera muestra el nuevo nombre', /NuevoDaeva/.test(await text(page, '#profile-chip')));
  await page.click('#profile-chip');
  check('perfil: la tarjeta abre el perfil para editarlo', await visible(page, '#profile-modal') && (await page.inputValue('#profile-nick')) === 'NuevoDaeva');
  await page.close();
}

// ================= Leader: create, code, rename, kick, dissolve =================
{
  const page = await open(1280, 900, { leader: true });
  await page.click('#topnav [data-tab=legion]');
  await page.fill('#lg-name', 'ab'); await page.click('#lg-create button[type=submit]');
  check('líder: valida el nombre', /al menos 3/.test(await text(page, '#lg-error')));
  await page.fill('#lg-name', 'Mi Legión'); await page.click('#lg-create button[type=submit]'); await page.waitForTimeout(600);
  const lg = await db(page, 'legions/u_me'), priv = await db(page, 'data/users/u_me/legion');
  check('líder: la legión se crea y eres líder', lg && lg.name === 'Mi Legión' && (await db(page, 'members/u_me')).legionId === 'u_me' && (await text(page, '#pc-title')) === 'Líder · ‹Mi Legión›');
  check('líder: el código solo se guarda cifrado a la vista de todos', priv && /^[A-Z2-9]{8}$/.test(priv.code) && lg.codeHash.length === 64 && !JSON.stringify(lg).includes(priv.code));
  await page.click('#lg-show-code'); await page.waitForTimeout(200);
  check('líder: ve su código', (await text(page, '#lg-code-text')) === priv.code);
  await page.click('#lg-new-code'); await page.waitForTimeout(400);
  const priv2 = await db(page, 'data/users/u_me/legion');
  check('líder: código nuevo', priv2.code !== priv.code && (await db(page, 'legions/u_me')).codeHash !== lg.codeHash && (await text(page, '#lg-code-text')) === priv2.code);
  await page.fill('#lg-rename', 'Alba Eterna'); await page.click('#lg-rename-form button[type=submit]'); await page.waitForTimeout(400);
  check('líder: renombra', (await db(page, 'legions/u_me')).name === 'Alba Eterna' && /Alba Eterna/.test(await text(page, '#pc-title')));
  await page.evaluate(() => { const ep = window.__docs.get('legions/u_me').epoch; Object.assign(window.__docs.get('members/u_ana'), { legionId: 'u_me', legionEpoch: ep }); window.__notify(); });
  await page.waitForTimeout(300);
  check('líder: ve a AnaDaeva como miembro', /AnaDaeva/.test(await text(page, '#lg-members')));
  await page.click('#lg-members button'); await page.click('#lg-members button'); await page.waitForTimeout(400);
  check('líder: expulsa (con confirmación)', (await db(page, 'legions/u_me')).banned.includes('u_ana') && !/AnaDaeva/.test(await text(page, '#lg-members')));
  await page.click('#lg-dissolve'); await page.click('#lg-dissolve'); await page.waitForTimeout(500);
  check('líder: disuelve la legión', !(await db(page, 'legions/u_me')) && !(await db(page, 'members/u_me')).legionId && await visible(page, '#lg-create') && (await text(page, '#pc-title')) === '');
  // re-create: old members (Ana, kicked or not) do not come back by themselves
  await page.evaluate(() => { const a = window.__docs.get('members/u_ana'); a.legionId = 'u_me'; window.__notify(); });
  await page.fill('#lg-name', 'Nueva Era'); await page.click('#lg-create button[type=submit]'); await page.waitForTimeout(600);
  check('líder: al volver a crearla, los antiguos miembros no entran solos', !/AnaDaeva/.test(await text(page, '#lg-members')) && (await db(page, 'legions/u_me')).banned.length === 0);
  // a refused legion write does not lock the page
  await page.evaluate(() => { window.__failLegion = true; });
  await page.click('#lg-new-code'); await page.waitForTimeout(400);
  check('líder: un fallo al guardar la legión no bloquea la página', await page.locator('#cards button.spend').count() > 0 && !(await page.evaluate(() => document.getElementById('add-btn').hidden)) && /permiso/.test(await text(page, '#notice')));
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
  check('móvil: Legión muestra tu legión y En línea', await page.locator('#legion-panel').isVisible() && await page.locator('#online-panel').isVisible());
  await page.click('#topnav [data-tab=personajes]');
  await page.click('#add-btn');
  await page.fill('#add-name', 'Nuevo'); await page.press('#add-name', 'Enter'); await page.waitForTimeout(500);
  check('móvil: + añade un personaje y la ventana se cierra', await page.locator('#cards article.card').count() === 3 && !(await visible(page, '#add-modal')));
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
