// Achievements and streaks (pure). stats: {daysLog:{'YYYY-MM-DD':{spent,tasks}}, spentTotal, spendCount,
// tasksDone, fullDays, bestStreak}; maxCp: highest combat power among the viewer's characters.

export const ACHIEVEMENTS = [
  { id: 'spend-1', name: 'Primer gasto', desc: 'Gasta energía por primera vez', test: s => s.spendCount >= 1 },
  { id: 'spend-10', name: 'Habitual', desc: '10 gastos registrados', test: s => s.spendCount >= 10 },
  { id: 'spend-100', name: 'Veterano del Abismo', desc: '100 gastos registrados', test: s => s.spendCount >= 100 },
  { id: 'spend-500', name: 'Incansable', desc: '500 gastos registrados', test: s => s.spendCount >= 500 },
  { id: 'od-1000', name: 'Mil de Odyle', desc: 'Gasta 1.000 de OD en total', test: s => s.spentTotal >= 1000 },
  { id: 'od-10000', name: 'Río de Odyle', desc: 'Gasta 10.000 de OD en total', test: s => s.spentTotal >= 10000 },
  { id: 'streak-3', name: 'Constante', desc: 'Racha de 3 días', test: s => s.bestStreak >= 3 },
  { id: 'streak-7', name: 'Semana perfecta', desc: 'Racha de 7 días', test: s => s.bestStreak >= 7 },
  { id: 'streak-30', name: 'Daeva disciplinado', desc: 'Racha de 30 días', test: s => s.bestStreak >= 30 },
  { id: 'full-day', name: 'Día completo', desc: 'Completa todas las diarias de un personaje', test: s => s.fullDays >= 1 },
  { id: 'cp-100k', name: '100K de poder', desc: 'Un personaje con 100.000 de PC', test: (s, cp) => cp >= 100_000 },
  { id: 'cp-500k', name: '500K de poder', desc: 'Un personaje con 500.000 de PC', test: (s, cp) => cp >= 500_000 },
  { id: 'cp-1m', name: 'Leyenda de Atreia', desc: 'Un personaje con 1.000.000 de PC', test: (s, cp) => cp >= 1_000_000 },
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
