// web/social-chat.js
// Chat 1 a 1 entre amigos: lista de conversaciones, hilo y redactor. Atajos: compartir mi energía e invitar
// a mazmorra. Cada mensaje lleva un clientId: un reintento tras un fallo de red no crea un duplicado.
import { el, S, fmt, userText, personHead, avatar, note, timeLabel, dateTimeLabel } from './social-dom.js';
import { mergeMessages, applyIncoming, markRead, parseMessageText, parseInvite, makeClientId, shareText, otherOf } from './social.js';

const PAGE = 50;

export function createChat(shared, panel) {
  const { api, me, state } = shared;
  let openUid = null, msgs = [], more = false, ended = false, readAt = 0, draftId = null, sending = false, error = '', active = false;

  const root = el('div', { class: 'chat' });
  const listBox = el('aside', { class: 'chat-list', 'aria-label': S('Conversaciones') });
  const threadBox = el('section', { class: 'chat-thread', 'aria-label': S('Conversación') });
  root.append(listBox, threadBox);
  panel.replaceChildren(el('section', { class: 'panel chat-panel' }, el('h2', {}, S('Chat')), root));

  // ---- lista ----
  function profileOf(uid) {
    const c = state.convs.find((x) => x.profile.uid === uid);
    return (c && c.profile) || state.friends.find((f) => f.uid === uid) || { uid, nick: '' };
  }
  function preview(m) {
    if (!m) return el('span', {});
    if (m.kind === 'invite') return el('span', {}, el('span', {}, S('Invitación')), ': ', userText('span', m.body.title));
    return userText('span', m.body.text);
  }
  function paintList() {
    const items = state.convs.map((c) => el('li', {}, el('button', {
      type: 'button', class: 'conv' + (c.profile.uid === openUid ? ' open' : ''), 'aria-current': c.profile.uid === openUid ? 'true' : null,
      onclick: () => open(c.profile.uid) },
      avatar(c.profile, (state.friends.find((f) => f.uid === c.profile.uid) || {}).online),
      el('span', { class: 'conv-text' }, userText('b', c.profile.nick || '—', { class: 'nick' }), el('span', { class: 'conv-last' }, preview(c.last))),
      el('span', { class: 'conv-side' }, c.last ? el('time', {}, timeLabel(c.last.at)) : null,
        c.unread ? el('span', { class: 'badge', 'aria-label': fmt(S('{0} sin leer'), c.unread) }, String(c.unread)) : null))));
    const withConv = new Set(state.convs.map((c) => c.profile.uid));
    const others = state.friends.filter((f) => !withConv.has(f.uid));
    listBox.replaceChildren(...[
      state.convs.length ? el('ul', { class: 'conv-list' }, ...items) : note(S('Todavía no tienes conversaciones.')),
      others.length ? el('h3', { class: 'sub' }, S('Escribir a un amigo')) : null,
      others.length ? el('ul', { class: 'conv-list' }, ...others.map((f) => el('li', {}, el('button', { type: 'button', class: 'conv', onclick: () => open(f.uid) },
        avatar(f, f.online), el('span', { class: 'conv-text' }, userText('b', f.nick || '—', { class: 'nick' })))))) : null].filter(Boolean));
  }

  // ---- hilo ----
  function bubble(m) {
    const mine = m.from === me;
    const li = el('li', { class: 'msg ' + (mine ? 'mine' : 'theirs') });
    if (m.kind === 'invite') {
      li.append(el('div', { class: 'invite' },
        el('span', { class: 'invite-kind' }, S('Invitación a mazmorra')),
        userText('b', m.body.title, { class: 'invite-title' }),
        el('span', {}, dateTimeLabel(m.body.at)),
        el('span', { class: 'invite-meta' }, fmt(S('{0} plazas · {1} OD'), m.body.slots, m.body.cost))));
    } else {
      li.append(userText('p', m.body.text, { class: 'msg-text' }));
    }
    li.append(el('time', { class: 'msg-time' }, timeLabel(m.at)));
    return li;
  }
  function paintThread() {
    if (!openUid) {
      threadBox.replaceChildren(note(S('Elige una conversación.')));
      root.classList.remove('thread-open');
      return;
    }
    root.classList.add('thread-open');
    const p = profileOf(openUid);
    const conv = state.convs.find((c) => c.profile.uid === openUid);
    const canWrite = !ended && (!conv || conv.friend);
    const head = el('div', { class: 'thread-head' },
      el('button', { type: 'button', class: 'back', 'aria-label': S('Volver a la lista'), onclick: () => { openUid = null; paintAll(); } }, '‹'),
      el('button', { type: 'button', class: 'grow', onclick: () => shared.openProfile(openUid), 'aria-label': S('Ver perfil') }, personHead(p)));
    const list = el('ol', { class: 'msgs' });
    if (more) list.append(el('li', { class: 'more' }, el('button', { type: 'button', onclick: loadOlder }, S('Ver mensajes anteriores'))));
    for (const m of msgs) list.append(bubble(m));
    const lastMine = [...msgs].reverse().find((m) => m.from === me);
    if (lastMine && (lastMine.readAt || readAt >= lastMine.at)) list.append(el('li', { class: 'read' }, S('Leído')));
    const scroller = el('div', { class: 'msgs-scroll' }, list);
    const hadFocus = document.activeElement === text, selA = text.selectionStart, selB = text.selectionEnd;
    threadBox.replaceChildren(...[head, scroller, canWrite ? composer() : note(S('Ya no sois amigos: no podéis escribiros.')), error ? note(error, 'error') : null].filter(Boolean));
    if (hadFocus && canWrite) { text.focus(); try { text.setSelectionRange(selA, selB); } catch { /* sin selección */ } }
    scroller.scrollTop = scroller.scrollHeight;
  }

  // ---- redactor ----
  const text = el('textarea', { id: 'chat-text', rows: '2', maxlength: '1000', placeholder: S('Escribe un mensaje'),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText(); } } });
  const inviteForm = (() => {
    const title = el('input', { id: 'inv-title', maxlength: '60', placeholder: S('Mazmorra o actividad') });
    const when = el('input', { id: 'inv-when', type: 'datetime-local' });
    const slots = el('input', { id: 'inv-slots', type: 'number', min: '1', max: '12', value: '6' });
    const cost = el('input', { id: 'inv-cost', type: 'number', min: '0', max: '840', value: '0' });
    const f = el('form', { class: 'invite-form', hidden: true, onsubmit: (e) => {
      e.preventDefault();
      const r = parseInvite({ title: title.value, at: when.value ? new Date(when.value).getTime() : NaN, slots: slots.value, cost: cost.value }, Date.now());
      if (!r.ok) { error = r.error; paintThread(); return; }
      send(r.value).then((ok) => { if (ok) { f.reset(); f.hidden = true; } });
    } },
      el('label', { for: 'inv-title' }, S('Título')), title, el('label', { for: 'inv-when' }, S('Cuándo')), when,
      el('div', { class: 'row' }, el('div', { class: 'field' }, el('label', { for: 'inv-slots' }, S('Plazas')), slots),
        el('div', { class: 'field' }, el('label', { for: 'inv-cost' }, S('Coste (OD)')), cost)),
      el('button', { type: 'submit', class: 'primary' }, S('Enviar invitación')));
    return f;
  })();
  function composer() {
    return el('div', { class: 'composer' },
      el('div', { class: 'quick' },
        el('button', { type: 'button', onclick: () => { const t = shareText(shared.myRows()); if (t) send({ kind: 'text', text: t }); else { error = S('Aún no tienes personajes con energía.'); paintThread(); } } }, S('Compartir mi energía')),
        el('button', { type: 'button', onclick: () => { inviteForm.hidden = !inviteForm.hidden; } }, S('Invitar a mazmorra'))),
      inviteForm,
      el('form', { class: 'send-row', onsubmit: (e) => { e.preventDefault(); sendText(); } },
        el('label', { class: 'sr-only', for: 'chat-text' }, S('Mensaje')), text,
        el('button', { type: 'submit', class: 'primary', disabled: sending }, S('Enviar'))));
  }
  function sendText() {
    const r = parseMessageText(text.value);
    if (!r.ok) { error = r.error; paintThread(); return; }
    send({ kind: 'text', text: r.value }).then((ok) => { if (ok) { text.value = ''; text.focus(); } });
  }
  async function send(payload) {
    if (sending || !openUid) return false;
    sending = true; error = '';
    if (!draftId) draftId = makeClientId();
    const uid = openUid;
    try {
      const m = await api.send(uid, { ...payload, clientId: draftId });
      draftId = null;
      if (openUid === uid) msgs = mergeMessages(msgs, [m]);
      state.convs = applyIncoming(state.convs, m, me, { profile: profileOf(uid) });
      return true;
    } catch (e) {
      if (e.status === 404) { ended = true; draftId = null; } else error = e.message; // con 0 (sin red) se reintenta con el mismo clientId
      return false;
    } finally { sending = false; shared.changed(); }
  }

  // ---- carga ----
  async function open(uid) {
    openUid = uid; msgs = []; more = false; ended = false; readAt = 0; error = ''; draftId = null;
    paintAll();
    try {
      const page = await api.messages(uid);
      if (openUid !== uid) return;
      msgs = mergeMessages([], page); more = page.length === PAGE;
    } catch (e) {
      if (openUid !== uid) return;
      if (e.status === 404) ended = true; else error = e.message;
    }
    markSeen(uid);
    paintAll();
  }
  async function loadOlder() {
    const uid = openUid;
    if (!uid || !msgs.length) return;
    try {
      const page = await api.messages(uid, msgs[0].at);
      if (openUid !== uid) return;
      msgs = mergeMessages(msgs, page); more = page.length === PAGE;
    } catch (e) { error = e.message; }
    paintThread();
  }
  function markSeen(uid) {
    const c = state.convs.find((x) => x.profile.uid === uid);
    if (!c || !c.unread) return;
    state.convs = markRead(state.convs, uid);
    shared.changed();
    api.markRead(uid).catch(() => { /* se volverá a marcar al abrir */ });
  }

  function paintAll() { paintList(); paintThread(); }

  return {
    render() { paintList(); if (!sending) paintThread(); },
    onTab(id) { active = id === 'chat'; if (active && openUid) markSeen(openUid); },
    open,
    openUid: () => (active ? openUid : null),
    onMessage(m) {
      const uid = otherOf(m, me);
      if (uid !== openUid) return;
      msgs = mergeMessages(msgs, [m]);
      if (m.from !== me && active) api.markRead(uid).catch(() => {});
    },
    onRead(uid) { if (uid === openUid) { readAt = Date.now(); paintThread(); } },
  };
}
