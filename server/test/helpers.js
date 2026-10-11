import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { createDb, migrate } from '../src/db.js';
import { buildApp } from '../src/app.js';

export function testEnv(overrides = {}) {
  return {
    APP_ORIGIN: 'https://odyle.test',
    JWT_SECRET: randomBytes(32).toString('base64'),
    CODE_KEY: randomBytes(32).toString('base64'),
    RESEND_API_KEY: 're_test',
    MAIL_FROM: 'Odyle <no-reply@odyle.test>',
    EMAIL_MODE: 'full',
    ADMIN_USER_ID: '',
    DATABASE_URL: 'postgres://unused',
    NODE_ENV: 'test',
    ...overrides,
  };
}

// Con TEST_DATABASE_URL (server/scripts/test-pg.sh) cada app de prueba usa un esquema nuevo de un Postgres real
// en lugar de pg-mem (pg-mem ignora los bloqueos de fila y parte del SQL).
export const REAL_PG = typeof process.env.TEST_DATABASE_URL === 'string' && process.env.TEST_DATABASE_URL !== '';

export async function makeTestDb() {
  if (!REAL_PG) {
    const db = await createDb({ pgMem: true });
    await migrate(db);
    return db;
  }
  const schema = `t_${randomBytes(8).toString('hex')}`;
  const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  try { await admin.query(`create schema ${schema}`); } finally { await admin.end(); }
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const db = await createDb({ connectionString: url.toString(), ssl: 'off' });
  await migrate(db);
  return db;
}

export async function makeTestApp(overrides = {}) {
  const { __buildApp, ...envOverrides } = overrides;
  const config = loadConfig(testEnv(envOverrides));
  const db = await makeTestDb();
  const sent = [];
  const mailer = { async send(msg) { sent.push({ to: msg.to, subject: msg.subject, text: msg.text }); } };
  const app = buildApp({ config, db, mailer, logger: false, ...(overrides.__buildApp || {}) });
  // Con Postgres real, cerrar la app cierra el pool (sin pool abierto el proceso de pruebas termina).
  if (REAL_PG) app.addHook('onClose', async () => { await db.close().catch(() => {}); });
  return { app, db, sent, config };
}
