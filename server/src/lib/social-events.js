// server/src/lib/social-events.js
// Convierte un evento del bus en lo que el usuario puede ver, releyendo la base (SR-45).
import { relation } from './social-rules.js';

export const toMessage = (r) => ({
  id: r.id, from: r.sender, to: r.recipient, kind: r.kind, body: r.body,
  at: Number(r.created_at), readAt: r.read_at == null ? null : Number(r.read_at),
});

export async function resolveEvent(q, me, evt) {
  if (!evt || typeof evt.id !== 'string') return null;
  switch (evt.type) {
    case 'message': {
      const row = (await q('select * from messages where id = $1 and (sender = $2 or recipient = $2)', [evt.id, me])).rows[0];
      return row ? toMessage(row) : null;
    }
    case 'read': return { uid: evt.id };
    case 'friend': {
      const rel = await relation(q, me, evt.id);
      return { uid: evt.id, relation: rel === 'blocked' ? 'none' : rel };
    }
    case 'presence':
      return (await relation(q, me, evt.id)) === 'friends' ? { uid: evt.id, online: !!evt.online } : null;
    default: return null;
  }
}
