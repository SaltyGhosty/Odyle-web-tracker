// Pantallas de cuenta: /login, /registro, /verificar, /restablecer. Solo APIs del DOM y textContent (SR-2);
// ningún script ni estilo en línea. El token de correo viaja en el fragmento y se borra de la URL (SR-19).
(function () {
  'use strict';

  const panel = document.getElementById('panel');
  const subtitle = document.getElementById('subtitle');
  const params = new URLSearchParams(location.search);
  // Idioma (web/auth-i18n.js); sin él, todo queda en español.
  const I18N = window.odyleAuthI18n;
  const t = I18N ? I18N.t : (s) => s;

  // Misma regla que el servidor: solo '/' o '/#etiqueta' (SR-14).
  const safeNext = (n) => (typeof n === 'string' && (n === '/' || /^\/#[a-z0-9-]{0,32}$/.test(n)) ? n : '/');
  const nextParam = safeNext(params.get('next'));
  const withNext = (path) => (nextParam === '/' ? path : path + '?next=' + encodeURIComponent(nextParam));

  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids) if (k) e.append(k);
    return e;
  };

  async function post(path, body) {
    let res;
    try {
      res = await fetch(path, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Odyle-CSRF': '1' },
        body: JSON.stringify(body),
      });
    } catch { return { ok: false, status: 0, data: { error: t('No se pudo conectar. Inténtalo de nuevo.') } }; }
    let data = {};
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    return { ok: res.ok, status: res.status, data };
  }

  const field = (id, label, type, extra) => h('div', { class: 'field' },
    h('label', { for: id, text: label }),
    h('input', { id, name: id, type, required: true, maxlength: '254', ...extra }));

  // Formulario genérico: el envío no recarga la página; el mensaje del servidor se muestra como texto.
  function form({ fields, submit, onSubmit }) {
    const msg = h('p', { class: 'error', role: 'alert', hidden: true });
    const btn = h('button', { type: 'submit', class: 'primary', text: submit });
    const f = h('form', { novalidate: true }, ...fields, msg, btn);
    const show = (text, kind) => { msg.textContent = text || ''; msg.className = kind || 'error'; msg.hidden = !text; };
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      show('');
      btn.disabled = true;
      try { await onSubmit(show); } finally { btn.disabled = false; }
    });
    return f;
  }
  const val = (id) => document.getElementById(id).value;
  const passwordFields = (idPrefix, label) => [
    field(idPrefix, label, 'password', { autocomplete: 'new-password', maxlength: '128', minlength: '10' }),
    field(idPrefix + '2', t('Repite la contraseña'), 'password', { autocomplete: 'new-password', maxlength: '128' }),
  ];

  function render(title, ...nodes) {
    subtitle.textContent = title;
    panel.replaceChildren(...nodes.filter(Boolean));
  }

  // ---- vistas ----
  function loginView() {
    currentView = loginView;
    const f = form({
      fields: [
        field('email', t('Correo electrónico'), 'email', { autocomplete: 'username' }),
        field('password', t('Contraseña'), 'password', { autocomplete: 'current-password', maxlength: '128' }),
      ],
      submit: t('Entrar'),
      async onSubmit(show) {
        const r = await post('/api/auth/login', { email: val('email'), password: val('password') });
        if (!r.ok) return show(t(r.data.error) || t('No se pudo entrar'));
        location.assign(nextParam);
      },
    });
    const forgot = h('button', { type: 'button', class: 'link', text: t('¿Olvidaste tu contraseña?') });
    forgot.addEventListener('click', forgotView);
    render(t('Entrar'), f, h('div', { class: 'links' }, h('a', { href: withNext('/registro'), text: t('Crear una cuenta') }), forgot));
  }

  function forgotView() {
    currentView = forgotView;
    const f = form({
      fields: [h('p', { class: 'hint', text: t('Escribe tu correo y, si existe una cuenta, te enviaremos un enlace para elegir una contraseña nueva.') }),
        field('email', t('Correo electrónico'), 'email', { autocomplete: 'username' })],
      submit: t('Enviar enlace'),
      async onSubmit(show) {
        const r = await post('/api/auth/forgot', { email: val('email') });
        if (r.ok) return show(t(r.data.message) || t('Si existe una cuenta con ese correo, recibirás un enlace.'), 'ok');
        show(t(r.data.error) || t('No se pudo enviar el enlace')); // p. ej. 503: la recuperación aún no está disponible
      },
    });
    render(t('Recuperar contraseña'), f, h('div', { class: 'links' }, h('a', { href: withNext('/login'), text: t('Volver a entrar') })));
  }

  function registerView() {
    currentView = registerView;
    const f = form({
      fields: [field('email', t('Correo electrónico'), 'email', { autocomplete: 'username' }), ...passwordFields('password', t('Contraseña (10 a 128 caracteres)'))],
      submit: t('Crear cuenta'),
      async onSubmit(show) {
        if (val('password') !== val('password2')) return show(t('Las contraseñas no coinciden'));
        const r = await post('/api/auth/register', { email: val('email'), password: val('password') });
        if (!r.ok) return show(t(r.data.error) || t('No se pudo crear la cuenta'));
        show(t(r.data.message) || t('Cuenta creada.'), 'ok');
        f.querySelector('button').hidden = true;
        f.append(h('a', { href: withNext('/login'), text: t('Ir a entrar') }));
      },
    });
    render(t('Crear cuenta'), f, h('div', { class: 'links' }, h('a', { href: withNext('/login'), text: t('Ya tengo cuenta') })));
  }

  // Lee el token del fragmento (#t=…) y lo quita de la URL y del historial.
  // Se lee una sola vez: redibujar la vista (p. ej. al cambiar de idioma) reutiliza el token ya leído.
  let tokenRead = false, tokenValue = null;
  function takeToken() {
    if (tokenRead) return tokenValue;
    tokenRead = true;
    const m = /^#t=([A-Za-z0-9_-]{20,200})$/.exec(location.hash);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    tokenValue = m ? m[1] : null;
    return tokenValue;
  }

  // Verificar exige la contraseña elegida al registrarse: el enlace queda ligado a ella (anti pre-secuestro, SR-20).
  function verifyView() {
    currentView = verifyView;
    const token = takeToken();
    const done = (text, kind) => render(t('Verificar correo'), h('p', { class: kind, text }), h('div', { class: 'links' }, h('a', { href: '/login', text: t('Entrar') })));
    if (!token) return done(t('El enlace o la contraseña no son válidos'), 'error');
    const f = form({
      fields: [
        h('p', { class: 'hint', text: t('Escribe la contraseña que elegiste al registrarte') }),
        field('password', t('Contraseña'), 'password', { autocomplete: 'current-password', maxlength: '128' }),
      ],
      submit: t('Verificar correo'),
      async onSubmit(show) {
        const r = await post('/api/auth/verify', { token, password: val('password') });
        if (r.ok) return done(t(r.data.message) || t('Correo verificado'), 'ok');
        show(t(r.data.error) || t('El enlace o la contraseña no son válidos'));
      },
    });
    render(t('Verificar correo'), f);
  }

  function resetView() {
    currentView = resetView;
    const token = takeToken();
    if (!token) {
      return render(t('Restablecer contraseña'), h('p', { class: 'error', text: t('El enlace no es válido o ha caducado') }),
        h('div', { class: 'links' }, h('a', { href: '/login', text: t('Volver a entrar') })));
    }
    const f = form({
      fields: passwordFields('password', t('Contraseña nueva (10 a 128 caracteres)')),
      submit: t('Guardar contraseña'),
      async onSubmit(show) {
        if (val('password') !== val('password2')) return show(t('Las contraseñas no coinciden'));
        const r = await post('/api/auth/reset', { token, password: val('password') });
        if (!r.ok) return show(t(r.data.error) || t('No se pudo cambiar la contraseña'));
        show(t(r.data.message) || t('Contraseña cambiada.'), 'ok');
        f.querySelector('button').hidden = true;
        f.append(h('a', { href: '/login', text: t('Ir a entrar') }));
      },
    });
    render(t('Restablecer contraseña'), f);
  }

  const VIEWS = { '/login': loginView, '/registro': registerView, '/verificar': verifyView, '/restablecer': resetView };
  let currentView = VIEWS[location.pathname] || loginView;

  if (I18N) {
    const top = document.querySelector('.auth-top');
    if (top) top.append(I18N.menu());
    // Al cambiar de idioma se redibuja la vista actual conservando lo escrito.
    I18N.onChange(() => {
      const values = {};
      for (const el of panel.querySelectorAll('input[id]')) values[el.id] = el.value;
      currentView();
      for (const [id, v] of Object.entries(values)) { const el = document.getElementById(id); if (el) el.value = v; }
    });
  }
  currentView();
})();
