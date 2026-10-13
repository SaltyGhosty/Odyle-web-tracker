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
