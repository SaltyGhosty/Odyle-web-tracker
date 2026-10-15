// Idiomas de las pantallas de cuenta. Script clásico sin innerHTML (SR-2): las banderas se dibujan con
// createElementNS. Comparte la preferencia 'odyle-lang' con la página principal (i18n.js), así que el idioma
// elegido aquí se mantiene al entrar. Expone window.odyleAuthI18n = { t, lang, setLang, onChange, menu }.
(function () {
  'use strict';

  const LANGS = [
    { code: 'es', name: 'Español' },
    { code: 'en', name: 'English' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
  ];
  const KNOWN = new Set(LANGS.map((l) => l.code));

  // Claves = texto en español (el de la página y el que devuelve el servidor).
  const S = {
    en: {
      'Privacidad': 'Privacy',
      'Al crear la cuenta aceptas la': 'By creating the account you accept the',
      'política de privacidad': 'privacy policy',
      'Política de privacidad': 'Privacy policy',
      'Volver a Odyle Tracker': 'Back to Odyle Tracker',
      'Cuenta': 'Account',
      'Idioma': 'Language',
      'Esta página necesita JavaScript.': 'This page needs JavaScript.',
      'No se pudo conectar. Inténtalo de nuevo.': 'Could not connect. Please try again.',
      'Repite la contraseña': 'Repeat the password',
      'Entrar': 'Log in',
      'Correo electrónico': 'Email',
      'Contraseña': 'Password',
      'No se pudo entrar': 'Could not log in',
      '¿Olvidaste tu contraseña?': 'Forgot your password?',
      'Crear una cuenta': 'Create an account',
      'Escribe tu correo y, si existe una cuenta, te enviaremos un enlace para elegir una contraseña nueva.': 'Enter your email and, if an account exists, we will send you a link to choose a new password.',
      'Enviar enlace': 'Send link',
      'Si existe una cuenta con ese correo, recibirás un enlace.': 'If an account exists for that email, you will receive a link.',
      'No se pudo enviar el enlace': 'Could not send the link',
      'Recuperar contraseña': 'Recover password',
      'Volver a entrar': 'Back to log in',
      'Contraseña (10 a 128 caracteres)': 'Password (10 to 128 characters)',
      'Crear cuenta': 'Create account',
      'Las contraseñas no coinciden': 'The passwords do not match',
      'No se pudo crear la cuenta': 'Could not create the account',
      'Cuenta creada.': 'Account created.',
      'Ir a entrar': 'Go to log in',
      'Ya tengo cuenta': 'I already have an account',
      'Verificar correo': 'Verify email',
      'Escribe la contraseña que elegiste al registrarte': 'Enter the password you chose when you signed up',
      'Restablecer contraseña': 'Reset password',
      'Contraseña nueva (10 a 128 caracteres)': 'New password (10 to 128 characters)',
      'Guardar contraseña': 'Save password',
      'No se pudo cambiar la contraseña': 'Could not change the password',
      'Contraseña cambiada.': 'Password changed.',
      // Mensajes del servidor
      'Correo o contraseña incorrectos': 'Incorrect email or password',
      'El servidor está ocupado. Inténtalo en unos segundos.': 'The server is busy. Try again in a few seconds.',
      'Error interno del servidor.': 'Internal server error.',
      'Escribe un correo válido': 'Enter a valid email',
      'La recuperación por correo aún no está disponible': 'Email recovery is not available yet',
      'Petición rechazada': 'Request rejected',
      'Sesión caducada': 'Session expired',
      'Verifica tu correo para entrar': 'Verify your email to log in',
      'Contraseña cambiada. Ya puedes entrar.': 'Password changed. You can log in now.',
      'Correo verificado': 'Email verified',
      'Si el correo es válido, te hemos enviado un enlace': 'If the email is valid, we have sent you a link',
      'La contraseña necesita al menos 10 caracteres': 'The password needs at least 10 characters',
      'La contraseña admite hasta 128 caracteres': 'The password allows up to 128 characters',
      'Esa contraseña es demasiado común': 'That password is too common',
      'Demasiados intentos. Prueba más tarde.': 'Too many attempts. Try again later.',
      'El enlace no es válido o ha caducado': 'The link is not valid or has expired',
      'El enlace o la contraseña no son válidos': 'The link or the password is not valid',
      'Petición no válida.': 'Invalid request.',
      'La petición es demasiado grande.': 'The request is too large.',
      'Tipo de contenido no admitido.': 'Unsupported content type.',
      'Servidor ocupado': 'Server busy',
      'El cuerpo debe ser un objeto JSON': 'The body must be a JSON object',
    },
    it: {
      'Privacidad': 'Privacy',
      'Al crear la cuenta aceptas la': 'Creando l’account accetti la',
      'política de privacidad': 'politica sulla privacy',
      'Política de privacidad': 'Informativa sulla privacy',
      'Volver a Odyle Tracker': 'Torna a Odyle Tracker',
      'Cuenta': 'Account',
      'Idioma': 'Lingua',
      'Esta página necesita JavaScript.': 'Questa pagina richiede JavaScript.',
      'No se pudo conectar. Inténtalo de nuevo.': 'Impossibile connettersi. Riprova.',
      'Repite la contraseña': 'Ripeti la password',
      'Entrar': 'Accedi',
      'Correo electrónico': 'Email',
      'Contraseña': 'Password',
      'No se pudo entrar': 'Impossibile accedere',
      '¿Olvidaste tu contraseña?': 'Hai dimenticato la password?',
      'Crear una cuenta': 'Crea un account',
      'Escribe tu correo y, si existe una cuenta, te enviaremos un enlace para elegir una contraseña nueva.': 'Scrivi la tua email e, se esiste un account, ti invieremo un link per scegliere una nuova password.',
      'Enviar enlace': 'Invia link',
      'Si existe una cuenta con ese correo, recibirás un enlace.': 'Se esiste un account con quella email, riceverai un link.',
      'No se pudo enviar el enlace': 'Impossibile inviare il link',
      'Recuperar contraseña': 'Recupera password',
      'Volver a entrar': 'Torna all\'accesso',
      'Contraseña (10 a 128 caracteres)': 'Password (da 10 a 128 caratteri)',
      'Crear cuenta': 'Crea account',
      'Las contraseñas no coinciden': 'Le password non coincidono',
      'No se pudo crear la cuenta': 'Impossibile creare l\'account',
      'Cuenta creada.': 'Account creato.',
      'Ir a entrar': 'Vai all\'accesso',
      'Ya tengo cuenta': 'Ho già un account',
      'Verificar correo': 'Verifica email',
      'Escribe la contraseña que elegiste al registrarte': 'Scrivi la password che hai scelto durante la registrazione',
      'Restablecer contraseña': 'Reimposta password',
      'Contraseña nueva (10 a 128 caracteres)': 'Nuova password (da 10 a 128 caratteri)',
      'Guardar contraseña': 'Salva password',
      'No se pudo cambiar la contraseña': 'Impossibile cambiare la password',
      'Contraseña cambiada.': 'Password cambiata.',
      'Correo o contraseña incorrectos': 'Email o password errati',
      'El servidor está ocupado. Inténtalo en unos segundos.': 'Il server è occupato. Riprova tra qualche secondo.',
      'Error interno del servidor.': 'Errore interno del server.',
      'Escribe un correo válido': 'Scrivi un\'email valida',
      'La recuperación por correo aún no está disponible': 'Il recupero via email non è ancora disponibile',
      'Petición rechazada': 'Richiesta rifiutata',
      'Sesión caducada': 'Sessione scaduta',
      'Verifica tu correo para entrar': 'Verifica la tua email per accedere',
      'Contraseña cambiada. Ya puedes entrar.': 'Password cambiata. Ora puoi accedere.',
      'Correo verificado': 'Email verificata',
      'Si el correo es válido, te hemos enviado un enlace': 'Se l\'email è valida, ti abbiamo inviato un link',
      'La contraseña necesita al menos 10 caracteres': 'La password deve avere almeno 10 caratteri',
      'La contraseña admite hasta 128 caracteres': 'La password può avere al massimo 128 caratteri',
      'Esa contraseña es demasiado común': 'Questa password è troppo comune',
      'Demasiados intentos. Prueba más tarde.': 'Troppi tentativi. Riprova più tardi.',
      'El enlace no es válido o ha caducado': 'Il link non è valido o è scaduto',
      'El enlace o la contraseña no son válidos': 'Il link o la password non sono validi',
      'Petición no válida.': 'Richiesta non valida.',
      'La petición es demasiado grande.': 'La richiesta è troppo grande.',
      'Tipo de contenido no admitido.': 'Tipo di contenuto non supportato.',
      'Servidor ocupado': 'Server occupato',
      'El cuerpo debe ser un objeto JSON': 'Il corpo deve essere un oggetto JSON',
    },
    pt: {
      'Privacidad': 'Privacidade',
      'Al crear la cuenta aceptas la': 'Ao criar a conta, você aceita a',
      'política de privacidad': 'política de privacidade',
      'Política de privacidad': 'Política de privacidade',
      'Volver a Odyle Tracker': 'Voltar ao Odyle Tracker',
      'Cuenta': 'Conta',
      'Idioma': 'Idioma',
      'Esta página necesita JavaScript.': 'Esta página precisa de JavaScript.',
      'No se pudo conectar. Inténtalo de nuevo.': 'Não foi possível conectar. Tente novamente.',
      'Repite la contraseña': 'Repita a senha',
      'Entrar': 'Entrar',
      'Correo electrónico': 'E-mail',
      'Contraseña': 'Senha',
      'No se pudo entrar': 'Não foi possível entrar',
      '¿Olvidaste tu contraseña?': 'Esqueceu sua senha?',
      'Crear una cuenta': 'Criar uma conta',
      'Escribe tu correo y, si existe una cuenta, te enviaremos un enlace para elegir una contraseña nueva.': 'Digite seu e-mail e, se existir uma conta, enviaremos um link para escolher uma nova senha.',
      'Enviar enlace': 'Enviar link',
      'Si existe una cuenta con ese correo, recibirás un enlace.': 'Se existir uma conta com esse e-mail, você receberá um link.',
      'No se pudo enviar el enlace': 'Não foi possível enviar o link',
      'Recuperar contraseña': 'Recuperar senha',
      'Volver a entrar': 'Voltar para entrar',
      'Contraseña (10 a 128 caracteres)': 'Senha (10 a 128 caracteres)',
      'Crear cuenta': 'Criar conta',
      'Las contraseñas no coinciden': 'As senhas não coincidem',
      'No se pudo crear la cuenta': 'Não foi possível criar a conta',
      'Cuenta creada.': 'Conta criada.',
      'Ir a entrar': 'Ir para entrar',
      'Ya tengo cuenta': 'Já tenho conta',
      'Verificar correo': 'Verificar e-mail',
      'Escribe la contraseña que elegiste al registrarte': 'Digite a senha que você escolheu ao se registrar',
      'Restablecer contraseña': 'Redefinir senha',
      'Contraseña nueva (10 a 128 caracteres)': 'Nova senha (10 a 128 caracteres)',
      'Guardar contraseña': 'Salvar senha',
      'No se pudo cambiar la contraseña': 'Não foi possível alterar a senha',
      'Contraseña cambiada.': 'Senha alterada.',
      'Correo o contraseña incorrectos': 'E-mail ou senha incorretos',
      'El servidor está ocupado. Inténtalo en unos segundos.': 'O servidor está ocupado. Tente novamente em alguns segundos.',
      'Error interno del servidor.': 'Erro interno do servidor.',
      'Escribe un correo válido': 'Digite um e-mail válido',
      'La recuperación por correo aún no está disponible': 'A recuperação por e-mail ainda não está disponível',
      'Petición rechazada': 'Solicitação recusada',
      'Sesión caducada': 'Sessão expirada',
      'Verifica tu correo para entrar': 'Verifique seu e-mail para entrar',
      'Contraseña cambiada. Ya puedes entrar.': 'Senha alterada. Você já pode entrar.',
      'Correo verificado': 'E-mail verificado',
      'Si el correo es válido, te hemos enviado un enlace': 'Se o e-mail for válido, enviamos um link para você',
      'La contraseña necesita al menos 10 caracteres': 'A senha precisa de pelo menos 10 caracteres',
      'La contraseña admite hasta 128 caracteres': 'A senha permite até 128 caracteres',
      'Esa contraseña es demasiado común': 'Essa senha é muito comum',
      'Demasiados intentos. Prueba más tarde.': 'Muitas tentativas. Tente mais tarde.',
      'El enlace no es válido o ha caducado': 'O link não é válido ou expirou',
      'El enlace o la contraseña no son válidos': 'O link ou a senha não são válidos',
      'Petición no válida.': 'Solicitação inválida.',
      'La petición es demasiado grande.': 'A solicitação é grande demais.',
      'Tipo de contenido no admitido.': 'Tipo de conteúdo não suportado.',
      'Servidor ocupado': 'Servidor ocupado',
      'El cuerpo debe ser un objeto JSON': 'O corpo deve ser um objeto JSON',
    },
  };

  // Misma detección que i18n.js: preferencia guardada, si no el idioma del navegador, si no inglés.
  function detect() {
    try { const s = localStorage.getItem('odyle-lang'); if (KNOWN.has(s)) return s; } catch { /* sin almacenamiento */ }
    const n = (navigator.language || 'es').slice(0, 2).toLowerCase();
    return KNOWN.has(n) ? n : 'en';
  }
  let lang = detect();
  const listeners = [];

  const t = (text) => {
    if (lang === 'es' || typeof text !== 'string') return text;
    const d = S[lang];
    return (d && Object.prototype.hasOwnProperty.call(d, text)) ? d[text] : text;
  };

  function applyDocument() {
    document.documentElement.lang = lang;
    document.title = 'Energía Odyle · ' + t('Cuenta');
    const ns = document.querySelector('noscript p');
    if (ns) ns.textContent = t('Esta página necesita JavaScript.');
  }

  function setLang(code) {
    if (!KNOWN.has(code) || code === lang) return;
    lang = code;
    try { localStorage.setItem('odyle-lang', code); } catch { /* sin almacenamiento */ }
    applyDocument();
    for (const fn of listeners) fn(code);
  }

  // ---- banderas (SVG 3:2 dibujado con el DOM) ----
  const SVG = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  }
  const rect = (x, y, w, h, fill) => svgEl('rect', { x, y, width: w, height: h, fill });
  const FLAGS = {
    es: () => [rect(0, 0, 30, 20, '#AA151B'), rect(0, 5, 30, 10, '#F1BF00')],
    it: () => [rect(0, 0, 10, 20, '#009246'), rect(10, 0, 10, 20, '#FFFFFF'), rect(20, 0, 10, 20, '#CE2B37')],
    pt: () => [rect(0, 0, 12, 20, '#046A38'), rect(12, 0, 18, 20, '#DA291C'),
      svgEl('circle', { cx: 12, cy: 10, r: 4.2, fill: '#FFE900' }),
      svgEl('circle', { cx: 12, cy: 10, r: 2.8, fill: '#DA291C' }),
      svgEl('rect', { x: 10.6, y: 8.4, width: 2.8, height: 3.4, rx: .6, fill: '#FFFFFF' })],
    en: () => {
      // Union Jack simplificada en un lienzo 60×40.
      const g = svgEl('g', { transform: 'scale(.5)' });
      g.append(
        rect(0, 0, 60, 40, '#012169'),
        svgEl('path', { d: 'M0,0 L60,40 M60,0 L0,40', stroke: '#FFFFFF', 'stroke-width': 8 }),
        svgEl('path', { d: 'M0,0 L60,40 M60,0 L0,40', stroke: '#C8102E', 'stroke-width': 3 }),
        svgEl('path', { d: 'M30,0 V40 M0,20 H60', stroke: '#FFFFFF', 'stroke-width': 12 }),
        svgEl('path', { d: 'M30,0 V40 M0,20 H60', stroke: '#C8102E', 'stroke-width': 7 }),
      );
      return [g];
    },
  };
  function flag(code) {
    const s = svgEl('svg', { viewBox: '0 0 30 20', width: 24, height: 16, class: 'flag', 'aria-hidden': 'true', focusable: 'false' });
    s.append(...FLAGS[code]());
    return s;
  }

  // ---- menú hamburguesa ----
  function menu() {
    const wrap = document.createElement('div');
    wrap.className = 'lang-menu';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-toggle';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'lang-list');
    const bars = document.createElement('span');
    bars.className = 'bars';
    bars.setAttribute('aria-hidden', 'true');
    bars.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
    const current = document.createElement('span');
    current.className = 'current-flag';
    btn.append(bars, current);

    const list = document.createElement('ul');
    list.id = 'lang-list';
    list.className = 'lang-list';
    list.setAttribute('role', 'menu');
    list.hidden = true;
    const items = LANGS.map((l) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'none');
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitemradio');
      b.dataset.lang = l.code;
      b.lang = l.code;
      const name = document.createElement('span');
      name.textContent = l.name;
      b.append(flag(l.code), name);
      b.addEventListener('click', () => { setLang(l.code); close(true); });
      li.append(b);
      list.append(li);
      return b;
    });

    function sync() {
      current.replaceChildren(flag(lang));
      btn.setAttribute('aria-label', t('Idioma') + ': ' + LANGS.find((l) => l.code === lang).name);
      btn.title = t('Idioma');
      for (const b of items) b.setAttribute('aria-checked', String(b.dataset.lang === lang));
    }
    function open() {
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      (items.find((b) => b.dataset.lang === lang) || items[0]).focus();
    }
    function close(focusBtn) {
      if (list.hidden) return;
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    }
    btn.addEventListener('click', () => (list.hidden ? open() : close(false)));
    list.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(false); });

    listeners.push(sync);
    sync();
    wrap.append(btn, list);
    return wrap;
  }

  applyDocument();
  window.odyleAuthI18n = { t, get lang() { return lang; }, setLang, onChange: (fn) => listeners.push(fn), menu };
})();
