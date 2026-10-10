import { MAX, currentEnergy, fullAt, nextTickAt, formatDuration } from './energy.js';
import { NEUTRAL_COLOR, classById } from './classes.js';

// Within two recharges (2 x 15) of the cap.
export const NEAR_FULL = 810;

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
    const cls = classById(c.classId);
    return {
      id: c.id,
      name: c.name,
      classId: cls ? cls.id : null,
      color: cls ? cls.color : NEUTRAL_COLOR,
      nearFull: !isFull && energy >= NEAR_FULL,
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

export function parseClassInput(s) {
  const t = s.trim();
  if (t === '') return { ok: true, value: null };
  if (classById(t)) return { ok: true, value: t };
  return { ok: false, error: 'Elige una clase de la lista' };
}
