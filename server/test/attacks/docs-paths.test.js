// Ataque: rutas manipuladas en /api/docs para salir de mi espacio o romper el servidor (SR-23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, quickUser, AT } from './_lib.js';

test('rutas con .., ., codificaciones, barras, vacíos, profundidad, longitud o NUL => 400 (nunca 200 ni 500)', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a'); const B = await quickUser(s, 'b');
  const me = `members/${A.id}`;
  const bad = [
    `${me}/characters/..`, `${me}/characters/.`, `${me}/../${B.id}`, `${me}/characters/%2e%2e`, `${me}/characters/%2E%2E`,
    `${me}/characters/%252e%252e`, `${me}%2Fcharacters%2Fx`, `${me}/characters/a%2Fb`, `members%2F${B.id}`,
    `${me}/characters/a%5Cb`, `${me}/characters/a\\b`, `${me}//characters/x`, `${me}/characters/x/`, `/${me}`,
    `${me}/characters/x%00`, `${me}/characters/%00`, `${me}/characters/x%`, `${me}/characters/%zz`, `${me}/characters/%C0%AE%C0%AE`,
    `${me}/characters/${'a'.repeat(129)}`, `${me}/characters/${'a'.repeat(128)}/x/y/z`, `${me}/cp/${'b'.repeat(500)}`,
    `${me}/characters/a.b`, `${me}/characters/a b`, `${me}/characters/%20`, `${me}/characters/%E2%80%AEx`,
    `${me}/characters/x;y`, `${me}/characters/${'%41'.repeat(200)}`, '', '%2e%2e', `${'a/'.repeat(500)}a`,
  ];
  for (const p of bad) {
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      const r = await s.req(method, `/api/docs/${p}`, { cookie: `${AT}=${A.at}`, payload: method === 'PUT' || method === 'PATCH' ? { name: 'x' } : undefined });
      assert.ok(r.statusCode !== 200 && r.statusCode < 500, `${method} /api/docs/${p} -> ${r.statusCode}`);
      assert.ok([400, 403, 404].includes(r.statusCode), `${method} /api/docs/${p} -> ${r.statusCode}`);
    }
  }
  // Ningún documento fuera de lo previsto se creó.
  const rows = (await s.db.query('select path from docs')).rows.map((r) => r.path);
  assert.deepEqual(rows, []);
  await s.app.close();
});

test('profundidad 7, segmento de 129 y longitud 513 => 400 exacto (SR-23)', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  const me = `members/${A.id}`;
  for (const p of [`${me}/settings/prefs/a/b/c`, `${me}/characters/${'a'.repeat(129)}`, `${me}/cp/${'c'.repeat(513 - me.length - 4)}`]) {
    const r = await s.req('GET', `/api/docs/${p}`, { cookie: `${AT}=${A.at}` });
    assert.equal(r.statusCode, 400, `${p.length} chars, ${p.split('/').length} segmentos -> ${r.statusCode}`);
  }
  await s.app.close();
});

test('raíces fuera de la lista blanca o colecciones internas => 403/400 (users, refresh_tokens, legion_codes, schema_version)', async () => {
  const s = await setup();
  const A = await quickUser(s, 'a');
  for (const p of ['users', `users/${A.id}`, 'refresh_tokens', 'legion_codes', 'email_tokens', 'schema_version', 'docs', 'Members', `MEMBERS/${A.id}`, 'legionData', 'legions/x/y']) {
    for (const method of ['GET', 'PUT']) {
      const r = await s.req(method, `/api/docs/${p}`, { cookie: `${AT}=${A.at}`, payload: method === 'PUT' ? { a: 1 } : undefined });
      assert.ok([400, 403].includes(r.statusCode), `${method} ${p} -> ${r.statusCode}`);
    }
  }
  await s.app.close();
});
