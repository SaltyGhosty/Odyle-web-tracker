// Daily / weekly task list (pure). Periods start at the server resets:
// daily 07:00 UTC, weekly Wednesday 07:00 UTC (see events.js).
const H = 3_600_000, D = 24 * H, W = 7 * D;
const DAILY_OFFSET = 7 * H;                       // 07:00 UTC
const WEEK_ANCHOR = Date.UTC(2026, 0, 7, 7);      // a Wednesday 07:00 UTC

export const DEFAULT_TASKS = [
  { id: 'd-abyss', name: 'Encargos de suministro del Abismo', kind: 'daily', max: 1 },
  { id: 'd-duty', name: 'Misiones de deber', kind: 'daily', max: 1 },
  { id: 'd-emergency', name: 'Mazmorra de emergencia', kind: 'daily', max: 1 },
  { id: 'w-dungeon', name: 'Mazmorra semanal', kind: 'weekly', max: 2 },
  { id: 'w-siege', name: 'Asedio del Artefacto', kind: 'weekly', max: 1 },
];

export function periodKeys(nowMs) {
  return {
    daily: Math.floor((nowMs - DAILY_OFFSET) / D),
    weekly: Math.floor((nowMs - WEEK_ANCHOR) / W),
  };
}

// End of the current daily period (the next daily reset), in ms.
export function nextDailyReset(nowMs) {
  return (periodKeys(nowMs).daily + 1) * D + DAILY_OFFSET;
}

// doc: {daily:{key, done:{id:n}}, weekly:{key, done:{id:n}}} or undefined.
// Returns {id: n} for the current periods only (a past period counts as 0).
export function progressFor(doc, tasks, nowMs) {
  const keys = periodKeys(nowMs);
  const out = {};
  for (const t of tasks) {
    const part = doc && doc[t.kind];
    const n = part && part.key === keys[t.kind] && part.done ? Number(part.done[t.id]) || 0 : 0;
    out[t.id] = Math.max(0, Math.min(t.max, n));
  }
  return out;
}

// The progress doc after setting one task's count (resets the period if it changed).
export function withCount(doc, task, count, nowMs) {
  const keys = periodKeys(nowMs);
  const part = doc && doc[task.kind] && doc[task.kind].key === keys[task.kind] ? doc[task.kind] : { key: keys[task.kind], done: {} };
  return { ...(doc || {}), [task.kind]: { key: keys[task.kind], done: { ...part.done, [task.id]: Math.max(0, Math.min(task.max, count)) } } };
}

export function parseTask(name, max) {
  const n = String(name).trim();
  if ([...n].length < 1 || [...n].length > 40) return { ok: false, error: 'Escribe un nombre de 1 a 40 caracteres' };
  const m = Number(String(max).trim());
  if (!Number.isInteger(m) || m < 1 || m > 10) return { ok: false, error: 'Las veces van de 1 a 10' };
  return { ok: true, value: { name: n, max: m } };
}
