// Achievements and streaks (pure). stats: {daysLog:{'YYYY-MM-DD':{spent,tasks}}, spentTotal, spendCount,
// tasksDone, fullDays, bestStreak}; maxCp: highest combat power among the viewer's characters.

export const ACHIEVEMENTS = [
  { id: 'spend-1', name: 'Primer gasto', desc: 'Gasta energía por primera vez', test: s => s.spendCount >= 1 },
  { id: 'spend-5', name: 'Calentando', desc: '5 gastos registrados', test: s => s.spendCount >= 5 },
  { id: 'spend-25', name: 'Habitual', desc: '25 gastos registrados', test: s => s.spendCount >= 25 },
  { id: 'spend-100', name: 'Veterano del Abismo', desc: '100 gastos registrados', test: s => s.spendCount >= 100 },
  { id: 'od-300', name: 'Primeros pasos', desc: 'Gasta 300 de OD en total', test: s => s.spentTotal >= 300 },
  { id: 'od-1500', name: 'Mil de Odyle', desc: 'Gasta 1.500 de OD en total', test: s => s.spentTotal >= 1500 },
  { id: 'od-5000', name: 'Río de Odyle', desc: 'Gasta 5.000 de OD en total', test: s => s.spentTotal >= 5000 },
  { id: 'streak-2', name: 'Vuelvo mañana', desc: 'Racha de 2 días', test: s => s.bestStreak >= 2 },
  { id: 'streak-5', name: 'Constante', desc: 'Racha de 5 días', test: s => s.bestStreak >= 5 },
  { id: 'streak-14', name: 'Daeva disciplinado', desc: 'Racha de 14 días', test: s => s.bestStreak >= 14 },
  { id: 'full-day', name: 'Día completo', desc: 'Completa todas las diarias de un personaje', test: s => s.fullDays >= 1 },
  { id: 'full-day-7', name: 'Semana redonda', desc: 'Completa todas las diarias 7 veces', test: s => s.fullDays >= 7 },
  { id: 'cp-25k', name: 'Daeva en marcha', desc: 'Un personaje con 25.000 de PC', test: (s, cp) => cp >= 25_000 },
  { id: 'cp-75k', name: 'Guerrero probado', desc: 'Un personaje con 75.000 de PC', test: (s, cp) => cp >= 75_000 },
  { id: 'cp-150k', name: 'Élite de Atreia', desc: 'Un personaje con 150.000 de PC', test: (s, cp) => cp >= 150_000 },
  { id: 'cp-300k', name: 'Leyenda de Atreia', desc: 'Un personaje con 300.000 de PC', test: (s, cp) => cp >= 300_000 },
];

export const EMPTY_STATS = { daysLog: {}, spentTotal: 0, spendCount: 0, tasksDone: 0, fullDays: 0, bestStreak: 0 };

const dayStr = ms => new Date(ms).toISOString().slice(0, 10);
const prevDay = d => dayStr(Date.parse(d + 'T12:00:00Z') - 86_400_000);

// Consecutive active days ending today (or yesterday, if today has no activity yet).
export function streak(daysLog, todayKey) {
  let d = daysLog[todayKey] ? todayKey : prevDay(todayKey);
  let n = 0;
  while (daysLog[d]) { n++; d = prevDay(d); }
  return n;
}

// Stats after recording activity today; keeps the last 60 days of the log.
export function bumped(stats, todayKey, { spent = 0, spends = 0, tasks = 0, fullDays = 0 } = {}) {
  const s = { ...EMPTY_STATS, ...(stats || {}) };
  const log = { ...s.daysLog };
  const today = log[todayKey] || { spent: 0, tasks: 0 };
  log[todayKey] = { spent: today.spent + spent, tasks: today.tasks + tasks };
  const keys = Object.keys(log).sort();
  while (keys.length > 60) delete log[keys.shift()];
  const next = { ...s, daysLog: log, spentTotal: s.spentTotal + spent, spendCount: s.spendCount + spends,
    tasksDone: s.tasksDone + tasks, fullDays: s.fullDays + fullDays };
  next.bestStreak = Math.max(s.bestStreak, streak(log, todayKey));
  return next;
}

export function unlocked(stats, maxCp) {
  const s = { ...EMPTY_STATS, ...(stats || {}) };
  return ACHIEVEMENTS.map(a => ({ ...a, done: !!a.test(s, maxCp || 0) }));
}

// Sum of the last 7 days (including today) from the log.
export function weekTotals(daysLog, todayKey) {
  let spent = 0, tasks = 0, d = todayKey;
  for (let i = 0; i < 7; i++) { const e = daysLog[d]; if (e) { spent += e.spent; tasks += e.tasks; } d = prevDay(d); }
  return { spent, tasks };
}
