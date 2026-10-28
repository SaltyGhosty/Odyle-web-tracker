// web/social-profile.js
// Ficha pública de un jugador en un <dialog>: datos, energía solo si sois amigos y la comparte,
// y las acciones según la relación (añadir, aceptar, cancelar, mensaje, eliminar, bloquear, denunciar).
import { el, S, userText, personHead, miniOrb, note } from './social-dom.js';
import { actionsFor, friendEnergy } from './social.js';
import { iconSvg } from './icons.js';

const REASONS = [['spam', S('Spam')], ['abuse', S('Insultos o acoso')], ['cheating', S('Trampas')], ['other', S('Otro motivo')]];

export function createProfileSheet(shared) {
  const { api } = shared;
  const dialog = el('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' });
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  let current = null, seq = 0; // seq: solo cuenta la última ficha pedida; cerrar también descarta lo pendiente
  dialog.addEventListener('close', () => { seq++; });

  function close() { if (dialog.open) dialog.close(); }

  async function act(uid, fn, after) {
    try { await fn(); } catch (e) { show(uid, e.status === 404 ? S('Este jugador ya no está disponible.') : e.message); return; }
    await shared.refreshFriends();
    if (after) after(); else open(uid);
  }

  function show(uid, error) {
    const d = current;
    if (!d || d.profile.uid !== uid) return;
    const p = d.profile;
    const box = el('div', { class: 'sheet-box' });
    box.append(el('div', { class: 'sheet-head' },
      el('h2', { id: 'sheet-title' }, personHead(p)),
      el('button', { type: 'button', class: 'sheet-close', 'aria-label': S('Cerrar'), onclick: close }, iconSvg(document, 'cerrar'))));
    if (p.legion) box.append(el('p', { class: 'sheet-line' }, el('span', {}, S('Legión')), ': ', userText('span', p.legion)));
    if (p.bio) box.append(userText('p', p.bio, { class: 'sheet-bio' }));

    const energy = el('section', { class: 'sheet-energy', 'aria-label': S('Energía') });
    const rows = friendEnergy(d.characters, shared.anchorMs(), Date.now());
    if (rows.length) {
      const list = el('ul', { class: 'energy-list' });
      for (const r of rows) list.append(el('li', {}, miniOrb(r), userText('span', r.name, { class: 'grow' }),
        el('b', { class: 'num' + (r.isFull ? ' full' : '') }, `${r.energy} / ${r.max}`)));
      energy.append(list);
    } else {
      energy.append(note(d.relation === 'friends' ? S('No comparte su energía.') : S('La energía solo la ven sus amigos.')));
    }
    box.append(energy);

    const actions = el('div', { class: 'sheet-actions' });
    const L = { add: S('Añadir amigo'), cancel: S('Cancelar solicitud'), accept: S('Aceptar'), reject: S('Rechazar'), message: S('Mensaje'), remove: S('Eliminar amigo') };
    for (const a of actionsFor(d.relation)) {
      const primary = a === 'add' || a === 'accept' || a === 'message';
      actions.append(el('button', { type: 'button', class: primary ? 'primary' : '', onclick: () => {
        if (a === 'add') act(uid, () => api.addFriend(uid));
        else if (a === 'accept') act(uid, () => api.accept(uid));
        else if (a === 'message') { close(); shared.openChat(uid); }
        else act(uid, () => api.removeFriend(uid));
      } }, L[a]));
    }
    if (d.relation !== 'self') {
      const block = el('button', { type: 'button', class: 'danger', onclick: () => {
        if (block.dataset.armed !== '1') { block.dataset.armed = '1'; block.textContent = S('Pulsa otra vez para bloquear'); return; }
        act(uid, () => api.block(uid), () => { close(); shared.refreshConvs(); });
      } }, S('Bloquear'));
      const reportBtn = el('button', { type: 'button', onclick: () => { form.hidden = !form.hidden; } }, S('Denunciar'));
      actions.append(block, reportBtn);
    }
    box.append(actions);

    const reason = el('select', { id: 'report-reason' }, ...REASONS.map(([v, t]) => el('option', { value: v }, t)));
    const noteInput = el('textarea', { id: 'report-note', maxlength: '500', rows: '2', placeholder: S('Cuéntanos qué ha pasado (opcional)') });
    const status = el('p', { class: 'social-note', role: 'status' });
    const form = el('form', { class: 'report-form', hidden: true, onsubmit: async (e) => {
      e.preventDefault();
      const body = { uid, reason: reason.value };
      if (noteInput.value.trim()) body.note = noteInput.value.trim();
      try { await api.report(body); status.textContent = S('Denuncia enviada. Gracias.'); form.reset(); }
      catch (err) { status.textContent = err.message; }
    } },
      el('label', { for: 'report-reason' }, S('Motivo')), reason,
      el('label', { for: 'report-note' }, S('Nota')), noteInput,
      el('button', { type: 'submit' }, S('Enviar denuncia')), status);
    box.append(form);
    if (error) box.append(note(error, 'error'));
    dialog.replaceChildren(box);
  }

  async function open(uid) {
    const my = ++seq;
    dialog.replaceChildren(el('div', { class: 'sheet-box' }, note(S('Cargando…'))));
    if (!dialog.open) dialog.showModal();
    let got;
    try { got = await api.profile(uid); } catch (e) {
      if (my !== seq) return;
      dialog.replaceChildren(el('div', { class: 'sheet-box' },
        note(e.status === 404 ? S('Este jugador ya no está disponible.') : e.message, 'error'),
        el('button', { type: 'button', onclick: close }, S('Cerrar'))));
      return;
    }
    if (my !== seq) return;
    current = got;
    show(uid);
  }

  return { render() {}, open };
}
