import { hashPassword, verifyPassword, DUMMY_HASH, checkPasswordPolicy } from '../lib/passwords.js';
import { randomToken, sha256hex, newUserId } from '../lib/tokens.js';
import {
  issueSession, setSessionCookies, clearSessionCookies, requireUser,
  invalidateUserCache, revokeFamilyOf, RT_COOKIE,
} from '../lib/session.js';

const GENERIC = { message: 'Si el correo es válido, te hemos enviado un enlace' };
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const VERIFY_TTL_MS = 24 * 3600 * 1000;

function normEmail(v) {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

// Ejecuta fn cuando la respuesta ya se ha enviado (SR-16); nunca lanza.
function afterResponse(reply, req, fn) {
  reply.raw.once('finish', () => {
    Promise.resolve().then(fn).catch((err) => req.log.error({ code: err && err.code }, 'tarea posterior fallida'));
  });
}

// El token queda ligado a la contraseña de esa petición y anula los anteriores (anti pre-secuestro).
async function createVerifyToken(db, userId, now, pendingHash) {
  const token = randomToken();
  await db.query("update email_tokens set used_at = $1 where user_id = $2 and kind = 'verify' and used_at is null", [new Date(now), userId]);
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

export default async function authRoutes(app) {
  const { config, db, mailer } = app;
  const noStore = (reply) => reply.header('cache-control', 'no-store');

  app.post('/api/auth/register', async (req, reply) => {
    noStore(reply);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = normEmail(body.email);
    if (!email) return reply.code(400).send({ error: 'Escribe un correo válido' });
    const policy = checkPasswordPolicy(body.password);
    if (policy) return reply.code(400).send({ error: policy });

    // Mismo coste exista o no el correo (SR-15).
    const passwordHash = await hashPassword(body.password);
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

  app.post('/api/auth/verify', async (req, reply) => {
    noStore(reply);
    const token = req.body && typeof req.body === 'object' ? req.body.token : null;
    const bad = () => reply.code(400).send({ error: 'El enlace no es válido o ha caducado' });
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return bad();
    const now = new Date(app.now());
    const userId = await db.tx(async (q) => {
      const used = await q(
        `update email_tokens set used_at = $1
         where token_hash = $2 and kind = 'verify' and used_at is null and expires_at > $1
         returning user_id, pending_password_hash`,
        [now, sha256hex(token)],
      );
      if (!used.rows.length) return null;
      const { user_id: uid, pending_password_hash: pending } = used.rows[0];
      if (pending) await q('update users set password_hash = $1 where id = $2', [pending, uid]);
      await q('update users set email_verified_at = $1, token_version = token_version + 1 where id = $2', [now, uid]);
      await q('update refresh_tokens set revoked_at = $1 where user_id = $2 and revoked_at is null', [now, uid]);
      return uid;
    });
    if (!userId) return bad();
    invalidateUserCache(userId);
    return { message: 'Correo verificado' };
  });

  app.post('/api/auth/login', async (req, reply) => {
    noStore(reply);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = normEmail(body.email);
    const password = typeof body.password === 'string' && body.password.length <= 128 ? body.password : '';
    const user = email
      ? (await db.query('select id, email, password_hash, email_verified_at from users where email = $1', [email])).rows[0]
      : null;
    const ok = await verifyPassword(user ? user.password_hash : DUMMY_HASH, password);
    if (!user || !ok) return reply.code(401).send({ error: 'Correo o contraseña incorrectos' });
    if (config.emailMode === 'full' && !user.email_verified_at) {
      return reply.code(403).send({ error: 'Verifica tu correo para entrar' });
    }
    await revokeFamilyOf(db, req.cookies && req.cookies[RT_COOKIE], app.now);
    const session = await issueSession(db, config, user.id, req.headers['user-agent'], undefined, app.now);
    setSessionCookies(reply, session);
    return { id: user.id, email: user.email, verified: !!user.email_verified_at };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    noStore(reply);
    await revokeFamilyOf(db, req.cookies && req.cookies[RT_COOKIE], app.now);
    clearSessionCookies(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireUser }, async (req, reply) => {
    noStore(reply);
    return { id: req.user.id, email: req.user.email, verified: req.user.verified };
  });
}
