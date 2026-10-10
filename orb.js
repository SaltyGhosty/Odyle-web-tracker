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
    vPos = position;
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
    gl_FragColor = vec4(col, 0.92);
  }`;
const SHELL_FS = `
  uniform vec3 uGold; uniform float uGlow;
  varying vec3 vNormal; varying vec3 vView;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.5);
    float spec = pow(max(dot(reflect(-normalize(vView), normalize(vNormal)), normalize(vec3(-0.5, 0.8, 0.6))), 0.0), 40.0);
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
  const orbScene = new THREE.Scene();
  const orbCam = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
  orbCam.position.z = 3.6;
  const liquidU = {
    uFill: { value: 0 }, uTime: { value: 0 }, uRipple: { value: 0 }, uGlow: { value: 0 },
    uColor: { value: new THREE.Color() }, uGold: { value: GOLD },
  };
  const liquid = new THREE.Mesh(new THREE.SphereGeometry(0.9, 64, 48), new THREE.ShaderMaterial({
    vertexShader: LIQUID_VS, fragmentShader: LIQUID_FS, uniforms: liquidU,
    transparent: true, side: THREE.DoubleSide,
  }));
  const shellU = { uGold: { value: GOLD }, uGlow: { value: 0 } };
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.0, 64, 48), new THREE.ShaderMaterial({
    vertexShader: LIQUID_VS, fragmentShader: SHELL_FS, uniforms: shellU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const haloU = { uColor: { value: new THREE.Color() }, uGlow: { value: 0 } };
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), new THREE.ShaderMaterial({
    vertexShader: HALO_VS, fragmentShader: HALO_FS, uniforms: haloU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.position.z = -1.2;
  orbScene.add(halo, liquid, shell);

  let orbs = [];
  const ripples = new Map();
  let raf = 0, running = false;
  const clock = new THREE.Clock();

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
    for (const o of orbs) {
      if (!o.el.isConnected) continue;
      const r = o.el.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
      const bottom = h - r.bottom;
      renderer.setViewport(r.left, bottom, r.width, r.height);
      renderer.setScissor(r.left, bottom, r.width, r.height);
      orbCam.aspect = r.width / r.height; orbCam.updateProjectionMatrix();
      const glow = glowFor(o.state, t);
      const start = ripples.get(o.id);
      const ripple = start === undefined ? 0 : Math.max(0, 1 - (t - start) / 1.2);
      if (start !== undefined && ripple === 0) ripples.delete(o.id);
      liquidU.uFill.value = Math.min(1, Math.max(0, o.percent / 100));
      liquidU.uTime.value = t;
      liquidU.uRipple.value = ripple;
      liquidU.uGlow.value = glow;
      liquidU.uColor.value.set(o.color);
      shellU.uGlow.value = glow + ripple * 0.6;
      haloU.uColor.value.set(o.color).lerp(GOLD, 0.5);
      haloU.uGlow.value = glow + ripple;
      liquid.rotation.y = t * 0.2;
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
    start() { running = true; if (!document.hidden) resume(); },
    stop() { running = false; pause(); },
    dispose() {
      running = false; pause();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
    },
  };
}
