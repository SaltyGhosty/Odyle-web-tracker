import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paths } from './store.js';

test('paths: temporizadores, estadísticas, progreso y PC del miembro', () => {
  const p = paths('u1');
  assert.equal(p.timers, 'members/u1/settings/timers');
  assert.equal(p.stats, 'members/u1/settings/stats');
  assert.equal(p.progress, 'members/u1/progress');
  assert.equal(p.cp, 'members/u1/cp');
  assert.equal(p.tasks, 'members/u1/settings/tasks');
  // documents have an even number of segments, collections odd
  for (const k of ['member', 'presets', 'prefs', 'timers', 'stats', 'tasks']) assert.equal(p[k].split('/').length % 2, 0, k);
  for (const k of ['characters', 'events', 'cp', 'progress']) assert.equal(p[k].split('/').length % 2, 1, k);
});
