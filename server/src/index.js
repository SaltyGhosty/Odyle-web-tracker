import { loadConfig } from './config.js';
import { createDb, migrate, prepareConnection } from './db.js';
import { buildApp } from './app.js';
import { createMailer } from './lib/mail.js';
import { PgBus } from './lib/bus.js';

const config = loadConfig(process.env);
const db = await createDb({ connectionString: config.databaseUrl, ssl: config.databaseSsl });
await migrate(db);
const mailer = createMailer(config);
const bus = new PgBus(db, prepareConnection(config.databaseUrl, config.databaseSsl));
await bus.start();
const app = buildApp({ config, db, mailer, bus });
const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
app.log.info({ trustProxyHops: config.trustProxyHops }, 'saltos de proxy de confianza (TRUST_PROXY_HOPS)');
