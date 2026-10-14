// Ataque: XSS por DOM — sumideros de HTML/código o datos de usuario en href/src/style/on* en el JS construido (SR-2).
// La comprobación con Trusted Types activos en un navegador real está en dev/e2e-web.mjs ("ATAQUE: ...").
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { stablePublicDir, removeDir } from './_lib.js';

const pub = stablePublicDir();
after(() => removeDir(pub));
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = () => walk(pub).filter((f) => /\.(js|html)$/.test(f));
// Quita comentarios para no confundir prosa con código.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

test('ningún archivo servido contiene sumideros de HTML o de código', () => {
  const SINKS = [/\.innerHTML\s*[=+]/, /\.outerHTML\s*[=+]/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /\bnew\s+Function\s*\(/,
    /\bFunction\s*\(\s*['"`]/, /set(Timeout|Interval)\(\s*['"`]/, /set(Timeout|Interval)\(\s*[a-zA-Z_$][\w$]*\s*[,)]/,
    /createContextualFragment/, /\bsrcdoc\b/, /DOMParser/, /\.setHTMLUnsafe/, /parseHTMLUnsafe/, /\bexecScript\b/,
    /import\(\s*[^'"`\s]/, /\blocation\s*=(?!=)/, /location\.href\s*=(?!=)/, /\bwindow\.open\s*\(/, /\.postMessage\s*\(/, /addEventListener\(\s*['"]message['"]/];
  assert.ok(files().length > 15);
  const found = [];
  for (const f of files()) {
    const src = code(readFileSync(f, 'utf8'));
    for (const re of SINKS) {
      const m = re.exec(src);
      if (m && !(re.source.includes('Timeout|Interval') && /set(Timeout|Interval)\(\s*(resolve|res|r|next|fn|run|tick|loop|step|draw|frame|animate|update|render|poll|cb|done)\b/.test(m[0]))) {
        found.push(`${path.basename(f)}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

test('atributos peligrosos: setAttribute solo con nombres fijos (nunca on*, href, src, style, srcdoc dinámicos)', () => {
  const found = [];
  for (const f of files()) {
    const src = code(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/setAttribute\(\s*([^,]+),/g)) {
      const name = m[1].trim();
      if (/^['"`](on|srcdoc|formaction)/i.test(name)) found.push(`${path.basename(f)}: setAttribute(${name}`);
    }
    for (const m of src.matchAll(/\.(href|src|action|formAction)\s*=(?!=)\s*([^;\n]+)/g)) {
      // Solo se admiten URLs de blob creadas por la propia página o literales.
      if (!/^(url|URL\.createObjectURL|['"`])/.test(m[2].trim())) found.push(`${path.basename(f)}: .${m[1]} = ${m[2].trim().slice(0, 60)}`);
    }
    for (const m of src.matchAll(/\.on(click|error|load|mouseover|focus)\s*=\s*['"`]/g)) found.push(`${path.basename(f)}: manejador en cadena ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

test('index.html y auth.html: sin <script> en línea, sin on*, sin javascript:, sin <base>, sin orígenes externos', () => {
  for (const name of ['index.html', 'auth.html']) {
    const html = readFileSync(path.join(pub, name), 'utf8');
    for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      assert.match(m[0], /\ssrc="[^"]+"/, `${name}: <script> en línea`);
      assert.equal(m[1].trim(), '', `${name}: contenido dentro de <script src>`);
    }
    assert.ok(!/\son[a-z]+\s*=/i.test(html), `${name}: manejador on*`);
    assert.ok(!/javascript:/i.test(html), `${name}: javascript:`);
    assert.ok(!/<base\b/i.test(html), `${name}: <base>`);
    assert.ok(!/(src|href)="(https?:)?\/\//i.test(html), `${name}: recurso externo`);
  }
});
