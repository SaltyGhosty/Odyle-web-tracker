import { loadConfig } from './config.js';
import { createDb, migrate, prepareConnection } from './db.js';
import { buildApp } from './app.js';
import { createMailer } from './lib/mail.js';
import { PgBus } from './lib/bus.js';
import { purgeOldMessages } from './lib/retention.js';

const config = loadConfig(process.env);
const db = await createDb({ connectionString: config.databaseUrl, ssl: config.databaseSsl });
await migrate(db);
const mailer = createMailer(config);
const bus = new PgBus(db, prepareConnection(config.databaseUrl, config.databaseSsl));
await bus.start();
const app = buildApp({ config, db, mailer, bus });
const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
// Retención de mensajes: al arrancar y cada 6 h (spec §3). Un fallo se registra y se reintenta en la siguiente vuelta.
const purge = () => purgeOldMessages(db, Date.now()).then((n) => n && app.log.info({ n }, 'mensajes antiguos borrados'), (e) => app.log.error({ code: e && e.code }, 'fallo al borrar mensajes antiguos'));
await purge();
setInterval(purge, 6 * 3600 * 1000).unref();
app.log.info({ trustProxyHops: config.trustProxyHops }, 'saltos de proxy de confianza (TRUST_PROXY_HOPS)');
