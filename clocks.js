// Relojes de la barra superior y orden de la lista de eventos (puro, sin DOM).
import { EVENTS, nextOccurrence } from './events.js';

export const RESET_IDS = ['daily', 'weekly'];

// Próximo evento no-reinicio: uno en curso gana a cualquiera próximo (el que acaba antes);
// si no hay en curso, el de inicio más cercano.
export function headerClocks(nowMs, events = EVENTS) {
  const reset = id => {
    const e = events.find(x => x.id === id);
    return e ? { startMs: nextOccurrence(e, nowMs).startMs } : null;
  };
  let next = null;
  for (const e of events) {
    if (RESET_IDS.includes(e.id)) continue;
    const o = nextOccurrence(e, nowMs);
    const better = !next
      || (o.active && !next.active)
      || (o.active === next.active && (o.active ? o.endMs < next.endMs : o.startMs < next.startMs));
    if (better) next = { id: e.id, name: e.name, startMs: o.startMs, endMs: o.endMs, active: o.active };
  }
  return { daily: reset('daily'), weekly: reset('weekly'), next };
}

// Reinicios primero (diario, semanal); el resto conserva su orden. Devuelve un array nuevo.
export function sortEvents(items) {
  const head = RESET_IDS.map(id => items.find(i => i.e.id === id)).filter(Boolean);
  return [...head, ...items.filter(i => !RESET_IDS.includes(i.e.id))];
}
