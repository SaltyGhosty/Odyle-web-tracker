// One WebGL canvas behind the page: ether particles full screen, plus one Odyle orb
// drawn inside each card's slot (scissor/viewport per slot, a single GL context).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const GOLD = new THREE.Color('#e8b85a');
const SKY = new THREE.Color('#7cc8ff');

const PARTICLE_VS = `
  attribute float seed;
  attribute vec3 tint;
  uniform float uTime, uPixelRatio;
  varying vec3 vTint; varying float vFade;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + uTime * (0.15 + seed * 0.25) + 8.0, 16.0) - 8.0;
    p.x += sin(uTime * 0.3 + seed * 6.2831) * 0.4;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.5 + seed * 3.0) * uPixelRatio * (12.0 / -mv.z);
    vTint = tint;
    vFade = 0.35 + 0.65 * abs(sin(uTime * (0.5 + seed) + seed * 10.0));
  }`;
const PARTICLE_FS = `
  varying vec3 vTint; varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vTint, a * vFade * 0.8);
  }`;

const LIQUID_VS = `
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
  void main() {
    vPos = (modelMatrix * vec4(position, 1.0)).xyz; // world space: liquid stays level when the orb tilts
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const LIQUID_FS = `
  uniform float uFill, uTime, uRipple, uGlow;
  uniform vec3 uColor, uGold;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
  void main() {
    float r = 0.9;
    float wave = 0.045 * sin(vPos.x * 6.0 + uTime * 2.0) + 0.03 * sin(vPos.z * 5.0 - uTime * 1.7);
    wave += uRipple * 0.12 * sin(length(vPos.xz) * 14.0 - uTime * 10.0);
    float level = mix(-r, r, uFill) + wave * (uFill > 0.0 && uFill < 1.0 ? 1.0 : 0.0);
    if (vPos.y > level) discard;
    float depth = clamp((level - vPos.y) / (2.0 * r), 0.0, 1.0);
    vec3 base = mix(uColor, uGold, 0.35);
    vec3 col = mix(base * 1.25, base * 0.45, depth);
    float surface = smoothstep(0.08, 0.0, level - vPos.y);
    col += uGold * surface * 0.9;
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    col += base * fres * 0.6;
    col *= 0.8 + uGlow * 0.25;
    gl_FragColor = vec4(col, 1.0);
  }`;
const SHELL_FS = `
  uniform vec3 uGold; uniform float uGlow; uniform vec3 uLightDir;
  varying vec3 vNormal; varying vec3 vView;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.5);
    float spec = pow(max(dot(reflect(-normalize(vView), normalize(vNormal)), normalize(uLightDir)), 0.0), 40.0);
    gl_FragColor = vec4(uGold * (fres * (0.8 + uGlow) + spec * 1.2), fres * 0.9 + spec);
  }`;
const HALO_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const HALO_FS = `
  uniform vec3 uColor; uniform float uGlow; varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.55, d) * uGlow * 0.55;
    gl_FragColor = vec4(uColor, a);
  }`;

const RUNE_VS = `
  attribute float aIndex;
  varying vec2 vUv; varying float vIndex;
  void main() {
    vUv = uv; vIndex = aIndex;
    vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    gl_Position = projectionMatrix * (center + vec4(position.xy, 0.0, 0.0)); // billboard
  }`;
const RUNE_FS = `
  uniform sampler2D uAtlas; uniform float uLit, uFull, uFade, uTime; uniform vec3 uGold;
  varying vec2 vUv; varying float vIndex;
  void main() {
    float glyph = texture2D(uAtlas, vec2((vIndex + vUv.x) / 12.0, vUv.y)).a;
    float on = max(uFull, step(vIndex + 0.5, uLit));
    float newest = (1.0 - uFull) * step(uLit - 0.5, vIndex) * step(vIndex, uLit - 0.5);
    float flicker = 0.85 + 0.15 * sin(uTime * 3.0 + vIndex * 1.7);
    float glow = smoothstep(0.5, 0.0, length(vUv - 0.5)) * on * 0.35;
    vec3 col = uGold * (on * (1.25 + newest * 0.6) * flicker + (1.0 - on) * 0.22);
    float a = (glyph * (on * 0.95 + (1.0 - on) * 0.35) + glow) * uFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;
const BURST_VS = `
  attribute vec3 aStart; attribute float aSeed;
  uniform float uT, uPixelRatio;
  varying float vA;
  void main() {
    float k = clamp(uT, 0.0, 1.0);
    float e = k * k * (3.0 - 2.0 * k);
    vec3 p = mix(aStart, aStart * 0.05, e) + vec3(0.0, sin(k * 3.14159) * 0.25 * aSeed, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (3.0 + aSeed * 4.0) * uPixelRatio * (1.0 - 0.5 * k);
    vA = sin(k * 3.14159) * step(0.0001, uT) * step(uT, 0.9999);
  }`;
const BURST_FS = `
  uniform vec3 uGold; varying float vA;
  void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uGold * 1.4, smoothstep(0.5, 0.0, d) * vA); }`;

// 12 original rune glyphs drawn as gold strokes into one atlas row (64 px per glyph).
function runeAtlas() {
  const c = document.createElement('canvas'); c.width = 64 * 12; c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  const strokes = [
    [[32,10,32,54],[32,20,46,30]], [[24,10,24,54],[24,14,42,26],[24,30,42,42]], [[32,10,32,54],[18,24,46,24]],
    [[20,54,32,10],[32,10,44,54],[24,38,40,38]], [[22,10,22,54],[22,32,42,14],[22,32,42,54]], [[32,10,32,54],[18,18,46,46]],
    [[18,32,32,12],[32,12,46,32],[46,32,32,52],[32,52,18,32]], [[24,10,24,54],[40,10,40,54],[24,32,40,32]],
    [[32,10,32,54],[20,20,32,32],[44,20,32,32]], [[20,12,44,52],[44,12,20,52]], [[32,10,32,54],[32,40,46,52],[32,40,18,52]],
    [[22,12,42,12],[42,12,22,52],[22,52,42,52]],
  ];
  strokes.forEach((lines, i) => {
    g.beginPath();
    for (const [x1, y1, x2, y2] of lines) { g.moveTo(i * 64 + x1, y1); g.lineTo(i * 64 + x2, y2); }
    g.stroke();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
}

export function createScene(canvas, { particles = 300 } = {}) {
  if (!hasWebGL()) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch { return null; }
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  // ---- Ether particles ----
  const bgScene = new THREE.Scene();
  const bgCam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  bgCam.position.z = 10;
  const pos = new Float32Array(particles * 3), seed = new Float32Array(particles), tint = new Float32Array(particles * 3);
  for (let i = 0; i < particles; i++) {
    pos.set([(Math.random() - 0.5) * 24, (Math.random() - 0.5) * 16, Math.random() * 10 - 6], i * 3);
    seed[i] = Math.random();
    const c = Math.random() < 0.6 ? SKY : GOLD;
    tint.set([c.r, c.g, c.b], i * 3);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  pGeo.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  const pMat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  bgScene.add(new THREE.Points(pGeo, pMat));

  // ---- Orb (one set of meshes, re-drawn per slot with its own uniforms) ----
  // orbGroup tilts toward the pointer; it holds the liquid, the glass and the rune ring.
  const orbScene = new THREE.Scene();
  const orbCam = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  orbCam.position.z = 4.6;
  const orbGroup = new THREE.Group();
  const liquidU = {
    uFill: { value: 0 }, uTime: { value: 0 }, uRipple: { value: 0 }, uGlow: { value: 0 },
    uColor: { value: new THREE.Color() }, uGold: { value: GOLD },
  };
  const liquid = new THREE.Mesh(new THREE.SphereGeometry(0.9, 64, 48), new THREE.ShaderMaterial({
    vertexShader: LIQUID_VS, fragmentShader: LIQUID_FS, uniforms: liquidU,
    side: THREE.DoubleSide,
  }));
  const shellU = { uGold: { value: GOLD }, uGlow: { value: 0 }, uLightDir: { value: new THREE.Vector3(-0.5, 0.8, 0.6) } };
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.0, 64, 48), new THREE.ShaderMaterial({
    vertexShader: LIQUID_VS, fragmentShader: SHELL_FS, uniforms: shellU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const haloU = { uColor: { value: new THREE.Color() }, uGlow: { value: 0 } };
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.ShaderMaterial({
    vertexShader: HALO_VS, fragmentShader: HALO_FS, uniforms: haloU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.position.z = -1.2;

  // Rune ring: 12 billboards on a tilted, slowly spinning circle (radius 1.3).
  const RING_R = 1.3;
  const runeU = { uAtlas: { value: runeAtlas() }, uLit: { value: 0 }, uFull: { value: 0 }, uFade: { value: 1 }, uTime: { value: 0 }, uGold: { value: GOLD } };
  const runes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.ShaderMaterial({
    vertexShader: RUNE_VS, fragmentShader: RUNE_FS, uniforms: runeU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), 12);
  const idx = new Float32Array(12);
  const m = new THREE.Matrix4();
  const runeAngle = i => -Math.PI / 2 + i * (Math.PI * 2 / 12);
  for (let i = 0; i < 12; i++) {
    idx[i] = i;
    m.makeTranslation(Math.cos(runeAngle(i)) * RING_R, 0, Math.sin(runeAngle(i)) * RING_R);
    runes.setMatrixAt(i, m);
  }
  runes.geometry.setAttribute('aIndex', new THREE.InstancedBufferAttribute(idx, 1));
  // Burst: 8 sparks per rune flying into the orb.
  const sparks = 96, start = new Float32Array(sparks * 3), sseed = new Float32Array(sparks);
  for (let i = 0; i < sparks; i++) {
    const a = runeAngle(i % 12) + (Math.random() - 0.5) * 0.3;
    const r = RING_R + (Math.random() - 0.5) * 0.15;
    start.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.15, Math.sin(a) * r], i * 3);
    sseed[i] = Math.random();
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sparks * 3), 3));
  bGeo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  bGeo.setAttribute('aSeed', new THREE.BufferAttribute(sseed, 1));
  const burstU = { uT: { value: 0 }, uPixelRatio: { value: pixelRatio }, uGold: { value: GOLD } };
  const burst = new THREE.Points(bGeo, new THREE.ShaderMaterial({
    vertexShader: BURST_VS, fragmentShader: BURST_FS, uniforms: burstU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  burst.frustumCulled = false;
  const ringTilt = new THREE.Group(); ringTilt.rotation.set(0.95, 0, 0.22);
  const ringSpin = new THREE.Group(); ringSpin.add(runes, burst);
  ringTilt.add(ringSpin);
  orbGroup.add(liquid, shell, ringTilt);
  orbScene.add(halo, orbGroup);

  let orbs = [];
  const ripples = new Map();
  const tilts = new Map();
  let raf = 0, running = false;
  const clock = new THREE.Clock();

  // Tilt input: pointer position (desktop) or device orientation (phone, once enabled).
  const pointer = { x: null, y: null };
  let orientation = null;
  const onPointer = e => { pointer.x = e.clientX; pointer.y = e.clientY; };
  const onOrientation = e => { if (e.beta != null && e.gamma != null) orientation = { beta: e.beta, gamma: e.gamma }; };
  window.addEventListener('pointermove', onPointer, { passive: true });
  const MAX_TILT = 0.35;
  const clampT = v => Math.max(-MAX_TILT, Math.min(MAX_TILT, v));
  function targetTilt(r) {
    if (orientation) return { x: clampT((orientation.beta - 45) / 45 * MAX_TILT), y: clampT(orientation.gamma / 45 * MAX_TILT) };
    if (pointer.x === null) return { x: 0, y: 0 };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return { x: clampT((pointer.y - cy) / (innerHeight / 2) * MAX_TILT), y: clampT((pointer.x - cx) / (innerWidth / 2) * MAX_TILT) };
  }

  function glowFor(state, t) {
    if (state === 'full') return 1.0;
    if (state === 'near') return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4));
    return 0.3;
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * pixelRatio) || canvas.height !== Math.floor(h * pixelRatio)) {
      renderer.setSize(w, h, false);
      bgCam.aspect = w / h; bgCam.updateProjectionMatrix();
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    pMat.uniforms.uTime.value = t;
    renderer.render(bgScene, bgCam);

    renderer.setScissorTest(true);
    ringSpin.rotation.y = t * 0.25;
    for (const o of orbs) {
      if (!o.el || !o.el.isConnected) continue;
      const r = o.el.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
      const bottom = h - r.bottom;
      renderer.setViewport(r.left, bottom, r.width, r.height);
      renderer.setScissor(r.left, bottom, r.width, r.height);
      orbCam.aspect = r.width / r.height; orbCam.updateProjectionMatrix();

      const goal = targetTilt(r);
      const cur = tilts.get(o.id) || { x: 0, y: 0 };
      cur.x += (goal.x - cur.x) * 0.08; cur.y += (goal.y - cur.y) * 0.08;
      tilts.set(o.id, cur);
      orbGroup.rotation.set(cur.x, cur.y, 0);
      shellU.uLightDir.value.set(-0.5 - cur.y * 1.5, 0.8 + cur.x * 1.5, 0.6);

      const glow = glowFor(o.state, t);
      const began = ripples.get(o.id);
      const since = began === undefined ? Infinity : t - began;
      const ripple = Math.max(0, 1 - since / 1.2);
      if (began !== undefined && since > 1.6) ripples.delete(o.id);
      liquidU.uFill.value = Math.min(1, Math.max(0, o.percent / 100));
      liquidU.uTime.value = t;
      liquidU.uRipple.value = ripple;
      liquidU.uGlow.value = glow;
      liquidU.uColor.value.set(o.color);
      shellU.uGlow.value = glow + ripple * 0.6;
      haloU.uColor.value.set(o.color).lerp(GOLD, 0.5);
      haloU.uGlow.value = glow + ripple;
      liquid.rotation.y = t * 0.2;
      runeU.uTime.value = t;
      runeU.uFull.value = o.state === 'full' ? 1 : 0;
      runeU.uLit.value = o.tick == null ? 0 : Math.min(12, Math.max(0, Math.floor(o.tick * 12)));
      // During a burst the old runes fade out and sparks fly in; the ring refills from zero.
      burstU.uT.value = since < 0.9 ? since / 0.9 : 0;
      runeU.uFade.value = since < 0.9 ? 0.3 + 0.7 * (since / 0.9) : 1;
      renderer.render(orbScene, orbCam);
    }
  }

  const onVisibility = () => { if (document.hidden) pause(); else if (running) resume(); };
  function resume() { if (!raf) { clock.getDelta(); frame(); } }
  function pause() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', onVisibility);

  return {
    setOrbs(list) { orbs = list.slice(); },
    ripple(id) { ripples.set(id, clock.getElapsedTime()); },
    async enableOrientation() {
      try {
        const D = window.DeviceOrientationEvent;
        if (!D) return false;
        if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') return false;
        window.addEventListener('deviceorientation', onOrientation);
        return true;
      } catch { return false; }
    },
    start() { running = true; if (!document.hidden) resume(); },
    stop() { running = false; pause(); },
    dispose() {
      running = false; pause();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('deviceorientation', onOrientation);
      renderer.dispose();
    },
  };
}
