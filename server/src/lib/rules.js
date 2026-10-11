// Reglas de acceso del almacén (spec §7). La pertenencia a una legión se lee de la base en cada petición (SR-30).
import { legionOf, sameLegion, legionKey } from '../../../legion.js';
import { classify } from './validate.js';

const RSVP = new Set(['yes', 'maybe', 'no']);
const segsOf = (path) => (Array.isArray(path) ? path : String(path).split('/'));

// SR-21: administrador = el id configurado en ADMIN_USER_ID Y (correo verificado O modo owner-only). En owner-only no
// se envía ningún correo de verificación, así que exigirlo dejaría al administrador inalcanzable; ese id lo fija el
// operador tras registrarse, no puede reclamarlo un atacante. En modo full sigue exigiendo verificación.
export function isAdminUser(config, user) {
  return !!(config && config.adminUserId && user && user.id === config.adminUserId
    && (user.verified || config.emailMode === 'owner-only'));
}

// Legión vigente del usuario y sus compañeros, con lecturas frescas; se guarda en ctx durante la petición.
export async function membership(ctx) {
  if (ctx._membership) return ctx._membership;
  const { db, uid } = ctx;
  const mine = (await db.query('select data from docs where path = $1', [`members/${uid}`])).rows[0];
  const meDoc = mine ? mine.data : null;
  const legions = new Map();
  const lid = meDoc && typeof meDoc.legionId === 'string' ? meDoc.legionId : null;
  if (lid) {
    const l = (await db.query('select data from docs where path = $1', [`legions/${lid}`])).rows[0];
    if (l) legions.set(lid, l.data);
  }
  const legion = meDoc ? legionOf(meDoc, legions, uid) : null;
  let mates = [];
  if (legion) {
    const memberData = new Map([[uid, meDoc]]);
    const rows = (await db.query("select path, data from docs where parent = 'members' and data->>'legionId' = $1", [legion.id])).rows;
    for (const r of rows) memberData.set(r.path.slice('members/'.length), r.data);
    mates = sameLegion(memberData, uid, legions);
  }
  ctx._membership = { legion, key: legionKey(legion), mates: new Set(mates) };
  return ctx._membership;
}

export async function canRead(ctx, path) {
  const segs = segsOf(path);
  const c = classify(segs);
  if (!c) return false;
  switch (c.root) {
    case 'members':
      if (c.type === 'members') return true; // el listado se filtra en la consulta
      if (c.uid === ctx.uid) return true;
      return (await membership(ctx)).mates.has(c.uid);
    case 'legions': return true;
    case 'legionData': {
      const m = await membership(ctx);
      return !!m.key && c.key === m.key;
    }
    case 'feedback':
      if (c.type === 'feedbacks') return !!ctx.isAdmin;
      return c.uid === ctx.uid || !!ctx.isAdmin;
    default: return false;
  }
}

// existing: datos actuales del documento o null; op: { method, body } para el caso RSVP.
export async function canWrite(ctx, path, existing = null, op = {}) {
  const segs = segsOf(path);
  const c = classify(segs);
  if (!c || c.kind !== 'doc') return false;
  switch (c.root) {
    case 'members':
      if (c.uid !== ctx.uid) return false;
      return !(c.type === 'member' && op.method === 'DELETE'); // borrar la ficha rompería la pertenencia a la legión
    case 'feedback': return c.uid === ctx.uid;
    case 'legionData': {
      const m = await membership(ctx);
      if (!m.key || c.key !== m.key) return false;
      if (!existing || existing.uid === ctx.uid) return true;
      return c.sub === 'calendar' && op.method === 'PATCH' && isOwnRsvp(op.body, ctx.uid);
    }
    default: return false;
  }
}

// Cuerpo exactamente { rsvp: { <mi uid>: 'yes'|'maybe'|'no' } }.
export function isOwnRsvp(body, uid) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const k = Object.keys(body);
  if (k.length !== 1 || k[0] !== 'rsvp') return false;
  const r = body.rsvp;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const rk = Object.keys(r);
  return rk.length === 1 && rk[0] === uid && RSVP.has(r[uid]);
}
