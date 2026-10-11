// Códigos de invitación de legión (SR-32): generación con CSPRNG, búsqueda por HMAC con clave derivada y
// copia cifrada (AES-GCM, AAD = id de legión) para que el líder pueda volver a verlo.
import { randomInt, createHmac } from 'node:crypto';
import { encryptCode, decryptCode } from './codecrypt.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function codeHash(codeKey, code) {
  const k = createHmac('sha256', codeKey).update('odyle-legion-code-lookup').digest();
  return createHmac('sha256', k).update(code).digest('hex');
}

export const sealCode = (codeKey, code, legionId) => encryptCode(codeKey, code, legionId);
export const openCode = (codeKey, blob, legionId) => decryptCode(codeKey, blob, legionId);
