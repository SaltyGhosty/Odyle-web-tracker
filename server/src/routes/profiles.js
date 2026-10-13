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
    const raw = typeof req.query.q === 'string' ? req.query.q : '';
    const term = cleanText(raw, 20);
    if (!term || term.replace(/[%_\\]/g, '').length < 2) return reply.code(400).send({ error: 'Escribe entre 2 y 20 caracteres.' });
    const me = req.user.id;
    // pg-mem no admite ESCAPE: la consulta usa solo el prefijo anterior al primer comodín (sin comodines no hay ambigüedad)
    // y el prefijo completo, con _ y % literales, se comprueba en JS.
    const lower = term.toLowerCase();
    const head = lower.split(/[%_\\]/)[0];
    const candidates = (await q(
      "select path, lower(data->'profile'->>'nick') as nick from docs where parent = 'members' and lower(data->'profile'->>'nick') like $1 order by lower(data->'profile'->>'nick') limit 500",
      [`${head}%`],
    )).rows;
    const rows = candidates.filter((r) => typeof r.nick === 'string' && r.nick.startsWith(lower)).slice(0, 60);
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
