// i18n-social.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STRINGS } from './i18n-strings.js';

const WEB = new URL('./web/', import.meta.url);
const files = readdirSync(WEB).filter((f) => /^social-.*\.js$/.test(f) && !f.endsWith('.test.js') && f !== 'social-api.js');

test('cada texto S(...) de las pantallas sociales está traducido a en, it y pt', () => {
  const missing = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, WEB), 'utf8');
    for (const m of src.matchAll(/\bS\('((?:[^'\\]|\\.)*)'\)/g)) {
      const key = m[1].replace(/\\'/g, "'");
      for (const l of ['en', 'it', 'pt']) if (!(key in STRINGS[l])) missing.push(`${l}: «${key}» (${f})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('las pantallas sociales no usan texto entre comillas dobles ni plantillas para la interfaz con S()', () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, WEB), 'utf8');
    assert.ok(!/\bS\(\s*["`]/.test(src), `${f}: usa S('…') con comillas simples`);
  }
});

test('los errores que el cliente y las rutas sociales del servidor devuelven en español están traducidos', () => {
  const keys = new Set(['No se pudo conectar. Inténtalo de nuevo.', 'No se pudo completar la acción.']);
  const dir = new URL('./server/src/routes/', import.meta.url);
  for (const f of ['profiles.js', 'friends.js', 'messages.js', 'reports.js']) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/(?:error: |bad\(reply, |FULL = |\{ error: )'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
  }
  keys.add(readFileSync(new URL('./server/src/lib/social-rules.js', import.meta.url), 'utf8').match(/NOT_FOUND = '([^']+)'/)[1]);
  const missing = [];
  for (const key of keys) for (const l of ['en', 'it', 'pt']) if (!(key in STRINGS[l])) missing.push(`${l}: ${key}`);
  assert.ok(keys.size >= 12);
  assert.deepEqual(missing, []);
});
