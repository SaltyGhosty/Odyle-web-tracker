// Límite por usuario reutilizable para las rutas sociales (SR-46). Mismo patrón que legions.js y docs.js.
const TOO_MANY = 'Demasiados intentos. Prueba más tarde.';

export function perUser(app, max, windowMs, name = 'social') {
  const check = app.createRateLimit({
    max, timeWindow: windowMs, keyGenerator: (req) => `${name}|${req.user.id}`,
    errorResponseBuilder: () => Object.assign(new Error(TOO_MANY), { statusCode: 429 }),
  });
  return async (req, reply) => {
    const r = await check(req);
    if (!r.isAllowed && r.isExceeded) {
      reply.header('retry-after', r.ttlInSeconds);
      return reply.code(429).header('cache-control', 'no-store').send({ error: TOO_MANY });
    }
  };
}
