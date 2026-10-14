// orb3d.test.js: the pure parts of the 3D orb (the GL drawing itself is checked in dev/e2e-web.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// orb3d.js imports Three.js from the CDN (the build rewrites it); in Node, resolve that URL to the installed package.
register('data:text/javascript,' + encodeURIComponent(
  "export const resolve = (s, c, next) => next(s.startsWith('https://cdn.jsdelivr.net/npm/three@') ? 'three' : s, c);"));
const { levelOf, ripplePower, beatOpacity, spinAngle, runePositions, parseColor, RIPPLE_MS, BEAT_MS, TURN_MS, RING_R, RING_TILT, createOrbs3D } = await import('./orb3d.js');

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('levelOf: energy / 840, clamped, junk is empty', () => {
  assert.equal(levelOf(0), 0);
  assert.equal(levelOf(420), 0.5);
  assert.equal(levelOf(840), 1);
  assert.equal(levelOf(900), 1);
  assert.equal(levelOf(-5), 0);
  assert.equal(levelOf('abc'), 0);
  assert.equal(levelOf(undefined), 0);
  assert.equal(levelOf(10, 0), 0);
});

test('ripplePower: 1 at the start, decays, 0 once the 900 ms are over or before it began', () => {
  assert.equal(ripplePower(0), 1);
  assert.ok(ripplePower(300) > ripplePower(600) && ripplePower(600) > 0);
  assert.equal(ripplePower(RIPPLE_MS), 0);
  assert.equal(ripplePower(5000), 0);
  assert.equal(ripplePower(-1), 0);
  assert.equal(ripplePower(NaN), 0); // never gained: now - undefined
});

test('beatOpacity: 1 → .5 → 1 every 2.4 s, phased on the wall clock', () => {
  assert.ok(near(beatOpacity(0), 1));
  assert.ok(near(beatOpacity(BEAT_MS / 2), 0.5));
  assert.ok(near(beatOpacity(BEAT_MS * 7), 1));
  assert.ok(near(beatOpacity(123456), beatOpacity(123456 + BEAT_MS)));
});

test('spinAngle: one turn per TURN_MS (40-60 s)', () => {
  assert.ok(TURN_MS >= 40000 && TURN_MS <= 60000);
  assert.equal(spinAngle(0), 0);
  assert.ok(near(spinAngle(TURN_MS / 4), Math.PI / 2));
  assert.ok(near(spinAngle(TURN_MS * 3 + 10), spinAngle(10)));
});

test('runePositions: 56 stars on a tilted circle, half in front of the glass and half behind', () => {
  const pos = runePositions(0);
  assert.equal(pos.length, 56);
  for (const p of pos) assert.ok(near(Math.hypot(p.x, p.y, p.z), RING_R, 1e-9));
  for (const p of pos) assert.ok(Math.hypot(p.x, p.y, p.z) > 1); // always outside the glass (radius 1)
  const front = pos.filter((p) => p.z > 1e-9).length, back = pos.filter((p) => p.z < -1e-9).length;
  assert.equal(front, back);
  assert.ok(front >= 26);
  // seen from the front it is an ellipse: about R wide and R·cos(tilt) tall
  const tall = Math.max(...pos.map((p) => Math.abs(p.y))), wide = Math.max(...pos.map((p) => Math.abs(p.x)));
  assert.ok(tall < wide && tall >= RING_R * Math.cos(RING_TILT) - 1e-9);
  assert.ok(RING_TILT > (60 * Math.PI) / 180 && RING_TILT < (70 * Math.PI) / 180);
  // star 0 is at the top of the ring (the far side), star 14 a quarter turn clockwise (to the right)
  assert.ok(pos[0].z < 0 && pos[0].y > 0);
  assert.ok(pos[14].x > 1.2);
});

test('runePositions: the spin turns the ring without changing its shape', () => {
  const a = runePositions(0), b = runePositions((2 * Math.PI) / 56);
  for (let i = 0; i < 55; i++) {
    assert.ok(near(a[i + 1].x, b[i].x, 1e-9) && near(a[i + 1].y, b[i].y, 1e-9) && near(a[i + 1].z, b[i].z, 1e-9));
  }
});

test('parseColor: the token formats the page uses', () => {
  assert.deepEqual(parseColor('#E3A853'), [0xe3 / 255, 0xa8 / 255, 0x53 / 255, 1]);
  assert.deepEqual(parseColor(' #fff '), [1, 1, 1, 1]);
  assert.deepEqual(parseColor('rgba(244, 231, 200, .26)'), [244 / 255, 231 / 255, 200 / 255, 0.26]);
  assert.deepEqual(parseColor('rgb(0 0 0 / 50%)'), [0, 0, 0, 0.5]);
  assert.deepEqual(parseColor('rgb(255,0,0)'), [1, 0, 0, 1]);
  assert.equal(parseColor(''), null);
  assert.equal(parseColor('var(--x)'), null);
  assert.equal(parseColor('#12'), null);
});

test('createOrbs3D: no WebGL → null (the SVG orb stays)', () => {
  const doc = { defaultView: {}, createElement: () => ({ getContext: () => null }) };
  assert.equal(createOrbs3D(doc), null);
});
