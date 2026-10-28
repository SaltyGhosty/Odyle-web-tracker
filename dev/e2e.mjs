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
    // __tickSoon: the next +OD tick lands 2.5 s after load (the refill pulse)
    'settings/schedule': { anchorMs: window.__tickSoon ? now - 10_800_000 + 2500 : now - 60 * 60_000 },
    'members/u_me': window.__noProfile ? { joinedAt: now - 86_400_000 }
      : { joinedAt: now - 86_400_000, profile: { nick: 'SaltyMain', server: 'Israphel', bio: '', faction: 'elyos', mainCharId: 'c1' } },
    // __empty: no characters; __demo: the Energía screenshots (one at the cap, three not)
    ...(window.__empty ? {} : {
      'members/u_me/characters/c1': { name: 'SaltyGhosty', classId: 'asesino', energy: 300, recordedAt: now, order: 1 },
      'members/u_me/characters/c2': { name: 'Shutaruku', classId: 'gladiador', energy: 200, recordedAt: now, order: 2 },
    }),
    ...(window.__demo ? {
      'members/u_me/characters/c2': { name: 'Shutaruku', classId: 'gladiador', energy: 840, recordedAt: now, order: 2 },
      'members/u_me/characters/c3': { name: 'Nombre-Largo-Clérigo', classId: 'clerigo', energy: 615, recordedAt: now, order: 3 },
      'members/u_me/characters/c4': { name: 'SinClase', energy: 120, recordedAt: now, order: 4 },
    } : {}),
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
    id: async () => 'u_me', isOwner: async () => true, can: async () => !window.__readOnly, canEdit: async () => true,
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
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', reducedMotion: opts.reducedMotion || 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${width}px: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${width}px console: ${m.text()}`); });
  if (opts.noProfile) await page.addInitScript(() => { window.__noProfile = true; });
  if (opts.leader) await page.addInitScript(() => { window.__leader = true; });
  if (opts.prefsAsmodian) await page.addInitScript(() => { window.__prefsAsmodian = true; });
  if (opts.demo) await page.addInitScript(() => { window.__demo = true; });
  if (opts.empty) await page.addInitScript(() => { window.__empty = true; });
  if (opts.readOnly) await page.addInitScript(() => { window.__readOnly = true; });
  if (opts.tickSoon) await page.addInitScript(() => { window.__tickSoon = true; });
  await page.addInitScript(STUB);
  await page.addInitScript(l => { try { localStorage.setItem('odyle-lang', l); localStorage.removeItem('odyle-tab'); } catch {} }, opts.lang || 'es');
  await page.goto(BASE);
  await page.waitForSelector(opts.empty ? '#stage .stage-empty' : 'article.card');
  await page.waitForTimeout(400);
  return page;
}
const db = (page, p) => page.evaluate(k => window.__docs.get(k) ?? null, p);
const text = (page, sel) => page.evaluate(s => document.querySelector(s)?.textContent ?? '', sel);
const visible = (page, sel) => page.locator(sel).first().isVisible();
// Ajustes lives in «Más ▾» on desktop (top bar menu).
const openAjustes = async page => { await page.click('#topnav [data-more]'); await page.click('#more-menu [data-tab=ajustes]'); await page.waitForTimeout(150); };

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
  const fit = await page.evaluate(() => { const s = document.querySelector('.clock-strip');
    return { all3: s.scrollWidth <= s.clientWidth, daily: s.querySelector('[data-clock="daily"] .k').innerText.trim(),
      ck: [...s.querySelectorAll('.ck')].map((c) => { const k = c.querySelector('.k'), v = c.querySelector('.v');
        return k.scrollWidth <= k.clientWidth + 0.5 && getComputedStyle(k).textOverflow !== 'ellipsis' && v.getBoundingClientRect().right <= c.getBoundingClientRect().right; }) }; });
  check('móvil: los tres relojes caben, «Diario» corto y ninguna etiqueta ni valor recortados', fit.all3 && /^diario$/i.test(fit.daily) && fit.ck.every(Boolean), JSON.stringify(fit));
  await page.screenshot({ path: 'dev/screens/topbar-390.png' });
  await page.evaluate(() => scrollTo(0, 600)); await page.waitForTimeout(100);
  check('móvil: al bajar, la tira de relojes sigue arriba', await page.evaluate(() => Math.abs(document.querySelector('.clock-strip').getBoundingClientRect().top) < 1));
  await page.close();
}

// ================= Energía «Engaste»: stage + cards =================
// Demo data: Shutaruku at the cap, three others not. The stage holds the most urgent; the cards hold everyone else.
const stageInfo = page => page.evaluate(() => {
  const st = document.getElementById('stage'), slot = st.querySelector('.stage-orb .orb-slot');
  const ids = [...document.querySelectorAll('[data-num]')].map(n => n.dataset.num);
  return { name: st.querySelector('h2')?.textContent, tone: st.className, go: st.querySelector('button.stage-go')?.textContent ?? null,
    goUrgent: !!st.querySelector('button.stage-go.urgent'), why: st.querySelector('.r-num .stage-why')?.textContent,
    whyAfterNum: st.querySelector('.r-num .num')?.parentElement === st.querySelector('.stage-why')?.parentElement,
    slot: slot ? Math.round(slot.getBoundingClientRect().width) : 0, has3d: !!slot?.querySelector('canvas.orb3d'), num: st.querySelector('[data-num]')?.dataset.num,
    dupNums: ids.length !== new Set(ids).size, cards: [...document.querySelectorAll('#cards article.card')].map(c => c.dataset.id).join(),
    count: document.querySelector('#chars-bar h2 .count')?.textContent, wide: document.documentElement.scrollWidth > innerWidth };
});
const tallShot = async (page, w, file) => {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(700); // every orb on screen, so every 3D orb is drawn
  await page.screenshot({ path: file });
};
{
  const page = await open(1440, 900, { demo: true });
  const s = await stageInfo(page);
  check('escenario: el que está al tope, en rojo, con «Gastar ahora»', s.name === 'Shutaruku' && /tone-urgent/.test(s.tone) && s.go === 'Gastar ahora' && s.goUrgent, JSON.stringify(s));
  check('escenario: el motivo va pegado al número', s.why === 'pierde 30 OD cada 3 h' && s.whyAfterNum, JSON.stringify(s));
  // the slot is 390 px so the 3D sphere itself (~64 % of it) is 250 px; the setting's hairline sits 10 px outside it
  check('escenario: orbe 3D de 250 px (hueco de 390 px)', s.slot === 390 && s.has3d, JSON.stringify(s));
  check('tarjetas: el resto, «3 más», sin repetir el del escenario', s.cards === 'c1,c3,c4' && s.count === '3 más' && s.num === 'c2' && !s.dupNums, JSON.stringify(s));
  check('tarjetas: orbe de 136 px arriba, nombre, número y estado', await page.evaluate(() => [...document.querySelectorAll('#cards article.card')].every(c => {
    const o = c.querySelector('.orb-slot').getBoundingClientRect(), n = c.querySelector('.name').getBoundingClientRect();
    return Math.round(o.width) === 136 && o.bottom <= n.top && c.querySelector('.r-num .num') && c.querySelector('.full-in');
  })));
  check('escenario: sin la banda ni la columna lateral', !(await page.locator('#summary').count()) && !(await page.locator('#side').count()) && /al tope/.test(await text(page, '#band-status')));
  check('Hoy: eventos, reinicio semanal y nada fuera de la página', await page.locator('#today .today-list li').count() >= 2 && /Reinicio semanal/.test(await text(page, '#today')) && !s.wide);
  check('gastos rápidos: del personaje del escenario', /Shutaruku/.test(await text(page, '#quick-title')));
  await page.screenshot({ path: 'dev/screens/energia-luz-1440.png' });
  // a click on a card brings it to the stage; Escape on the stage gives it back to the most urgent
  await page.click('#cards article[data-id=c3] .name'); await page.waitForTimeout(500);
  const s2 = await stageInfo(page);
  check('tarjeta: al pulsarla pasa al escenario', s2.name === 'Nombre-Largo-Clérigo' && !/tone-urgent/.test(s2.tone) && !s2.goUrgent && s2.cards === 'c1,c2,c4' && !s2.dupNums && /Nombre-Largo/.test(await text(page, '#quick-title')), JSON.stringify(s2));
  await page.click('#cards article[data-id=c1] button.more-actions'); await page.click('#cards article[data-id=c1] .menu button.update'); await page.waitForTimeout(200);
  check('tarjeta: pulsar sus botones no la sube al escenario', (await stageInfo(page)).name === 'Nombre-Largo-Clérigo' && await visible(page, '#energy-c1'));
  await page.click('#cards article[data-id=c1] form button[type=button]'); await page.waitForTimeout(200);
  await page.click('#stage button.stage-go'); await page.waitForTimeout(300);
  check('«Gastar ahora»: lleva a los gastos rápidos del escenario', await page.evaluate(() => document.activeElement?.matches('#quick-chips [data-quick]')));
  await page.focus('#stage button.stage-go'); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check('Esc en el escenario: vuelve el más urgente', (await stageInfo(page)).name === 'Shutaruku');
  // keyboard: the card's orb is a button «Ver en el escenario» (Shift+Tab from its Gastar), Enter moves it to the stage and focus lands on the stage name
  await page.focus('#cards article[data-id=c4] button.spend'); await page.keyboard.press('Shift+Tab');
  const tabbed = await page.evaluate(() => document.activeElement?.matches('#cards article[data-id=c4] button.to-stage'));
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  check('teclado: el orbe de la tarjeta es «Ver en el escenario» y Enter lo pone en el escenario con el foco allí', tabbed && (await stageInfo(page)).name === 'SinClase'
    && await page.evaluate(() => document.activeElement?.id === 'stage-name'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check('teclado: Esc desde el escenario devuelve el más urgente', (await stageInfo(page)).name === 'Shutaruku');
  // another character reaches the cap: the stage stays, a short notice offers to bring them
  await page.evaluate(() => { Object.assign(window.__docs.get('members/u_me/characters/c3'), { energy: 840, recordedAt: Date.now() }); window.__notify(); });
  await page.waitForTimeout(500);
  check('al tope: aviso «X está al tope» y el escenario no salta', (await text(page, '#alert-text')) === 'Nombre-Largo-Clérigo está al tope' && await visible(page, '#alert-action')
    && (await stageInfo(page)).name === 'Shutaruku' && await page.locator('#cards article[data-id=c3].full').count() === 1);
  await page.click('#alert-action'); await page.waitForTimeout(400);
  check('al tope: el aviso lo lleva al escenario', (await stageInfo(page)).name === 'Nombre-Largo-Clérigo');
  await page.reload(); await page.waitForSelector('#stage article.card'); await page.waitForTimeout(400);
  check('recargar: vuelve el más urgente (la elección no se guarda)', (await stageInfo(page)).name === 'Shutaruku');
  // the pinned stage character is removed: the stage falls back to the urgent one
  await page.click('#cards article[data-id=c1] button.to-stage'); await page.waitForTimeout(300);
  check('escenario fijado: SaltyGhosty', (await stageInfo(page)).name === 'SaltyGhosty');
  await page.evaluate(() => { window.__docs.delete('members/u_me/characters/c1'); window.__notify(); }); await page.waitForTimeout(300);
  check('quitar al personaje fijado: el escenario vuelve al más urgente', (await stageInfo(page)).name === 'Shutaruku');
  // more than 8 characters: the cards turn 2D (SVG only, no canvas) while the stage keeps its 3D orb
  const before3d = (await stageInfo(page)).has3d;
  await page.evaluate(() => { for (let n = 11; n <= 18; n++) window.__docs.set('members/u_me/characters/c' + n, { name: 'Extra' + n, classId: 'mago', energy: 100, recordedAt: Date.now(), order: n }); window.__notify(); });
  await page.waitForTimeout(500);
  const many = await page.evaluate(() => ({ n: document.querySelectorAll('#cards article.card').length, canv: document.querySelectorAll('#cards canvas').length,
    svg: [...document.querySelectorAll('#cards article.card')].every(c => c.querySelector('.orb-slot svg')) }));
  check('más de 8 personajes: tarjetas en 2D (solo SVG) y el escenario sigue en 3D', many.n > 8 && many.canv === 0 && many.svg && (await stageInfo(page)).has3d === before3d && before3d, JSON.stringify({ many, before3d }));
  await page.click('header.topbar [data-theme-choice="asmodian"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'dev/screens/energia-sombra-1440.png' });
  await page.close();
}
for (const theme of ['luz', 'sombra']) {
  const page = await open(390, 844, { demo: true });
  if (theme === 'sombra') { await page.evaluate(() => document.querySelector('[data-theme-choice="asmodian"]').click()); await page.waitForTimeout(300); }
  const s = await stageInfo(page);
  check(`móvil ${theme}: escenario arriba con orbe de 180 px (hueco de 280 px), tarjetas debajo en una columna`, s.name === 'Shutaruku' && s.slot === 280 && !s.wide && await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect(), cards = [...document.querySelectorAll('#cards article.card')].map(c => c.getBoundingClientRect());
    return cards.every(c => c.top >= st.bottom && Math.abs(c.left - cards[0].left) < 1);
  }), JSON.stringify(s));
  await tallShot(page, 390, `dev/screens/energia-${theme}-390.png`);
  await page.close();
}
{
  const page = await open(1440, 900, { empty: true });
  check('sin personajes: el escenario invita a añadir uno', /Añade tu personaje/.test(await text(page, '#stage')) && await visible(page, '#stage button.stage-go'));
  await page.screenshot({ path: 'dev/screens/energia-empty-1440.png' });
  await page.click('#stage button.stage-go');
  check('sin personajes: el botón abre «Añadir personaje»', await visible(page, '#add-modal'));
  await page.close();
}
{
  const page = await open(1440, 900, { demo: true, readOnly: true });
  check('solo lectura: sin «Gastar ahora» en el escenario', (await stageInfo(page)).name === 'Shutaruku' && await page.locator('#stage button', { hasText: 'Gastar ahora' }).count() === 0);
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
  check('tarjetas propias: 2 (una en el escenario, una en la vitrina)', await page.locator('#tab-personajes article.card').count() === 2 && await page.locator('#cards article.card').count() === 1);
  check('personajes: sin formulario en medio, con botón +', !(await visible(page, '#add-form')) && await visible(page, '#add-btn'));
  await page.click('#add-btn');
  check('+: abre la ventana con el foco en el nombre', await visible(page, '#add-modal') && await page.evaluate(() => document.activeElement?.id === 'add-name'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check('ventana: Esc la cierra y el foco vuelve al +', !(await visible(page, '#add-modal')) && await page.evaluate(() => document.activeElement?.id === 'add-btn'));
  check('gastos: botón junto al +', await visible(page, '#presets-btn') && !(await page.evaluate(() => document.getElementById('tab-ajustes').contains(document.getElementById('presets-panel')))));
  await page.click('#presets-btn');
  check('gastos: abre la ventana con tus botones', await visible(page, '#presets-modal') && /Mazmorra · 40/.test(await text(page, '#preset-list')));
  await page.fill('#preset-name', 'Jefe'); await page.fill('#preset-cost', '80'); await page.click('#preset-form button[type=submit]'); await page.waitForTimeout(400);
  check('gastos: añadir un botón', (await db(page, 'members/u_me/settings/presets')).items.some(p => p.name === 'Jefe' && p.cost === 80) && await page.locator('#quick-chips [data-quick]').count() === 2);
  await page.click('#preset-list li:last-child button'); await page.waitForTimeout(400);
  check('gastos: quitar un botón', (await db(page, 'members/u_me/settings/presets')).items.length === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check('gastos: Esc cierra la ventana', !(await visible(page, '#presets-modal')) && await page.evaluate(() => document.activeElement?.id === 'presets-btn'));
  check('plan: mazmorras de hoy del personaje', /Mazmorra ×7 en/.test(await text(page, '#plan [data-plan=c1]')), await text(page, '#plan [data-plan=c1]'));

  // keyboard shortcuts
  await page.click('article[data-id=c2] .name'); // select Shutaruku (it moves to the stage)
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  check('atajo 1: gasta 40 en el personaje seleccionado', (await db(page, 'members/u_me/characters/c2')).energy === 160 && (await db(page, 'members/u_me/characters/c1')).energy === 300);
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  check('atajo Z: deshace', (await db(page, 'members/u_me/characters/c2')).energy === 200);
  await page.click('article[data-id=c1] button.more-actions'); await page.click('article[data-id=c1] .menu button.update'); // ⋯ › Actualizar opens the form
  await page.focus('#energy-c1'); await page.keyboard.press('1');
  await page.waitForTimeout(200);
  check('atajos: no actúan mientras escribes', (await db(page, 'members/u_me/characters/c1')).energy === 300);

  // CP and goal
  await page.fill('#energy-c1', '300'); await page.fill('#cp-c1', '50000'); await page.fill('#goal-c1', '60000');
  await page.press('#energy-c1', 'Enter'); await page.waitForTimeout(400);
  check('objetivo de PC: barra al 83 %', await page.locator('article[data-id=c1] .goal-bar').getAttribute('aria-valuenow') === '83');
  check('objetivo de PC guardado', (await db(page, 'members/u_me/characters/c1')).cpGoal === 60000);
  await page.click('article[data-id=c1] button.more-actions'); await page.click('article[data-id=c1] .menu button.update');
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

  // compact mode + language (Ajustes); the calendar notice still sits over the top bar's centre: close it first
  if (await visible(page, '#alert')) { await page.click('#alert-close'); await page.waitForTimeout(300); }
  await openAjustes(page);
  await page.check('#compact-toggle');
  await page.click('#topnav [data-tab=estadisticas]');
  check('modo compacto: sin gráficos', await page.evaluate(() => document.body.classList.contains('compact')) && !(await visible(page, '#forecast-panel')));
  await openAjustes(page);
  await page.uncheck('#compact-toggle');
  await page.selectOption('#lang-select', 'en');
  await page.waitForTimeout(300);
  check('idioma: cambia a inglés al momento', (await text(page, '#topnav [data-tab=personajes]')) === 'Energy' && (await text(page, '#ai-fab')).trim() === 'Assistant');
  await page.click('#topnav [data-tab=personajes]');
  check('idioma: los datos siguen ahí', await page.locator('#tab-personajes article.card').count() === 2);
  await openAjustes(page);
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

// ================= Living sky, pulse and motion =================
// skyRead: a hash of every pixel of canvas#sky (stricter than one pixel) and how many are drawn. The first readback of
// a GPU canvas moves it to memory and may round differently, so each read discards one readback first.
const skyRead = page => page.evaluate(() => {
  const c = document.getElementById('sky'), g = c.getContext('2d');
  g.getImageData(0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let h = 0, lit = 0;
  for (let i = 0; i < d.length; i++) { h = (h * 31 + d[i]) | 0; if (i % 4 === 3 && d[i] > 0) lit++; }
  return { h, lit, w: c.width, ht: c.height };
});
{
  const page = await open(1440, 900, { demo: true });
  check('cielo: canvas#sky primero en body, fijo detrás de todo, sin clics y más grande que la ventana', await page.evaluate(() => {
    const c = document.getElementById('sky'), cs = getComputedStyle(c), r = c.getBoundingClientRect();
    return c === document.body.firstElementChild && c.getAttribute('aria-hidden') === 'true' && cs.position === 'fixed' && cs.zIndex === '-1'
      && cs.pointerEvents === 'none' && r.left <= -8 && r.top <= -8 && r.right >= innerWidth + 8 && r.bottom >= innerHeight + 8
      && getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)' && document.documentElement.scrollWidth <= innerWidth;
  }));
  const a = await skyRead(page); await page.waitForTimeout(1000); const b = await skyRead(page);
  check('cielo: con movimiento, dos lecturas a 1 s son distintas', a.lit > 0 && a.h !== b.h, JSON.stringify([a, b]));
  check('cielo: a media resolución (0,5)', a.w === 720 && a.ht === 450, JSON.stringify(a));
  check('orbes: los de las tarjetas flotan; el del escenario y «Gastar ahora» no se mueven', await page.evaluate(() =>
    [...document.querySelectorAll('#cards article.card.tile')].every(c => getComputedStyle(c.querySelector('.r-orb')).animationName === 'orb-float')
    && getComputedStyle(document.querySelector('#stage .r-orb')).animationName === 'none'
    && getComputedStyle(document.querySelector('#stage button.stage-go')).animationName === 'none'));
  await page.mouse.move(1430, 890); await page.waitForTimeout(150);
  const par = await page.evaluate(() => document.getElementById('sky').style.translate);
  check('paralaje: el ratón mueve el cielo unos píxeles (≤ 8)', /^(7\.\d+|8\.00)px (7\.\d+|8\.00)px$/.test(par), par);
  await page.mouse.move(720, 450); await page.waitForTimeout(150);
  await page.screenshot({ path: 'dev/screens/sky-luz-1440.png' });
  // the first visit to a section plays its entrance; coming back to a section already seen does not
  await page.click('#topnav [data-tab=eventos]'); await page.waitForTimeout(50);
  const first = await page.evaluate(() => document.querySelectorAll('#tab-eventos > .enter').length);
  await page.waitForTimeout(1300);
  await page.click('#topnav [data-tab=personajes]'); await page.waitForTimeout(100);
  await page.click('#topnav [data-tab=eventos]'); await page.waitForTimeout(50);
  const again = await page.evaluate(() => document.querySelectorAll('#tab-eventos .enter').length + document.getAnimations().filter(x => x.animationName === 'rise').length);
  check('entradas: solo la primera vez que se abre una sección', first >= 1 && again === 0, JSON.stringify({ first, again }));
  await page.click('#topnav [data-tab=personajes]'); await page.waitForTimeout(50);
  const back = await page.evaluate(() => document.querySelectorAll('#tab-personajes .enter').length);
  check('entradas: al volver a Energía las tarjetas no vuelven a entrar', back === 0, String(back));
  await page.click('header.topbar [data-theme-choice="asmodian"]'); await page.waitForTimeout(400);
  const c = await skyRead(page);
  check('cielo Sombra: los colores cambian con el tema', c.lit > 0 && c.h !== b.h);
  await page.screenshot({ path: 'dev/screens/sky-sombra-1440.png' });
  // «Reducir animaciones»: the sky stops on one still frame, the orbs stop floating, no parallax
  await openAjustes(page);
  await page.click('#lite-toggle'); await page.waitForTimeout(200);
  await page.click('#topnav [data-tab=personajes]'); await page.waitForTimeout(200);
  const l1 = await skyRead(page); await page.mouse.move(10, 10); await page.waitForTimeout(1000); const l2 = await skyRead(page);
  check('«Reducir animaciones»: cielo quieto, sin paralaje ni orbes flotando', l1.lit > 0 && l1.h === l2.h && await page.evaluate(() =>
    ['', '0px', '0px 0px', '0.00px 0.00px'].includes(document.getElementById('sky').style.translate)
    && [...document.querySelectorAll('#cards .r-orb')].every(o => getComputedStyle(o).animationName === 'none')), JSON.stringify([l1, l2]));
  await openAjustes(page);
  await page.click('#lite-toggle'); await page.waitForTimeout(200);
  const m1 = await skyRead(page); await page.waitForTimeout(1000); const m2 = await skyRead(page);
  check('«Reducir animaciones» de nuevo apagado: el cielo vuelve a moverse', m1.h !== m2.h);
  await page.click('#topnav [data-tab=personajes]'); await page.waitForTimeout(200);
  // a new card rises in (4th card: 3 × 60 ms stagger) and a repaint during its entrance carries it on, never restarts it.
  // The first read lands some frames after the insert (the 390 px stage orb is a heavy frame on software GL): any delay left counts.
  await page.evaluate(() => { window.__docs.set('members/u_me/characters/c5', { name: 'Recién', classId: 'mago', energy: 100, recordedAt: Date.now(), order: 5 }); window.__notify(); });
  await page.waitForSelector('#cards article[data-id=c5]');
  // deterministic: the entrance exists (name, positive delay), a repaint carries it on (a negative-delay `rise`, never `enter` again once done)
  const e1 = await page.evaluate(() => { const c = document.querySelector('#cards article[data-id=c5]'); const a = c.getAnimations().find(x => x.animationName === 'rise');
    return { enter: c.classList.contains('enter'), anim: getComputedStyle(c).animationName, d: parseFloat(c.style.getPropertyValue('--enter-delay')), has: !!a }; });
  await page.evaluate(() => window.__notify()); await page.waitForTimeout(60);
  const e2 = await page.evaluate(() => { const c = document.querySelector('#cards article[data-id=c5]'); return { enter: c.classList.contains('enter'), has: c.getAnimations().some(x => x.animationName === 'rise') }; });
  await page.waitForFunction(() => !document.querySelector('#cards article[data-id=c5]').getAnimations().some(x => x.animationName === 'rise' && x.playState === 'running'), null, { timeout: 4000 });
  await page.evaluate(() => window.__notify()); await page.waitForTimeout(60);
  const e3 = await page.evaluate(() => document.querySelector('#cards article[data-id=c5]').classList.contains('enter'));
  check('entradas: la tarjeta nueva sube con su escalón y sigue al repintar, sin repetir', e1.enter && e1.anim === 'rise' && e1.d <= 180 && (e1.has || e1.d <= 0) && e2.enter && !e3, JSON.stringify({ e1, e2, e3 }));
  // the floating orb does not restart when a repaint rebuilds the card: its animation phase carries on
  const ph = () => page.evaluate(() => { const o = document.querySelector('#cards article.card.tile .r-orb'); const a = o.getAnimations().find(x => x.animationName === 'orb-float');
    return { t: performance.now(), phase: a ? (a.currentTime - a.effect.getTiming().delay) % 4000 : -1 }; });
  const f1 = await ph(); await page.evaluate(() => window.__notify()); await page.waitForTimeout(40); const f2 = await ph();
  const want = (f1.phase + (f2.t - f1.t)) % 4000, diff = Math.min(Math.abs(f2.phase - want), 4000 - Math.abs(f2.phase - want));
  check('orbes de tarjeta: el vaivén sigue donde iba al repintar (no se reinicia)', f1.phase >= 0 && f2.phase >= 0 && diff < 250, JSON.stringify({ f1, f2, diff }));
  await page.close();
}
{
  // prefers-reduced-motion: one still frame, no motes, no parallax, no entrances; the clocks keep counting
  const page = await open(1440, 900, { demo: true, reducedMotion: 'reduce' });
  const a = await skyRead(page); await page.mouse.move(1430, 890);
  const t0 = await text(page, '#next-tick'); await page.waitForTimeout(1000);
  const b = await skyRead(page);
  check('movimiento reducido: el cielo no se redibuja (dos lecturas a 1 s iguales)', a.lit > 0 && a.h === b.h, JSON.stringify([a, b]));
  check('movimiento reducido: sin paralaje, sin entradas ni orbes flotando; los relojes siguen', await page.evaluate(() =>
    ['', '0px', '0px 0px', '0.00px 0.00px'].includes(document.getElementById('sky').style.translate)
    && [...document.querySelectorAll('.card')].every(c => getComputedStyle(c).animationName === 'none')
    && [...document.querySelectorAll('.r-orb')].every(o => getComputedStyle(o).animationName === 'none')) && (await text(page, '#next-tick')) !== t0);
  await page.close();
}
{
  // Refill pulse: a tick 2.5 s after load runs the gain path (the +N, the orb ripple, the sky's wave) and the sky keeps going.
  const page = await open(1440, 900, { demo: true, tickSoon: true });
  await page.waitForSelector('#stage .gain, #cards .gain', { timeout: 6000 }).catch(() => {});
  const g = await page.evaluate(() => document.querySelectorAll('.gain').length);
  const a = await skyRead(page); await page.waitForTimeout(300); const b = await skyRead(page);
  check('pulso: en la recarga sale el +N y el cielo sigue vivo', g >= 1 && a.h !== b.h, String(g));
  await page.close();
}
{
  const page = await open(390, 844, { demo: true });
  check('cielo 390: cubre la ventana, a 0,35 y sin ensanchar la página', await page.evaluate(() => {
    const c = document.getElementById('sky'), r = c.getBoundingClientRect();
    return r.left <= -8 && r.right >= innerWidth + 8 && c.width === Math.round(innerWidth * 0.35) && document.documentElement.scrollWidth <= innerWidth;
  }));
  await page.close();
}

// ================= Narrow window (side panel) =================
{
  const page = await open(760);
  check('760 px: barra de navegación visible', await visible(page, '#topnav'));
  await page.close();
}

// ================= Card skin: every other section, 1440 and 390, Luz and Sombra =================
// Section panels are cards (18 px radius, no 1px rule); Eventos opens with the daily then the weekly reset, each countdown 32 px.
const SECTIONS = ['eventos', 'legion', 'estadisticas', 'ajustes', 'novedades', 'acerca'];
const skinInfo = page => page.evaluate(() => {
  const tab = [...document.querySelectorAll('.tab-panel')].find(p => !p.hidden);
  const cards = [...tab.querySelectorAll(':scope > .panel, :scope > .legion > .member')].filter(n => n.offsetParent !== null).map(n => getComputedStyle(n));
  return { cards: cards.length, round: cards.every(c => c.borderTopLeftRadius === '18px' && c.borderTopWidth === '0px' && c.paddingTop === '22px'),
    solid: cards.every(c => c.backgroundColor !== 'rgba(0, 0, 0, 0)'), wide: document.documentElement.scrollWidth > innerWidth };
});
for (const theme of ['luz', 'sombra']) for (const w of [1440, 390]) {
  const page = await open(w, 900, { demo: true });
  if (theme === 'sombra') { await page.evaluate(() => document.querySelector('[data-theme-choice="asmodian"]').click()); await page.waitForTimeout(300); }
  for (const t of SECTIONS) {
    await page.evaluate(id => document.querySelector(`#topnav [data-tab="${id}"]`).click(), t);
    await page.waitForTimeout(700); // the section's entrance has settled
    const s = await skinInfo(page);
    check(`tarjetas ${theme} ${w}: ${t} en tarjetas de 18 px, fondo sólido y sin ensanchar`, s.cards >= 1 && s.round && s.solid && !s.wide, JSON.stringify(s));
    if (t === 'eventos') {
      const ev = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#event-list > li')];
        return { order: rows.slice(0, 2).map(r => r.dataset.event).join(), resets: rows.filter(r => r.classList.contains('reset')).length,
          count: rows.every(r => getComputedStyle(r.querySelector('.ev-count')).fontSize === '32px'), radius: getComputedStyle(rows[0]).borderTopLeftRadius,
          // the resets keep the card fill and add an accent hairline and accent numerals (the daily clock's mark)
          tint: (() => { const plain = rows.find(r => !r.matches('.reset, .active')), a = getComputedStyle(rows[0]), p = getComputedStyle(plain);
            return a.backgroundColor === p.backgroundColor && a.boxShadow !== p.boxShadow
              && getComputedStyle(rows[0].querySelector('.ev-count')).color !== getComputedStyle(plain.querySelector('.ev-count')).color; })() };
      });
      check(`eventos ${theme} ${w}: reinicio diario y semanal primero, con filete y cifras de acento, reloj de 32 px`, ev.order === 'daily,weekly' && ev.resets === 2 && ev.count && ev.tint, JSON.stringify(ev));
    }
    await tallShot(page, w, `dev/screens/tarjetas-${t}-${theme}-${w}.png`);
    await page.setViewportSize({ width: w, height: 900 });
    if (t === 'legion') { // and inside Ana's legion: members, calendar, ranking, wall and the others' cards
      await page.fill('#lg-code', 'k7q2-xm9p'); await page.click('#lg-join button[type=submit]'); await page.waitForTimeout(800);
      const s2 = await skinInfo(page);
      check(`tarjetas ${theme} ${w}: legión con miembros en tarjetas`, s2.cards >= 4 && s2.round && s2.solid && !s2.wide, JSON.stringify(s2));
      await tallShot(page, w, `dev/screens/tarjetas-legion-miembro-${theme}-${w}.png`);
      await page.setViewportSize({ width: w, height: 900 });
    }
  }
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
  check('móvil: + añade un personaje y la ventana se cierra', await page.locator('#tab-personajes article.card').count() === 3 && !(await visible(page, '#add-modal')));
  await page.click('#quick-chips [data-quick]'); await page.waitForTimeout(300);
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
