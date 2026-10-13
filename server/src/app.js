import { performance } from 'node:perf_hooks';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { requireCsrf } from './lib/csrf.js';
import { hashPassword } from './lib/passwords.js';
import authRoutes from './routes/auth.js';
import docsRoutes from './routes/docs.js';
import legionsRoutes from './routes/legions.js';
import profilesRoutes from './routes/profiles.js';
import friendsRoutes from './routes/friends.js';
import pagesRoutes from './routes/pages.js';
import { MemoryBus } from './lib/bus.js';
import { createPresence } from './lib/presence.js';

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'";

export const PROD_LOGGER = {
  level: 'info',
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', 'req.body', 'req.query'],
    remove: true,
  },
  serializers: {
    req(req) { return { method: req.method, url: String(req.url).split('?')[0], remoteAddress: req.ip }; },
    res(res) { return { statusCode: res.statusCode }; },
  },
};

export function buildApp({ config, db, mailer, now = Date.now, hasher = hashPassword, logger = PROD_LOGGER, publicDir, bus = new MemoryBus() }) {
  const app = Fastify({
    // Exactamente N saltos de confianza (TRUST_PROXY_HOPS, por defecto 1 = el balanceador de Render), nunca `true` (SR-18).
    // Con un número, Fastify 5.12 no confía en nadie; esta función confía solo en los N pares más cercanos al socket,
    // de modo que request.ip es la N-ésima entrada de X-Forwarded-For por la derecha y las de la izquierda (falsificables) no cuentan.
    trustProxy: (_addr, hop) => hop < config.trustProxyHops,
    bodyLimit: 70000,
    logger,
  });

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('mailer', mailer);
  app.decorate('now', now);
  app.decorate('hasher', hasher);
  app.decorate('bus', bus);
  app.decorate('presence', createPresence());

  // Solo application/json (SR-13): se quita el parser text/plain por defecto.
  app.removeContentTypeParser('text/plain');

  app.addHook('onRequest', async (req, reply) => {
    if (config.isProd && req.headers['x-forwarded-proto'] === 'http') {
      return reply.code(301).redirect(`${config.appOrigin}${req.raw.url}`);
    }
  });

  app.register(helmet, {
    global: true,
    contentSecurityPolicy: false, // se fija abajo con la cadena exacta (helmet la une sin espacios)
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });

  app.register(cookie);
  // Sin límite global: cada ruta declara los suyos (SR-17); las claves usan request.ip (SR-18).
  app.register(rateLimit, { global: false });
  app.addHook('onRequest', async (req) => { req.arrivedAt = performance.now(); });
  app.addHook('onRequest', requireCsrf);

  app.addHook('onSend', async (req, reply) => {
    reply.header('content-security-policy', CSP);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err.code === 'BUSY' && err.statusCode === 503) {
      reply.header('retry-after', '3').header('cache-control', 'no-store');
      return reply.code(503).send({ error: 'El servidor está ocupado. Inténtalo en unos segundos.' });
    }
    const status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ code: err.code }, 'error interno');
      return reply.code(500).send({ error: 'Error interno del servidor.' });
    }
    const messages = {
      413: 'La petición es demasiado grande.',
      415: 'Tipo de contenido no admitido.',
      400: 'Petición no válida.',
      429: 'Demasiados intentos. Prueba más tarde.',
    };
    if (status === 429) reply.header('cache-control', 'no-store');
    return reply.code(status).send({ error: messages[status] || 'Petición no válida.' });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'No encontrado.' }));

  app.get('/api/health', async () => ({ ok: true }));

  app.register(authRoutes);
  app.register(docsRoutes);
  app.register(legionsRoutes);
  app.register(profilesRoutes);
  app.register(friendsRoutes);
  app.register(pagesRoutes, { publicDir });

  return app;
}
