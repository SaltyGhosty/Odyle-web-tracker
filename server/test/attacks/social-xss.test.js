// SR-43: el texto se guarda limpio de controles y bidi, y se devuelve como JSON (nunca como HTML).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';

test('HTML y bidi en mensajes y notas', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const payload = '<img src=x onerror=alert(1)>‮txt.exe\u0000';
  const r = await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: payload });
  assert.match(r.headers['content-type'], /^application\/json/);
  assert.equal(r.json().message.body.text, '<img src=x onerror=alert(1)>txt.exe');
  const h = await s.call('GET', `/api/messages/${s.ids.A}`, 'B');
  assert.match(h.headers['content-type'], /^application\/json/);
  assert.ok(h.headers['content-security-policy'].includes("script-src 'self'"));
});

test('el nick con HTML sale como dato JSON en la búsqueda', async () => {
  const s = await socialSetup(2);
  await s.doc(`members/${s.ids.B}`, { joinedAt: 1, profile: { nick: '<b>Nah</b>' } });
  const r = await s.call('GET', '/api/profiles/search?q=%3Cb', 'A');
  assert.match(r.headers['content-type'], /^application\/json/);
  assert.equal(r.json().results[0].nick, '<b>Nah</b>');
});
