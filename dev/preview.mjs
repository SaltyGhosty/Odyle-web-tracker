// Test-only: drives index.html through its own UI with sample data and takes screenshots.
// Usage: serve the repo root (python3 -m http.server 8123) then: node dev/preview.mjs
import { loadChromium } from './pw.mjs';
const chromium = await loadChromium();
import { readFileSync } from 'node:fs';

// In-memory stand-in for window.claude (db + user), injected before the page loads.
const STUB = () => {
  // Nested-path in-memory store: docs keyed by full path; a collection's docs are keys whose parent is it.
  const docs = new Map(); const subs = new Set(); let n = 0;
  const seed = window.__SEED;
  if (seed) {
    for (const [id, d] of Object.entries(seed.characters || {})) docs.set((seed.charPath || 'characters') + '/' + id, d);
    if (seed.schedule) docs.set('settings/schedule', seed.schedule);
    for (const [path, d] of Object.entries(seed.docs || {})) docs.set(path, d);
  }
  window.__docs = docs;
  const me = (seed && seed.me) || 'u_me';
  const notify = () => { const d = seed && seed.delay; d ? setTimeout(() => subs.forEach(f => f()), d) : subs.forEach(f => f()); };
  window.__notify = () => subs.forEach(f => f());
  const parentOf = k => k.slice(0, k.lastIndexOf('/'));
  const snapDoc = path => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path) });
  const query = name => ({ docs: [...docs.keys()].filter(k => parentOf(k) === name).map(snapDoc) });
  const doc = path => ({
    id: path.split('/').pop(), path,
    get: async () => snapDoc(path),
    update: async d => { if (!docs.has(path)) throw { code: 'invalid_argument' }; docs.set(path, { ...docs.get(path), ...d }); notify(); },
    set: async d => { if (seed && seed.failEvents && path.includes('/events/')) throw { code: 'invalid_argument' }; docs.set(path, { ...d }); notify(); },
    delete: async () => { docs.delete(path); notify(); },
    onSnapshot(next) { const f = () => next(snapDoc(path)); subs.add(f); setTimeout(f, seed ? 400 : 0); return () => subs.delete(f); },
    collection: sub => collection(path + '/' + sub),
  });
  const collection = name => ({
    path: name,
    doc: id => doc(name + '/' + (id || 'c' + (++n))),
    add: async d => { const id = 'c' + (++n); docs.set(name + '/' + id, { ...d }); notify(); return doc(name + '/' + id); },
    get: async () => query(name),
    onSnapshot(next) { const f = () => next(query(name)); subs.add(f); setTimeout(f); return () => subs.delete(f); },
  });
  const canWrite = !(seed && seed.readOnly);
  const names = (seed && seed.names) || {};
  window.claude = { use: async name => name === 'db' ? { doc, collection } : {
    can: async () => canWrite, isOwner: async () => !(seed && seed.notOwner), id: async () => me,
    profiles: async ids => Object.fromEntries(ids.map(i => [i, { id: i, name: names[i] || '' }])),
  } };
};
const BASE = process.env.BASE || 'http://localhost:8123/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks = [];
const check = (name, ok) => { checks.push([name, ok]); if (!ok) console.log('CHECK FAILED:', name); };
const errors = [];
// Theme screenshots: THEME_SHOTS=1 node dev/preview.mjs → dev/screens/tema-{elyos,asmodian}-{desktop,mobile}.png
if (process.env.THEME_SHOTS) {
  for (const theme of ['elyos', 'asmodian']) {
    for (const [label, width, height] of (process.env.SHOT_SIZES ? JSON.parse(process.env.SHOT_SIZES) : [['desktop', 1280, 900], ['mobile', 390, 844]])) {
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme === 'asmodian' ? 'dark' : 'light' });
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(`theme ${theme}/${label}: ${e.message}`));
      await page.addInitScript(t => { try { localStorage.setItem('odyle-theme', t); } catch {} }, theme);
      if (process.env.SHOT_TAB) await page.addInitScript(t => { try { localStorage.setItem('odyle-tab', t); } catch {} }, process.env.SHOT_TAB);
      await page.addInitScript(() => {
        const now = Date.now();
        window.__SEED = { characters: {
          s1: { name: 'Semilla', classId: 'gladiador', energy: 380, recordedAt: now - 1000, order: 1 },
          s2: { name: 'Casi', classId: 'clerigo', energy: 825, recordedAt: now - 1000, order: 2 },
          s3: { name: 'Lleno', classId: 'asesino', energy: 840, recordedAt: now - 1000, order: 3 } },
          schedule: { anchorMs: now + 9000 } };
      });
      await page.addInitScript(STUB);
      await page.goto(BASE);
      await page.waitForTimeout(2500); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await page.screenshot({ path: `dev/screens/${process.env.SHOT_PREFIX || 'tema'}-${theme}-${label}.png` });
      await ctx.close();
    }
  }
  await browser.close();
  console.log('theme errors:', errors.length ? errors : 'none');
  process.exit(0);
}
for (const [label, width, height] of [['mobile', 390, 844], ['desktop', 1280, 800]]) {
  for (const scheme of ['dark', 'reduce']) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', reducedMotion: scheme === 'reduce' ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(`${label}/${scheme}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${label}/${scheme}: ${e.message}`));
    if (!process.env.NO_STUB) await page.addInitScript(STUB);
    await page.goto(BASE);
    const openMenu = async () => { if (!(await page.locator('#drawer').isVisible())) await page.click('#menu-btn'); await page.waitForTimeout(100); };
    const closeMenu = async () => { if (await page.locator('#drawer').isVisible()) await page.keyboard.press('Escape'); await page.waitForTimeout(100); };
    if (scheme === 'dark' && label === 'mobile') {
      await page.evaluate(() => { window.__alive = true; });
      await page.waitForSelector('#menu-btn:not([hidden])');
      await openMenu();
      await page.waitForSelector('#add-form:not([hidden])');
      await page.fill('#add-name', 'Temprano'); await page.click('#add-form button[type=submit]');
      await page.waitForTimeout(300);
      check('add form works before Three.js loads', await page.evaluate(() => window.__alive === true) && await page.locator('article.card').count() === 1);
      await closeMenu();
      await page.waitForTimeout(2600);
      await page.goto(BASE); await page.waitForTimeout(2800); // fresh stub state for the rest of the run
    }
    const shot = n => page.screenshot({ path: `dev/screens/${label}-${scheme}-${n}.png`, fullPage: true });
    await shot('1-empty');
    if (label === 'desktop' && scheme === 'dark') {
      await page.waitForTimeout(500);
      check('add form is not on the main page', !(await page.locator('#add-form').isVisible()));
      await page.click('#menu-btn');
      check('menu opens with focus in the name field', await page.locator('#drawer').isVisible() && await page.evaluate(() => document.activeElement?.id === 'add-name'));
      await page.keyboard.press('Escape');
      check('Esc closes the menu and focus returns to ☰', !(await page.locator('#drawer').isVisible()) && await page.evaluate(() => document.activeElement?.id === 'menu-btn'));
      await openMenu();
      await page.fill('#add-name', 'Sin horario'); await page.click('#add-form button[type=submit]');
      await page.waitForTimeout(200);
      await closeMenu();
      check('no schedule: rune timer says so', (await page.evaluate(() => document.querySelector('article.card .tick-left')?.textContent ?? '')) === 'Falta la hora de recarga');
      await page.click('article.card button.remove'); await page.click('article.card button.danger');
      await page.goto(BASE); await page.waitForTimeout(600);
    }
    // validation errors
    await openMenu();
    await page.click('#add-form button[type=submit]');
    await shot('2-name-error');
    for (const n of ['Personaje 1', 'Personaje 2', 'Personaje 3']) {
      await page.fill('#add-name', n); await page.click('#add-form button[type=submit]');
    }
    await page.fill('#adjust-minutes', '102');
    await page.click('#adjust-form button[type=submit]');
    await closeMenu();
    const vals = { c1: '612', c2: '345', c3: '840' };
    for (const id of ['c1', 'c2', 'c3']) {
      await page.click(`article[data-id=${id}] button.primary`);
      await page.fill(`#energy-${id}`, vals[id]);
      await page.press(`#energy-${id}`, 'Enter');
    }
    await page.waitForTimeout(900);
    await shot('3-cards');
    const tl = id => page.evaluate(i => document.querySelector(`article[data-id=${i}] .tick-left`)?.textContent ?? '', id);
    check(`${label}/${scheme} rune timer text`, /^\+15 en \d\d:\d\d:\d\d$/.test(await tl('c1')) && (await tl('c3')) === 'Lleno');
    const slots = await page.locator('.orb-slot').count();
    check(`${label}/${scheme} one orb slot per card`, slots === await page.locator('article.card').count() && slots === 3);
    // a near-full and a full card get their classes
    if (label === 'mobile') {
      const orb = await page.locator('article[data-id=c2] .orb-slot').boundingBox();
      const pan = await page.locator('article[data-id=c2] .panel').boundingBox();
      check(`mobile/${scheme} panel does not cover the orb`, orb.y + orb.height <= pan.y + 1);
    }
    check(`${label}/${scheme} full card marked`, await page.locator('article[data-id=c3].full').count() === 1);
  }
}
// Seeded data: stored 7 h ago, schedule snapshot arrives after characters.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`seeded: ${e.message}`));
  await page.addInitScript(() => {
    const now = Date.now();
    window.__SEED = { characters: {
        s1: { name: 'Semilla', classId: 'gladiador', energy: 100, recordedAt: now - 7 * 3600_000, order: 1 },
        s2: { name: 'Casi', classId: 'clerigo', energy: 825, recordedAt: now - 1000, order: 2 },
        s3: { name: 'Lleno', classId: 'asesino', energy: 840, recordedAt: now - 1000, order: 3 } },
      schedule: { anchorMs: now + 9000 },
      // rest window around "now" (local clock) so the waste warning is deterministic
      docs: { 'members/u_me/settings/prefs': (() => { const f = ms => new Date(ms).toTimeString().slice(0, 5); return { quietStart: f(now - 3600_000), quietEnd: f(now + 5 * 3600_000) }; })() } };
  });
  await page.addInitScript(STUB);
  await page.goto(BASE);
  await page.waitForTimeout(1800);
  check('seeded: no false +N on load', await page.locator('.gain').count() === 0);
  check('summary: tip about the full character', ((await page.locator('#summary').textContent().catch(() => '')) || '').includes('Lleno está lleno'));
  check('forecast: 3 lines and a legend', await page.locator('#forecast path.series').count() === 3 && await page.locator('#forecast-legend li').count() === 3);
  check('summary: total energy', ((await page.locator('#summary').textContent().catch(() => '')) || '').includes('1795'));
  check('waste: full card says it is losing energy', (await page.locator('article[data-id=s3]').textContent()).includes('Estás perdiendo 15 de OD cada 3 h'));
  check('waste: card filling during rest hours warns', (await page.locator('article[data-id=s2]').textContent()).includes('Perderás 15 de OD'));
  await page.click('#menu-btn');
  check('drawer: rest hours fields', await page.locator('#quiet-start').isVisible() && await page.locator('#quiet-end').isVisible());
  await page.keyboard.press('Escape');
  check('seeded: class icon and name shown', await page.locator('.cls-icon').count() === 3 && (await page.locator('article[data-id=s1] .cls-name').textContent()) === 'Gladiador');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
  await page.waitForTimeout(8000);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  check('seeded: +15 shown after returning from background', (await page.locator('.gain').allTextContents()).join() === '+15,+15');
  check('seeded: the recharged orbs ripple once', await page.locator('.star-orb.ripple').count() === 2);
  await page.screenshot({ path: 'dev/screens/seeded.png' });
  await ctx.close();
}
// Event timers with the browser clock fixed at 18:05 UTC: Shugo is running.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(Date.UTC(2026, 9, 10, 18, 5)));
  page.on('pageerror', e => errors.push(`events: ${e.message}`));
  await page.addInitScript(STUB);
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  const shugo = await page.locator('.event-row[data-event=shugo]').textContent().catch(() => '');
  check('events: Shugo shows "En curso" at 18:05 UTC', shugo.includes('En curso'));
  const daily = await page.locator('.event-row[data-event=daily]').textContent().catch(() => '');
  check('events: daily reset counts down', daily.includes('Empieza en'));
  await ctx.close();
}
// Phase A fixes: double tap, failed event write, menu focus across repaints, empty-page hint.
{
  const mk = async (seedFn) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`fixesA: ${e.message}`));
    await page.addInitScript(seedFn);
    await page.addInitScript(STUB);
    await page.goto(BASE);
    await page.waitForTimeout(1500);
    return { ctx, page };
  };
  const base = (extra) => `(() => { const now = Date.now(); window.__SEED = Object.assign({ charPath: 'members/u_me/characters',
    characters: { a: { name: 'Uno', classId: 'asesino', energy: 612, recordedAt: now, order: 1 } }, schedule: { anchorMs: now + 3600000 },
    docs: { 'members/u_me': { joinedAt: 1 }, 'members/u_me/settings/presets': { items: [{ id: 'p1', name: 'Mazmorra', cost: 40 }] } } }, ${extra}); })()`;
  let { ctx, page } = await mk(base('{ delay: 300 }'));
  await page.dblclick('article[data-id=a] button.spend');
  await page.waitForTimeout(1500);
  const evs = await page.evaluate(() => [...window.__docs.keys()].filter(k => k.includes('/events/')).length);
  check('double tap: one spend logged and −40 once', evs === 1 && (await page.locator('article[data-id=a] .num').textContent()) === '572');
  check('history: today\'s bar shows 40', ((await page.locator('#history .bar-label').last().textContent().catch(() => '')) || '') === '40');
  check('forecast: one line for the character', await page.locator('#forecast path.series').count() === 1);
  await ctx.close();
  ({ ctx, page } = await mk(base('{ failEvents: true }')));
  await page.click('article[data-id=a] button.spend');
  await page.waitForTimeout(1000);
  const notice = (await page.locator('#notice').textContent()) || '';
  check('failed event write: page stays editable and says the log failed', await page.locator('article[data-id=a] button.spend').count() === 1 && notice.includes('historial'));
  await ctx.close();
  ({ ctx, page } = await mk(base('{}')));
  await page.click('#menu-btn');
  await page.focus('#preset-del-p1').catch(() => {});
  await page.evaluate(() => window.__notify());
  await page.waitForTimeout(300);
  check('menu: focus survives a repaint', await page.evaluate(() => document.activeElement?.id === 'preset-del-p1'));
  await ctx.close();
  ({ ctx, page } = await mk(`(() => { window.__SEED = { charPath: 'members/u_me/characters', characters: {}, schedule: null, docs: { 'members/u_me': { joinedAt: 1 } } }; })()`));
  check('empty page points to the ☰ menu', ((await page.locator('#empty').textContent()) || '').includes('☰'));
  await ctx.close();
}
// Migration: old shared 'characters' move into members/u_me/characters, once, intact.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`migration: ${e.message}`));
  await page.addInitScript(() => {
    window.__SEED = { characters: {
      a: { name: 'SaltyGhosty', classId: 'asesino', energy: 240, recordedAt: 1791650525520, order: 1 },
      b: { name: 'PraiseTheSun', classId: 'clerigo', energy: 105, recordedAt: 1791650497208, order: 2 },
      c: { name: 'Shutaruku', classId: 'gladiador', energy: 195, recordedAt: 1791650300768, order: 3 } },
      schedule: { anchorMs: 1791649842425 } };
  });
  await page.addInitScript(STUB);
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => Object.fromEntries([...window.__docs].filter(([k]) => /characters/.test(k))));
  check('migration: moved into members/u_me/characters intact',
    st['members/u_me/characters/a']?.name === 'SaltyGhosty' && st['members/u_me/characters/a']?.recordedAt === 1791650525520 &&
    st['members/u_me/characters/b']?.classId === 'clerigo' && st['members/u_me/characters/c']?.energy === 195);
  check('migration: old collection emptied', !Object.keys(st).some(k => k.startsWith('characters/')));
  check('migration: 3 cards still shown', await page.locator('article.card').count() === 3);
  check('migration: member doc written', await page.evaluate(() => window.__docs.has('members/u_me')));
  await ctx.close();
}
await browser.close();
const real = errors.filter(e => !/fonts\.g|ERR_TUNNEL|ERR_CONNECTION|net::/.test(e));
console.log('console/page errors:', real.length ? real : 'none');
const pass = real.length === 0 && checks.every(([, ok]) => ok);
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
