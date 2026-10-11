// Acciones de legión sobre /api/legions. Script clásico (SR-2). Los errores llevan el mensaje en español del servidor.
(function () {
  'use strict';

  async function call(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method, credentials: 'same-origin', cache: 'no-store',
        headers: method === 'GET' ? undefined
          : body === undefined ? { 'X-Odyle-CSRF': '1' } : { 'Content-Type': 'application/json', 'X-Odyle-CSRF': '1' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new Error('No se pudo conectar. Inténtalo de nuevo.'); }
    let data = null;
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) throw new Error((data && typeof data.error === 'string' && data.error) || 'No se pudo completar la acción.');
    if (window.claude && window.claude.__refreshAll) window.claude.__refreshAll();
    return data || {};
  }

  window.odyleLegionApi = {
    create: async (name) => ({ code: (await call('POST', '/api/legions', { name })).code }),
    join: async (code) => call('POST', '/api/legions/join', { code }),
    getCode: async () => (await call('GET', '/api/legions/mine/code')).code,
    newCode: async () => (await call('POST', '/api/legions/mine/code', {})).code,
    rename: (name) => call('PATCH', '/api/legions/mine', { name }),
    kick: (uid) => call('POST', '/api/legions/mine/kick', { uid }),
    leave: () => call('POST', '/api/legions/leave', {}),
    dissolve: () => call('DELETE', '/api/legions/mine'),
  };
})();
