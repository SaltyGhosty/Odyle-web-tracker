// Amigos, chat y búsqueda sobre /api (solo web). Script clásico (SR-2): expone window.odyleSocialApi.
// Las peticiones pasan por window.claude.__fetch (CSRF, renovación de sesión y /login). El canal en vivo es
// EventSource('/api/stream'): si se corta (p. ej. el servidor lo cierra al caducar el token), espera 1, 2, 4…
// hasta 30 s, renueva la sesión con /api/auth/me y lo vuelve a abrir.
(function () {
  'use strict';

  const STREAM_TYPES = ['message', 'read', 'friend', 'presence'];
  const backoff = (n) => Math.min(30000, 1000 * 2 ** n);
  const enc = encodeURIComponent;

  async function call(method, url, body) {
    let res;
    try { res = await window.claude.__fetch(method, url, body); } catch (_) {
      const e = new Error('No se pudo conectar. Inténtalo de nuevo.'); e.status = 0; throw e;
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* sin cuerpo */ }
    if (!res.ok) {
      const e = new Error((data && typeof data.error === 'string' && data.error) || 'No se pudo completar la acción.');
      e.status = res.status;
      throw e;
    }
    return data || {};
  }

  function connect({ onEvent, onStatus }) {
    let es = null, timer = null, attempt = 0, closed = false, down = false;
    const status = (s, info) => { try { if (onStatus) onStatus(s, info); } catch (_) { /* la vista no tumba el canal */ } };
    function open() {
      const me = new EventSource('/api/stream');
      es = me;
      me.addEventListener('open', () => {
        if (me !== es) return;
        const resumed = down;
        down = false; attempt = 0;
        status('live', { resumed });
      });
      for (const type of STREAM_TYPES) {
        me.addEventListener(type, (e) => {
          if (me !== es) return;
          let data;
          try { data = JSON.parse(e.data); } catch (_) { return; }
          try { onEvent(type, data); } catch (_) { /* idem */ }
        });
      }
      me.addEventListener('error', () => {
        if (closed || me !== es) return;
        me.close(); es = null;
        if (!down) { down = true; status('reconnecting'); }
        const wait = backoff(attempt++);
        timer = setTimeout(async () => {
          timer = null;
          if (closed) return;
          // Si el token caducó, esta petición lo renueva (o manda a /login) antes de reabrir.
          try { await window.claude.__fetch('GET', '/api/auth/me'); } catch (_) { /* sin red: se reintenta */ }
          if (!closed) open();
        }, wait);
      });
    }
    open();
    return () => { closed = true; clearTimeout(timer); if (es) es.close(); es = null; };
  }

  window.odyleSocialApi = {
    search: async (q) => (await call('GET', '/api/profiles/search?q=' + enc(q))).results || [],
    profile: (uid) => call('GET', '/api/profiles/' + enc(uid)),
    friends: () => call('GET', '/api/friends'),
    addFriend: (uid) => call('POST', '/api/friends/' + enc(uid), {}),
    accept: (uid) => call('POST', '/api/friends/' + enc(uid) + '/accept', {}),
    removeFriend: (uid) => call('DELETE', '/api/friends/' + enc(uid)),
    blocks: async () => (await call('GET', '/api/blocks')).blocked || [],
    block: (uid) => call('POST', '/api/blocks/' + enc(uid), {}),
    unblock: (uid) => call('DELETE', '/api/blocks/' + enc(uid)),
    messages: async (uid, before) => (await call('GET', '/api/messages/' + enc(uid) + (before ? '?before=' + enc(String(before)) : ''))).messages || [],
    send: async (uid, payload) => (await call('POST', '/api/messages/' + enc(uid), payload)).message,
    markRead: (uid) => call('POST', '/api/messages/' + enc(uid) + '/read', {}),
    conversations: async () => (await call('GET', '/api/conversations')).conversations || [],
    report: (r) => call('POST', '/api/reports', r),
    connect,
  };
})();
