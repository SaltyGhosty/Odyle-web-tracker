// Bus de eventos en vivo (spec 2026-10-13 §2, SR-45). La carga solo lleva ids: quien recibe relee y comprueba permisos.
import pg from 'pg';

const CHANNEL = 'odyle_events';

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

const strip = ({ to, ...evt }) => evt;

export class MemoryBus {
  constructor() { this.subs = new Subscribers(); }
  async publish(to, evt) { setImmediate(() => this.subs.deliver(to, strip({ to, ...evt }))); }
  subscribe(uid, fn) { return this.subs.add(uid, fn); }
  async close() {}
}

export class PgBus {
  // db: el objeto de createDb (para NOTIFY por el pool); clientOptions: para la conexión dedicada de LISTEN.
  constructor(db, clientOptions) { this.db = db; this.opts = clientOptions; this.subs = new Subscribers(); this.closed = false; }
  async start() {
    this.client = new pg.Client(this.opts);
    this.client.on('notification', (n) => {
      let msg; try { msg = JSON.parse(n.payload); } catch { return; }
      if (msg && typeof msg.to === 'string') this.subs.deliver(msg.to, strip(msg));
    });
    // Si se cae la conexión de LISTEN, se reintenta a los 2 s (los clientes SSE reconectan solos y recuperan con GET).
    const retry = () => { if (!this.closed) setTimeout(() => this.start().catch(retry), 2000).unref(); };
    this.client.on('error', retry);
    await this.client.connect();
    await this.client.query(`listen ${CHANNEL}`);
  }
  async publish(to, evt) {
    await this.db.query('select pg_notify($1, $2)', [CHANNEL, JSON.stringify({ to, ...evt })]);
  }
  subscribe(uid, fn) { return this.subs.add(uid, fn); }
  async close() { this.closed = true; if (this.client) await this.client.end().catch(() => {}); }
}
