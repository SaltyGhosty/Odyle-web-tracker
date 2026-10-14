// web/social-search.js
// Buscar perfiles por nombre (2–20 letras, el servidor da hasta 20) con filtros de servidor, facción y clase.
// Las respuestas que llegan tarde se descartan: solo cuenta la última búsqueda.
import { el, S, personHead, note } from './social-dom.js';
import { serversOf, filterResults } from './social.js';
import { CLASSES } from './classes.js';

export function createSearch(shared, panel) {
  const { api } = shared;
  let results = [], status = 'idle', error = '', seq = 0, timer = null;
  const filters = { server: '', faction: '', classId: '' };

  const input = el('input', { type: 'search', id: 'search-q', maxlength: '20', autocomplete: 'off', placeholder: S('Nombre del jugador'),
    oninput: () => { clearTimeout(timer); timer = setTimeout(() => run(), 300); } });
  const serverSel = el('select', { id: 'search-server', onchange: () => { filters.server = serverSel.value; paintResults(); } });
  const factionSel = el('select', { id: 'search-faction', onchange: () => { filters.faction = factionSel.value; paintResults(); } },
    el('option', { value: '' }, S('Todas las facciones')), el('option', { value: 'elyos' }, S('Elyos')), el('option', { value: 'asmodian' }, S('Asmodiano')));
  const classSel = el('select', { id: 'search-class', onchange: () => { filters.classId = classSel.value; paintResults(); } },
    el('option', { value: '' }, S('Todas las clases')), ...CLASSES.map((c) => el('option', { value: c.id }, c.name)));
  const out = el('div', { class: 'search-out', 'aria-live': 'polite' });
  const form = el('form', { class: 'search-form', role: 'search', onsubmit: (e) => { e.preventDefault(); clearTimeout(timer); run(); } },
    el('label', { for: 'search-q' }, S('Buscar jugador')),
    el('div', { class: 'search-row' }, input, el('button', { type: 'submit', class: 'primary' }, S('Buscar'))),
    el('div', { class: 'search-filters' },
      el('label', { class: 'sr-only', for: 'search-server' }, S('Servidor')), serverSel,
      el('label', { class: 'sr-only', for: 'search-faction' }, S('Facción')), factionSel,
      el('label', { class: 'sr-only', for: 'search-class' }, S('Clase')), classSel));

  async function run() {
    const q = input.value.trim();
    const my = ++seq;
    if (q.length < 2) { results = []; status = 'idle'; paintResults(); return; }
    status = 'loading'; paintResults();
    try {
      const r = await api.search(q);
      if (my !== seq) return;
      results = r; status = 'done'; error = '';
    } catch (e) {
      if (my !== seq) return;
      results = []; status = 'error'; error = e.message;
    }
    paintServers(); paintResults();
  }

  function paintServers() {
    const keep = filters.server;
    serverSel.replaceChildren(el('option', { value: '' }, S('Todos los servidores')),
      ...serversOf(results).map((s) => el('option', { value: s, translate: 'no' }, s)));
    serverSel.value = serversOf(results).includes(keep) ? keep : '';
    filters.server = serverSel.value;
  }

  function action(r) {
    const go = async (fn) => { try { const res = await fn(); if (res && res.status) r.relation = res.status; } catch (e) { error = e.message; } await shared.refreshFriends(); paintResults(); };
    if (r.relation === 'none') return el('button', { type: 'button', class: 'primary', onclick: () => go(() => api.addFriend(r.uid)) }, S('Añadir'));
    if (r.relation === 'pending-out') return el('span', { class: 'social-note' }, S('Solicitud enviada'));
    if (r.relation === 'pending-in') return el('button', { type: 'button', class: 'primary', onclick: () => go(() => api.accept(r.uid)) }, S('Aceptar'));
    if (r.relation === 'friends') return el('button', { type: 'button', onclick: () => shared.openChat(r.uid) }, S('Mensaje'));
    return null;
  }

  function paintResults() {
    if (status === 'idle') { out.replaceChildren(note(S('Escribe al menos 2 letras del nombre.'))); return; }
    if (status === 'loading') { out.replaceChildren(note(S('Buscando…'))); return; }
    if (status === 'error') { out.replaceChildren(note(error, 'error')); return; }
    const shown = filterResults(results, filters);
    if (!results.length) { out.replaceChildren(note(S('Nadie se llama así, o ha elegido no aparecer.'))); return; }
    if (!shown.length) { out.replaceChildren(note(S('Nadie coincide con estos filtros.'))); return; }
    out.replaceChildren(el('ul', { class: 'social-list' }, ...shown.map((r) => el('li', {},
      el('button', { type: 'button', class: 'grow', onclick: () => shared.openProfile(r.uid), 'aria-label': S('Ver perfil') }, personHead(r)),
      el('div', { class: 'social-actions' }, action(r))))));
  }

  paintServers();
  panel.replaceChildren(el('section', { class: 'panel search' }, el('h2', {}, S('Buscar perfiles')), form, out));
  paintResults();

  return {
    render() { if (status === 'done') paintResults(); },
    onTab(id) { if (id === 'buscar') input.focus({ preventScroll: true }); },
  };
}
