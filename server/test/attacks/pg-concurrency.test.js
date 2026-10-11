// Carreras que solo se ven con un PostgreSQL real (bloqueos de fila, READ COMMITTED, pool de conexiones) y reloj
// real. Solo se ejecuta con TEST_DATABASE_URL (bash server/scripts/test-pg.sh); con pg-mem se omite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setup, apiUser, quickUser, as, legionWith, docOf, cookieVal, freshIp, seedBytes, cpDoc, REAL_PG, AT, RT } from './_lib.js';

const skip = !REAL_PG && 'requiere PostgreSQL real (TEST_DATABASE_URL, server/scripts/test-pg.sh)';
const h = (x) => createHash('sha256').update(x).digest('hex');

test('dos pestañas renuevan a la vez, 40 rondas con reloj real: nunca 401 ni familia revocada; un solo sucesor vigente', { skip }, async () => {
  const s = await setup({ __buildApp: { now: Date.now } });
  s.clock = null;
  const u = await apiUser(s, 'ana@example.com');
  let rt = u.rt;
  const failures = [];
  for (let i = 0; i < 40; i++) {
    const rs = await Promise.all([0, 1].map(() => s.req('POST', '/api/auth/refresh', { cookie: `${RT}=${rt}` })));
    const codes = rs.map((r) => r.statusCode);
    if (codes.some((c) => c !== 200)) { failures.push(`ronda ${i}: ${codes.join('/')}`); break; }
    const next = rs.map((r) => cookieVal(r, RT));
    if (next[0] !== next[1]) { failures.push(`ronda ${i}: dos sucesores distintos`); break; }
    rt = next[0];
    const fam = (await s.db.query('select family_id from refresh_tokens where token_hash = $1', [h(rt)])).rows[0].family_id;
    const live = (await s.db.query('select count(*)::int as n from refresh_tokens where family_id = $1 and used_at is null and revoked_at is null', [fam])).rows[0].n;
    if (live !== 1) { failures.push(`ronda ${i}: ${live} sucesores vigentes`); break; }
  }
  assert.deepEqual(failures, []);
  await s.app.close();
});

test('kick y rename simultáneos del mismo líder (20 rondas): ninguna expulsión ni nombre se pierde', { skip }, async () => {
  const s = await setup({ __buildApp: { now: Date.now } });
  s.clock = null;
  const L = await quickUser(s, 'lider');
  const members = [];
  for (let i = 0; i < 20; i++) members.push(await quickUser(s, `m${i}`));
  await legionWith(s, L, members);
  const lead = as(s, L);
  const problems = [];
  for (let i = 0; i < 20; i++) {
    const [k, r] = await Promise.all([
      lead('POST', '/api/legions/mine/kick', { uid: members[i].id }),
      lead('PATCH', '/api/legions/mine', { name: `Nombre ${i}` }),
    ]);
    if (k.statusCode !== 200 || r.statusCode !== 200) problems.push(`ronda ${i}: kick ${k.statusCode} rename ${r.statusCode} ${k.body} ${r.body}`);
    const l = await docOf(s, `legions/${L.id}`);
    if (!l.banned.includes(members[i].id)) problems.push(`ronda ${i}: expulsión perdida`);
    if (l.name !== `Nombre ${i}`) problems.push(`ronda ${i}: nombre perdido (${l.name})`);
    if ((await docOf(s, `members/${members[i].id}`)).legionId) problems.push(`ronda ${i}: el expulsado sigue apuntando a la legión`);
  }
  // Dos expulsiones simultáneas de miembros distintos: las dos quedan en banned.
  const a = await quickUser(s, 'xa'); const b = await quickUser(s, 'xb');
  const { code } = (await lead('GET', '/api/legions/mine/code')).json();
  for (const m of [a, b]) assert.equal((await as(s, m)('POST', '/api/legions/join', { code }, { ip: freshIp() })).statusCode, 200);
  const both = await Promise.all([lead('POST', '/api/legions/mine/kick', { uid: a.id }), lead('POST', '/api/legions/mine/kick', { uid: b.id })]);
  const l = await docOf(s, `legions/${L.id}`);
  if (!(l.banned.includes(a.id) && l.banned.includes(b.id))) problems.push(`kicks simultáneos: ${both.map((x) => x.statusCode)} banned=${l.banned.length}`);
  assert.deepEqual(problems, []);
  await s.app.close();
});

test('kick simultáneo con el expulsado uniéndose a OTRA legión (20 rondas): si el join responde 200, sigue en la otra legión', { skip }, async () => {
  const s = await setup({ __buildApp: { now: Date.now } });
  s.clock = null;
  const L1 = await quickUser(s, 'l1'); const L2 = await quickUser(s, 'l2');
  await legionWith(s, L1, []);
  const g2 = await legionWith(s, L2, [], 'Segunda');
  const problems = [];
  for (let i = 0; i < 20; i++) {
    const t = await quickUser(s, `t${i}`);
    const { code } = (await as(s, L1)('GET', '/api/legions/mine/code')).json();
    assert.equal((await as(s, t)('POST', '/api/legions/join', { code }, { ip: freshIp() })).statusCode, 200);
    const [k, j] = await Promise.all([
      as(s, L1)('POST', '/api/legions/mine/kick', { uid: t.id }),
      as(s, t)('POST', '/api/legions/join', { code: g2.code }, { ip: freshIp() }),
    ]);
    const m = await docOf(s, `members/${t.id}`);
    if (j.statusCode === 200 && m.legionId !== L2.id) problems.push(`ronda ${i}: join 200 pero legionId=${m.legionId} (kick ${k.statusCode})`);
  }
  assert.deepEqual(problems, []);
  await s.app.close();
});

test('kick simultáneo con el expulsado reentrando con el código antiguo (20 rondas): nunca queda dentro', { skip }, async () => {
  const s = await setup({ __buildApp: { now: Date.now } });
  s.clock = null;
  const L = await quickUser(s, 'lider');
  await legionWith(s, L, []);
  const problems = [];
  for (let i = 0; i < 20; i++) {
    const t = await quickUser(s, `r${i}`);
    const { code } = (await as(s, L)('GET', '/api/legions/mine/code')).json();
    assert.equal((await as(s, t)('POST', '/api/legions/join', { code }, { ip: freshIp() })).statusCode, 200);
    // El expulsado sale y vuelve a entrar en bucle mientras el líder lo expulsa.
    const [k, , j] = await Promise.all([
      as(s, L)('POST', '/api/legions/mine/kick', { uid: t.id }),
      as(s, t)('POST', '/api/legions/leave', {}),
      as(s, t)('POST', '/api/legions/join', { code }, { ip: freshIp() }),
    ]);
    const m = await docOf(s, `members/${t.id}`);
    const l = await docOf(s, `legions/${L.id}`);
    const inside = m.legionId === L.id && m.legionEpoch === l.epoch && !l.banned.includes(t.id);
    if (k.statusCode === 200 && inside) problems.push(`ronda ${i}: expulsado (kick 200) pero dentro (join ${j.statusCode})`);
  }
  assert.deepEqual(problems, []);
  await s.app.close();
});

test('cuota por usuario bajo escrituras simultáneas: no se superan 2 MB', { skip }, async () => {
  const s = await setup({ __buildApp: { now: Date.now } });
  s.clock = null;
  const u = await quickUser(s, 'cuota');
  await seedBytes(s, u.id, 2_000_000); // quedan ~97 KB: caben ~12 documentos de 7,7 KB en serie
  const put = (n) => s.req('PUT', `/api/docs/members/${u.id}/cp/b${n}`, { payload: cpDoc(n), cookie: `${AT}=${u.at}` });
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => put(i)));
  assert.ok(rs.every((r) => [200, 413].includes(r.statusCode)), rs.map((r) => r.statusCode).join(','));
  const rows = (await s.db.query("select data from docs where path = $1 or path like $2", [`members/${u.id}`, `members/${u.id}/%`])).rows;
  const total = rows.reduce((t, r) => t + Buffer.byteLength(JSON.stringify(r.data)), 0);
  assert.ok(total <= 2 * 1024 * 1024, `total ${total} bytes > 2 MB`);
  await s.app.close();
});
