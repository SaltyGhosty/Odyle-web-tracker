// /privacidad: builds the policy in the chosen language with DOM APIs only (no HTML sinks).
(function () {
  'use strict';
  const i18n = window.odyleAuthI18n, T = window.odylePrivacyText;
  const art = document.getElementById('policy');
  function paint() {
    const secs = T[i18n.lang] || T.es;
    const nodes = [];
    for (const s of secs) {
      const h = document.createElement('h2'); h.textContent = s.h; nodes.push(h);
      for (const t of s.p) { const p = document.createElement('p'); p.textContent = t; nodes.push(p); }
    }
    art.replaceChildren(...nodes);
    document.documentElement.lang = T[i18n.lang] ? i18n.lang : 'es';
    // auth-i18n.js pone el título de las páginas de cuenta; aquí va el de la política.
    document.title = 'Odyle Tracker · ' + i18n.t('Privacidad');
    document.getElementById('policy-title').textContent = i18n.t('Política de privacidad');
    document.getElementById('back').textContent = i18n.t('Volver a Odyle Tracker');
  }
  document.querySelector('.auth-top').append(i18n.menu());
  i18n.onChange(paint);
  paint();
})();
