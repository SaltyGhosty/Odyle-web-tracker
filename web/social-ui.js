// web/social-ui.js
// Amigos, chat y búsqueda (solo web). Guarda el estado compartido y el canal en vivo; cada pantalla
// (social-friends, social-search, social-chat, social-profile) pinta en su panel. Lo arranca app.js.
import { el, S } from './social-dom.js';
import { createProfileSheet } from './social-profile.js';
import { createFriends } from './social-friends.js';
import { sortFriends, applyIncoming, totalUnread, otherOf } from './social.js';

export function startSocial(ctx) {
  const { api, me, setBadge } = ctx;
  const state = { friends: [], incoming: [], outgoing: [], blocked: [], convs: [], live: true };
  const screens = {};
  const statusEl = el('p', { class: 'live-status', role: 'status', hidden: true }, S('Reconectando…'));
  document.body.append(statusEl);

  const shared = {
    ...ctx, state,
    register(name, screen) { screens[name] = screen; screen.render(); },
    openProfile: (uid) => { if (screens.profile) screens.profile.open(uid); },
    openChat: (uid) => { ctx.goTab('chat'); if (screens.chat) screens.chat.open(uid); },
    refreshFriends, refreshConvs,
    changed() { for (const s of Object.values(screens)) s.render(); badges(); },
  };

  async function refreshFriends() {
    try {
      const [f, blocked] = await Promise.all([api.friends(), api.blocks()]);
      state.friends = sortFriends(f.friends || []);
      state.incoming = f.incoming || [];
      state.outgoing = f.outgoing || [];
      state.blocked = blocked;
    } catch { /* se queda con lo último que había */ }
    shared.changed();
  }
  async function refreshConvs() {
    try { state.convs = await api.conversations(); } catch { /* idem */ }
    shared.changed();
  }
  function badges() {
    setBadge('amigos', state.incoming.length);
    setBadge('chat', totalUnread(state.convs));
  }

  function onEvent(type, data) {
    if (type === 'message') {
      const uid = otherOf(data, me);
      const friend = state.friends.find((f) => f.uid === uid) || null;
      const openUid = screens.chat && screens.chat.openUid ? screens.chat.openUid() : null;
      state.convs = applyIncoming(state.convs, data, me, { profile: friend, openUid });
      if (screens.chat && screens.chat.onMessage) screens.chat.onMessage(data);
      shared.changed();
    } else if (type === 'read') {
      if (screens.chat && screens.chat.onRead) screens.chat.onRead(data.uid);
    } else if (type === 'friend') {
      refreshFriends();
      refreshConvs();
    } else if (type === 'presence') {
      state.friends = sortFriends(state.friends.map((f) => (f.uid === data.uid ? { ...f, online: !!data.online } : f)));
      shared.changed();
    }
  }

  const disconnect = api.connect({
    onEvent,
    onStatus(s, info) {
      state.live = s === 'live';
      statusEl.hidden = state.live;
      // Al volver tras un corte: lo que llegó mientras tanto.
      if (state.live && info && info.resumed) { refreshFriends(); refreshConvs(); }
    },
  });

  refreshFriends();
  refreshConvs();

  shared.register('profile', createProfileSheet(shared));
  shared.register('friends', createFriends(shared, ctx.panels.amigos));

  return {
    shared,
    onTab(id) {
      if (id === 'amigos') refreshFriends();
      if (id === 'chat') refreshConvs();
      for (const s of Object.values(screens)) if (s.onTab) s.onTab(id);
    },
    stop() { disconnect(); statusEl.remove(); },
  };
}
