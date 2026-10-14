// Dev only: renders the Atreia rune specimen sheets for review (never shipped).
// Usage (from the repo root): node dev/rune-sheet.mjs   (npm i --no-save playwright if missing)
// Writes .impeccable/review/runas-muestra.png and .impeccable/review/runas-anillo.png.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadChromium } from './pw.mjs';
import { RUNE_GLYPHS, RUNE_COUNT, runeGlyph, runePoint } from '../runes.js';

const OUT = fileURLToPath(new URL('../.impeccable/review/', import.meta.url));
mkdirSync(OUT, { recursive: true });

// Luz values from the brief; Sombra values from index.html (:root[data-faction="asmodian"]).
const THEMES = [
  { id: 'Luz', bg: '#2F3B55', panel: '#1F2840', glass: '#18203A', fg: '#F4E7C8', muted: '#B9C2D6', lit: '#E3A853', unlit: 'rgba(244,231,200,.28)' },
  { id: 'Sombra', bg: '#1B1530', panel: '#120E22', glass: '#0D0A19', fg: '#ECE8F6', muted: '#B9B3D0', lit: '#A58CE8', unlit: 'rgba(236,232,246,.24)' },
];
const STROKE = 1.5; // grid units; same width for every rune, square caps
const ring = [];
for (let i = 0; i < RUNE_COUNT; i++) {
  const { x, y, angle } = runePoint(i, 46, 52);
  ring.push({ x, y, deg: angle * 180 / Math.PI + 90, d: runeGlyph(i).d });
}
const LIT = Math.round(RUNE_COUNT * 0.3);

function build({ themes, glyphs, ring, lit, stroke, mode }) {
  const NS = 'http://www.w3.org/2000/svg';
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) k === 'style' ? (e.style.cssText = v) : e.setAttribute(k, v);
    e.append(...kids); return e;
  };
  const s = (tag, attrs = {}) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const glyphSvg = (d, px, color) => {
    const svg = s('svg', { viewBox: '0 0 10 14', width: px * 10 / 14, height: px, style: 'display:block;overflow:visible' });
    svg.append(s('path', { d, fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'square', 'stroke-linejoin': 'miter' }));
    return svg;
  };
  // Exact 1x pixels of an 8 px row, then shown enlarged with nearest-neighbour so the review sees what the screen gets.
  const pixelRow = (color, px, zoom) => {
    const w = glyphs.length * (px * 10 / 14 + 3) + 3;
    const c = h('canvas', { width: Math.ceil(w), height: px + 4, style: `width:${Math.ceil(w) * zoom}px;height:${(px + 4) * zoom}px;image-rendering:pixelated;display:block` });
    const g = c.getContext('2d');
    glyphs.forEach((gl, i) => {
      g.save(); g.translate(3 + i * (px * 10 / 14 + 3), 2); g.scale(px / 14, px / 14);
      g.strokeStyle = color; g.lineWidth = stroke; g.lineCap = 'square'; g.lineJoin = 'miter';
      g.stroke(new Path2D(gl.d)); g.restore();
    });
    return c;
  };
  document.body.style.cssText = 'margin:0;font-family:Georgia,serif;display:flex;gap:0';
  for (const t of themes) {
    const col = h('section', { style: `background:${t.bg};color:${t.fg};padding:24px 28px;display:flex;flex-direction:column;gap:16px` });
    col.append(h('h1', { style: 'margin:0;font-size:20px;font-weight:400;letter-spacing:.04em' }, `Runas de Atreia · ${t.id}`));
    if (mode === 'sheet') {
      const grid = h('div', { style: `display:grid;grid-template-columns:repeat(7,72px);gap:10px 8px;align-self:flex-start;background:${t.panel};padding:16px;border-radius:12px` });
      glyphs.forEach((gl, i) => {
        const cell = h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:6px' }, glyphSvg(gl.d, 64, t.lit),
          h('span', { style: `font:12px system-ui,sans-serif;color:${t.muted}` }, `${i + 1} ${gl.name}`));
        grid.append(cell);
      });
      col.append(grid);
      const row = (label, color) => {
        const r = h('div', { style: 'display:flex;gap:3px;align-items:center' });
        glyphs.forEach(gl => r.append(glyphSvg(gl.d, 8, color)));
        return h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
          h('span', { style: `font:12px system-ui,sans-serif;color:${t.muted}` }, label), r);
      };
      col.append(row('8 px, encendidas', t.lit), row('8 px, apagadas', t.unlit));
      col.append(h('span', { style: `font:12px system-ui,sans-serif;color:${t.muted}` }, '8 px a 1x, ampliado ×5 sin suavizar'),
        pixelRow(t.lit, 8, 5));
    } else {
      const wrap = h('div', { style: 'display:flex;gap:28px;align-items:center' });
      for (const size of [104, 312]) {
        const svg = s('svg', { viewBox: '0 0 104 104', width: size, height: size });
        svg.append(s('circle', { cx: 52, cy: 52, r: 40, fill: t.glass }));
        ring.forEach((r, i) => {
          const g = s('g', { transform: `translate(${r.x} ${r.y}) rotate(${r.deg}) scale(${8 / 14}) translate(-5 -7)` });
          g.append(s('path', { d: r.d, fill: 'none', stroke: i < lit ? t.lit : t.unlit, 'stroke-width': stroke, 'stroke-linecap': 'square', 'stroke-linejoin': 'miter' }));
          svg.append(g);
        });
        wrap.append(h('div', { style: 'display:flex;flex-direction:column;gap:6px;align-items:center' }, svg,
          h('span', { style: `font:12px system-ui,sans-serif;color:${t.muted}` }, size === 104 ? '104 px (real)' : 'el mismo anillo ×3')));
      }
      col.append(wrap);
    }
    document.body.append(col);
  }
}

const chromium = await loadChromium();
const browser = await chromium.launch();
try {
  for (const [mode, file] of [['sheet', 'runas-muestra.png'], ['ring', 'runas-anillo.png']]) {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    await page.evaluate(build, { themes: THEMES, glyphs: RUNE_GLYPHS, ring, lit: LIT, stroke: STROKE, mode });
    await page.screenshot({ path: OUT + file, fullPage: true });
    await page.close();
    console.log('escrito', OUT + file);
  }
} finally {
  await browser.close();
}
