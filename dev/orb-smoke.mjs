// Smoke test for orb.js: serve repo root on :8123, then `node dev/orb-smoke.mjs`.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.route(THREE_URL, r => r.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL('../node_modules/three/build/three.module.js', import.meta.url)) }));
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://localhost:8123/dev/orb-smoke.html');
await page.waitForTimeout(1500);
const ok = await page.evaluate(() => window.__scene);
const shot = await page.screenshot({ path: 'dev/screens/orb-smoke.png' });
// beam('b') fired at ~0.9 s; the screenshot above is at ~1.5 s → a column above orb B is lit.
const { execFileSync: ex } = await import('node:child_process');
const beamPx = JSON.parse(ex('python3', ['-c', 'import json;from PIL import Image;im=Image.open("dev/screens/orb-smoke.png").convert("RGB");print(max(sum(im.getpixel((x,25))) for x in range(280,300)))']).toString());
const noBeamPx = JSON.parse(ex('python3', ['-c', 'import json;from PIL import Image;im=Image.open("dev/screens/orb-smoke.png").convert("RGB");print(max(sum(im.getpixel((x,25))) for x in range(100,120)))']).toString());
console.log('beam column', beamPx, 'no-beam column', noBeamPx);
// center pixel of each slot (from the screenshot) must differ from background #070b18
const centers = [[110, 130], [290, 130], [470, 130]];
const { execFileSync } = await import('node:child_process');
const px = JSON.parse(execFileSync('python3', ['-c',
  'import sys,json;from PIL import Image;im=Image.open("dev/screens/orb-smoke.png").convert("RGB");print(json.dumps([im.getpixel(tuple(c)) for c in json.loads(sys.argv[1])]))',
  JSON.stringify(centers)]).toString());
const lit = px.map(([r, g, b]) => r + g + b > 60);
// rune ring: B (0 runes lit) and C (11 lit) are otherwise identical; C's ring band must be brighter.
const band = cx => JSON.parse(execFileSync('python3', ['-c',
  `import json;from PIL import Image;im=Image.open("dev/screens/orb-smoke.png").convert("RGB");print(sum(sum(im.getpixel((x,y))) for x in list(range(${cx}-72,${cx}-50))+list(range(${cx}+50,${cx}+72)) for y in range(110,150)))`]).toString());
const ring = { b: band(290), c: band(470) };
lit.push(ring.c > ring.b * 1.15); // was ~1.01 before the ring existed
console.log('ring brightness', ring);
console.log(JSON.stringify({ scene: ok, errors, px, lit }));
// Tilt toward a pointer below orb C (11 runes lit): nothing may touch the slot's bottom edge.
await page.mouse.move(470, 395);
await page.waitForTimeout(2500);
await page.screenshot({ path: 'dev/screens/orb-tilt.png' });
const edge = JSON.parse(ex('python3', ['-c', 'import json;from PIL import Image;im=Image.open("dev/screens/orb-tilt.png").convert("RGB");print(max(sum(im.getpixel((x,y))) for x in range(400,540) for y in (198,199)))']).toString());
console.log('slot bottom edge brightness', edge);
lit.push(edge < 200);
await browser.close();
const pass = beamPx > 300 && noBeamPx < 300 && ok === true && errors.length === 0 && lit.every(Boolean);
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
