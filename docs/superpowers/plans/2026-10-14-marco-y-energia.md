# Marco nuevo y pantalla Energía en filas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar la app al marco Aion 2: rail en escritorio, barra inferior con hoja «Más» en móvil, cabecera compacta, columna lateral en pantallas anchas, y la pantalla Energía con banda de próxima decisión y un personaje por fila con menú «⋯».

**Architecture:** Se transforma el `index.html` existente: el sistema de pestañas (`TABS`, `PLACE`, `setTab`, `applyLayout` en el `<script type="module">`, que la compilación llama `app.js`) sigue moviendo los nodos de cada sección a su panel. El `<nav>` de pestañas pasa a ser rail (≥ 900 px) o barra inferior (< 900 px) por CSS. La lógica que se puede probar sin DOM (reparto de secciones, banda de decisión) va a `layout.js`, y los iconos propios a `icons.js`.

**Tech Stack:** HTML/CSS/JS sin framework, módulos ES, `node --test`, Playwright (E2E en `dev/e2e-web.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-14-marco-y-energia-design.md`

## Global Constraints

- Rama: `feat/marco-energia` (ya creada desde `main`, con la spec).
- `index.html` lo comparten la web y la versión artifact de claude.ai: todo debe funcionar sin `window.odyleSocialApi` (sin Amigos, Chat ni Buscar).
- Puntos de corte: **escritorio ≥ 900 px** (rail), **ancho ≥ 1200 px** (columna lateral), **móvil < 900 px** (barra inferior).
- Barra móvil: web `Energía · Eventos · Amigos · Chat · Más`; artifact `Energía · Eventos · Legión · Estadísticas · Más`. «Más» lleva el resto de secciones, el Perfil y el interruptor Luz/Sombra.
- La pestaña `personajes` conserva su id interno (lo guardan `localStorage['odyle-tab']` y el código) pero su etiqueta pasa a **«Energía»**.
- Se conservan `article.card` + `data-id`, `.orb-slot` + `data-orb`, `button.spend`, `button.primary` («Actualizar») y los ids de formulario (`energy-<id>`, `extra-<id>`, `notes-<id>`): los usan `orb.js`, el código y los E2E.
- CSP estricta + Trusted Types `'none'`: sin `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`eval`/`new Function`; `setTimeout`/`setInterval` solo con funciones flecha; `import()` solo con cadena literal. Lo comprueba `server/test/attacks/xss-dom-sinks.test.js`.
- Colores solo por variables del tema (`--glass`, `--glass-strong`, `--line`, `--fg`, `--muted`, `--gold`, `--gold-bright`, `--sky`, `--urgent`, `--on-gold`, `--hover`, `--track`, `--field`, `--scrim`, `--shadow`, `--ok`, `--warn`). `#fff` solo sobre carmesí.
- Movimiento (Emil Kowalski): `:active { transform: scale(0.97) }`, `cubic-bezier(0.23, 1, 0.32, 1)` (`var(--ease-out)`), menos de 300 ms, hover solo dentro de `@media (hover: hover) and (pointer: fine)`, y nada animado con `prefers-reduced-motion: reduce`. La hoja «Más» entra con `translateY(100%)` → 0 en 240 ms; el menú «⋯» con `scale(0.96)` + opacidad desde su botón (`transform-origin` en el disparador).
- Objetivos táctiles de al menos 44 px. `<nav aria-label="Secciones">`, `aria-current="page"` en el elemento activo.
- Iconos SVG propios, de trazo; nada de arte de NCSOFT.
- Textos nuevos de la interfaz en español en el código, con traducción en `i18n-strings.js` para `en`, `it` y `pt` (la página traduce en vivo; las plantillas con `{0}` se reconocen).
- Commits sin la línea `Co-Authored-By` de Claude.
- Pruebas: `node --test *.test.js web/*.test.js` en la raíz (línea base: 130 pasan); `npm run build:web` y luego `cd server && npm test` (2 fallos conocidos de Windows: `app.test.js:166` y `pages.test.js:89`; el test «argon2 en masa» de `dos-limits` puede fallar por carga: repetirlo solo); `node dev/e2e-web.mjs` (línea base: 72/72). **No** ejecutar `npm test` en la raíz (en Windows choca al reconstruir `server/public`).
- Playwright en Windows: `npm i --no-save playwright` (y `npx playwright install chromium` si hace falta); `dev/pw.mjs` lo carga. Para capturas con `dev/preview.mjs` hace falta un servidor estático en la raíz que sirva `.js` como JavaScript (el `http.server` de Python en Windows no lo hace): escribe uno pequeño en Node en la carpeta de borradores y páralo al terminar.

## Review Focus

1. **Cambiar de ancho con la hoja «Más» o un menú «⋯» abiertos** (girar el móvil, redimensionar): al pasar a escritorio la hoja se cierra, no queda la página bloqueada y la navegación sigue funcionando. Lo fija la comprobación E2E «redimensionar con Más abierto» (Tarea 5).
2. **El menú «⋯» abierto mientras la página se repinta** (los datos llegan en vivo y `render()` reconstruye las filas): el menú sigue abierto en la misma fila y el foco no se pierde. Lo fija el estado `ui.menuFor` y la comprobación E2E «⋯ sobrevive a un repintado» (Tarea 3).
3. **Sección guardada que ya no existe** (`'amigos'` en el artifact, o un valor raro): se abre Energía. Lo fija la prueba de `resolveTab` (Tarea 1).
4. **375 px con nombres largos y varios personajes**: sin scroll horizontal; las filas pasan a dos líneas. Lo fija la comprobación E2E de anchura (Tarea 5).
5. **La barra inferior tapa lo último de la página o los diálogos**: el último botón de la última fila se puede pulsar en móvil y los diálogos (perfil, gastos, ficha de jugador) quedan por encima de la barra. Lo fija la comprobación E2E «último botón pulsable a 390 px» (Tarea 5).

---

## Rulings tomados al planificar

- **Reloj de recarga:** se queda en la cabecera compacta, que en escritorio es la franja superior de la columna principal y en móvil una línea con «Odyle», reloj y ficha de perfil. Así se ve arriba de la pantalla Energía, como dice la spec, y también en las demás secciones. *Coste si es incorrecto:* mover un nodo.
- **Ficha de perfil:** un solo nodo (`#profile-chip`); en escritorio se mueve al pie del rail y en móvil vuelve a la cabecera (`matchMedia('(min-width: 900px)')`). El interruptor Luz/Sombra se crea dos veces (rail y hoja «Más»); `applyTheme` ya sincroniza todos los `[data-theme-choice]`.
- **Texto de la banda en calma:** «Nadie al tope · el próximo, {nombre} en {tiempo}» (la spec decía «Nadie se llena hoy», que es falso si alguien se llena hoy). *Coste:* ninguno.
- **Modo compacto** (`body.compact`): se mantiene; con filas reduce el orbe a 56 px y oculta las líneas secundarias.
- **Columna lateral «En línea»:** en la web, amigos en línea (estado de `social-ui.js`); en el artifact, los miembros de la legión en línea que ya pinta `#online-list`.

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `layout.js` (+ `layout.test.js`) | Secciones, reparto barra/«Más», sección guardada, banda de decisión | 1 |
| `icons.js` (+ `icons.test.js`) | Trazos SVG propios y `iconSvg(doc, id)` | 1 |
| `scripts/build-web.mjs` | `EXPECTED` + `layout.js`, `icons.js` | 1 |
| `index.html` | Marco (rail, barra, hoja «Más», cabecera), banda, filas, menú «⋯», columna lateral | 2, 3, 4 |
| `web/social-ui.js` | Avisar a la página de los amigos en línea | 4 |
| `i18n-strings.js` | Textos nuevos (bloque `FRAME`) | 2, 3, 4 |
| `dev/e2e-web.mjs` | Navegación, banda, «⋯», anchuras y redimensionado | 5 |
| `DESIGN.md`, `.impeccable/surfaces/index-html.md` | Marco y filas documentados | 5 |

---

### Tarea 1: `layout.js` e `icons.js`

**Files:**
- Create: `layout.js`, `layout.test.js`, `icons.js`, `icons.test.js`
- Modify: `scripts/build-web.mjs` (`EXPECTED` + `'layout.js'`, `'icons.js'`)

**Interfaces:**
- Consumes: `formatDuration` (`energy.js`), `wasteWarning` (`planner.js`).
- Produces:
  - `SECTIONS`: array `{ id, label, icon, social }` en orden del rail.
  - `navModel({ social }) → { rail: string[], bar: string[], more: string[] }` (ids; `bar` tiene 4 ids y la página añade el botón «Más»).
  - `resolveTab(saved, { social }) → string` (id válido o `'personajes'`).
  - `decisionBand(rows, now, { quiet, tzOffsetMin }) → null | { tone: 'urgent'|'warn'|'calm', text: string, targetId: string|null }`. `rows` son las filas de `buildView` (`{ id, name, energy, isFull, fullAtMs }`).
  - `ICONS` (objeto id → array de trazos `d` de 24×24) e `iconSvg(doc, id) → SVGElement` (`class="i"`, `aria-hidden="true"`).

- [ ] **Paso 1: Escribir las pruebas**

```js
// layout.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, navModel, resolveTab, decisionBand } from './layout.js';

test('secciones: Energía primero, ids estables y etiqueta nueva', () => {
  assert.equal(SECTIONS[0].id, 'personajes');
  assert.equal(SECTIONS[0].label, 'Energía');
  assert.deepEqual(SECTIONS.map((s) => s.id),
    ['personajes', 'eventos', 'amigos', 'chat', 'buscar', 'legion', 'estadisticas', 'ajustes', 'novedades']);
  assert.ok(SECTIONS.every((s) => typeof s.icon === 'string'));
});

test('web: rail con todo, barra Energía·Eventos·Amigos·Chat, el resto en Más', () => {
  const m = navModel({ social: true });
  assert.deepEqual(m.rail, SECTIONS.map((s) => s.id));
  assert.deepEqual(m.bar, ['personajes', 'eventos', 'amigos', 'chat']);
  assert.deepEqual(m.more, ['buscar', 'legion', 'estadisticas', 'ajustes', 'novedades']);
});

test('artifact: sin secciones sociales; barra Energía·Eventos·Legión·Estadísticas', () => {
  const m = navModel({ social: false });
  assert.ok(!m.rail.includes('amigos') && !m.rail.includes('chat') && !m.rail.includes('buscar'));
  assert.deepEqual(m.bar, ['personajes', 'eventos', 'legion', 'estadisticas']);
  assert.deepEqual(m.more, ['ajustes', 'novedades']);
});

test('resolveTab: válido se respeta; desconocido o social en artifact → Energía', () => {
  assert.equal(resolveTab('chat', { social: true }), 'chat');
  assert.equal(resolveTab('chat', { social: false }), 'personajes');
  assert.equal(resolveTab('amigos', { social: false }), 'personajes');
  assert.equal(resolveTab('<x>', { social: true }), 'personajes');
  assert.equal(resolveTab(null, { social: true }), 'personajes');
  assert.equal(resolveTab('ajustes', { social: false }), 'ajustes');
});

const H = 3_600_000;
const quiet = { start: '00:00', end: '08:00' };
const row = (id, name, energy, fullAtMs) => ({ id, name, energy, isFull: energy >= 840, fullAtMs });

test('banda: sin personajes no hay banda', () => {
  assert.equal(decisionBand([], 0, { quiet, tzOffsetMin: 0 }), null);
});
test('banda urgente: uno al tope', () => {
  const b = decisionBand([row('a', 'Ana', 300, 10 * H), row('c', 'Casi', 840, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.deepEqual(b, { tone: 'urgent', text: 'Casi está al tope · pierde 15 OD cada 3 h', targetId: 'c' });
});
test('banda urgente: varios al tope', () => {
  const b = decisionBand([row('c', 'Casi', 840, null), row('d', 'Dos', 840, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.equal(b.tone, 'urgent');
  assert.equal(b.text, '2 personajes al tope · pierden 15 OD cada 3 h');
  assert.equal(b.targetId, 'c');
});
test('banda aviso: se llena antes del final del descanso y perdería energía', () => {
  // ahora 22:00 UTC del día 0; se llena a las 23:00; descanso 00:00–08:00 → pierde recargas
  const now = 22 * H;
  const b = decisionBand([row('a', 'Ana', 825, now + 1 * H), row('b', 'Bea', 100, now + 90 * H)], now, { quiet, tzOffsetMin: 0 });
  assert.equal(b.tone, 'warn');
  assert.equal(b.targetId, 'a');
  assert.match(b.text, /^Ana se llena en 1h 0m · perderías \d+ OD si no juegas antes$/);
});
test('banda en calma: el próximo en llenarse', () => {
  const now = 9 * H; // fuera del descanso; se llena dentro de 3 días, a media tarde
  const b = decisionBand([row('b', 'Bea', 100, now + 72 * H + 6 * H), row('a', 'Ana', 400, now + 30 * H + 6 * H)], now, { quiet, tzOffsetMin: 0 });
  assert.equal(b.tone, 'calm');
  assert.equal(b.targetId, 'a');
  assert.equal(b.text, 'Nadie al tope · el próximo, Ana en 1d 12h 0m');
});
test('banda en calma sin hora de recarga', () => {
  const b = decisionBand([row('a', 'Ana', 400, null)], 0, { quiet, tzOffsetMin: 0 });
  assert.deepEqual(b, { tone: 'calm', text: 'Nadie al tope', targetId: null });
});
```

```js
// icons.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, iconSvg } from './icons.js';
import { SECTIONS } from './layout.js';

test('cada sección y «más»/«perfil» tienen icono propio', () => {
  for (const id of [...SECTIONS.map((s) => s.icon), 'mas', 'perfil']) {
    assert.ok(Array.isArray(ICONS[id]) && ICONS[id].length > 0, id);
    for (const d of ICONS[id]) assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/, id);
  }
});

function fakeDoc() {
  const make = (tag) => ({ tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = String(v); }, append(...n) { this.children.push(...n); } });
  return { createElementNS: (_ns, tag) => make(tag) };
}
test('iconSvg: svg decorativo de 24×24 con un path por trazo', () => {
  const svg = iconSvg(fakeDoc(), 'chat');
  assert.equal(svg.tag, 'svg');
  assert.equal(svg.attrs.viewBox, '0 0 24 24');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  assert.equal(svg.attrs.class, 'i');
  assert.equal(svg.children.length, ICONS.chat.length);
  assert.ok(svg.children.every((p) => p.tag === 'path'));
});
test('iconSvg con id desconocido devuelve un svg vacío, no lanza', () => {
  assert.equal(iconSvg(fakeDoc(), 'zzz').children.length, 0);
});
```

- [ ] **Paso 2: Ver que fallan**

Run: `node --test layout.test.js icons.test.js`
Expected: FAIL (`Cannot find module './layout.js'`).

- [ ] **Paso 3: Implementar `layout.js`**

```js
// layout.js
// Navigation model and the "next decision" band. Pure: no DOM, tested with node --test.
import { formatDuration } from './energy.js';
import { wasteWarning } from './planner.js';

// Rail order. `social` sections exist only on the web build (window.odyleSocialApi).
export const SECTIONS = [
  { id: 'personajes', label: 'Energía', icon: 'energia', social: false },
  { id: 'eventos', label: 'Eventos', icon: 'eventos', social: false },
  { id: 'amigos', label: 'Amigos', icon: 'amigos', social: true },
  { id: 'chat', label: 'Chat', icon: 'chat', social: true },
  { id: 'buscar', label: 'Buscar', icon: 'buscar', social: true },
  { id: 'legion', label: 'Legión', icon: 'legion', social: false },
  { id: 'estadisticas', label: 'Estadísticas', icon: 'estadisticas', social: false },
  { id: 'ajustes', label: 'Ajustes', icon: 'ajustes', social: false },
  { id: 'novedades', label: 'Novedades', icon: 'novedades', social: false },
];

const BAR = { web: ['personajes', 'eventos', 'amigos', 'chat'], artifact: ['personajes', 'eventos', 'legion', 'estadisticas'] };

export function navModel({ social }) {
  const rail = SECTIONS.filter((s) => social || !s.social).map((s) => s.id);
  const bar = social ? BAR.web : BAR.artifact;
  return { rail, bar, more: rail.filter((id) => !bar.includes(id)) };
}

export function resolveTab(saved, { social }) {
  return navModel({ social }).rail.includes(saved) ? saved : 'personajes';
}

// What the player should do next: crimson when someone is at cap, gold when someone will waste
// recharges before the end of the quiet window, neutral otherwise.
export function decisionBand(rows, now, { quiet, tzOffsetMin }) {
  if (!rows.length) return null;
  const full = rows.filter((r) => r.isFull);
  if (full.length === 1) return { tone: 'urgent', text: `${full[0].name} está al tope · pierde 15 OD cada 3 h`, targetId: full[0].id };
  if (full.length > 1) return { tone: 'urgent', text: `${full.length} personajes al tope · pierden 15 OD cada 3 h`, targetId: full[0].id };
  const pending = rows.filter((r) => r.fullAtMs !== null && r.fullAtMs !== undefined).sort((a, b) => a.fullAtMs - b.fullAtMs);
  for (const r of pending) {
    const w = wasteWarning(r.fullAtMs, now, quiet, tzOffsetMin);
    if (w) return { tone: 'warn', text: `${r.name} se llena en ${formatDuration(r.fullAtMs - now)} · perderías ${w.lossOD} OD si no juegas antes`, targetId: r.id };
  }
  if (!pending.length) return { tone: 'calm', text: 'Nadie al tope', targetId: null };
  const next = pending[0];
  return { tone: 'calm', text: `Nadie al tope · el próximo, ${next.name} en ${formatDuration(next.fullAtMs - now)}`, targetId: next.id };
}
```

Si la prueba de «aviso» o «calma» no cuadra con `wasteWarning` (revisa `planner.js`: devuelve `null` si el personaje se llena después del final de la próxima ventana de descanso), ajusta **los tiempos de la prueba** para que el caso sea el descrito en su nombre, no la lógica; anota el cambio en el informe.

- [ ] **Paso 4: Implementar `icons.js`**

Trazos propios en una rejilla de 24 (trazo de 1.75, sin relleno). Dibújalos con formas simples y coherentes:

```js
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
```

Los puntos de `mas` (`h.01`) se ven como puntos gracias a `stroke-linecap: round` (CSS de la Tarea 2).

- [ ] **Paso 5: Ver que pasan y compilar**

Añade `'layout.js'` e `'icons.js'` a `EXPECTED` en `scripts/build-web.mjs`.
Run: `node --test layout.test.js icons.test.js && node --test *.test.js web/*.test.js && npm run build:web`
Expected: todo PASS; compilación correcta.

- [ ] **Paso 6: Commit**

```bash
git add layout.js layout.test.js icons.js icons.test.js scripts/build-web.mjs
git commit -m "feat(marco): modelo de navegación, banda de decisión e iconos propios"
```

---

### Tarea 2: Marco — rail, barra inferior, hoja «Más» y cabecera compacta

**Files:**
- Modify: `index.html` (marcado de la cabecera, CSS del marco, código de pestañas en `app.js`)
- Modify: `i18n-strings.js` (bloque `FRAME`)

**Interfaces:**
- Consumes: `SECTIONS`, `navModel`, `resolveTab` (`layout.js`), `iconSvg` (`icons.js`), `themeSwitch()` y `applyTheme` (ya en `app.js`).
- Produces: `#topnav` como rail/barra con botones `[data-tab]` (icono `.i`, etiqueta `.lbl`, insignia `.badge`) y botón `[data-more]`; `<dialog id="more-sheet">` con botones `[data-tab]` y un interruptor de tema; `setTab(id)` y `setBadge(id, n)` actualizan rail, barra y hoja; `const WIDE = matchMedia('(min-width: 900px)')`.

- [ ] **Paso 1: Cabecera compacta (marcado)**

En la `<header>` de `index.html`:
- Sustituye el bloque `<div><h1>Energía Odyle</h1><p class="subtitle" id="subtitle">…</p></div>` por `<div class="brand"><b class="brand-name">Odyle</b><span class="subtitle" id="subtitle">Daevas de Elyos</span></div>` (el `id="subtitle"` lo usa `applyTheme`).
- Borra `<div class="theme-slot" id="theme-slot-header"></div>` (el interruptor pasa al rail y a la hoja «Más»).
- Borra el botón `#menu-btn` y, en `app.js`, todo el código del cajón ☰ que quede muerto (`openMenu`, `closeMenu`, `ui.menuOpen`, `#drawer` como contenedor visible). **Ojo:** `#drawer` sigue siendo el sitio de origen de los paneles de Ajustes y Novedades (`drawerOrder`, `drawerPanels`); conserva el elemento oculto como almacén, o mueve esos paneles a un contenedor oculto `#store` y ajusta `drawerPanels`. Elige lo más simple y que no cambie qué paneles van a cada sección.
- Cambia `<title>` a `Odyle Tracker` si hoy es «Energía Odyle» (las traducciones del título siguen funcionando con la nueva clave: añade `'Odyle Tracker'` a `FRAME` si hace falta).

- [ ] **Paso 2: Navegación (código)**

En `app.js` sustituye la construcción de `TABS`, `nav` y `setTab` por una que parta de `layout.js`. `TABS` deja de existir como array literal: se deriva de `SECTIONS` y `navModel`.

```js
  import { SECTIONS, navModel, resolveTab } from './layout.js';
  import { iconSvg } from './icons.js';
  // …
  const SOCIAL = !!window.odyleSocialApi;
  const NAV = navModel({ social: SOCIAL });
  const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
  const TABS = NAV.rail.map((id) => [id, SECTION[id].label]);   // [id, label], como antes
  const WIDE = matchMedia('(min-width: 900px)');

  const navButton = (id) => el('button', { type: 'button', 'data-tab': id, onclick: () => setTab(id) },
    iconSvg(document, SECTION[id].icon), el('span', { class: 'lbl' }, SECTION[id].label));
  const nav = el('nav', { class: 'topnav', id: 'topnav', 'aria-label': 'Secciones' },
    el('div', { class: 'rail-brand' }, el('b', { class: 'brand-name' }, 'Odyle')));
  for (const id of NAV.rail) {
    const b = navButton(id);
    if (!NAV.bar.includes(id)) b.classList.add('in-more');   // oculto en la barra móvil
    nav.append(b);
  }
  const moreBtn = el('button', { type: 'button', class: 'more-btn', 'data-more': '', 'aria-haspopup': 'dialog', onclick: () => openMore() },
    iconSvg(document, 'mas'), el('span', { class: 'lbl' }, 'Más'));
  nav.append(moreBtn);
  const railFoot = el('div', { class: 'rail-foot' }, themeSwitch());
  nav.append(railFoot);

  const moreSheet = el('dialog', { class: 'more-sheet', id: 'more-sheet', 'aria-label': 'Más secciones' });
  moreSheet.append(el('div', { class: 'more-grid' }, ...NAV.more.map((id) => navButton(id)),
    el('button', { type: 'button', 'data-profile': '', onclick: () => { closeMore(); $('profile-chip').click(); } },
      iconSvg(document, 'perfil'), el('span', { class: 'lbl' }, 'Perfil'))),
    themeSwitch());
  moreSheet.addEventListener('click', (e) => { if (e.target === moreSheet) closeMore(); });
  document.body.append(moreSheet);
  function openMore() { if (!moreSheet.open) moreSheet.showModal(); }
  function closeMore() { if (moreSheet.open) moreSheet.close(); }

  let activeTab = 'personajes';
  try { activeTab = resolveTab(localStorage.getItem('odyle-tab'), { social: SOCIAL }); } catch {}

  function setTab(id) {
    id = resolveTab(id, { social: SOCIAL });
    activeTab = id;
    try { localStorage.setItem('odyle-tab', id); } catch {}
    for (const [k, p] of Object.entries(tabPanels)) p.hidden = k !== id;
    for (const b of document.querySelectorAll('#topnav [data-tab], #more-sheet [data-tab]')) {
      if (b.dataset.tab === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    if (NAV.more.includes(id)) moreBtn.setAttribute('aria-current', 'page'); else moreBtn.removeAttribute('aria-current');
    closeMore();
    if (id === 'eventos') $('events').open = true;
    if (id === 'novedades') loadInbox();
    window.scrollTo({ top: 0 });
    if (social) social.onTab(id);
    render();
  }

  function setBadge(id, n) {
    for (const b of document.querySelectorAll(`#topnav [data-tab="${id}"], #more-sheet [data-tab="${id}"]`)) {
      let s = b.querySelector('.badge');
      if (!n) { if (s) s.remove(); continue; }
      if (!s) { s = el('span', { class: 'badge' }); b.append(s); }
      s.textContent = n > 99 ? '99+' : String(n);
    }
  }

  // La ficha de perfil vive al pie del rail en escritorio y en la cabecera en móvil.
  function placeChrome() {
    if (WIDE.matches) { railFoot.append($('profile-chip')); closeMore(); }
    else pageEl.querySelector('header').append($('profile-chip'));
  }
  WIDE.addEventListener('change', placeChrome);
```

- Mantén `tabPanels`, `PLACE`, `socialPanels` y `applyLayout` (que inserta `nav` y `tabWrap`). Cambia `applyLayout` para que inserte `nav` **antes** de `.page` (`pageEl.before(nav)`) en lugar de después de la cabecera, y llama `placeChrome()` al final.
- `themeSwitch()` ya existe; antes se colgaba de `#theme-slot-header`: quita esa instancia y deja las de `#theme-slot-look` (Ajustes) y `#theme-slot-profile` (diálogo de perfil). Las del rail y la hoja se crean arriba. Comprueba que `applyTheme` marca `aria-pressed` en **todas** (usa `document.querySelectorAll('[data-theme-choice]')`, y las de la hoja están en `document.body`).
- `goTo(tab, focusId)`: ya no hay cajón; deja solo `setTab(tab)` y el foco.
- `$('guide')`: el paso 1 llamaba `if (DESKTOP.matches) setTab('personajes')`; usa `setTab('personajes')` sin condición. Borra `DESKTOP` si queda sin uso.
- Escape en la hoja la cierra (comportamiento nativo de `<dialog>`).

- [ ] **Paso 3: CSS del marco**

Sustituye las reglas de `.topnav` (y las del cajón ☰ que queden muertas) por:

```css
  /* ---- Marco: rail (≥ 900 px), barra inferior + hoja «Más» (< 900 px) ---- */
  .i { width: 22px; height: 22px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
  .brand { display: flex; flex-direction: column; }
  .brand-name { font-family: var(--font-display); font-weight: 700; font-size: 1.35rem; letter-spacing: .04em; color: var(--gold-bright); }
  header .subtitle { font-size: .7rem; }
  .topnav { position: fixed; z-index: 20; background: var(--glass-strong); border-color: var(--line); display: flex; }
  .topnav button { border: none; background: none; color: var(--muted); font-weight: 600; min-height: 44px; display: flex; align-items: center; gap: 10px; position: relative; border-radius: 10px; }
  .topnav button[aria-current="page"] { color: var(--gold-bright); background: color-mix(in srgb, var(--gold) 12%, transparent); }
  .topnav .badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-grid; place-items: center; font-size: .7rem; font-weight: 700; background: var(--urgent); color: #fff; font-variant-numeric: tabular-nums; }
  .rail-brand, .rail-foot { display: none; }
  @media (min-width: 900px) {
    .topnav { top: 0; bottom: 0; left: 0; width: 220px; flex-direction: column; gap: 2px; padding: 16px 12px; border-right: 1px solid var(--line); overflow-y: auto; }
    .topnav button { padding: 10px 12px; width: 100%; text-align: left; }
    .topnav .badge { margin-left: auto; }
    .topnav .more-btn { display: none; }
    .rail-brand { display: block; padding: 4px 12px 16px; }
    .rail-foot { display: flex; flex-direction: column; gap: 12px; margin-top: auto; padding-top: 16px; }
    .page { margin-left: 220px; }
    header .brand { display: none; }
  }
  @media (max-width: 899.98px) {
    .topnav { left: 0; right: 0; bottom: 0; padding: 4px 4px calc(4px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); justify-content: space-around; }
    .topnav button { flex: 1 1 0; flex-direction: column; gap: 2px; padding: 6px 2px; font-size: .7rem; min-width: 0; }
    .topnav button.in-more { display: none; }
    .topnav .badge { position: absolute; top: 2px; left: calc(50% + 6px); }
    .page { padding-bottom: calc(80px + env(safe-area-inset-bottom)); }
  }
  .more-sheet { position: fixed; inset: auto 0 0 0; margin: 0; width: 100%; max-width: none; max-height: 80vh; border: 1px solid var(--line); border-bottom: none;
    border-radius: 16px 16px 0 0; background: var(--glass-strong); color: var(--fg); padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); box-shadow: var(--shadow); }
  .more-sheet::backdrop { background: var(--scrim); }
  .more-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
  .more-grid button { flex-direction: column; min-height: 72px; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 12px; }
  .more-grid button[aria-current="page"] { color: var(--gold-bright); border-color: var(--gold); }
  @media (prefers-reduced-motion: no-preference) {
    .more-sheet[open] { animation: sheet-in 240ms var(--ease-out); }
    @keyframes sheet-in { from { transform: translateY(100%); } to { transform: translateY(0); } }
  }
  header { display: flex; align-items: center; gap: 12px; justify-content: space-between; flex-wrap: wrap; }
```

Ajusta lo que choque con reglas existentes (márgenes de `.page`, `header` con `flex-wrap`, el `.topnav` sticky antiguo). Los diálogos y modales (`.modal`, `.sheet`, `#ai-panel`, el aviso de sesión) deben quedar **por encima** de la barra: su `z-index` debe ser mayor que 20 (comprueba los actuales). El panel del asistente y el botón «Asistente» flotante no deben quedar tapados por la barra en móvil (súbelos `calc(72px + env(safe-area-inset-bottom))` si hace falta).

- [ ] **Paso 4: Traducciones**

Al final de `i18n-strings.js`:

```js
// Frame: rail, bottom bar and "more" sheet (2026-10-14).
const FRAME = {
  en: { 'Más': 'More', 'Más secciones': 'More sections', Perfil: 'Profile', Secciones: 'Sections', 'Odyle Tracker': 'Odyle Tracker' },
  it: { 'Más': 'Altro', 'Más secciones': 'Altre sezioni', Perfil: 'Profilo', Secciones: 'Sezioni', 'Odyle Tracker': 'Odyle Tracker' },
  pt: { 'Más': 'Mais', 'Más secciones': 'Mais seções', Perfil: 'Perfil', Secciones: 'Seções', 'Odyle Tracker': 'Odyle Tracker' },
};
for (const l of Object.keys(FRAME)) for (const [k, v] of Object.entries(FRAME[l])) if (!(k in STRINGS[l])) STRINGS[l][k] = v;
```

(`Energía` ya está traducida.)

- [ ] **Paso 5: Comprobar**

Run: `node --test *.test.js web/*.test.js && npm run build:web && node dev/e2e-web.mjs`
Expected: unitarias PASS; E2E: si alguna comprobación existente usaba `#topnav` como barra superior o `[data-tab]` visibles en móvil, adáptala a la navegación nueva **sin quitarla** (p. ej. en móvil, las secciones de «Más» se abren con `[data-more]` y luego `#more-sheet [data-tab=…]`). Deben pasar todas.

Capturas (escritorio 1280×900 y móvil 390×844, Luz y Sombra) de la pantalla Energía con `dev/preview.mjs`; míralas: rail a la izquierda en escritorio, barra abajo en móvil, nada tapado.

- [ ] **Paso 6: Commit**

```bash
git add index.html i18n-strings.js
git commit -m "feat(marco): rail en escritorio, barra inferior con hoja Más en móvil y cabecera compacta"
```

---

### Tarea 3: Pantalla Energía — banda de decisión, filas y menú «⋯»

**Files:**
- Modify: `index.html` (`#summary` → banda, `paintSummary`, `cardNode`, CSS de tarjetas, estado `ui`)
- Modify: `i18n-strings.js` (`FRAME`)

**Interfaces:**
- Consumes: `decisionBand` (`layout.js`), `iconSvg` (`icons.js`); `buildView` rows; `state.prefs.quietStart/quietEnd`.
- Produces: `#summary.band` con clase de tono `band-urgent|band-warn|band-calm`, texto `#sum-tip` y botón `#band-go`; filas `article.card.row` con zonas `.r-orb`, `.r-text`, `.r-num`, `.r-act`, `.r-below`; botón `button.more-actions[aria-haspopup="menu"]` con `ul[role="menu"]`; estado `ui.menuFor` (id de la fila con el menú abierto o `null`).

- [ ] **Paso 1: Banda**

Marcado (sustituye el `<section … id="summary">`):

```html
  <section class="band" id="summary" aria-live="polite" hidden>
    <p class="band-text" id="sum-tip"></p>
    <button type="button" id="band-go" hidden>Gastar</button>
    <p class="sum-next" id="sum-legion" hidden></p>
  </section>
```

`paintSummary(rows)`:

```js
  function paintSummary(rows) {
    const box = $('summary');
    const b = decisionBand(rows, Date.now(), { quiet: { start: state.prefs.quietStart, end: state.prefs.quietEnd }, tzOffsetMin: new Date().getTimezoneOffset() });
    box.hidden = !b;
    if (!b) return;
    box.className = `band band-${b.tone}`;
    $('sum-tip').textContent = b.text;
    const go = $('band-go');
    go.hidden = !b.targetId || b.tone === 'calm' || ui.readOnly || ui.noDb;
    go.onclick = () => goSpend(b.targetId);
    const need = state.presets[0]?.cost ?? 40;
    const everyone = [...rows, ...[...state.others.values()].flatMap((m) => buildView(m.characters, state.schedule, Date.now()).rows)];
    $('sum-legion').hidden = state.others.size === 0;
    $('sum-legion').textContent = `Listos para mazmorra en la legión: ${everyone.filter((r) => r.energy >= need).length} personajes con ${need} o más de OD`;
  }
  // «Gastar» de la banda: lleva a la fila y pone el foco en su primer gasto; sin presets abre los gastos.
  function goSpend(id) {
    const card = document.querySelector(`#cards article[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const first = card.querySelector('button.spend');
    if (first) first.focus({ preventScroll: true }); else $('presets-btn').click();
  }
```

(`go.onclick = …` asigna una función, no una cadena: lo permite la prueba de sumideros. `#sum-next` deja de existir: borra sus usos.)

CSS:

```css
  .band { border-radius: 14px; padding: 12px 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; border: 1px solid var(--line); background: var(--glass); }
  .band-text { margin: 0; flex: 1 1 240px; font-weight: 600; }
  .band-urgent { background: var(--urgent); border-color: var(--urgent); color: #fff; }
  .band-urgent #band-go { background: #fff; color: var(--urgent); border-color: #fff; }
  .band-warn { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 12%, var(--glass)); }
  .band .sum-next { flex-basis: 100%; }
  .band-urgent .sum-next { color: #fff; opacity: .85; }
```

- [ ] **Paso 2: Filas**

Reestructura `cardNode(row, index, readonly)` para que el artículo tenga estas zonas (conserva todo lo que hay dentro, solo cambia dónde va):

```js
    const card = el('article', { class: `card row ${mood} …mismas clases que hoy…`, 'data-id': row.id, style: `--c:${row.color};--i:${index}` });
    const orb = el('div', { class: 'r-orb orb-col' },
      el('div', { class: 'orb-slot', 'data-orb': row.id, role: 'img', 'aria-label': `${row.percent}% de energía` },
        el('div', { class: 'orb-flat', style: `--fill:${row.percent}%` }),
        buildRuneRing(document, litRunes(row.energy), { full: row.isFull })),
      el('p', { class: 'tick-left', 'data-full': row.isFull ? '1' : null }));
    const text = el('div', { class: 'r-text' });   // card-head (icono+nombre+clase), full-in, full-at, runs, waste, cpLine, note-preview
    const num = el('div', { class: 'r-num energy' }, el('span', { class: 'num', 'data-num': row.id }, String(display)), el('small', {}, `/ ${row.max}`));
    const act = el('div', { class: 'r-act' });     // spend buttons + «Actualizar» + «⋯»
    const below = el('div', { class: 'r-below' }); // forms (editar, extra, notas, confirmar), lista de tareas abierta, errores
    card.append(orb, text, num, act, below);
```

- La insignia «Lleno» desaparece de la cifra: al tope la cifra va en carmesí (`.card.full .num { color: var(--urgent); }`) y `.r-text` muestra «Lleno · perdiendo energía» en carmesí en lugar de «Energía al máximo».
- `.r-act` (solo si no es `readonly`/`ui.readOnly`/`ui.noDb` y no hay un formulario abierto en esa fila): los botones `button.spend` de cada preset, `button.primary` «Actualizar» y el botón «⋯».
- El menú «⋯» contiene: «+ Extra» (`class: 'extra'`), «Tareas {hechas}/{total}» (alterna `ui.tasksOpen` como hace hoy `tasksBlock`), «Notas» (`class: 'notes'`) y «Quitar» (`class: 'remove'`). Cada opción hace exactamente lo que hace hoy su botón (copia sus `onclick`) y además cierra el menú (`ui.menuFor = null`).
- `tasksBlock(row)`: separa el botón del listado. El aviso «Quedan N diarias…» va a `.r-text`; el listado (`.tasks-box`) va a `.r-below` cuando `ui.tasksOpen.has(row.id)`.
- Los formularios de editar, extra, notas y el «¿Quitar a …?» van a `.r-below` (mismo código de hoy).
- Borra el reparto antiguo en `.c-main`/`.c-side` y el `.panel` interior de la tarjeta.

Menú «⋯» (función nueva junto a `cardNode`):

```js
  // Menú de acciones secundarias de una fila. Sobrevive a los repintados: ui.menuFor guarda qué fila lo tiene abierto.
  function moreActions(row, items) {
    const open = ui.menuFor === row.id;
    const btn = el('button', { type: 'button', class: 'more-actions', 'aria-haspopup': 'menu', 'aria-expanded': String(open),
      'aria-label': `Más acciones: ${row.name}`, 'data-menu-for': row.id,
      onclick: () => { ui.menuFor = open ? null : row.id; render(); if (!open) focusMenu(row.id, 0); } }, '⋯');
    const wrap = el('div', { class: 'menu-wrap' }, btn);
    if (open) {
      const list = el('ul', { class: 'menu', role: 'menu', 'aria-label': `Acciones de ${row.name}` },
        ...items.map(([label, cls, run]) => el('li', { role: 'none' },
          el('button', { type: 'button', role: 'menuitem', class: cls, tabindex: '-1', onclick: () => { ui.menuFor = null; run(); } }, label))));
      list.addEventListener('keydown', (e) => {
        const all = [...list.querySelectorAll('[role="menuitem"]')];
        const i = all.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); ui.menuFor = null; render(); document.querySelector(`[data-menu-for="${CSS.escape(row.id)}"]`)?.focus(); }
      });
      wrap.append(list);
    }
    return wrap;
  }
  function focusMenu(id, i) { document.querySelectorAll(`[data-menu-for="${CSS.escape(id)}"] + .menu [role="menuitem"]`)[i]?.focus(); }
  // Clic fuera de cualquier menú: se cierra.
  document.addEventListener('click', (e) => {
    if (ui.menuFor && !e.target.closest('.menu-wrap')) { ui.menuFor = null; render(); }
  });
```

Añade `menuFor: null` al objeto `ui` inicial. Si `render()` vuelve a crear la fila con el menú abierto mientras el foco estaba dentro del menú, devuelve el foco al mismo índice (guarda el índice antes de repintar o, más simple, en `render()` tras pintar las tarjetas: si `ui.menuFor` y el foco se perdió a `body`, enfoca el primer elemento del menú).

- [ ] **Paso 3: CSS de las filas**

Sustituye las reglas de `.card`, `.card .panel`, `.c-main`, `.c-side`, `.orb-col`, `.orb-slot` (150 px) por:

```css
  .grid { display: flex; flex-direction: column; gap: 10px; }
  .card.row { position: relative; display: grid; grid-template-columns: 88px minmax(0, 1fr) auto auto; grid-template-areas: "orb text num act" "below below below below";
    align-items: center; gap: 4px 16px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--glass); box-shadow: var(--shadow); }
  .card.row.full { border-color: var(--urgent); }
  .card.row.near { border-color: var(--gold); }
  .r-orb { grid-area: orb; margin: 0; }
  .r-orb .orb-slot { width: 72px; height: 72px; }
  .r-text { grid-area: text; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .r-text .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .r-num { grid-area: num; text-align: right; }
  .r-num .num { font-size: 2rem; font-weight: 700; color: var(--gold-bright); font-variant-numeric: tabular-nums; }
  .card.full .r-num .num, .r-text .lost { color: var(--urgent); }
  .r-act { grid-area: act; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; max-width: 360px; }
  .r-below { grid-area: below; min-width: 0; }
  .r-below:empty { display: none; }
  .menu-wrap { position: relative; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 15; list-style: none; margin: 0; padding: 4px; min-width: 180px;
    background: var(--glass-strong); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); transform-origin: top right; }
  .menu button { width: 100%; text-align: left; border: none; background: none; border-radius: 8px; }
  .menu button.remove { color: var(--danger); }
  @media (prefers-reduced-motion: no-preference) {
    .menu { animation: menu-in 160ms var(--ease-out); }
    @keyframes menu-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
  }
  @media (max-width: 719.98px) {
    .card.row { grid-template-columns: 64px minmax(0, 1fr) auto; grid-template-areas: "orb text num" "act act act" "below below below"; }
    .r-orb .orb-slot { width: 56px; height: 56px; }
    .r-act { justify-content: flex-start; max-width: none; }
    .r-num .num { font-size: 1.5rem; }
  }
  body.compact .r-orb .orb-slot { width: 48px; height: 48px; }
  body.compact .r-text .full-at, body.compact .r-text .runs { display: none; }
```

Ajusta la posición del «+N» flotante (`.gain`) y del haz (`scene.beam`, usa el `getBoundingClientRect` del slot: no requiere cambios) para el orbe pequeño: el `.gain` va centrado sobre `.r-orb`. Revisa las reglas de `body.compact` y de `.card.enter`/`.card.near .panel` antiguas y adáptalas a `.card.row` (la animación de pulso del borde pasa a `.card.row.near`).

Las filas de otros miembros de la legión (`cardNode(r, i, true)` en `#legion`) usan la misma estructura sin `.r-act`.

- [ ] **Paso 4: Traducciones**

Añade a `FRAME` (en, it, pt): `'Gastar'`, `'Más acciones: {0}'`, `'Acciones de {0}'`, `'Lleno · perdiendo energía'`, `'{0} está al tope · pierde 15 OD cada 3 h'`, `'{0} personajes al tope · pierden 15 OD cada 3 h'`, `'{0} se llena en {1} · perderías {2} OD si no juegas antes'`, `'Nadie al tope'`, `'Nadie al tope · el próximo, {0} en {1}'`, y `'Tareas {0}/{1}'` si cambias el texto del botón de tareas. Con traducciones naturales.

- [ ] **Paso 5: Comprobar**

Run: `node --test *.test.js web/*.test.js && npm run build:web && node dev/e2e-web.mjs`
Expected: todo PASS. Las comprobaciones existentes que pulsaban «Notas», «Quitar», «+ Extra» o «Tareas» directamente en la tarjeta deben abrir primero el «⋯» de esa fila (`article[data-id="…"] button.more-actions`), sin quitar ninguna comprobación.

Añade a `dev/e2e-web.mjs`, en el bloque del usuario A tras crear su personaje:

```js
// filas: menú ⋯ con teclado y sobreviviendo a un repintado
await pa.click(`article[data-id="${charId}"] button.more-actions`);
await pa.waitForSelector(`article[data-id="${charId}"] .menu [role="menuitem"]`);
check('⋯: se abre con sus opciones', (await pa.locator(`article[data-id="${charId}"] .menu [role="menuitem"]`).count()) === 4);
await pa.evaluate(() => window.dispatchEvent(new Event('focus'))); // provoca repintados por datos/reloj
await pa.waitForTimeout(1200);
check('⋯: sigue abierto tras repintar', await pa.locator(`article[data-id="${charId}"] .menu`).isVisible());
await pa.keyboard.press('Escape');
check('⋯: Escape lo cierra y devuelve el foco al botón',
  !(await pa.locator(`article[data-id="${charId}"] .menu`).count()) && (await pa.evaluate(() => document.activeElement?.classList.contains('more-actions'))));
```

Si `focus` no provoca repintado en tu implementación, usa una acción que lo provoque con certeza (p. ej. cambiar de pestaña y volver) y déjalo explicado en un comentario.

Capturas Energía Luz/Sombra, escritorio y móvil, con un personaje al tope (banda carmesí) y otro a medias; míralas.

- [ ] **Paso 6: Commit**

```bash
git add index.html i18n-strings.js dev/e2e-web.mjs
git commit -m "feat(energia): banda de próxima decisión y un personaje por fila con menú de acciones"
```

---

### Tarea 4: Columna lateral y encaje del resto de secciones

**Files:**
- Modify: `index.html` (aside lateral, `paintEvents`, pintado de «en línea», ancho de secciones)
- Modify: `web/social-ui.js` (aviso de amigos en línea)
- Modify: `i18n-strings.js` (`FRAME`)

**Interfaces:**
- Consumes: `paintEvents` (lista `items` ya ordenada), el pintado de `#online-list` (artifact), `startSocial(ctx)` (web).
- Produces: `<aside id="side" class="side" aria-label="Resumen">` con `#side-events` y `#side-online`; `ctx.onOnline(list)` en `startSocial` (lista `[{ uid, nick }]` de amigos en línea).

- [ ] **Paso 1: Marcado y pintado**

Tras `.page`, añade `<aside id="side" class="side" aria-label="Resumen"><section><h2 class="side-h">Eventos</h2><ul id="side-events" class="side-list"></ul><button type="button" class="side-link" data-go="eventos">Ver todos</button></section><section id="side-online-box" hidden><h2 class="side-h">En línea</h2><ul id="side-online" class="side-list"></ul></section></aside>`. Los botones `[data-go]` llaman `setTab(dataset.go)` (un listener delegado en `#side`).

- En `paintEvents(now)`, tras ordenar `items`, pinta los 3 primeros en `#side-events`: nombre del evento y `o.active ? 'En curso' : countdown(o.startMs - now)` en un `<b class="num">`.
- **Artifact:** donde se pinta `#online-list`, pinta también `#side-online` (nombres) y muestra `#side-online-box` si hay alguien; el enlace lleva a `legion`.
- **Web:** en `web/social-ui.js`, en `changed()` llama `if (ctx.onOnline) ctx.onOnline(state.friends.filter((f) => f.online).map((f) => ({ uid: f.uid, nick: f.nick })))`. En `app.js`, al llamar `startSocial`, pasa `onOnline: (list) => paintSideOnline(list, 'amigos')`. Los nicks van con `translate="no"` (son texto de usuario).

```js
  function paintSideOnline(list, go) {
    $('side-online-box').hidden = list.length === 0;
    $('side-online').replaceChildren(...list.slice(0, 8).map((u) => el('li', {}, el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { translate: 'no' }, u.nick || '—'))));
    $('side-online-box').querySelector('.side-link')?.remove();
    $('side-online-box').append(el('button', { type: 'button', class: 'side-link', 'data-go': go }, 'Ver todos'));
  }
```

- [ ] **Paso 2: CSS**

```css
  .side { display: none; }
  @media (min-width: 1200px) {
    .side { display: flex; flex-direction: column; gap: 20px; position: fixed; top: 0; right: 0; bottom: 0; width: 280px; padding: 20px 16px; overflow-y: auto;
      border-left: 1px solid var(--line); background: var(--glass-strong); z-index: 10; }
    .page { margin-right: 280px; }
  }
  .side-h { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-family: var(--font-body); margin: 0 0 8px; }
  .side-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .side-list li { display: flex; justify-content: space-between; gap: 8px; align-items: center; min-width: 0; }
  .side-list li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .side-list .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
  .side-link { margin-top: 8px; min-height: 36px; padding: 4px 10px; font-size: .8125rem; }
```

- [ ] **Paso 3: Encaje del resto**

- Columna principal: `.page { max-width: 960px; }` centrada en el espacio libre entre rail y columna lateral (`margin-inline: auto` dentro de su hueco; con el `margin-left/right` fijos, usa un contenedor interior o `padding-inline: max(16px, (100vw - 220px - 280px - 960px) / 2)` en ≥ 1200 px y lo equivalente sin columna en 900–1199 px). Elige lo más simple que no cree scroll horizontal.
- Ajustes y Novedades mantienen `columns: 2 360px` (ya existe en `#tab-ajustes, #tab-novedades`).
- Eventos, Estadísticas, Legión, Amigos, Chat y Buscar no cambian su contenido.

- [ ] **Paso 4: Traducciones**

Añade a `FRAME` (en, it, pt): `'Resumen'`, `'Ver todos'`, `'En línea'`, `'En curso'` (si no existen ya).

- [ ] **Paso 5: Comprobar y commit**

Run: `node --test *.test.js web/*.test.js && npm run build:web && node dev/e2e-web.mjs`
Expected: todo PASS. Captura a 1440×900 (con columna) y 1000×800 (sin columna) en ambos temas, con una sección distinta de Energía (p. ej. Legión) para ver el encaje; míralas.

```bash
git add index.html web/social-ui.js i18n-strings.js
git commit -m "feat(marco): columna lateral con eventos y en línea, y secciones encajadas en el marco"
```

---

### Tarea 5: E2E del marco, capturas y documentación

**Files:**
- Modify: `dev/e2e-web.mjs`
- Modify: `DESIGN.md`, `.impeccable/surfaces/index-html.md`
- Add: capturas `dev/screens/marco-*.png`

**Interfaces:**
- Consumes: todo lo anterior (selectores `#topnav [data-tab]`, `[data-more]`, `#more-sheet`, `#summary.band-urgent`, `article.card.row`, `button.more-actions`).

- [ ] **Paso 1: Comprobaciones E2E nuevas**

Añade al final de la sección social (o en un bloque propio con un usuario nuevo si los límites de registro lo permiten; si no, reutiliza un usuario ya creado y explícalo):

```js
// ================= Marco: rail, barra inferior, Más, banda, anchuras =================
{
  const p = pc; // usuario ya autenticado con al menos un personaje (crea uno si no lo tiene)
  await p.setViewportSize({ width: 1280, height: 900 });
  check('rail: visible a 1280 px con Energía activa', await p.locator('#topnav').evaluate((n) => getComputedStyle(n).flexDirection === 'column')
    && (await p.getAttribute('#topnav [data-tab="personajes"]', 'aria-current')) === 'page');
  await p.click('#topnav [data-tab="legion"]');
  check('rail: navega a Legión', !(await p.locator('#tab-legion').isHidden()));

  await p.setViewportSize({ width: 390, height: 844 });
  check('móvil: barra inferior con 4 secciones + Más', (await p.locator('#topnav [data-tab]:visible').count()) === 4 && await p.locator('#topnav [data-more]').isVisible());
  check('móvil: Legión (en Más) marca el botón Más', (await p.getAttribute('#topnav [data-more]', 'aria-current')) === 'page');
  await p.click('#topnav [data-more]');
  await p.waitForSelector('#more-sheet[open]');
  await p.click('#more-sheet [data-tab="ajustes"]');
  check('Más: abre Ajustes y se cierra', !(await p.locator('#tab-ajustes').isHidden()) && !(await p.locator('#more-sheet[open]').count()));

  // Review Focus 1: redimensionar con la hoja abierta
  await p.click('#topnav [data-more]');
  await p.waitForSelector('#more-sheet[open]');
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.waitForTimeout(300);
  check('redimensionar con Más abierto: se cierra y el rail sigue usable', !(await p.locator('#more-sheet[open]').count()) && await p.locator('#topnav [data-tab="eventos"]').isEnabled());
  await p.click('#topnav [data-tab="personajes"]');

  // Review Focus 4 y 5: 375 px, nombre largo, último botón pulsable
  await p.setViewportSize({ width: 375, height: 700 });
  check('375 px: sin scroll horizontal en Energía', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const lastBtn = p.locator('article.card button.primary').last();
  await lastBtn.scrollIntoViewIfNeeded();
  const box = await lastBtn.boundingBox();
  const barTop = await p.locator('#topnav').evaluate((n) => n.getBoundingClientRect().top);
  check('390 px: el último botón no queda tapado por la barra', !!box && box.y + box.height <= barTop);
  await p.setViewportSize({ width: 1280, height: 900 });
}
```

Además, en el bloque del usuario A (que tiene un personaje), pon su energía a 840 y comprueba la banda:

```js
check('banda: carmesí con un personaje al tope', await pa.locator('#summary.band-urgent').isVisible() && /al tope/.test(await text(pa, '#sum-tip')));
```

(colócala justo después de un paso que deje un personaje a 840; si no lo hay, añade uno con `#energy-<id>` = 840).

Para un nombre largo: crea o renombra un personaje con 40 caracteres sin espacios antes de la comprobación de 375 px.

- [ ] **Paso 2: Ejecutar**

Run: `node dev/e2e-web.mjs`
Expected: todas `✔`, incluidas las de CSP y consola.

- [ ] **Paso 3: Capturas**

Con `dev/preview.mjs` (servidor estático en Node): `dev/screens/marco-{elyos,asmodian}-{desktop,mobile}.png` (Energía con banda y filas), `dev/screens/marco-asmodian-mas.png` (hoja «Más» abierta) y `dev/screens/marco-elyos-1440.png` (con columna lateral). Míralas todas y corrige lo que se vea mal antes del commit.

- [ ] **Paso 4: Documentación**

- `DESIGN.md`: nueva sección «Marco» (rail 220 px ≥ 900 px, barra inferior < 900 px con «Más», columna lateral 280 px ≥ 1200 px, cabecera compacta) y actualiza «Componentes» con la banda (3 tonos), la fila de personaje (zonas y tamaños de orbe 72/56/48 px) y el menú «⋯». Valores copiados del CSS.
- `.impeccable/surfaces/index-html.md`: en FIRST VIEWPORT, sustituye la barra de pestañas por el rail/barra inferior y las tarjetas por filas con banda de próxima decisión.

- [ ] **Paso 5: Pruebas finales y commit**

Run: `node --test *.test.js web/*.test.js && npm run build:web && (cd server && npm test) && node dev/e2e-web.mjs`
Expected: unitarias PASS; servidor solo con los 2 fallos conocidos de Windows; E2E todo `✔`.

```bash
git add dev/e2e-web.mjs DESIGN.md .impeccable/surfaces/index-html.md dev/screens/marco-*.png
git commit -m "test(e2e): marco y filas; docs: DESIGN.md con rail, barra inferior, banda y filas"
```
