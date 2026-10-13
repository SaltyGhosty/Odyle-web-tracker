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
    const ids = await friendIds(q, uid);
    await Promise.allSettled(ids.map((f) => bus.publish(f, { type: 'presence', id: uid, online })));
  };
  const open = new Set();
  app.addHook('preClose', async () => { for (const c of [...open]) await c(); });

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
    let closed = false;
    let unsubscribe = null;
    let heartbeat = null;
    let expiry = null;
    let added = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      open.delete(close);
      clearInterval(heartbeat); clearTimeout(expiry);
      if (unsubscribe) unsubscribe();
      if (!res.writableEnded) res.end();
      if (added && presence.remove(me)) await announce(me, false).catch(() => {});
    };
    open.add(close);
    const write = (chunk) => {
      if (closed || res.writableEnded) return;
      res.write(chunk);
      if (res.writableLength > 1_000_000) close();
    };
    const send = (type, data) => write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
    expiry = setTimeout(close, ttl);
    res.on('close', close); res.on('error', close); req.raw.on('close', close);
    send('hello', { uid: me });

    unsubscribe = bus.subscribe(me, async (evt) => {
      try {
        const payload = await resolveEvent(q, me, evt);
        if (payload) send(evt.type, payload);
      } catch { /* sin evento */ }
    });
    added = true;
    if (presence.add(me)) announce(me, true).catch(() => {});
  });
}
