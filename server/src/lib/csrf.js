// CSRF (SR-12, SR-13): en cualquier método distinto de GET/HEAD/OPTIONS, con o sin sesión,
// (onRequest: antes de leer el cuerpo) Origin debe ser exactamente APP_ORIGIN y debe venir la cabecera X-Odyle-CSRF: 1.
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function requireCsrf(request, reply) {
  if (SAFE.has(request.method)) return;
  const origin = request.headers.origin;
  const ok = typeof origin === 'string'
    && origin === request.server.config.appOrigin
    && request.headers['x-odyle-csrf'] === '1';
  if (!ok) return reply.code(403).send({ error: 'Petición rechazada' });
}
