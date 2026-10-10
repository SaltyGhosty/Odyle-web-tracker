// Aion 2 recurring events (server time = UTC). Source: questlog.gg timer pages, 10/10/2026.
const M = 60_000, H = 60 * M, D = 24 * H;

export const EVENTS = [
  { id: 'daily', name: 'Reinicio diario', rule: { every: 'day', hour: 7, minute: 0 }, durationMin: 0, note: 'Actividades, misiones y entradas a mazmorras' },
  { id: 'weekly', name: 'Reinicio semanal', rule: { every: 'week', days: [3], hour: 7, minute: 0 }, durationMin: 0, note: 'Actividades semanales y raids' },
  { id: 'shugo', name: 'Festival Shugo', rule: { every: 'hour', minute: 0 }, durationMin: 10, note: 'Minijuego de 4 a 9 jugadores' },
  { id: 'rift', name: 'Grieta espaciotemporal', rule: { every: 'hours', n: 3, fromHour: 0 }, durationMin: 10, note: 'El portal abre 10 min; el evento dura 1 h' },
  { id: 'kaira', name: 'Vigilante Kaira', rule: { every: 'hours', n: 3, fromHour: 1 }, durationMin: 0, note: 'Reshanta inferior, lugar aleatorio' },
  { id: 'siege', name: 'Asedio del Artefacto', rule: { every: 'week', days: [1, 4, 6], hour: 12, minute: 0 }, durationMin: 30, note: 'La facción ganadora accede al Corredor del Abismo' },
  { id: 'siegeBosses', name: 'Jefes del asedio', rule: { every: 'week', days: [1, 4, 6], hour: 12, minute: 30 }, durationMin: 30, note: 'Ejecutores en Reshanta inferior y media' },
  { id: 'nahma', name: 'Señor guardián Nahma', rule: { every: 'week', days: [0, 5], hour: 12, minute: 0 }, durationMin: 30, note: 'Reshanta inferior y media' },
];

// Latest start ≤ now for the rule (next start is derived from it, or searched for weekly rules).
function starts(rule, now) {
  if (rule.every === 'hour') { const p = Math.floor((now - rule.minute * M) / H) * H + rule.minute * M; return [p, p + H]; }
  if (rule.every === 'hours') { const P = rule.n * H, off = rule.fromHour * H; const p = Math.floor((now - off) / P) * P + off; return [p, p + P]; }
  const t = rule.hour * H + rule.minute * M;
  if (rule.every === 'day') { const p = Math.floor((now - t) / D) * D + t; return [p, p + D]; }
  // week: scan two weeks of day starts around now
  const today = Math.floor(now / D) * D;
  let prev = -Infinity, next = Infinity;
  for (let i = -7; i <= 7; i++) {
    const s = today + i * D + t;
    if (!rule.days.includes(new Date(s).getUTCDay())) continue;
    if (s <= now) prev = Math.max(prev, s); else next = Math.min(next, s);
  }
  return [prev, next];
}

export function nextOccurrence(event, nowMs) {
  const dur = event.durationMin * M;
  const [prev, next] = starts(event.rule, nowMs);
  if (nowMs < prev + dur) return { startMs: prev, endMs: prev + dur, active: true };
  return { startMs: next, endMs: next + dur, active: false };
}
