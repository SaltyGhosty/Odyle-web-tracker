// Bus de eventos en vivo (spec 2026-10-13 §2, SR-45). La carga solo lleva ids: quien recibe relee y comprueba permisos.
import pg from 'pg';

const CHANNEL = 'odyle_events';

// Forma fija del evento (SR-45): campos desconocidos se descartan en ambos sentidos.
const shape = (evt) => ({
  type: evt.type,
  id: evt.id,
  ...(evt.online !== undefined ? { online: !!evt.online } : {}),
});

class Subscribers {
  constructor() { this.map = new Map(); }
  add(uid, fn) {
    if (!this.map.has(uid)) this.map.set(uid, new Set());
    this.map.get(uid).add(fn);
    return () => { const s = this.map.get(uid); if (s) { s.delete(fn); if (!s.size) this.map.delete(uid); } };
  }
  deliver(to, evt) {
    for (const fn of this.map.get(to) || []) {
      try { Promise.resolve(fn(evt)).catch(() => {}); } catch { /* un suscriptor roto no afecta a los demás */ }
    }
  }
}

export class MemoryBus {
  constructor() { this.subs = new Subscribers(); }
  async publish(to, evt) { setImmediate(() => this.subs.deliver(to, shape(evt))); }
  subscribe(uid, fn) { return this.subs.add(uid, fn); }
  async close() {}
}

export class PgBus {
  // db: el objeto de createDb (para NOTIFY por el pool); clientOptions: para la conexión dedicada de LISTEN.
  // Client y retryMs son inyectables para probar sin Postgres.
  constructor(db, clientOptions, { Client = pg.Client, retryMs = 2000 } = {}) {
    this.db = db;
    this.opts = clientOptions;
    this.Client = Client;
    this.retryMs = retryMs;
    this.subs = new Subscribers();
    this.closed = false;
    this.client = null; // único cliente de LISTEN vigente
    this.timer = null; // como mucho un reintento pendiente
  }

  async start() {
    if (this.closed) return;
    const client = new this.Client({ ...this.opts, keepAlive: true });
    this.client = client;
    client.on('notification', (n) => {
      if (client !== this.client) return; // notificación de un cliente ya reemplazado
      let msg; try { msg = JSON.parse(n.payload); } catch { return; }
      if (msg && typeof msg.to === 'string') this.subs.deliver(msg.to, shape(msg));
    });
    client.on('error', () => {
      if (client !== this.client) return;
      this.#drop(client);
      this.#scheduleRetry();
    });
    try {
      await client.connect();
      await client.query(`listen ${CHANNEL}`);
    } catch (err) {
      if (client === this.client) { this.#drop(client); this.#scheduleRetry(); }
      throw err;
    }
    // close() pudo ocurrir mientras conectaba: no dejar un cliente vivo.
    if (this.closed) this.#drop(client);
  }

  // Quita los listeners, cierra el cliente y deja de considerarlo vigente. Los errores tardíos se absorben.
  #drop(client) {
    client.removeAllListeners('notification');
    client.removeAllListeners('error');
    client.on('error', () => {});
    if (this.client === client) this.client = null;
    try { Promise.resolve(client.end()).catch(() => {}); } catch { /* ya cerrado */ }
  }

  // Un solo reintento pendiente a la vez.
  #scheduleRetry() {
    if (this.closed || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.closed) return;
      this.start().catch(() => {});
    }, this.retryMs);
    this.timer.unref?.();
  }

  async publish(to, evt) {
    await this.db.query('select pg_notify($1, $2)', [CHANNEL, JSON.stringify({ to, ...shape(evt) })]);
  }

  subscribe(uid, fn) { return this.subs.add(uid, fn); }

  async close() {
    this.closed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const client = this.client;
    if (client) this.#drop(client);
  }
}
