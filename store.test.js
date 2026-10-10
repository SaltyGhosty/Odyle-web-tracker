import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paths, planMigration } from './store.js';

test('paths por miembro', () => {
  const p = paths('u1');
  assert.equal(p.member, 'members/u1');
  assert.equal(p.characters, 'members/u1/characters');
  assert.equal(p.presets, 'members/u1/settings/presets');
  assert.equal(p.prefs, 'members/u1/settings/prefs');
  assert.equal(p.events, 'members/u1/events');
});
test('planMigration copia lo que falta con todos sus campos', () => {
  const doc = { id: 'a', data: { name: 'X', energy: 1, recordedAt: 2, classId: 'clerigo', order: 1 } };
  assert.deepEqual(planMigration([doc], new Set()), [doc]);
  assert.deepEqual(planMigration([doc], new Set(['a'])), []);
});
