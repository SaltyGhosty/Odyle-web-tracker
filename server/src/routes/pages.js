import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';

export const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));
const NOT_BUILT = { error: 'La web aún no está compilada' };
const ACCOUNT_PAGES = ['/login', '/registro', '/verificar', '/restablecer'];

// Rutas de estáticos permitidas (SR-34): nada que empiece por punto y nada de *.map.
export function allowedStaticPath(pathName) {
  const segs = String(pathName).split('/');
  if (String(pathName).endsWith('/')) return false;
  // Estas dos solo salen por sus rutas explícitas (con las cabeceras de cada una).
  if (/^\/?(index|auth)\.html$/i.test(pathName)) return false;
  return !segs.some((s) => s.startsWith('.')) && !/\.map$/i.test(pathName);
}

export default async function pagesRoutes(app, opts = {}) {
  const publicDir = opts.publicDir || DEFAULT_PUBLIC_DIR;
  // Cualquier fallo de lectura (carpeta ausente o a medio intercambiar) cuenta como "sin compilar", nunca como caída.
  let index = null;
  let auth = null;
  try {
    index = readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    auth = readFileSync(path.join(publicDir, 'auth.html'), 'utf8');
  } catch { index = null; }

  if (index === null || auth === null) {
    for (const url of ['/', ...ACCOUNT_PAGES]) app.get(url, async (req, reply) => reply.code(503).header('cache-control', 'no-store').send(NOT_BUILT));
    return;
  }

  const html = (reply) => reply.type('text/html; charset=utf-8');

  app.get('/', async (req, reply) => html(reply).header('cache-control', 'no-cache').send(index));
  for (const url of ACCOUNT_PAGES) {
    app.get(url, async (req, reply) => html(reply)
      .header('referrer-policy', 'no-referrer').header('cache-control', 'no-store').send(auth));
  }

  await app.register(fastifyStatic, {
    root: publicDir,
    index: false,
    list: false,
    dotfiles: 'deny',
    wildcard: true,
    allowedPath: (pathName) => allowedStaticPath(pathName),
    decorateReply: false,
  });
}
