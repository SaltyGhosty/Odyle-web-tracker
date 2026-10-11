// Adaptador: ofrece a la página `window.claude.use('db' | 'user' | 'room' | 'sample' | 'downloads')`
// sobre la API del servidor. Script clásico, sin sumideros de HTML ni de código (SR-2). Todas las peticiones llevan
// credenciales de mismo origen; las escrituras, la cabecera CSRF (SR-12).
(function () {
  'use strict';

  const POLL_MS = 30_000;
  // Sin cuerpo no hay Content-Type: Fastify rechaza un JSON vacío.
  const headersFor = (method, body) => (method === 'GET' ? undefined
    : body === undefined ? { 'X-Odyle-CSRF': '1' } : { 'Content-Type': 'application/json', 'X-Odyle-CSRF': '1' });

  // ---- sesión: una sola renovación a la vez (SR-10) ----
  const safeNext = () => '/' + (/^#[a-z0-9-]{0,32}$/.test(location.hash) ? location.hash : '');
  let redirecting = false;
  const goLogin = () => {
    if (!redirecting) { redirecting = true; location.assign('/login?next=' + encodeURIComponent(safeNext())); }
    return new Promise(() => {}); // la página se va: nada más debe ejecutarse
  };

  const rawFetch = (method, url, body) => fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: headersFor(method, body),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const doRefresh = async () => {
    // Otra pestaña pudo renovar ya mientras esperábamos el candado: la cookie es compartida.
    try { if ((await rawFetch('GET', '/api/auth/me')).ok) return true; } catch { /* seguimos con la renovación */ }
    try { return (await rawFetch('POST', '/api/auth/refresh', {})).ok; } catch { return false; }
  };
  let refreshing = null;
  const refreshOnce = () => {
    if (!refreshing) {
      const run = (navigator.locks && navigator.locks.request)
        ? navigator.locks.request('odyle-refresh', doRefresh)
        : doRefresh();
      refreshing = Promise.resolve(run).finally(() => { refreshing = null; });
    }
    return refreshing;
  };

  // Devuelve la Response; ante 401 intenta una renovación y repite una vez; si falla, va a /login.
  async function send(method, url, body) {
    let res;
    try { res = await rawFetch(method, url, body); } catch { throw { code: 'unavailable' }; }
    if (res.status === 401) {
      if (!(await refreshOnce())) return goLogin();
      try { res = await rawFetch(method, url, body); } catch { throw { code: 'unavailable' }; }
      if (res.status === 401) return goLogin();
    }
    return res;
  }

  const fail = (res, notFoundCode) => {
    if (res.status === 403) return { code: 'invalid_argument' };
    if (res.status === 404 && notFoundCode) return { code: notFoundCode };
    return { code: 'unavailable' };
  };
  const json = async (res) => { try { return await res.json(); } catch { throw { code: 'unavailable' }; } };

  // ---- identidad ----
  let mePromise = null;
  const me = () => {
    if (!mePromise) {
      mePromise = send('GET', '/api/auth/me').then(async (res) => {
        if (!res.ok) throw fail(res);
        return json(res);
      });
      mePromise.catch(() => { mePromise = null; });
    }
    return mePromise;
  };

  // ---- oyentes ----
  const listeners = new Set();
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const docSnap = (id, d) => ({ id, exists: !!d, data: () => (d ? clone(d) : undefined) });

  // Una lectura por oyente a la vez; las peticiones que llegan antes de que empiece la siguiente se juntan en una.
  async function fetchAndDeliver(l) {
    if (l.dead) return;
    let raw;
    try { raw = await l.fetch(); }
    catch (e) {
      if (!l.dead && (!l.started || (e && e.code === 'invalid_argument'))) { l.started = true; if (l.err) l.err(e); }
      return;
    }
    if (l.dead) return;
    const key = JSON.stringify(raw);
    if (l.started && key === l.last) return;
    l.started = true; l.last = key;
    l.next(l.build(raw));
  }
  function runListener(l) {
    if (l.queued) return l.queued;
    const run = l.chain.then(() => { l.queued = null; return fetchAndDeliver(l); });
    l.queued = run;
    l.chain = run.catch(() => {});
    return run;
  }
  // Devuelve una promesa que se cumple cuando todos los oyentes han recibido los datos nuevos.
  const refreshAll = () => Promise.all([...listeners].map((l) => runListener(l).catch(() => {}))).then(() => undefined);
  let debounce = null;
  const refreshSoon = () => { clearTimeout(debounce); debounce = setTimeout(() => { refreshAll(); }, 120); };

  setInterval(() => { if (document.visibilityState === 'visible') refreshAll(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });

  function subscribe(fetchRaw, build, next, err) {
    const l = { fetch: fetchRaw, build, next, err, last: null, started: false, dead: false, queued: null, chain: Promise.resolve() };
    listeners.add(l);
    setTimeout(() => runListener(l), 0);
    return () => { l.dead = true; listeners.delete(l); };
  }

  // ---- db ----
  let myUid = null;
  const realPath = (p) => (p === 'settings/schedule' ? `members/${myUid}/settings/schedule` : p);
  const urlOf = (p) => '/api/docs/' + realPath(p).split('/').map(encodeURIComponent).join('/');
  const randomId = () => {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const b = new Uint8Array(20);
    crypto.getRandomValues(b);
    let s = '';
    for (const x of b) s += A[x % A.length];
    return s;
  };

  async function readDoc(p) {
    const res = await send('GET', urlOf(p));
    if (res.status === 404) return { exists: false };
    if (!res.ok) throw fail(res);
    const j = await json(res);
    return { exists: !!j.exists, data: j.data };
  }
  async function write(method, p, body) {
    const res = await send(method, urlOf(p), body);
    if (!res.ok) throw fail(res, method === 'PATCH' ? 'not_found' : null);
    refreshSoon();
  }

  function docRef(path) {
    const id = path.split('/').pop();
    return {
      id, path,
      async get() { const r = await readDoc(path); return docSnap(id, r.exists ? r.data : null); },
      set: (data) => write('PUT', path, data),
      update: (data) => write('PATCH', path, data),
      delete: () => write('DELETE', path),
      onSnapshot: (next, err) => subscribe(() => readDoc(path), (r) => docSnap(id, r.exists ? r.data : null), next, err),
      collection: (sub) => collectionRef(path + '/' + sub),
    };
  }

  function collectionRef(path, q = {}) {
    const query = () => {
      const parts = [];
      for (const w of q.where || []) parts.push('where=' + encodeURIComponent(`${w.field},${w.op},${w.value}`));
      if (q.orderBy) parts.push('orderBy=' + encodeURIComponent(`${q.orderBy.field},${q.orderBy.dir}`));
      if (q.limit) parts.push('limit=' + q.limit);
      return parts.length ? '?' + parts.join('&') : '';
    };
    const readAll = async () => {
      // La colección antigua `characters` (migración del propietario en claude.ai) no existe en la web.
      if (path === 'characters') return { docs: [] };
      const res = await send('GET', urlOf(path) + query());
      if (!res.ok) throw fail(res);
      return json(res);
    };
    const build = (j) => ({ docs: (j.docs || []).map((d) => docSnap(d.id, d.data || {})) });
    const chain = (extra) => collectionRef(path, { ...q, ...extra });
    return {
      path,
      doc: (id) => docRef(path + '/' + (id || randomId())),
      where: (field, op, value) => chain({ where: [...(q.where || []), { field, op, value }] }),
      orderBy: (field, dir = 'asc') => chain({ orderBy: { field, dir } }),
      limit: (n) => chain({ limit: n }),
      async get() { return build(await readAll()); },
      onSnapshot: (next, err) => subscribe(readAll, build, next, err),
    };
  }

  const dbApi = {
    doc: (p) => docRef(p),
    collection: (p) => collectionRef(p),
  };

  // ---- usuario ----
  const userApi = {
    id: async () => (await me()).id,
    me,
    isOwner: async () => !!(await me()).isAdmin,
    canEdit: async () => false,
    can: async (perm) => perm === 'data.write' && !!(await me()).id,
    profiles: async (ids) => {
      const out = {};
      for (const id of ids || []) out[id] = { id, name: '' };
      return out;
    },
  };

  // ---- descargas ----
  const downloadsApi = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([String(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = String(filename || 'descarga');
      a.hidden = true;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  };

  const endSession = async (path) => {
    try { await rawFetch('POST', path, {}); } catch { /* da igual: se vuelve a /login */ }
    location.assign('/login');
    return new Promise(() => {});
  };

  window.claude = {
    async use(name) {
      if (name === 'db') { myUid = (await me()).id; return dbApi; }
      if (name === 'user') { await me(); return userApi; }
      if (name === 'downloads') return downloadsApi;
      return null; // 'room' y 'sample' no existen en la web
    },
    __refreshAll: refreshAll,
  };
  window.odyleWeb = {
    logout: () => endSession('/api/auth/logout'),
    logoutAll: () => endSession('/api/auth/logout-all'),
  };
})();
