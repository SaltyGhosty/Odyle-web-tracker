const REQUIRED = ['APP_ORIGIN', 'JWT_SECRET', 'CODE_KEY', 'RESEND_API_KEY', 'MAIL_FROM', 'EMAIL_MODE', 'DATABASE_URL'];

function need(env, name) {
  const v = env[name];
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`Falta la variable ${name}`);
  return v.trim();
}

function decodeSecret(name, value) {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) throw new Error(`${name} debe estar codificada en base64`);
  const buf = Buffer.from(value, /[-_]/.test(value) ? 'base64url' : 'base64');
  if (buf.length < 32) throw new Error(`${name} debe tener al menos 32 bytes`);
  return buf;
}

export function loadConfig(env) {
  for (const name of REQUIRED) need(env, name);
  const emailMode = env.EMAIL_MODE.trim();
  if (emailMode !== 'owner-only' && emailMode !== 'full') {
    throw new Error("EMAIL_MODE debe ser 'owner-only' o 'full'");
  }
  const jwt = decodeSecret('JWT_SECRET', env.JWT_SECRET.trim());
  const codeKey = decodeSecret('CODE_KEY', env.CODE_KEY.trim());
  const admin = typeof env.ADMIN_USER_ID === 'string' ? env.ADMIN_USER_ID.trim() : '';
  return {
    appOrigin: env.APP_ORIGIN.trim().replace(/\/+$/, ''),
    jwtSecret: new Uint8Array(jwt),
    codeKey,
    resendKey: env.RESEND_API_KEY.trim(),
    mailFrom: env.MAIL_FROM.trim(),
    emailMode,
    adminUserId: admin || null,
    databaseUrl: env.DATABASE_URL.trim(),
    isProd: env.NODE_ENV === 'production',
  };
}
