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
  const docs = new Map(); const subs = new Set(); let n = 0;
  const notify = () => subs.forEach(f => f());
  const snapDoc = (path) => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path) });
  const doc = path => ({
    update: async d => { docs.set(path, { ...docs.get(path), ...d }); notify(); },
    set: async d => { docs.set(path, { ...d }); notify(); },
    delete: async () => { docs.delete(path); notify(); },
    onSnapshot(next) { const f = () => next(snapDoc(path)); subs.add(f); setTimeout(f); return () => subs.delete(f); },
  });
  const collection = name => ({
    doc: () => doc(name + '/c' + (++n)),
    add: async d => { const id = 'c' + (++n); docs.set(name + '/' + id, { ...d }); notify(); return doc(name + '/' + id); },
    onSnapshot(next) {
      const f = () => next({ docs: [...docs.keys()].filter(k => k.startsWith(name + '/')).map(snapDoc) });
      subs.add(f); setTimeout(f); return () => subs.delete(f);
    },
  });
  window.claude = { use: async name => name === 'db' ? { doc, collection } : { can: async () => true } };
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
    await page.goto(BASE);
    const shot = n => page.screenshot({ path: `dev/screens/${label}-${scheme}-${n}.png`, fullPage: true });
    await shot('1-empty');
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
    const flat = await page.evaluate(() => document.body.classList.contains('flat'));
    check(`${label}/${scheme} flat mode = ${scheme === 'reduce'}`, flat === (scheme === 'reduce'));
    const slots = await page.locator('.orb-slot').count();
    check(`${label}/${scheme} one orb slot per card`, slots === await page.locator('article.card').count() && slots === 3);
    // a near-full and a full card get their classes
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
await browser.close();
const real = errors.filter(e => !/fonts\.g|ERR_TUNNEL|ERR_CONNECTION|net::/.test(e));
console.log('console/page errors:', real.length ? real : 'none');
const pass = real.length === 0 && checks.every(([, ok]) => ok);
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
