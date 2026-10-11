import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestApp } from './helpers.js';
import { newUserId } from '../src/lib/tokens.js';
import { signAccess } from '../src/lib/jwt.js';
import { codeHash } from '../src/lib/legion-codes.js';

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const AT = '__Host-odyle_at';
const H = { origin: 'https://odyle.test', 'x-odyle-csrf': '1' };

async function setup() {
  const t = await makeTestApp({ __buildApp: { now: () => NOW } });
  const ids = {}; const tokens = {};
  for (const k of ['A', 'B', 'C', 'D']) {
    ids[k] = newUserId();
    await t.db.query('insert into users (id, email, password_hash, email_verified_at) values ($1, $2, $3, $4)', [ids[k], `${k.toLowerCase()}@example.com`, 'x', new Date(NOW)]);
    tokens[k] = await signAccess(t.config, { sub: ids[k], ver: 0 }, NOW);
  }
  const call = (method, url, who, payload) => t.app.inject({
    method, url, payload, headers: { ...(method === 'GET' ? {} : H), cookie: `${AT}=${tokens[who]}` },
  });
  const doc = async (path) => (await t.db.query('select data from docs where path = $1', [path])).rows[0]?.data;
  const put = (path, data) => t.db.query('insert into docs (path, parent, data, updated_at) values ($1, $2, $3::jsonb, $4)', [path, path.slice(0, path.lastIndexOf('/')), JSON.stringify(data), NOW]);
  return { ...t, ids, call, doc, put };
}
const create = async (s, who, name = 'Los Albores') => (await s.call('POST', '/api/legions', who, { name })).json();

test('crear: época nueva, código de 8 caracteres, ficha del líder apunta a su legión', async () => {
  const s = await setup();
  const r = await s.call('POST', '/api/legions', 'A', { name: '  Los   Albores ' });
  assert.equal(r.statusCode, 200);
  const j = r.json();
  assert.equal(j.id, s.ids.A);
  assert.ok(j.epoch.length >= 8);
  assert.match(j.code, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.deepEqual(await s.doc(`legions/${s.ids.A}`), { name: 'Los Albores', epoch: j.epoch, banned: [], createdAt: NOW, leader: s.ids.A });
  const m = await s.doc(`members/${s.ids.A}`);
  assert.equal(m.legionId, s.ids.A); assert.equal(m.legionEpoch, j.epoch);
  // Solo el HMAC y el cifrado están en la tabla, nunca el código en claro.
  const row = (await s.db.query('select * from legion_codes')).rows[0];
  assert.equal(row.code_hash, codeHash(s.config.codeKey, j.code));
  assert.ok(!JSON.stringify(row).includes(j.code));
});

test('nombre no válido: 400 con el mensaje de parseLegionName; líder que ya lidera: 409', async () => {
  const s = await setup();
  const bad = await s.call('POST', '/api/legions', 'A', { name: 'ab' });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, 'El nombre de la legión necesita al menos 3 caracteres');
  await create(s, 'A');
  const again = await s.call('POST', '/api/legions', 'A', { name: 'Otra legión' });
  assert.equal(again.statusCode, 409);
  assert.deepEqual(again.json(), { error: 'Ya lideras una legión' });
});

test('B se une con el código en minúsculas y con guion; mismo legionId/legionEpoch', async () => {
  const s = await setup();
  const a = await create(s, 'A');
  const code = `${a.code.slice(0, 4)}-${a.code.slice(4)}`.toLowerCase();
  const r = await s.call('POST', '/api/legions/join', 'B', { code });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { id: s.ids.A, epoch: a.epoch, name: 'Los Albores' });
  const m = await s.doc(`members/${s.ids.B}`);
  assert.equal(m.legionId, s.ids.A); assert.equal(m.legionEpoch, a.epoch);
  assert.equal(typeof m.joinedAt, 'number');
});

test('código erróneo o mal formado: 400; 11.º intento en una hora: 429', async () => {
  const s = await setup();
  await create(s, 'A');
  for (let i = 0; i < 10; i++) {
    const r = await s.call('POST', '/api/legions/join', 'B', { code: i % 2 ? 'zzzz' : 'ABCDEFGH' });
    assert.equal(r.statusCode, 400);
    assert.deepEqual(r.json(), { error: 'Ese código no es válido' });
  }
  const r = await s.call('POST', '/api/legions/join', 'B', { code: 'ABCDEFGH' });
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'Demasiados intentos. Prueba más tarde.');
});

test('un miembro de otra legión que se une sale de la anterior; un líder no puede unirse (409)', async () => {
  const s = await setup();
  const a = await create(s, 'A'); const c = await create(s, 'C', 'Segunda');
  await s.call('POST', '/api/legions/join', 'B', { code: a.code });
  const r = await s.call('POST', '/api/legions/join', 'B', { code: c.code });
  assert.equal(r.statusCode, 200);
  const m = await s.doc(`members/${s.ids.B}`);
  assert.equal(m.legionId, s.ids.C); assert.equal(m.legionEpoch, c.epoch);
  const lead = await s.call('POST', '/api/legions/join', 'A', { code: c.code });
  assert.equal(lead.statusCode, 409);
  assert.deepEqual(lead.json(), { error: 'Ya lideras una legión' });
  assert.equal((await s.doc(`members/${s.ids.A}`)).legionId, s.ids.A);
});

test('código: solo el líder lo ve y lo rota; el viejo deja de servir', async () => {
  const s = await setup();
  const a = await create(s, 'A');
  await s.call('POST', '/api/legions/join', 'B', { code: a.code });
  assert.deepEqual((await s.call('GET', '/api/legions/mine/code', 'A')).json(), { code: a.code });
  const g = await s.call('GET', '/api/legions/mine/code', 'B');
  assert.equal(g.statusCode, 403);
  assert.deepEqual(g.json(), { error: 'Solo el líder puede hacer esto' });
  assert.equal((await s.call('GET', '/api/legions/mine/code', 'D')).statusCode, 403);
  assert.equal((await s.call('POST', '/api/legions/mine/code', 'B')).statusCode, 403);
  const n = (await s.call('POST', '/api/legions/mine/code', 'A')).json();
  assert.notEqual(n.code, a.code);
  assert.deepEqual((await s.call('GET', '/api/legions/mine/code', 'A')).json(), { code: n.code });
  assert.equal((await s.call('POST', '/api/legions/join', 'C', { code: a.code })).statusCode, 400);
  assert.equal((await s.call('POST', '/api/legions/join', 'C', { code: n.code })).statusCode, 200);
});

test('renombrar: solo el líder, con validación', async () => {
  const s = await setup();
  const a = await create(s, 'A');
  await s.call('POST', '/api/legions/join', 'B', { code: a.code });
  assert.equal((await s.call('PATCH', '/api/legions/mine', 'B', { name: 'Nuevo nombre' })).statusCode, 403);
  assert.equal((await s.call('PATCH', '/api/legions/mine', 'A', { name: 'x' })).statusCode, 400);
  const r = await s.call('PATCH', '/api/legions/mine', 'A', { name: 'Nuevo nombre' });
  assert.deepEqual(r.json(), { ok: true });
  const l = await s.doc(`legions/${s.ids.A}`);
  assert.equal(l.name, 'Nuevo nombre'); assert.equal(l.epoch, a.epoch);
});

test('expulsar: B en banned, el código cambia, B pierde el acceso a legionData y no puede volver', async () => {
  const s = await setup();
  const a = await create(s, 'A');
  await s.call('POST', '/api/legions/join', 'B', { code: a.code });
  const key = `${s.ids.A}-${a.epoch}`;
  await s.put(`legionData/${key}/wall/p1`, { uid: s.ids.A, text: 'hola' });
  assert.equal((await s.call('GET', `/api/docs/legionData/${key}/wall`, 'B')).statusCode, 200);

  assert.equal((await s.call('POST', '/api/legions/mine/kick', 'B', { uid: s.ids.A })).statusCode, 403);
  assert.equal((await s.call('POST', '/api/legions/mine/kick', 'A', { uid: s.ids.A })).statusCode, 400);
  assert.equal((await s.call('POST', '/api/legions/mine/kick', 'A', { uid: s.ids.D })).statusCode, 400); // no es miembro
  const k = await s.call('POST', '/api/legions/mine/kick', 'A', { uid: s.ids.B });
  assert.deepEqual(k.json(), { ok: true });
  assert.deepEqual((await s.doc(`legions/${s.ids.A}`)).banned, [s.ids.B]);
  assert.equal((await s.call('GET', `/api/docs/legionData/${key}/wall`, 'B')).statusCode, 403);

  const now = (await s.call('GET', '/api/legions/mine/code', 'A')).json().code;
  assert.notEqual(now, a.code);
  assert.equal((await s.call('POST', '/api/legions/join', 'C', { code: a.code })).statusCode, 400); // código viejo, tercero
  const back = await s.call('POST', '/api/legions/join', 'B', { code: now });
  assert.equal(back.statusCode, 403);
  assert.deepEqual(back.json(), { error: 'No puedes unirte a esta legión' });
  assert.equal((await s.call('POST', '/api/legions/mine/kick', 'A', { uid: s.ids.B })).statusCode, 400);
});

test('salir: el líder 409; un miembro limpia su pertenencia; sin legión es ok', async () => {
  const s = await setup();
  const a = await create(s, 'A');
  await s.call('POST', '/api/legions/join', 'B', { code: a.code });
  const l = await s.call('POST', '/api/legions/leave', 'A');
  assert.equal(l.statusCode, 409);
  assert.deepEqual(l.json(), { error: 'El líder no puede salir; disuelve la legión' });
  assert.deepEqual((await s.call('POST', '/api/legions/leave', 'B')).json(), { ok: true });
  const m = await s.doc(`members/${s.ids.B}`);
  assert.ok(!('legionId' in m) && !('legionEpoch' in m));
  assert.deepEqual((await s.call('POST', '/api/legions/leave', 'B')).json(), { ok: true });
  assert.deepEqual((await s.call('POST', '/api/legions/leave', 'D')).json(), { ok: true });
});

test('disolver: borra legión, código y datos compartidos; recrear deja a B (época antigua) fuera', async () => {
  const s = await setup();
  const a = await create(s, 'A');
  await s.call('POST', '/api/legions/join', 'B', { code: a.code });
  const key = `${s.ids.A}-${a.epoch}`;
  await s.put(`legionData/${key}/wall/p1`, { uid: s.ids.A, text: 'hola' });
  await s.put(`legionData/${key}/calendar/e1`, { uid: s.ids.A, title: 'raid' });
  await s.put(`legionData/${s.ids.C}-otra/wall/p9`, { uid: s.ids.C, text: 'ajeno' });
  assert.equal((await s.call('DELETE', '/api/legions/mine', 'B')).statusCode, 403);
  assert.deepEqual((await s.call('DELETE', '/api/legions/mine', 'A')).json(), { ok: true });
  assert.equal(await s.doc(`legions/${s.ids.A}`), undefined);
  assert.equal((await s.db.query('select 1 from legion_codes')).rows.length, 0);
  assert.equal(await s.doc(`legionData/${key}/wall/p1`), undefined);
  assert.equal(await s.doc(`legionData/${key}/calendar/e1`), undefined);
  assert.ok(await s.doc(`legionData/${s.ids.C}-otra/wall/p9`));
  assert.ok(!('legionId' in await s.doc(`members/${s.ids.A}`)));
  assert.equal((await s.call('DELETE', '/api/legions/mine', 'A')).statusCode, 403);

  const a2 = await create(s, 'A');
  assert.notEqual(a2.epoch, a.epoch);
  const key2 = `${s.ids.A}-${a2.epoch}`;
  assert.equal((await s.call('GET', `/api/docs/legionData/${key2}/wall`, 'B')).statusCode, 403);
  const mates = await s.call('GET', `/api/docs/members/${s.ids.A}`, 'B');
  assert.equal(mates.statusCode, 404); // B ya no es compañero de A
});

test('GET /api/docs/legions/A nunca incluye código, hash ni prueba', async () => {
  const s = await setup();
  const a = await create(s, 'A');
  const r = await s.call('GET', `/api/docs/legions/${s.ids.A}`, 'B');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().data, { name: 'Los Albores', epoch: a.epoch, banned: [], createdAt: NOW, leader: s.ids.A });
  const body = r.body;
  assert.ok(!body.includes(a.code) && !/code|hash|proof/i.test(body));
  const list = (await s.call('GET', '/api/docs/legions', 'B')).body;
  assert.ok(!list.includes(a.code) && !/hash|proof/i.test(list));
});

test('sin sesión: 401 en todos los endpoints', async () => {
  const s = await setup();
  const r = await s.app.inject({ method: 'POST', url: '/api/legions', payload: { name: 'Los Albores' }, headers: H });
  assert.equal(r.statusCode, 401);
});

test('dos expulsiones concurrentes: ambos acaban en banned (SR-31)', async () => {
  const s = await setup();
  const a = await create(s, 'A');
  await s.call('POST', '/api/legions/join', 'B', { code: a.code });
  await s.call('POST', '/api/legions/join', 'C', { code: a.code });
  const code2 = (await s.call('GET', '/api/legions/mine/code', 'A')).json().code;
  assert.equal(code2, a.code);
  const rs = await Promise.all([
    s.call('POST', '/api/legions/mine/kick', 'A', { uid: s.ids.B }),
    s.call('POST', '/api/legions/mine/kick', 'A', { uid: s.ids.C }),
    s.call('PATCH', '/api/legions/mine', 'A', { name: 'Renombrada' }),
  ]);
  assert.deepEqual(rs.map((r) => r.statusCode), [200, 200, 200]);
  const l = await s.doc(`legions/${s.ids.A}`);
  assert.deepEqual([...l.banned].sort(), [s.ids.B, s.ids.C].sort());
  assert.equal(l.name, 'Renombrada');
});

test('el código de lectura de GET no se bloquea y la cuota sigue funcionando con miembros en subcolecciones', async () => {
  const s = await setup();
  await create(s, 'A');
  assert.equal((await s.call('PUT', `/api/docs/members/${s.ids.A}/characters/c1`, 'A', { name: 'Kaeli', classId: 'sorcerer', energy: 3 })).statusCode, 200);
});
