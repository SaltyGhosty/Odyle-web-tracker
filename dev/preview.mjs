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
  // The first visit opens the profile modal; this script is about the energy UI, so close it as soon as it shows.
  setInterval(() => { const m = document.getElementById('profile-modal'); if (m && !m.hidden) m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }, 100);
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
// SHOT_NOGL=1 launches without WebGL, so the screenshots show the SVG fallback orb.
const browser = await chromium.launch({ args: process.env.SHOT_NOGL ? ['--disable-webgl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
          s1: { name: 'Semilla', classId: 'gladiador', account: 'normal', energy: 380, recordedAt: now - 1000, order: 1 },
          s2: { name: 'Casi', classId: 'clerigo', account: 'premium', energy: 825, recordedAt: now - 1000, order: 2 },
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
    // Current UI: «+ Añadir» opens a modal, presets have their own modal, «Ajustar recarga» lives in Ajustes, extra/remove in the row's ⋯ menu.
    const modalOpen = () => page.evaluate(() => !!document.querySelector('dialog[open], .modal:not([hidden])'));
    const openAdd = async () => { await page.click('#add-btn'); await page.waitForSelector('#add-name', { state: 'visible' }); await page.waitForTimeout(100); };
    const closeModal = async () => { if (await modalOpen()) await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
    const addChar = async (n) => { await openAdd(); await page.fill('#add-name', n); await page.click('#add-form button[type=submit]'); await page.waitForTimeout(300); await closeModal(); };
    const goTab = (t) => page.evaluate((x) => document.querySelector(`[data-tab="${x}"]`)?.click(), t);
    const rowMenu = async (id, cls) => { await page.click(`article[data-id=${id}] button.more-actions`); await page.click(`article[data-id=${id}] .menu button.${cls}`); await page.waitForTimeout(150); };
    const edit = async (id) => { await page.click(`[data-id=${id}] button.more-actions`); await page.click(`[data-id=${id}] .menu button.update`); };
    const shot = n => page.screenshot({ path: `dev/screens/${label}-${scheme}-${n}.png`, fullPage: true });
    await shot('1-empty');
    if (label === 'desktop' && scheme === 'dark') {
      await page.waitForTimeout(500);
      check('add form is not on the main page', !(await page.locator('#add-form').isVisible()));
      await page.click('#add-btn');
      check('add opens with focus in the name field', await page.locator('#add-name').isVisible() && await page.evaluate(() => document.activeElement?.id === 'add-name'));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      check('Esc closes the add form and focus returns to + Añadir', !(await page.locator('#add-name').isVisible()) && await page.evaluate(() => document.activeElement?.id === 'add-btn'));
      await addChar('Sin horario');
      check('no schedule: refill clock shows a dash', (await page.evaluate(() => document.querySelector('#clocks [data-clock="refill"] .v')?.textContent ?? '')) === '—');
      await page.click('article.card button.more-actions'); await page.click('article.card .menu button.remove'); await page.click('article.card button.danger');
      await page.goto(BASE); await page.waitForTimeout(600);
    }
    // validation errors
    await openAdd();
    await page.click('#add-form button[type=submit]');
    await shot('2-name-error');
    await closeModal();
    for (const n of ['Personaje 1', 'Personaje 2', 'Personaje 3']) await addChar(n);
    await goTab('ajustes');
    await page.fill('#adjust-minutes', '102');
    await page.click('#adjust-form button[type=submit]');
    await page.waitForTimeout(200);
    await goTab('personajes');
    const vals = { c1: '612', c2: '345', c3: '840' };
    for (const id of ['c1', 'c2', 'c3']) {
      // «Actualizar» lives in the ⋯ menu (cards and stage alike)
      await page.click(`[data-id=${id}] button.more-actions`);
      await page.click(`[data-id=${id}] .menu button.update`);
      await page.fill(`#energy-${id}`, vals[id]);
      await page.press(`#energy-${id}`, 'Enter');
    }
    await page.waitForTimeout(900);
    await shot('3-cards');
    // The per-card rune timer became the top-bar refill clock; the full character leads the stage.
    const refill = await page.evaluate(() => document.querySelector('#clocks [data-clock="refill"] .v')?.textContent ?? '');
    check(`${label}/${scheme} refill clock text`, /^\d\d:\d\d:\d\d$/.test(refill) && /pierde \d+ OD cada 3 h/.test(await page.locator('#stage').innerText()));
    // Was "orbs are drawn SVG (no 3D canvas)". Now: still no full-page canvas (no particles behind the page), and every slot
    // has its orb: the 3D canvas over the (hidden) SVG when WebGL works, the SVG alone otherwise.
    const orbs = await page.evaluate(() => ({
      gl: !!document.createElement('canvas').getContext('webgl'),
      // no canvas bigger than its own orb slot (the stage slot is 250 px, a card's 108 px)
      big: [...document.querySelectorAll('canvas:not(#sky)')].filter((c) => { const r = c.getBoundingClientRect(), s = c.closest('.orb-slot')?.getBoundingClientRect(); return !s || r.width > s.width + 1 || r.height > s.height + 1; }).length,
      slots: [...document.querySelectorAll('.orb-slot')].map((s) => ({ svg: !!s.querySelector('.star-orb'), c3d: !!s.querySelector('canvas.orb3d'), has3d: s.classList.contains('has-3d') })),
    }));
    check(`${label}/${scheme} no full-page canvas; each slot has its orb (${orbs.gl ? '3D' : 'SVG'})`, orbs.big === 0 && await page.locator('#scene').count() === 0 &&
      orbs.slots.length === 3 && orbs.slots.every((s) => s.svg && (orbs.gl ? s.c3d && s.has3d : !s.c3d && !s.has3d)));
    const slots = await page.locator('.orb-slot').count();
    check(`${label}/${scheme} one orb slot per card`, slots === await page.locator('article.card').count() && slots === 3);
    // a near-full and a full card get their classes
    if (label === 'mobile') {
      const orb = await page.locator('article[data-id=c2] .orb-slot').boundingBox();
      const txt = await page.locator('article[data-id=c2] .r-text').boundingBox();
      check(`mobile/${scheme} row text does not overlap the orb`, orb.x + orb.width <= txt.x + 1 || orb.y + orb.height <= txt.y + 1 || txt.x + txt.width <= orb.x + 1);
    }
    check(`${label}/${scheme} full card marked`, await page.locator('article[data-id=c3].full').count() === 1);
    if (scheme === 'dark') {
      // after scrolling, the SVG orb is still inside its slot and has the 56 runes
      await page.evaluate(() => { document.querySelector('article[data-id=c3] .orb-slot').scrollIntoView({ block: 'center' }); window.scrollBy(0, 60); });
      await page.waitForTimeout(400);
      const slot = await page.locator('article[data-id=c3] .orb-slot').boundingBox();
      const svg = await page.evaluate(() => document.querySelector('article[data-id=c3] .orb-slot .star-orb').getBoundingClientRect().toJSON());
      const c3d = await page.locator('article[data-id=c3] .orb-slot canvas.orb3d').boundingBox();
      const inSlot = (b) => b && Math.abs(b.x - slot.x) < 1 && Math.abs(b.y - slot.y) < 1 && Math.abs(b.width - slot.width) < 1;
      check(`${label} orb stays inside its slot after scroll`, inSlot(svg) && (!orbs.gl || inSlot(c3d)) && await page.locator('article[data-id=c3] .so-rune').count() === 56);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    if (label === 'desktop' && scheme === 'dark') {
      check('events: 8 rows', await page.locator('.event-row').count() === 8);
    }
    if (label === 'desktop' && scheme === 'dark') {
      const num = id => page.locator(`article[data-id=${id}] .num`).textContent();
      const events = () => page.evaluate(() => [...window.__docs.keys()].filter(k => k.startsWith('members/u_me/events/')).length);
      await page.click('#presets-btn');
      await page.fill('#preset-name', 'Mazmorra'); await page.fill('#preset-cost', '40');
      await page.click('#preset-form button[type=submit]');
      await page.waitForTimeout(200);
      await closeModal();
      const ev0 = await events(); // the earlier 'Actualizar' edits already logged 'set' events
      // c1 (612 of a Normal 560 cap) is on the stage: its spends are the quick spends
      await page.click('#quick-chips [data-quick]');
      await page.waitForTimeout(1000);
      check('spend: Mazmorra −40 → 572 and one more event', (await num('c1')) === '572' && (await events()) === ev0 + 1);
      check('spend: undo toast shown', await page.locator('#toast').isVisible());
      await page.click('#undo');
      await page.waitForTimeout(1000);
      check('undo: back to 612 and the event removed', (await num('c1')) === '612' && (await events()) === ev0);
      await rowMenu('c2', 'extra');
      await page.fill('#extra-c2', '100'); await page.press('#extra-c2', 'Enter');
      await page.waitForTimeout(1000);
      check('extra: +100 → 445', (await num('c2')) === '445');
      await edit('c1');
      await page.fill('#energy-c1', '30'); await page.press('#energy-c1', 'Enter');
      await page.waitForTimeout(800);
      await page.click('article[data-id=c1] button.spend'); // c1 (30) is back among the cards
      await page.waitForTimeout(200);
      check('spend: not enough energy is refused', (await page.locator('article[data-id=c1]').textContent()).includes('No hay energía suficiente') && (await num('c1')) === '30');
      await page.waitForTimeout(8500);
      check('undo toast disappears after 8 s', !(await page.locator('#toast').isVisible()));
    }
    await edit('c2');
    await page.fill('#energy-c2', '12x'); await page.press('#energy-c2', 'Enter');
    await shot('4-edit-error');
    await rowMenu('c1', 'remove');
    await shot('5-confirm');
    await page.click('article[data-id=c1] button.danger');
    await page.waitForTimeout(300);
    check(`${label}/${scheme} removing a card removes its orb`, await page.locator('.orb-slot').count() === 2 && await page.locator('.star-orb').count() === 2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(label, scheme, 'horizontal overflow:', overflow); check(`${label}/${scheme} no horizontal overflow`, !overflow);
    await ctx.close();
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
        s2: { name: 'Casi', classId: 'clerigo', account: 'premium', energy: 825, recordedAt: now - 1000, order: 2 },
        s3: { name: 'Lleno', classId: 'asesino', energy: 840, recordedAt: now - 1000, order: 3 } },
      schedule: { anchorMs: now + 9000 },
      // rest window around "now" (local clock) so the waste warning is deterministic
      docs: { 'members/u_me/settings/prefs': (() => { const f = ms => new Date(ms).toTimeString().slice(0, 5); return { quietStart: f(now - 3600_000), quietEnd: f(now + 5 * 3600_000) }; })() } };
  });
  await page.addInitScript(STUB);
  await page.goto(BASE);
  await page.waitForTimeout(1800);
  check('seeded: no false +N on load', await page.locator('.gain').count() === 0);
  check('summary: tip about the full character (announced; the stage shows it)', ((await page.locator('#band-status').textContent().catch(() => '')) || '').includes('Lleno está al tope') && (await page.locator('#stage h2').textContent()) === 'Lleno');
  check('forecast: 3 lines and a legend', await page.locator('#forecast path.series').count() === 3 && await page.locator('#forecast-legend li').count() === 3);
  check('summary: legion readiness line (under Hoy)', ((await page.locator('#today').textContent().catch(() => '')) || '').includes('Listos para mazmorra en la legión: 3'));
  check('waste: the full character (on the stage) says it is losing energy', (await page.locator('#stage article[data-id=s3]').textContent()).includes('pierde 30 OD cada 3 h'));
  // seeded characters have no account: Premium, +30 per recharge
  check('waste: card filling during rest hours warns', (await page.locator('article[data-id=s2]').textContent()).includes('Perderás 30 de OD'));
  check('header: every character Premium, the refill clock reads +30 OD en', (await page.locator('#clocks [data-clock="refill"] .k').textContent()) === '+30 OD en');
  await page.evaluate(() => document.querySelector('[data-tab="ajustes"]')?.click());
  check('settings: rest hours fields', await page.locator('#quiet-start').isVisible() && await page.locator('#quiet-end').isVisible());
  await page.evaluate(() => document.querySelector('[data-tab="personajes"]')?.click());
  check('seeded: class icon and name shown', await page.locator('article .cls-icon').count() === 3 && (await page.locator('article[data-id=s1] .cls-name').textContent()) === 'Gladiador');
  check('seeded: already-full character has the cap class and no ripple on load', await page.locator('article[data-id=s3] .star-orb.full').count() === 1 && await page.locator('.star-orb.ripple').count() === 0);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
  await page.waitForTimeout(8000);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  check('seeded: +30 (and +15 up to the cap) shown after returning from background', (await page.locator('.gain').allTextContents()).join() === '+30,+15');
  // a render right after the gain must not cut the ripple (the orb resumes where it was)
  await page.evaluate(() => { document.getElementById('events').open = false; });
  check('seeded: the recharged orbs ripple once', await page.locator('.star-orb.ripple').count() === 2);
  await page.waitForTimeout(1200);
  check('seeded: the ripple is cleared when it ends', await page.locator('.star-orb.ripple').count() === 0);
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
  await page.dblclick('#quick-chips [data-quick]'); // the only character is on the stage: its spends are the quick spends
  await page.waitForTimeout(1500);
  const evs = await page.evaluate(() => [...window.__docs.keys()].filter(k => k.includes('/events/')).length);
  check('double tap: one spend logged and −40 once', evs === 1 && (await page.locator('article[data-id=a] .num').textContent()) === '572');
  check('history: today\'s bar shows 40', ((await page.locator('#history .bar-label').last().textContent().catch(() => '')) || '') === '40');
  check('forecast: one line for the character', await page.locator('#forecast path.series').count() === 1);
  await ctx.close();
  ({ ctx, page } = await mk(base('{ failEvents: true }')));
  // the notice is transient (a later save clears it), so watch it instead of reading it afterwards
  await page.evaluate(() => { window.__notices = []; new MutationObserver(() => window.__notices.push(document.getElementById('notice').textContent)).observe(document.getElementById('notice'), { childList: true, characterData: true, subtree: true }); });
  await page.click('#quick-chips [data-quick]');
  await page.waitForTimeout(1000);
  const notice = (await page.evaluate(() => window.__notices)).join('|');
  check('failed event write: page stays editable and says the log failed', await page.locator('#quick-chips [data-quick]').count() === 1 && notice.includes('historial'));
  await ctx.close();
  ({ ctx, page } = await mk(base('{}')));
  await page.click('#presets-btn');
  await page.focus('#preset-del-p1').catch(() => {});
  await page.evaluate(() => window.__notify());
  await page.waitForTimeout(300);
  check('menu: focus survives a repaint', await page.evaluate(() => document.activeElement?.id === 'preset-del-p1'));
  await ctx.close();
  ({ ctx, page } = await mk(`(() => { window.__SEED = { charPath: 'members/u_me/characters', characters: {}, schedule: null, docs: { 'members/u_me': { joinedAt: 1 } } }; })()`));
  check('empty page: the stage offers to add the first character', ((await page.locator('#stage').textContent()) || '').includes('Añade tu personaje') && await page.locator('#stage button.stage-go').isVisible());
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
