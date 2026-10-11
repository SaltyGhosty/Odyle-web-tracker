// Ataque: saltar la CSP cargando una respuesta propia como script/HTML (<script src="/api/docs/...">) (SR-3).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, quickUser, as, legionWith, stablePublicDir, removeDir, AT } from './_lib.js';

const pub = stablePublicDir();
after(() => removeDir(pub));

function assertApiSafe(r, label) {
  assert.equal(r.headers['x-content-type-options'], 'nosniff', `${label}: nosniff`);
  assert.equal(r.headers['cross-origin-resource-policy'], 'same-origin', `${label}: CORP`);
  if (r.body.length) {
    assert.match(String(r.headers['content-type']), /^application\/json; charset=utf-8$/, `${label}: content-type ${r.headers['content-type']}`);
    assert.ok(!/^\s*\[/.test(r.body), `${label}: el cuerpo empieza por [ (sería JS válido)`);
  }
}

test('todas las respuestas de la API (éxito, error, rechazo) son JSON con nosniff y CORP; ninguna es un array', async () => {
  const s = await setup({ __buildApp: { publicDir: pub } });
  const L = await quickUser(s, 'l'); const M = await quickUser(s, 'm');
  const g = await legionWith(s, L, [M]);
  const m = as(s, M);
  // Contenido controlado por el atacante que parece JS o HTML.
  await m('PUT', `/api/docs/legionData/${g.key}/wall/w1`, { at: 1, text: '];alert(1);//<script>alert(1)</script>' });
  await m('PUT', `/api/docs/members/${M.id}/characters/c1`, { name: '*/alert(1)/*', notes: '<html><body onload=alert(1)>' });
  const reqs = {
    'GET doc': await m('GET', `/api/docs/legionData/${g.key}/wall/w1`),
    'GET colección': await m('GET', `/api/docs/legionData/${g.key}/wall`),
    'GET personajes': await m('GET', `/api/docs/members/${M.id}/characters`),
    'GET members': await m('GET', '/api/docs/members'),
    'GET legions': await m('GET', '/api/docs/legions'),
    'GET me': await m('GET', '/api/auth/me'),
    'GET code (no líder)': await m('GET', '/api/legions/mine/code'),
    'GET code (líder)': await as(s, L)('GET', '/api/legions/mine/code'),
    '401': await s.req('GET', `/api/docs/members/${M.id}`),
    '400 ruta': await m('GET', '/api/docs/members/%2e%2e'),
    '403': await m('GET', '/api/docs/feedback'),
    '404 API': await s.req('GET', '/api/no-existe'),
    '403 CSRF': await s.req('POST', '/api/auth/login', { csrf: false, payload: {} }),
    '415': await s.req('POST', '/api/auth/login', { payload: 'x', headers: { 'content-type': 'text/plain' } }),
    '400 JSON roto': await s.req('POST', '/api/auth/login', { payload: '{"email":', headers: { 'content-type': 'application/json' } }),
    'health': await s.req('GET', '/api/health'),
  };
  for (const [label, r] of Object.entries(reqs)) assertApiSafe(r, label);
  await s.app.close();
});

test('cabeceras Accept/extension no cambian el tipo: /api/docs/...js, ?callback=, Accept: text/html', async () => {
  const s = await setup({ __buildApp: { publicDir: pub } });
  const M = await quickUser(s, 'm');
  await as(s, M)('PUT', `/api/docs/members/${M.id}/characters/c1`, { name: 'x' });
  for (const [url, headers] of [
    [`/api/docs/members/${M.id}/characters/c1`, { accept: 'text/html' }],
    [`/api/docs/members/${M.id}/characters/c1`, { accept: 'application/javascript' }],
    [`/api/docs/members/${M.id}/characters/c1.js`, {}],
    [`/api/docs/members/${M.id}/characters/c1?callback=alert`, {}],
    [`/api/docs/members/${M.id}/characters?callback=alert`, {}],
  ]) {
    const r = await s.req('GET', url, { cookie: `${AT}=${M.at}`, headers });
    assertApiSafe(r, `${url} ${JSON.stringify(headers)}`);
    assert.ok(!/^\s*alert\(/.test(r.body), 'JSONP');
  }
  await s.app.close();
});

test('los estáticos se sirven con su tipo y nosniff; ninguna ruta estática devuelve datos de usuario', async () => {
  const s = await setup({ __buildApp: { publicDir: pub } });
  for (const [url, type] of [['/app.js', /javascript/], ['/claude-shim.js', /javascript/], ['/app.css', /text\/css/], ['/', /text\/html/], ['/login', /text\/html/]]) {
    const r = await s.req('GET', url);
    assert.equal(r.statusCode, 200, url);
    assert.match(String(r.headers['content-type']), type, url);
    assert.equal(r.headers['x-content-type-options'], 'nosniff', url);
  }
  await s.app.close();
});
