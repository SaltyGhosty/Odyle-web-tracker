// The drawn orb: a glass sphere of liquid light inside a ring of 56 four-point stars (one per +15 OD).
// Pure SVG built with createElementNS and fixed attribute names (strict CSP / Trusted Types: no innerHTML).
// Colours come from CSS variables and every animation is CSS (see index.html); this module only sets classes
// and attributes. updateStarOrb never recreates nodes and never touches the `ripple` class, so a repaint
// (the page repaints every second for its clocks) cannot restart an animation: only markGain starts the ripple.
import { RUNE_COUNT, litRunes, runePoint } from './runes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW = 104, C = VIEW / 2;
const GLASS_R = 36;                 // glass sphere radius
const RING_R = 46;                  // radius of the star ring
const Y_EMPTY = 91, Y_FULL = 13;    // liquid surface origin: just below the glass / above it with the crests covered
const WAVE_LEN = 36, WAVE_AMP = 2.2;
const n2 = (v) => v.toFixed(2);

export const litStars = (energy) => litRunes(energy);

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

// Four-point star centred on (x, y): outer radius R, inner radius r.
function starPath(x, y, R, r) {
  const pts = [[0, -R], [r, -r], [R, 0], [r, r], [0, R], [-r, r], [-R, 0], [-r, -r]];
  return pts.map(([dx, dy], i) => `${i ? 'L' : 'M'}${n2(x + dx)} ${n2(y + dy)}`).join('') + 'Z';
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

  // Small orbs (friends list) get bigger stars so the ring still reads at 44 px.
  const R = size <= 60 ? 4 : 3.3, r = R * 0.34;
  const ring = mk(doc, 'g', { class: 'so-ring' });
  const stars = [];
  for (let i = 0; i < RUNE_COUNT; i++) {
    const p = runePoint(i, RING_R, C);
    const s = mk(doc, 'path', { class: 'so-star', d: starPath(p.x, p.y, R, r) });
    stars.push(s); ring.append(s);
  }
  svg.append(defs, glass, liquid, rim, shine, ring);
  refs.set(svg, { stars, level, lit: 0, max });
  svg.setAttribute('class', 'star-orb');
  updateStarOrb(svg, { energy, state }, true);
  return svg;
}

// Level and stars follow the energy; state sets full/near. Same nodes, only attributes change.
export function updateStarOrb(svg, { energy = 0, state = 'normal' } = {}, initial = false) {
  const ref = refs.get(svg);
  if (!ref) return svg;
  const f = levelOf(energy, ref.max);
  const y = Y_EMPTY - (Y_EMPTY - Y_FULL) * f;
  ref.level.setAttribute('data-level', levelStr(f));
  ref.level.setAttribute('transform', `translate(0 ${n2(y)})`);

  const lit = litStars(energy);
  if (lit !== ref.lit || initial) {
    const rose = !initial && lit > ref.lit;
    ref.stars.forEach((s, i) => setClass(s, ['so-star', ...(i < lit ? ['lit'] : []), ...(rose && i === lit - 1 ? ['new'] : [])]));
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
