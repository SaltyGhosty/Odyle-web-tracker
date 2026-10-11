import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'odyle';
const AUDIENCE = 'odyle-web';
const SUB_RE = /^u_[A-Za-z0-9]{22}$/;
const TTL_SECONDS = 15 * 60;

export function signAccess(config, { sub, ver }, now) {
  const iat = Math.floor(now / 1000);
  return new SignJWT({ ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + TTL_SECONDS)
    .sign(config.jwtSecret);
}

export async function verifyAccess(config, token, now) {
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      clockTolerance: 5,
      requiredClaims: ['exp', 'sub'],
      currentDate: new Date(now),
    });
    if (typeof payload.sub !== 'string' || !SUB_RE.test(payload.sub)) return null;
    if (!Number.isInteger(payload.ver)) return null;
    return { sub: payload.sub, ver: payload.ver };
  } catch {
    return null;
  }
}
