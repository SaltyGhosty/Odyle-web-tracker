// icons.js
// Odyle's own line icons (24×24 grid, stroke only). Not taken from the game or any icon set.
export const ICONS = {
  energia: ['M12 3a6 6 0 0 1 6 6c0 4-6 12-6 12S6 13 6 9a6 6 0 0 1 6-6z', 'M12 7v4', 'M10 9h4'],
  eventos: ['M5 5h14v15H5z', 'M5 9h14', 'M9 3v4', 'M15 3v4', 'M9 13h2v2H9z'],
  amigos: ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3 20c0-3 3-5 6-5s6 2 6 5', 'M16 11a2.5 2.5 0 1 0 0-5', 'M17 15c2 .4 4 2 4 5'],
  chat: ['M4 5h16v11H9l-5 4z', 'M8 10h8', 'M8 13h5'],
  buscar: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M16 16l5 5'],
  legion: ['M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z', 'M12 8v8', 'M9 11h6'],
  estadisticas: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M3 20h18'],
  ajustes: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M5 5l2 2', 'M17 17l2 2', 'M19 5l-2 2', 'M7 17l-2 2'],
  novedades: ['M6 4h12v16l-6-4-6 4z', 'M9 8h6'],
  mas: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  rayo: ['M13 3L5 14h6l-1 7 8-11h-6z'],
  anadir: ['M12 5v14', 'M5 12h14'],
  quitar: ['M5 12h14'],
  cerrar: ['M6 6l12 12', 'M18 6L6 18'],
  asistente: ['M12 3c.6 4.5 1.5 7.4 9 9-7.5 1.6-8.4 4.5-9 9-.6-4.5-1.5-7.4-9-9 7.5-1.6 8.4-4.5 9-9z'],
  perfil: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c0-4 4-6 8-6s8 2 8 6'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';
export function iconSvg(doc, id) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[id] || []) {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
