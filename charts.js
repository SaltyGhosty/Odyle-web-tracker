// SVG charts for the tracker: 7-day energy forecast (lines) and spend history (bars).
// Palette: validated categorical slots for the dark surface (dataviz reference palette),
// assigned by character order so a character keeps its colour.
export const CHART_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

const NS = 'http://www.w3.org/2000/svg';
const W = 640, H = 220, PAD = { l: 38, r: 12, t: 14, b: 26 };
const DAY = 86_400_000;
const node = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
};
const weekday = new Intl.DateTimeFormat('es', { weekday: 'short' });
const when = new Intl.DateTimeFormat('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

// series: [{name, color, points:[{t, energy}]}]; tooltip: an HTML element positioned over the svg.
export function renderForecast(svg, series, nowMs, tooltip) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const end = nowMs + 7 * DAY;
  const top = Math.max(840, ...series.flatMap(s => s.points.map(p => p.energy)));
  const x = t => PAD.l + (t - nowMs) / (end - nowMs) * (W - PAD.l - PAD.r);
  const y = v => H - PAD.b - v / top * (H - PAD.t - PAD.b);
  // recessive grid: 0, 420, 840 + local midnights
  for (const v of [0, 420, 840]) {
    svg.append(node('line', { x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v), class: v === 840 ? 'cap' : 'grid' }));
    svg.append(node('text', { x: PAD.l - 6, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' }, String(v)));
  }
  const d0 = new Date(nowMs); d0.setHours(24, 0, 0, 0);
  for (let t = d0.getTime(); t < end; t += DAY) {
    svg.append(node('line', { x1: x(t), x2: x(t), y1: PAD.t, y2: H - PAD.b, class: 'grid' }));
    svg.append(node('text', { x: x(t) + 4, y: H - 8, class: 'axis' }, weekday.format(new Date(t))));
  }
  for (const s of series) {
    // step line: energy holds between recharges, jumps at each one
    let dpath = '';
    s.points.forEach((p, i) => {
      if (i === 0) dpath += `M${x(p.t).toFixed(1)},${y(p.energy).toFixed(1)}`;
      else dpath += `H${x(p.t).toFixed(1)}V${y(p.energy).toFixed(1)}`;
    });
    if (s.points.length) dpath += `H${x(end).toFixed(1)}`;
    svg.append(node('path', { d: dpath, class: 'series', stroke: s.color }));
  }
  // hover: crosshair + tooltip with each character's energy at that moment
  const cross = node('line', { y1: PAD.t, y2: H - PAD.b, class: 'cross', visibility: 'hidden' });
  const hit = node('rect', { x: PAD.l, y: PAD.t, width: W - PAD.l - PAD.r, height: H - PAD.t - PAD.b, fill: 'transparent' });
  svg.append(cross, hit);
  const at = (pts, t) => { let v = pts[0]?.energy ?? 0; for (const p of pts) { if (p.t <= t) v = p.energy; else break; } return v; };
  hit.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * W;
    const t = nowMs + (px - PAD.l) / (W - PAD.l - PAD.r) * (end - nowMs);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    if (!tooltip) return;
    tooltip.replaceChildren();
    const head = document.createElement('strong'); head.textContent = when.format(new Date(t)); tooltip.append(head);
    for (const s of series) {
      const row = document.createElement('div');
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = s.color;
      row.append(sw, `${s.name}: ${at(s.points, t)}`);
      tooltip.append(row);
    }
    tooltip.hidden = false;
    const left = Math.min(r.width - tooltip.offsetWidth - 4, Math.max(4, e.clientX - r.left + 12));
    tooltip.style.left = `${left}px`;
  });
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); if (tooltip) tooltip.hidden = true; });
}

// days: [{day:'YYYY-MM-DD', spent}] oldest → today.
export function renderHistory(svg, days) {
  const HH = 160;
  svg.setAttribute('viewBox', `0 0 ${W} ${HH}`);
  svg.replaceChildren();
  const top = Math.max(40, ...days.map(d => d.spent));
  const slot = (W - PAD.l - PAD.r) / days.length;
  const bw = Math.min(48, slot - 12);
  const base = HH - PAD.b;
  svg.append(node('line', { x1: PAD.l, x2: W - PAD.r, y1: base, y2: base, class: 'axis-line' }));
  days.forEach((d, i) => {
    const cx = PAD.l + slot * i + slot / 2;
    const h = d.spent / top * (base - PAD.t - 14);
    if (d.spent > 0) {
      const r = Math.min(4, h);
      const x0 = cx - bw / 2, y0 = base - h;
      // 4px rounded data-end, square at the baseline
      const g = node('g', { class: 'bar-g' });
      g.append(node('title', {}, `${d.day}: ${d.spent} de OD gastada`));
      g.append(node('path', { class: 'bar', d: `M${x0},${base}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${base}Z` }));
      svg.append(g);
    }
    svg.append(node('text', { x: cx, y: base - h - 4, class: 'bar-label', 'text-anchor': 'middle' }, d.spent > 0 ? String(d.spent) : ''));
    const date = new Date(d.day + 'T12:00:00');
    svg.append(node('text', { x: cx, y: HH - 8, class: 'axis', 'text-anchor': 'middle' }, i === days.length - 1 ? 'hoy' : weekday.format(date)));
  });
}

// Combat power over time: one line per character, x = time of each entry, y = combat power.
const short = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });
const dayMonth = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
export function renderCp(svg, series, nowMs) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const pts = series.flatMap(s => s.points);
  if (!pts.length) return;
  const t0 = Math.min(...pts.map(p => p.at)), t1 = Math.max(nowMs, t0 + DAY);
  const lo = Math.min(...pts.map(p => p.cp)), hi = Math.max(...pts.map(p => p.cp));
  const pad = Math.max(1, (hi - lo) * 0.1);
  const y0 = Math.max(0, lo - pad), y1 = hi + pad;
  const x = t => PAD.l + (t - t0) / (t1 - t0) * (W - PAD.l - PAD.r);
  const y = v => H - PAD.b - (v - y0) / (y1 - y0) * (H - PAD.t - PAD.b);
  for (const v of [y0, (y0 + y1) / 2, y1]) {
    svg.append(node('line', { x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(node('text', { x: PAD.l - 6, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' }, short.format(v)));
  }
  for (const t of [t0, (t0 + t1) / 2, t1]) {
    svg.append(node('text', { x: x(t), y: H - 8, class: 'axis', 'text-anchor': 'middle' }, dayMonth.format(new Date(t))));
  }
  for (const s of series) {
    if (!s.points.length) continue;
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.cp).toFixed(1)}`).join('') + `H${x(nowMs).toFixed(1)}`;
    svg.append(node('path', { d, class: 'series', stroke: s.color }));
    for (const p of s.points) {
      const c = node('circle', { cx: x(p.at), cy: y(p.cp), r: 4, fill: s.color, class: 'dot' });
      c.append(node('title', {}, `${s.name}: ${p.cp.toLocaleString('es')} · ${dayMonth.format(new Date(p.at))}`));
      svg.append(c);
    }
  }
}
