// Fusión segura para PATCH (SR-25): los objetos se fusionan recursivamente; listas y valores se
// sustituyen; null es un valor. Las claves prohibidas lanzan; nunca se mutan las entradas.
export const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const isPlain = (v) => v !== null && typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]'
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function fail(key) {
  return Object.assign(new Error(`Clave no permitida: ${key}`), { code: 'FORBIDDEN_KEY' });
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (isPlain(v)) {
    const out = Object.create(null);
    for (const k of Object.keys(v)) {
      if (FORBIDDEN_KEYS.has(k)) throw fail(k);
      out[k] = clone(v[k]);
    }
    return out;
  }
  return v;
}

export function safeMerge(target, patch) {
  if (!isPlain(target) || !isPlain(patch)) throw new TypeError('safeMerge necesita objetos');
  const out = clone(target);
  for (const k of Object.keys(patch)) {
    if (FORBIDDEN_KEYS.has(k)) throw fail(k);
    const pv = patch[k];
    out[k] = isPlain(pv) && isPlain(out[k]) ? safeMerge(out[k], pv) : clone(pv);
  }
  return out;
}
