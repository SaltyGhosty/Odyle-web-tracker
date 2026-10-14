export const TICK_MS = 10_800_000;
export const MAX = 840;           // highest cap of any account
// Odyle energy per account (Aion 2): same shared recharge moment, different amount and cap.
export const ACCOUNTS = { normal: { regen: 15, max: 560 }, premium: { regen: 30, max: 840 } };
// Characters saved before accounts existed were tracked with the 840 cap: no account = premium.
export function rulesOf(char) {
  const account = char && char.account === 'normal' ? 'normal' : 'premium';
  return { account, ...ACCOUNTS[account] };
}

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
  const { regen, max } = rulesOf(char);
  if (char.energy >= max) return char.energy;
  return Math.min(max, char.energy + regen * Math.max(0, ticksBetween(anchorMs, char.recordedAt, nowMs)));
}

// Epoch ms when energy reaches the account cap, or null if already full.
export function fullAt(char, anchorMs, nowMs) {
  const { regen, max } = rulesOf(char);
  const c = currentEnergy(char, anchorMs, nowMs);
  if (c >= max) return null;
  return nextTickAt(anchorMs, nowMs) + (Math.ceil((max - c) / regen) - 1) * TICK_MS;
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
