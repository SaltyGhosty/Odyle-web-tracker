import { requireUser } from '../lib/session.js';
import { canRead, canWrite, membership } from '../lib/rules.js';
import { parsePath, classify, sanitize, MAX_DOC_BYTES } from '../lib/validate.js';
import { safeMerge, isPlain } from '../lib/merge.js';

const MAX_DOCS = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_CAP = 5000;
const LEGION_FIELDS = ['name', 'epoch', 'banned', 'createdAt', 'leader'];
const OPS = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b };
const NUM_RE = /^-?\d+(\.\d+)?$/;
const bytes = (v) => Buffer.byteLength(JSON.stringify(v));
const err = (reply, code, error) => reply.code(code).send({ error });

// Solo los campos públicos de una legión: nunca codeHash, proof ni material de código.
const publicLegion = (d) => {
  const out = {};
  for (const k of LEGION_FIELDS) if (d && k in d) out[k] = d[k];
  return out;
};

function rawPath(req) {
  const url = String(req.raw.url).split('?')[0];
  return url.startsWith('/api/docs/') ? url.slice('/api/docs/'.length) : '';
}

// where=at,>,100 (hasta 2) · orderBy=at,asc|desc · limit=1..200. Cualquier otra cosa: 400.
function parseQuery(q) {
  const keys = Object.keys(q || {});
  if (keys.some((k) => !['where', 'orderBy', 'limit'].includes(k))) return { error: 'Consulta no válida' };
  const out = { where: [], orderBy: null, limit: 200 };
  if (q.where !== undefined) {
    const list = Array.isArray(q.where) ? q.where : [q.where];
    if (list.length > 2) return { error: 'Consulta no válida' };
    for (const w of list) {
      const p = typeof w === 'string' ? w.split(',') : [];
      if (p.length !== 3 || p[0] !== 'at' || !(p[1] in OPS) || !NUM_RE.test(p[2])) return { error: 'Consulta no válida' };
      out.where.push({ op: p[1], value: Number(p[2]) });
    }
  }
  if (q.orderBy !== undefined) {
    const p = typeof q.orderBy === 'string' ? q.orderBy.split(',') : [];
    if (p.length < 1 || p.length > 2 || p[0] !== 'at' || (p[1] !== undefined && p[1] !== 'asc' && p[1] !== 'desc')) return { error: 'Consulta no válida' };
    out.orderBy = p[1] || 'asc';
  }
  if (q.limit !== undefined) {
    if (typeof q.limit !== 'string' || !/^\d{1,5}$/.test(q.limit)) return { error: 'Consulta no válida' };
    const n = Number(q.limit);
    if (n < 1 || n > 200) return { error: 'Consulta no válida' };
    out.limit = n;
  }
  return out;
}

export default async function docsRoutes(app) {
  const { db } = app;
  const writeLimit = app.createRateLimit({
    max: 300, timeWindow: 60_000, keyGenerator: (req) => req.user.id,
    errorResponseBuilder: () => Object.assign(new Error('Demasiados intentos. Prueba más tarde.'), { statusCode: 429 }),
  });
  const limitWrites = async (req, reply) => {
    const r = await writeLimit(req);
    if (!r.isAllowed && r.isExceeded) {
      reply.header('retry-after', r.ttlInSeconds);
      return reply.code(429).header('cache-control', 'no-store').send({ error: 'Demasiados intentos. Prueba más tarde.' });
    }
  };

  const ctxOf = (req) => ({
    uid: req.user.id, db,
    isAdmin: !!(app.config.adminUserId && req.user.id === app.config.adminUserId && req.user.verified),
  });
  const denyRead = (reply, segs) => (segs[0] === 'members' ? err(reply, 404, 'No encontrado') : err(reply, 403, 'Sin permiso'));

  function resolve(req, reply) {
    const p = parsePath(rawPath(req));
    if (p.error) { err(reply, 400, p.error); return null; }
    return p.segments;
  }

  // ---- Lectura ----
  app.get('/api/docs/*', { preHandler: requireUser }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const segs = resolve(req, reply); if (!segs) return reply;
    const path = segs.join('/');
    const c = classify(segs);
    const ctx = ctxOf(req);
    if (!c) return err(reply, 403, 'Sin permiso');

    if (c.kind === 'doc') {
      if (Object.keys(req.query || {}).length) return err(reply, 400, 'Consulta no válida');
      if (!(await canRead(ctx, segs))) return denyRead(reply, segs);
      const row = (await db.query('select data from docs where path = $1', [path])).rows[0];
      const id = segs[segs.length - 1];
      if (!row) return { id, exists: false };
      return { id, exists: true, data: c.root === 'legions' ? publicLegion(row.data) : row.data };
    }

    const q = parseQuery(req.query);
    if (q.error) return err(reply, 400, q.error);
    if (!(await canRead(ctx, segs))) return denyRead(reply, segs);

    // La regla de lectura se aplica al elegir las filas, antes de filtrar y limitar (SR-27).
    let rows;
    if (c.type === 'members') {
      const m = await membership(ctx);
      const paths = [`members/${ctx.uid}`, ...[...m.mates].map((u) => `members/${u}`)];
      const ph = paths.map((_, i) => `$${i + 1}`).join(',');
      rows = (await db.query(`select path, data from docs where path in (${ph}) order by path`, paths)).rows;
    } else {
      rows = (await db.query(`select path, data from docs where parent = $1 order by path limit ${FETCH_CAP}`, [path])).rows;
    }
    let docs = rows.map((r) => ({ id: r.path.slice(r.path.lastIndexOf('/') + 1), data: c.root === 'legions' ? publicLegion(r.data) : r.data }));
    const at = (d) => (typeof d.data.at === 'number' ? d.data.at : null);
    for (const w of q.where) docs = docs.filter((d) => at(d) !== null && OPS[w.op](at(d), w.value));
    if (q.orderBy) {
      const dir = q.orderBy === 'desc' ? -1 : 1;
      docs = docs.map((d, i) => ({ d, i })).sort((x, y) => {
        const a = at(x.d), b = at(y.d);
        if (a === null || b === null) return a === b ? x.i - y.i : (a === null ? 1 : -1);
        return a === b ? x.i - y.i : (a - b) * dir;
      }).map((x) => x.d);
    }
    return { docs: docs.slice(0, q.limit) };
  });

  // ---- Escritura ----
  const upsert = async (path, data, now) => {
    const parent = path.slice(0, path.lastIndexOf('/'));
    await db.query(
      `insert into docs (path, parent, data, updated_at) values ($1, $2, $3::jsonb, $4)
       on conflict (path) do update set data = excluded.data, updated_at = excluded.updated_at`,
      [path, parent, JSON.stringify(data), now],
    );
  };

  // Cuota por usuario (SR-26): ≤ 500 documentos y ≤ 2 MB bajo members/{uid}; solo se rechaza lo que crece.
  async function overQuota(uid, path, existingData, newData) {
    const own = `members/${uid}`;
    const rows = (await db.query(
      'select path, data from docs where path = $1 or (path >= $2 and path < $3)',
      [own, `${own}/`, `${own}0`],
    )).rows;
    const oldSize = existingData ? bytes(existingData) : 0;
    const total = rows.reduce((s, r) => s + bytes(r.data), 0) - oldSize + bytes(newData);
    const count = rows.filter((r) => r.path !== own).length + (existingData || path === own ? 0 : 1);
    const grows = !existingData || bytes(newData) > oldSize;
    return grows && (count > MAX_DOCS || total > MAX_BYTES);
  }

  const mutate = async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const segs = resolve(req, reply); if (!segs) return reply;
    const path = segs.join('/');
    const c = classify(segs);
    if (!c || c.kind !== 'doc') return err(reply, 403, 'Sin permiso');
    const ctx = ctxOf(req);
    const method = req.method;
    const now = app.now();
    const body = method === 'DELETE' ? undefined : req.body;
    const existingRow = (await db.query('select data from docs where path = $1', [path])).rows[0];
    const existing = existingRow ? existingRow.data : null;

    // Con cuerpo no válido ni se consulta la pertenencia: primero forma, luego permisos; los permisos mandan sobre el 404.
    if (method !== 'DELETE' && !isPlain(body)) return err(reply, 400, 'El cuerpo debe ser un objeto JSON');
    if (!(await canWrite(ctx, segs, existing, { method, body }))) return err(reply, 403, 'Sin permiso');

    if (method === 'DELETE') {
      await db.query('delete from docs where path = $1', [path]);
      return { ok: true, updatedAt: now };
    }
    if (method === 'PATCH' && !existing) return err(reply, 404, 'No existe');

    const partial = method === 'PATCH';
    const r = sanitize(segs, body, { partial });
    if (r.error) return err(reply, r.status, r.error);
    let data = r.data;
    const shared = c.root === 'legionData';

    if (shared) {
      // El autor lo fija el servidor desde la sesión (SR-28).
      if (partial) delete data.uid;
      else data.uid = existing ? existing.uid : ctx.uid;
    }

    let finalData;
    if (partial) {
      try { finalData = safeMerge(existing, data); } catch { return err(reply, 400, 'Petición no válida'); }
      const v = sanitize(segs, finalData, { allowReserved: true });
      if (v.error) return err(reply, v.status, v.error);
      finalData = v.data;
    } else {
      finalData = data;
      if (c.type === 'member' && existing) {
        for (const k of ['legionId', 'legionEpoch']) if (k in existing) finalData[k] = existing[k];
      }
    }
    if (bytes(finalData) > MAX_DOC_BYTES) return err(reply, 413, 'El documento es demasiado grande');
    if (c.root === 'members' && await overQuota(ctx.uid, path, existing, finalData)) {
      return err(reply, 413, 'Has superado el espacio disponible');
    }
    await upsert(path, finalData, now);
    return { ok: true, updatedAt: now };
  };

  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    app.route({ method, url: '/api/docs/*', preHandler: [requireUser, limitWrites], handler: mutate });
  }
}
