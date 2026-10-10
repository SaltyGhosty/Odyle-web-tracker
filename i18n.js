// Languages: the page is written in Spanish; other languages are applied by translating rendered
// text (text nodes and placeholder/aria-label/title) through STRINGS. Templates use numbered
// placeholders, e.g. "Gastaste {0} en {1}". The language can change live: each node remembers its
// Spanish original, so switching re-translates from Spanish without reloading the page.
import { STRINGS } from './i18n-strings.js';

export const LANGS = { es: 'Español', en: 'English', it: 'Italiano', pt: 'Português' };

function detect() {
  try { const s = localStorage.getItem('odyle-lang'); if (LANGS[s]) return s; } catch {}
  const n = (navigator.language || 'es').slice(0, 2).toLowerCase();
  return LANGS[n] ? n : 'en';
}
export let LANG = detect();
export let LOCALE = LANG;

let dict = null, patterns = [];
const cache = new Map();
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function load(code) {
  dict = code === 'es' ? null : (STRINGS[code] || {});
  cache.clear();
  patterns = dict ? Object.entries(dict).filter(([k]) => /\{\d\}/.test(k)).map(([k, v]) => {
    const order = [];
    const re = new RegExp('^' + k.split(/(\{\d\})/).map(part => {
      const m = part.match(/^\{(\d)\}$/);
      if (m) { order.push(m[1]); return '(.+?)'; }
      return escapeRe(part);
    }).join('') + '$', 's');
    return { re, order, v };
  }).sort((a, b) => b.re.source.length - a.re.source.length) : [];
}
load(LANG);

export function tr(text) {
  if (!dict || typeof text !== 'string') return text;
  const key = text.trim();
  if (!key) return text;
  let out = cache.get(key);
  if (out === undefined) {
    out = dict[key];
    if (out === undefined) {
      for (const p of patterns) {
        const m = key.match(p.re);
        if (m) { out = p.v.replace(/\{(\d)\}/g, (_, d) => { const i = p.order.indexOf(d); return i >= 0 ? tr(m[i + 1]) : ''; }); break; }
      }
    }
    if (out === undefined) out = key;
    if (cache.size > 3000) cache.clear(); // clocks produce new strings every second
    cache.set(key, out);
  }
  return out === key ? text : text.replace(key, () => out);
}

// Spanish originals and the last value we wrote, per text node / per attribute.
const origText = new WeakMap(), setText = new WeakMap();
const origAttr = new WeakMap(), setAttr = new WeakMap();
const ATTRS = ['placeholder', 'aria-label', 'title'];
function translateText(n) {
  if (setText.get(n) !== n.nodeValue) origText.set(n, n.nodeValue); // the page wrote new Spanish text
  const t = tr(origText.get(n));
  setText.set(n, t);
  if (t !== n.nodeValue) n.nodeValue = t;
}
function translateAttrs(n) {
  let o = origAttr.get(n), w = setAttr.get(n);
  if (!o) { o = {}; w = {}; origAttr.set(n, o); setAttr.set(n, w); }
  for (const a of ATTRS) {
    const v = n.getAttribute(a);
    if (v === null) continue;
    if (w[a] !== v) o[a] = v;
    const t = tr(o[a]);
    w[a] = t;
    if (t !== v) n.setAttribute(a, t);
  }
}
function translateNode(n) {
  if (n.nodeType === 3) return translateText(n);
  if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'TEXTAREA') return;
  translateAttrs(n);
  for (const c of n.childNodes) translateNode(c);
}

let started = false, origTitle = '';
const listeners = [];
export function onLangChange(fn) { listeners.push(fn); }

export function setLang(code) {
  if (!LANGS[code] || code === LANG) return;
  try { localStorage.setItem('odyle-lang', code); } catch {}
  LANG = code; LOCALE = code;
  load(code);
  document.documentElement.lang = code;
  if (started) { document.title = tr(origTitle); translateNode(document.body); }
  for (const fn of listeners) fn(code);
}

export function startI18n() {
  started = true;
  document.documentElement.lang = LANG;
  origTitle = document.title;
  document.title = tr(origTitle);
  translateNode(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode);
      else if (m.type === 'characterData') translateText(m.target);
      else translateAttrs(m.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
