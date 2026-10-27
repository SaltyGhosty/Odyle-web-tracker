// stage.js
// Which character goes on the Energía "stage", its caption, and the card orb mode. Pure: no DOM.
import { formatDuration } from './energy.js';

export const CARD_3D_LIMIT = 8;

export function pickStage(rows, { pinnedId = null } = {}) {
  if (!rows || !rows.length) return null;
  const pinned = pinnedId == null ? null : rows.find((r) => r.id === pinnedId);
  if (pinned) return { id: pinned.id, tone: pinned.isFull ? 'urgent' : 'pinned' };
  const full = rows.find((r) => r.isFull);
  if (full) return { id: full.id, tone: 'urgent' };
  let next = null;
  for (const r of rows) {
    if (r.fullAtMs == null) continue;
    if (next === null || r.fullAtMs < next.fullAtMs) next = r;
  }
  return { id: (next || rows[0]).id, tone: 'next' };
}

export function stageCaption(row, nowMs) {
  if (row.isFull) return `pierde ${row.regen} OD cada 3 h`;
  if (row.fullAtMs == null) return 'Sin hora de recarga';
  return `Lleno en ${formatDuration(row.fullAtMs - nowMs)}`;
}

export function cardOrbMode(count) {
  return count > CARD_3D_LIMIT ? '2d' : '3d';
}
