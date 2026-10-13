// Los mensajes se guardan 1 año (spec 2026-10-13 §3).
export const RETENTION_MS = 365 * 24 * 3600 * 1000;

export async function purgeOldMessages(db, now) {
  const r = await db.query('delete from messages where created_at < $1', [now - RETENTION_MS]);
  return r.rowCount;
}
