// Única fuente de verdad de los permisos sociales (spec 2026-10-13 §2, SR-39..SR-42).
// q: (text, params) => Promise<{rows}> (db.query o el q de una transacción).
import { UID_RE } from './validate.js';

export const NOT_FOUND = 'No encontrado.';
export const pairOf = (a, b) => (a < b ? [a, b] : [b, a]);
export const pairKey = (a, b) => pairOf(a, b).join('|');

export async function relation(q, me, other) {
  if (me === other) return 'self';
  const b = await q('select 1 from blocks where (blocker = $1 and blocked = $2) or (blocker = $2 and blocked = $1)', [me, other]);
  if (b.rows.length) return 'blocked';
  const [a, c] = pairOf(me, other);
  const f = (await q('select status, requested_by from friendships where user_a = $1 and user_b = $2', [a, c])).rows[0];
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requested_by === me ? 'pending-out' : 'pending-in';
}

export async function visible(q, me, other) {
  if (typeof other !== 'string' || !UID_RE.test(other) || other === me) return false;
  if (!(await q('select 1 from users where id = $1', [other])).rows.length) return false;
  return (await relation(q, me, other)) !== 'blocked';
}

export async function friendIds(q, me) {
  const rows = (await q("select user_a, user_b from friendships where status = 'accepted' and (user_a = $1 or user_b = $1)", [me])).rows;
  return rows.map((r) => (r.user_a === me ? r.user_b : r.user_a));
}

export async function blockedEither(q, me) {
  const rows = (await q('select blocker, blocked from blocks where blocker = $1 or blocked = $1', [me])).rows;
  return new Set(rows.map((r) => (r.blocker === me ? r.blocked : r.blocker)));
}

const docData = async (q, path) => (await q('select data from docs where path = $1', [path])).rows[0]?.data ?? null;
const s = (v) => (typeof v === 'string' ? v : '');

// Solo campos de la lista blanca (SR-39): nunca correo, hashes ni datos de la legión salvo su nombre.
export async function publicProfile(q, uid) {
  const m = (await docData(q, `members/${uid}`)) || {};
  const p = m.profile && typeof m.profile === 'object' ? m.profile : {};
  let legion = null;
  if (typeof m.legionId === 'string') {
    const l = await docData(q, `legions/${m.legionId}`);
    if (l && typeof l.name === 'string') legion = l.name;
  }
  let mainClass = null;
  if (typeof p.mainCharId === 'string') {
    const c = await docData(q, `members/${uid}/characters/${p.mainCharId}`);
    if (c && typeof c.classId === 'string') mainClass = c.classId;
  }
  return {
    uid, nick: s(p.nick), server: s(p.server),
    faction: p.faction === 'elyos' || p.faction === 'asmodian' ? p.faction : null,
    bio: s(p.bio), legion, mainClass,
    searchable: p.searchable !== false, shareEnergy: p.shareEnergy !== false,
  };
}

export const toPublic = ({ uid, nick, server, faction, bio, legion, mainClass }) => ({ uid, nick, server, faction, bio, legion, mainClass });
