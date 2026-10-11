import { randomBytes, randomInt, createHash } from 'node:crypto';

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const randomToken = () => randomBytes(32).toString('base64url');
export const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

export function newUserId() {
  let id = 'u_';
  for (let i = 0; i < 22; i++) id += B62[randomInt(62)];
  return id;
}
