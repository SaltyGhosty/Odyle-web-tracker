// Ataque: XSS almacenado y suplantación visual (bidi/control) en todos los textos de usuario (SR-2, SR-4).
// Aquí se comprueba el almacenamiento y la respuesta de la API; el pintado en el navegador está en dev/e2e-web.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, quickUser, as, legionWith, docOf } from './_lib.js';

const PAYLOADS = ['<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', "'-alert(1)-'", 'javascript:alert(1)', '<script>alert(1)</script>'];
const BIDI = ['‮', '‪', '‫', '‬', '‭', '⁦', '⁧', '⁨', '⁩'];
const CTRL = ['\u0000', '\u0001', '\u0007', '\u001B', '\u007F', '\u0085', '\u009B'];

test('cargas XSS en nick, bio, servidor, personaje, notas, muro, calendario y feedback se guardan como texto literal y salen como JSON', async () => {
  const s = await setup();
  const L = await quickUser(s, 'l'); const M = await quickUser(s, 'm');
  const g = await legionWith(s, L, [M]);
  const m = as(s, M);
  for (const p of PAYLOADS) {
    const short = p.slice(0, 20);
    const writes = [
      [`members/${M.id}`, { profile: { nick: short, bio: p, server: short } }, (d) => d.profile.bio === p && d.profile.nick === short],
      [`members/${M.id}/characters/c1`, { name: p, notes: p }, (d) => d.name === p && d.notes === p],
      [`legionData/${g.key}/wall/w1`, { at: 1, text: p }, (d) => d.text === p],
      [`legionData/${g.key}/calendar/e1`, { title: p, at: 1_800_000_000_000, durationMin: 30 }, (d) => d.title === p],
      [`feedback/${M.id}`, { items: [{ at: 1, text: p }] }, (d) => d.items[0].text === p],
    ];
    for (const [path, body, check] of writes) {
      const w = await m('PUT', `/api/docs/${path}`, body);
      assert.equal(w.statusCode, 200, `${path} ${w.body}`);
      const r = await m('GET', `/api/docs/${path}`);
      assert.match(r.headers['content-type'], /^application\/json/);
      assert.ok(check(r.json().data), `${path}: texto alterado`);
    }
  }
  await s.app.close();
});

test('bidi y caracteres de control se eliminan de los textos de documentos (nick, muro, notas, título)', async () => {
  const s = await setup();
  const L = await quickUser(s, 'l'); const M = await quickUser(s, 'm');
  const g = await legionWith(s, L, [M]);
  const m = as(s, M);
  const dirty = `Ad${BIDI.join('')}${CTRL.join('')}min`;
  await m('PUT', `/api/docs/members/${M.id}`, { profile: { nick: dirty.slice(0, 20), bio: dirty } });
  await m('PUT', `/api/docs/legionData/${g.key}/wall/w1`, { at: 1, text: dirty });
  await m('PUT', `/api/docs/members/${M.id}/characters/c1`, { name: dirty, notes: dirty });
  await m('PUT', `/api/docs/legionData/${g.key}/calendar/e1`, { title: dirty, at: 1_800_000_000_000, durationMin: 30 });
  const all = JSON.stringify([await docOf(s, `members/${M.id}`), await docOf(s, `legionData/${g.key}/wall/w1`),
    await docOf(s, `members/${M.id}/characters/c1`), await docOf(s, `legionData/${g.key}/calendar/e1`)]);
  for (const ch of [...BIDI, ...CTRL]) assert.ok(!all.includes(ch) && !all.toLowerCase().includes(`\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`), `queda U+${ch.charCodeAt(0).toString(16)}`);
  await s.app.close();
});

test('nombre de legión: XSS como texto; bidi (U+202E) y control se eliminan o se rechazan; NUL nunca da 500 (SR-4)', async () => {
  const s = await setup();
  const L = await quickUser(s, 'l'); const X = await quickUser(s, 'x');
  const created = await as(s, L)('POST', '/api/legions', { name: '<img src=x onerror=1>' });
  assert.equal(created.statusCode, 200);
  assert.equal((await docOf(s, `legions/${L.id}`)).name, '<img src=x onerror=1>');
  const problems = [];
  for (const [label, name] of [
    ['RLO (suplantación visual)', 'Líder‮oficial'], ['LRI/PDI', 'Los⁦ Albores⁩'], ['NUL', 'Los\u0000Albores'],
    ['ESC', 'Los\u001B[31mAlbores'], ['C1', 'Los\u009BAlbores'], ['DEL', 'Los\u007FAlbores'],
  ]) {
    const r = await as(s, L)('PATCH', '/api/legions/mine', { name });
    if (r.statusCode >= 500) { problems.push(`${label}: rename -> ${r.statusCode}`); continue; }
    if (r.statusCode === 200) {
      const stored = (await docOf(s, `legions/${L.id}`)).name;
      if (/[\u0000-\u001F\u007F-\u009F‪-‮⁦-⁩]/.test(stored)) problems.push(`${label}: guardado tal cual (${JSON.stringify(stored)})`);
    }
  }
  const c2 = await as(s, X)('POST', '/api/legions', { name: 'Admin‮noigel' });
  if (c2.statusCode === 200 && /‮/.test((await docOf(s, `legions/${X.id}`)).name)) problems.push('crear: RLO guardado tal cual');
  assert.deepEqual(problems, []);
  await s.app.close();
});

test('claves de objeto con bidi o control se rechazan (no se pueden colar en el JSON pintado)', async () => {
  const s = await setup();
  const M = await quickUser(s, 'm');
  for (const key of ['a‮b', 'a\u0000b', 'a\u001Bb']) {
    const r = await as(s, M)('PUT', `/api/docs/members/${M.id}`, { rank: { achievements: { [key]: 1 } } });
    assert.equal(r.statusCode, 400, JSON.stringify(key));
  }
  await s.app.close();
});
