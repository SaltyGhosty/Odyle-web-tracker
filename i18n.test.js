import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from './i18n-strings.js';
import { tr, setLang, LANG } from './i18n.js';

globalThis.document ??= { documentElement: {} }; // setLang sets <html lang>; no DOM in node
const holes = s => (s.match(/\{\d\}/g) || []).sort().join();

test('cada traducción conserva los mismos {n} que el original', () => {
  for (const [lang, dict] of Object.entries(STRINGS)) {
    for (const [k, v] of Object.entries(dict)) {
      assert.equal(typeof v, 'string', `${lang}: ${k}`);
      assert.equal(holes(v), holes(k), `${lang}: "${k}" → "${v}"`);
    }
  }
});
test('los tres idiomas tienen las mismas claves', () => {
  const en = Object.keys(STRINGS.en).sort();
  for (const l of ['it', 'pt']) {
    const missing = en.filter(k => !(k in STRINGS[l]));
    assert.deepEqual(missing, [], `${l} sin traducir`);
  }
});
test('plantillas nuevas se traducen, también lo capturado', () => {
  setLang('en');
  assert.equal(LANG, 'en');
  assert.equal(tr('Mazmorras (40): 2 ahora · 4 antes de medianoche'), STRINGS.en['Mazmorras ({0}): {1} ahora · {2} antes de medianoche'].replace('{0}', '40').replace('{1}', '2').replace('{2}', '4'));
  assert.equal(tr('● 3 en línea'), STRINGS.en['● {0} en línea'].replace('{0}', '3'));
  assert.equal(tr('Busco grupo'), STRINGS.en['Busco grupo']);
  assert.match(tr('Ana busca grupo: Mazmorra'), new RegExp(STRINGS.en['Mazmorra']));
});
test('texto desconocido se deja igual; español no traduce', () => {
  setLang('en');
  assert.equal(tr('SaltyGhosty'), 'SaltyGhosty');
  setLang('es');
  assert.equal(tr('Busco grupo'), 'Busco grupo');
});
