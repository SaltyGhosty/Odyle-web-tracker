// server/src/lib/social-events.js
// Convierte un evento del bus en lo que el usuario puede ver, releyendo la base (SR-45).
import { relation } from './social-rules.js';

export const toMessage = (r) => ({
  id: r.id, from: r.sender, to: r.recipient, kind: r.kind, body: r.body,
  at: Number(r.created_at), readAt: r.read_at == null ? null : Number(r.read_at),
});

// ctx.presence (opcional): permite informar del estado ACTUAL de presencia y no del que traía el evento.
export async function resolveEvent(q, me, evt, { presence } = {}) {
  if (!evt || typeof evt.id !== 'string') return null;
  switch (evt.type) {
    case 'message': {
      const row = (await q('select * from messages where id = $1 and (sender = $2 or recipient = $2)', [evt.id, me])).rows[0];
      if (!row) return null;
      const other = row.sender === me ? row.recipient : row.sender;
      if ((await relation(q, me, other)) === 'blocked') return null;
      return toMessage(row);
    }
    case 'read': return { uid: evt.id };
    case 'friend': {
      const rel = await relation(q, me, evt.id);
      return { uid: evt.id, relation: rel === 'blocked' ? 'none' : rel };
    }
    case 'presence': {
      if ((await relation(q, me, evt.id)) !== 'friends') return null;
      return { uid: evt.id, online: presence ? presence.isOnline(evt.id) : !!evt.online };
    }
    default: return null;
  }
}
