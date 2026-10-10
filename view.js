import { MAX, currentEnergy, fullAt, nextTickAt, formatDuration } from './energy.js';

const NOT_SCHEDULED_TEXT = 'Falta la hora de recarga';
const FULL_TEXT = 'Lleno';

// schedule: {anchorMs} or null when no recharge time has been stored yet.
export function buildView(characters, schedule, nowMs) {
  const anchorMs = schedule && Number.isFinite(schedule.anchorMs) ? schedule.anchorMs : null;
  characters = characters.filter(c => c && typeof c.name === 'string'
    && Number.isFinite(c.energy) && Number.isFinite(c.recordedAt));
  const nextTickInMs = anchorMs === null ? null : nextTickAt(anchorMs, nowMs) - nowMs;
  const sorted = [...characters].sort((a, b) =>
    a.order - b.order || a.name.localeCompare(b.name, 'es'));
  const rows = sorted.map(c => {
    const energy = anchorMs === null ? c.energy : currentEnergy(c, anchorMs, nowMs);
    const isFull = energy >= MAX;
    const fullAtMs = anchorMs === null ? null : fullAt(c, anchorMs, nowMs);
    let fullInText;
    if (isFull) fullInText = FULL_TEXT;
    else if (anchorMs === null) fullInText = NOT_SCHEDULED_TEXT;
    else fullInText = formatDuration(fullAtMs - nowMs);
    return {
      id: c.id,
      name: c.name,
      energy,
      max: MAX,
      percent: Math.min(100, Math.floor(energy / MAX * 100)),
      isFull,
      fullInText,
      fullAtMs,
    };
  });
  return { nextTickInMs, rows };
}

function parseWhole(s, min, max, error) {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return { ok: false, error };
  const value = Number(t);
  if (value < min || value > max) return { ok: false, error };
  return { ok: true, value };
}

export function parseEnergyInput(s) {
  return parseWhole(s, 0, 99999, 'Escribe un número entero entre 0 y 99999');
}

export function parseMinutesInput(s) {
  return parseWhole(s, 1, 180, 'Escribe un número entero entre 1 y 180');
}

export function parseNameInput(s) {
  const t = s.trim();
  const len = [...t].length;
  if (len < 1 || len > 24) return { ok: false, error: 'Escribe un nombre de 1 a 24 caracteres' };
  return { ok: true, value: t };
}
