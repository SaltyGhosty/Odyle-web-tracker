// Ataque: leer o escribir documentos ajenos cambiando el id en la ruta (IDOR) y listar colecciones (SR-27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, quickUser, as, legionWith, docOf } from './_lib.js';

async function world() {
  const s = await setup();
  const V = await quickUser(s, 'victima'); const VM = await quickUser(s, 'companero');
  const X = await quickUser(s, 'atacante'); const XM = await quickUser(s, 'complice');
  const gv = await legionWith(s, V, [VM], 'Víctimas');
  const gx = await legionWith(s, X, [XM], 'Atacantes');
  const v = as(s, V);
  await v('PUT', `/api/docs/members/${V.id}`, { profile: { nick: 'Victima', bio: 'secreto de la víctima' } });
  await v('PUT', `/api/docs/members/${V.id}/characters/c1`, { name: 'PersonajeVictima', notes: 'nota privada' });
  await v('PUT', `/api/docs/members/${V.id}/settings/schedule`, { anchorMs: 123 });
  await v('PUT', `/api/docs/feedback/${V.id}`, { items: [{ at: 1, text: 'queja privada' }] });
  await v('PUT', `/api/docs/legionData/${gv.key}/wall/w1`, { at: 1, text: 'muro secreto' });
  return { s, V, VM, X, XM, gv, gx };
}

test('otra legión: leer members/{víctima}, sus personajes, ajustes, schedule, feedback y legionData => denegado', async () => {
  const { s, V, X, gv } = await world();
  const x = as(s, X);
  for (const p of [`members/${V.id}`, `members/${V.id}/characters/c1`, `members/${V.id}/characters`, `members/${V.id}/settings/schedule`,
    `members/${V.id}/settings/prefs`, `feedback/${V.id}`, 'feedback', `legionData/${gv.key}/wall`, `legionData/${gv.key}/wall/w1`, `legionData/${gv.key}/calendar`]) {
    const r = await x('GET', `/api/docs/${p}`);
    assert.ok([403, 404].includes(r.statusCode), `GET ${p} -> ${r.statusCode}`);
    assert.ok(!/secreto|privad|PersonajeVictima|queja/.test(r.body), `GET ${p} filtra datos`);
  }
  await s.app.close();
});

test('escribir o borrar en members/{otro}/** (incluso del compañero de legión), su schedule o su feedback => 403 y sin cambios', async () => {
  const { s, V, VM, X } = await world();
  for (const [who, label] of [[X, 'otra legión'], [VM, 'misma legión']]) {
    const w = as(s, who);
    for (const [method, p, body] of [
      ['PUT', `members/${V.id}`, { profile: { nick: 'pwned' } }],
      ['PATCH', `members/${V.id}`, { profile: { nick: 'pwned' } }],
      ['PUT', `members/${V.id}/characters/c1`, { name: 'pwned' }],
      ['PUT', `members/${V.id}/characters/nuevo`, { name: 'pwned' }],
      ['DELETE', `members/${V.id}/characters/c1`, undefined],
      ['PUT', `members/${V.id}/settings/schedule`, { anchorMs: 1 }],
      ['PATCH', `members/${V.id}/settings/schedule`, { anchorMs: 1 }],
      ['PUT', `feedback/${V.id}`, { items: [] }],
      ['DELETE', `feedback/${V.id}`, undefined],
      ['PUT', `legions/${V.id}`, { name: 'pwned', leader: who.id }],
    ]) {
      const r = await w(method, `/api/docs/${p}`, body);
      assert.equal(r.statusCode, 403, `[${label}] ${method} ${p} -> ${r.statusCode}`);
    }
  }
  assert.equal((await docOf(s, `members/${V.id}`)).profile.nick, 'Victima');
  assert.equal((await docOf(s, `members/${V.id}/characters/c1`)).name, 'PersonajeVictima');
  assert.equal((await docOf(s, `members/${V.id}/settings/schedule`)).anchorMs, 123);
  assert.equal(await docOf(s, `members/${V.id}/characters/nuevo`), undefined);
  assert.equal((await docOf(s, `legions/${V.id}`)).name, 'Víctimas');
  await s.app.close();
});

test('listar members: solo mi ficha y las de mi legión vigente; where/orderBy/limit no amplían el resultado', async () => {
  const { s, V, VM, X, XM } = await world();
  const ids = (r) => r.json().docs.map((d) => d.id).sort();
  const x = as(s, X);
  for (const q of ['', '?limit=200', '?orderBy=at,desc', '?where=at,>,-1', '?where=at,<,99999999999999&limit=1', '?where=at,!=,0']) {
    const r = await x('GET', `/api/docs/members${q}`);
    if (r.statusCode !== 200) { assert.equal(r.statusCode, 400, q); continue; }
    const got = ids(r);
    assert.ok(!got.includes(V.id) && !got.includes(VM.id), `members${q} filtra a la víctima: ${got}`);
    for (const id of got) assert.ok([X.id, XM.id].includes(id), `members${q}: ${id}`);
  }
  // Un usuario sin legión solo se ve a sí mismo.
  const lone = await quickUser(s, 'solo');
  await as(s, lone)('PUT', `/api/docs/members/${lone.id}`, { profile: { nick: 'Solo' } });
  assert.deepEqual(ids(await as(s, lone)('GET', '/api/docs/members')), [lone.id]);
  await s.app.close();
});

test('listar colecciones ajenas por where como oráculo y feedback ajeno: denegado', async () => {
  const { s, V, X, gv } = await world();
  const x = as(s, X);
  for (const p of [`members/${V.id}/characters?where=at,>,0`, `legionData/${gv.key}/wall?orderBy=at,desc&limit=1`, 'feedback?limit=200']) {
    const r = await x('GET', `/api/docs/${p}`);
    assert.ok([403, 404].includes(r.statusCode), `GET ${p} -> ${r.statusCode}`);
  }
  await s.app.close();
});

test('legions: el documento público nunca expone material del código (codeHash, code_enc, proof)', async () => {
  const { s, V, X } = await world();
  const { code } = (await as(s, V)('GET', '/api/legions/mine/code')).json();
  for (const url of [`/api/docs/legions/${V.id}`, '/api/docs/legions', '/api/docs/legions?limit=200']) {
    const r = await as(s, X)('GET', url);
    assert.equal(r.statusCode, 200);
    assert.ok(!/codeHash|code_enc|proof|codeEnc/i.test(r.body), url);
    assert.ok(!r.body.includes(code), `${url} contiene el código`);
  }
  await s.app.close();
});
