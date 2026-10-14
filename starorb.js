// The drawn orb: a glass sphere of liquid light inside a ring of 56 Atreia runes (one per 1/56 of the cap).
// Pure SVG built with createElementNS and fixed attribute names (strict CSP / Trusted Types: no innerHTML).
// Colours come from CSS variables and every animation is CSS (see index.html); this module only sets classes
// and attributes. updateStarOrb never recreates nodes and never touches the `ripple` class, so a repaint
// (the page repaints every second for its clocks) cannot restart an animation: only markGain starts the ripple.
import { RUNE_COUNT, litRunes, runePoint, runeGlyph } from './runes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW = 104, C = VIEW / 2;
const GLASS_R = 36;                 // glass sphere radius
const RING_R = 46;                  // radius of the rune ring
const RUNE_SCALE = 0.5;             // 10 × 14 grid → 7 units tall on the 104 ring (pitch ~5.2): neighbours do not touch
const TICK_PX = 3;                  // mini orbs: a short radial mark of 3 screen px instead of a rune
const Y_EMPTY = 91, Y_FULL = 13;    // liquid surface origin: just below the glass / above it with the crests covered
const WAVE_LEN = 36, WAVE_AMP = 2.2;
const n2 = (v) => v.toFixed(2);
const num = (v) => String(Number(v.toFixed(2)));

export const litStars = (energy, max) => litRunes(energy, max);

const refs = new WeakMap(); // svg -> { stars, level, lit }

const mk = (doc, tag, attrs = {}) => {
  const n = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const classes = (n) => (n.getAttribute('class') || '').split(/\s+/).filter(Boolean);
const setClass = (n, list) => { const s = list.join(' '); if (n.getAttribute('class') !== s) n.setAttribute('class', s); };
const withClass = (n, c, on) => { const cur = classes(n), has = cur.includes(c); if (on && !has) setClass(n, [...cur, c]); else if (!on && has) setClass(n, cur.filter((x) => x !== c)); };

const levelOf = (energy, max) => {
  const e = Number(energy);
  return Number.isFinite(e) && max > 0 ? Math.max(0, Math.min(1, e / max)) : 0;
};
const levelStr = (f) => String(Number(f.toFixed(4)));

// Gentle wave: 5 periods wide so the surface can slide one period (36) in the ripple and loop seamlessly.
function surfacePath() {
  let d = `M${-WAVE_LEN} 0`;
  for (let x = -WAVE_LEN; x < 4 * WAVE_LEN; x += WAVE_LEN) {
    d += `Q${x + WAVE_LEN / 4} ${-WAVE_AMP * 2} ${x + WAVE_LEN / 2} 0Q${x + WAVE_LEN * 3 / 4} ${WAVE_AMP * 2} ${x + WAVE_LEN} 0`;
  }
  return `${d}V90H${-WAVE_LEN}Z`;
}

export function buildStarOrb(doc, { energy = 0, max = 840, state = 'normal', size = 104, id = 'orb' } = {}) {
  const uid = String(id).replace(/[^A-Za-z0-9_-]/g, '_');
  const svg = mk(doc, 'svg', { viewBox: `0 0 ${VIEW} ${VIEW}`, width: size, height: size, focusable: 'false' });
  const defs = mk(doc, 'defs');
  const grad = mk(doc, 'linearGradient', { id: `so-g-${uid}`, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(mk(doc, 'stop', { offset: '0', class: 'so-top' }), mk(doc, 'stop', { offset: '1', class: 'so-deep' }));
  const clip = mk(doc, 'clipPath', { id: `so-c-${uid}` });
  clip.append(mk(doc, 'circle', { cx: C, cy: C, r: GLASS_R }));
  defs.append(grad, clip);

  const glass = mk(doc, 'circle', { class: 'so-glass', cx: C, cy: C, r: GLASS_R });
  const liquid = mk(doc, 'g', { 'clip-path': `url(#so-c-${uid})` });
  const level = mk(doc, 'g', { class: 'so-level' });
  level.append(mk(doc, 'path', { class: 'so-surface', d: surfacePath(), fill: `url(#so-g-${uid})` }));
  liquid.append(level);
  const rim = mk(doc, 'circle', { class: 'so-rim', cx: C, cy: C, r: GLASS_R });
  const shine = mk(doc, 'path', { class: 'so-shine', d: 'M33 40Q36 30 46 27Q39 31 37 42Z' });

  // Each rune is centred on its ring point with its top pointing outward. Mini orbs (friends list, 44 px) get a short
  // radial tick instead: a rune would be 3 px tall there.
  const ring = mk(doc, 'g', { class: 'so-ring' });
  const stars = [];
  const tick = size <= 60, half = TICK_PX * VIEW / size / 2;
  for (let i = 0; i < RUNE_COUNT; i++) {
    const p = runePoint(i, RING_R, C);
    const deg = num(p.angle * 180 / Math.PI + 90);
    const s = tick
      ? mk(doc, 'path', { class: 'so-rune tick', d: `M${n2(C)} ${n2(C - RING_R - half)}L${n2(C)} ${n2(C - RING_R + half)}`, transform: `rotate(${deg} ${C} ${C})` })
      : mk(doc, 'path', { class: 'so-rune', d: runeGlyph(i).d, transform: `translate(${num(p.x)} ${num(p.y)}) rotate(${deg}) scale(${RUNE_SCALE}) translate(-5 -7)` });
    stars.push(s); ring.append(s);
  }
  svg.append(defs, glass, liquid, rim, shine, ring);
  refs.set(svg, { stars, level, lit: 0, max });
  svg.setAttribute('class', 'star-orb');
  updateStarOrb(svg, { energy, state, max }, true);
  return svg;
}

const base = (n) => classes(n).filter((c) => c === 'so-rune' || c === 'tick');

// Level and runes follow the energy; state sets full/near. Same nodes, only attributes change.
export function updateStarOrb(svg, { energy = 0, state = 'normal', max } = {}, initial = false) {
  const ref = refs.get(svg);
  if (!ref) return svg;
  if (max > 0) ref.max = max; // an account change alters the cap of an existing orb
  const f = levelOf(energy, ref.max);
  const y = Y_EMPTY - (Y_EMPTY - Y_FULL) * f;
  ref.level.setAttribute('data-level', levelStr(f));
  ref.level.setAttribute('transform', `translate(0 ${n2(y)})`);

  const lit = litStars(energy, ref.max);
  if (lit !== ref.lit || initial) {
    const rose = !initial && lit > ref.lit;
    ref.stars.forEach((s, i) => setClass(s, [...base(s), ...(i < lit ? ['lit'] : []), ...(rose && i === lit - 1 ? ['new'] : [])]));
    ref.lit = lit;
    svg.setAttribute('data-lit', String(lit));
  }
  withClass(svg, 'full', state === 'full');
  withClass(svg, 'near', state === 'near');
  return svg;
}

// Starts the one-shot recharge ripple. Idempotent while it plays; the class leaves on animationend.
export function markGain(svg) {
  if (!svg || classes(svg).includes('ripple')) return;
  const ref = refs.get(svg);
  if (ref && !ref.listening) {
    ref.listening = true;
    svg.addEventListener('animationend', (e) => { if (e && e.animationName === 'so-ripple') withClass(svg, 'ripple', false); });
  }
  if (ref) ref.rippleAt = Date.now();
  withClass(svg, 'ripple', true);
}

export const RIPPLE_MS = 900, BEAT_MS = 2400;

// The page rebuilds its cards on every repaint, and re-inserting an SVG restarts its CSS animations. Call this after
// placing the orb: negative delays resume the ripple and the cap pulse where they were (the pulse is phased on the
// wall clock), and a ripple that has run its course (or was missed while the tab was hidden) is cleared.
export function syncOrbMotion(svg, now = Date.now()) {
  const ref = refs.get(svg);
  if (!ref || !svg.style || !svg.style.setProperty) return;
  const elapsed = ref.rippleAt === undefined ? Infinity : now - ref.rippleAt;
  if (elapsed >= RIPPLE_MS) withClass(svg, 'ripple', false);
  svg.style.setProperty('--so-ripple-delay', `${-Math.max(0, Math.min(elapsed, RIPPLE_MS))}ms`);
  svg.style.setProperty('--so-beat-delay', `${-(now % BEAT_MS)}ms`);
}
