// Test-only: drives index.html through its own UI with sample data and takes screenshots.
// Usage: serve the repo root (python3 -m http.server 8123) then: node dev/preview.mjs
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
import { readFileSync } from 'node:fs';
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const THREE_SRC = readFileSync(new URL('../node_modules/three/build/three.module.js', import.meta.url));

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
  const notify = () => subs.forEach(f => f());
  const parentOf = k => k.slice(0, k.lastIndexOf('/'));
  const snapDoc = path => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path) });
  const query = name => ({ docs: [...docs.keys()].filter(k => parentOf(k) === name).map(snapDoc) });
  const doc = path => ({
    id: path.split('/').pop(), path,
    get: async () => snapDoc(path),
    update: async d => { if (!docs.has(path)) throw { code: 'invalid_argument' }; docs.set(path, { ...docs.get(path), ...d }); notify(); },
    set: async d => { docs.set(path, { ...d }); notify(); },
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
for (const [label, width, height] of [['mobile', 390, 844], ['desktop', 1280, 800]]) {
  for (const scheme of ['dark', 'reduce']) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', reducedMotion: scheme === 'reduce' ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    await page.route(THREE_URL, r => r.fulfill({ contentType: 'text/javascript', body: THREE_SRC }));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${label}/${scheme}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${label}/${scheme}: ${e.message}`));
    if (!process.env.NO_STUB) await page.addInitScript(STUB);
    if (scheme === 'dark' && label === 'mobile') {
      // Three.js arrives late: the add form must already work (no page reload).
      await page.unroute(THREE_URL);
      await page.route(THREE_URL, async r => { await new Promise(res => setTimeout(res, 2500)); r.fulfill({ contentType: 'text/javascript', body: THREE_SRC }); });
    }
    await page.goto(BASE);
    if (scheme === 'dark' && label === 'mobile') {
      await page.evaluate(() => { window.__alive = true; });
      await page.waitForSelector('#add-form:not([hidden])');
      await page.fill('#add-name', 'Temprano'); await page.click('#add-form button[type=submit]');
      await page.waitForTimeout(300);
      check('add form works before Three.js loads', await page.evaluate(() => window.__alive === true) && await page.locator('article.card').count() === 1);
      await page.waitForTimeout(2600);
      await page.goto(BASE); await page.waitForTimeout(2800); // fresh stub state for the rest of the run
    }
    const shot = n => page.screenshot({ path: `dev/screens/${label}-${scheme}-${n}.png`, fullPage: true });
    await shot('1-empty');
    if (label === 'desktop' && scheme === 'dark') {
      await page.fill('#add-name', 'Sin horario'); await page.click('#add-form button[type=submit]');
      await page.waitForTimeout(200);
      check('no schedule: rune timer says so', (await page.evaluate(() => document.querySelector('article.card .tick-left')?.textContent ?? '')) === 'Falta la hora de recarga');
      await page.click('article.card button:not(.primary)'); await page.click('article.card button.danger');
      await page.goto(BASE); await page.waitForTimeout(600);
    }
    // validation errors
    await page.click('#add-form button[type=submit]');
    await shot('2-name-error');
    for (const n of ['Personaje 1', 'Personaje 2', 'Personaje 3']) {
      await page.fill('#add-name', n); await page.click('#add-form button[type=submit]');
    }
    await page.click('#adjust-toggle'); await page.fill('#adjust-minutes', '102');
    await page.click('#adjust-form button[type=submit]');
    const vals = { c1: '612', c2: '345', c3: '840' };
    for (const id of ['c1', 'c2', 'c3']) {
      await page.click(`article[data-id=${id}] button.primary`);
      await page.fill(`#energy-${id}`, vals[id]);
      await page.press(`#energy-${id}`, 'Enter');
    }
    await page.selectOption('#add-class', 'asesino').catch(() => {});
    await page.waitForTimeout(900);
    await shot('3-cards');
    const tl = id => page.evaluate(i => document.querySelector(`article[data-id=${i}] .tick-left`)?.textContent ?? '', id);
    check(`${label}/${scheme} rune timer text`, /^\+15 en \d\d:\d\d:\d\d$/.test(await tl('c1')) && (await tl('c3')) === 'Lleno');
    const flat = await page.evaluate(() => document.body.classList.contains('flat'));
    check(`${label}/${scheme} flat mode = ${scheme === 'reduce'}`, flat === (scheme === 'reduce'));
    const slots = await page.locator('.orb-slot').count();
    check(`${label}/${scheme} one orb slot per card`, slots === await page.locator('article.card').count() && slots === 3);
    // a near-full and a full card get their classes
    if (label === 'mobile') {
      const orb = await page.locator('article[data-id=c2] .orb-slot').boundingBox();
      const pan = await page.locator('article[data-id=c2] .panel').boundingBox();
      check(`mobile/${scheme} panel does not cover the orb`, orb.y + orb.height <= pan.y + 1);
    }
    check(`${label}/${scheme} full card marked`, await page.locator('article[data-id=c3].full').count() === 1);
    if (scheme === 'dark') {
      // after scrolling, the orb is still drawn inside its slot
      await page.evaluate(() => { document.querySelector('article[data-id=c3] .orb-slot').scrollIntoView({ block: 'center' }); window.scrollBy(0, 60); });
      await page.waitForTimeout(400);
      const box = await page.locator('article[data-id=c3] .orb-slot').boundingBox();
      const buf = await page.screenshot();
      const { execFileSync } = await import('node:child_process');
      const fs = await import('node:fs'); fs.writeFileSync('dev/screens/_tmp.png', buf);
      const [r, g, b] = JSON.parse(execFileSync('python3', ['-c', `import json;from PIL import Image;im=Image.open('dev/screens/_tmp.png').convert('RGB');print(json.dumps(im.getpixel((${Math.round(box.x + box.width / 2)},${Math.round(box.y + box.height / 2)}))))`]).toString());
      check(`${label} orb follows its slot after scroll`, r + g + b > 300);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.click('article[data-id=c2] button.primary');
    await page.fill('#energy-c2', '12x'); await page.press('#energy-c2', 'Enter');
    await shot('4-edit-error');
    await page.click('article[data-id=c1] button:not(.primary)');
    await shot('5-confirm');
    await page.click('article[data-id=c1] button.danger');
    await page.waitForTimeout(300);
    check(`${label}/${scheme} removing a card removes its orb`, await page.locator('.orb-slot').count() === 2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(label, scheme, 'horizontal overflow:', overflow); check(`${label}/${scheme} no horizontal overflow`, !overflow);
    await ctx.close();
  }
}
// Seeded data: stored 7 h ago, schedule snapshot arrives after characters.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.route(THREE_URL, r => r.fulfill({ contentType: 'text/javascript', body: THREE_SRC }));
  page.on('pageerror', e => errors.push(`seeded: ${e.message}`));
  await page.addInitScript(() => {
    const now = Date.now();
    window.__SEED = { characters: {
        s1: { name: 'Semilla', classId: 'gladiador', energy: 100, recordedAt: now - 7 * 3600_000, order: 1 },
        s2: { name: 'Casi', classId: 'clerigo', energy: 825, recordedAt: now - 1000, order: 2 },
        s3: { name: 'Lleno', classId: 'asesino', energy: 840, recordedAt: now - 1000, order: 3 } },
      schedule: { anchorMs: now + 4000 } };
  });
  await page.addInitScript(STUB);
  await page.goto(BASE);
  await page.waitForTimeout(1800);
  check('seeded: no false +N on load', await page.locator('.gain').count() === 0);
  check('seeded: class icon and name shown', await page.locator('.cls-icon').count() === 3 && (await page.locator('article[data-id=s1] .cls-name').textContent()) === 'Gladiador');
  const above = async id => {
    const box = await page.locator(`article[data-id=${id}] .orb-slot`).boundingBox();
    const buf = await page.screenshot();
    const fs = await import('node:fs'); fs.writeFileSync('dev/screens/_tmp.png', buf);
    const { execFileSync } = await import('node:child_process');
    const x = Math.round(box.x + box.width / 2), y = Math.max(2, Math.round(box.y - 30));
    return JSON.parse(execFileSync('python3', ['-c', `import json;from PIL import Image;im=Image.open('dev/screens/_tmp.png').convert('RGB');print(max(sum(im.getpixel((xx,${y}))) for xx in range(${x}-6,${x}+6)))`]).toString());
  };
  check('seeded: already-full character gets no beam on load', (await above('s3')) < 300);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  check('seeded: +15 shown after returning from background', (await page.locator('.gain').allTextContents()).join() === '+15,+15');
  await page.waitForTimeout(1700); // let the floating "+15" fade; the beam lasts ~3 s
  check('seeded: beam when a character reaches 840', (await above('s2')) > 300);
  await page.screenshot({ path: 'dev/screens/seeded.png' });
  await ctx.close();
}
// iOS-style permission denied: the motion button must not stay as a dead control.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.route(THREE_URL, r => r.fulfill({ contentType: 'text/javascript', body: THREE_SRC }));
  page.on('pageerror', e => errors.push(`ios: ${e.message}`));
  await page.addInitScript(() => { window.DeviceOrientationEvent = window.DeviceOrientationEvent || function () {}; window.DeviceOrientationEvent.requestPermission = async () => 'denied'; });
  await page.addInitScript(STUB);
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  const btn = page.locator('#motion-btn');
  check('ios: motion button offered', await btn.isVisible());
  if (await btn.isVisible()) await btn.tap();
  await page.waitForTimeout(300);
  check('ios: denied → button disabled and says so', await btn.isDisabled() && (await btn.textContent()) === 'Movimiento no disponible');
  await ctx.close();
}
// Migration: old shared 'characters' move into members/u_me/characters, once, intact.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.route(THREE_URL, r => r.fulfill({ contentType: 'text/javascript', body: THREE_SRC }));
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
