// Preparación común de las pruebas sociales: usuarios A, B, C… con sesión y utilidades de relación.
import { makeTestApp } from './helpers.js';
import { newUserId } from '../src/lib/tokens.js';
import { signAccess } from '../src/lib/jwt.js';
import { pairOf } from '../src/lib/social-rules.js';

export const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const AT = '__Host-odyle_at';
const H = { origin: 'https://odyle.test', 'x-odyle-csrf': '1' };

export async function socialSetup(n = 3, extra = {}) {
  const t = await makeTestApp({ __buildApp: { now: () => NOW, ...extra } });
  const ids = {}; const tokens = {};
  for (const k of 'ABCDEFGH'.slice(0, n)) {
    ids[k] = newUserId();
    await t.db.query('insert into users (id, email, password_hash, email_verified_at) values ($1, $2, $3, $4)', [ids[k], `${k.toLowerCase()}@example.com`, 'x', new Date(NOW)]);
    tokens[k] = await signAccess(t.config, { sub: ids[k], ver: 0 }, NOW);
  }
  const call = (method, url, who, payload) => t.app.inject({
    method, url, payload, headers: { ...(method === 'GET' ? {} : H), cookie: `${AT}=${tokens[who]}` },
  });
  const doc = (path, data) => t.db.query('insert into docs (path, parent, data, updated_at) values ($1, $2, $3::jsonb, $4)', [path, path.slice(0, path.lastIndexOf('/')), JSON.stringify(data), NOW]);
  const befriend = async (x, y) => {
    const [a, b] = pairOf(ids[x], ids[y]);
    await t.db.query('insert into friendships (user_a, user_b, status, requested_by, created_at, accepted_at) values ($1, $2, $3, $4, $5, $5)', [a, b, 'accepted', ids[x], NOW]);
  };
  const block = (x, y) => t.db.query('insert into blocks (blocker, blocked, created_at) values ($1, $2, $3)', [ids[x], ids[y], NOW]);
  return { ...t, ids, tokens, call, doc, befriend, block, NOW };
}
