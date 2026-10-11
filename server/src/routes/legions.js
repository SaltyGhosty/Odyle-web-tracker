import { upsertDoc } from '../lib/doc-store.js';
import { requireUser } from '../lib/session.js';
import { randomToken } from '../lib/tokens.js';
import { generateCode, codeHash, sealCode, openCode } from '../lib/legion-codes.js';
import { normalizeCode, parseLegionName } from '../../../legion.js';

const HOUR = 3_600_000;
const TOO_MANY = 'Demasiados intentos. Prueba más tarde.';
const err = (reply, code, error) => reply.code(code).send({ error });
const BODY = { bodyLimit: 8192 }; // SR-26
// El uid basura de 10 KB debe llegar a la validación (400), no cortarse antes: margen sobre los 8 KB generales.
const KICK_BODY = 12288;
const UID_RE = /^u_[A-Za-z0-9]{22}$/;
// Mismas reglas de limpieza que el almacén de documentos: controles, NUL y marcas bidi fuera (SR-4).
const BAD_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
const cleanName = (v) => parseLegionName(typeof v === 'string' ? v.replace(BAD_CHARS, '') : '');
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

  // Todas las lecturas-modificaciones-escrituras bloquean antes las filas que leen (SR-29, SR-31).
  // Orden fijo para evitar interbloqueos: fila del usuario -> legión -> ficha.
  const readDoc = async (q, path, lock = '') => (await q(`select data from docs where path = $1${lock}`, [path])).rows[0]?.data ?? null;
  const lockUser = (q, uid) => q('select id from users where id = $1 for update', [uid]);
  const writeDoc = (q, path, data, now) => upsertDoc(q, path, data, now);
  // Modifica un documento de legión con compare-and-swap además del bloqueo de fila: si otro cambio se coló,
  // se vuelve a leer y a calcular (la lista de baneados nunca pierde una expulsión, SR-31).
  // fn(actual) devuelve el documento nuevo; null cancela. Devuelve el documento escrito o null.
  async function updateLegion(q, uid, fn, now) {
    for (let i = 0; i < 8; i++) {
      const cur = await readDoc(q, `legions/${uid}`, ' for update');
      if (!cur) return null;
      const next = fn(cur);
      if (!next) return null;
      const r = await q('update docs set data = $1::jsonb, updated_at = $2 where path = $3 and data = $4::jsonb',
        [JSON.stringify(next), now, `legions/${uid}`, JSON.stringify(cur)]);
      if (r.rowCount) return next;
    }
    throw new Error('conflicto de escritura');
  }
  // Única escritura de legionId/legionEpoch del sistema; crea la ficha si no existe.
  async function setMembership(q, uid, legion, now) {
    const cur = (await readDoc(q, `members/${uid}`, ' for update')) || { joinedAt: now };
    const next = { ...cur };
    if (legion) { next.legionId = legion.id; next.legionEpoch = legion.epoch; } else { delete next.legionId; delete next.legionEpoch; }
    await writeDoc(q, `members/${uid}`, next, now);
  }
  async function putCode(q, legionId, code) {
    const vals = [codeHash(config.codeKey, code), sealCode(config.codeKey, code, legionId), legionId];
    const upd = await q('update legion_codes set code_hash = $1, code_enc = $2 where legion_id = $3', vals);
    if (!upd.rowCount) await q('insert into legion_codes (code_hash, code_enc, legion_id) values ($1, $2, $3)', vals);
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
  const leaderLegion = async (q, uid, lock = ' for update') => {
    const l = await readDoc(q, `legions/${uid}`, lock);
    return l && l.leader === uid ? l : null;
  };

  const pre = { preHandler: requireUser };
  const NOT_LEADER = 'Solo el líder puede hacer esto';

  app.post('/api/legions', { ...BODY, ...pre }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const name = cleanName(isObj(req.body) ? req.body.name : '');
    if (!name.ok) return err(reply, 400, name.error);
    const uid = req.user.id;
    const now = app.now();
    const epoch = now.toString(36) + randomToken().slice(0, 6);
    const out = await db.tx(async (q) => {
      await lockUser(q, uid);
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

  app.post('/api/legions/join', { ...BODY, preHandler: [requireUser, ...joinLimits] }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const code = normalizeCode(isObj(req.body) ? req.body.code : '');
    if (!code) return err(reply, 400, 'Ese código no es válido');
    const uid = req.user.id;
    const now = app.now();
    const res = await db.tx(async (q) => {
      await lockUser(q, uid);
      const row = (await q('select legion_id from legion_codes where code_hash = $1', [codeHash(config.codeKey, code)])).rows[0];
      const legion = row ? await readDoc(q, `legions/${row.legion_id}`, ' for share') : null;
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
    if (!(await leaderLegion(db.query.bind(db), uid, ''))) return err(reply, 403, NOT_LEADER);
    const row = (await db.query('select code_enc from legion_codes where legion_id = $1', [uid])).rows[0];
    const code = row ? openCode(config.codeKey, row.code_enc, uid) : null;
    if (!code) return err(reply, 500, 'Error interno del servidor.');
    return { code };
  });

  app.post('/api/legions/mine/code', { ...BODY, ...pre }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const out = await db.tx(async (q) => {
      await lockUser(q, uid);
      if (!(await leaderLegion(q, uid))) return null;
      const code = await freshCode(q);
      await putCode(q, uid, code);
      return { code };
    });
    return out || err(reply, 403, NOT_LEADER);
  });

  app.patch('/api/legions/mine', { ...BODY, ...pre }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const now = app.now();
    const name = cleanName(isObj(req.body) ? req.body.name : '');
    const ok = await db.tx(async (q) => {
      await lockUser(q, uid);
      const l = await leaderLegion(q, uid);
      if (!l) return false;
      if (!name.ok) return name;
      await updateLegion(q, uid, (cur) => ({ ...cur, name: name.value }), now);
      return true;
    });
    if (ok === false) return err(reply, 403, NOT_LEADER);
    if (ok !== true) return err(reply, 400, ok.error);
    return { ok: true };
  });

  app.post('/api/legions/mine/kick', { bodyLimit: KICK_BODY, ...pre }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const now = app.now();
    const target = isObj(req.body) ? req.body.uid : null;
    const res = await db.tx(async (q) => {
      await lockUser(q, uid);
      let l = await leaderLegion(q, uid, '');
      if (!l) return { status: 403, error: NOT_LEADER };
      if (typeof target !== 'string' || !UID_RE.test(target) || target === uid) return { status: 400, error: 'Miembro no válido' };
      const isMine = (m) => m && m.legionId === uid && m.legionEpoch === l.epoch;
      const isBanned = () => Array.isArray(l.banned) && l.banned.includes(target);
      // Lectura sin bloqueo: solo se bloquea al objetivo si de verdad pertenece a esta legión (evita interbloqueos entre líderes).
      if (!isMine(await readDoc(q, `members/${target}`)) || isBanned()) return { status: 400, error: 'Miembro no válido' };
      // Orden de bloqueo (el mismo que usa join): usuario líder -> usuario objetivo -> legión -> ficha del objetivo.
      await lockUser(q, target);
      l = await leaderLegion(q, uid);
      if (!l) return { status: 403, error: NOT_LEADER };
      if (isBanned()) return { status: 400, error: 'Miembro no válido' }; // otro kick se adelantó
      await updateLegion(q, uid, (cur) => {
        const b = Array.isArray(cur.banned) ? cur.banned : [];
        return { ...cur, banned: b.includes(target) ? b : [...b, target] };
      }, now);
      // Si mientras tanto se unió a otra legión, queda expulsado (baneado) pero su nueva pertenencia no se toca.
      if (isMine(await readDoc(q, `members/${target}`, ' for update'))) await setMembership(q, target, null, now);
      await putCode(q, uid, await freshCode(q)); // SR-31: el código que conocía el expulsado deja de servir
      return {};
    });
    return res.error ? err(reply, res.status, res.error) : { ok: true };
  });

  app.post('/api/legions/leave', { ...BODY, ...pre }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const now = app.now();
    const res = await db.tx(async (q) => {
      await lockUser(q, uid);
      if (await leaderLegion(q, uid)) return { error: 'El líder no puede salir; disuelve la legión' };
      const m = await readDoc(q, `members/${uid}`);
      if (m && ('legionId' in m || 'legionEpoch' in m)) await setMembership(q, uid, null, now);
      return {};
    });
    return res.error ? err(reply, 409, res.error) : { ok: true };
  });

  app.delete('/api/legions/mine', { ...BODY, ...pre }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const uid = req.user.id;
    const now = app.now();
    const ok = await db.tx(async (q) => {
      await lockUser(q, uid);
      const l = await leaderLegion(q, uid);
      if (!l) return false;
      const p = `legionData/${uid}-${l.epoch}`;
      await q('delete from docs where parent in ($1, $2)', [`${p}/wall`, `${p}/calendar`]);
      await q('delete from docs where path = $1', [`legions/${uid}`]);
      await q('delete from legion_codes where legion_id = $1', [uid]);
      await setMembership(q, uid, null, now);
      return true;
    });
    return ok ? { ok: true } : err(reply, 403, NOT_LEADER);
  });
}
