// Validación de rutas y documentos (SR-4, SR-23..26). Todo lo que entra se comprueba aquí antes de tocar la base.
import { FORBIDDEN_KEYS, isPlain } from './merge.js';

export const MAX_DOC_BYTES = 64 * 1024;
const SEG_RE = /^[A-Za-z0-9_~-]{1,128}$/;
export const UID_RE = /^u_[A-Za-z0-9]{22}$/;
const MAX_PATH = 512;
const MAX_DEPTH = 6;
const MAX_JSON_DEPTH = 8;
const MAX_KEYS = 500;
const MAX_KEY_LEN = 128;
// Controles (incluido \t; el \n se quita aparte salvo en notas/texto), \u0000, DEL, C1 y marcas de dirección bidi.
const BAD_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
const BAD_KEY = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/;
const MULTILINE_KEYS = new Set(['notes', 'text']);
const LIMITS = Object.assign(Object.create(null), { nick: 20, server: 20, bio: 80, name: 60, notes: 500, title: 60, text: 1000 });
const DEFAULT_LIMIT = 500;

const bad = (error, status = 400) => ({ error, status });

// Parte la ruta CRUDA por '/', decodifica cada segmento una sola vez y valida (SR-23).
export function parsePath(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_PATH) return bad('Ruta no válida');
  const segs = [];
  for (const part of raw.split('/')) {
    let s;
    try { s = decodeURIComponent(part); } catch { return bad('Ruta no válida'); }
    if (!SEG_RE.test(s)) return bad('Ruta no válida');
    segs.push(s);
  }
  if (segs.length > MAX_DEPTH) return bad('Ruta no válida');
  return { segments: segs };
}

export const MEMBER_SUBS = new Set(['characters', 'settings', 'events', 'cp', 'progress']);
const SETTINGS = new Set(['presets', 'prefs', 'tasks', 'stats', 'timers', 'schedule']);

// Clasifica una ruta ya validada. null = ruta que el servidor no conoce (denegada).
// kind: 'doc' (nº par de segmentos) o 'collection' (impar).
export function classify(segs) {
  const n = segs.length;
  const kind = n % 2 === 0 ? 'doc' : 'collection';
  const [root, a, b, c] = segs;
  if (root === 'members') {
    if (n === 1) return { root, kind, type: 'members' };
    if (!UID_RE.test(a)) return null;
    if (n === 2) return { root, kind, type: 'member', uid: a };
    if (!MEMBER_SUBS.has(b) || n > 4) return null;
    if (n === 4 && b === 'settings' && !SETTINGS.has(c)) return null;
    return { root, kind, type: n === 3 ? 'sub' : (b === 'settings' ? `settings:${c}` : b), uid: a, sub: b };
  }
  if (root === 'legions') return n <= 2 ? { root, kind, type: n === 1 ? 'legions' : 'legion' } : null;
  if (root === 'legionData') {
    if (n < 3 || n > 4 || (b !== 'calendar' && b !== 'wall')) return null;
    return { root, kind, type: b, key: a, sub: b };
  }
  if (root === 'feedback') {
    if (n === 1) return { root, kind, type: 'feedbacks' };
    return n === 2 && UID_RE.test(a) ? { root, kind, type: 'feedback', uid: a } : null;
  }
  return null;
}

// ---- Esquemas por tipo de documento ----
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => v === null || num(v);
const str = (v) => typeof v === 'string';
const isObj = isPlain;

const schemas = {
  member: {
    allowed: ['joinedAt', 'profile', 'rank'],
    reserved: ['legionId', 'legionEpoch'],
    fields: {
      joinedAt: num,
      profile: (v) => isObj(v) && subKeys(v, ['nick', 'server', 'bio', 'faction', 'mainCharId', 'searchable', 'shareEnergy'])
        && (v.faction === undefined || v.faction === 'elyos' || v.faction === 'asmodian')
        && (v.mainCharId === undefined || v.mainCharId === null || str(v.mainCharId))
        && (v.searchable === undefined || typeof v.searchable === 'boolean')
        && (v.shareEnergy === undefined || typeof v.shareEnergy === 'boolean'),
      rank: (v) => isObj(v) && subKeys(v, ['weekSpent', 'cpMax', 'achievements', 'updatedAt']),
    },
  },
  characters: {
    allowed: ['name', 'classId', 'energy', 'recordedAt', 'order', 'cp', 'cpGoal', 'notes'],
    required: ['name'],
    fields: { name: (v) => str(v) && v.trim().length > 0, classId: str, energy: numOrNull, recordedAt: numOrNull, order: numOrNull, cp: numOrNull, cpGoal: numOrNull, notes: str },
  },
  'settings:presets': { allowed: ['items'], fields: { items: itemsOf } },
  'settings:tasks': { allowed: ['items'], fields: { items: itemsOf } },
  'settings:timers': { allowed: ['items'], fields: { items: itemsOf } },
  'settings:prefs': {
    allowed: ['quietStart', 'quietEnd', 'favEvents', 'faction', 'lang', 'theme'],
    fields: {
      quietStart: str, quietEnd: str, lang: str,
      favEvents: (v) => Array.isArray(v) && v.length <= 100 && v.every(str),
      faction: (v) => v === 'elyos' || v === 'asmodian',
      theme: (v) => v === 'elyos' || v === 'asmodian',
    },
  },
  'settings:stats': {
    allowed: ['daysLog', 'spentTotal', 'spendCount', 'tasksDone', 'fullDays', 'bestStreak'],
    fields: {
      daysLog: (v) => isObj(v) && Object.keys(v).length <= 120 && Object.entries(v).every(([k, e]) => DAY_RE.test(k) && isObj(e) && subKeys(e, ['spent', 'tasks']) && num(e.spent) && num(e.tasks)),
      spentTotal: num, spendCount: num, tasksDone: num, fullDays: num, bestStreak: num,
    },
  },
  'settings:schedule': { allowed: ['anchorMs'], fields: { anchorMs: num } },
  events: {
    allowed: ['at', 'characterId', 'presetId', 'kind', 'amount'],
    fields: { at: num, characterId: str, presetId: (v) => v === null || str(v), kind: str, amount: numOrNull },
  },
  cp: {
    allowed: ['points'],
    fields: { points: (v) => Array.isArray(v) && v.length <= 2000 && v.every((p) => isObj(p) && subKeys(p, ['at', 'cp']) && num(p.at) && num(p.cp)) },
  },
  progress: {
    allowed: ['daily', 'weekly'],
    fields: { daily: period, weekly: period },
  },
  calendar: {
    allowed: ['uid', 'title', 'at', 'durationMin', 'rsvp'],
    required: ['title', 'at', 'durationMin'],
    fields: {
      uid: (v) => UID_RE.test(v),
      title: (v) => str(v) && v.trim().length > 0,
      at: num,
      durationMin: (v) => Number.isInteger(v) && v >= 5 && v <= 600,
      rsvp: (v) => isObj(v) && Object.keys(v).length <= 200 && Object.keys(v).every((k) => UID_RE.test(k) && ['yes', 'maybe', 'no'].includes(v[k])),
    },
  },
  wall: {
    allowed: ['uid', 'at', 'text'],
    required: ['at', 'text'],
    fields: { uid: (v) => UID_RE.test(v), at: num, text: (v) => str(v) && v.trim().length > 0 && v.length <= 280 },
  },
  feedback: {
    allowed: ['items'],
    fields: { items: (v) => Array.isArray(v) && v.length <= 200 && v.every((i) => isObj(i) && subKeys(i, ['at', 'text']) && num(i.at) && str(i.text)) },
  },
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
// {key, done:{taskId: veces}} (tasks.js withCount).
function period(v) {
  return isObj(v) && subKeys(v, ['key', 'done']) && num(v.key) && isObj(v.done) && Object.keys(v.done).length <= 50
    && Object.entries(v.done).every(([k, n]) => TASK_ID_RE.test(k) && num(n) && n >= 0 && n <= 1000);
}
function subKeys(o, allowed) { return Object.keys(o).every((k) => allowed.includes(k)); }
function itemsOf(v) { return Array.isArray(v) && v.length <= 200 && v.every(isObj); }

// Recorre el valor: rechaza claves prohibidas, exceso de profundidad/claves (400) y devuelve una copia limpia.
function walk(value) {
  let keys = 0;
  const go = (v, depth, key) => {
    if (typeof v === 'string') {
      let s = v.replace(BAD_CHARS, '');
      if (!MULTILINE_KEYS.has(key)) s = s.replace(/\n/g, '');
      const max = LIMITS[key] ?? DEFAULT_LIMIT;
      if (s.length > max) throw bad(`El texto de «${key || 'valor'}» supera los ${max} caracteres`);
      return s;
    }
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (depth > MAX_JSON_DEPTH) throw bad('El documento es demasiado profundo');
    if (Array.isArray(v)) return v.map((x) => go(x, depth + 1, key));
    if (isPlain(v)) {
      const out = {};
      for (const k of Object.keys(v)) {
        if (FORBIDDEN_KEYS.has(k)) throw bad('Clave no permitida');
        if (k.length === 0 || k.length > MAX_KEY_LEN || BAD_KEY.test(k)) throw bad('Clave no válida');
        if (++keys > MAX_KEYS) throw bad('El documento tiene demasiadas claves');
        out[k] = go(v[k], depth + 1, k);
      }
      return out;
    }
    throw bad('Valor no válido');
  };
  return go(value, 1, '');
}

// Limpieza de un texto suelto (mensajes del chat, notas de denuncia): mismas reglas que walk (SR-4, SR-43).
export function cleanText(v, max, multiline = false) {
  if (typeof v !== 'string') return null;
  let s = v.replace(BAD_CHARS, '');
  if (!multiline) s = s.replace(/\n/g, '');
  s = s.trim();
  if (!s.length || s.length > max) return null;
  return s;
}

// Devuelve { data } con el documento limpio, o { error, status }.
// partial: PATCH (sin campos obligatorios); allowReserved: validar un documento ya fusionado.
export function sanitize(segs, data, { partial = false, allowReserved = false } = {}) {
  const cls = classify(segs);
  if (!cls || cls.kind !== 'doc') return bad('Ruta no válida');
  if (!isPlain(data)) return bad('El cuerpo debe ser un objeto JSON');
  let clean;
  try { clean = walk(data); } catch (e) { if (e && e.status) return e; throw e; }
  const schema = schemas[cls.type];
  if (!schema) return bad('Ruta no válida');
  if (cls.type === 'member' && !allowReserved && schema.reserved.some((k) => k in clean)) return bad('Sin permiso', 403);
  if (schema.allowed) {
    const ok = new Set([...schema.allowed, ...(allowReserved && schema.reserved ? schema.reserved : [])]);
    for (const k of Object.keys(clean)) if (!ok.has(k)) return bad(`Campo desconocido: ${k}`);
    for (const k of Object.keys(clean)) {
      const f = schema.fields[k];
      if (f && !f(clean[k])) return bad(`Valor no válido en «${k}»`);
    }
    if (!partial) for (const k of schema.required || []) if (!(k in clean)) return bad(`Falta el campo «${k}»`);
  }
  if (Buffer.byteLength(JSON.stringify(clean)) > MAX_DOC_BYTES) return bad('El documento es demasiado grande', 413);
  return { data: clean };
}

export function validateDoc(path, data) {
  const r = sanitize(typeof path === 'string' ? path.split('/') : path, data);
  return r.error || null;
}
