// Test-only: drives index.html through its own UI with sample data and takes screenshots.
// Usage: serve the repo root (python3 -m http.server 8123) then: node dev/preview.mjs
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8123/index.html';
const browser = await chromium.launch();
const errors = [];
for (const [label, width, height] of [['mobile', 390, 844], ['desktop', 1280, 800]]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(`${label}/${scheme}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${label}/${scheme}: ${e.message}`));
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
    await shot('3-cards');
    await page.click('article[data-id=c2] button.primary');
    await page.fill('#energy-c2', '12x'); await page.press('#energy-c2', 'Enter');
    await shot('4-edit-error');
    await page.click('article[data-id=c1] button:not(.primary)');
    await shot('5-confirm');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(label, scheme, 'horizontal overflow:', overflow);
    await ctx.close();
  }
}
await browser.close();
console.log('console/page errors:', errors.length ? errors : 'none');
