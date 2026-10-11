// Pantallas de cuenta: /login, /registro, /verificar, /restablecer. Solo APIs del DOM y textContent (SR-2);
// ningún script ni estilo en línea. El token de correo viaja en el fragmento y se borra de la URL (SR-19).
(function () {
  'use strict';

  const panel = document.getElementById('panel');
  const subtitle = document.getElementById('subtitle');
  const params = new URLSearchParams(location.search);

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
    } catch { return { ok: false, status: 0, data: { error: 'No se pudo conectar. Inténtalo de nuevo.' } }; }
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
    field(idPrefix + '2', 'Repite la contraseña', 'password', { autocomplete: 'new-password', maxlength: '128' }),
  ];

  function render(title, ...nodes) {
    subtitle.textContent = title;
    panel.replaceChildren(...nodes.filter(Boolean));
  }

  // ---- vistas ----
  function loginView() {
    const f = form({
      fields: [
        field('email', 'Correo electrónico', 'email', { autocomplete: 'username' }),
        field('password', 'Contraseña', 'password', { autocomplete: 'current-password', maxlength: '128' }),
      ],
      submit: 'Entrar',
      async onSubmit(show) {
        const r = await post('/api/auth/login', { email: val('email'), password: val('password') });
        if (!r.ok) return show(r.data.error || 'No se pudo entrar');
        location.assign(nextParam);
      },
    });
    const forgot = h('button', { type: 'button', class: 'link', text: '¿Olvidaste tu contraseña?' });
    forgot.addEventListener('click', forgotView);
    render('Entrar', f, h('div', { class: 'links' }, h('a', { href: withNext('/registro'), text: 'Crear una cuenta' }), forgot));
  }

  function forgotView() {
    const f = form({
      fields: [h('p', { class: 'hint', text: 'Escribe tu correo y, si existe una cuenta, te enviaremos un enlace para elegir una contraseña nueva.' }),
        field('email', 'Correo electrónico', 'email', { autocomplete: 'username' })],
      submit: 'Enviar enlace',
      async onSubmit(show) {
        const r = await post('/api/auth/forgot', { email: val('email') });
        if (r.ok) return show(r.data.message || 'Si existe una cuenta con ese correo, recibirás un enlace.', 'ok');
        show(r.data.error || 'No se pudo enviar el enlace'); // p. ej. 503: la recuperación aún no está disponible
      },
    });
    render('Recuperar contraseña', f, h('div', { class: 'links' }, h('a', { href: withNext('/login'), text: 'Volver a entrar' })));
  }

  function registerView() {
    const f = form({
      fields: [field('email', 'Correo electrónico', 'email', { autocomplete: 'username' }), ...passwordFields('password', 'Contraseña (10 a 128 caracteres)')],
      submit: 'Crear cuenta',
      async onSubmit(show) {
        if (val('password') !== val('password2')) return show('Las contraseñas no coinciden');
        const r = await post('/api/auth/register', { email: val('email'), password: val('password') });
        if (!r.ok) return show(r.data.error || 'No se pudo crear la cuenta');
        show(r.data.message || 'Cuenta creada.', 'ok');
        f.querySelector('button').hidden = true;
        f.append(h('a', { href: withNext('/login'), text: 'Ir a entrar' }));
      },
    });
    render('Crear cuenta', f, h('div', { class: 'links' }, h('a', { href: withNext('/login'), text: 'Ya tengo cuenta' })));
  }

  // Lee el token del fragmento (#t=…) y lo quita de la URL y del historial.
  function takeToken() {
    const m = /^#t=([A-Za-z0-9_-]{20,200})$/.exec(location.hash);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    return m ? m[1] : null;
  }

  // Verificar exige la contraseña elegida al registrarse: el enlace queda ligado a ella (anti pre-secuestro, SR-20).
  function verifyView() {
    const token = takeToken();
    const done = (text, kind) => render('Verificar correo', h('p', { class: kind, text }), h('div', { class: 'links' }, h('a', { href: '/login', text: 'Entrar' })));
    if (!token) return done('El enlace no es válido o ha caducado', 'error');
    const f = form({
      fields: [
        h('p', { class: 'hint', text: 'Escribe la contraseña que elegiste al registrarte' }),
        field('password', 'Contraseña', 'password', { autocomplete: 'current-password', maxlength: '128' }),
      ],
      submit: 'Verificar correo',
      async onSubmit(show) {
        const r = await post('/api/auth/verify', { token, password: val('password') });
        if (r.ok) return done(r.data.message || 'Correo verificado', 'ok');
        show(r.data.error || 'El enlace no es válido o ha caducado');
      },
    });
    render('Verificar correo', f);
  }

  function resetView() {
    const token = takeToken();
    if (!token) {
      return render('Restablecer contraseña', h('p', { class: 'error', text: 'El enlace no es válido o ha caducado' }),
        h('div', { class: 'links' }, h('a', { href: '/login', text: 'Volver a entrar' })));
    }
    const f = form({
      fields: passwordFields('password', 'Contraseña nueva (10 a 128 caracteres)'),
      submit: 'Guardar contraseña',
      async onSubmit(show) {
        if (val('password') !== val('password2')) return show('Las contraseñas no coinciden');
        const r = await post('/api/auth/reset', { token, password: val('password') });
        if (!r.ok) return show(r.data.error || 'No se pudo cambiar la contraseña');
        show(r.data.message || 'Contraseña cambiada.', 'ok');
        f.querySelector('button').hidden = true;
        f.append(h('a', { href: '/login', text: 'Ir a entrar' }));
      },
    });
    render('Restablecer contraseña', f);
  }

  const VIEWS = { '/login': loginView, '/registro': registerView, '/verificar': verifyView, '/restablecer': resetView };
  (VIEWS[location.pathname] || loginView)();
})();
