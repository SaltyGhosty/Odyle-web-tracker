# Servidor social (amigos, perfiles, búsqueda, chat en vivo) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir al servidor de la versión web las APIs de amigos, bloqueos, perfiles públicos, búsqueda, mensajes 1 a 1 y un canal en vivo (SSE), con sus pruebas de ataque.

**Architecture:** Tablas nuevas en PostgreSQL (migración `005_social.sql`) y rutas Fastify nuevas (`profiles`, `friends`, `messages`, `stream`). Todos los permisos se deciden en `lib/social-rules.js`. Los eventos en vivo viajan por un bus con dos implementaciones: `MemoryBus` (tests y un solo proceso) y `PgBus` (`LISTEN/NOTIFY`). El canal `NOTIFY` lleva solo ids, y el suscriptor relee y vuelve a comprobar permisos antes de enviar por SSE.

**Tech Stack:** Node 22, Fastify 5.12.5, `pg` 8.23.1, `jose` 6.2.12, `@fastify/rate-limit` 11.2.1, `node --test`, `pg-mem` 3.0.14 en tests (y Postgres 16 real con `scripts/test-pg.sh`).

**Spec:** `docs/superpowers/specs/2026-10-13-social-y-facciones-design.md` (secciones 2, 3, 4, 5, 8 y 9). Este es el **Plan 1 de 2**. El Plan 2 cubre el cliente (`web/social-api.js`), el tema por facción, el orbe con runas y las pantallas.

## Global Constraints

- Todo el código del servidor vive en `server/`. Los comandos se ejecutan desde `server/`. Los tests van con `node --test` (todos) o `node --test test/<archivo>`.
- Módulos ES (`import`/`export`) y comentarios en español, como el resto del servidor.
- Ninguna dependencia nueva.
- Las migraciones deben correr en **pg-mem** y en Postgres 16. Por eso no usan `CHECK`, índices parciales ni índices de expresión: los valores permitidos se validan en código. Esto es una desviación consciente de §3 de la spec, que no cambia el comportamiento.
- Las fechas de las tablas nuevas son `bigint` en milisegundos con `app.now()`, como `docs.updated_at`, para que los tests sean deterministas.
- Los ids de usuario cumplen `UID_RE = /^u_[A-Za-z0-9]{22}$/`. Un id con mal formato, desconocido, bloqueado en cualquier sentido o el propio usuario cuando no aplica: **`404 {"error":"No encontrado."}`**, idéntico en todos los casos (SR-42).
- Las escrituras ya pasan por el CSRF global (`requireCsrf`). Las rutas nuevas usan `preHandler: requireUser` y un límite por usuario.
- Textos de error en español, con punto final, en `{ error }`.
- Límites de la spec §4: búsqueda 30/min, perfil 60/min, lista de amigos 60/min, cambios de amistad y bloqueo 20/min, historial 120/min, enviar 30/min, leído 120/min, conversaciones 60/min, denuncias 10/h, stream 10 conexiones/min y 3 abiertas.
- Mensajes: `text` de 1 a 1000 caracteres tras limpiar. `invite`: `title` de 1 a 60, `at` número, `slots` entero de 1 a 12, `cost` entero de 0 a 840.
- Los mensajes se borran a los 365 días.
- Commits sin la línea `Co-Authored-By` (preferencia del usuario).

## Review Focus

1. **El token caduca con el stream abierto.** El servidor debe cerrar el stream al llegar el `exp` del token, no seguir enviando eventos con una sesión caducada. Lo prueba la Task 7.
2. **Dos pestañas abiertas y se cierra una.** El usuario sigue "en línea" para sus amigos hasta que cierra la última. Lo prueba la Task 7.
3. **Bloqueado que intenta pedir amistad, ver el perfil o escribir.** Recibe exactamente la misma respuesta que con un id inexistente. Lo prueba la Task 10.
4. **Reintento de envío con el mismo `clientId`.** No duplica el mensaje y devuelve el ya guardado. Lo prueba la Task 8.
5. **Te eliminan de amigos mientras escribes.** El envío da 404 y el historial sigue legible para los dos. Lo prueba la Task 8.

---

### Task 1: Migración 005 y límite reutilizable

**Files:**
- Create: `server/migrations/005_social.sql`
- Create: `server/src/lib/limits.js`
- Test: `server/test/social-schema.test.js`

**Interfaces:**
- Produces:
  - tablas `friendships(user_a, user_b, status, requested_by, created_at, accepted_at)`, `blocks(blocker, blocked, created_at)`, `messages(id, pair_key, sender, recipient, kind, body, created_at, read_at, client_id)` y `reports(id, reporter, reported, message_id, reason, note, created_at)`;
  - `perUser(app, max, windowMs) → async preHandler(req, reply)`.

- [ ] **Step 1: Write the failing test**

```js
// server/test/social-schema.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestDb } from './helpers.js';
import { newUserId } from '../src/lib/tokens.js';

test('migración 005: tablas sociales usables y únicos en vigor', async () => {
  const db = await makeTestDb();
  const a = newUserId(); const b = newUserId();
  for (const id of [a, b]) await db.query('insert into users (id, email, password_hash) values ($1, $2, $3)', [id, `${id}@x.test`, 'x']);
  const [ua, ub] = a < b ? [a, b] : [b, a];
  await db.query('insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, $3, $4, $5)', [ua, ub, 'pending', a, 1]);
  await assert.rejects(db.query('insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, $3, $4, $5)', [ua, ub, 'pending', b, 2]));
  await db.query('insert into blocks (blocker, blocked, created_at) values ($1, $2, $3)', [a, b, 1]);
  await db.query(`insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id)
                  values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`, ['m1', `${ua}|${ub}`, a, b, 'text', '{"text":"hola"}', 10, 'c1']);
  await assert.rejects(db.query(`insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id)
                  values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`, ['m2', `${ua}|${ub}`, a, b, 'text', '{"text":"x"}', 11, 'c1']));
  await db.query('insert into reports (id, reporter, reported, message_id, reason, created_at) values ($1, $2, $3, $4, $5, $6)', ['r1', b, a, 'm1', 'spam', 12]);
  const m = (await db.query('select * from messages where id = $1', ['m1'])).rows[0];
  assert.equal(m.body.text, 'hola');
  assert.equal(Number(m.created_at), 10);
  assert.equal(m.read_at, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/social-schema.test.js`
Expected: FAIL with `relation "friendships" does not exist`.

- [ ] **Step 3: Write the migration and the limiter**

```sql
-- server/migrations/005_social.sql
-- Amigos, bloqueos, mensajes y denuncias (spec 2026-10-13 §3). Sin CHECK ni índices parciales: pg-mem no los soporta;
-- los valores permitidos se validan en el código. Fechas en milisegundos (bigint), como docs.updated_at.
create table friendships (
  user_a text not null references users (id) on delete cascade,
  user_b text not null references users (id) on delete cascade,
  status text not null,
  requested_by text not null references users (id) on delete cascade,
  created_at bigint not null,
  accepted_at bigint,
  primary key (user_a, user_b)
);
create index friendships_b_idx on friendships (user_b);

create table blocks (
  blocker text not null references users (id) on delete cascade,
  blocked text not null references users (id) on delete cascade,
  created_at bigint not null,
  primary key (blocker, blocked)
);
create index blocks_blocked_idx on blocks (blocked);

create table messages (
  id text primary key,
  pair_key text not null,
  sender text not null references users (id) on delete cascade,
  recipient text not null references users (id) on delete cascade,
  kind text not null,
  body jsonb not null,
  created_at bigint not null,
  read_at bigint,
  client_id text not null,
  unique (sender, client_id)
);
create index messages_pair_idx on messages (pair_key, created_at);
create index messages_recipient_idx on messages (recipient, read_at);

create table reports (
  id text primary key,
  reporter text not null references users (id) on delete cascade,
  reported text not null references users (id) on delete cascade,
  message_id text references messages (id) on delete set null,
  reason text not null,
  note text,
  created_at bigint not null
);
```

```js
// server/src/lib/limits.js
// Límite por usuario reutilizable para las rutas sociales (SR-46). Mismo patrón que legions.js y docs.js.
const TOO_MANY = 'Demasiados intentos. Prueba más tarde.';

export function perUser(app, max, windowMs, name = 'social') {
  const check = app.createRateLimit({
    max, timeWindow: windowMs, keyGenerator: (req) => `${name}|${req.user.id}`,
    errorResponseBuilder: () => Object.assign(new Error(TOO_MANY), { statusCode: 429 }),
  });
  return async (req, reply) => {
    const r = await check(req);
    if (!r.isAllowed && r.isExceeded) {
      reply.header('retry-after', r.ttlInSeconds);
      return reply.code(429).header('cache-control', 'no-store').send({ error: TOO_MANY });
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/social-schema.test.js`
Expected: PASS.

Then run the full suite: `node --test`
Expected: all PASS (the migration does not touch existing tables).

- [ ] **Step 5: Commit**

```bash
git add migrations/005_social.sql src/lib/limits.js test/social-schema.test.js
git commit -m "feat(social): tablas de amigos, bloqueos, mensajes y denuncias"
```

---

### Task 2: Reglas sociales y perfil público

**Files:**
- Create: `server/src/lib/social-rules.js`
- Test: `server/test/social-rules.test.js`

**Interfaces:**
- Consumes: the Task 1 tables; `UID_RE` from `src/lib/validate.js`.
- Produces:
  - `pairOf(a, b) → [min, max]`
  - `pairKey(a, b) → 'min|max'`
  - `relation(q, me, other) → 'self'|'none'|'blocked'|'pending-out'|'pending-in'|'friends'`
  - `visible(q, me, other) → boolean` (valid format, exists, not me, no block in either direction)
  - `friendIds(q, me) → string[]`
  - `blockedEither(q, me) → Set<string>`
  - `publicProfile(q, uid) → { uid, nick, server, faction, bio, legion, mainClass, searchable, shareEnergy }`
  - `toPublic(p) → { uid, nick, server, faction, bio, legion, mainClass }`
  - `NOT_FOUND = 'No encontrado.'`

  `q` is always `(text, params) => Promise<{rows}>`, i.e. `db.query` or the `q` of a transaction.

- [ ] **Step 1: Write the failing test**

```js
// server/test/social-rules.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestDb } from './helpers.js';
import { newUserId } from '../src/lib/tokens.js';
import { pairKey, relation, visible, friendIds, blockedEither, publicProfile, toPublic } from '../src/lib/social-rules.js';

async function setup() {
  const db = await makeTestDb();
  const q = (t, p) => db.query(t, p);
  const ids = {};
  for (const k of ['A', 'B', 'C']) {
    ids[k] = newUserId();
    await q('insert into users (id, email, password_hash) values ($1, $2, $3)', [ids[k], `${k}@x.test`, 'x']);
  }
  const friend = async (x, y, status, by) => {
    const [a, b] = ids[x] < ids[y] ? [ids[x], ids[y]] : [ids[y], ids[x]];
    await q('insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, $3, $4, 1)', [a, b, status, ids[by]]);
  };
  const doc = (path, data) => q('insert into docs (path, parent, data, updated_at) values ($1, $2, $3::jsonb, 1)', [path, path.slice(0, path.lastIndexOf('/')), JSON.stringify(data)]);
  return { q, ids, friend, doc };
}

test('pairKey es simétrico', () => {
  assert.equal(pairKey('u_b', 'u_a'), 'u_a|u_b');
  assert.equal(pairKey('u_a', 'u_b'), 'u_a|u_b');
});

test('relation cubre todos los estados', async () => {
  const s = await setup();
  const { A, B, C } = s.ids;
  assert.equal(await relation(s.q, A, A), 'self');
  assert.equal(await relation(s.q, A, B), 'none');
  await s.friend('A', 'B', 'pending', 'A');
  assert.equal(await relation(s.q, A, B), 'pending-out');
  assert.equal(await relation(s.q, B, A), 'pending-in');
  await s.q('update friendships set status = $1', ['accepted']);
  assert.equal(await relation(s.q, A, B), 'friends');
  await s.q('insert into blocks (blocker, blocked, created_at) values ($1, $2, 1)', [C, A]);
  assert.equal(await relation(s.q, A, C), 'blocked');
  assert.equal(await relation(s.q, C, A), 'blocked');
});

test('visible: falso para mal formado, inexistente, uno mismo y bloqueo en cualquier sentido', async () => {
  const s = await setup();
  const { A, B, C } = s.ids;
  assert.equal(await visible(s.q, A, B), true);
  assert.equal(await visible(s.q, A, A), false);
  assert.equal(await visible(s.q, A, 'u_nope'), false);
  assert.equal(await visible(s.q, A, newUserId()), false);
  await s.q('insert into blocks (blocker, blocked, created_at) values ($1, $2, 1)', [B, A]);
  assert.equal(await visible(s.q, A, B), false);
  assert.equal(await visible(s.q, B, A), false);
  assert.deepEqual([...await blockedEither(s.q, A)], [B]);
  assert.equal(await visible(s.q, A, C), true);
});

test('friendIds solo devuelve amistades aceptadas', async () => {
  const s = await setup();
  await s.friend('A', 'B', 'accepted', 'A');
  await s.friend('A', 'C', 'pending', 'A');
  assert.deepEqual(await friendIds(s.q, s.ids.A), [s.ids.B]);
});

test('publicProfile: lista blanca, legión por nombre, clase del principal y opciones por defecto', async () => {
  const s = await setup();
  const { A } = s.ids;
  await s.doc(`members/${A}`, { joinedAt: 1, legionId: A, legionEpoch: 'e', profile: { nick: 'Salty', server: 'Nezakan', faction: 'elyos', bio: 'hola', mainCharId: 'c1' } });
  await s.doc(`legions/${A}`, { name: 'Alas', epoch: 'e', banned: [], createdAt: 1, leader: A, codeHash: 'secreto' });
  await s.doc(`members/${A}/characters/c1`, { name: 'Salty', classId: 'templario', energy: 612 });
  const p = await publicProfile(s.q, A);
  assert.deepEqual(p, { uid: A, nick: 'Salty', server: 'Nezakan', faction: 'elyos', bio: 'hola', legion: 'Alas', mainClass: 'templario', searchable: true, shareEnergy: true });
  assert.deepEqual(toPublic(p), { uid: A, nick: 'Salty', server: 'Nezakan', faction: 'elyos', bio: 'hola', legion: 'Alas', mainClass: 'templario' });
  const empty = await publicProfile(s.q, s.ids.B);
  assert.deepEqual(empty, { uid: s.ids.B, nick: '', server: '', faction: null, bio: '', legion: null, mainClass: null, searchable: true, shareEnergy: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/social-rules.test.js`
Expected: FAIL with `Cannot find module '../src/lib/social-rules.js'`.

- [ ] **Step 3: Write the implementation**

```js
// server/src/lib/social-rules.js
// Única fuente de verdad de los permisos sociales (spec 2026-10-13 §2, SR-39..SR-42).
// q: (text, params) => Promise<{rows}> (db.query o el q de una transacción).
import { UID_RE } from './validate.js';

export const NOT_FOUND = 'No encontrado.';
export const pairOf = (a, b) => (a < b ? [a, b] : [b, a]);
export const pairKey = (a, b) => pairOf(a, b).join('|');

export async function relation(q, me, other) {
  if (me === other) return 'self';
  const b = await q('select 1 from blocks where (blocker = $1 and blocked = $2) or (blocker = $2 and blocked = $1)', [me, other]);
  if (b.rows.length) return 'blocked';
  const [a, c] = pairOf(me, other);
  const f = (await q('select status, requested_by from friendships where user_a = $1 and user_b = $2', [a, c])).rows[0];
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requested_by === me ? 'pending-out' : 'pending-in';
}

export async function visible(q, me, other) {
  if (typeof other !== 'string' || !UID_RE.test(other) || other === me) return false;
  if (!(await q('select 1 from users where id = $1', [other])).rows.length) return false;
  return (await relation(q, me, other)) !== 'blocked';
}

export async function friendIds(q, me) {
  const rows = (await q("select user_a, user_b from friendships where status = 'accepted' and (user_a = $1 or user_b = $1)", [me])).rows;
  return rows.map((r) => (r.user_a === me ? r.user_b : r.user_a));
}

export async function blockedEither(q, me) {
  const rows = (await q('select blocker, blocked from blocks where blocker = $1 or blocked = $1', [me])).rows;
  return new Set(rows.map((r) => (r.blocker === me ? r.blocked : r.blocker)));
}

const docData = async (q, path) => (await q('select data from docs where path = $1', [path])).rows[0]?.data ?? null;
const s = (v) => (typeof v === 'string' ? v : '');

// Solo campos de la lista blanca (SR-39): nunca correo, hashes ni datos de la legión salvo su nombre.
export async function publicProfile(q, uid) {
  const m = (await docData(q, `members/${uid}`)) || {};
  const p = m.profile && typeof m.profile === 'object' ? m.profile : {};
  let legion = null;
  if (typeof m.legionId === 'string') {
    const l = await docData(q, `legions/${m.legionId}`);
    if (l && typeof l.name === 'string') legion = l.name;
  }
  let mainClass = null;
  if (typeof p.mainCharId === 'string') {
    const c = await docData(q, `members/${uid}/characters/${p.mainCharId}`);
    if (c && typeof c.classId === 'string') mainClass = c.classId;
  }
  return {
    uid, nick: s(p.nick), server: s(p.server),
    faction: p.faction === 'elyos' || p.faction === 'asmodian' ? p.faction : null,
    bio: s(p.bio), legion, mainClass,
    searchable: p.searchable !== false, shareEnergy: p.shareEnergy !== false,
  };
}

export const toPublic = ({ uid, nick, server, faction, bio, legion, mainClass }) => ({ uid, nick, server, faction, bio, legion, mainClass });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/social-rules.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social-rules.js test/social-rules.test.js
git commit -m "feat(social): reglas de relación, visibilidad y perfil público"
```

---

### Task 3: Opciones de privacidad, tema y limpieza de texto

**Files:**
- Modify: `server/src/lib/validate.js`. Schema `member.fields.profile` (lines ~70–74), schema `settings:prefs` (lines ~88–95), and a new export `cleanText` after `walk`.
- Test: `server/test/social-validate.test.js`

**Interfaces:**
- Produces:
  - `profile.searchable` and `profile.shareEnergy` (booleans);
  - `prefs.theme` ∈ `'elyos'|'asmodian'`;
  - `cleanText(v, max, multiline=false) → string|null`: removes controls and bidi marks and trims; returns `null` if `v` is not a string, ends up empty, or exceeds `max`.

- [ ] **Step 1: Write the failing test**

```js
// server/test/social-validate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, cleanText } from '../src/lib/validate.js';

const UID = 'u_' + 'a'.repeat(22);

test('perfil acepta searchable y shareEnergy booleanos y rechaza otros tipos', () => {
  assert.ok(!sanitize(['members', UID], { profile: { nick: 'Salty', searchable: false, shareEnergy: true } }).error);
  assert.ok(sanitize(['members', UID], { profile: { searchable: 'no' } }).error);
  assert.ok(sanitize(['members', UID], { profile: { shareEnergy: 1 } }).error);
});

test('prefs acepta theme elyos|asmodian y rechaza otros', () => {
  const p = ['members', UID, 'settings', 'prefs'];
  assert.ok(!sanitize(p, { theme: 'elyos' }).error);
  assert.ok(!sanitize(p, { theme: 'asmodian' }).error);
  assert.ok(sanitize(p, { theme: 'balaur' }).error);
});

test('cleanText quita controles y bidi, recorta y aplica el máximo', () => {
  assert.equal(cleanText('  hola‮ mundo\u0007 ', 100), 'hola mundo');
  assert.equal(cleanText('a\nb', 100), 'ab');
  assert.equal(cleanText('a\nb', 100, true), 'a\nb');
  assert.equal(cleanText('   ', 100), null);
  assert.equal(cleanText('x'.repeat(11), 10), null);
  assert.equal(cleanText(42, 10), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/social-validate.test.js`
Expected: FAIL (`cleanText` is not exported, and `searchable` is rejected).

- [ ] **Step 3: Write the implementation**

In `server/src/lib/validate.js`, replace the `profile` validator of the `member` schema with:

```js
      profile: (v) => isObj(v) && subKeys(v, ['nick', 'server', 'bio', 'faction', 'mainCharId', 'searchable', 'shareEnergy'])
        && (v.faction === undefined || v.faction === 'elyos' || v.faction === 'asmodian')
        && (v.mainCharId === undefined || v.mainCharId === null || str(v.mainCharId))
        && (v.searchable === undefined || typeof v.searchable === 'boolean')
        && (v.shareEnergy === undefined || typeof v.shareEnergy === 'boolean'),
```

Replace the `settings:prefs` schema with:

```js
  'settings:prefs': {
    allowed: ['quietStart', 'quietEnd', 'favEvents', 'faction', 'lang', 'theme'],
    fields: {
      quietStart: str, quietEnd: str, lang: str,
      favEvents: (v) => Array.isArray(v) && v.length <= 100 && v.every(str),
      faction: (v) => v === 'elyos' || v === 'asmodian',
      theme: (v) => v === 'elyos' || v === 'asmodian',
    },
  },
```

Add after `function walk(...) { ... }`:

```js
// Limpieza de un texto suelto (mensajes del chat, notas de denuncia): mismas reglas que walk (SR-4, SR-43).
export function cleanText(v, max, multiline = false) {
  if (typeof v !== 'string') return null;
  let s = v.replace(BAD_CHARS, '');
  if (!multiline) s = s.replace(/\n/g, '');
  s = s.trim();
  if (!s.length || s.length > max) return null;
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/social-validate.test.js && node --test`
Expected: PASS, and the full suite stays green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validate.js test/social-validate.test.js
git commit -m "feat(social): privacidad del perfil, tema en prefs y cleanText"
```

---

### Task 4: Bus de eventos (memoria y Postgres)

**Files:**
- Create: `server/src/lib/bus.js`
- Modify: `server/src/app.js`. `buildApp` gains a `bus` parameter and the `app.bus` decorator.
- Modify: `server/src/index.js`. Creates and starts a `PgBus` in production.
- Test: `server/test/bus.test.js`

**Interfaces:**
- Produces:
  - `class MemoryBus { publish(to, evt): Promise<void>; subscribe(uid, fn): () => void; close(): Promise<void> }`
  - `class PgBus` (same interface plus `start(): Promise<void>`)
  - `evt = { type: 'message'|'read'|'friend'|'presence', id: string, online?: boolean }`
  - `fn(evt)` receives the event without `to`
  - `app.bus` is available in every route

- [ ] **Step 1: Write the failing test**

```js
// server/test/bus.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBus, PgBus } from '../src/lib/bus.js';
import { REAL_PG } from './helpers.js';
import { createDb } from '../src/db.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('MemoryBus entrega solo al destinatario y respeta la baja', async () => {
  const bus = new MemoryBus();
  const got = { a: [], b: [] };
  const offA = bus.subscribe('u_a', (e) => got.a.push(e));
  bus.subscribe('u_b', (e) => got.b.push(e));
  await bus.publish('u_a', { type: 'message', id: 'm1' });
  await wait(5);
  assert.deepEqual(got.a, [{ type: 'message', id: 'm1' }]);
  assert.deepEqual(got.b, []);
  offA();
  await bus.publish('u_a', { type: 'message', id: 'm2' });
  await wait(5);
  assert.equal(got.a.length, 1);
});

test('MemoryBus: un suscriptor que lanza no rompe a los demás', async () => {
  const bus = new MemoryBus();
  const got = [];
  bus.subscribe('u_a', () => { throw new Error('boom'); });
  bus.subscribe('u_a', (e) => got.push(e.id));
  await bus.publish('u_a', { type: 'read', id: 'u_b' });
  await wait(5);
  assert.deepEqual(got, ['u_b']);
});

test('PgBus: NOTIFY llega al suscriptor (solo con Postgres real)', { skip: !REAL_PG }, async () => {
  const db = await createDb({ connectionString: process.env.TEST_DATABASE_URL, ssl: 'off' });
  const bus = new PgBus(db, { connectionString: process.env.TEST_DATABASE_URL });
  await bus.start();
  const got = [];
  bus.subscribe('u_a', (e) => got.push(e));
  await bus.publish('u_a', { type: 'presence', id: 'u_b', online: true });
  for (let i = 0; i < 50 && !got.length; i++) await wait(20);
  assert.deepEqual(got, [{ type: 'presence', id: 'u_b', online: true }]);
  await bus.close(); await db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bus.test.js`
Expected: FAIL with `Cannot find module '../src/lib/bus.js'`.

- [ ] **Step 3: Write the implementation**

```js
// server/src/lib/bus.js
// Bus de eventos en vivo (spec 2026-10-13 §2, SR-45). La carga solo lleva ids: quien recibe relee y comprueba permisos.
import pg from 'pg';

const CHANNEL = 'odyle_events';

class Subscribers {
  constructor() { this.map = new Map(); }
  add(uid, fn) {
    if (!this.map.has(uid)) this.map.set(uid, new Set());
    this.map.get(uid).add(fn);
    return () => { const s = this.map.get(uid); if (s) { s.delete(fn); if (!s.size) this.map.delete(uid); } };
  }
  deliver(to, evt) {
    for (const fn of this.map.get(to) || []) {
      try { Promise.resolve(fn(evt)).catch(() => {}); } catch { /* un suscriptor roto no afecta a los demás */ }
    }
  }
}

const strip = ({ to, ...evt }) => evt;

export class MemoryBus {
  constructor() { this.subs = new Subscribers(); }
  async publish(to, evt) { setImmediate(() => this.subs.deliver(to, strip({ to, ...evt }))); }
  subscribe(uid, fn) { return this.subs.add(uid, fn); }
  async close() {}
}

export class PgBus {
  // db: el objeto de createDb (para NOTIFY por el pool); clientOptions: para la conexión dedicada de LISTEN.
  constructor(db, clientOptions) { this.db = db; this.opts = clientOptions; this.subs = new Subscribers(); this.closed = false; }
  async start() {
    this.client = new pg.Client(this.opts);
    this.client.on('notification', (n) => {
      let msg; try { msg = JSON.parse(n.payload); } catch { return; }
      if (msg && typeof msg.to === 'string') this.subs.deliver(msg.to, strip(msg));
    });
    // Si se cae la conexión de LISTEN, se reintenta a los 2 s (los clientes SSE reconectan solos y recuperan con GET).
    const retry = () => { if (!this.closed) setTimeout(() => this.start().catch(retry), 2000).unref(); };
    this.client.on('error', retry);
    await this.client.connect();
    await this.client.query(`listen ${CHANNEL}`);
  }
  async publish(to, evt) {
    await this.db.query('select pg_notify($1, $2)', [CHANNEL, JSON.stringify({ to, ...evt })]);
  }
  subscribe(uid, fn) { return this.subs.add(uid, fn); }
  async close() { this.closed = true; if (this.client) await this.client.end().catch(() => {}); }
}
```

In `server/src/app.js`:
- add `import { MemoryBus } from './lib/bus.js';`;
- change the `buildApp` signature to `export function buildApp({ config, db, mailer, now = Date.now, hasher = hashPassword, logger = PROD_LOGGER, publicDir, bus = new MemoryBus() })`;
- after `app.decorate('hasher', hasher);` add `app.decorate('bus', bus);`.

In `server/src/index.js`, replace the content with:

```js
import { loadConfig } from './config.js';
import { createDb, migrate, prepareConnection } from './db.js';
import { buildApp } from './app.js';
import { createMailer } from './lib/mail.js';
import { PgBus } from './lib/bus.js';

const config = loadConfig(process.env);
const db = await createDb({ connectionString: config.databaseUrl, ssl: config.databaseSsl });
await migrate(db);
const mailer = createMailer(config);
const bus = new PgBus(db, prepareConnection(config.databaseUrl, config.databaseSsl));
await bus.start();
const app = buildApp({ config, db, mailer, bus });
const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
app.log.info({ trustProxyHops: config.trustProxyHops }, 'saltos de proxy de confianza (TRUST_PROXY_HOPS)');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bus.test.js && node --test`
Expected: PASS. The PgBus test is skipped without `TEST_DATABASE_URL`; with `bash scripts/test-pg.sh` it runs and passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bus.js src/app.js src/index.js test/bus.test.js
git commit -m "feat(social): bus de eventos en memoria y con LISTEN/NOTIFY"
```

---

### Task 5: Perfiles públicos y búsqueda

**Files:**
- Create: `server/src/routes/profiles.js`
- Modify: `server/src/app.js`. Add `import profilesRoutes from './routes/profiles.js';` and `app.register(profilesRoutes);` after `legionsRoutes`.
- Create: `server/test/social-helpers.js`, shared by Tasks 5–10.
- Test: `server/test/profiles.test.js`

**Interfaces:**
- Consumes: `relation`, `visible`, `blockedEither`, `publicProfile`, `toPublic`, `NOT_FOUND` (Task 2); `perUser` (Task 1).
- Produces:
  - `GET /api/profiles/search?q=` → `{ results: [{ uid, nick, server, faction, bio, legion, mainClass, relation }] }`
  - `GET /api/profiles/:uid` → `{ profile: {...toPublic}, relation, characters: [{ name, classId, energy, recordedAt }] | null }`
  - `social-helpers.js`: `socialSetup(n = 3) → { app, db, config, ids, call(method, url, who, payload), doc(path, data), befriend(x, y), block(x, y), NOW }`

- [ ] **Step 1: Write the shared helper and the failing test**

```js
// server/test/social-helpers.js
// Preparación común de las pruebas sociales: usuarios A, B, C… con sesión y utilidades de relación.
import { makeTestApp } from './helpers.js';
import { newUserId } from '../src/lib/tokens.js';
import { signAccess } from '../src/lib/jwt.js';
import { pairOf } from '../src/lib/social-rules.js';

export const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const AT = '__Host-odyle_at';
const H = { origin: 'https://odyle.test', 'x-odyle-csrf': '1' };

export async function socialSetup(n = 3, extra = {}) {
  const t = await makeTestApp({ __buildApp: { now: () => NOW, ...extra } });
  const ids = {}; const tokens = {};
  for (const k of 'ABCDEFGH'.slice(0, n)) {
    ids[k] = newUserId();
    await t.db.query('insert into users (id, email, password_hash, email_verified_at) values ($1, $2, $3, $4)', [ids[k], `${k.toLowerCase()}@example.com`, 'x', new Date(NOW)]);
    tokens[k] = await signAccess(t.config, { sub: ids[k], ver: 0 }, NOW);
  }
  const call = (method, url, who, payload) => t.app.inject({
    method, url, payload, headers: { ...(method === 'GET' ? {} : H), cookie: `${AT}=${tokens[who]}` },
  });
  const doc = (path, data) => t.db.query('insert into docs (path, parent, data, updated_at) values ($1, $2, $3::jsonb, $4)', [path, path.slice(0, path.lastIndexOf('/')), JSON.stringify(data), NOW]);
  const befriend = async (x, y) => {
    const [a, b] = pairOf(ids[x], ids[y]);
    await t.db.query('insert into friendships (user_a, user_b, status, requested_by, created_at, accepted_at) values ($1, $2, $3, $4, $5, $5)', [a, b, 'accepted', ids[x], NOW]);
  };
  const block = (x, y) => t.db.query('insert into blocks (blocker, blocked, created_at) values ($1, $2, $3)', [ids[x], ids[y], NOW]);
  return { ...t, ids, tokens, call, doc, befriend, block, NOW };
}
```

```js
// server/test/profiles.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';

async function withProfiles() {
  const s = await socialSetup(4);
  const { A, B, C, D } = s.ids;
  await s.doc(`members/${A}`, { joinedAt: 1, profile: { nick: 'Salty', server: 'Nezakan', faction: 'elyos' } });
  await s.doc(`members/${B}`, { joinedAt: 1, profile: { nick: 'Nahma', server: 'Nezakan', faction: 'elyos', mainCharId: 'n1' } });
  await s.doc(`members/${B}/characters/n1`, { name: 'Nahma', classId: 'clerigo', energy: 840, recordedAt: 5, notes: 'privado' });
  await s.doc(`members/${C}`, { joinedAt: 1, profile: { nick: 'Nahmira', searchable: false } });
  await s.doc(`members/${D}`, { joinedAt: 1, profile: { nick: 'Nahrun' } });
  return s;
}

test('búsqueda por prefijo sin distinguir mayúsculas; excluye no buscables, bloqueados y a uno mismo', async () => {
  const s = await withProfiles();
  await s.block('D', 'A');
  const r = await s.call('GET', '/api/profiles/search?q=nah', 'A');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().results.map((x) => x.nick), ['Nahma']);
  assert.equal(r.json().results[0].relation, 'none');
  assert.equal('searchable' in r.json().results[0], false);
  assert.equal((await s.call('GET', '/api/profiles/search?q=salty', 'A')).json().results.length, 0);
});

test('búsqueda: q de 1 o de más de 20 caracteres → 400; comodines SQL no amplían', async () => {
  const s = await withProfiles();
  assert.equal((await s.call('GET', '/api/profiles/search?q=n', 'A')).statusCode, 400);
  assert.equal((await s.call('GET', `/api/profiles/search?q=${'n'.repeat(21)}`, 'A')).statusCode, 400);
  assert.equal((await s.call('GET', '/api/profiles/search?q=%25%25', 'A')).statusCode, 400);
  assert.deepEqual((await s.call('GET', '/api/profiles/search?q=n_h', 'A')).json().results, []);
});

test('perfil: energía solo para amigos con shareEnergy y sin campos privados', async () => {
  const s = await withProfiles();
  const { B } = s.ids;
  const stranger = (await s.call('GET', `/api/profiles/${B}`, 'A')).json();
  assert.equal(stranger.relation, 'none');
  assert.equal(stranger.characters, null);
  assert.equal(stranger.profile.mainClass, 'clerigo');
  await s.befriend('A', 'B');
  const friend = (await s.call('GET', `/api/profiles/${B}`, 'A')).json();
  assert.equal(friend.relation, 'friends');
  assert.deepEqual(friend.characters, [{ name: 'Nahma', classId: 'clerigo', energy: 840, recordedAt: 5 }]);
  await s.db.query('update docs set data = $1::jsonb where path = $2', [JSON.stringify({ joinedAt: 1, profile: { nick: 'Nahma', mainCharId: 'n1', shareEnergy: false } }), `members/${B}`]);
  assert.equal((await s.call('GET', `/api/profiles/${B}`, 'A')).json().characters, null);
});

test('perfil: desconocido, mal formado, propio y bloqueado → mismo 404', async () => {
  const s = await withProfiles();
  await s.block('B', 'A');
  const bodies = [];
  for (const uid of ['u_' + 'z'.repeat(22), 'basura', s.ids.A, s.ids.B]) {
    const r = await s.call('GET', `/api/profiles/${uid}`, 'A');
    assert.equal(r.statusCode, 404);
    bodies.push(r.body);
  }
  assert.equal(new Set(bodies).size, 1);
});

test('búsqueda: 31.ª en un minuto → 429', async () => {
  const s = await withProfiles();
  for (let i = 0; i < 30; i++) assert.equal((await s.call('GET', '/api/profiles/search?q=na', 'A')).statusCode, 200);
  assert.equal((await s.call('GET', '/api/profiles/search?q=na', 'A')).statusCode, 429);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/profiles.test.js`
Expected: FAIL (404 on `/api/profiles/search` because the route does not exist).

- [ ] **Step 3: Write the implementation**

```js
// server/src/routes/profiles.js
// Perfiles públicos y búsqueda (spec 2026-10-13 §4; SR-39, SR-40, SR-42, SR-46).
import { requireUser } from '../lib/session.js';
import { perUser } from '../lib/limits.js';
import { relation, visible, blockedEither, publicProfile, toPublic, NOT_FOUND } from '../lib/social-rules.js';
import { cleanText } from '../lib/validate.js';

const MIN = 60_000;
const notFound = (reply) => reply.code(404).send({ error: NOT_FOUND });

export default async function profilesRoutes(app) {
  const { db } = app;
  const q = (t, p) => db.query(t, p);
  const searchLimit = perUser(app, 30, MIN, 'search');
  const viewLimit = perUser(app, 60, MIN, 'profile');

  app.get('/api/profiles/search', { preHandler: [requireUser, searchLimit] }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const raw = typeof req.query.q === 'string' ? req.query.q.replace(/[%_\\]/g, '') : '';
    const term = cleanText(raw, 20);
    if (!term || term.length < 2) return reply.code(400).send({ error: 'Escribe entre 2 y 20 caracteres.' });
    const me = req.user.id;
    const rows = (await q(
      "select path from docs where parent = 'members' and lower(data->'profile'->>'nick') like $1 order by lower(data->'profile'->>'nick') limit 60",
      [`${term.toLowerCase()}%`],
    )).rows;
    const blocked = await blockedEither(q, me);
    const results = [];
    for (const r of rows) {
      const uid = r.path.slice('members/'.length);
      if (uid === me || blocked.has(uid)) continue;
      const p = await publicProfile(q, uid);
      if (!p.searchable) continue;
      results.push({ ...toPublic(p), relation: await relation(q, me, uid) });
      if (results.length === 20) break;
    }
    return { results };
  });

  app.get('/api/profiles/:uid', { preHandler: [requireUser, viewLimit] }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const me = req.user.id; const { uid } = req.params;
    if (!(await visible(q, me, uid))) return notFound(reply);
    const p = await publicProfile(q, uid);
    const rel = await relation(q, me, uid);
    let characters = null;
    if (rel === 'friends' && p.shareEnergy) {
      const rows = (await q('select data from docs where parent = $1 order by path', [`members/${uid}/characters`])).rows;
      characters = rows.map(({ data: d }) => ({
        name: typeof d.name === 'string' ? d.name : '',
        classId: typeof d.classId === 'string' ? d.classId : null,
        energy: typeof d.energy === 'number' ? d.energy : null,
        recordedAt: typeof d.recordedAt === 'number' ? d.recordedAt : null,
      }));
    }
    return { profile: toPublic(p), relation: rel, characters };
  });
}
```

In `server/src/app.js` add `import profilesRoutes from './routes/profiles.js';` and, after `app.register(legionsRoutes);`, the line `app.register(profilesRoutes);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/profiles.test.js && node --test`
Expected: PASS (5 tests); full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/profiles.js src/app.js test/social-helpers.js test/profiles.test.js
git commit -m "feat(social): perfiles públicos y búsqueda por nombre"
```

---

### Task 6: Amigos y bloqueos

**Files:**
- Create: `server/src/routes/friends.js`
- Modify: `server/src/app.js`. Add `import friendsRoutes from './routes/friends.js';` and `app.register(friendsRoutes);`.
- Create: `server/src/lib/presence.js` (the in-process online registry, used here and in Task 7).
- Test: `server/test/friends.test.js`

**Interfaces:**
- Consumes: `relation`, `visible`, `pairOf`, `friendIds`, `publicProfile`, `toPublic`, `NOT_FOUND` (Task 2); `perUser` (Task 1); `app.bus` (Task 4).
- Produces:
  - `GET /api/friends` → `{ friends: [{...toPublic, online}], incoming: [toPublic], outgoing: [toPublic] }`
  - `POST /api/friends/:uid` → `{ status: 'pending-out'|'friends' }`
  - `POST /api/friends/:uid/accept` → `{ status: 'friends' }`
  - `DELETE /api/friends/:uid` → `{ ok: true }`
  - `POST /api/blocks/:uid` → `{ ok: true }`
  - `DELETE /api/blocks/:uid` → `{ ok: true }`
  - `GET /api/blocks` → `{ blocked: [{ uid, nick }] }`
  - bus events: `{type:'friend', id: <other uid>}` to both users on request, accept and delete, and only to the blocker when blocking
  - `presence.js`: `const presence = createPresence()` with `add(uid) → boolean` (true if this is the first connection), `remove(uid) → boolean` (true if it was the last), `count(uid) → number`, `isOnline(uid) → boolean`; `app.presence` is decorated in `app.js`

- [ ] **Step 1: Write the failing test**

```js
// server/test/friends.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';

const rel = async (s, me, other) => (await s.call('GET', `/api/profiles/${s.ids[other]}`, me)).json().relation;

test('pedir, aceptar, listar y eliminar', async () => {
  const s = await socialSetup(3);
  const { A, B } = s.ids;
  const r = await s.call('POST', `/api/friends/${B}`, 'A');
  assert.deepEqual(r.json(), { status: 'pending-out' });
  assert.deepEqual((await s.call('GET', '/api/friends', 'B')).json().incoming.map((x) => x.uid), [A]);
  assert.deepEqual((await s.call('GET', '/api/friends', 'A')).json().outgoing.map((x) => x.uid), [B]);
  assert.deepEqual((await s.call('POST', `/api/friends/${A}/accept`, 'B')).json(), { status: 'friends' });
  const list = (await s.call('GET', '/api/friends', 'A')).json();
  assert.deepEqual(list.friends.map((x) => x.uid), [B]);
  assert.equal(list.friends[0].online, false);
  assert.deepEqual((await s.call('DELETE', `/api/friends/${B}`, 'A')).json(), { ok: true });
  assert.equal(await rel(s, 'A', 'B'), 'none');
});

test('petición cruzada: la segunda acepta la primera', async () => {
  const s = await socialSetup(2);
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  assert.deepEqual((await s.call('POST', `/api/friends/${s.ids.A}`, 'B')).json(), { status: 'friends' });
});

test('aceptar algo que no es una solicitud recibida → 404', async () => {
  const s = await socialSetup(2);
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  assert.equal((await s.call('POST', `/api/friends/${s.ids.B}/accept`, 'A')).statusCode, 404);
});

test('bloquear elimina la amistad, oculta y es idempotente; desbloquear no la restaura', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  assert.deepEqual((await s.call('POST', `/api/blocks/${s.ids.B}`, 'A')).json(), { ok: true });
  assert.deepEqual((await s.call('POST', `/api/blocks/${s.ids.B}`, 'A')).json(), { ok: true });
  assert.equal((await s.call('GET', `/api/profiles/${s.ids.A}`, 'B')).statusCode, 404);
  assert.equal((await s.call('POST', `/api/friends/${s.ids.A}`, 'B')).statusCode, 404);
  assert.deepEqual((await s.call('GET', '/api/blocks', 'A')).json().blocked.map((x) => x.uid), [s.ids.B]);
  await s.call('DELETE', `/api/blocks/${s.ids.B}`, 'A');
  assert.equal(await rel(s, 'A', 'B'), 'none');
});

test('máximo 50 solicitudes enviadas pendientes', async () => {
  const s = await socialSetup(2);
  const { newUserId } = await import('../src/lib/tokens.js');
  for (let i = 0; i < 50; i++) {
    const u = newUserId();
    await s.db.query('insert into users (id, email, password_hash) values ($1, $2, $3)', [u, `${u}@x.test`, 'x']);
    const [a, b] = s.ids.A < u ? [s.ids.A, u] : [u, s.ids.A];
    await s.db.query('insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, $3, $4, 1)', [a, b, 'pending', s.ids.A]);
  }
  const r = await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.json(), { error: 'Tienes demasiadas solicitudes pendientes.' });
});

test('eventos friend al pedir, aceptar y eliminar; bloquear solo avisa a quien bloquea', async () => {
  const s = await socialSetup(2);
  const got = { A: [], B: [] };
  s.app.bus.subscribe(s.ids.A, (e) => got.A.push(e.type));
  s.app.bus.subscribe(s.ids.B, (e) => got.B.push(e.type));
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  await s.call('POST', `/api/friends/${s.ids.A}/accept`, 'B');
  await s.call('POST', `/api/blocks/${s.ids.B}`, 'A');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got.A, ['friend', 'friend', 'friend']);
  assert.deepEqual(got.B, ['friend', 'friend']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/friends.test.js`
Expected: FAIL (routes do not exist → 404 with a different body).

- [ ] **Step 3: Write the implementation**

```js
// server/src/lib/presence.js
// Quién tiene un stream abierto en ESTE proceso (spec §2). Con un solo servidor en Render es la presencia global.
export function createPresence() {
  const open = new Map();
  return {
    add(uid) { const n = (open.get(uid) || 0) + 1; open.set(uid, n); return n === 1; },
    remove(uid) { const n = (open.get(uid) || 0) - 1; if (n <= 0) { open.delete(uid); return true; } open.set(uid, n); return false; },
    count(uid) { return open.get(uid) || 0; },
    isOnline(uid) { return open.has(uid); },
  };
}
```

```js
// server/src/routes/friends.js
// Amistades y bloqueos (spec 2026-10-13 §4; SR-41, SR-42, SR-46).
import { requireUser } from '../lib/session.js';
import { perUser } from '../lib/limits.js';
import { relation, visible, pairOf, friendIds, publicProfile, toPublic, NOT_FOUND } from '../lib/social-rules.js';
import { UID_RE } from '../lib/validate.js';

const MIN = 60_000;
const MAX_PENDING = 50;
const MAX_FRIENDS = 500;
const notFound = (reply) => reply.code(404).send({ error: NOT_FOUND });

export default async function friendsRoutes(app) {
  const { db, bus } = app;
  const q = (t, p) => db.query(t, p);
  const readLimit = perUser(app, 60, MIN, 'friends-read');
  const writeLimit = perUser(app, 20, MIN, 'friends-write');
  const notify = (to, other) => bus.publish(to, { type: 'friend', id: other });
  const profiles = async (uids) => Promise.all(uids.map(async (u) => toPublic(await publicProfile(q, u))));

  app.get('/api/friends', { preHandler: [requireUser, readLimit] }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const me = req.user.id;
    const rows = (await q("select user_a, user_b, requested_by from friendships where status = 'pending' and (user_a = $1 or user_b = $1)", [me])).rows;
    const other = (r) => (r.user_a === me ? r.user_b : r.user_a);
    const friends = (await profiles(await friendIds(q, me))).map((p) => ({ ...p, online: app.presence.isOnline(p.uid) }));
    friends.sort((x, y) => Number(y.online) - Number(x.online) || x.nick.localeCompare(y.nick));
    return {
      friends,
      incoming: await profiles(rows.filter((r) => r.requested_by !== me).map(other)),
      outgoing: await profiles(rows.filter((r) => r.requested_by === me).map(other)),
    };
  });

  app.post('/api/friends/:uid', { preHandler: [requireUser, writeLimit] }, async (req, reply) => {
    const me = req.user.id; const { uid } = req.params;
    if (!(await visible(q, me, uid))) return notFound(reply);
    const rel = await relation(q, me, uid);
    if (rel === 'friends' || rel === 'pending-out') return { status: rel };
    const [a, b] = pairOf(me, uid);
    const now = app.now();
    if (rel === 'pending-in') {
      await q("update friendships set status = 'accepted', accepted_at = $1 where user_a = $2 and user_b = $3", [now, a, b]);
    } else {
      const pending = (await q("select count(*)::int as n from friendships where status = 'pending' and requested_by = $1", [me])).rows[0].n;
      if (pending >= MAX_PENDING) return reply.code(409).send({ error: 'Tienes demasiadas solicitudes pendientes.' });
      if ((await friendIds(q, me)).length >= MAX_FRIENDS) return reply.code(409).send({ error: 'Has llegado al máximo de amigos.' });
      await q('insert into friendships (user_a, user_b, status, requested_by, created_at) values ($1, $2, $3, $4, $5) on conflict (user_a, user_b) do nothing', [a, b, 'pending', me, now]);
    }
    await notify(me, uid); await notify(uid, me);
    return { status: rel === 'pending-in' ? 'friends' : 'pending-out' };
  });

  app.post('/api/friends/:uid/accept', { preHandler: [requireUser, writeLimit] }, async (req, reply) => {
    const me = req.user.id; const { uid } = req.params;
    if (!(await visible(q, me, uid)) || (await relation(q, me, uid)) !== 'pending-in') return notFound(reply);
    const [a, b] = pairOf(me, uid);
    await q("update friendships set status = 'accepted', accepted_at = $1 where user_a = $2 and user_b = $3", [app.now(), a, b]);
    await notify(me, uid); await notify(uid, me);
    return { status: 'friends' };
  });

  app.delete('/api/friends/:uid', { preHandler: [requireUser, writeLimit] }, async (req) => {
    const me = req.user.id; const { uid } = req.params;
    if (UID_RE.test(uid) && uid !== me) {
      const [a, b] = pairOf(me, uid);
      const r = await q('delete from friendships where user_a = $1 and user_b = $2', [a, b]);
      if (r.rowCount) { await notify(me, uid); await notify(uid, me); }
    }
    return { ok: true };
  });

  app.get('/api/blocks', { preHandler: [requireUser, readLimit] }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const rows = (await q('select blocked from blocks where blocker = $1 order by created_at', [req.user.id])).rows;
    return { blocked: await Promise.all(rows.map(async (r) => ({ uid: r.blocked, nick: (await publicProfile(q, r.blocked)).nick }))) };
  });

  app.post('/api/blocks/:uid', { preHandler: [requireUser, writeLimit] }, async (req, reply) => {
    const me = req.user.id; const { uid } = req.params;
    // Se puede bloquear a quien ya te bloqueó: solo hace falta que exista (no se le notifica, SR-42).
    if (!UID_RE.test(uid) || uid === me || !(await q('select 1 from users where id = $1', [uid])).rows.length) return notFound(reply);
    const [a, b] = pairOf(me, uid);
    await q('insert into blocks (blocker, blocked, created_at) values ($1, $2, $3) on conflict (blocker, blocked) do nothing', [me, uid, app.now()]);
    await q('delete from friendships where user_a = $1 and user_b = $2', [a, b]);
    await notify(me, uid);
    return { ok: true };
  });

  app.delete('/api/blocks/:uid', { preHandler: [requireUser, writeLimit] }, async (req) => {
    if (UID_RE.test(req.params.uid)) await q('delete from blocks where blocker = $1 and blocked = $2', [req.user.id, req.params.uid]);
    return { ok: true };
  });
}
```

In `server/src/app.js`:
- add `import { createPresence } from './lib/presence.js';` and `import friendsRoutes from './routes/friends.js';`;
- after `app.decorate('bus', bus);` add `app.decorate('presence', createPresence());`;
- after `app.register(profilesRoutes);` add `app.register(friendsRoutes);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/friends.test.js && node --test`
Expected: PASS (6 tests); full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/friends.js src/lib/presence.js src/app.js test/friends.test.js
git commit -m "feat(social): amistades, solicitudes y bloqueos"
```

---

### Task 7: Canal en vivo (SSE) y presencia

**Files:**
- Create: `server/src/routes/stream.js`
- Create: `server/src/lib/social-events.js` (turns a bus event into the payload the user is allowed to see)
- Modify: `server/src/app.js`. Add `import streamRoutes from './routes/stream.js';` and `app.register(streamRoutes);`.
- Test: `server/test/stream.test.js`

**Interfaces:**
- Consumes: `app.bus` (Task 4); `app.presence` (Task 6); `relation`, `friendIds` (Task 2); the `messages` table (Task 1); `CSP` and `AT_COOKIE`.
- Produces:
  - `GET /api/stream`: `text/event-stream`. First an `event: hello` with `data: {"uid":...}`, then `event: <type>` with `data: <json>`, and a `: ping` comment every 25 s. It closes at the token's `exp`.
  - `resolveEvent(q, me, evt) → object|null`:
    - `message` → `toMessage(row)`;
    - `read` → `{ uid }`;
    - `friend` → `{ uid, relation }` (`blocked` is shown as `none`);
    - `presence` → `{ uid, online }`, only between friends.
  - `toMessage(row) → { id, from, to, kind, body, at, readAt }` (exported from `social-events.js` and reused in Task 8).

- [ ] **Step 1: Write the failing test**

```js
// server/test/stream.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';

const AT = '__Host-odyle_at';

// Abre el stream contra el servidor real (inject no sirve para respuestas que no terminan).
async function open(base, token) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/stream`, { headers: { cookie: `${AT}=${token}` }, signal: ctrl.signal });
  const events = [];
  let buf = ''; let ended = false;
  if (res.status === 200) {
    (async () => {
      const dec = new TextDecoder();
      try {
        for await (const chunk of res.body) {
          buf += dec.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const type = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (type) events.push({ type, data: JSON.parse(data) });
          }
        }
      } catch { /* abortado */ }
      ended = true;
    })();
  }
  const next = async (type, ms = 1000) => {
    for (let t = 0; t < ms; t += 10) {
      const k = events.findIndex((e) => e.type === type);
      if (k >= 0) return events.splice(k, 1)[0].data;
      await new Promise((r) => setTimeout(r, 10));
    }
    return null;
  };
  return { res, events, next, close: () => ctrl.abort(), get ended() { return ended; } };
}

async function live(n = 2, extra) {
  const s = await socialSetup(n, extra);
  await s.app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${s.app.server.address().port}`;
  return { ...s, base };
}

test('sin sesión → 401; con sesión → hello y cabeceras correctas', async (t) => {
  const s = await live(); t.after(() => s.app.close());
  assert.equal((await fetch(`${s.base}/api/stream`)).status, 401);
  const a = await open(s.base, s.tokens.A);
  assert.equal(a.res.status, 200);
  assert.match(a.res.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(a.res.headers.get('cache-control'), 'no-store');
  assert.ok(a.res.headers.get('content-security-policy'));
  assert.deepEqual(await a.next('hello'), { uid: s.ids.A });
  a.close();
});

test('presencia: solo a amigos; sigue en línea con dos pestañas hasta cerrar la última', async (t) => {
  const s = await live(3); t.after(() => s.app.close());
  await s.befriend('A', 'B');
  const b = await open(s.base, s.tokens.B); await b.next('hello');
  const c = await open(s.base, s.tokens.C); await c.next('hello');
  const a1 = await open(s.base, s.tokens.A); await a1.next('hello');
  assert.deepEqual(await b.next('presence'), { uid: s.ids.A, online: true });
  assert.equal(await c.next('presence', 200), null);
  const a2 = await open(s.base, s.tokens.A); await a2.next('hello');
  a1.close();
  assert.equal(await b.next('presence', 300), null);
  assert.equal((await s.call('GET', '/api/friends', 'B')).json().friends[0].online, true);
  a2.close();
  assert.deepEqual(await b.next('presence'), { uid: s.ids.A, online: false });
  b.close(); c.close();
});

test('cuarta conexión del mismo usuario → 429', async (t) => {
  const s = await live(); t.after(() => s.app.close());
  const open3 = [];
  for (let i = 0; i < 3; i++) { const x = await open(s.base, s.tokens.A); await x.next('hello'); open3.push(x); }
  assert.equal((await open(s.base, s.tokens.A)).res.status, 429);
  open3.forEach((x) => x.close());
});

test('el stream se cierra al caducar el token (Review Focus 1)', async (t) => {
  const s = await live(2, { streamTtlScale: 1 / 15000 }); t.after(() => s.app.close()); // 15 min → 60 ms
  const a = await open(s.base, s.tokens.A); await a.next('hello');
  for (let i = 0; i < 100 && !a.ended; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(a.ended, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/stream.test.js`
Expected: FAIL (`/api/stream` → 404).

- [ ] **Step 3: Write the implementation**

```js
// server/src/lib/social-events.js
// Convierte un evento del bus en lo que el usuario puede ver, releyendo la base (SR-45).
import { relation } from './social-rules.js';

export const toMessage = (r) => ({
  id: r.id, from: r.sender, to: r.recipient, kind: r.kind, body: r.body,
  at: Number(r.created_at), readAt: r.read_at == null ? null : Number(r.read_at),
});

export async function resolveEvent(q, me, evt) {
  if (!evt || typeof evt.id !== 'string') return null;
  switch (evt.type) {
    case 'message': {
      const row = (await q('select * from messages where id = $1 and (sender = $2 or recipient = $2)', [evt.id, me])).rows[0];
      return row ? toMessage(row) : null;
    }
    case 'read': return { uid: evt.id };
    case 'friend': {
      const rel = await relation(q, me, evt.id);
      return { uid: evt.id, relation: rel === 'blocked' ? 'none' : rel };
    }
    case 'presence':
      return (await relation(q, me, evt.id)) === 'friends' ? { uid: evt.id, online: !!evt.online } : null;
    default: return null;
  }
}
```

```js
// server/src/routes/stream.js
// Canal en vivo por SSE (spec 2026-10-13 §4; SR-44). Solo lectura: GET, sin CSRF, cookie de sesión obligatoria.
import { decodeJwt } from 'jose';
import { requireUser, AT_COOKIE } from '../lib/session.js';
import { perUser } from '../lib/limits.js';
import { friendIds } from '../lib/social-rules.js';
import { resolveEvent } from '../lib/social-events.js';
import { CSP } from '../app.js';

const MAX_OPEN = 3;
const HEARTBEAT_MS = 25_000;

export default async function streamRoutes(app) {
  const { db, bus, presence } = app;
  const q = (t, p) => db.query(t, p);
  const connectLimit = perUser(app, 10, 60_000, 'stream');
  const announce = async (uid, online) => {
    for (const f of await friendIds(q, uid)) await bus.publish(f, { type: 'presence', id: uid, online });
  };

  app.get('/api/stream', { preHandler: [requireUser, connectLimit] }, async (req, reply) => {
    const me = req.user.id;
    if (presence.count(me) >= MAX_OPEN) {
      return reply.code(429).header('cache-control', 'no-store').send({ error: 'Demasiadas conexiones abiertas.' });
    }
    // requireUser ya validó el token; aquí solo se lee su caducidad para cerrar a tiempo.
    const exp = Number(decodeJwt(req.cookies[AT_COOKIE]).exp) * 1000;
    const ttl = Math.max(0, (exp - app.now()) * app.streamTtlScale);

    reply.hijack();
    const res = reply.raw;
    // Con hijack no corren los hooks onSend: las cabeceras de seguridad se ponen aquí.
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'x-content-type-options': 'nosniff',
      'content-security-policy': CSP,
    });
    const send = (type, data) => { if (!res.writableEnded) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); };
    send('hello', { uid: me });

    const unsubscribe = bus.subscribe(me, async (evt) => {
      const payload = await resolveEvent(q, me, evt);
      if (payload) send(evt.type, payload);
    });
    if (presence.add(me)) await announce(me, true);

    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, HEARTBEAT_MS);
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat); clearTimeout(expiry); unsubscribe();
      if (!res.writableEnded) res.end();
      if (presence.remove(me)) await announce(me, false).catch(() => {});
    };
    const expiry = setTimeout(close, ttl);
    req.raw.on('close', close);
  });
}
```

In `server/src/app.js`:
- add `import streamRoutes from './routes/stream.js';`;
- add `streamTtlScale = 1` to the `buildApp({...})` parameters (used only by tests to shorten the token lifetime);
- after `app.decorate('presence', createPresence());` add `app.decorate('streamTtlScale', streamTtlScale);`;
- after `app.register(friendsRoutes);` add `app.register(streamRoutes);`.

`stream.js` imports `CSP` from `app.js`, and `app.js` imports `stream.js`. This circular import is safe because `CSP` is a top-level `export const` and is only read inside the handler at request time.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/stream.test.js && node --test`
Expected: PASS (4 tests); full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/stream.js src/lib/social-events.js src/app.js test/stream.test.js
git commit -m "feat(social): canal en vivo por SSE con presencia y cierre al caducar"
```

---

### Task 8: Mensajes y conversaciones

**Files:**
- Create: `server/src/routes/messages.js`
- Modify: `server/src/app.js`. Add `import messagesRoutes from './routes/messages.js';` and `app.register(messagesRoutes);`.
- Test: `server/test/messages.test.js`

**Interfaces:**
- Consumes:
  - `relation`, `visible`, `pairKey`, `blockedEither`, `publicProfile`, `toPublic`, `NOT_FOUND` (Task 2);
  - `cleanText` (Task 3); `perUser` (Task 1); `toMessage` (Task 7); `app.bus` (Task 4); `randomToken` from `src/lib/tokens.js`.
- Produces:
  - `POST /api/messages/:uid` with body `{kind:'text', text, clientId?}` or `{kind:'invite', title, at, slots, cost, clientId?}` → `{ message: toMessage }`
  - `GET /api/messages/:uid?before=<ms>` → `{ messages: toMessage[] }`, newest first, at most 50
  - `POST /api/messages/:uid/read` → `{ ok: true }`
  - `GET /api/conversations` → `{ conversations: [{ profile: toPublic, last: toMessage, unread: number, friend: boolean }] }`, ordered by `last.at` descending
  - bus events: `{type:'message', id}` to sender and recipient; `{type:'read', id: reader}` to the other user

- [ ] **Step 1: Write the failing test**

```js
// server/test/messages.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';

const say = (s, from, to, text, extra = {}) => s.call('POST', `/api/messages/${s.ids[to]}`, from, { kind: 'text', text, ...extra });

test('amigos se escriben; el texto se limpia; historial del más nuevo al más viejo', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const r = await say(s, 'A', 'B', '  hola‮ Nahma  ');
  assert.equal(r.statusCode, 200);
  const m = r.json().message;
  assert.deepEqual({ from: m.from, to: m.to, kind: m.kind, body: m.body, readAt: m.readAt }, { from: s.ids.A, to: s.ids.B, kind: 'text', body: { text: 'hola Nahma' }, readAt: null });
  await say(s, 'B', 'A', 'buenas');
  const h = (await s.call('GET', `/api/messages/${s.ids.A}`, 'B')).json().messages;
  assert.deepEqual(h.map((x) => x.body.text), ['buenas', 'hola Nahma']);
});

test('no amigos, pendientes y bloqueados no pueden escribir: mismo 404', async () => {
  const s = await socialSetup(3);
  await s.call('POST', `/api/friends/${s.ids.B}`, 'A');
  await s.befriend('A', 'C'); await s.block('C', 'A');
  const bodies = new Set();
  for (const to of ['B', 'C']) { const r = await say(s, 'A', to, 'hola'); assert.equal(r.statusCode, 404); bodies.add(r.body); }
  const r = await s.call('POST', `/api/messages/u_${'z'.repeat(22)}`, 'A', { kind: 'text', text: 'hola' });
  bodies.add(r.body);
  assert.equal(bodies.size, 1);
});

test('validación: vacío, demasiado largo, tipo desconocido e invitación', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  assert.equal((await say(s, 'A', 'B', '   ')).statusCode, 400);
  assert.equal((await say(s, 'A', 'B', 'x'.repeat(1001))).statusCode, 400);
  assert.equal((await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'html', text: 'x' })).statusCode, 400);
  const inv = await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'invite', title: 'Theobomos', at: s.NOW + 3600_000, slots: 6, cost: 80 });
  assert.equal(inv.statusCode, 200);
  assert.deepEqual(inv.json().message.body, { title: 'Theobomos', at: s.NOW + 3600_000, slots: 6, cost: 80 });
  assert.equal((await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'invite', title: 'x', at: 1, slots: 13, cost: 0 })).statusCode, 400);
});

test('reintento con el mismo clientId no duplica (Review Focus 4)', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const one = (await say(s, 'A', 'B', 'hola', { clientId: 'abcdefgh1' })).json().message;
  const two = (await say(s, 'A', 'B', 'hola', { clientId: 'abcdefgh1' })).json().message;
  assert.equal(one.id, two.id);
  assert.equal((await s.call('GET', `/api/messages/${s.ids.B}`, 'A')).json().messages.length, 1);
});

test('te eliminan mientras escribes: enviar 404, historial legible (Review Focus 5)', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  await say(s, 'A', 'B', 'antes');
  await s.call('DELETE', `/api/friends/${s.ids.A}`, 'B');
  assert.equal((await say(s, 'A', 'B', 'después')).statusCode, 404);
  assert.deepEqual((await s.call('GET', `/api/messages/${s.ids.B}`, 'A')).json().messages.map((m) => m.body.text), ['antes']);
  await s.block('B', 'A');
  assert.equal((await s.call('GET', `/api/messages/${s.ids.B}`, 'A')).statusCode, 404);
});

test('paginación con before y límite de 50', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  for (let i = 0; i < 60; i++) {
    await s.db.query(`insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id) values ($1, $2, $3, $4, 'text', $5::jsonb, $6, $1)`,
      [`m${i}`, [s.ids.A, s.ids.B].sort().join('|'), s.ids.A, s.ids.B, JSON.stringify({ text: String(i) }), 1000 + i]);
  }
  const p1 = (await s.call('GET', `/api/messages/${s.ids.B}`, 'A')).json().messages;
  assert.equal(p1.length, 50); assert.equal(p1[0].body.text, '59');
  const p2 = (await s.call('GET', `/api/messages/${s.ids.B}?before=${p1[49].at}`, 'A')).json().messages;
  assert.deepEqual(p2.map((m) => m.body.text), ['9', '8', '7', '6', '5', '4', '3', '2', '1', '0']);
  assert.equal((await s.call('GET', `/api/messages/${s.ids.B}?before=abc`, 'A')).statusCode, 400);
});

test('leído, no leídos y lista de conversaciones', async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B'); await s.befriend('A', 'C');
  await s.doc(`members/${s.ids.B}`, { joinedAt: 1, profile: { nick: 'Nahma' } });
  await say(s, 'B', 'A', 'uno'); await say(s, 'B', 'A', 'dos'); await say(s, 'A', 'C', 'hola C');
  const c1 = (await s.call('GET', '/api/conversations', 'A')).json().conversations;
  const byB = c1.find((c) => c.profile.uid === s.ids.B);
  assert.equal(byB.unread, 2); assert.equal(byB.last.body.text, 'dos'); assert.equal(byB.profile.nick, 'Nahma'); assert.equal(byB.friend, true);
  assert.deepEqual((await s.call('POST', `/api/messages/${s.ids.B}/read`, 'A')).json(), { ok: true });
  assert.equal((await s.call('GET', '/api/conversations', 'A')).json().conversations.find((c) => c.profile.uid === s.ids.B).unread, 0);
});

test('eventos: message al remitente y al destinatario; read al otro', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const got = { A: [], B: [] };
  s.app.bus.subscribe(s.ids.A, (e) => got.A.push(e.type));
  s.app.bus.subscribe(s.ids.B, (e) => got.B.push(e.type));
  await say(s, 'A', 'B', 'hola');
  await s.call('POST', `/api/messages/${s.ids.A}/read`, 'B');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got.A, ['message', 'read']);
  assert.deepEqual(got.B, ['message']);
});

test('31.º mensaje en un minuto → 429', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  for (let i = 0; i < 30; i++) assert.equal((await say(s, 'A', 'B', `m${i}`)).statusCode, 200);
  assert.equal((await say(s, 'A', 'B', 'm30')).statusCode, 429);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/messages.test.js`
Expected: FAIL (routes do not exist).

- [ ] **Step 3: Write the implementation**

```js
// server/src/routes/messages.js
// Mensajes 1 a 1 entre amigos (spec 2026-10-13 §4; SR-41, SR-42, SR-43, SR-46, SR-47).
import { requireUser } from '../lib/session.js';
import { perUser } from '../lib/limits.js';
import { relation, visible, pairKey, blockedEither, publicProfile, toPublic, NOT_FOUND } from '../lib/social-rules.js';
import { cleanText, UID_RE } from '../lib/validate.js';
import { toMessage } from '../lib/social-events.js';
import { randomToken } from '../lib/tokens.js';

const MIN = 60_000;
const PAGE = 50;
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const notFound = (reply) => reply.code(404).send({ error: NOT_FOUND });
const bad = (reply, error) => reply.code(400).send({ error });
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// Devuelve { kind, body } limpio o { error }.
function parseBody(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Mensaje no válido.' };
  if (b.kind === 'text') {
    const text = cleanText(b.text, 1000, true);
    return text ? { kind: 'text', body: { text } } : { error: 'El mensaje debe tener entre 1 y 1000 caracteres.' };
  }
  if (b.kind === 'invite') {
    const title = cleanText(b.title, 60);
    if (!title || typeof b.at !== 'number' || !Number.isFinite(b.at) || !isInt(b.slots, 1, 12) || !isInt(b.cost, 0, 840)) {
      return { error: 'Invitación no válida.' };
    }
    return { kind: 'invite', body: { title, at: b.at, slots: b.slots, cost: b.cost } };
  }
  return { error: 'Tipo de mensaje no válido.' };
}

export default async function messagesRoutes(app) {
  const { db, bus } = app;
  const q = (t, p) => db.query(t, p);
  const sendLimit = perUser(app, 30, MIN, 'msg-send');
  const readLimit = perUser(app, 120, MIN, 'msg-read');
  const listLimit = perUser(app, 60, MIN, 'msg-list');

  // Se puede leer el historial con amigos o con quien ya hubo mensajes, salvo bloqueo (SR-42: si no, 404).
  async function canReadHistory(me, uid) {
    if (!(await visible(q, me, uid))) return false;
    if ((await relation(q, me, uid)) === 'friends') return true;
    return (await q('select 1 from messages where pair_key = $1 limit 1', [pairKey(me, uid)])).rows.length > 0;
  }

  app.post('/api/messages/:uid', { preHandler: [requireUser, sendLimit] }, async (req, reply) => {
    const me = req.user.id; const { uid } = req.params;
    if (!(await visible(q, me, uid)) || (await relation(q, me, uid)) !== 'friends') return notFound(reply);
    const parsed = parseBody(req.body);
    if (parsed.error) return bad(reply, parsed.error);
    const clientId = typeof req.body.clientId === 'string' && CLIENT_ID_RE.test(req.body.clientId) ? req.body.clientId : randomToken();
    const id = randomToken();
    await q(
      `insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) on conflict (sender, client_id) do nothing`,
      [id, pairKey(me, uid), me, uid, parsed.kind, JSON.stringify(parsed.body), app.now(), clientId],
    );
    const row = (await q('select * from messages where sender = $1 and client_id = $2', [me, clientId])).rows[0];
    if (row.id === id) { await bus.publish(uid, { type: 'message', id }); await bus.publish(me, { type: 'message', id }); }
    return { message: toMessage(row) };
  });

  app.get('/api/messages/:uid', { preHandler: [requireUser, readLimit] }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const me = req.user.id; const { uid } = req.params;
    const keys = Object.keys(req.query || {});
    if (keys.some((k) => k !== 'before')) return bad(reply, 'Consulta no válida.');
    let before = Number.MAX_SAFE_INTEGER;
    if (req.query.before !== undefined) {
      if (typeof req.query.before !== 'string' || !/^\d{1,15}$/.test(req.query.before)) return bad(reply, 'Consulta no válida.');
      before = Number(req.query.before);
    }
    if (!(await canReadHistory(me, uid))) return notFound(reply);
    const rows = (await q(`select * from messages where pair_key = $1 and created_at < $2 order by created_at desc, id desc limit ${PAGE}`, [pairKey(me, uid), before])).rows;
    return { messages: rows.map(toMessage) };
  });

  app.post('/api/messages/:uid/read', { preHandler: [requireUser, readLimit] }, async (req, reply) => {
    const me = req.user.id; const { uid } = req.params;
    if (!(await canReadHistory(me, uid))) return notFound(reply);
    const r = await q('update messages set read_at = $1 where pair_key = $2 and recipient = $3 and read_at is null', [app.now(), pairKey(me, uid), me]);
    if (r.rowCount) await bus.publish(uid, { type: 'read', id: me });
    return { ok: true };
  });

  app.get('/api/conversations', { preHandler: [requireUser, listLimit] }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const me = req.user.id;
    const rows = (await q('select * from messages where sender = $1 or recipient = $1 order by created_at desc limit 500', [me])).rows;
    const unread = new Map((await q('select sender, count(*)::int as n from messages where recipient = $1 and read_at is null group by sender', [me])).rows.map((r) => [r.sender, r.n]));
    const blocked = await blockedEither(q, me);
    const seen = new Map();
    for (const r of rows) {
      const other = r.sender === me ? r.recipient : r.sender;
      if (!blocked.has(other) && !seen.has(other) && UID_RE.test(other)) seen.set(other, r);
      if (seen.size === 50) break;
    }
    const conversations = [];
    for (const [other, r] of seen) {
      conversations.push({
        profile: toPublic(await publicProfile(q, other)),
        last: toMessage(r),
        unread: unread.get(other) || 0,
        friend: (await relation(q, me, other)) === 'friends',
      });
    }
    return { conversations };
  });
}
```

In `server/src/app.js` add `import messagesRoutes from './routes/messages.js';` and, after `app.register(streamRoutes);`, the line `app.register(messagesRoutes);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/messages.test.js && node --test`
Expected: PASS (9 tests); full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/messages.js src/app.js test/messages.test.js
git commit -m "feat(social): mensajes entre amigos, historial, leídos y conversaciones"
```

---

### Task 9: Denuncias y retención de mensajes

**Files:**
- Create: `server/src/routes/reports.js`
- Create: `server/src/lib/retention.js`
- Modify: `server/src/app.js`. Add `import reportsRoutes from './routes/reports.js';` and `app.register(reportsRoutes);`.
- Modify: `server/src/index.js`. Run the purge at startup and every 6 h.
- Test: `server/test/reports.test.js`

**Interfaces:**
- Consumes: `perUser` (Task 1); `cleanText` and `UID_RE` (Task 3); `pairKey` and `NOT_FOUND` (Task 2); `randomToken`.
- Produces:
  - `POST /api/reports` with body `{uid, messageId?, reason: 'spam'|'abuse'|'cheating'|'other', note?}` → `{ ok: true }`
  - `purgeOldMessages(db, now) → number`, the number of messages deleted (older than 365 days)
  - `RETENTION_MS = 365 * 24 * 3600 * 1000`

- [ ] **Step 1: Write the failing test**

```js
// server/test/reports.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from './social-helpers.js';
import { purgeOldMessages, RETENTION_MS } from '../src/lib/retention.js';

test('denunciar a un usuario y un mensaje de la conversación; nota limpiada', async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B');
  const m = (await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: 'spam!' })).json().message;
  const r = await s.call('POST', '/api/reports', 'B', { uid: s.ids.A, messageId: m.id, reason: 'spam', note: 'mucho‮ spam' });
  assert.deepEqual(r.json(), { ok: true });
  const row = (await s.db.query('select * from reports')).rows[0];
  assert.equal(row.reporter, s.ids.B); assert.equal(row.reported, s.ids.A); assert.equal(row.message_id, m.id); assert.equal(row.note, 'mucho spam');
  assert.equal((await s.call('POST', '/api/reports', 'C', { uid: s.ids.A, messageId: m.id, reason: 'spam' })).statusCode, 404);
  assert.equal((await s.call('POST', '/api/reports', 'B', { uid: s.ids.A, reason: 'odio' })).statusCode, 400);
  assert.equal((await s.call('POST', '/api/reports', 'B', { uid: s.ids.B, reason: 'spam' })).statusCode, 404);
});

test('11.ª denuncia en una hora → 429', async () => {
  const s = await socialSetup(2);
  for (let i = 0; i < 10; i++) assert.equal((await s.call('POST', '/api/reports', 'B', { uid: s.ids.A, reason: 'other' })).statusCode, 200);
  assert.equal((await s.call('POST', '/api/reports', 'B', { uid: s.ids.A, reason: 'other' })).statusCode, 429);
});

test('retención: borra solo mensajes de más de 365 días', async () => {
  const s = await socialSetup(2);
  const ins = (id, at) => s.db.query(`insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id) values ($1, 'k', $2, $3, 'text', '{"text":"x"}'::jsonb, $4, $1)`, [id, s.ids.A, s.ids.B, at]);
  await ins('viejo', s.NOW - RETENTION_MS - 1);
  await ins('nuevo', s.NOW - RETENTION_MS + 1);
  assert.equal(await purgeOldMessages(s.db, s.NOW), 1);
  assert.deepEqual((await s.db.query('select id from messages')).rows.map((r) => r.id), ['nuevo']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/reports.test.js`
Expected: FAIL (`Cannot find module '../src/lib/retention.js'`).

- [ ] **Step 3: Write the implementation**

```js
// server/src/lib/retention.js
// Los mensajes se guardan 1 año (spec 2026-10-13 §3).
export const RETENTION_MS = 365 * 24 * 3600 * 1000;

export async function purgeOldMessages(db, now) {
  const r = await db.query('delete from messages where created_at < $1', [now - RETENTION_MS]);
  return r.rowCount;
}
```

```js
// server/src/routes/reports.js
// Denuncias de perfiles o mensajes (spec 2026-10-13 §4; SR-46, SR-47).
import { requireUser } from '../lib/session.js';
import { perUser } from '../lib/limits.js';
import { pairKey, NOT_FOUND } from '../lib/social-rules.js';
import { cleanText, UID_RE } from '../lib/validate.js';
import { randomToken } from '../lib/tokens.js';

const REASONS = new Set(['spam', 'abuse', 'cheating', 'other']);

export default async function reportsRoutes(app) {
  const { db } = app;
  const q = (t, p) => db.query(t, p);
  const limit = perUser(app, 10, 3_600_000, 'report');

  app.post('/api/reports', { preHandler: [requireUser, limit] }, async (req, reply) => {
    const me = req.user.id;
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (!REASONS.has(b.reason)) return reply.code(400).send({ error: 'Motivo no válido.' });
    const note = b.note === undefined ? null : cleanText(b.note, 500, true);
    if (b.note !== undefined && note === null) return reply.code(400).send({ error: 'La nota debe tener entre 1 y 500 caracteres.' });
    // Se puede denunciar aunque haya bloqueo; solo hace falta que exista y no sea uno mismo.
    if (typeof b.uid !== 'string' || !UID_RE.test(b.uid) || b.uid === me
      || !(await q('select 1 from users where id = $1', [b.uid])).rows.length) {
      return reply.code(404).send({ error: NOT_FOUND });
    }
    let messageId = null;
    if (b.messageId !== undefined) {
      const ok = typeof b.messageId === 'string'
        && (await q('select 1 from messages where id = $1 and pair_key = $2 and sender = $3', [b.messageId, pairKey(me, b.uid), b.uid])).rows.length;
      if (!ok) return reply.code(404).send({ error: NOT_FOUND });
      messageId = b.messageId;
    }
    await q('insert into reports (id, reporter, reported, message_id, reason, note, created_at) values ($1, $2, $3, $4, $5, $6, $7)',
      [randomToken(), me, b.uid, messageId, b.reason, note, app.now()]);
    return { ok: true };
  });
}
```

In `server/src/app.js` add `import reportsRoutes from './routes/reports.js';` and, after `app.register(messagesRoutes);`, the line `app.register(reportsRoutes);`.

In `server/src/index.js`, add `import { purgeOldMessages } from './lib/retention.js';` and, after `await app.listen(...)`:

```js
// Retención de mensajes: al arrancar y cada 6 h (spec §3). Un fallo se registra y se reintenta en la siguiente vuelta.
const purge = () => purgeOldMessages(db, Date.now()).then((n) => n && app.log.info({ n }, 'mensajes antiguos borrados'), (e) => app.log.error({ code: e && e.code }, 'fallo al borrar mensajes antiguos'));
await purge();
setInterval(purge, 6 * 3600 * 1000).unref();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/reports.test.js && node --test`
Expected: PASS (3 tests); full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/reports.js src/lib/retention.js src/app.js src/index.js test/reports.test.js
git commit -m "feat(social): denuncias y borrado de mensajes de más de un año"
```

---

### Task 10: Pruebas de ataque sociales

**Files:**
- Create: `server/test/attacks/social-idor.test.js`
- Create: `server/test/attacks/social-enum.test.js`
- Create: `server/test/attacks/social-xss.test.js`
- Create: `server/test/attacks/social-sse.test.js`
- Create: `server/test/attacks/social-cascade.test.js`

**Interfaces:**
- Consumes: `socialSetup` (Task 5) and every route from Tasks 5–9. No new production code. If a test fails, fix the route it attacks and say which one in the commit message.

- [ ] **Step 1: Write the attack tests**

```js
// server/test/attacks/social-idor.test.js
// SR-40, SR-41: nadie lee energía ni mensajes ajenos manipulando ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';

test('C no lee la conversación de A y B ni puede marcarla como leída', async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B');
  await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: 'secreto' });
  assert.equal((await s.call('GET', `/api/messages/${s.ids.A}`, 'C')).statusCode, 404);
  assert.equal((await s.call('POST', `/api/messages/${s.ids.A}/read`, 'C')).statusCode, 404);
  assert.deepEqual((await s.call('GET', '/api/conversations', 'C')).json().conversations, []);
});

test('la energía no sale por docs ni por perfil sin amistad', async () => {
  const s = await socialSetup(2);
  await s.doc(`members/${s.ids.B}/characters/c1`, { name: 'Nahma', energy: 840 });
  assert.notEqual((await s.call('GET', `/api/docs/members/${s.ids.B}/characters`, 'A')).statusCode, 200);
  assert.equal((await s.call('GET', `/api/profiles/${s.ids.B}`, 'A')).json().characters, null);
});

test('respuesta del perfil sin correo ni campos internos', async () => {
  const s = await socialSetup(2);
  await s.befriend('A', 'B');
  const body = (await s.call('GET', `/api/profiles/${s.ids.B}`, 'A')).body;
  assert.ok(!body.includes('@example.com'));
  assert.ok(!/password|token|hash|legionEpoch/i.test(body));
});
```

```js
// server/test/attacks/social-enum.test.js
// SR-42: desconocido, bloqueado y "me bloqueó" dan exactamente la misma respuesta (Review Focus 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';

test('mismo código y cuerpo en perfil, amistad, aceptar y mensajes', async () => {
  const s = await socialSetup(3);
  await s.block('B', 'A');
  await s.block('A', 'C');
  const ghost = `u_${'q'.repeat(22)}`;
  const probes = [
    (u) => s.call('GET', `/api/profiles/${u}`, 'A'),
    (u) => s.call('POST', `/api/friends/${u}`, 'A'),
    (u) => s.call('POST', `/api/friends/${u}/accept`, 'A'),
    (u) => s.call('POST', `/api/messages/${u}`, 'A', { kind: 'text', text: 'hola' }),
    (u) => s.call('GET', `/api/messages/${u}`, 'A'),
  ];
  for (const probe of probes) {
    const seen = new Set();
    for (const u of [ghost, s.ids.B, s.ids.C]) {
      const r = await probe(u);
      seen.add(`${r.statusCode} ${r.body}`);
    }
    assert.equal(seen.size, 1, [...seen].join(' | '));
    assert.match([...seen][0], /^404 /);
  }
});

test('la búsqueda no revela a quien te bloqueó ni a quien bloqueaste', async () => {
  const s = await socialSetup(3);
  await s.doc(`members/${s.ids.B}`, { joinedAt: 1, profile: { nick: 'Nahma' } });
  await s.doc(`members/${s.ids.C}`, { joinedAt: 1, profile: { nick: 'Nahrun' } });
  await s.block('B', 'A'); await s.block('A', 'C');
  assert.deepEqual((await s.call('GET', '/api/profiles/search?q=nah', 'A')).json().results, []);
});
```

```js
// server/test/attacks/social-xss.test.js
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
```

```js
// server/test/attacks/social-sse.test.js
// SR-44: el stream exige sesión válida y no acepta tokens por URL; con token alterado → 401.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';

test('token en la URL, token alterado y POST al stream', async (t) => {
  const s = await socialSetup(1);
  await s.app.listen({ port: 0, host: '127.0.0.1' });
  t.after(() => s.app.close());
  const base = `http://127.0.0.1:${s.app.server.address().port}`;
  assert.equal((await fetch(`${base}/api/stream?token=${s.tokens.A}`)).status, 401);
  assert.equal((await fetch(`${base}/api/stream`, { headers: { cookie: `__Host-odyle_at=${s.tokens.A.slice(0, -3)}AAA` } })).status, 401);
  const post = await fetch(`${base}/api/stream`, { method: 'POST', headers: { cookie: `__Host-odyle_at=${s.tokens.A}`, origin: 'https://evil.test' } });
  assert.ok([403, 404].includes(post.status));
});

test('un evento de un mensaje ajeno publicado a mano no llega (se relee y se filtra)', async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B');
  const m = (await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: 'secreto' })).json().message;
  const { resolveEvent } = await import('../../src/lib/social-events.js');
  assert.equal(await resolveEvent((q, p) => s.db.query(q, p), s.ids.C, { type: 'message', id: m.id }), null);
  assert.equal(await resolveEvent((q, p) => s.db.query(q, p), s.ids.C, { type: 'presence', id: s.ids.A, online: true }), null);
});
```

```js
// server/test/attacks/social-cascade.test.js
// SR-48: borrar la cuenta borra amistades, bloqueos, mensajes y denuncias propias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialSetup } from '../social-helpers.js';
import { REAL_PG } from '../helpers.js';

test('cascada al borrar un usuario', { skip: !REAL_PG && 'pg-mem no aplica ON DELETE CASCADE de forma fiable; corre con scripts/test-pg.sh' }, async () => {
  const s = await socialSetup(3);
  await s.befriend('A', 'B'); await s.block('A', 'C');
  await s.call('POST', `/api/messages/${s.ids.B}`, 'A', { kind: 'text', text: 'hola' });
  await s.call('POST', '/api/reports', 'A', { uid: s.ids.C, reason: 'spam' });
  await s.db.query('delete from users where id = $1', [s.ids.A]);
  for (const t of ['friendships', 'blocks', 'messages', 'reports']) {
    assert.equal((await s.db.query(`select count(*)::int as n from ${t}`)).rows[0].n, 0, t);
  }
});
```

- [ ] **Step 2: Run the attack tests**

Run: `node --test test/attacks/social-*.test.js`
Expected: PASS. The cascade test is skipped without Postgres.

If a test fails, the bug is in production code. Fix the route the test names, keep the test as written, and rerun.

- [ ] **Step 3: Run the whole suite and the real-Postgres suite**

Run: `node --test`
Expected: all PASS.

Run: `bash scripts/test-pg.sh` (requires Docker or a local Postgres 16, as in the README).
Expected: all PASS, including `PgBus` and the cascade.

If Postgres is not available on this machine, note "test-pg pendiente" in the task report. Do not mark it as passed.

- [ ] **Step 4: Commit**

```bash
git add test/attacks/social-*.test.js
git commit -m "test(social): pruebas de ataque de IDOR, enumeración, XSS, SSE y cascada"
```

---

### Task 11: Modelo de amenazas y documentación

**Files:**
- Modify: `docs/security/threat-model.md`. Add a §4.9 "Social y tiempo real" subsection under §4, append SR-39 to SR-48 at the end of §5, and add rows to the §6 table.
- Modify: `README.md`. In the "Funciones › Comunidad y legión" section, add a bullet for amigos, chat en vivo y búsqueda (web only). In the scripts and tests table, add nothing (the commands do not change).

**Interfaces:**
- Consumes: the SR numbers and test file names from Tasks 1–10.

- [ ] **Step 1: Add §4.9 to the threat model** (after §4.8, before `## 5.`):

```markdown
### 4.9 Social y tiempo real (`/api/profiles`, `/api/friends`, `/api/blocks`, `/api/messages`, `/api/conversations`, `/api/reports`, `/api/stream`)

| Amenaza (STRIDE) | Ejemplo | Mitigación |
|---|---|---|
| Revelación (I) | Leer la energía o los mensajes de alguien que no es tu amigo cambiando el uid | Reglas en `social-rules.js`; energía solo con amistad + `shareEnergy` (SR-40, SR-41) |
| Revelación (I) | Saber si alguien te bloqueó o si un uid existe por la respuesta | Respuesta 404 idéntica para desconocido, bloqueado y "me bloqueó" (SR-42) |
| Manipulación (T) | Mensaje con HTML, controles o marcas bidi | `cleanText` + pintado con `textContent` + CSP (SR-43) |
| Suplantación (S) | Abrir el stream de otro con un token en la URL o caducado | Solo cookie de sesión; cierre al `exp`; 3 conexiones máx. (SR-44) |
| Revelación (I) | Contenido de mensajes en el canal `NOTIFY` o entregado tras perder la amistad | `NOTIFY` solo con ids; el receptor relee y vuelve a comprobar (SR-45) |
| Denegación (D) | Spam de solicitudes, mensajes, búsquedas o conexiones | Límites por usuario y máximo de 50 solicitudes pendientes (SR-46) |
```

- [ ] **Step 2: Append to §5** (after SR-38):

```markdown
- **SR-39** Las rutas sociales solo devuelven campos de una lista blanca (`toPublic`, `toMessage`): nunca correo, hashes ni datos internos de la legión.
- **SR-40** La energía y los personajes de otro usuario solo se devuelven con amistad aceptada, sin bloqueo y con `shareEnergy`.
- **SR-41** No se pueden enviar mensajes sin amistad aceptada; el bloqueo corta perfil, solicitudes, mensajes e historial en ambos sentidos.
- **SR-42** Para un uid desconocido, mal formado, bloqueado o que te bloqueó, la respuesta es la misma: `404 {"error":"No encontrado."}`.
- **SR-43** Los textos de mensajes y denuncias pasan por `cleanText` (controles y bidi fuera, máximos 1000/500) y el cliente los pinta con `textContent`.
- **SR-44** `/api/stream` exige la cookie de sesión (nunca token en la URL), es de solo lectura, admite 3 conexiones por usuario y se cierra al caducar el token de acceso.
- **SR-45** La carga útil de `NOTIFY` lleva solo `{to, type, id}`; el servidor relee el dato y vuelve a comprobar los permisos antes de enviarlo.
- **SR-46** Límites por usuario: búsqueda 30/min, perfil 60/min, cambios de amistad 20/min, mensajes 30/min, denuncias 10/h, stream 10/min; máximo 50 solicitudes pendientes y 500 amigos.
- **SR-47** Los ids de mensajes y denuncias son aleatorios de 256 bits (`randomToken`).
- **SR-48** Borrar un usuario borra en cascada sus amistades, bloqueos, mensajes y denuncias; los mensajes caducan a los 365 días.
```

- [ ] **Step 3: Add rows to the §6 table:**

```markdown
| `social-idor.test.js` | C no lee la conversación de A y B; la energía no sale sin amistad; el perfil no expone correo ni campos internos (SR-39, SR-40, SR-41) |
| `social-enum.test.js` | Desconocido, bloqueado y "me bloqueó" dan respuesta idéntica en perfil, amistad, aceptar y mensajes; la búsqueda los omite (SR-42) |
| `social-xss.test.js` | HTML y bidi en mensajes salen limpios y como JSON con CSP (SR-43) |
| `social-sse.test.js` | Token por URL o alterado ⇒ 401; un evento ajeno se filtra al releer (SR-44, SR-45) |
| `social-cascade.test.js` | Borrar un usuario vacía sus filas sociales (SR-48; solo con Postgres real) |
```

- [ ] **Step 4: Update the README.** Under **Comunidad y legión**, after the line that starts with `- «Busco grupo»`, add:

```markdown
- **Amigos, chat en vivo y búsqueda de perfiles** (solo versión web): busca jugadores por nombre, envía solicitudes, chatea en tiempo real con tus amigos e invítalos a grupo. Cada uno decide si aparece en la búsqueda y si comparte su energía.
```

- [ ] **Step 5: Verify and commit**

Run: `node --test` (from `server/`)
Expected: all PASS.

```bash
git add ../docs/security/threat-model.md ../README.md
git commit -m "docs(social): requisitos SR-39..SR-48 y funciones nuevas en el README"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura de la spec:**

  | Sección de la spec | Dónde queda |
  |---|---|
  | §2 Arquitectura | Tasks 2, 4 y 7 |
  | §3 Datos | Tasks 1 y 3 |
  | §3 Retención | Task 9 |
  | §4 API | Tasks 5–9 |
  | §5 Seguridad | Tasks 10 y 11 |
  | §8 Casos límite: petición cruzada | Task 6 |
  | §8 Casos límite: eliminado mientras escribes y reintento | Task 8 |
  | §8 Casos límite: 503 | Ya cubierto por el manejador global |
  | §9 Pruebas de servidor | Tasks 1–10 |
  | §9 Pruebas E2E, de cliente y de diseño | Plan 2 |
  | §6 y §7 Tema, orbe e interfaz | Plan 2 |

- **Desviaciones conscientes de la spec:**
  - Sin `CHECK` ni índices parciales o de expresión (pg-mem). Los valores se validan en código y el comportamiento no cambia.
  - Fechas en `bigint` ms.
  - `client_id` obligatorio: si falta, se genera.
- **Tipos coherentes:**
  - `relation()` devuelve los mismos 6 valores en todas las tareas.
  - `toMessage` se define en la Task 7 y se reutiliza en la 8.
  - `perUser(app, max, windowMs, name)` tiene la misma firma en todas las rutas.
  - Los eventos del bus siempre tienen la forma `{type, id, online?}`.
