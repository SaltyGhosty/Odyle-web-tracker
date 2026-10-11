// Acciones de legión sobre /api/legions. Script clásico (SR-2). Los errores llevan el mensaje en español del servidor.
(function () {
  'use strict';

  async function call(method, url, body) {
    let res;
    try { res = await window.claude.__fetch(method, url, body); } catch { throw new Error('No se pudo conectar. Inténtalo de nuevo.'); }
    let data = null;
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) throw new Error((data && typeof data.error === 'string' && data.error) || 'No se pudo completar la acción.');
    // La página repinta con datos nuevos antes de que la acción termine (el código recién creado no se pierde).
    if (window.claude && window.claude.__refreshAll) await window.claude.__refreshAll();
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
