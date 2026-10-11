import { loadConfig } from './config.js';
import { createDb, migrate } from './db.js';
import { buildApp } from './app.js';

const config = loadConfig(process.env);
const db = createDb({ connectionString: config.databaseUrl, isProd: config.isProd });
await migrate(db);
// El mailer real (Resend) llega en una tarea posterior.
const mailer = { async send() { throw new Error('mailer no configurado'); } };
const app = buildApp({ config, db, mailer });
const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
