// Spending, extra energy and the spend log (pure; no DOM, no db).
const DAY = 86_400_000;
const CAP = 99_999;

export function applyDelta(current, delta) {
  const next = current + delta;
  if (next < 0) return { ok: false, error: 'No hay energía suficiente' };
  return { ok: true, energy: Math.min(CAP, next) };
}

const whole = (s, min, max) => { const t = String(s).trim(); if (!/^\d+$/.test(t)) return null; const v = Number(t); return v >= min && v <= max ? v : null; };

export function parsePreset(name, cost) {
  const n = String(name).trim();
  const len = [...n].length;
  if (len < 1 || len > 20) return { ok: false, error: 'Escribe un nombre de 1 a 20 caracteres' };
  const c = whole(cost, 1, 840);
  if (c === null) return { ok: false, error: 'El coste es un número entero entre 1 y 840' };
  return { ok: true, value: { name: n, cost: c } };
}

export function parseExtraInput(s) {
  const v = whole(s, 1, 9999);
  return v === null ? { ok: false, error: 'Escribe un número entero entre 1 y 9999' } : { ok: true, value: v };
}

// tzOffsetMin is Date#getTimezoneOffset() (minutes UTC − local, e.g. −120 for UTC+2).
const dayKey = (ms, tzOffsetMin) => new Date(ms - tzOffsetMin * 60_000).toISOString().slice(0, 10);

export function dailySpent(events, nowMs, tzOffsetMin, days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push({ day: dayKey(nowMs - i * DAY, tzOffsetMin), spent: 0 });
  const byDay = new Map(out.map(d => [d.day, d]));
  for (const e of events) {
    if (e.kind !== 'spend') continue;
    const d = byDay.get(dayKey(e.at, tzOffsetMin));
    if (d) d.spent += e.amount;
  }
  return out;
}

export function staleEvents(events, nowMs, days = 30) {
  return events.filter(e => e.at < nowMs - days * DAY).map(e => e.id);
}
