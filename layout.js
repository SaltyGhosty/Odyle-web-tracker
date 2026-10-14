// layout.js
// Navigation model and the "next decision" band. Pure: no DOM, tested with node --test.
import { formatDuration } from './energy.js';
import { wasteWarning, runsToday } from './planner.js';

// Rail order. `social` sections exist only on the web build (window.odyleSocialApi).
export const SECTIONS = [
  { id: 'personajes', label: 'Energía', icon: 'energia', social: false },
  { id: 'eventos', label: 'Eventos', icon: 'eventos', social: false },
  { id: 'amigos', label: 'Amigos', icon: 'amigos', social: true },
  { id: 'chat', label: 'Chat', icon: 'chat', social: true },
  { id: 'buscar', label: 'Buscar', icon: 'buscar', social: true },
  { id: 'legion', label: 'Legión', icon: 'legion', social: false },
  { id: 'estadisticas', label: 'Estadísticas', icon: 'estadisticas', social: false },
  { id: 'ajustes', label: 'Ajustes', icon: 'ajustes', social: false },
  { id: 'novedades', label: 'Novedades', icon: 'novedades', social: false },
];

const BAR = { web: ['personajes', 'eventos', 'amigos', 'chat'], artifact: ['personajes', 'eventos', 'legion', 'estadisticas'] };

export function navModel({ social }) {
  const rail = SECTIONS.filter((s) => social || !s.social).map((s) => s.id);
  const bar = social ? BAR.web : BAR.artifact;
  return { rail, bar, more: rail.filter((id) => !bar.includes(id)) };
}

export function resolveTab(saved, { social }) {
  return navModel({ social }).rail.includes(saved) ? saved : 'personajes';
}

// What the player should do next: crimson when someone is at cap, gold when someone will waste
// recharges before the end of the quiet window, neutral otherwise.
export function decisionBand(rows, now, { quiet, tzOffsetMin }) {
  if (!rows.length) return null;
  const full = rows.filter((r) => r.isFull);
  if (full.length === 1) return { tone: 'urgent', text: `${full[0].name} está al tope · pierde 15 OD cada 3 h`, targetId: full[0].id };
  if (full.length > 1) return { tone: 'urgent', text: `${full.length} personajes al tope · pierden 15 OD cada 3 h`, targetId: full[0].id };
  const pending = rows.filter((r) => r.fullAtMs !== null && r.fullAtMs !== undefined).sort((a, b) => a.fullAtMs - b.fullAtMs);
  for (const r of pending) {
    const w = wasteWarning(r.fullAtMs, now, quiet, tzOffsetMin);
    if (w) return { tone: 'warn', text: `${r.name} se llena en ${formatDuration(r.fullAtMs - now)} · perderías ${w.lossOD} OD si no juegas antes`, targetId: r.id };
  }
  if (!pending.length) return { tone: 'calm', text: 'Nadie al tope', targetId: null };
  const next = pending[0];
  return { tone: 'calm', text: `Nadie al tope · el próximo, ${next.name} en ${formatDuration(next.fullAtMs - now)}`, targetId: next.id };
}

// "Plan de hoy": per character, dungeon runs affordable before the day ends (recharges included) for every preset,
// plus one line saying what to do next. Without a recharge time only the current energy counts.
export function planRows(rows, presets, { anchorMs, now, endOfDayMs }) {
  return rows.map((r) => {
    const runs = {};
    for (const p of presets) runs[p.id] = runsToday(r.energy, p.cost, anchorMs, now, endOfDayMs).byMidnight;
    return { id: r.id, name: r.name, runs, next: nextGoal(r, presets[0], now) };
  });
}

function nextGoal(r, first, now) {
  if (r.isFull) return { tone: 'urgent', text: 'Gastar ya: está al tope' };
  if (r.fullAtMs === null || r.fullAtMs === undefined) return { tone: 'empty', text: 'Sin hora de recarga' };
  const left = formatDuration(r.fullAtMs - now);
  const n = first && first.cost > 0 ? Math.floor(r.energy / first.cost) : 0;
  return { tone: 'normal', text: n > 0 ? `${first.name} ×${n} en ${left}` : `Lleno en ${left}` };
}
