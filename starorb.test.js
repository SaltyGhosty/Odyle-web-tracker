// starorb.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStarOrb, updateStarOrb, markGain, litStars, syncOrbMotion } from './starorb.js';
import { RUNE_GLYPHS } from './runes.js';

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
const stars = (svg) => all(svg, (n) => /(^| )so-rune( |$)/.test(n.attrs.class || ''));
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

test('buildStarOrb: svg star-orb con 56 runas y encendidas = floor(energia/15)', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 300, id: 'a' });
  assert.equal(svg.tag, 'svg');
  assert.ok(hasCls(svg, 'star-orb'));
  assert.equal(svg.attrs.viewBox, '0 0 104 104');
  assert.equal(svg.attrs.width, '104');
  assert.equal(stars(svg).length, 56);
  assert.equal(lit(svg).length, 20);
  // las encendidas son las primeras (sentido horario desde arriba)
  assert.ok(stars(svg).slice(0, 20).every((s) => hasCls(s, 'lit')));
  assert.ok(stars(svg).every((s) => s.tag === 'path'));
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
  svg.fire('animationend', { animationName: 'so-rune-in' }); // otra animacion: sigue
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

test('syncOrbMotion: reanuda la ondulacion y el latido tras reinsertar el nodo, y limpia la ondulacion vencida', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 150, id: 'z' });
  const props = {};
  svg.style = { setProperty: (k, v) => { props[k] = v; } };
  const t0 = Date.now();
  markGain(svg);
  syncOrbMotion(svg, t0 + 300);
  assert.ok(hasCls(svg, 'ripple'));
  assert.ok(/^-(2\d\d|3\d\d)ms$/.test(props['--so-ripple-delay']), props['--so-ripple-delay']);
  assert.equal(props['--so-beat-delay'], `${-((t0 + 300) % 2400)}ms`);
  syncOrbMotion(svg, t0 + 5000); // oculta mucho tiempo: ya no hay ondulacion pendiente
  assert.ok(!hasCls(svg, 'ripple'));
});

test('buildStarOrb con tope 560: 280 de energía enciende 28 estrellas', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 280, max: 560, id: 'n' });
  assert.equal(svg.attrs['data-lit'], '28');
  assert.equal(litStars(280, 560), 28);
});

test('el anillo tiene 56 runas de Atreia con su trazo', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 420, max: 840 });
  const runes = stars(svg);
  assert.equal(runes.length, 56);
  assert.equal(runes[0].getAttribute('d'), RUNE_GLYPHS[0].d);
  assert.equal(runes[29].getAttribute('d'), RUNE_GLYPHS[1].d);
  assert.equal(svg.getAttribute('data-lit'), '28');
  // centrada en su punto del anillo, con la parte de arriba hacia fuera
  assert.match(runes[0].getAttribute('transform'), /^translate\(52 6\) rotate\(0\) scale\([\d.]+\) translate\(-5 -7\)$/);
  assert.match(runes[14].getAttribute('transform'), /^translate\(98 52\) rotate\(90\) /);
});
test('mini orbe (44 px): marcas cortas en vez de runas', () => {
  const svg = buildStarOrb(fakeDoc(), { energy: 0, size: 44 });
  const ticks = all(svg, (n) => hasCls(n, 'so-rune') && hasCls(n, 'tick'));
  assert.equal(ticks.length, 56);
  assert.equal(stars(svg).length, 56);
  // un trazo radial de 3 px en pantalla (3 px a 44 px = 3 * 104 / 44 unidades del viewBox)
  const [, x1, y1, x2, y2] = /^M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)$/.exec(ticks[0].getAttribute('d')).map(Number);
  assert.ok(Math.abs(x1 - 52) < 0.01 && Math.abs(x2 - 52) < 0.01);
  assert.ok(Math.abs(Math.abs(y2 - y1) - 3 * 104 / 44) < 0.02);
});
