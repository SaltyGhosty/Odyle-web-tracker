// Compila la página para la web: server/public/ (artefacto de compilación, fuera de git).
// Uso: npm run build:web   (desde la raíz del repositorio)
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'server/public');
const fail = (msg) => { console.error(`build-web: ${msg}`); process.exit(1); };
const need = (p) => { if (!existsSync(p)) fail(`falta ${path.relative(ROOT, p)}`); return p; };
const read = (p) => readFileSync(need(p), 'utf8');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
mkdirSync(path.join(OUT, 'fonts'), { recursive: true });

// ---- módulos del repositorio (sin pruebas) ----
const modules = readdirSync(ROOT).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
const EXPECTED = ['i18n.js', 'i18n-strings.js', 'view.js', 'energy.js', 'classes.js', 'store.js', 'spend.js', 'events.js', 'planner.js',
  'charts.js', 'sound.js', 'tasks.js', 'achievements.js', 'motion.js', 'orb.js', 'legion.js'];
for (const m of EXPECTED) if (!modules.includes(m)) fail(`falta el módulo ${m}`);
for (const m of modules) {
  let src = read(path.join(ROOT, m));
  if (m === 'orb.js') {
    const CDN = "'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'";
    if (!src.includes(CDN)) fail('orb.js no importa Three.js desde el CDN esperado');
    src = src.replace(CDN, "'./vendor/three.module.js'");
  }
  writeFileSync(path.join(OUT, m), src);
}

// ---- Three.js vendorizado ----
copyFileSync(need(path.join(ROOT, 'node_modules/three/build/three.module.js')), path.join(OUT, 'vendor/three.module.js'));

// ---- index.html: sin <style> ni <script> en línea ----
const html = read(path.join(ROOT, 'index.html'));
const style = html.match(/<style>([\s\S]*?)<\/style>/);
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!style) fail('index.html no tiene <style>');
if (!script) fail('index.html no tiene <script type="module"> en línea');
let page = html
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '')
  .replace(style[0], '<link rel="stylesheet" href="fonts.css"><link rel="stylesheet" href="app.css">')
  .replace(script[0], () => '<script src="claude-shim.js"></script><script src="legion-api.js"></script><script type="module" src="app.js"></script>');
if (/<style[\s>]/i.test(page) || /fonts\.g/.test(page)) fail('index.html conserva estilos en línea o Google Fonts');
if ([...page.matchAll(/<script\b[^>]*>/gi)].some((m) => !/\ssrc="/.test(m[0]))) fail('index.html conserva un <script> en línea');
writeFileSync(path.join(OUT, 'index.html'), page);
writeFileSync(path.join(OUT, 'app.css'), style[1].replace(/^\n/, ''));
writeFileSync(path.join(OUT, 'app.js'), script[1].replace(/^\n/, ''));

// ---- páginas y adaptadores ----
for (const f of ['claude-shim.js', 'legion-api.js', 'auth.html', 'auth.js', 'auth.css']) {
  copyFileSync(need(path.join(ROOT, 'web', f)), path.join(OUT, f));
}

// ---- fuentes propias (@fontsource): latin + latin-ext ----
const FONTS = [
  ['cinzel', 'Cinzel', [600, 700]],
  ['figtree', 'Figtree', [400, 500, 600]],
];
let fontsCss = '';
for (const [pkg, family, weights] of FONTS) {
  const base = path.join(ROOT, 'node_modules/@fontsource', pkg);
  for (const w of weights) {
    const css = read(path.join(base, `${w}.css`));
    for (const subset of ['latin-ext', 'latin']) {
      const name = `${pkg}-${subset}-${w}-normal`;
      const block = css.match(new RegExp(`/\\* ${name} \\*/\\s*@font-face\\s*\\{([\\s\\S]*?)\\}`));
      if (!block) fail(`${pkg}/${w}.css no tiene el bloque ${name}`);
      const range = block[1].match(/unicode-range:\s*([^;]+);/);
      if (!range) fail(`${name} sin unicode-range`);
      copyFileSync(need(path.join(base, 'files', `${name}.woff2`)), path.join(OUT, 'fonts', `${name}.woff2`));
      fontsCss += `@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-display: swap;\n  font-weight: ${w};\n  src: url(fonts/${name}.woff2) format('woff2');\n  unicode-range: ${range[1]};\n}\n`;
    }
  }
}
writeFileSync(path.join(OUT, 'fonts.css'), fontsCss);
console.log(`build-web: ${path.relative(ROOT, OUT)} listo (${modules.length} módulos)`);
