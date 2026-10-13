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
function parseBody(b, now) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Mensaje no válido.' };
  if (b.kind === 'text') {
    const text = cleanText(b.text, 1000, true);
    return text ? { kind: 'text', body: { text } } : { error: 'El mensaje debe tener entre 1 y 1000 caracteres.' };
  }
  if (b.kind === 'invite') {
    const title = cleanText(b.title, 60);
    if (!title || typeof b.at !== 'number' || !Number.isFinite(b.at) || Math.abs(b.at - now) > 366 * 86_400_000 || !isInt(b.slots, 1, 12) || !isInt(b.cost, 0, 840)) {
      return { error: 'Invitación no válida.' };
    }
    return { kind: 'invite', body: { title, at: b.at, slots: b.slots, cost: b.cost } };
  }
  return { error: 'Tipo de mensaje no válido.' };
}

export default async function messagesRoutes(app) {
  const { db, bus } = app;
  const pub = (req, to, evt) => Promise.resolve().then(() => bus.publish(to, evt))
    .catch((e) => req.log.warn({ code: e && e.code }, 'bus publish falló'));
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
    const parsed = parseBody(req.body, app.now());
    if (parsed.error) return bad(reply, parsed.error);
    const clientId = typeof req.body.clientId === 'string' && CLIENT_ID_RE.test(req.body.clientId) ? req.body.clientId : randomToken();
    const id = randomToken();
    // Marca estrictamente creciente por conversación: orden y paginación estables aunque dos mensajes caigan en el mismo ms.
    const last = (await q('select max(created_at) as t from messages where pair_key = $1', [pairKey(me, uid)])).rows[0].t;
    const at = Math.max(app.now(), last == null ? 0 : Number(last) + 1);
    await q(
      `insert into messages (id, pair_key, sender, recipient, kind, body, created_at, client_id)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) on conflict (sender, client_id) do nothing`,
      [id, pairKey(me, uid), me, uid, parsed.kind, JSON.stringify(parsed.body), at, clientId],
    );
    const row = (await q('select * from messages where sender = $1 and client_id = $2', [me, clientId])).rows[0];
    if (row.id === id) { await pub(req, uid, { type: 'message', id }); await pub(req, me, { type: 'message', id }); }
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
    if (r.rowCount) await pub(req, uid, { type: 'read', id: me });
    return { ok: true };
  });

  app.get('/api/conversations', { preHandler: [requireUser, listLimit] }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const me = req.user.id;
    const pairs = (await q('select pair_key, max(created_at) as last from messages where sender = $1 or recipient = $1 group by pair_key order by max(created_at) desc limit 100', [me])).rows;
    const unread = new Map((await q('select sender, count(*)::int as n from messages where recipient = $1 and read_at is null group by sender', [me])).rows.map((r) => [r.sender, r.n]));
    const blocked = await blockedEither(q, me);
    const seen = new Map();
    for (const p of pairs) {
      const r = (await q('select * from messages where pair_key = $1 and created_at = $2 limit 1', [p.pair_key, p.last])).rows[0];
      if (!r) continue;
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
