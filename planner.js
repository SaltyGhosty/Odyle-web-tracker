// Planning helpers: summary tip, waste warning during rest hours, energy forecast (pure).
import { REGEN, TICK_MS, currentEnergy, nextTickAt, formatDuration } from './energy.js';

const D = 86_400_000;
const hm = s => { const [h, m] = s.split(':').map(Number); return (h * 60 + m) * 60_000; };

export function summary(rows, nowMs) {
  const total = rows.reduce((a, r) => a + r.energy, 0);
  const fullNow = rows.filter(r => r.isFull).map(r => r.name);
  const pending = rows.filter(r => !r.isFull && r.fullAtMs !== null).sort((a, b) => a.fullAtMs - b.fullAtMs);
  const nextFull = pending.length ? { id: pending[0].id, name: pending[0].name, fullAtMs: pending[0].fullAtMs } : null;
  let tip = '';
  if (fullNow.length) tip = `${fullNow[0]} está lleno: gasta energía para no perder recargas`;
  else if (nextFull) tip = `Juega con ${nextFull.name}: se llena en ${formatDuration(nextFull.fullAtMs - nowMs)}`;
  return { total, fullNow, nextFull, tip };
}

// The rest window that ends next (the current one if inside it); times in the viewer's local clock.
// tzOffsetMin is Date#getTimezoneOffset(). Recharges that would land while full inside it are lost.
export function wasteWarning(fullAtMs, nowMs, quiet, tzOffsetMin) {
  if (fullAtMs === null || fullAtMs === undefined) return null;
  const shift = tzOffsetMin * 60_000;
  const nowL = nowMs - shift, fullL = fullAtMs - shift;
  const s = hm(quiet.start), e = hm(quiet.end);
  const len = e > s ? e - s : D - s + e;
  const day0 = Math.floor(nowL / D) * D;
  let endL = Infinity;
  for (let k = -1; k <= 1; k++) { const end = day0 + k * D + s + len; if (end > nowL) endL = Math.min(endL, end); }
  if (!(fullL < endL)) return null;
  const lossOD = REGEN * Math.floor((endL - fullL) / TICK_MS);
  return lossOD > 0 ? { lossOD, deadlineMs: fullAtMs } : null;
}

export function projectEnergy(char, anchorMs, nowMs, days) {
  const pts = [{ t: nowMs, energy: currentEnergy(char, anchorMs, nowMs) }];
  const until = nowMs + days * D;
  for (let t = nextTickAt(anchorMs, nowMs); t <= until; t += TICK_MS) {
    pts.push({ t, energy: currentEnergy(char, anchorMs, t) }); // already capped at 840 (values above it stay)
  }
  return pts;
}
