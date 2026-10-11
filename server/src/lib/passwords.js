import { readFileSync } from 'node:fs';
import { hash, verify, Algorithm } from '@node-rs/argon2';

const OPTS = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const MAX_CONCURRENT = 4; // SR-22

export function createLimiter(max) {
  let active = 0;
  const waiting = [];
  return async function limited(fn) {
    if (active >= max) {
      await new Promise((resolve) => waiting.push(resolve)); // slot handed over directly
    } else {
      active++;
    }
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

const limited = createLimiter(MAX_CONCURRENT);

export function hashPassword(pw) {
  return limited(() => hash(pw, OPTS));
}

export async function verifyPassword(hashed, pw) {
  try {
    return await limited(() => verify(hashed, pw));
  } catch {
    return false;
  }
}

export const DUMMY_HASH = await hash('dummy-password-for-timing-equalization', OPTS);

const COMMON = new Set(
  readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
);

export function checkPasswordPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'La contraseña necesita al menos 10 caracteres';
  if (pw.length > 128) return 'La contraseña admite hasta 128 caracteres';
  if (COMMON.has(pw.toLowerCase())) return 'Esa contraseña es demasiado común';
  return null;
}
