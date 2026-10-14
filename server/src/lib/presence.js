// Quién tiene un stream abierto en ESTE proceso (spec §2). Con un solo servidor en Render es la presencia global.
export function createPresence() {
  const open = new Map();
  return {
    add(uid) { const n = (open.get(uid) || 0) + 1; open.set(uid, n); return n === 1; },
    remove(uid) { const n = (open.get(uid) || 0) - 1; if (n <= 0) { open.delete(uid); return true; } open.set(uid, n); return false; },
    count(uid) { return open.get(uid) || 0; },
    isOnline(uid) { return open.has(uid); },
  };
}
