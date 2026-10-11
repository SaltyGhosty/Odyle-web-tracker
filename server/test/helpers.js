import { randomBytes } from 'node:crypto';
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

export async function makeTestApp(overrides = {}) {
  const config = loadConfig(testEnv(overrides));
  const db = createDb({ pgMem: true });
  await migrate(db);
  const sent = [];
  const mailer = { async send(msg) { sent.push({ to: msg.to, subject: msg.subject, text: msg.text }); } };
  const app = buildApp({ config, db, mailer });
  return { app, db, sent, config };
}
