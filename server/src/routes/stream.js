// server/src/routes/stream.js
// Canal en vivo por SSE (spec 2026-10-13 §4; SR-44). Solo lectura: GET, sin CSRF, cookie de sesión obligatoria.
import { decodeJwt } from 'jose';
import { requireUser, AT_COOKIE } from '../lib/session.js';
import { perUser } from '../lib/limits.js';
import { friendIds } from '../lib/social-rules.js';
import { resolveEvent } from '../lib/social-events.js';
import { CSP } from '../lib/headers.js';

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
  const byUser = new Map(); // uid -> cierres de sus streams abiertos, del más antiguo al más nuevo
  app.addHook('preClose', async () => { for (const c of [...open]) await c(); });

  app.get('/api/stream', { preHandler: [requireUser, connectLimit] }, async (req, reply) => {
    const me = req.user.id;
    // Con MAX_OPEN abiertos se cierra el más antiguo y se acepta el nuevo (una pestaña zombi no bloquea al usuario).
    const mine = byUser.get(me) || [];
    while (mine.length >= MAX_OPEN) await mine[0]();
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
      'cross-origin-resource-policy': 'same-origin',
      'strict-transport-security': 'max-age=63072000; includeSubDomains',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
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
      const list = byUser.get(me);
      if (list) { const k = list.indexOf(close); if (k >= 0) list.splice(k, 1); if (!list.length) byUser.delete(me); }
      clearInterval(heartbeat); clearTimeout(expiry);
      if (unsubscribe) unsubscribe();
      if (!res.writableEnded) res.end();
      if (added && presence.remove(me)) await announce(me, false).catch(() => {});
    };
    open.add(close);
    mine.push(close);
    byUser.set(me, mine);
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
        const payload = await resolveEvent(q, me, evt, { presence });
        if (payload) send(evt.type, payload);
      } catch { /* sin evento */ }
    });
    added = true;
    if (presence.add(me)) announce(me, true).catch(() => {});
    // El cliente pudo colgar durante el arranque: no dejar presencia ni suscripción huérfanas.
    if (req.raw.socket?.destroyed || res.destroyed) close();
  });
}
