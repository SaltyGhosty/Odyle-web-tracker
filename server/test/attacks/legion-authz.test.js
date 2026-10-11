// Ataque: acciones de líder sin serlo, expulsado que sigue leyendo, suplantar o editar mensajes ajenos (SR-28..SR-30).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, quickUser, as, legionWith, docOf } from './_lib.js';

test('no-líder (miembro o ajeno) => 403 en code, new-code, rename, kick y dissolve; nada cambia', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const M = await quickUser(s, 'miembro'); const O = await quickUser(s, 'otro');
  const g = await legionWith(s, L, [M]);
  for (const who of [M, O]) {
    const w = as(s, who);
    for (const [method, url, body] of [
      ['GET', '/api/legions/mine/code'], ['POST', '/api/legions/mine/code', {}], ['PATCH', '/api/legions/mine', { name: 'Hackeada' }],
      ['POST', '/api/legions/mine/kick', { uid: L.id }], ['POST', '/api/legions/mine/kick', { uid: M.id }], ['DELETE', '/api/legions/mine'],
    ]) {
      const r = await w(method, url, body);
      assert.equal(r.statusCode, 403, `${who === M ? 'miembro' : 'ajeno'} ${method} ${url} -> ${r.statusCode}`);
      assert.ok(!/"code"/.test(r.body));
    }
  }
  const l = await docOf(s, `legions/${L.id}`);
  assert.equal(l.name, 'Los Albores'); assert.deepEqual(l.banned, []);
  assert.equal((await docOf(s, `members/${M.id}`)).legionEpoch, g.epoch);
  await s.app.close();
});

test('expulsado con la página abierta: su siguiente lectura de legionData y de fichas de la legión => denegada', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const M = await quickUser(s, 'miembro'); const K = await quickUser(s, 'expulsado');
  const g = await legionWith(s, L, [M, K]);
  await as(s, M)('PUT', `/api/docs/members/${M.id}`, { profile: { nick: 'Mia' } });
  await as(s, L)('PUT', `/api/docs/legionData/${g.key}/wall/w1`, { at: 1, text: 'plan secreto' });
  const k = as(s, K);
  assert.equal((await k('GET', `/api/docs/legionData/${g.key}/wall`)).statusCode, 200, 'control: antes de expulsar lee');
  assert.equal((await k('GET', `/api/docs/members/${M.id}`)).statusCode, 200);
  assert.equal((await as(s, L)('POST', '/api/legions/mine/kick', { uid: K.id })).statusCode, 200);
  for (const p of [`legionData/${g.key}/wall`, `legionData/${g.key}/wall/w1`, `legionData/${g.key}/calendar`]) {
    assert.equal((await k('GET', `/api/docs/${p}`)).statusCode, 403, `GET ${p}`);
  }
  assert.ok([403, 404].includes((await k('GET', `/api/docs/members/${M.id}`)).statusCode));
  const list = await k('GET', '/api/docs/members');
  assert.ok(!list.body.includes(M.id) && !list.body.includes(L.id), 'el listado ya no incluye a la legión');
  // Escribir en el muro o editar su propio mensaje antiguo tampoco.
  assert.equal((await k('PUT', `/api/docs/legionData/${g.key}/wall/k1`, { at: 2, text: 'sigo aquí' })).statusCode, 403);
  await s.app.close();
});

test('suplantar al autor (uid en el cuerpo) se ignora; editar o borrar el mensaje/evento de otro => 403', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const M = await quickUser(s, 'miembro');
  const g = await legionWith(s, L, [M]);
  const m = as(s, M);
  const base = `/api/docs/legionData/${g.key}`;
  assert.equal((await m('PUT', `${base}/wall/spoof`, { at: 1, text: 'soy el líder', uid: L.id })).statusCode, 200);
  assert.equal((await docOf(s, `legionData/${g.key}/wall/spoof`)).uid, M.id, 'autor fijado por el servidor');
  await m('PATCH', `${base}/wall/spoof`, { uid: L.id });
  assert.equal((await docOf(s, `legionData/${g.key}/wall/spoof`)).uid, M.id, 'PATCH no cambia el autor');
  await as(s, L)('PUT', `${base}/wall/lw`, { at: 2, text: 'mensaje del líder' });
  await as(s, L)('PUT', `${base}/calendar/ev`, { title: 'Raid', at: 1_800_000_000_000, durationMin: 60 });
  for (const [method, p, body] of [
    ['PUT', 'wall/lw', { at: 2, text: 'editado por M' }], ['PATCH', 'wall/lw', { text: 'editado por M' }], ['DELETE', 'wall/lw'],
    ['PUT', 'calendar/ev', { title: 'Cancelada', at: 1, durationMin: 5 }], ['PATCH', 'calendar/ev', { title: 'Cancelada' }],
    ['PATCH', 'calendar/ev', { rsvp: { [M.id]: 'yes' }, title: 'Cancelada' }], ['PATCH', 'calendar/ev', { rsvp: { [L.id]: 'no' } }],
    ['PATCH', 'calendar/ev', { rsvp: { [M.id]: 'yes', [L.id]: 'no' } }], ['DELETE', 'calendar/ev'],
  ]) {
    const r = await m(method, `${base}/${p}`, body);
    assert.equal(r.statusCode, 403, `${method} ${p} ${JSON.stringify(body || '')} -> ${r.statusCode}`);
  }
  assert.equal((await docOf(s, `legionData/${g.key}/wall/lw`)).text, 'mensaje del líder');
  assert.equal((await docOf(s, `legionData/${g.key}/calendar/ev`)).title, 'Raid');
  // Su propia RSVP sí (control) y no borra las demás.
  assert.equal((await m('PATCH', `${base}/calendar/ev`, { rsvp: { [M.id]: 'yes' } })).statusCode, 200);
  assert.equal((await docOf(s, `legionData/${g.key}/calendar/ev`)).uid, L.id);
  await s.app.close();
});

test('el líder no puede salir sin disolver, ni expulsarse a sí mismo; un usuario está en una sola legión', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const L2 = await quickUser(s, 'lider2'); const U = await quickUser(s, 'u');
  const g1 = await legionWith(s, L, [U]);
  const g2 = await legionWith(s, L2, [], 'Segunda');
  assert.equal((await as(s, L)('POST', '/api/legions/leave', {})).statusCode, 409);
  assert.equal((await as(s, L)('POST', '/api/legions/mine/kick', { uid: L.id })).statusCode, 400);
  assert.equal((await docOf(s, `members/${L.id}`)).legionId, L.id);
  // El líder no puede unirse a otra legión.
  assert.equal((await as(s, L)('POST', '/api/legions/join', { code: g2.code })).statusCode, 409);
  // U se une a la segunda: deja de estar en la primera (una sola pertenencia).
  assert.equal((await as(s, U)('POST', '/api/legions/join', { code: g2.code })).statusCode, 200);
  assert.equal((await as(s, U)('GET', `/api/docs/legionData/${g1.key}/wall`)).statusCode, 403);
  assert.equal((await as(s, U)('GET', `/api/docs/legionData/${g2.key}/wall`)).statusCode, 200);
  await s.app.close();
});

test('tras disolver, los antiguos miembros pierden el acceso aunque el líder vuelva a crear la legión', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider'); const M = await quickUser(s, 'miembro');
  const g = await legionWith(s, L, [M]);
  assert.equal((await as(s, L)('DELETE', '/api/legions/mine')).statusCode, 200);
  const g2 = await legionWith(s, L, [], 'Renacida');
  assert.notEqual(g2.epoch, g.epoch);
  assert.equal((await as(s, M)('GET', `/api/docs/legionData/${g2.key}/wall`)).statusCode, 403);
  assert.ok([403, 404].includes((await as(s, M)('GET', `/api/docs/members/${L.id}`)).statusCode));
  await s.app.close();
});

test('kick con uid basura (NUL, objeto, muy largo) => 400, nunca 500', async () => {
  const s = await setup();
  const L = await quickUser(s, 'lider');
  await legionWith(s, L, []);
  for (const uid of ['\u0000', `u_${'A'.repeat(21)}\u0000`, { $ne: null }, ['x'], 'x'.repeat(10000), '../legions/x']) {
    const r = await as(s, L)('POST', '/api/legions/mine/kick', { uid });
    assert.equal(r.statusCode, 400, `kick ${JSON.stringify(uid).slice(0, 40)} -> ${r.statusCode}`);
  }
  await s.app.close();
});
