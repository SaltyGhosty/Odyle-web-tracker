// starorb.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStarOrb, updateStarOrb, markGain, litStars } from './starorb.js';

function fakeDoc() {
  const make = (tag) => ({
    tag, attrs: {}, children: [], listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    append(...n) { this.children.push(...n); },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
    fire(t, e) { for (const f of this.listeners[t] || []) f(e); },
  });
  return { createElementNS: (_ns, tag) => make(tag) };
}
const all = (n, pred, out = []) => { if (pred(n)) out.push(n); for (const c of n.children || []) all(c, pred, out); return out; };
const stars = (svg) => all(svg, (n) => /(^| )so-star( |$)/.test(n.attrs.class || ''));
const lit = (svg) => stars(svg).filter((n) => / lit( |$)/.test(' ' + n.attrs.class));
const level = (svg) => all(svg, (n) => /so-level/.test(n.attrs.class || ''))[0];
const hasCls = (n, c) => (n.attrs.class || '').split(/\s+/).includes(c);

test('litStars reutiliza litRunes: floor(energia / 15) entre 0 y 56', () => {
  assert.equal(litStars(0), 0);
  assert.equal(litStars(14), 0);
  assert.equal(litStars(15), 1);
  assert.equal(litStars(839), 55);
  assert.equal(litStars(900), 56);
  assert.equal(litStars(NaN), 0);
});

test('buildStarOrb: svg star-orb con 56 estrellas y encendidas = floor(energia/15)', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 300, id: 'a' });
  assert.equal(svg.tag, 'svg');
  assert.ok(hasCls(svg, 'star-orb'));
  assert.equal(svg.attrs.viewBox, '0 0 104 104');
  assert.equal(svg.attrs.width, '104');
  assert.equal(stars(svg).length, 56);
  assert.equal(lit(svg).length, 20);
  // las encendidas son las primeras (sentido horario desde arriba)
  assert.ok(stars(svg).slice(0, 20).every((s) => hasCls(s, 'lit')));
  assert.ok(stars(svg).every((s) => s.tag === 'path' && /^M[\d.-]+ [\d.-]+L/.test(s.attrs.d)));
});

test('buildStarOrb: tamano pedido, sin role ni aria-label (los pone quien llama)', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 0, size: 44, id: 'm' });
  assert.equal(svg.attrs.width, '44');
  assert.equal(svg.attrs.height, '44');
  assert.equal(svg.attrs.viewBox, '0 0 104 104');
  assert.equal(svg.attrs.role, undefined);
  assert.equal(svg.attrs['aria-label'], undefined);
});

test('nivel del liquido proporcional: 0 y 840 en los extremos', () => {
  const at = (energy) => level(buildStarOrb(fakeDoc(), { energy, id: 'n' }));
  assert.equal(at(0).attrs['data-level'], '0');
  assert.equal(at(840).attrs['data-level'], '1');
  assert.equal(at(420).attrs['data-level'], '0.5');
  assert.equal(at(5000).attrs['data-level'], '1');
  assert.equal(at(-10).attrs['data-level'], '0');
  const y = (e) => Number(/translate\(0 ([\d.-]+)\)/.exec(at(e).attrs.transform)[1]);
  assert.ok(y(0) > y(210) && y(210) > y(420) && y(420) > y(840));
  // lineal: el punto medio queda a mitad de camino
  assert.ok(Math.abs((y(0) + y(840)) / 2 - y(420)) < 0.01);
});

test('estado full pone la clase full; near la suya; normal ninguna de las dos', () => {
  const doc = fakeDoc();
  assert.ok(hasCls(buildStarOrb(doc, { energy: 840, state: 'full', id: 'f' }), 'full'));
  const near = buildStarOrb(doc, { energy: 800, state: 'near', id: 'g' });
  assert.ok(hasCls(near, 'near') && !hasCls(near, 'full'));
  const normal = buildStarOrb(doc, { energy: 100, id: 'h' });
  assert.ok(!hasCls(normal, 'near') && !hasCls(normal, 'full') && hasCls(normal, 'star-orb'));
});

test('updateStarOrb reutiliza el mismo nodo y solo cambia atributos', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 100, id: 'u' });
  const before = { kids: svg.children.slice(), stars: stars(svg).slice(), lvl: level(svg) };
  const ret = updateStarOrb(svg, { energy: 615, state: 'near' });
  assert.equal(ret, svg);
  assert.deepEqual(svg.children, before.kids);
  assert.ok(stars(svg).every((s, i) => s === before.stars[i]));
  assert.equal(level(svg), before.lvl);
  assert.equal(lit(svg).length, 41);
  assert.equal(level(svg).attrs['data-level'], '0.7321');
  assert.ok(hasCls(svg, 'near'));
  updateStarOrb(svg, { energy: 840, state: 'full' });
  assert.equal(lit(svg).length, 56);
  assert.ok(hasCls(svg, 'full') && !hasCls(svg, 'near'));
  updateStarOrb(svg, { energy: 60, state: 'normal' });
  assert.equal(lit(svg).length, 4);
  assert.ok(!hasCls(svg, 'full'));
});

test('la estrella recien encendida lleva la clase new; solo una y solo al subir', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 150, id: 'w' });
  assert.equal(all(svg, (n) => hasCls(n, 'new')).length, 0);
  updateStarOrb(svg, { energy: 165 });
  const fresh = all(svg, (n) => hasCls(n, 'new'));
  assert.equal(fresh.length, 1);
  assert.equal(stars(svg).indexOf(fresh[0]), 10);
  updateStarOrb(svg, { energy: 165 }); // repintar sin cambios no mueve nada
  assert.equal(all(svg, (n) => hasCls(n, 'new')).length, 1);
  updateStarOrb(svg, { energy: 90 }); // bajar (gasto) no anima
  assert.equal(all(svg, (n) => hasCls(n, 'new')).length, 0);
});

test('updateStarOrb no toca la clase ripple (el repintado no reinicia la ondulacion)', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 150, id: 'x' });
  markGain(svg);
  updateStarOrb(svg, { energy: 165 });
  updateStarOrb(svg, { energy: 165 });
  assert.ok(hasCls(svg, 'ripple'));
});

test('markGain no se acumula y se quita en animationend de la ondulacion', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 150, id: 'y' });
  markGain(svg);
  markGain(svg);
  assert.equal(svg.attrs.class.split(/\s+/).filter((c) => c === 'ripple').length, 1);
  assert.equal((svg.listeners.animationend || []).length, 1);
  svg.fire('animationend', { animationName: 'so-star-in' }); // otra animacion: sigue
  assert.ok(hasCls(svg, 'ripple'));
  svg.fire('animationend', { animationName: 'so-ripple' });
  assert.ok(!hasCls(svg, 'ripple'));
  markGain(svg); // se puede volver a disparar, sin duplicar el oyente
  assert.ok(hasCls(svg, 'ripple'));
  assert.equal((svg.listeners.animationend || []).length, 1);
});

test('ids de clipPath unicos por orbe', () => {
  const doc = fakeDoc();
  const clipId = (svg) => all(svg, (n) => n.tag === 'clipPath')[0].attrs.id;
  const a = buildStarOrb(doc, { energy: 1, id: 'c1' }), b = buildStarOrb(doc, { energy: 1, id: 'c2' });
  assert.notEqual(clipId(a), clipId(b));
  assert.match(clipId(buildStarOrb(doc, { energy: 1, id: 'we ird~id' })), /^[A-Za-z0-9_-]+$/);
});
