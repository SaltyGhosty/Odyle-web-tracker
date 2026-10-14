import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, resolveTheme, otherTheme, themeOf } from './theme.js';

test('prefs.theme (el botón libre) manda sobre todo lo demás', () => {
  assert.equal(resolveTheme({ prefs: { theme: 'asmodian', faction: 'elyos' }, profile: { faction: 'elyos' }, cached: 'elyos' }), 'asmodian');
});
test('sin prefs.theme: la elección antigua prefs.faction, luego la facción del perfil, luego la caché, luego Elyos', () => {
  assert.equal(resolveTheme({ prefs: { faction: 'asmodian' }, profile: { faction: 'elyos' } }), 'asmodian');
  assert.equal(resolveTheme({ prefs: {}, profile: { faction: 'asmodian' } }), 'asmodian');
  assert.equal(resolveTheme({ prefs: {}, profile: {}, cached: 'asmodian' }), 'asmodian');
  assert.equal(resolveTheme({}), 'elyos');
  assert.equal(resolveTheme(), 'elyos');
});
test('guardar el perfil con otra facción no cambia un tema ya elegido', () => {
  assert.equal(resolveTheme({ prefs: { theme: 'elyos' }, profile: { faction: 'asmodian' } }), 'elyos');
});
test('valores raros se ignoran', () => {
  assert.equal(resolveTheme({ prefs: { theme: 'dark', faction: 42 }, profile: { faction: '<b>' }, cached: 'x' }), 'elyos');
});
test('otherTheme y themeOf', () => {
  assert.equal(otherTheme('elyos'), 'asmodian');
  assert.equal(otherTheme('asmodian'), 'elyos');
  assert.equal(otherTheme('zzz'), 'asmodian');
  assert.equal(themeOf('asmodian'), THEMES.asmodian);
  assert.equal(themeOf('zzz'), THEMES.elyos);
});
test('colores de la spec', () => {
  assert.equal(THEMES.elyos.light, false);
  assert.equal(THEMES.asmodian.light, false);
  assert.equal(THEMES.elyos.themeColor, '#2F3B55');
  assert.equal(THEMES.asmodian.themeColor, '#1B1530');
});
