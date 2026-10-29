// Flags of the four languages, as small 3:2 SVGs built with the DOM (no markup strings, CSP/Trusted Types safe).
// The same drawings as the login page (web/auth-i18n.js); they keep their national colours in both themes.
const SVG = 'http://www.w3.org/2000/svg';

export const FLAG_CODES = ['es', 'en', 'it', 'pt'];

function svgEl(doc, tag, attrs) {
  const e = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const DRAW = {
  es: (s, rect) => [rect(0, 0, 30, 20, '#AA151B'), rect(0, 5, 30, 10, '#F1BF00')],
  it: (s, rect) => [rect(0, 0, 10, 20, '#009246'), rect(10, 0, 10, 20, '#FFFFFF'), rect(20, 0, 10, 20, '#CE2B37')],
  pt: (s, rect) => [rect(0, 0, 12, 20, '#046A38'), rect(12, 0, 18, 20, '#DA291C'),
    s('circle', { cx: 12, cy: 10, r: 4.2, fill: '#FFE900' }),
    s('circle', { cx: 12, cy: 10, r: 2.8, fill: '#DA291C' }),
    s('rect', { x: 10.6, y: 8.4, width: 2.8, height: 3.4, rx: 0.6, fill: '#FFFFFF' })],
  en: (s, rect) => {
    // Simplified Union Jack on a 60×40 canvas.
    const g = s('g', { transform: 'scale(.5)' });
    g.append(
      rect(0, 0, 60, 40, '#012169'),
      s('path', { d: 'M0,0 L60,40 M60,0 L0,40', stroke: '#FFFFFF', 'stroke-width': 8 }),
      s('path', { d: 'M0,0 L60,40 M60,0 L0,40', stroke: '#C8102E', 'stroke-width': 3 }),
      s('path', { d: 'M30,0 V40 M0,20 H60', stroke: '#FFFFFF', 'stroke-width': 12 }),
      s('path', { d: 'M30,0 V40 M0,20 H60', stroke: '#C8102E', 'stroke-width': 7 }),
    );
    return [g];
  },
};

// Decorative flag (24×16) for a language code; an unknown code returns null.
export function flagSvg(doc, code) {
  const draw = Object.hasOwn(DRAW, code) ? DRAW[code] : null;
  if (!draw) return null;
  const s = (tag, attrs) => svgEl(doc, tag, attrs);
  const rect = (x, y, w, h, fill) => s('rect', { x, y, width: w, height: h, fill });
  const svg = s('svg', { viewBox: '0 0 30 20', width: 24, height: 16, class: 'flag', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(...draw(s, rect));
  return svg;
}
