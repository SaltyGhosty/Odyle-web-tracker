import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, cleanText } from '../src/lib/validate.js';

const UID = 'u_' + 'a'.repeat(22);

test('perfil acepta searchable y shareEnergy booleanos y rechaza otros tipos', () => {
  assert.ok(!sanitize(['members', UID], { profile: { nick: 'Salty', searchable: false, shareEnergy: true } }).error);
  assert.ok(sanitize(['members', UID], { profile: { searchable: 'no' } }).error);
  assert.ok(sanitize(['members', UID], { profile: { shareEnergy: 1 } }).error);
});

test('prefs acepta theme elyos|asmodian y rechaza otros', () => {
  const p = ['members', UID, 'settings', 'prefs'];
  assert.ok(!sanitize(p, { theme: 'elyos' }).error);
  assert.ok(!sanitize(p, { theme: 'asmodian' }).error);
  assert.ok(sanitize(p, { theme: 'balaur' }).error);
});

test('cleanText quita controles y bidi, recorta y aplica el máximo', () => {
  assert.equal(cleanText('  hola‮ mundo\u0007 ', 100), 'hola mundo');
  assert.equal(cleanText('a\nb', 100), 'ab');
  assert.equal(cleanText('a\nb', 100, true), 'a\nb');
  assert.equal(cleanText('   ', 100), null);
  assert.equal(cleanText('x'.repeat(11), 10), null);
  assert.equal(cleanText(42, 10), null);
});
