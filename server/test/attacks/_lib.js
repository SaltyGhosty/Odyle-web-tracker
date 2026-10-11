// Utilidades compartidas por las pruebas de ataque (no contiene pruebas). Todo pasa por app.inject (caja negra);
// solo la preparación de estados grandes (usuarios en bloque, cuotas) toca la base directamente.
import { Writable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTestApp, REAL_PG } from '../helpers.js';
import { newUserId } from '../../src/lib/tokens.js';
import { signAccess } from '../../src/lib/jwt.js';
import { PROD_LOGGER } from '../../src/app.js';

export { REAL_PG };
export const ORIGIN = 'https://odyle.test';
export const H = { origin: ORIGIN, 'x-odyle-csrf': '1' };
export const AT = '__Host-odyle_at';
export const RT = '__Secure-odyle_rt';
export const PW = 'una-contrasena-larga-y-rara-7';
export const T0 = Date.UTC(2026, 9, 11, 12, 0, 0);
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const PUBLIC = path.join(ROOT, 'server/public');

export const tick = () => new Promise((res) => setImmediate(res));
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
export const cookiesOf = (r) => [].concat(r.headers['set-cookie'] || []);
export const cookieVal = (r, name) => {
  const c = cookiesOf(r).find((x) => x.startsWith(`${name}=`));
  return c ? c.split(';')[0].slice(name.length + 1) : null;
};
export const lastToken = (sent) => {
  const m = /#t=([A-Za-z0-9_-]+)/.exec(sent[sent.length - 1].text);
  return m ? m[1] : null;
};

// IP distinta por llamada (los límites por IP no deben interferir salvo cuando la prueba los ataca).
let ipN = 0;
export const freshIp = () => { ipN += 1; return `10.${(ipN >> 16) & 255}.${(ipN >> 8) & 255}.${ipN & 255}`; };

// App con reloj controlable.
export async function setup(over = {}) {
  const clock = { t: T0 };
  const t = await makeTestApp({ ...over, __buildApp: { now: () => clock.t, ...(over.__buildApp || {}) } });
  const req = (method, url, { payload, headers = {}, cookie, ip, csrf = method !== 'GET' && method !== 'HEAD' } = {}) => t.app.inject({
    method, url, payload,
    remoteAddress: ip || '127.0.0.1',
    headers: { ...(csrf ? H : {}), ...(cookie ? { cookie } : {}), ...headers },
  });
  return { ...t, clock, req };
}

// Cuenta real por la API: registro, verificación (modo full) y login. Devuelve id y cookies.
export async function apiUser(s, email, password = PW) {
  const reg = await s.req('POST', '/api/auth/register', { payload: { email, password }, ip: freshIp() });
  if (reg.statusCode !== 202) throw new Error(`registro ${reg.statusCode}`);
  await tick();
  if (s.config.emailMode === 'full') {
    const v = await s.req('POST', '/api/auth/verify', { payload: { token: lastToken(s.sent) } });
    if (v.statusCode !== 200) throw new Error(`verify ${v.statusCode}`);
  }
  return apiLogin(s, email, password);
}
export async function apiLogin(s, email, password = PW, ip = freshIp()) {
  const l = await s.req('POST', '/api/auth/login', { payload: { email, password }, ip });
  if (l.statusCode !== 200) throw new Error(`login ${l.statusCode}`);
  return { id: l.json().id, email, at: cookieVal(l, AT), rt: cookieVal(l, RT), res: l };
}

// Usuario insertado directamente (rápido, para preparar legiones y documentos en bloque).
export async function quickUser(s, label = 'q') {
  const id = newUserId();
  const t = s.clock ? s.clock.t : Date.now();
  await s.db.query('insert into users (id, email, password_hash, email_verified_at) values ($1, $2, $3, $4)',
    [id, `${label}-${id.slice(2, 10).toLowerCase()}@example.com`, 'x', new Date(t)]);
  const at = await signAccess(s.config, { sub: id, ver: 0 }, t);
  return { id, at, cookie: `${AT}=${at}` };
}

// Petición autenticada con cookie de acceso.
export const as = (s, u) => (method, url, payload, extra = {}) => s.req(method, url, { payload, cookie: `${AT}=${u.at}`, ...extra });

export async function docOf(s, p) {
  return (await s.db.query('select data from docs where path = $1', [p])).rows[0]?.data;
}

// Legión de un líder con miembros que se unen por la API.
export async function legionWith(s, leader, members = [], name = 'Los Albores') {
  const c = await as(s, leader)('POST', '/api/legions', { name });
  if (c.statusCode !== 200) throw new Error(`crear legión ${c.statusCode} ${c.body}`);
  const { code, epoch } = c.json();
  for (const m of members) {
    const j = await as(s, m)('POST', '/api/legions/join', { code }, { ip: freshIp() });
    if (j.statusCode !== 200) throw new Error(`join ${j.statusCode} ${j.body}`);
  }
  return { code, epoch, key: `${leader.id}-${epoch}` };
}

// Logger de producción (con su redacción) que escribe en memoria.
export function captureLogger() {
  const lines = [];
  const stream = new Writable({ write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); } });
  return { logger: { ...PROD_LOGGER, level: 'trace', stream }, text: () => lines.join('') };
}

// Copia privada y estable de server/public (otras pruebas recompilan en paralelo con intercambio atómico).
export function stablePublicDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'odyle-attack-public-'));
  for (let i = 0; i < 50; i++) {
    try {
      if (!existsSync(path.join(PUBLIC, 'index.html'))) {
        if (i === 10) execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-web.mjs')], { cwd: ROOT, stdio: 'pipe' });
        throw new Error('sin compilar');
      }
      cpSync(PUBLIC, dir, { recursive: true });
      if (existsSync(path.join(dir, 'index.html')) && existsSync(path.join(dir, 'auth.html')) && existsSync(path.join(dir, 'auth.js'))) return dir;
    } catch { /* reintento */ }
    execFileSync('sleep', ['0.2']);
  }
  throw new Error('server/public no disponible');
}
export const removeDir = (dir) => rmSync(dir, { recursive: true, force: true });

// Documento cp válido de ~7,7 KB (249 puntos: 498 claves, por debajo del máximo de 500).
export const cpDoc = (n) => ({ points: Array.from({ length: 249 }, (_, i) => ({ at: 1_700_000_000_000 + i + n * 10_000, cp: 123456 + i })) });
// Rellena la cuota de un usuario con documentos grandes escritos directamente en la base (estado preparado).
export async function seedBytes(s, uid, total) {
  let left = total; let i = 0;
  while (left > 100) {
    const len = Math.min(60_000, left - 30);
    await s.db.query('insert into docs (path, parent, data, updated_at) values ($1, $2, $3::jsonb, $4)',
      [`members/${uid}/characters/seed${i}`, `members/${uid}/characters`, JSON.stringify({ name: 'x'.repeat(len) }), 0]);
    left -= Buffer.byteLength(JSON.stringify({ name: 'x'.repeat(len) }));
    i += 1;
  }
}
