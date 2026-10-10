// Pure helpers for the page's animations (no DOM).

const pad = n => String(n).padStart(2, '0');

export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(total % 60)}`;
}

// A gain is a rise in computed energy for a known character whose stored value
// (recordedAt) and recharge schedule (anchorMs) did not change — i.e. a recharge, not a
// manual edit or a schedule change. Ticks missed
// while the page was hidden collapse into one event.
export function detectGains(prev, rows) {
  const gains = [];
  for (const r of rows) {
    const p = prev.get(r.id);
    if (p && p.recordedAt === r.recordedAt && p.anchorMs === r.anchorMs && r.energy > p.energy) {
      gains.push({ id: r.id, gain: r.energy - p.energy });
    }
  }
  return gains;
}

// Ease-out cubic interpolation, rounded; t is clamped to [0, 1].
export function rollValue(from, to, t) {
  const k = Math.min(1, Math.max(0, t));
  return Math.round(from + (to - from) * (1 - (1 - k) ** 3));
}
