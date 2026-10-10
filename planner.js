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

// Dungeon runs you can afford now, and by the end of the day counting recharges until then.
export function runsToday(energy, cost, anchorMs, nowMs, endOfDayMs) {
  if (!(cost > 0)) return { now: 0, byMidnight: 0 };
  const now = Math.floor(energy / cost);
  let gained = 0;
  if (anchorMs !== null && anchorMs !== undefined) {
    for (let t = nextTickAt(anchorMs, nowMs); t <= endOfDayMs; t += TICK_MS) gained += REGEN;
  }
  return { now, byMidnight: Math.floor((energy + gained) / cost) };
}

// Pace simulator: spend `runsPerDay` × cost every day (spread evenly), recharge every 3 h, cap 840.
// Returns OD lost to the cap and the first day energy cannot cover the day's runs.
export function simulate(energy, anchorMs, nowMs, runsPerDay, cost, days = 7) {
  const step = TICK_MS;
  let e = energy, waste = 0, emptyOn = null;
  const spendEvery = runsPerDay > 0 ? 86_400_000 / runsPerDay : Infinity;
  let nextSpend = nowMs + spendEvery / 2;
  let nextTick = anchorMs !== null && anchorMs !== undefined ? nextTickAt(anchorMs, nowMs) : Infinity;
  const end = nowMs + days * 86_400_000;
  while (true) {
    const t = Math.min(nextSpend, nextTick);
    if (t > end) break;
    if (t === nextTick) {
      if (e >= 840) waste += REGEN; // already full: the whole recharge is lost
      else { const next = e + REGEN; waste += Math.max(0, next - 840); e = Math.min(840, next); }
      nextTick += step;
    } else {
      if (e >= cost) e -= cost; else if (emptyOn === null) emptyOn = t;
      nextSpend += spendEvery;
    }
  }
  return { wasteOD: waste, emptyOn };
}

// Combat-power goal: estimated date at the recent pace (least-squares over the last 30 days of entries).
export function cpEta(points, goal, nowMs) {
  const recent = points.filter(p => p.at >= nowMs - 30 * 86_400_000);
  if (recent.length < 2 || !(goal > 0)) return null;
  const n = recent.length, mx = recent.reduce((a, p) => a + p.at, 0) / n, my = recent.reduce((a, p) => a + p.cp, 0) / n;
  const num = recent.reduce((a, p) => a + (p.at - mx) * (p.cp - my), 0), den = recent.reduce((a, p) => a + (p.at - mx) ** 2, 0);
  if (den === 0) return null;
  const slope = num / den; // cp per ms
  const last = recent.at(-1);
  if (last.cp >= goal) return { reached: true, at: last.at };
  if (slope <= 0) return { reached: false, at: null };
  const at = last.at + (goal - last.cp) / slope;
  // a nearly flat trend gives absurd dates (beyond what Date can show): treat as "no estimate"
  return { reached: false, at: Number.isFinite(at) && at - nowMs < 5 * 365 * 86_400_000 ? at : null };
}
