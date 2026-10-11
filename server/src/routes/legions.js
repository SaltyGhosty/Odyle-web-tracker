import { requireUser } from '../lib/session.js';
import { randomToken } from '../lib/tokens.js';
import { generateCode, codeHash, sealCode, openCode } from '../lib/legion-codes.js';
import { normalizeCode, parseLegionName } from '../../../legion.js';

const HOUR = 3_600_000;
const TOO_MANY = 'Demasiados intentos. Prueba más tarde.';
const err = (reply, code, error) => reply.code(code).send({ error });
const isObj = (b) => b && typeof b === 'object' && !Array.isArray(b);

export default async function legionsRoutes(app) {
  const { db, config } = app;

  const limit = (max, keyOf) => {
    const check = app.createRateLimit({
      max, timeWindow: HOUR, keyGenerator: keyOf,
      errorResponseBuilder: () => Object.assign(new Error(TOO_MANY), { statusCode: 429 }),
    });
    return async (req, reply) => {
      const r = await check(req);
      if (!r.isAllowed && r.isExceeded) {
        reply.header('retry-after', r.ttlInSeconds);
        return reply.code(429).header('cache-control', 'no-store').send({ error: TOO_MANY });
      }
    };
  };
  const joinLimits = [limit(10, (req) => `u|${req.user.id}`), limit(30, (req) => `ip|${req.ip}`)];

  const readDoc = async (q, path) => (await q('select data from docs where path = $1', [path])).rows[0]?.data ?? null;
  const writeDoc = (q, path, data, now) => q(
    `insert into docs (path, parent, data, updated_at, sort_at) values ($1, $2, $3::jsonb, $4, null)
     on conflict (path) do update set data = excluded.data, updated_at = excluded.updated_at, sort_at = excluded.sort_at`,
    [path, path.slice(0, path.lastIndexOf('/')), JSON.stringify(data), now],
  );
  // Única escritura de legionId/legionEpoch del sistema; crea la ficha si no existe.
  async function setMembership(q, uid, legion, now) {
    const cur = (await readDoc(q, `members/${uid}`)) || { joinedAt: now };
    const next = { ...cur };
    if (legion) { next.legionId = legion.id; next.legionEpoch = legion.epoch; } else { delete next.legionId; delete next.legionEpoch; }
    await writeDoc(q, `members/${uid}`, next, now);
  }
  async function putCode(q, legionId, code) {
    await q('delete from legion_codes where legion_id = $1', [legionId]);
    await q('insert into legion_codes (legion_id, code_hash, code_enc) values ($1, $2, $3)',
      [legionId, codeHash(config.codeKey, code), sealCode(config.codeKey, code, legionId)]);
  }
  // Genera un código sin colisión (la columna code_hash es única).
  async function freshCode(q) {
    for (let i = 0; i < 10; i++) {
      const code = generateCode();
      const used = await q('select 1 from legion_codes where code_hash = $1', [codeHash(config.codeKey, code)]);
      if (!used.rows.length) return code;
    }
    throw new Error('sin códigos libres');
  }
  const leaderLegion = async (q, uid) => {
    const l = await readDoc(q, `legions/${uid}`);
    return l && l.leader === uid ? l : null;
  };

  const pre = { preHandler: requireUser };
  const NOT_LEADER = 'Solo el líder puede hacer esto';

  app.post('/api/legions', pre, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const name = parseLegionName(isObj(req.body) ? req.body.name : '');
    if (!name.ok) return err(reply, 400, name.error);
    const uid = req.user.id;
    const now = app.now();
    const epoch = Date.now().toString(36) + randomToken().slice(0, 6);
    const out = await db.tx(async (q) => {
      if (await leaderLegion(q, uid)) return null;
      const code = await freshCode(q);
      await writeDoc(q, `legions/${uid}`, { name: name.value, epoch, banned: [], createdAt: now, leader: uid }, now);
      await putCode(q, uid, code);
      await setMembership(q, uid, { id: uid, epoch }, now);
      return { id: uid, epoch, code };
    });
    if (!out) return err(reply, 409, 'Ya lideras una legión');
    return out;
  });

  app.post('/api/legions/join', { preHandler: [requireUser, ...joinLimits] }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const code = normalizeCode(isObj(req.body) ? req.body.code : '');
    if (!code) return err(reply, 400, 'Ese código no es válido');
    const uid = req.user.id;
    const now = app.now();
    const res = await db.tx(async (q) => {
      const row = (await q('select legion_id from legion_codes where code_hash = $1', [codeHash(config.codeKey, code)])).rows[0];
      const legion = row ? await readDoc(q, `legions/${row.legion_id}`) : null;
      if (!legion || legion.leader !== row.legion_id) return { status: 400, error: 'Ese código no es válido' };
      if (Array.isArray(legion.banned) && legion.banned.includes(uid)) return { status: 403, error: 'No puedes unirte a esta legión' };
      if (await leaderLegion(q, uid)) return { status: 409, error: 'Ya lideras una legión' };
      await setMembership(q, uid, { id: row.legion_id, epoch: legion.epoch }, now);
      return { body: { id: row.legion_id, epoch: legion.epoch, name: legion.name } };
    });
    return res.error ? err(reply, res.status, res.error) : res.body;
  });

  app.get('/api/legions/mine/code', pre, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    if (!(await leaderLegion(db.query.bind(db), uid))) return err(reply, 403, NOT_LEADER);
    const row = (await db.query('select code_enc from legion_codes where legion_id = $1', [uid])).rows[0];
    const code = row ? openCode(config.codeKey, row.code_enc, uid) : null;
    if (!code) return err(reply, 500, 'Error interno del servidor.');
    return { code };
  });

  app.post('/api/legions/mine/code', pre, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const out = await db.tx(async (q) => {
      if (!(await leaderLegion(q, uid))) return null;
      const code = await freshCode(q);
      await putCode(q, uid, code);
      return { code };
    });
    return out || err(reply, 403, NOT_LEADER);
  });

  app.patch('/api/legions/mine', pre, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const now = app.now();
    const name = parseLegionName(isObj(req.body) ? req.body.name : '');
    const ok = await db.tx(async (q) => {
      const l = await leaderLegion(q, uid);
      if (!l) return false;
      if (!name.ok) return name;
      await writeDoc(q, `legions/${uid}`, { ...l, name: name.value }, now);
      return true;
    });
    if (ok === false) return err(reply, 403, NOT_LEADER);
    if (ok !== true) return err(reply, 400, ok.error);
    return { ok: true };
  });

  app.post('/api/legions/mine/kick', pre, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const now = app.now();
    const target = isObj(req.body) ? req.body.uid : null;
    const res = await db.tx(async (q) => {
      const l = await leaderLegion(q, uid);
      if (!l) return { status: 403, error: NOT_LEADER };
      if (typeof target !== 'string' || !target || target === uid) return { status: 400, error: 'Miembro no válido' };
      const m = await readDoc(q, `members/${target}`);
      const banned = Array.isArray(l.banned) ? l.banned : [];
      if (!m || m.legionId !== uid || m.legionEpoch !== l.epoch || banned.includes(target)) return { status: 400, error: 'Miembro no válido' };
      await writeDoc(q, `legions/${uid}`, { ...l, banned: [...banned, target] }, now);
      await setMembership(q, target, null, now);
      await putCode(q, uid, await freshCode(q)); // SR-31: el código que conocía el expulsado deja de servir
      return {};
    });
    return res.error ? err(reply, res.status, res.error) : { ok: true };
  });

  app.post('/api/legions/leave', pre, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const now = app.now();
    const res = await db.tx(async (q) => {
      if (await leaderLegion(q, uid)) return { error: 'El líder no puede salir; disuelve la legión' };
      const m = await readDoc(q, `members/${uid}`);
      if (m && ('legionId' in m || 'legionEpoch' in m)) await setMembership(q, uid, null, now);
      return {};
    });
    return res.error ? err(reply, 409, res.error) : { ok: true };
  });

  app.delete('/api/legions/mine', pre, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const now = app.now();
    const ok = await db.tx(async (q) => {
      const l = await leaderLegion(q, uid);
      if (!l) return false;
      const p = `legionData/${uid}-${l.epoch}`;
      await q('delete from docs where path >= $1 and path < $2', [`${p}/`, `${p}0`]);
      await q('delete from docs where path = $1', [`legions/${uid}`]);
      await q('delete from legion_codes where legion_id = $1', [uid]);
      await setMembership(q, uid, null, now);
      return true;
    });
    return ok ? { ok: true } : err(reply, 403, NOT_LEADER);
  });
}
