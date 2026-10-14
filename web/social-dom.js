// web/social-dom.js
// Ayudas de DOM para las pantallas sociales (solo web). Todo el texto va por textContent/append (SR-2, SR-43).
// Lo que escribe un usuario lleva translate="no": la traducción en vivo de la página nunca lo reescribe.
import { buildRuneRing, litRunes } from './runes.js';
import { classById } from './classes.js';
import { LOCALE } from './i18n.js';

// Marca un texto de la interfaz (i18n-social.test.js comprueba que está traducido). No hace nada más.
export const S = (s) => s;
export const fmt = (tpl, ...args) => tpl.replace(/\{(\d)\}/g, (_, i) => String(args[Number(i)] ?? ''));

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null && kid !== false) node.append(kid);
  return node;
}

export const userText = (tag, text, props = {}) => el(tag, { ...props, translate: 'no' }, String(text ?? ''));

export function initials(nick) {
  const s = String(nick || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : s.slice(0, 2)).toUpperCase();
}

export const FACTION_LABEL = { elyos: S('Elyos'), asmodian: S('Asmodiano') };

// «Servidor · Facción · Clase»: el servidor es texto de usuario y va aparte.
export function metaNode(p) {
  const cls = classById(p.mainClass);
  const bits = [];
  if (p.server) bits.push(userText('span', p.server));
  if (FACTION_LABEL[p.faction]) bits.push(el('span', {}, FACTION_LABEL[p.faction]));
  if (cls) bits.push(el('span', {}, cls.name));
  const out = el('span', { class: 'meta' });
  bits.forEach((b, i) => { if (i) out.append(' · '); out.append(b); });
  return out;
}

export const avatar = (p, online = false) =>
  el('span', { class: 'avatar' + (online ? ' online' : ''), 'aria-hidden': 'true', translate: 'no' }, initials(p.nick));

export function personHead(p, { online = false } = {}) {
  return el('div', { class: 'person' }, avatar(p, online),
    el('div', { class: 'person-text' },
      userText('b', p.nick || '—', { class: 'nick' }),
      metaNode(p),
      online ? el('span', { class: 'online-text' }, S('En línea')) : null));
}

// Orbe pequeño, siempre plano: relleno por porcentaje y anillo de 56 runas en puntos.
export function miniOrb(row) {
  const wrap = el('span', { class: 'mini-orb' + (row && row.isFull ? ' full' : '') + (row ? '' : ' hidden-energy'), role: 'img',
    'aria-label': row ? fmt(S('{0} de 840 de energía'), row.energy) : S('Energía no compartida') });
  wrap.append(el('span', { class: 'mini-orb-fill', style: `--fill:${row ? row.percent : 0}%` }));
  wrap.append(buildRuneRing(document, row ? litRunes(row.energy) : 0, { size: 44, glyphs: false, full: !!(row && row.isFull) }));
  return wrap;
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export function timeLabel(at) {
  const d = new Date(at), now = new Date();
  return sameDay(d, now)
    ? d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}
export const dateTimeLabel = (at) => new Date(at).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const note = (text, kind = '') => el('p', { class: 'social-note' + (kind ? ' ' + kind : ''), role: kind === 'error' ? 'alert' : 'status' }, text);
