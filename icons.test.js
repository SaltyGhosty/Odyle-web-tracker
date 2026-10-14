import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, iconSvg } from './icons.js';
import { SECTIONS } from './layout.js';

test('cada sección y «más»/«perfil» tienen icono propio', () => {
  for (const id of [...SECTIONS.map((s) => s.icon), 'mas', 'perfil']) {
    assert.ok(Array.isArray(ICONS[id]) && ICONS[id].length > 0, id);
    for (const d of ICONS[id]) assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/, id);
  }
});

function fakeDoc() {
  const make = (tag) => ({ tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = String(v); }, append(...n) { this.children.push(...n); } });
  return { createElementNS: (_ns, tag) => make(tag) };
}
test('iconSvg: svg decorativo de 24×24 con un path por trazo', () => {
  const svg = iconSvg(fakeDoc(), 'chat');
  assert.equal(svg.tag, 'svg');
  assert.equal(svg.attrs.viewBox, '0 0 24 24');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  assert.equal(svg.attrs.class, 'i');
  assert.equal(svg.children.length, ICONS.chat.length);
  assert.ok(svg.children.every((p) => p.tag === 'path'));
});
test('iconSvg con id desconocido devuelve un svg vacío, no lanza', () => {
  assert.equal(iconSvg(fakeDoc(), 'zzz').children.length, 0);
});
