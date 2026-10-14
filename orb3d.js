// The orb in real 3D: a glass sphere with moving liquid inside a tilted, slowly turning ring of 56 Atreia runes.
// ONE WebGL renderer on an offscreen canvas draws each character's scene, then copies it into that orb's own 2D
// <canvas class="orb3d"> in its .orb-slot, so the page keeps its DOM layering and uses a single GL context.
// The SVG orb (starorb.js) stays in the slot: it is the fallback when WebGL is missing or the context is lost.
// Colours are the same CSS tokens the SVG uses. Strict CSP: shaders are plain strings, no HTML sinks.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { RUNE_COUNT, RUNE_GLYPHS, litRunes } from './runes.js';
import { MAX } from './energy.js';

export const RIPPLE_MS = 900, BEAT_MS = 2400, TURN_MS = 48000;
export const RING_R = 1.3;          // ring radius (glass radius 1)
export const RING_TILT = 1.15;      // ~66° between the ring's axis and the view axis: an ellipse in front of and behind the glass
export const RING_ROLL = -0.18;     // a slight slant so the ellipse is not perfectly flat
const VIEW_HALF = 1.5;              // world half-height seen at z = 0: the ring and its runes fit inside the slot
export const ATLAS_COLS = 7, ATLAS_ROWS = 4, ATLAS_CELL = 64;
const ATLAS_SCALE = 3.5;            // rune grid unit → atlas px: the 10 × 14 glyph is 49 px tall in its 64 px cell
const RUNE_SIZE = 0.11;             // quad half-size in world units: a front rune (nearest the camera) is ~7 px tall on a 104 px orb

// ---- Pure helpers (tested in orb3d.test.js) ----
export function levelOf(energy, max = MAX) {
  const e = Number(energy);
  return Number.isFinite(e) && max > 0 ? Math.max(0, Math.min(1, e / max)) : 0;
}
// Ripple strength from 1 (just gained) to 0 (over): depends only on the start time, so a repaint cannot restart it.
export function ripplePower(elapsedMs) {
  if (!(elapsedMs >= 0) || elapsedMs >= RIPPLE_MS) return 0;
  const k = 1 - elapsedMs / RIPPLE_MS;
  return k * k;
}
// Cap beat on the wall clock, like the SVG's so-beat (opacity 1 → .5 → 1 every 2.4 s).
export const beatOpacity = (now) => 0.75 + 0.25 * Math.cos(2 * Math.PI * ((now % BEAT_MS) / BEAT_MS));
export const spinAngle = (now) => 2 * Math.PI * ((now % TURN_MS) / TURN_MS);
// Rune i on the tilted ring, turned by `spin`: index 0 starts at the top of the ring's own circle, clockwise as in the SVG.
export function runePositions(spin = 0, r = RING_R, tilt = RING_TILT, roll = RING_ROLL) {
  const ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
  const out = [];
  for (let i = 0; i < RUNE_COUNT; i++) {
    const a = -Math.PI / 2 + i * (2 * Math.PI / RUNE_COUNT) + spin;
    const x0 = Math.cos(a) * r, y0 = -Math.sin(a) * r;      // flat circle facing the camera (y up)
    const y1 = y0 * ct, z = -y0 * st;                       // tilt around x: the lower half comes forward
    out.push({ x: x0 * cr - y1 * sr, y: x0 * sr + y1 * cr, z });
  }
  return out;
}
// Atlas cell of rune i: the 28 glyphs in a 7 × 4 grid, read left to right, top to bottom.
export function atlasCell(i) {
  const k = ((i % RUNE_GLYPHS.length) + RUNE_GLYPHS.length) % RUNE_GLYPHS.length;
  return { col: k % ATLAS_COLS, row: Math.floor(k / ATLAS_COLS) };
}
// White glyphs on a transparent 448 × 256 canvas; the shader tints them. Path2D(d) needs no HTML sink.
export function buildRuneAtlas(doc = document) {
  const c = doc.createElement('canvas');
  c.width = ATLAS_COLS * ATLAS_CELL; c.height = ATLAS_ROWS * ATLAS_CELL;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineCap = 'square'; g.lineJoin = 'miter';
  RUNE_GLYPHS.forEach((glyph, i) => {
    const { col, row } = atlasCell(i);
    g.save();
    g.translate((col + 0.5) * ATLAS_CELL, (row + 0.5) * ATLAS_CELL);
    g.scale(ATLAS_SCALE, ATLAS_SCALE);
    g.translate(-5, -7);
    g.lineWidth = 1.6;
    g.stroke(new Path2D(glyph.d));
    g.restore();
  });
  return c;
}
// CSS colour token → [r, g, b, a] in 0..1 (#rgb, #rrggbb, rgb()/rgba() with commas or spaces); null if unreadable.
export function parseColor(str) {
  const s = String(str || '').trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(1);
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [m[1], m[2], m[3]].map((v) => Math.min(1, parseFloat(v) / 255)).concat(Math.min(1, a));
}

// ---- Shaders ----
const SPHERE_VS = `
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
  void main() {
    vPos = (modelMatrix * vec4(position, 1.0)).xyz; // world space: the liquid stays level
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const LIQUID_FS = `
  uniform float uFill, uTime, uRipple; uniform vec3 uTop, uDeep;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
  void main() {
    float r = 0.94;
    float wave = 0.035 * sin(vPos.x * 5.0 + uTime * 1.6) + 0.02 * sin(vPos.z * 6.0 - uTime * 1.3);
    wave += uRipple * 0.09 * sin(length(vPos.xz) * 13.0 - uTime * 9.0);
    float level = mix(-r, r, uFill) + wave * step(0.001, uFill) * step(uFill, 0.999);
    if (uFill <= 0.0 || vPos.y > level) discard;
    float depth = clamp((level - vPos.y) / 1.3, 0.0, 1.0);
    vec3 col = mix(uTop, uDeep, depth);
    if (!gl_FrontFacing) { gl_FragColor = vec4(uTop * (0.92 + 0.25 * uRipple), 1.0); return; } // the far wall seen through the cut reads as the surface
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    col = mix(col, uTop, fres * 0.35);
    col += uTop * smoothstep(0.06, 0.0, level - vPos.y) * 0.35; // bright meniscus line
    gl_FragColor = vec4(col, 1.0);
  }`;
const WALL_FS = `
  uniform vec3 uGlass; varying vec3 vNormal;
  void main() { gl_FragColor = vec4(uGlass, 0.86); }`;
const SHELL_FS = `
  uniform vec3 uRim, uShine; uniform float uRimA;
  varying vec3 vNormal; varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal), v = normalize(vView);
    float fres = pow(1.0 - abs(dot(n, v)), 3.0);
    float spec = pow(max(dot(reflect(-v, n), normalize(vec3(-0.55, 0.75, 0.6))), 0.0), 60.0);
    float a = clamp(0.06 + fres * uRimA + spec * 0.85, 0.0, 1.0);
    gl_FragColor = vec4(mix(uRim, uShine, clamp(spec * 1.5, 0.0, 1.0)), a);
  }`;
const RUNE_VS = `
  attribute vec3 aPos; attribute float aIndex;
  uniform float uSize, uSide;
  varying vec2 vUv; varying float vIndex; varying float vDepth;
  void main() {
    vUv = uv; vIndex = aIndex; vDepth = aPos.z;
    vec4 c = modelViewMatrix * vec4(aPos, 1.0);
    gl_Position = projectionMatrix * (c + vec4(position.xy * uSize, 0.0, 0.0)); // billboard: the rune faces the camera, upright
    if (aPos.z * uSide < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);        // drawn in the other pass (behind / in front)
  }`;
const RUNE_FS = `
  uniform sampler2D uAtlas;
  uniform float uLit, uNew, uFlash, uBeat, uFull; uniform vec3 uOn, uOff, uUrgent; uniform float uOffA;
  varying vec2 vUv; varying float vIndex; varying float vDepth;
  void main() {
    float k = mod(vIndex, 28.0);
    vec2 cell = vec2(mod(k, 7.0), floor(k / 7.0));                  // atlasCell(i): column, row from the top
    float ink = texture2D(uAtlas, vec2((cell.x + vUv.x) / 7.0, 1.0 - (cell.y + 1.0 - vUv.y) / 4.0), -0.75).a; // bias: crisper strokes at ~7 px
    float flash = uFlash * step(abs(vIndex - uNew), 0.5);           // the newest rune flares once
    float on = step(vIndex + 0.5, uLit);
    float glow = on * smoothstep(0.8, 0.0, length(vUv - 0.5) * 2.0) * flash;
    float back = smoothstep(0.2, -0.6, vDepth);                     // runes behind the glass are dimmer
    vec3 tone = mix(uOn, uUrgent, uFull);
    vec3 col = mix(uOff, tone, on) + flash * 0.5;
    float a = (ink * mix(uOffA, 1.0, on) + glow * 0.5) * mix(1.0, 0.45, back) * mix(1.0, uBeat, on * uFull);
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;

const v3 = () => new THREE.Vector3();
const setV = (vec, c) => vec.set(c[0], c[1], c[2]);

// Returns null when WebGL is unavailable; otherwise the per-character canvases and their state.
export function createOrbs3D(doc = document) {
  const view = doc.defaultView;
  let renderer;
  try {
    const probe = doc.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;
    renderer = new THREE.WebGLRenderer({ canvas: doc.createElement('canvas'), alpha: true, antialias: true });
  } catch { return null; }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1); // sizes below are already in device pixels

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(2 * Math.atan(VIEW_HALF / 6) * 180 / Math.PI, 1, 0.1, 20);
  cam.position.set(0, 0.9, 5.93); // ~9° above: the liquid surface reads as a disc
  cam.lookAt(0, 0, 0);

  const colors = { top: v3(), deep: v3(), glass: v3(), rim: v3(), shine: v3(), on: v3(), off: v3(), urgent: v3(), offA: 0.26 };
  const liquidU = { uFill: { value: 0 }, uTime: { value: 0 }, uRipple: { value: 0 }, uTop: { value: colors.top }, uDeep: { value: colors.deep } };
  const shellU = { uRim: { value: v3() }, uShine: { value: colors.shine }, uRimA: { value: 0.75 } };
  const atlas = new THREE.CanvasTexture(buildRuneAtlas(doc));
  atlas.colorSpace = THREE.NoColorSpace; atlas.anisotropy = 4;
  const runeU = { uAtlas: { value: atlas }, uSize: { value: RUNE_SIZE }, uLit: { value: 0 }, uNew: { value: -1 }, uFlash: { value: 0 }, uBeat: { value: 1 }, uFull: { value: 0 },
    uOn: { value: colors.on }, uOff: { value: colors.off }, uUrgent: { value: colors.urgent }, uOffA: { value: 0.26 } };

  const sphere = (r, mat, order) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat); m.renderOrder = order; return m; };
  const shader = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: SPHERE_VS, fragmentShader: fs, uniforms, ...extra });
  const liquid = sphere(0.94, shader(LIQUID_FS, liquidU, { side: THREE.DoubleSide }), 0);
  const wall = sphere(1, shader(WALL_FS, { uGlass: { value: colors.glass } }, { side: THREE.BackSide, transparent: true, depthWrite: false }), 2);
  const shell = sphere(1, shader(SHELL_FS, shellU, { transparent: true, depthWrite: false }), 3);

  // Two passes of the same 56 runes: the far half before the glass, the near half after it.
  const runeGeo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(2, 2));
  runeGeo.instanceCount = RUNE_COUNT;
  const runePos = new THREE.InstancedBufferAttribute(new Float32Array(RUNE_COUNT * 3), 3);
  runeGeo.setAttribute('aPos', runePos);
  runeGeo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(Float32Array.from({ length: RUNE_COUNT }, (_, i) => i), 1));
  const runePass = (side, order) => {
    const m = new THREE.Mesh(runeGeo, new THREE.ShaderMaterial({ vertexShader: RUNE_VS, fragmentShader: RUNE_FS,
      uniforms: { ...runeU, uSide: { value: side } }, transparent: true, depthWrite: false }));
    m.frustumCulled = false; m.renderOrder = order;
    return m;
  };
  scene.add(liquid, runePass(-1, 1), wall, shell, runePass(1, 4));

  function readColors() {
    const cs = view.getComputedStyle(doc.documentElement);
    const get = (name, fallback) => parseColor(cs.getPropertyValue(name)) || fallback;
    setV(colors.top, get('--orb-liquid-top', [0.95, 0.78, 0.49]));
    setV(colors.deep, get('--orb-liquid-deep', [0.36, 0.55, 0.76]));
    setV(colors.glass, get('--orb-glass', [0.09, 0.13, 0.23]));
    setV(colors.rim, get('--sky', [0.61, 0.76, 0.9]));
    setV(colors.shine, get('--fg', [0.96, 0.91, 0.78]));
    setV(colors.on, get('--orb-ring', [0.89, 0.66, 0.33]));
    setV(colors.urgent, get('--urgent', [0.82, 0.27, 0.23]));
    const off = get('--orb-ring-off', [0.96, 0.91, 0.78, 0.26]);
    setV(colors.off, off); runeU.uOffA.value = off[3];
    version++;
  }

  const orbs = new Map(); // id -> { canvas, energy, state, lit, newIdx, rippleAt, key }
  const visible = new Set();
  let version = 0, raf = 0, ok = true;
  const reduce = view.matchMedia('(prefers-reduced-motion: reduce)');
  const moving = () => !reduce.matches && !doc.body.classList.contains('calm');

  const io = new view.IntersectionObserver((entries) => {
    for (const e of entries) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); }
    kick();
  });

  function draw(o, now, motion) {
    const slot = o.canvas.parentElement;
    const css = slot ? slot.clientWidth : 0;
    if (!css) return;
    const px = Math.round(css * Math.min(view.devicePixelRatio || 1, 2));
    const t = motion ? now / 1000 : 0;
    const ripple = motion ? ripplePower(now - (o.rippleAt ?? -Infinity)) : 0;
    const full = o.state === 'full';
    const beat = motion && full ? beatOpacity(now) : 1;
    const fill = levelOf(o.energy, o.max);
    const key = `${px}|${fill}|${o.lit}|${o.state}|${version}`;
    if (!motion && key === o.key) return; // calm: only redraw when something changed
    o.key = key;
    if (o.canvas.width !== px) { o.canvas.width = px; o.canvas.height = px; }
    if (renderer.domElement.width !== px) renderer.setSize(px, px, false);

    const pos = runePositions(motion ? spinAngle(now) : 0);
    pos.forEach((p, i) => runePos.setXYZ(i, p.x, p.y, p.z));
    runePos.needsUpdate = true;
    liquidU.uFill.value = fill; liquidU.uTime.value = t; liquidU.uRipple.value = ripple;
    shellU.uRim.value.copy(full ? colors.urgent : colors.rim);
    runeU.uLit.value = o.lit; runeU.uFull.value = full ? 1 : 0; runeU.uBeat.value = beat;
    runeU.uNew.value = o.newIdx; runeU.uFlash.value = ripple;

    renderer.render(scene, cam);
    const g = o.canvas.getContext('2d');
    g.clearRect(0, 0, px, px);
    g.drawImage(renderer.domElement, 0, 0);
  }

  function frame() {
    raf = 0;
    if (!ok || doc.hidden) return;
    const now = Date.now(), motion = moving();
    for (const o of orbs.values()) if (visible.has(o.canvas) && o.canvas.isConnected) draw(o, now, motion);
    if (motion && visible.size) raf = view.requestAnimationFrame(frame);
  }
  function kick() { if (!raf && ok) raf = view.requestAnimationFrame(frame); }

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ok = false;
    // Back to the SVG orb: drop the 3D canvases and the class that hid the SVG.
    for (const o of orbs.values()) { o.canvas.parentElement?.classList.remove('has-3d'); o.canvas.remove(); }
  });
  doc.addEventListener('visibilitychange', kick);
  reduce.addEventListener?.('change', kick);
  new view.MutationObserver(() => { readColors(); kick(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-faction'] });
  readColors();

  return {
    get ok() { return ok; },
    // The orb's canvas, created once per character so a repaint re-inserts the same node.
    canvas(id) {
      let o = orbs.get(id);
      if (!o) {
        const c = doc.createElement('canvas');
        c.className = 'orb3d';
        c.setAttribute('aria-hidden', 'true');
        o = { canvas: c, energy: 0, max: MAX, state: 'normal', lit: -1, newIdx: -1, rippleAt: undefined, key: '' };
        orbs.set(id, o);
        io.observe(c);
      }
      return o.canvas;
    },
    update(id, { energy = 0, state = 'normal', max = MAX } = {}) {
      const o = orbs.get(id);
      if (!o) return;
      const lit = litRunes(energy, max);
      if (o.lit >= 0 && lit > o.lit) o.newIdx = lit - 1;
      o.lit = lit; o.energy = energy; o.state = state; o.max = max;
      kick();
    },
    // One ripple on the liquid; idempotent while it plays.
    gain(id) {
      const o = orbs.get(id), now = Date.now();
      if (o && !(now - o.rippleAt < RIPPLE_MS)) { o.rippleAt = now; kick(); }
    },
    drop(id) { const o = orbs.get(id); if (o) { io.unobserve(o.canvas); visible.delete(o.canvas); orbs.delete(id); } },
  };
}
