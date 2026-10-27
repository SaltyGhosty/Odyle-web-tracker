// Living Atreia sky: pure motion-budget helpers plus a cheap Canvas 2D renderer.
// The renderer never reads CSS; colours come from the caller's `colors()` callback.

// How much the sky may move: reduced motion or lite mode get one still frame.
export function skyBudget({ width, reduceMotion, lite, hidden }) {
  if (reduceMotion || lite) return { animate: false, motes: 0, fps: 0, scale: 0.5 };
  const b = width < 900 ? { animate: true, motes: 16, fps: 24, scale: 0.35 } : { animate: true, motes: 40, fps: 30, scale: 0.5 };
  if (hidden) b.animate = false;
  return b;
}

// A mote rises at v px/ms; once fully above the top it re-enters from below.
export function stepMote(m, dtMs, height) {
  let y = m.y - m.v * dtMs;
  if (y < -m.r) y = height + m.r;
  return { ...m, y };
}

const TAU = Math.PI * 2;
const PULSE_MS = 1200;
const PARALLAX_PX = 8;
const SPRITE = 256;
// Blob paths: Lissajous periods (ms) and phases, centre and amplitude as viewport fractions.
const BLOBS = [
  { px: 60000, py: 84000, ph: 0.0, cx: 0.28, cy: 0.30, ax: 0.18, ay: 0.12, r: 0.62, a: 0.24 },
  { px: 78000, py: 66000, ph: 2.1, cx: 0.74, cy: 0.42, ax: 0.16, ay: 0.16, r: 0.70, a: 0.18 },
  { px: 90000, py: 72000, ph: 4.2, cx: 0.48, cy: 0.80, ax: 0.22, ay: 0.10, r: 0.58, a: 0.28 },
];

const clamp1 = n => Math.max(-1, Math.min(1, Number(n) || 0));
const easeOut = k => 1 - (1 - k) ** 3;

const NOOP = { start() {}, stop() {}, frame() {}, pulse() {}, parallax() {}, destroy() {} };

export function createSky(canvas, { budget, colors }) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return NOOP;
  const doc = canvas.ownerDocument;
  let W = 0, H = 0, sc = 0.5, fps = 30;
  let motes = [];
  let raf = 0, last = 0, running = false;
  let ring = null; // { x, y, t0 } in canvas px
  let colorKey = '';
  const sprites = [null, null, null];
  let moteColor = '#fff', ringColor = '#fff';

  // Normalise any CSS colour to [r, g, b] through a scratch context.
  const probe = doc.createElement('canvas').getContext('2d');
  function rgb(c) {
    if (!probe) return [255, 255, 255];
    probe.fillStyle = '#000'; probe.fillStyle = c;
    const s = probe.fillStyle;
    if (s[0] === '#') return [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
    return s.match(/[\d.]+/g).slice(0, 3).map(Number);
  }

  // One pre-rendered soft gradient per colour, so frames only call drawImage.
  function syncColors() {
    const cs = colors() || [];
    const key = cs.join('|');
    if (key === colorKey) return;
    colorKey = key;
    for (let i = 0; i < 3; i++) {
      const [r, g, b] = rgb(cs[i] || '#fff');
      const sp = sprites[i] || doc.createElement('canvas');
      sp.width = sp.height = SPRITE;
      const sx = sp.getContext('2d');
      if (!sx) { sprites[i] = null; continue; }
      const h = SPRITE / 2;
      const gr = sx.createRadialGradient(h, h, 0, h, h, h);
      gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
      gr.addColorStop(0.3, `rgba(${r},${g},${b},0.62)`);
      gr.addColorStop(0.62, `rgba(${r},${g},${b},0.2)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      sx.clearRect(0, 0, SPRITE, SPRITE);
      sx.fillStyle = gr;
      sx.fillRect(0, 0, SPRITE, SPRITE);
      sprites[i] = sp;
    }
    moteColor = cs[1] || '#fff';
    ringColor = cs[0] || '#fff';
  }

  function seed(n) {
    motes = [];
    for (let i = 0; i < n; i++) {
      motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.max(0.5, (1 + Math.random() * 1.5) * sc),
        v: H / (28000 + Math.random() * 30000),
        a: 0.12 + Math.random() * 0.23,
      });
    }
  }

  function resize() {
    const b = budget();
    sc = b.scale; fps = b.fps;
    const w = Math.max(1, Math.round(innerWidth * sc));
    const h = Math.max(1, Math.round(innerHeight * sc));
    if (w !== W || h !== H || motes.length !== b.motes) {
      W = w; H = h;
      canvas.width = W; canvas.height = H;
      seed(b.motes);
    }
    return b;
  }

  function draw(now) {
    syncColors();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    // Aether currents: large, faint, slow; screen keeps overlaps luminous without neon clipping.
    ctx.globalCompositeOperation = 'screen';
    const big = Math.max(W, H);
    for (let i = 0; i < 3; i++) {
      const sp = sprites[i]; if (!sp) continue;
      const o = BLOBS[i];
      const x = (o.cx + o.ax * Math.sin(TAU * now / o.px + o.ph)) * W;
      const y = (o.cy + o.ay * Math.sin(TAU * now / o.py + o.ph * 0.7)) * H;
      const r = o.r * big * (1 + 0.04 * Math.sin(TAU * now / (o.px * 0.5)));
      ctx.globalAlpha = o.a;
      ctx.drawImage(sp, x - r, y - r, r * 2, r * 2);
    }
    // Rising motes with a slight sideways sway.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = moteColor;
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      ctx.globalAlpha = Math.min(0.35, m.a);
      ctx.beginPath();
      ctx.arc(m.x + Math.sin(now / 4000 + i) * 3 * sc, m.y, m.r, 0, TAU);
      ctx.fill();
    }
    // Refill pulse ring.
    if (ring) {
      const k = (now - ring.t0) / PULSE_MS;
      if (k >= 1) ring = null;
      else {
        const e = easeOut(Math.max(0, k));
        ctx.globalAlpha = 0.35 * (1 - e);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = Math.max(1, 3 * sc);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, e * 0.6 * Math.min(W, H), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = now - last;
    if (dt < 1000 / fps - 2) return;
    last = now;
    const step = Math.min(dt, 100); // a long stall should not teleport motes
    for (let i = 0; i < motes.length; i++) motes[i] = stepMote(motes[i], step, H);
    draw(now);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function frame() { resize(); draw(performance.now()); }

  function start() {
    const b = resize();
    if (!b.animate || !b.fps) { stop(); draw(performance.now()); return; }
    if (running) return;
    running = true;
    last = performance.now();
    draw(last);
    raf = requestAnimationFrame(tick);
  }

  function onResize() {
    const b = resize();
    if (!running || !b.animate) draw(performance.now()); // resizing clears the canvas
  }
  addEventListener('resize', onResize);

  return {
    start,
    stop,
    frame,
    pulse(xCss, yCss) {
      if (!running) return; // still sky: no motion
      ring = { x: xCss * sc, y: yCss * sc, t0: performance.now() };
    },
    parallax(nx, ny) {
      canvas.style.translate = `${(clamp1(nx) * PARALLAX_PX).toFixed(2)}px ${(clamp1(ny) * PARALLAX_PX).toFixed(2)}px`;
    },
    destroy() {
      stop();
      removeEventListener('resize', onResize);
    },
  };
}
