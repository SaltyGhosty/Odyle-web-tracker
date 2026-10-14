// Pure logic for friends, chat and profile search (web only). No DOM and no network, so node --test covers it.
// Data shapes come from the server: public profile {uid, nick, server, faction, bio, legion, mainClass},
// message {id, from, to, kind, body, at, readAt}, conversation {profile, last, unread, friend}.
import { MAX, currentEnergy } from './energy.js';
import { classById } from './classes.js';

const byNick = (a, b) => String(a.nick || '').localeCompare(String(b.nick || ''), 'es', { sensitivity: 'base' });

export function sortFriends(list) {
  return [...list].sort((a, b) => Number(!!b.online) - Number(!!a.online) || byNick(a, b));
}

const byTime = (a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The same message can arrive twice (POST reply and live echo): one entry per id, newest data wins.
export function mergeMessages(list, incoming) {
  const map = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) if (m && typeof m.id === 'string') map.set(m.id, { ...map.get(m.id), ...m });
  return [...map.values()].sort(byTime);
}

// The other person read the thread: every message of mine counts as read, whatever the clocks say.
export const markMineRead = (list, me, at) => list.map((m) => (m.from === me && !m.readAt ? { ...m, readAt: at } : m));

export const otherOf = (msg, me) => (msg.from === me ? msg.to : msg.from);

const lastAt = (c) => (c.last ? c.last.at : 0);

// A live message moves its conversation to the top. It counts as unread only when it is from the other
// person, not already read, and that conversation is not the one on screen.
export function applyIncoming(convs, msg, me, { profile = null, openUid = null } = {}) {
  const uid = otherOf(msg, me);
  const i = convs.findIndex((c) => c.profile.uid === uid);
  const old = i >= 0 ? convs[i] : null;
  if (old && old.last && old.last.id === msg.id) return convs;
  const counts = msg.from !== me && uid !== openUid && !msg.readAt;
  const next = {
    profile: old ? old.profile : (profile || { uid, nick: '' }),
    last: !old || !old.last || msg.at >= old.last.at ? msg : old.last,
    unread: (old ? old.unread : 0) + (counts ? 1 : 0),
    friend: old ? old.friend : true,
  };
  return [next, ...convs.filter((_, j) => j !== i)].sort((a, b) => lastAt(b) - lastAt(a));
}

export const totalUnread = (convs) => convs.reduce((n, c) => n + (c.unread || 0), 0);
export const markRead = (convs, uid) => convs.map((c) => (c.profile.uid === uid && c.unread ? { ...c, unread: 0 } : c));

const trimmed = (s) => (typeof s === 'string' ? s.trim() : '');

export function serversOf(results) {
  return [...new Set(results.map((r) => trimmed(r.server)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

export function filterResults(results, { server = '', faction = '', classId = '' } = {}) {
  return results.filter((r) => (!server || trimmed(r.server) === server)
    && (!faction || r.faction === faction)
    && (!classId || r.mainClass === classId));
}

// Same limits as the server (server/src/routes/messages.js); the server stays the authority.
const CTRL = /[\u0000-\u0009\u000b-\u001f\u007f\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function parseMessageText(s) {
  const text = String(s ?? '').replace(CTRL, '').trim();
  if (!text) return { ok: false, error: 'Escribe un mensaje' };
  if (text.length > 1000) return { ok: false, error: 'El mensaje admite hasta 1000 caracteres' };
  return { ok: true, value: text };
}

const DAY = 86_400_000;
export function parseInvite({ title, at, slots, cost } = {}, now) {
  const t = String(title ?? '').replace(CTRL, ' ').trim().replace(/\s+/g, ' ');
  if (t.length < 1 || t.length > 60) return { ok: false, error: 'El título necesita entre 1 y 60 caracteres' };
  if (!Number.isFinite(at) || at < now - 5 * 60_000 || at > now + 365 * DAY) return { ok: false, error: 'Elige una fecha dentro del próximo año' };
  const s = Number(slots), c = Number(cost);
  if (!Number.isInteger(s) || s < 1 || s > 12) return { ok: false, error: 'Las plazas van de 1 a 12' };
  if (!Number.isInteger(c) || c < 0 || c > MAX) return { ok: false, error: 'El coste va de 0 a 840 OD' };
  return { ok: true, value: { kind: 'invite', title: t, at, slots: s, cost: c } };
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const cryptoRand = () => { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] / 2 ** 32; };

// Sent with each message so a retry after a network error does not create a second copy.
export function makeClientId(rand = globalThis.crypto && globalThis.crypto.getRandomValues ? cryptoRand : Math.random) {
  let s = '';
  for (let i = 0; i < 20; i++) s += ID_CHARS[Math.floor(rand() * 64) % 64];
  return s;
}

export function actionsFor(relation) {
  switch (relation) {
    case 'none': return ['add'];
    case 'pending-out': return ['cancel'];
    case 'pending-in': return ['accept', 'reject'];
    case 'friends': return ['message', 'remove'];
    default: return [];
  }
}

// Recharges are server-wide, so the viewer's own recharge time projects a friend's stored energy.
export function friendEnergy(characters, anchorMs, now) {
  if (!Array.isArray(characters)) return [];
  return characters.filter((c) => c && Number.isFinite(c.energy)).map((c) => {
    const energy = Math.min(MAX, anchorMs != null && Number.isFinite(c.recordedAt)
      ? currentEnergy({ energy: c.energy, recordedAt: c.recordedAt }, anchorMs, now) : c.energy);
    const cls = classById(c.classId);
    return { name: typeof c.name === 'string' ? c.name : '', classId: cls ? cls.id : null, energy,
      percent: Math.min(100, Math.floor(energy / MAX * 100)), isFull: energy >= MAX };
  }).sort((a, b) => b.energy - a.energy || a.name.localeCompare(b.name, 'es'));
}

export function shareText(rows) {
  if (!rows || !rows.length) return null;
  const parts = rows.slice(0, 8).map((r) => `${r.name} ${r.energy}/${MAX}${r.isFull ? ' (lleno)' : ''}`);
  return `Mi energía: ${parts.join(' · ')}`.slice(0, 1000);
}
