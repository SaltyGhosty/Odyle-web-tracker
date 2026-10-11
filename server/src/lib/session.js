import { randomToken, sha256hex } from './tokens.js';
import { signAccess, verifyAccess } from './jwt.js';

export const AT_COOKIE = '__Host-odyle_at';
export const RT_COOKIE = '__Secure-odyle_rt';
const AT_MAX_AGE = 15 * 60;
const RT_MAX_AGE = 30 * 24 * 3600;
const CACHE_TTL_MS = 30_000;

// SR-14: solo '/' o '/#fragmento' simple.
export function safeNext(next) {
  return typeof next === 'string' && (next === '/' || /^\/#[a-z0-9-]{0,32}$/.test(next)) ? next : '/';
}

export async function issueSession(db, config, userId, userAgent, familyId, now = Date.now) {
  const t = now();
  const { rows } = await db.query('select token_version from users where id = $1', [userId]);
  if (!rows.length) throw new Error('usuario inexistente');
  const refresh = randomToken();
  await db.query(
    `insert into refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at, user_agent)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [randomToken(), userId, familyId || randomToken(), sha256hex(refresh),
      new Date(t + RT_MAX_AGE * 1000), new Date(t), String(userAgent || '').slice(0, 200)],
  );
  const access = await signAccess(config, { sub: userId, ver: Number(rows[0].token_version) }, t);
  return { access, refresh };
}

export function setSessionCookies(reply, { access, refresh }) {
  reply.setCookie(AT_COOKIE, access, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: AT_MAX_AGE });
  reply.setCookie(RT_COOKIE, refresh, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth', maxAge: RT_MAX_AGE });
}

export function clearSessionCookies(reply) {
  reply.setCookie(AT_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  reply.setCookie(RT_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth', maxAge: 0 });
}

// Caché de usuario 30 s (SR-8); invalidateUserCache la limpia al subir token_version.
const cache = new Map();
export function invalidateUserCache(userId) { cache.delete(userId); }

async function loadUser(db, id, now) {
  const hit = cache.get(id);
  if (hit && hit.exp > now) return hit;
  const { rows } = await db.query('select id, email, token_version, email_verified_at from users where id = $1', [id]);
  if (!rows.length) { cache.delete(id); return null; }
  const u = { id: rows[0].id, email: rows[0].email, ver: Number(rows[0].token_version), verified: !!rows[0].email_verified_at, exp: now + CACHE_TTL_MS };
  cache.set(id, u);
  return u;
}

const expired = (reply) => reply.code(401).header('cache-control', 'no-store').send({ error: 'Sesión caducada' });

export async function requireUser(request, reply) {
  const { config, db } = request.server;
  const now = request.server.now();
  const token = request.cookies && request.cookies[AT_COOKIE];
  if (!token) return expired(reply);
  const claims = await verifyAccess(config, token, now);
  if (!claims) return expired(reply);
  const u = await loadUser(db, claims.sub, now);
  if (!u || u.ver !== claims.ver) return expired(reply);
  request.user = { id: u.id, email: u.email, verified: u.verified };
}
