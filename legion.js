// Legions and profiles (pure). A legion's id is its leader's uid; members point at it with
// members/{uid}.legionId. Invite codes are 8 characters; only their hash is stored where everyone reads.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1: easy to read aloud

export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length) % ALPHABET.length];
  return s;
}

export function normalizeCode(input) {
  const s = String(input ?? '').toUpperCase().replace(/[\s-]/g, '');
  return s.length === 8 && [...s].every(ch => ALPHABET.includes(ch)) ? s : null;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const hashCode = code => sha256('odyle:' + code);
// Named-room names must be lowercase [a-z0-9_.-]; uids are not, so the room is named by a hash.
export const roomName = async legionId => 'lg-' + (await sha256('room:' + legionId)).slice(0, 16);

export function parseLegionName(input) {
  const v = String(input ?? '').trim().replace(/\s+/g, ' ');
  if (v.length < 3) return { ok: false, error: 'El nombre de la legión necesita al menos 3 caracteres' };
  if (v.length > 24) return { ok: false, error: 'Máximo 24 caracteres' };
  return { ok: true, value: v };
}

export function parseProfile({ nick, server, bio, faction, mainCharId } = {}, charIds = []) {
  const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, n + 1);
  const n = clean(nick, 20), sv = clean(server, 20), b = clean(bio, 80);
  if (n.length < 2 || n.length > 20) return { ok: false, error: 'Tu nombre necesita entre 2 y 20 caracteres' };
  if (sv.length > 20) return { ok: false, error: 'El servidor admite hasta 20 caracteres' };
  if (b.length > 80) return { ok: false, error: 'La frase admite hasta 80 caracteres' };
  if (faction !== 'elyos' && faction !== 'asmodian') return { ok: false, error: 'Elige una facción' };
  return { ok: true, value: { nick: n, server: sv, bio: b, faction, mainCharId: charIds.includes(mainCharId) ? mainCharId : null } };
}

// The proof ties an invite code to ONE legion: copying a legion's public fields into another
// legion doc does not make the code work there, because the proof is checked against the id.
export const proofFor = (legionId, code) => sha256('proof:' + legionId + ':' + code);
export async function pickLegion(candidates, code) {
  for (const c of candidates) if (c && c.proof && c.proof === await proofFor(c.id, code)) return c;
  return null;
}

// The legion a member really belongs to: it exists, is the same incarnation they joined
// (a leader who dissolves and re-creates gets a new epoch) and has not banned them.
export function legionOf(memberDoc, legions, uid) {
  const id = memberDoc && typeof memberDoc.legionId === 'string' ? memberDoc.legionId : null;
  const l = id ? legions.get(id) : null;
  if (!l || !l.epoch || memberDoc.legionEpoch !== l.epoch) return null;
  if (Array.isArray(l.banned) && l.banned.includes(uid)) return null;
  return { id, ...l };
}
// Where a legion's shared data and room live: one place per incarnation.
export const legionKey = legion => legion ? `${legion.id}-${legion.epoch}` : null;

// The other members of my legion.
export function sameLegion(memberData, myUid, legions) {
  const mine = legionOf(memberData.get(myUid), legions, myUid);
  if (!mine) return [];
  return [...memberData.keys()].filter(uid => uid !== myUid && legionOf(memberData.get(uid), legions, uid)?.id === mine.id);
}

export function legionTitle(legion, uid) {
  if (!legion) return '';
  return (legion.id === uid ? 'Líder · ' : '') + `‹${legion.name}›`;
}
