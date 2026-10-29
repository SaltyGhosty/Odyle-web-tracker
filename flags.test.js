import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG_CODES, flagSvg } from './flags.js';
import { LANGS } from './i18n.js';

function fakeDoc() {
  const make = (tag) => ({ tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = String(v); }, append(...n) { this.children.push(...n); } });
  return { createElementNS: (_ns, tag) => make(tag) };
}

test('una bandera por idioma de la página', () => {
  assert.deepEqual([...FLAG_CODES].sort(), Object.keys(LANGS).sort());
});
test('flagSvg: svg decorativo 3:2 de 24×16 con su dibujo', () => {
  for (const code of FLAG_CODES) {
    const svg = flagSvg(fakeDoc(), code);
    assert.equal(svg.tag, 'svg', code);
    assert.equal(svg.attrs.viewBox, '0 0 30 20', code);
    assert.equal(svg.attrs.width, '24');
    assert.equal(svg.attrs.height, '16');
    assert.equal(svg.attrs.class, 'flag');
    assert.equal(svg.attrs['aria-hidden'], 'true');
    assert.equal(svg.attrs.focusable, 'false');
    assert.ok(svg.children.length > 0, code);
  }
});
test('flagSvg con código desconocido devuelve null', () => {
  assert.equal(flagSvg(fakeDoc(), 'zz'), null);
  assert.equal(flagSvg(fakeDoc(), 'toString'), null);
});
