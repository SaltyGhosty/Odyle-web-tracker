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
