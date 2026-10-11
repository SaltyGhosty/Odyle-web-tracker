import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export function encryptCode(key, code, aad = '') {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key.subarray(0, 32), iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const enc = Buffer.concat([c.update(code, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptCode(key, blob, aad = '') {
  try {
    const parts = String(blob).split('.');
    if (parts.length !== 3) return null;
    const [iv, tag, enc] = parts.map((p) => Buffer.from(p, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv('aes-256-gcm', key.subarray(0, 32), iv);
    d.setAAD(Buffer.from(aad, 'utf8'));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
