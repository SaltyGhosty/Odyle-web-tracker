import { hashPassword, verifyPassword, DUMMY_HASH, checkPasswordPolicy } from '../lib/passwords.js';
import { randomToken, sha256hex, newUserId } from '../lib/tokens.js';
import { signAccess } from '../lib/jwt.js';
import { encryptCode, decryptCode } from '../lib/codecrypt.js';
import {
  issueSession, setSessionCookies, clearSessionCookies, requireUser,
  invalidateUserCache, revokeFamilyOf, RT_COOKIE,
} from '../lib/session.js';

const GENERIC = { message: 'Si el correo es válido, te hemos enviado un enlace' };
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const CTRL_RE = /[\u0000-\u001F\u007F-\u009F]/;
const BODY = { bodyLimit: 8192 }; // SR-26
const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const GRACE_MS = 20_000;
const MIN = 60_000;
const HOUR = 3600_000;
const LOCK_AFTER = 10;
const LOCK_MS = 15 * MIN;
const LOCK_MAP_MAX = 10_000;
const TOO_MANY = 'Demasiados intentos. Prueba más tarde.';
const BAD_LINK = 'El enlace no es válido o ha caducado';

function normEmail(v) {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && !CTRL_RE.test(e) && EMAIL_RE.test(e) ? e : null;
}

// Ejecuta fn cuando la respuesta ya se ha enviado (SR-16); nunca lanza.
function afterResponse(reply, req, fn) {
  reply.raw.once('finish', () => {
    Promise.resolve().then(fn).catch((err) => req.log.error({ code: err && err.code }, 'tarea posterior fallida'));
  });
}

// El token queda ligado a la contraseña de esa petición; los anteriores siguen valiendo con SU contraseña, así que
// nadie puede anular el enlace pendiente de la víctima registrando el mismo correo (anti pre-secuestro, SR-20).
async function createVerifyToken(db, userId, now, pendingHash) {
  const token = randomToken();
  await db.query(
    'insert into email_tokens (id, user_id, kind, token_hash, expires_at, pending_password_hash) values ($1, $2, $3, $4, $5, $6)',
    [randomToken(), userId, 'verify', sha256hex(token), new Date(now + VERIFY_TTL_MS), pendingHash],
  );
  return token;
}

function verifyMail(config, to, token) {
  return {
    to,
    subject: 'Verifica tu correo en Odyle',
    text: `Hola,\n\nPara verificar tu correo abre este enlace:\n${config.appOrigin}/verificar#t=${token}\n\nSi no has creado una cuenta, ignora este mensaje.\n`,
  };
}

// Contador de fallos consecutivos por correo (exista o no, SR-15). En memoria, por instancia, acotado.
function createLockout(now) {
  const map = new Map(); // email -> { fails, last, lockedUntil }
  const sweep = (t) => {
    for (const [k, v] of map) if (t - v.last > LOCK_MS && !(v.lockedUntil > t)) map.delete(k);
    while (map.size > LOCK_MAP_MAX) map.delete(map.keys().next().value);
  };
  return {
    isLocked(email) {
      const e = map.get(email);
      return !!e && e.lockedUntil > now();
    },
    fail(email) {
      const t = now();
      let e = map.get(email);
      if (!e || (e.lockedUntil <= t && t - e.last > LOCK_MS)) e = { fails: 0, last: t, lockedUntil: 0 };
      if (e.lockedUntil > t) return false;
      e.fails += 1; e.last = t;
      const locked = e.fails >= LOCK_AFTER;
      if (locked) { e.lockedUntil = t + LOCK_MS; e.fails = 0; }
      map.delete(email); map.set(email, e); // reinserta: orden por actividad
      if (map.size > 1000) sweep(t);
      return locked;
    },
    reset(email) { map.delete(email); },
  };
}

export default async function authRoutes(app) {
  const { config, db, mailer } = app;
  const noStore = (reply) => reply.header('cache-control', 'no-store');
  const lockout = createLockout(app.now);
  // La copia cifrada del token vigente solo existe durante la ventana de gracia (SR-10).
  const purgeGrace = (t) => db.query(
    'update refresh_tokens set grace_token_enc = null where grace_token_enc is not null and rotated_at < $1',
    [new Date(t - GRACE_MS)],
  );

  // Cada límite tiene su propio almacén; se aplican en preHandler para poder usar el correo del cuerpo (SR-17, SR-18).
  const limit = (max, timeWindow, keyOf) => {
    const check = app.createRateLimit({
      max, timeWindow, keyGenerator: keyOf,
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
  const emailKey = (req) => {
    const e = req.body && typeof req.body === 'object' && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    return e;
  };
  const byIp = (req) => req.ip;
  const byIpEmail = (req) => `${req.ip}|${emailKey(req)}`;
  const loginLimits = [limit(30, HOUR, byIp), limit(5, MIN, byIpEmail)];
  const registerLimits = [limit(5, HOUR, byIp)];
  const verifyLimits = [limit(5, MIN, byIp)];
  const forgotLimits = [limit(10, HOUR, byIp), limit(3, HOUR, (req) => `e|${emailKey(req)}`)];

  app.post('/api/auth/register', { ...BODY, preHandler: registerLimits }, async (req, reply) => {
    noStore(reply);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = normEmail(body.email);
    if (!email) return reply.code(400).send({ error: 'Escribe un correo válido' });
    const policy = checkPasswordPolicy(body.password);
    if (policy) return reply.code(400).send({ error: policy });

    // Mismo coste exista o no el correo (SR-15).
    const passwordHash = await hashPassword(body.password, req.arrivedAt);
    const now = app.now();
    let mail = null;
    const existing = (await db.query('select id, email_verified_at from users where email = $1', [email])).rows[0];
    if (existing) {
      if (!existing.email_verified_at && config.emailMode === 'full') {
        mail = verifyMail(config, email, await createVerifyToken(db, existing.id, now, passwordHash));
      }
    } else {
      const id = newUserId();
      try {
        await db.query(
          'insert into users (id, email, password_hash, token_version, created_at) values ($1, $2, $3, 0, $4)',
          [id, email, passwordHash, new Date(now)],
        );
        const token = await createVerifyToken(db, id, now, passwordHash);
        if (config.emailMode === 'full') mail = verifyMail(config, email, token);
      } catch (err) {
        // Carrera con otro registro del mismo correo: se responde igual.
        const dup = (await db.query('select 1 from users where email = $1', [email])).rows.length > 0;
        if (!dup) throw err;
      }
    }
    if (mail) afterResponse(reply, req, () => mailer.send(mail));
    return reply.code(202).send(GENERIC);
  });

  // Quien abre el enlace demuestra conocer la contraseña ligada a él (anti pre-secuestro, SR-20).
  app.post('/api/auth/verify', { ...BODY, preHandler: verifyLimits }, async (req, reply) => {
    noStore(reply);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const token = body.token;
    const bad = () => reply.code(400).send({ error: BAD_LINK });
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return bad();
    if (typeof body.password !== 'string' || body.password.length > 128) return bad();
    const now = new Date(app.now());
    const tokenHash = sha256hex(token);
    const live = (await db.query(
      "select pending_password_hash from email_tokens where token_hash = $1 and kind = 'verify' and used_at is null and expires_at > $2",
      [tokenHash, now],
    )).rows[0];
    if (!live) return bad();
    const pending = live.pending_password_hash;
    if (pending && !(await verifyPassword(pending, body.password, req.arrivedAt))) return bad(); // no consume el token
    const userId = await db.tx(async (q) => {
      const used = await q(
        `update email_tokens set used_at = $1
         where token_hash = $2 and kind = 'verify' and used_at is null and expires_at > $1
         returning user_id, pending_password_hash`,
        [now, tokenHash],
      );
      if (!used.rows.length) return null;
      const { user_id: uid, pending_password_hash: p } = used.rows[0];
      if (p) await q('update users set password_hash = $1 where id = $2', [p, uid]);
      await q("update email_tokens set used_at = $1 where user_id = $2 and kind = 'verify' and used_at is null", [now, uid]);
      await q('update users set email_verified_at = $1, token_version = token_version + 1 where id = $2', [now, uid]);
      await q('update refresh_tokens set revoked_at = $1, grace_token_enc = null where user_id = $2 and revoked_at is null', [now, uid]);
      return uid;
    });
    if (!userId) return bad();
    invalidateUserCache(userId);
    return { message: 'Correo verificado' };
  });

  app.post('/api/auth/login', { ...BODY, preHandler: loginLimits }, async (req, reply) => {
    noStore(reply);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = normEmail(body.email);
    const password = typeof body.password === 'string' && body.password.length <= 128 ? body.password : '';
    const lockKey = email || (typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '');
    if (lockout.isLocked(lockKey)) return reply.code(429).send({ error: TOO_MANY });
    const user = email
      ? (await db.query('select id, email, password_hash, email_verified_at from users where email = $1', [email])).rows[0]
      : null;
    const ok = await verifyPassword(user ? user.password_hash : DUMMY_HASH, password, req.arrivedAt);
    if (!user || !ok) {
      if (lockout.fail(lockKey)) req.log.warn('cuenta bloqueada por intentos fallidos');
      return reply.code(401).send({ error: 'Correo o contraseña incorrectos' });
    }
    lockout.reset(lockKey);
    if (config.emailMode === 'full' && !user.email_verified_at) {
      return reply.code(403).send({ error: 'Verifica tu correo para entrar' });
    }
    await purgeGrace(app.now());
    await revokeFamilyOf(db, req.cookies && req.cookies[RT_COOKIE], app.now);
    const session = await issueSession(db, config, user.id, req.headers['user-agent'], undefined, app.now);
    setSessionCookies(reply, session);
    return { id: user.id, email: user.email, verified: !!user.email_verified_at };
  });

  app.post('/api/auth/logout', BODY, async (req, reply) => {
    noStore(reply);
    await revokeFamilyOf(db, req.cookies && req.cookies[RT_COOKIE], app.now);
    clearSessionCookies(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireUser }, async (req, reply) => {
    noStore(reply);
    const isAdmin = !!(config.adminUserId && req.user.id === config.adminUserId && req.user.verified);
    return { id: req.user.id, email: req.user.email, verified: req.user.verified, isAdmin };
  });

  // Consume el token de renovación con una sola UPDATE (SR-9) y emite el sucesor en la misma familia.
  app.post('/api/auth/refresh', BODY, async (req, reply) => {
    noStore(reply);
    const fail = () => { clearSessionCookies(reply); return reply.code(401).send({ error: 'Sesión caducada' }); };
    const rt = req.cookies && req.cookies[RT_COOKIE];
    if (typeof rt !== 'string' || rt.length < 20 || rt.length > 200) return fail();
    const hash = sha256hex(rt);
    const t = app.now();
    const nowD = new Date(t);
    await purgeGrace(t);

    const issued = await db.tx(async (q) => {
      const newId = randomToken();
      const successor = randomToken();
      // Todo el consumo (uso, rotación y copia cifrada para la gracia) va en una sola sentencia (SR-9).
      const used = await q(
        `update refresh_tokens set used_at = $1, rotated_at = $1, replaced_by = $2, grace_token_enc = $3
         where token_hash = $4 and used_at is null and revoked_at is null and expires_at > $1
         returning user_id, family_id`,
        [nowD, newId, encryptCode(config.codeKey, successor, hash), hash],
      );
      if (!used.rows.length) return null;
      const { user_id: userId, family_id: familyId } = used.rows[0];
      return issueSession({ query: q }, config, userId, req.headers['user-agent'], familyId, app.now, newId, successor);
    });
    if (issued) {
      setSessionCookies(reply, issued);
      return { ok: true };
    }

    // La hora se vuelve a leer tras perder la carrera por la fila: la ganadora ya escribió su rotated_at (SR-10).
    const t2 = Math.max(t, app.now());
    const row = (await db.query(
      'select user_id, family_id, revoked_at, rotated_at, replaced_by, grace_token_enc from refresh_tokens where token_hash = $1', [hash],
    )).rows[0];
    if (!row) return fail();
    const inGrace = !row.revoked_at && row.rotated_at && row.grace_token_enc
      && Math.abs(t2 - new Date(row.rotated_at).getTime()) < GRACE_MS; // tolera un reloj que retrocede un poco
    if (inGrace) {
      const succ = (await db.query('select revoked_at, used_at from refresh_tokens where id = $1', [row.replaced_by])).rows[0];
      // Solo el token inmediatamente anterior al vigente: si el sucesor ya se usó, es reutilización.
      const refresh = succ && !succ.revoked_at && !succ.used_at ? decryptCode(config.codeKey, row.grace_token_enc, hash) : null;
      const user = refresh ? (await db.query('select token_version from users where id = $1', [row.user_id])).rows[0] : null;
      if (refresh && user) {
        const access = await signAccess(config, { sub: row.user_id, ver: Number(user.token_version) }, t2);
        setSessionCookies(reply, { access, refresh });
        return { ok: true };
      }
    }
    // Reutilización fuera de la gracia, o token ya revocado: se cierra toda la familia.
    await db.query('update refresh_tokens set revoked_at = $1, grace_token_enc = null where family_id = $2 and revoked_at is null', [nowD, row.family_id]);
    return fail();
  });

  app.post('/api/auth/logout-all', { ...BODY, preHandler: requireUser }, async (req, reply) => {
    noStore(reply);
    const nowD = new Date(app.now());
    await db.tx(async (q) => {
      await q('update users set token_version = token_version + 1 where id = $1', [req.user.id]);
      await q('update refresh_tokens set revoked_at = $1, grace_token_enc = null where user_id = $2 and revoked_at is null', [nowD, req.user.id]);
    });
    invalidateUserCache(req.user.id);
    clearSessionCookies(reply);
    return { ok: true };
  });

  app.post('/api/auth/forgot', { ...BODY, preHandler: forgotLimits }, async (req, reply) => {
    noStore(reply);
    if (config.emailMode !== 'full') {
      return reply.code(503).send({ error: 'La recuperación por correo aún no está disponible' });
    }
    const email = normEmail(req.body && typeof req.body === 'object' ? req.body.email : null);
    let mail = null;
    const user = email ? (await db.query('select id from users where email = $1', [email])).rows[0] : null;
    if (user) {
      const now = app.now();
      const token = randomToken();
      await db.tx(async (q) => {
        await q("update email_tokens set used_at = $1 where user_id = $2 and kind = 'reset' and used_at is null", [new Date(now), user.id]);
        await q(
          'insert into email_tokens (id, user_id, kind, token_hash, expires_at) values ($1, $2, $3, $4, $5)',
          [randomToken(), user.id, 'reset', sha256hex(token), new Date(now + RESET_TTL_MS)],
        );
      });
      mail = {
        to: email,
        subject: 'Restablece tu contraseña de Odyle',
        text: `Hola,\n\nPara elegir una contraseña nueva abre este enlace (caduca en 30 minutos):\n${config.appOrigin}/restablecer#t=${token}\n\nSi no lo has pedido tú, ignora este mensaje.\n`,
      };
    }
    if (mail) afterResponse(reply, req, () => mailer.send(mail));
    return reply.code(202).send(GENERIC);
  });

  app.post('/api/auth/reset', BODY, async (req, reply) => {
    noStore(reply);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const policy = checkPasswordPolicy(body.password);
    if (policy) return reply.code(400).send({ error: policy });
    const token = body.token;
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return reply.code(400).send({ error: BAD_LINK });
    const now = new Date(app.now());
    // Consulta barata antes de gastar argon2: un token inexistente no ocupa las plazas de hash (SR-22).
    const live = await db.query(
      "select 1 from email_tokens where token_hash = $1 and kind = 'reset' and used_at is null and expires_at > $2",
      [sha256hex(token), now],
    );
    if (!live.rows.length) return reply.code(400).send({ error: BAD_LINK });
    const passwordHash = await app.hasher(body.password, req.arrivedAt);
    const userId = await db.tx(async (q) => {
      const used = await q(
        `update email_tokens set used_at = $1
         where token_hash = $2 and kind = 'reset' and used_at is null and expires_at > $1
         returning user_id`,
        [now, sha256hex(token)],
      );
      if (!used.rows.length) return null;
      const uid = used.rows[0].user_id;
      await q(
        `update users set password_hash = $1, email_verified_at = coalesce(email_verified_at, $2), token_version = token_version + 1
         where id = $3`,
        [passwordHash, now, uid],
      );
      await q('update refresh_tokens set revoked_at = $1, grace_token_enc = null where user_id = $2 and revoked_at is null', [now, uid]);
      // Un enlace de verificación pendiente llevaría una contraseña antigua: se anula.
      await q("update email_tokens set used_at = $1 where user_id = $2 and used_at is null", [now, uid]);
      return uid;
    });
    if (!userId) return reply.code(400).send({ error: BAD_LINK });
    invalidateUserCache(userId);
    const u = (await db.query('select email from users where id = $1', [userId])).rows[0];
    if (u) lockout.reset(u.email);
    return { message: 'Contraseña cambiada. Ya puedes entrar.' };
  });
}
