// web/social-friends.js
// Pantalla Amigos: pestañas Amigos / Solicitudes / Enviadas / Bloqueados. En línea primero.
// El orbe pequeño se carga para los 20 primeros amigos y se guarda 5 minutos (límite del servidor: 60/min).
import { el, S, personHead, miniOrb, note, userText } from './social-dom.js';
import { friendEnergy } from './social.js';

const TTL = 5 * 60_000, MAX_ORBS = 20;

export function createFriends(shared, panel) {
  const { api, state } = shared;
  let tab = 'friends', active = false, loading = false;
  const energy = new Map(); // uid → { row, at }

  async function loadEnergy() {
    if (loading) return;
    loading = true;
    try {
      for (const f of state.friends.slice(0, MAX_ORBS)) {
        const c = energy.get(f.uid);
        if (c && Date.now() - c.at < TTL) continue;
        try {
          const d = await api.profile(f.uid);
          energy.set(f.uid, { row: friendEnergy(d.characters, shared.anchorMs(), Date.now())[0] || null, at: Date.now() });
        } catch { energy.set(f.uid, { row: null, at: Date.now() }); }
        if (active) render();
      }
    } finally { loading = false; }
  }

  async function run(fn) {
    try { await fn(); } catch (e) { panel.append(note(e.message, 'error')); return; }
    await shared.refreshFriends();
  }

  function row(p, { online = false, orb = false, actions = [] } = {}) {
    return el('li', {},
      orb ? miniOrb(energy.has(p.uid) ? energy.get(p.uid).row : null) : null,
      el('button', { type: 'button', class: 'grow', onclick: () => shared.openProfile(p.uid), 'aria-label': S('Ver perfil') }, personHead(p, { online })),
      el('div', { class: 'social-actions' }, ...actions));
  }
  const btn = (label, onclick, cls = '') => el('button', { type: 'button', class: cls, onclick }, label);

  function render() {
    const tabs = [
      ['friends', S('Amigos'), state.friends.length],
      ['incoming', S('Solicitudes'), state.incoming.length],
      ['outgoing', S('Enviadas'), state.outgoing.length],
      ['blocked', S('Bloqueados'), state.blocked.length],
    ];
    const bar = el('div', { class: 'subtabs', role: 'tablist', 'aria-label': S('Amigos') });
    for (const [id, label, n] of tabs) {
      bar.append(el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; render(); } },
        el('span', {}, label), el('span', { class: 'count' }, String(n))));
    }
    const list = el('ul', { class: 'social-list', role: 'tabpanel' });
    let empty = null;
    if (tab === 'friends') {
      for (const f of state.friends) list.append(row(f, { online: f.online, orb: true, actions: [btn(S('Mensaje'), () => shared.openChat(f.uid), 'primary')] }));
      if (!state.friends.length) empty = el('div', { class: 'empty' }, note(S('Aún no tienes amigos.')), btn(S('Buscar jugadores'), () => shared.goTab('buscar'), 'primary'));
    } else if (tab === 'incoming') {
      for (const p of state.incoming) list.append(row(p, { actions: [btn(S('Aceptar'), () => run(() => api.accept(p.uid)), 'primary'), btn(S('Rechazar'), () => run(() => api.removeFriend(p.uid)))] }));
      if (!state.incoming.length) empty = note(S('No tienes solicitudes pendientes.'));
    } else if (tab === 'outgoing') {
      for (const p of state.outgoing) list.append(row(p, { actions: [btn(S('Cancelar'), () => run(() => api.removeFriend(p.uid)))] }));
      if (!state.outgoing.length) empty = note(S('No has enviado solicitudes.'));
    } else {
      for (const b of state.blocked) {
        list.append(el('li', {}, el('div', { class: 'grow' }, userText('b', b.nick || '—', { class: 'nick' })),
          el('div', { class: 'social-actions' }, btn(S('Desbloquear'), () => run(() => api.unblock(b.uid))))));
      }
      if (!state.blocked.length) empty = note(S('No has bloqueado a nadie.'));
    }
    panel.replaceChildren(el('section', { class: 'panel friends' }, el('h2', {}, S('Amigos')), bar, empty || list));
    if (active && tab === 'friends') loadEnergy();
  }

  return { render, onTab(id) { active = id === 'amigos'; if (active) render(); } };
}
