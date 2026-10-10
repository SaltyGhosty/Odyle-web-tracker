export const REGEN = 15;
export const TICK_MS = 10_800_000;
export const MAX = 840;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// Ticks anchorMs + k*TICK_MS (k any integer) inside (fromMs, toMs].
export function ticksBetween(anchorMs, fromMs, toMs) {
  return Math.floor((toMs - anchorMs) / TICK_MS) - Math.floor((fromMs - anchorMs) / TICK_MS);
}

// First tick strictly after nowMs.
export function nextTickAt(anchorMs, nowMs) {
  return anchorMs + (Math.floor((nowMs - anchorMs) / TICK_MS) + 1) * TICK_MS;
}

export function currentEnergy(char, anchorMs, nowMs) {
  if (char.energy >= MAX) return char.energy;
  return Math.min(MAX, char.energy + REGEN * ticksBetween(anchorMs, char.recordedAt, nowMs));
}

// Epoch ms when energy reaches MAX, or null if already full.
export function fullAt(char, anchorMs, nowMs) {
  const c = currentEnergy(char, anchorMs, nowMs);
  if (c >= MAX) return null;
  return nextTickAt(anchorMs, nowMs) + (Math.ceil((MAX - c) / REGEN) - 1) * TICK_MS;
}

export function anchorFromCountdown(nowMs, minutesLeft) {
  return nowMs + minutesLeft * MIN_MS;
}

export function formatDuration(ms) {
  if (ms < MIN_MS) return '<1m';
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MIN_MS);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
