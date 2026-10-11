import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const SSL_PARAMS = ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'sslcrl', 'sslpassword', 'uselibpqcompat'];

// DATABASE_SSL es la única fuente de verdad del TLS: pg deja que los parámetros de la cadena de conexión pisen la
// opción `ssl`, así que se quitan de la URL todos los parámetros ssl* para que nunca haya dos respuestas distintas.
export function prepareConnection(connectionString, ssl = 'off') {
  let cs = connectionString;
  try {
    const u = new URL(connectionString);
    for (const k of SSL_PARAMS) u.searchParams.delete(k);
    cs = u.toString();
  } catch { /* cadena no parseable: pg dará el error */ }
  return {
    connectionString: cs,
    ssl: ssl === 'verify' ? { rejectUnauthorized: true } : ssl === 'require' ? { rejectUnauthorized: false } : undefined,
  };
}

export async function createDb({ connectionString, pgMem, ssl = 'off' } = {}) {
  let pool;
  if (pgMem) {
    // pg-mem es devDependency: solo se carga bajo demanda (producción arranca sin ella).
    const { newDb } = await import('pg-mem');
    const mem = newDb();
    const adapter = mem.adapters.createPg();
    pool = new adapter.Pool();
  } else {
    if (!connectionString) throw new Error('Falta la variable DATABASE_URL');
    pool = new pg.Pool({ ...prepareConnection(connectionString, ssl), max: 10 });
    // Un error en un cliente inactivo no debe tumbar el proceso; solo se registra el código.
    pool.on('error', (err) => { console.error('Error en la conexión inactiva de la base de datos', err && err.code); });
  }
  return {
    advisoryLocks: !pgMem, // pg_advisory_xact_lock no existe en pg-mem
    async query(text, params) {
      const r = await pool.query(text, params);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    // Ejecuta fn(query) en una transacción sobre un único cliente.
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn(async (text, params) => {
          const r = await client.query(text, params);
          return { rows: r.rows, rowCount: r.rowCount };
        });
        await client.query('commit');
        return out;
      } catch (e) {
        try { await client.query('rollback'); } catch { /* conexión ya rota */ }
        throw e;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
}

export async function migrate(db, dir = MIGRATIONS_DIR) {
  // Sin "create table if not exists": pg-mem no lo soporta cuando la tabla ya existe.
  let applied;
  try {
    applied = new Set((await db.query('select version from schema_version')).rows.map((r) => Number(r.version)));
  } catch {
    await db.query('create table schema_version (version integer primary key, applied_at timestamptz not null default now())');
    applied = new Set();
  }
  const files = (await readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    const version = parseInt(f, 10);
    if (applied.has(version)) continue;
    const sql = await readFile(path.join(dir, f), 'utf8');
    await db.tx(async (q) => {
      await q(sql);
      await q('insert into schema_version (version) values ($1)', [version]);
    });
  }
}
