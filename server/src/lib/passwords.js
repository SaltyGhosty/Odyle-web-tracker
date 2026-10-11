import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { hash, verify, Algorithm } from '@node-rs/argon2';

const OPTS = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const MAX_CONCURRENT = 4; // SR-22

export const MAX_WAIT_MS = 2000; // SR-22: más espera que esto => 503
const HANDOFF_MARGIN_MS = 150; // holgura para la respuesta tras el cálculo

export class BusyError extends Error {
  constructor() { super('Servidor ocupado'); this.statusCode = 503; this.code = 'BUSY'; }
}

// `since` (performance.now() de la llegada de la petición) hace que el tope de 2 s cuente desde que llegó, no desde que se encoló.
export function createLimiter(max, maxWaitMs = MAX_WAIT_MS) {
  let active = 0;
  let ema = 0; // duración típica de un cálculo: no se da plaza a quien ya no terminaría dentro del tope
  const waiting = [];
  return async function limited(fn, since = performance.now()) {
    if (active >= max) {
      const left = since + maxWaitMs - performance.now();
      if (left <= 0) throw new BusyError();
      await new Promise((resolve, reject) => {
        const w = { resolve, reject, deadline: since + maxWaitMs, timer: null };
        w.timer = setTimeout(() => {
          const i = waiting.indexOf(w);
          if (i >= 0) waiting.splice(i, 1);
          reject(new BusyError());
        }, left);
        waiting.push(w); // slot handed over directly
      });
    } else {
      active++;
    }
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      ema = ema ? ema * 0.8 + (performance.now() - t0) * 0.2 : performance.now() - t0;
      // Traspasa la plaza al primero que aún esté a tiempo (los temporizadores pueden llegar tarde con el bucle ocupado).
      let handed = false;
      for (let next = waiting.shift(); next; next = waiting.shift()) {
        clearTimeout(next.timer);
        if (performance.now() + ema + HANDOFF_MARGIN_MS > next.deadline) { next.reject(new BusyError()); continue; }
        next.resolve(); handed = true; break;
      }
      if (!handed) active--;
    }
  };
}

const limited = createLimiter(MAX_CONCURRENT);

export function hashPassword(pw, since) {
  return limited(() => hash(pw, OPTS), since);
}

export async function verifyPassword(hashed, pw, since) {
  try {
    return await limited(() => verify(hashed, pw), since);
  } catch (e) {
    if (e instanceof BusyError) throw e;
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
