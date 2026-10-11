import { loadConfig } from './config.js';
import { createDb, migrate } from './db.js';
import { buildApp } from './app.js';
import { createMailer } from './lib/mail.js';

const config = loadConfig(process.env);
const db = createDb({ connectionString: config.databaseUrl, ssl: config.databaseSsl });
await migrate(db);
const mailer = createMailer(config);
const app = buildApp({ config, db, mailer });
const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
