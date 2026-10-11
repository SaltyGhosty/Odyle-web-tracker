import Fastify from 'fastify';
import helmet from '@fastify/helmet';

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

export function buildApp({ config, db, mailer, now = Date.now, logger = PROD_LOGGER }) {
  const app = Fastify({
    trustProxy: 1,
    bodyLimit: 70000,
    logger,
  });

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('mailer', mailer);
  app.decorate('now', now);

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

  app.addHook('onSend', async (req, reply) => {
    reply.header('content-security-policy', CSP);
  });

  app.setErrorHandler((err, req, reply) => {
    const status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ code: err.code }, 'error interno');
      return reply.code(500).send({ error: 'Error interno del servidor.' });
    }
    const messages = {
      413: 'La petición es demasiado grande.',
      415: 'Tipo de contenido no admitido.',
      400: 'Petición no válida.',
    };
    return reply.code(status).send({ error: messages[status] || 'Petición no válida.' });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'No encontrado.' }));

  app.get('/api/health', async () => ({ ok: true }));

  return app;
}
