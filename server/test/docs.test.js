import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestApp } from './helpers.js';
import { newUserId } from '../src/lib/tokens.js';
import { signAccess } from '../src/lib/jwt.js';
import { safeMerge } from '../src/lib/merge.js';
import { validateDoc } from '../src/lib/validate.js';

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const AT = '__Host-odyle_at';
const H = { origin: 'https://odyle.test', 'x-odyle-csrf': '1' };

// Usuarios A, B (misma legión L=A), C (legión propia), D sin legión. Todo sembrado por SQL.
async function setup({ adminVerified = true, adminIsolated = false, mode = 'full' } = {}) {
  const ids = { A: newUserId(), B: newUserId(), C: newUserId(), D: newUserId(), ADM: newUserId() };
  const t = await makeTestApp({ ADMIN_USER_ID: ids.ADM, EMAIL_MODE: mode, __buildApp: { now: () => NOW } });
  const { db, config } = t;
  const put = (path, data) => db.query(
    'insert into docs (path, parent, data, updated_at, sort_at) values ($1, $2, $3::jsonb, $4, $5)',
    [path, path.slice(0, path.lastIndexOf('/')), JSON.stringify(data), NOW, typeof data.at === 'number' ? data.at : null]);
  for (const [k, id] of Object.entries(ids)) {
    await db.query('insert into users (id, email, password_hash, email_verified_at) values ($1, $2, $3, $4)',
      [id, `${k.toLowerCase()}@example.com`, 'x', k === 'ADM' && !adminVerified ? null : new Date(NOW)]);
  }
  const legion = (id, epoch, extra = {}) => put(`legions/${id}`, { name: `Legión ${id.slice(2, 6)}`, epoch, banned: [], createdAt: 1, leader: id, codeHash: 'SECRETHASH', proof: 'SECRETPROOF', ...extra });
  await legion(ids.A, 'e1');
  await legion(ids.C, 'c1');
  const member = (id, legionId, legionEpoch, nick) => put(`members/${id}`, { joinedAt: 1, profile: { nick, server: 's', bio: '', faction: 'elyos', mainCharId: null }, ...(legionId ? { legionId, legionEpoch } : {}) });
  await member(ids.A, ids.A, 'e1', 'Ana');
  await member(ids.B, ids.A, 'e1', 'Beto');
  await member(ids.C, ids.C, 'c1', 'Cris');
  await member(ids.D, null, null, 'Dani');
  const tokens = {};
  for (const [k, id] of Object.entries(ids)) tokens[k] = await signAccess(config, { sub: id, ver: 0 }, NOW);
  const key = `${ids.A}-e1`;
  const call = (method, url, who, payload, headers = {}) => t.app.inject({
    method, url: `/api/docs/${url}`, payload,
    headers: { ...(method === 'GET' ? {} : H), ...(who ? { cookie: `${AT}=${tokens[who]}` } : {}), ...headers },
  });
  const rawBody = (method, url, who, body) => call(method, url, who, body, { 'content-type': 'application/json' });
  return { ...t, ids, key, put, call, rawBody, tokens };
}
const get = (s, url, who) => s.call('GET', url, who);

test('A escribe y lee su personaje; B no escribe; B lo lee solo si comparten legión; C no lo ve (404)', async () => {
  const s = await setup();
  const p = `members/${s.ids.A}/characters/c1`;
  const w = await s.call('PUT', p, 'A', { name: 'Kaeli', classId: 'sorcerer', energy: 3 });
  assert.equal(w.statusCode, 200);
  assert.deepEqual(w.json(), { ok: true, updatedAt: NOW });
  const r = await get(s, p, 'A');
  assert.deepEqual(r.json(), { id: 'c1', exists: true, data: { name: 'Kaeli', classId: 'sorcerer', energy: 3 } });
  assert.equal((await s.call('PUT', p, 'B', { name: 'x' })).statusCode, 403);
  assert.equal((await s.call('DELETE', p, 'B')).statusCode, 403);
  assert.equal((await get(s, p, 'B')).statusCode, 200); // misma legión
  const c = await get(s, p, 'C');
  assert.equal(c.statusCode, 404);
  assert.deepEqual(c.json(), { error: 'No encontrado' });
  assert.equal((await get(s, `members/${s.ids.A}/characters/nope`, 'C')).statusCode, 404); // no revela existencia
  assert.equal((await get(s, p, 'D')).statusCode, 404);
  assert.equal((await get(s, `members/${s.ids.A}/characters/nope`, 'A')).json().exists, false);
  assert.equal((await get(s, p)).statusCode, 401);
  await s.app.close();
});

test('legionId/legionEpoch: PATCH y PUT → 403, PUT conserva los valores guardados', async () => {
  const s = await setup();
  const me = `members/${s.ids.D}`;
  assert.equal((await s.call('PATCH', me, 'D', { legionId: 'x' })).statusCode, 403);
  assert.equal((await s.call('PATCH', me, 'D', { legionEpoch: 'x' })).statusCode, 403);
  assert.equal((await s.call('PUT', me, 'D', { joinedAt: 2, legionId: 'x' })).statusCode, 403);
  assert.equal((await s.call('PATCH', `members/${s.ids.B}`, 'D', { joinedAt: 2 })).statusCode, 403);
  const own = `members/${s.ids.A}`;
  const put = await s.call('PUT', own, 'A', { joinedAt: 9, profile: { nick: 'Nuevo', server: 'S', bio: 'hola', faction: 'asmodian', mainCharId: null } });
  assert.equal(put.statusCode, 200);
  const d = (await get(s, own, 'A')).json().data;
  assert.equal(d.legionId, s.ids.A);
  assert.equal(d.legionEpoch, 'e1');
  assert.equal(d.profile.nick, 'Nuevo');
  assert.equal((await s.call('PATCH', own, 'A', { profile: { bio: 'otra' } })).statusCode, 200);
  const d2 = (await get(s, own, 'A')).json().data;
  assert.equal(d2.profile.bio, 'otra'); assert.equal(d2.profile.nick, 'Nuevo'); assert.equal(d2.legionId, s.ids.A);
  assert.equal((await s.call('DELETE', own, 'A')).statusCode, 403);
  assert.equal((await s.call('PUT', own, 'A', { joinedAt: 1, mystery: 1 })).statusCode, 400);
  await s.app.close();
});

test('PATCH inexistente → 404; PATCH fusiona objetos y sustituye listas', async () => {
  const s = await setup();
  const p = `members/${s.ids.A}/settings/prefs`;
  const miss = await s.call('PATCH', p, 'A', { lang: 'es' });
  assert.equal(miss.statusCode, 404);
  assert.deepEqual(miss.json(), { error: 'No existe' });
  await s.call('PUT', p, 'A', { quietStart: '00:00', favEvents: ['a', 'b'], lang: 'es' });
  await s.call('PATCH', p, 'A', { favEvents: ['c'], faction: 'elyos' });
  assert.deepEqual((await get(s, p, 'A')).json().data, { quietStart: '00:00', favEvents: ['c'], lang: 'es', faction: 'elyos' });
  await s.app.close();
});

test('__proto__ / constructor en cualquier nivel → 400 sin contaminar', async () => {
  const s = await setup();
  const p = `members/${s.ids.A}/settings/stats`;
  await s.call('PUT', p, 'A', { daysLog: {} });
  for (const body of [
    '{"__proto__":{"polluted":1}}',
    '{"daysLog":{"__proto__":{"polluted":1}}}',
    '{"a":{"constructor":{"prototype":{"polluted":1}}}}',
    '{"a":{"b":[{"constructor":1}]}}',
    '{"prototype":1}',
  ]) {
    assert.equal((await s.rawBody('PATCH', p, 'A', body)).statusCode, 400, body);
    assert.equal((await s.rawBody('PUT', p, 'A', body)).statusCode, 400, body);
  }
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  await s.app.close();
});

test('rutas raras → 400 (nunca 500); raíz desconocida → 403', async () => {
  const s = await setup();
  const a = s.ids.A;
  for (const p of [
    `members/${a}/characters/..`, `members/${a}/characters/%2e%2e`, `members/${a}/characters/a%2Fb`, `members/${a}/characters/a%252e`,
    `members/${a}/characters/a$b`, `members/${a}/characters/`, `members//x`, `members/${a}/characters/c%00`, `members/${a}/characters/a%5Cb`,
    `members/${a}/characters/c.1`, 'a/b/c/d/e/f/g', 'x/%E0%A4%A', `members/${a}/characters/${'a'.repeat(600)}`,
  ]) {
    const r = await get(s, p, 'A');
    assert.equal(r.statusCode, 400, p);
    assert.equal((await s.call('PUT', p, 'A', { name: 'x' })).statusCode, 400, p);
  }
  const nine = Array.from({ length: 9 }, (_, i) => `s${i}`).join('/');
  assert.equal((await get(s, nine, 'A')).statusCode, 400);
  assert.equal((await get(s, 'data/users/x', 'A')).statusCode, 403);
  assert.equal((await get(s, `settings/${a}`, 'A')).statusCode, 403);
  assert.equal((await s.call('PUT', 'legions/zzz', 'A', { name: 'x' })).statusCode, 403);
  assert.equal((await get(s, `members/${a}/mystery/1`, 'A')).statusCode, 403);
  await s.app.close();
});

test('documento grande → 413; limit y consultas inválidas → 400', async () => {
  const s = await setup();
  const p = `members/${s.ids.A}/settings/presets`;
  const big = (n) => ({ items: Array.from({ length: n }, () => ({ a: 'x'.repeat(400) })) });
  assert.equal((await s.call('PUT', p, 'A', big(190))).statusCode, 413); // > cuerpo máximo
  assert.equal((await s.call('PUT', p, 'A', big(166))).statusCode, 413); // ≈ 68 KB: por encima del cuerpo máximo
  assert.equal((await s.call('PUT', p, 'A', big(100))).statusCode, 200);
  assert.equal(validateDoc(`members/${s.ids.A}/settings/presets`, big(166)) !== null, true);
  const col = `members/${s.ids.A}/characters`;
  for (const q of ['limit=500', 'limit=0', 'limit=-1', 'limit=1.5', 'limit=abc', 'where=name,==,1', 'where=at,~,1', 'where=at,>,x',
    'orderBy=name,asc', 'orderBy=at,up', 'foo=1', 'where=at,>', 'where=at,>,1&where=at,<,2&where=at,<,3']) {
    assert.equal((await get(s, `${col}?${q}`, 'A')).statusCode, 400, q);
  }
  await s.app.close();
});

test('muro: miembro escribe, otro usuario 403, ajeno no se borra, autor sí; uid del cliente se ignora', async () => {
  const s = await setup();
  const w = `legionData/${s.key}/wall`;
  const ok = await s.call('PUT', `${w}/m1`, 'A', { at: 100, text: 'hola', uid: s.ids.B });
  assert.equal(ok.statusCode, 200);
  assert.equal((await get(s, `${w}/m1`, 'A')).json().data.uid, s.ids.A); // sobrescrito por la sesión
  assert.equal((await s.call('PUT', `${w}/m2`, 'C', { at: 1, text: 'intruso' })).statusCode, 403);
  assert.equal((await get(s, `${w}/m1`, 'C')).statusCode, 403);
  assert.equal((await get(s, w, 'D')).statusCode, 403);
  assert.equal((await s.call('DELETE', `${w}/m1`, 'B')).statusCode, 403);
  assert.equal((await s.call('PUT', `${w}/m1`, 'B', { at: 1, text: 'pisado' })).statusCode, 403);
  assert.equal((await s.call('PATCH', `${w}/m1`, 'B', { text: 'pisado' })).statusCode, 403);
  assert.equal((await get(s, `${w}/m1`, 'B')).json().data.text, 'hola');
  const b = await s.call('PUT', `${w}/m3`, 'B', { at: 200, text: 'de B', uid: s.ids.A });
  assert.equal(b.statusCode, 200);
  assert.equal((await get(s, `${w}/m3`, 'A')).json().data.uid, s.ids.B);
  // el autor edita; el uid del cuerpo en PATCH se ignora
  assert.equal((await s.call('PATCH', `${w}/m3`, 'B', { text: 'editado', uid: s.ids.A })).statusCode, 200);
  const e = (await get(s, `${w}/m3`, 'A')).json().data;
  assert.equal(e.text, 'editado'); assert.equal(e.uid, s.ids.B);
  assert.equal((await s.call('DELETE', `${w}/m1`, 'A')).statusCode, 200);
  assert.equal((await get(s, `${w}/m1`, 'A')).json().exists, false);
  await s.app.close();
});

test('calendario: autor fijado por el servidor; RSVP de no autor solo con su propio uid', async () => {
  const s = await setup();
  const c = `legionData/${s.key}/calendar/e1`;
  assert.equal((await s.call('PUT', c, 'A', { title: 'Raid', at: 1000, durationMin: 60, uid: s.ids.C, rsvp: {} })).statusCode, 200);
  assert.equal((await get(s, c, 'B')).json().data.uid, s.ids.A);
  // B (no autor) edita el título: 403
  assert.equal((await s.call('PATCH', c, 'B', { title: 'Mío' })).statusCode, 403);
  // RSVP propio permitido
  assert.equal((await s.call('PATCH', c, 'B', { rsvp: { [s.ids.B]: 'yes' } })).statusCode, 200);
  assert.deepEqual((await get(s, c, 'A')).json().data.rsvp, { [s.ids.B]: 'yes' });
  // RSVP en nombre de otro, valor inválido, campos extra, PUT y DELETE: no
  assert.equal((await s.call('PATCH', c, 'B', { rsvp: { [s.ids.A]: 'no' } })).statusCode, 403);
  assert.equal((await s.call('PATCH', c, 'B', { rsvp: { [s.ids.B]: 'yes', [s.ids.A]: 'no' } })).statusCode, 403);
  assert.equal((await s.call('PATCH', c, 'B', { rsvp: { [s.ids.B]: 'quizás' } })).statusCode, 403);
  assert.equal((await s.call('PATCH', c, 'B', { rsvp: { [s.ids.B]: 'no' }, title: 'x' })).statusCode, 403);
  assert.equal((await s.call('PUT', c, 'B', { title: 'x', at: 1, durationMin: 10 })).statusCode, 403);
  assert.equal((await s.call('DELETE', c, 'B')).statusCode, 403);
  assert.equal((await s.call('PATCH', c, 'C', { rsvp: { [s.ids.C]: 'yes' } })).statusCode, 403); // otra legión
  // validaciones
  assert.equal((await s.call('PUT', `legionData/${s.key}/calendar/e2`, 'A', { title: 'x'.repeat(61), at: 1, durationMin: 10 })).statusCode, 400);
  assert.equal((await s.call('PUT', `legionData/${s.key}/calendar/e2`, 'A', { title: 'x', at: 1, durationMin: 4 })).statusCode, 400);
  assert.equal((await s.call('PUT', `legionData/${s.key}/calendar/e2`, 'A', { title: 'x', at: 1, durationMin: 601 })).statusCode, 400);
  await s.app.close();
});

test('legions: cualquiera con sesión lee nombre y época, nunca codeHash/proof; nadie escribe', async () => {
  const s = await setup();
  for (const who of ['A', 'C', 'D']) {
    const r = await get(s, `legions/${s.ids.A}`, who);
    assert.equal(r.statusCode, 200);
    const d = r.json().data;
    assert.equal(d.epoch, 'e1'); assert.ok(d.name);
    assert.deepEqual(Object.keys(d).sort(), ['banned', 'createdAt', 'epoch', 'leader', 'name']);
    assert.ok(!/SECRET|codeHash|proof/.test(r.body));
  }
  const list = await get(s, 'legions', 'D');
  assert.equal(list.json().docs.length, 2);
  assert.ok(!/SECRET|codeHash|proof/.test(list.body));
  assert.equal((await s.call('PUT', `legions/${s.ids.A}`, 'A', { name: 'x', epoch: 'z' })).statusCode, 403);
  assert.equal((await s.call('PATCH', `legions/${s.ids.A}`, 'A', { name: 'x' })).statusCode, 403);
  assert.equal((await s.call('DELETE', `legions/${s.ids.A}`, 'A')).statusCode, 403);
  assert.equal((await s.call('PUT', `legions/${s.ids.D}`, 'D', { name: 'x', epoch: 'z' })).statusCode, 403);
  await s.app.close();
});

test('feedback: solo el dueño escribe; lee el dueño y el administrador verificado (SR-21)', async () => {
  const s = await setup();
  const f = `feedback/${s.ids.A}`;
  assert.equal((await s.call('PUT', f, 'A', { items: [{ at: 1, text: 'mejora\nlínea 2' }] })).statusCode, 200);
  assert.equal((await s.call('PUT', f, 'B', { items: [] })).statusCode, 403);
  assert.equal((await get(s, f, 'B')).statusCode, 403);
  assert.equal((await get(s, f, 'A')).statusCode, 200);
  assert.equal((await get(s, f, 'ADM')).json().data.items[0].text, 'mejora\nlínea 2');
  assert.equal((await get(s, 'feedback', 'B')).statusCode, 403);
  assert.equal((await get(s, 'feedback', 'ADM')).json().docs.length, 1);
  assert.equal((await s.call('PUT', f, 'A', { items: [{ at: 1, text: 'x'.repeat(1001) }] })).statusCode, 400);
  await s.app.close();
  const u = await setup({ adminVerified: false });
  await u.call('PUT', `feedback/${u.ids.A}`, 'A', { items: [] });
  assert.equal((await get(u, `feedback/${u.ids.A}`, 'ADM')).statusCode, 403);
  assert.equal((await get(u, 'feedback', 'ADM')).statusCode, 403);
  await u.app.close();
  // owner-only: no hay correos de verificación, basta el id (decisión del controlador)
  const o = await setup({ adminVerified: false, mode: 'owner-only' });
  await o.call('PUT', `feedback/${o.ids.A}`, 'A', { items: [] });
  assert.equal((await get(o, `feedback/${o.ids.A}`, 'ADM')).statusCode, 200);
  assert.equal((await get(o, 'feedback', 'ADM')).statusCode, 200);
  assert.equal((await get(o, 'feedback', 'B')).statusCode, 403);
  await o.app.close();
});

test('SR-4: \\u0000, control y marcas bidi se limpian (sin 500); \\n solo en notas/muro/feedback', async () => {
  const s = await setup();
  const p = `members/${s.ids.A}/characters/c1`;
  const w = await s.call('PUT', p, 'A', { name: 'Ka\u0000e\u202Eli\u2066\u0007\n', classId: 'a', notes: 'l1\nl2\u0000\t' });
  assert.equal(w.statusCode, 200);
  assert.deepEqual((await get(s, p, 'A')).json().data, { name: 'Kaeli', classId: 'a', notes: 'l1\nl2' });
  const raw = await s.rawBody('PUT', p, 'A', '{"name":"a\\u0000b","classId":"x"}');
  assert.equal(raw.statusCode, 200);
  assert.equal((await get(s, p, 'A')).json().data.name, 'ab');
  assert.equal(validateDoc(p, { name: '\u0000\u202E' }), 'Valor no válido en «name»'); // queda vacío
  await s.app.close();
});

test('límites de texto por colección', async () => {
  const s = await setup();
  const ch = (d) => s.call('PUT', `members/${s.ids.A}/characters/c1`, 'A', { classId: 'a', ...d });
  assert.equal((await ch({ name: 'x'.repeat(60) })).statusCode, 200);
  assert.equal((await ch({ name: 'x'.repeat(61) })).statusCode, 400);
  assert.equal((await ch({ name: 'x', notes: 'n'.repeat(500) })).statusCode, 200);
  assert.equal((await ch({ name: 'x', notes: 'n'.repeat(501) })).statusCode, 400);
  const w = (text) => s.call('PUT', `legionData/${s.key}/wall/m`, 'A', { at: 1, text });
  assert.equal((await w('t'.repeat(280))).statusCode, 200);
  assert.equal((await w('t'.repeat(281))).statusCode, 400);
  const prof = (o) => s.call('PUT', `members/${s.ids.A}`, 'A', { joinedAt: 1, profile: { nick: 'ab', server: '', bio: '', faction: 'elyos', ...o } });
  assert.equal((await prof({ nick: 'n'.repeat(20) })).statusCode, 200);
  assert.equal((await prof({ nick: 'n'.repeat(21) })).statusCode, 400);
  assert.equal((await prof({ server: 's'.repeat(21) })).statusCode, 400);
  assert.equal((await prof({ bio: 'b'.repeat(81) })).statusCode, 400);
  assert.equal((await prof({ faction: 'otra' })).statusCode, 400);
  const pre = (name) => s.call('PUT', `members/${s.ids.A}/settings/presets`, 'A', { items: [{ id: 'p', name, cost: 1 }] });
  assert.equal((await pre('n'.repeat(60))).statusCode, 200);
  assert.equal((await pre('n'.repeat(61))).statusCode, 400);
  assert.equal((await s.call('PUT', `members/${s.ids.A}/settings/prefs`, 'A', { lang: 'l'.repeat(501) })).statusCode, 400);
  await s.app.close();
});

test('account: solo normal|premium', async () => {
  const s = await setup();
  const p = `members/${s.ids.A}/characters/c1`;
  for (const account of ['normal', 'premium']) {
    assert.equal((await s.call('PUT', p, 'A', { name: 'x', account })).statusCode, 200);
    assert.equal((await get(s, p, 'A')).json().data.account, account);
  }
  const bad = await s.call('PUT', p, 'A', { name: 'x', classId: 'a', energy: 'zz' });
  for (const account of ['gold', 1, null]) {
    const r = await s.call('PUT', p, 'A', { name: 'x', account });
    assert.equal(r.statusCode, bad.statusCode);
    assert.deepEqual(r.json(), { error: 'Valor no válido en «account»' });
  }
  await s.app.close();
});

test('profundidad > 8, > 500 claves, cuerpo no objeto, claves de control → 400', async () => {
  const s = await setup();
  const p = `members/${s.ids.A}/settings/presets`;
  let deep = { v: 1 }; for (let i = 0; i < 8; i++) deep = { d: deep };
  assert.equal((await s.call('PUT', p, 'A', { items: [deep] })).statusCode, 400);
  let ok = { v: 1 }; for (let i = 0; i < 4; i++) ok = { d: ok };
  assert.equal((await s.call('PUT', p, 'A', { items: [ok] })).statusCode, 200);
  assert.equal((await s.call('PUT', p, 'A', { items: [Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`k${i}`, 1]))] })).statusCode, 400);
  for (const body of ['[]', 'null', '"x"', '5']) assert.equal((await s.rawBody('PUT', p, 'A', body)).statusCode, 400, body);
  assert.equal((await s.rawBody('PUT', p, 'A', '{"a\\u0000b":1}')).statusCode, 400);
  await s.app.close();
});

test('cuota: 500 documentos o 2 MB → 413 (SR-26)', async () => {
  const s = await setup();
  for (let i = 0; i < 499; i++) await s.put(`members/${s.ids.A}/events/e${i}`, { at: i, kind: 'k' });
  assert.equal((await s.call('PUT', `members/${s.ids.A}/events/ok`, 'A', { at: 1, kind: 'k' })).statusCode, 200); // 500
  const r = await s.call('PUT', `members/${s.ids.A}/events/extra`, 'A', { at: 1, kind: 'k' });
  assert.equal(r.statusCode, 413);
  assert.deepEqual(r.json(), { error: 'Has superado el espacio disponible' });
  assert.equal((await s.call('PUT', `members/${s.ids.A}/events/ok`, 'A', { at: 2, kind: 'k' })).statusCode, 200); // reemplazar cabe
  assert.equal((await s.call('DELETE', `members/${s.ids.A}/events/ok`, 'A')).statusCode, 200);
  assert.equal((await s.call('PUT', `members/${s.ids.A}/events/extra`, 'A', { at: 1, kind: 'k' })).statusCode, 200);
  // bytes: B llena ~2 MB con documentos de ~60 KB
  const blob = { items: Array.from({ length: 110 }, () => ({ a: 'x'.repeat(500) })) };
  for (let i = 0; i < 38; i++) await s.put(`members/${s.ids.B}/characters/p${i}`, blob);
  assert.equal((await s.call('PUT', `members/${s.ids.B}/settings/presets`, 'B', blob)).statusCode, 413);
  assert.equal((await s.call('PUT', `members/${s.ids.B}/settings/prefs`, 'B', { lang: 'es' })).statusCode, 413); // sigue sin espacio
  assert.equal((await s.call('DELETE', `members/${s.ids.B}/characters/p0`, 'B')).statusCode, 200);
  assert.equal((await s.call('PUT', `members/${s.ids.B}/settings/prefs`, 'B', { lang: 'es' })).statusCode, 200);
  await s.app.close();
});

test('colección: where/orderBy/limit en orden y filtrado', async () => {
  const s = await setup();
  const col = `members/${s.ids.A}/events`;
  for (const [id, at] of [['a', 50], ['b', 300], ['c', 200], ['d', 100], ['e', 150]]) {
    assert.equal((await s.call('PUT', `${col}/${id}`, 'A', { at, kind: 'k' })).statusCode, 200);
  }
  const ids = async (q) => (await get(s, `${col}?${q}`, 'A')).json().docs.map((d) => d.id);
  assert.deepEqual(await ids('where=at,>,100&orderBy=at,desc&limit=2'), ['b', 'c']);
  assert.deepEqual(await ids('where=at,>=,100&orderBy=at,asc'), ['d', 'e', 'c', 'b']);
  assert.deepEqual(await ids('where=at,<,100&orderBy=at'), ['a']);
  assert.deepEqual(await ids('where=at,==,150'), ['e']);
  assert.deepEqual(await ids('where=at,!=,150&orderBy=at,asc&limit=3'), ['a', 'd', 'c']);
  assert.deepEqual(await ids('where=at,>,50&where=at,<=,200&orderBy=at,asc'), ['d', 'e', 'c']);
  assert.equal((await get(s, `${col}?limit=200`, 'A')).json().docs.length, 5);
  await s.app.close();
});

test('listar members devuelve solo al usuario y a sus compañeros de legión', async () => {
  const s = await setup();
  const ids = async (who) => (await get(s, 'members', who)).json().docs.map((d) => d.id).sort();
  assert.deepEqual(await ids('A'), [s.ids.A, s.ids.B].sort());
  assert.deepEqual(await ids('B'), [s.ids.A, s.ids.B].sort());
  assert.deepEqual(await ids('C'), [s.ids.C]);
  assert.deepEqual(await ids('D'), [s.ids.D]);
  assert.deepEqual((await get(s, 'members?limit=1', 'A')).json().docs.length, 1);
  assert.equal((await get(s, `members/${s.ids.C}/characters`, 'A')).statusCode, 404);
  assert.equal((await get(s, `members/${s.ids.C}`, 'A')).statusCode, 404);
  await s.app.close();
});

test('expulsado o con legión nueva: la siguiente lectura de legionData da 403 (SR-30)', async () => {
  const s = await setup();
  const w = `legionData/${s.key}/wall`;
  await s.call('PUT', `${w}/m1`, 'A', { at: 1, text: 'hola' });
  assert.equal((await get(s, w, 'B')).statusCode, 200);
  assert.equal((await get(s, `members/${s.ids.A}`, 'B')).statusCode, 200);
  // expulsión: B queda en banned
  await s.db.query('update docs set data = $1::jsonb where path = $2', [JSON.stringify({ name: 'L', epoch: 'e1', banned: [s.ids.B], createdAt: 1, leader: s.ids.A }), `legions/${s.ids.A}`]);
  assert.equal((await get(s, w, 'B')).statusCode, 403);
  assert.equal((await s.call('PUT', `${w}/m2`, 'B', { at: 1, text: 'x' })).statusCode, 403);
  assert.equal((await get(s, `members/${s.ids.A}`, 'B')).statusCode, 404);
  assert.equal((await get(s, w, 'A')).statusCode, 200);
  // disolver y recrear: época nueva, la clave vieja deja de valer también para A y para B
  await s.db.query('update docs set data = $1::jsonb where path = $2', [JSON.stringify({ name: 'L', epoch: 'e2', banned: [], createdAt: 1, leader: s.ids.A }), `legions/${s.ids.A}`]);
  assert.equal((await get(s, w, 'A')).statusCode, 403);
  assert.equal((await get(s, w, 'B')).statusCode, 403);
  await s.app.close();
});

test('escrituras limitadas a 300/min por usuario (SR-17)', async () => {
  const s = await setup();
  const f = `feedback/${s.ids.A}`;
  let last;
  for (let i = 0; i < 300; i++) { last = await s.call('DELETE', f, 'A'); assert.equal(last.statusCode, 200); }
  const over = await s.call('DELETE', f, 'A');
  assert.equal(over.statusCode, 429);
  assert.equal((await s.call('DELETE', `feedback/${s.ids.B}`, 'B')).statusCode, 200); // otro usuario no se ve afectado
  assert.equal((await get(s, f, 'A')).statusCode, 200); // las lecturas no cuentan
  await s.app.close();
});

test('exigen sesión y CSRF', async () => {
  const s = await setup();
  const url = `/api/docs/members/${s.ids.A}/characters/c1`;
  assert.equal((await s.app.inject({ method: 'PUT', url, payload: { name: 'x' }, headers: H })).statusCode, 401);
  assert.equal((await s.app.inject({ method: 'PUT', url, payload: { name: 'x' }, headers: { cookie: `${AT}=${s.tokens.A}` } })).statusCode, 403);
  await s.app.close();
});

test('safeMerge: fusiona objetos, sustituye listas, admite null, no muta, rechaza claves prohibidas', () => {
  const a = { x: { y: 1, z: [1, 2] }, k: 1 };
  const p = { x: { z: [3], w: null }, k: null };
  const snapA = JSON.stringify(a), snapP = JSON.stringify(p);
  const m = safeMerge(a, p);
  assert.deepEqual(JSON.parse(JSON.stringify(m)), { x: { y: 1, z: [3], w: null }, k: null });
  assert.equal(JSON.stringify(a), snapA); assert.equal(JSON.stringify(p), snapP);
  m.x.z.push(9); assert.deepEqual(p.x.z, [3]);
  assert.throws(() => safeMerge({}, JSON.parse('{"__proto__":{"polluted":1}}')));
  assert.throws(() => safeMerge({}, { a: { constructor: 1 } }));
  assert.throws(() => safeMerge({}, { a: [{ prototype: 1 }] }));
  assert.equal(({}).polluted, undefined);
});

test('muro con más de 200 documentos: orderBy=at,desc&limit=50 trae los más nuevos', async () => {
  const s = await setup();
  const w = `legionData/${s.key}/wall`;
  for (let i = 0; i < 250; i++) await s.put(`${w}/m${String(i).padStart(3, '0')}`, { uid: s.ids.B, at: i, text: `t${i}` });
  const r = (await get(s, `${w}?orderBy=at,desc&limit=50`, 'A')).json().docs;
  assert.equal(r.length, 50);
  assert.deepEqual(r.map((d) => d.data.at), Array.from({ length: 50 }, (_, i) => 249 - i));
  const all = (await get(s, w, 'A')).json().docs;
  assert.equal(all.length, 200);
  const old = (await get(s, `${w}?where=at,<,10&orderBy=at,asc`, 'A')).json().docs;
  assert.deepEqual(old.map((d) => d.data.at), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  await s.app.close();
});

test('cuota: los mensajes de muro del autor cuentan junto a members/{uid} (413)', async () => {
  const s = await setup();
  const w = `legionData/${s.key}/wall`;
  for (let i = 0; i < 499; i++) await s.put(`${w}/m${i}`, { uid: s.ids.A, at: i, text: 'x' });
  await s.put(`members/${s.ids.A}/events/e1`, { at: 1, kind: 'k' }); // 500 en total
  assert.equal((await s.call('PUT', `${w}/mx`, 'A', { at: 1, text: 'uno más' })).statusCode, 413);
  assert.equal((await s.call('PUT', `members/${s.ids.A}/events/e2`, 'A', { at: 1, kind: 'k' })).statusCode, 413);
  assert.equal((await s.call('PUT', `${w}/m1`, 'A', { at: 5, text: 'editado' })).statusCode, 200); // reemplazar cabe
  assert.equal((await s.call('PUT', `${w}/mb`, 'B', { at: 1, text: 'de B' })).statusCode, 200); // otro usuario, su propia cuota
  assert.equal((await s.call('DELETE', `${w}/m2`, 'A')).statusCode, 200);
  assert.equal((await s.call('PUT', `${w}/mx`, 'A', { at: 1, text: 'ahora sí' })).statusCode, 200);
  await s.app.close();
});

test('claves como toString/valueOf no esquivan los límites de longitud', async () => {
  const s = await setup();
  assert.equal((await s.call('PUT', `members/${s.ids.A}/settings/stats`, 'A', { toString: 'x'.repeat(30000) })).statusCode, 400);
  assert.equal((await s.call('PUT', `members/${s.ids.A}/settings/presets`, 'A', { items: [{ id: 'p', valueOf: 'x'.repeat(30000) }] })).statusCode, 400);
  assert.equal((await s.call('PUT', `members/${s.ids.A}/settings/tasks`, 'A', { items: [{ id: 'p', hasOwnProperty: 'x'.repeat(501) }] })).statusCode, 400);
  await s.app.close();
});

test('stats y progress tienen esquema propio; claves desconocidas → 400', async () => {
  const s = await setup();
  const st = `members/${s.ids.A}/settings/stats`;
  const good = { daysLog: { '2026-10-11': { spent: 300, tasks: 2 } }, spentTotal: 300, spendCount: 1, tasksDone: 2, fullDays: 0, bestStreak: 1 };
  assert.equal((await s.call('PUT', st, 'A', good)).statusCode, 200);
  assert.equal((await s.call('PUT', st, 'A', { daysLog: {} })).statusCode, 200);
  for (const bad of [
    { ...good, extra: 1 }, { spentTotal: 'x' }, { daysLog: { hoy: { spent: 1, tasks: 1 } } },
    { daysLog: { '2026-10-11': { spent: 1, tasks: 1, z: 1 } } }, { daysLog: { '2026-10-11': 5 } }, { daysLog: [] },
    { daysLog: Object.fromEntries(Array.from({ length: 121 }, (_, i) => [`2026-01-${String(i).padStart(3, '0')}`, { spent: 1, tasks: 1 }])) },
  ]) assert.equal((await s.call('PUT', st, 'A', bad)).statusCode, 400, JSON.stringify(bad).slice(0, 60));
  const pg = `members/${s.ids.A}/progress/c1`;
  assert.equal((await s.call('PUT', pg, 'A', { daily: { key: 20000, done: { 'd-abyss': 1, 't-abc123': 3 } }, weekly: { key: 400, done: { 'w-dungeon': 2 } } })).statusCode, 200);
  assert.equal((await s.call('PUT', pg, 'A', {})).statusCode, 200);
  for (const bad of [
    { other: 1 }, { daily: { key: 1, done: {}, x: 1 } }, { daily: { key: 'a', done: {} } }, { daily: { key: 1, done: { 'a b': 1 } } },
    { daily: { key: 1, done: { a: 'x' } } }, { daily: 5 }, { weekly: { key: 1, done: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`t${i}`, 1])) } },
  ]) assert.equal((await s.call('PUT', pg, 'A', bad)).statusCode, 400, JSON.stringify(bad).slice(0, 60));
  await s.app.close();
});

test('segmento de 129 caracteres → 400; cuerpo de 66 000 bytes → 413', async () => {
  const s = await setup();
  const base = `members/${s.ids.A}/characters`;
  assert.equal((await get(s, `${base}/${'a'.repeat(128)}`, 'A')).statusCode, 200);
  assert.equal((await get(s, `${base}/${'a'.repeat(129)}`, 'A')).statusCode, 400);
  const body = JSON.stringify({ name: 'x', classId: 'a', pad: 'p'.repeat(66000) });
  assert.equal((await s.rawBody('PUT', `${base}/c1`, 'A', body)).statusCode, 413);
  await s.app.close();
});

test('el código fuente no contiene marcas bidi literales', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : e.name.endsWith('.js') ? [new URL(e.name, dir)] : []));
  const files = ['src', 'test'].flatMap((d) => walk(new URL(`../${d}/`, import.meta.url)));
  assert.ok(files.length > 20);
  for (const f of files) assert.ok(!/[\u202A-\u202E\u2066-\u2069]/.test(readFileSync(f, 'utf8')), f.pathname);
});
