# Social (cliente) y temas de facción — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la web de Odyle tenga temas Elyos (claro) y Asmodian (oscuro) con un botón «Luz / Sombra», la energía como orbe de éter con un anillo de 56 runas, y las pantallas de Amigos, Chat en vivo, Buscar, Perfil de jugador y privacidad sobre la API social ya construida (Plan 1, PR #1).

**Architecture:** Los colores salen de variables CSS por facción en `index.html` (`:root[data-faction=…]`); `theme.js` decide qué tema aplica y qué colores usa el 3D. `runes.js` define el anillo de 56 runas (lógica pura + SVG para el orbe plano), y `orb.js` lo pinta en 3D. Lo social es solo web: `web/social-api.js` (script clásico, `window.odyleSocialApi`, fetch + EventSource con reconexión) y módulos ES `web/social-*.js` que `app.js` carga con `import('./social-ui.js')` solo si existe `window.odyleSocialApi`. La lógica pura (orden, fusión de mensajes, validaciones) vive en `social.js` y se prueba con `node --test`.

**Tech Stack:** HTML/CSS/JS sin framework, módulos ES, Three.js 0.160 vendorizado, `node --test`, Playwright (E2E), Fastify 5 + PostgreSQL (servidor ya hecho).

**Spec:** `docs/superpowers/specs/2026-10-13-social-y-facciones-design.md` (§6 dirección visual, §7 interfaz, §8 errores, §9 pruebas). La API exacta está en el código del servidor: `server/src/routes/{profiles,friends,messages,reports,stream}.js` y `server/src/lib/social-events.js`.

## Global Constraints

- Rama de trabajo: `feat/social-ui`, creada desde `feat/social-y-facciones` (el PR #1 aún no está fusionado).
- Sitio de fans: nada de logos, arte, iconos ni capturas de NCSOFT. Runas, iconos y orbes son dibujos propios.
- CSP estricta y Trusted Types `'none'`: prohibido `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `DOMParser`. `setTimeout`/`setInterval` siempre con una función flecha (nunca un nombre suelto ni una cadena). `import()` solo con una cadena literal. Lo comprueba `server/test/attacks/xss-dom-sinks.test.js` sobre `server/public`.
- Texto siempre con `textContent`, `append` o nodos de texto. El texto escrito por usuarios (nick, bio, servidor, legión, mensajes, título de invitación, nombres de personaje) va en un elemento con `translate="no"`. Nunca se junta texto de la interfaz y texto de usuario en el mismo nodo de texto: van en `span` separados.
- Cada texto de la interfaz en `web/social-*.js` se escribe como `S('…')` (marcador identidad de `social-dom.js`) y se traduce en `i18n-strings.js` para `en`, `it` y `pt`. Las plantillas con números usan `fmt(S('{0} en línea'), n)`; la traducción en vivo de `i18n.js` reconoce `{0}`.
- Colores solo por variables CSS. Valores exactos de la spec:
  - **Elyos (claro):** fondo `#EEF3F8`, paneles `#FFFFFF`, texto `#14213A` / `#4A5770`, oro `#A87A1E`, azul celeste `#2E6FB0`, carmesí urgente `#B4232F`, filetes de oro fino.
  - **Asmodian (oscuro):** fondo `#120D17`, paneles `#1D1524`, texto `#EDE6F2` / `#B5A9C4`, violeta `#9B6BD6`, plata `#C9C3D6`, carmesí urgente `#E0455A`, filetes de plata fina.
- Letra: Cinzel (títulos y nombres) y Figtree (texto), ya servidas desde `server/public/fonts`. Números tabulares (`font-variant-numeric: tabular-nums`).
- Movimiento (Emil Kowalski): botones con `:active { transform: scale(0.97) }`; curva `cubic-bezier(0.23, 1, 0.32, 1)`; menos de 300 ms; hover solo dentro de `@media (hover: hover) and (pointer: fine)`; con `prefers-reduced-motion: reduce` no hay animaciones. El cambio de tema es instantáneo, sin animación.
- Atributo del tema: se mantiene `data-faction` en `<html>` (ya existe; la spec dice `data-faccion`, es el mismo papel).
- Commits sin la línea `Co-Authored-By` de Claude.
- Pruebas: `npm test` en la raíz ejecuta `node --test` (también recorre `server/test`). En Windows hay **2 fallos previos conocidos** que no son de esta rama: `server/test/app.test.js` (grep con ruta `/C:/`) y `server/test/pages.test.js` (`/AUTH.HTML` da 403). Cualquier otro fallo es tuyo. Las pruebas de `server/test` que leen `server/public` necesitan `npm run build:web` antes.
- Playwright en Windows: no hay `/opt/npm-tools`. La Tarea 2 crea `dev/pw.mjs`; instala el paquete sin guardarlo (`npm i --no-save playwright`) y, si el navegador no coincide, `npx playwright install chromium`.

## Review Focus

1. **Texto de usuario igual a un texto de la interfaz** (un mensaje «Amigos», un nick «Chat»): al cambiar de idioma la traducción en vivo lo reescribiría. Debe quedar literal (`translate="no"`). Lo fija la comprobación E2E «mensaje literal en inglés» de la Tarea 10.
2. **Corte del canal en vivo** (el token dura 15 min y el servidor cierra el stream; también reinicios): reconexión con espera 1, 2, 4… hasta 30 s, renovación de sesión y recarga de conversaciones, sin mensajes duplicados. Lo fijan `web/social-api.test.js` (Tarea 5) y las pruebas de `mergeMessages`/`applyIncoming` (Tarea 4).
3. **Mensaje de alguien sin conversación previa o mientras otra está abierta**: aparece arriba con 1 sin leer; si es la conversación abierta, no cuenta. Lo fija la prueba de `applyIncoming` (Tarea 4).
4. **Mensaje muy largo sin espacios o con saltos de línea**: se parte dentro de la burbuja y no hay scroll horizontal a 375 px. Lo fija la comprobación E2E de anchura (Tarea 10).
5. **Guardar el perfil con otra facción no cambia el tema elegido**, y el tema sobrevive a recargar. Lo fijan las pruebas de `resolveTheme` (Tarea 1) y la comprobación E2E de tema (Tarea 10).

---

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `theme.js` (+ `theme.test.js`) | Temas, orden de preferencia, colores del 3D | 1 |
| `index.html` | Variables por facción, botón Luz/Sombra, anillo de runas en el orbe plano, pestañas sociales, privacidad en el perfil | 2, 3, 6 |
| `dev/pw.mjs` | Carga Playwright en Windows y en Linux | 2 |
| `.impeccable/surfaces/index-html.md` | Contrato de dirección Aion 2 (sustituye «laca y nácar») | 2 |
| `runes.js` (+ `runes.test.js`) | 56 runas: cuántas lucen, posiciones, glifos, SVG | 3 |
| `orb.js`, `dev/orb-smoke.*` | Anillo 3D de 56 runas, pulso urgente, colores por tema | 3 |
| `motion.js`, `motion.test.js` | Quitar `RUNES`/`runesLit` (anillo por tiempo) si quedan sin uso | 3 |
| `social.js` (+ `social.test.js`) | Lógica pura de amigos, chat y búsqueda | 4 |
| `web/social-api.js` (+ `web/social-api.test.js`) | REST + EventSource con reconexión | 5 |
| `scripts/build-web.mjs` | Copia `web/*.js`/`*.css`, añade `<script src="social-api.js">` y `social.css` | 5, 6 |
| `server/test/pages.test.js` | Orden de scripts con `social-api.js` | 5 |
| `legion.js`, `legion.test.js` | `parseProfile` conserva `searchable` y `shareEnergy` | 6 |
| `web/social-dom.js` | `el`, `S`, `fmt`, avatar, línea de persona, orbe pequeño, horas | 6 |
| `web/social-ui.js` | Estado compartido, canal en vivo, insignias, registro de pantallas | 6 |
| `web/social.css` | Estilos de las pantallas sociales | 6–9 |
| `i18n-social.test.js` | Todo `S('…')` está traducido | 6 |
| `i18n-strings.js` | Bloque `SOCIAL` con en/it/pt | 2, 6–9 |
| `web/social-profile.js` | Ficha de jugador (diálogo) con acciones y denuncia | 7 |
| `web/social-friends.js` | Pantalla Amigos | 7 |
| `web/social-search.js` | Pantalla Buscar | 8 |
| `web/social-chat.js` | Pantalla Chat | 9 |
| `dev/e2e-web.mjs` | Dos usuarios: buscar, amistad, chat en vivo, bloqueo, tema | 10 |
| `DESIGN.md`, `.impeccable/design.json`, `README.md`, `PRODUCT.md` | Documentación final | 11 |

## Decisiones tomadas al planificar (rulings)

- **Navegación:** la app actual usa una barra de pestañas (`TABS` en `index.html`), no el rail del prototipo. En este plan las pantallas sociales son pestañas nuevas (Amigos, Chat, Buscar) en esa barra; el rail/barra inferior llega con la integración del resto de la app (paso posterior de la spec). El botón «Luz / Sombra» va en la cabecera (donde estaría el rail), en Ajustes → Apariencia y en el diálogo de Perfil. *Coste si es incorrecto:* mover el botón cuando exista el rail.
- **Tema en el artifact:** `index.html` es compartido; los temas también se ven en la versión artifact. Lo social no (sin `window.odyleSocialApi` no se carga). *Coste:* ninguno funcional.
- **Preferencia heredada:** hoy el tema se guarda en `prefs.faction` y se cambia al guardar el perfil. Ahora manda `prefs.theme`; `prefs.faction` solo se lee como respaldo y guardar el perfil ya no toca el tema.
- **Orbe pequeño de amigos:** siempre plano (CSS + anillo SVG en modo puntos), nunca WebGL. La lista de amigos pide como mucho 20 perfiles al abrir la pestaña y los guarda 5 minutos (límite del servidor: 60/min).
- **Energía de otros:** el servidor da `energy` y `recordedAt`; se proyecta con la hora de recarga del que mira (las recargas son del servidor del juego, iguales para todos). Sin hora de recarga, se muestra el valor guardado.
- **Backoff:** vive solo en `web/social-api.js` (script clásico, probado con `node:vm`), no en `social.js`.

---

### Tarea 0: Rama de trabajo

- [ ] **Paso 1: Crear la rama**

```bash
cd C:/Users/Salty/Desktop/Odyle-web-tracker
git checkout feat/social-y-facciones && git pull --ff-only
git checkout -b feat/social-ui
npm ci && (cd server && npm ci) && npm run build:web
```

- [ ] **Paso 2: Línea base**

Run: `npm test 2>&1 | tail -15`
Expected: solo los 2 fallos conocidos de Windows (ver Global Constraints).

---

### Tarea 1: `theme.js` — qué tema aplica

**Files:**
- Create: `theme.js`
- Test: `theme.test.js`
- Modify: `scripts/build-web.mjs` (lista `EXPECTED`)

**Interfaces:**
- Produces: `THEMES` (`{ elyos, asmodian }`, cada uno `{ id, label, subtitle, themeColor, light, orb: { primary, secondary, urgent } }`), `resolveTheme({ prefs, profile, cached }) → 'elyos'|'asmodian'`, `otherTheme(t)`, `themeOf(t)`.

- [ ] **Paso 1: Escribir la prueba**

```js
// theme.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, resolveTheme, otherTheme, themeOf } from './theme.js';

test('prefs.theme (el botón libre) manda sobre todo lo demás', () => {
  assert.equal(resolveTheme({ prefs: { theme: 'asmodian', faction: 'elyos' }, profile: { faction: 'elyos' }, cached: 'elyos' }), 'asmodian');
});
test('sin prefs.theme: la elección antigua prefs.faction, luego la facción del perfil, luego la caché, luego Elyos', () => {
  assert.equal(resolveTheme({ prefs: { faction: 'asmodian' }, profile: { faction: 'elyos' } }), 'asmodian');
  assert.equal(resolveTheme({ prefs: {}, profile: { faction: 'asmodian' } }), 'asmodian');
  assert.equal(resolveTheme({ prefs: {}, profile: {}, cached: 'asmodian' }), 'asmodian');
  assert.equal(resolveTheme({}), 'elyos');
  assert.equal(resolveTheme(), 'elyos');
});
test('guardar el perfil con otra facción no cambia un tema ya elegido', () => {
  assert.equal(resolveTheme({ prefs: { theme: 'elyos' }, profile: { faction: 'asmodian' } }), 'elyos');
});
test('valores raros se ignoran', () => {
  assert.equal(resolveTheme({ prefs: { theme: 'dark', faction: 42 }, profile: { faction: '<b>' }, cached: 'x' }), 'elyos');
});
test('otherTheme y themeOf', () => {
  assert.equal(otherTheme('elyos'), 'asmodian');
  assert.equal(otherTheme('asmodian'), 'elyos');
  assert.equal(otherTheme('zzz'), 'asmodian');
  assert.equal(themeOf('asmodian'), THEMES.asmodian);
  assert.equal(themeOf('zzz'), THEMES.elyos);
});
test('colores de la spec', () => {
  assert.deepEqual(THEMES.elyos.orb, { primary: '#A87A1E', secondary: '#2E6FB0', urgent: '#B4232F' });
  assert.deepEqual(THEMES.asmodian.orb, { primary: '#9B6BD6', secondary: '#C9C3D6', urgent: '#E0455A' });
  assert.equal(THEMES.elyos.light, true);
  assert.equal(THEMES.asmodian.light, false);
  assert.equal(THEMES.elyos.themeColor, '#EEF3F8');
  assert.equal(THEMES.asmodian.themeColor, '#120D17');
});
```

- [ ] **Paso 2: Ver que falla**

Run: `node --test theme.test.js`
Expected: FAIL (`Cannot find module './theme.js'`).

- [ ] **Paso 3: Implementar**

```js
// theme.js
// Faction themes: Elyos (light) and Asmodian (dark). The colours themselves live in CSS variables
// (index.html, :root[data-faction=…]); this module decides which theme applies and feeds the 3D scene.
export const THEMES = {
  elyos: {
    id: 'elyos', label: 'Luz', subtitle: 'Daevas de Elyos', themeColor: '#EEF3F8', light: true,
    orb: { primary: '#A87A1E', secondary: '#2E6FB0', urgent: '#B4232F' },
  },
  asmodian: {
    id: 'asmodian', label: 'Sombra', subtitle: 'Daevas de Asmodae', themeColor: '#120D17', light: false,
    orb: { primary: '#9B6BD6', secondary: '#C9C3D6', urgent: '#E0455A' },
  },
};

const isTheme = (v) => v === 'elyos' || v === 'asmodian';

// The free "Luz / Sombra" button (prefs.theme) wins; then the old prefs.faction choice; then the
// profile's faction; then the last theme this device applied; else Elyos.
export function resolveTheme({ prefs, profile, cached } = {}) {
  if (prefs && isTheme(prefs.theme)) return prefs.theme;
  if (prefs && isTheme(prefs.faction)) return prefs.faction;
  if (profile && isTheme(profile.faction)) return profile.faction;
  if (isTheme(cached)) return cached;
  return 'elyos';
}

export const otherTheme = (t) => (t === 'asmodian' ? 'elyos' : 'asmodian');
export const themeOf = (t) => THEMES[isTheme(t) ? t : 'elyos'];
```

- [ ] **Paso 4: Añadir a la compilación**

En `scripts/build-web.mjs`, añade `'theme.js'` al final del array `EXPECTED`.

- [ ] **Paso 5: Ver que pasa**

Run: `node --test theme.test.js && npm run build:web`
Expected: PASS y `build-web: server/public listo`.

- [ ] **Paso 6: Commit**

```bash
git add theme.js theme.test.js scripts/build-web.mjs
git commit -m "feat(tema): theme.js decide entre Elyos y Asmodian"
```

---

### Tarea 2: Variables por facción y botón «Luz / Sombra»

**Files:**
- Modify: `index.html` (CSS `:root`, colores fijos, cabecera, Apariencia, diálogo de perfil, `applyFaction`, oyente de `prefs`, envío del perfil)
- Create: `dev/pw.mjs`
- Modify: `dev/e2e.mjs`, `dev/e2e-web.mjs`, `dev/orb-smoke.mjs`, `dev/preview.mjs` (carga de Playwright)
- Modify: `orb.js` (`setPalette` acepta `urgent` y `light`)
- Modify: `i18n-strings.js` (textos nuevos)
- Rewrite: `.impeccable/surfaces/index-html.md`

**Interfaces:**
- Consumes: `THEMES`, `resolveTheme`, `otherTheme`, `themeOf` (Tarea 1).
- Produces: variables CSS por facción (lista abajo; las usan las Tareas 3 y 6–9), `applyTheme(t, { save })` dentro de `app.js`, botones `[data-theme-choice="elyos|asmodian"]` con `aria-pressed`, `scene.setPalette({ primary, secondary, urgent, light })`.

- [ ] **Paso 1: Cargador de Playwright**

```js
// dev/pw.mjs
// Carga Playwright: primero el paquete local (npm i --no-save playwright), si no, el de /opt/npm-tools (Linux).
import { createRequire } from 'node:module';

export async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch { /* no instalado en este equipo */ }
  return createRequire('/opt/npm-tools/node_modules/')('playwright').chromium;
}
```

En `dev/e2e.mjs`, `dev/e2e-web.mjs`, `dev/orb-smoke.mjs` y `dev/preview.mjs` sustituye las dos líneas

```js
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
```

por

```js
import { loadChromium } from './pw.mjs';
const chromium = await loadChromium();
```

(quita el `import { createRequire }` si ya no se usa en ese archivo). Instala: `npm i --no-save playwright` y comprueba con `node -e "import('playwright').then(m=>console.log(typeof m.chromium.launch))"` → `function`.

- [ ] **Paso 2: Variables por facción**

Sustituye en `index.html` los bloques `:root { … }`, `:root[data-faction="asmodian"] { … }` y las dos líneas de `color-scheme` con `data-theme` por:

```css
  /* Aion 2, two factions. Elyos: dawn sky over the floating isles (light). Asmodian: the Abyss's
     eternal violet dusk (dark). Every colour below is a token; nothing else in the page hard-codes one. */
  :root, :root[data-faction="elyos"] {
    --bg: #EEF3F8; --bg-2: #DCE7F3;
    --glass: rgba(255, 255, 255, .88); --glass-strong: #FFFFFF;
    --fg: #14213A; --muted: #4A5770;
    --line: rgba(168, 122, 30, .35);
    --gold: #A87A1E; --gold-bright: #8A6212; --sky: #2E6FB0; --on-gold: #FFFFFF;
    --danger: #B4232F; --urgent: #B4232F;
    --field: #FFFFFF; --hover: rgba(20, 33, 58, .05); --track: rgba(20, 33, 58, .12);
    --glow: rgba(168, 122, 30, .22); --ok: #1E7A4C; --warn: #A2560B; --scrim: rgba(20, 33, 58, .35);
    --shadow: 0 1px 2px rgba(20, 33, 58, .08), 0 8px 24px rgba(20, 33, 58, .08);
    --font-display: "Cinzel", "Trajan Pro", Georgia, serif;
    --font-body: "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    color-scheme: light;
  }
  :root[data-faction="asmodian"] {
    --bg: #120D17; --bg-2: #241830;
    --glass: rgba(29, 21, 36, .88); --glass-strong: #1D1524;
    --fg: #EDE6F2; --muted: #B5A9C4;
    --line: rgba(201, 195, 214, .28);
    --gold: #9B6BD6; --gold-bright: #C9A8F0; --sky: #C9C3D6; --on-gold: #120D17;
    --danger: #E0455A; --urgent: #E0455A;
    --field: #150F1B; --hover: rgba(237, 230, 242, .05); --track: rgba(237, 230, 242, .12);
    --glow: rgba(155, 107, 214, .35); --ok: #7EE2A8; --warn: #FFB35C; --scrim: rgba(0, 0, 0, .55);
    --shadow: 0 8px 24px rgba(0, 0, 0, .35);
    color-scheme: dark;
  }
```

`--gold` es el acento de la facción (oro en Elyos, violeta en Asmodian). `--gold-bright` es el mismo acento con contraste AA para texto. `--sky` es el acento secundario (celeste en Elyos, plata en Asmodian). Se conservan los nombres antiguos para no tocar cientos de reglas.

- [ ] **Paso 3: Quitar todos los colores fijos del CSS**

Dentro del `<style>` de `index.html`, sustituye cada color fijo según esta tabla (`A` es la opacidad original en %):

| Color fijo | Sustituto |
|---|---|
| `rgba(232, 184, 90, A)` (oro antiguo) | `color-mix(in srgb, var(--gold) A%, transparent)` |
| `rgba(255, 217, 138, A)` en `.card.full` | `color-mix(in srgb, var(--urgent) A%, transparent)` y `border-color: var(--urgent)` |
| `rgba(255, 217, 138, A)` (resto) | `color-mix(in srgb, var(--gold-bright) A%, transparent)` |
| `rgba(124, 200, 255, A)` | `color-mix(in srgb, var(--sky) A%, transparent)` |
| `rgba(255, 255, 255, .03/.04/.05)` | `var(--hover)` |
| `rgba(169, 179, 200, .15)` | `var(--track)` |
| `rgba(5, 9, 20, .7)` (campos) | `var(--field)` |
| `#0c1630` (fondo de `option`) | `var(--glass-strong)` |
| `rgba(2, 4, 10, .55)`, `rgba(5, 9, 20, .45)`, `rgba(0, 0, 0, .5)` | `var(--scrim)` |
| `#7ee2a8` | `var(--ok)` |
| `#ffb35c` | `var(--warn)` |
| `rgba(243, 236, 220, A)` | `color-mix(in srgb, var(--fg) A%, transparent)` |
| `text-shadow` con brillo dorado | `text-shadow: 0 0 18px var(--glow)` |
| `button.primary` con degradado | `background: var(--gold-bright); color: var(--on-gold); border-color: var(--gold-bright); box-shadow: none;` |

Además:
- `.card.full .panel` usa `var(--urgent)` (al tope = carmesí, spec §6).
- Los paneles: `box-shadow: var(--shadow)`.
- Los botones: añade `transition: transform 160ms var(--ease-out), border-color .2s, background-color .2s;` y `button:active { transform: scale(0.97); }` (sustituye el `translateY(1px)`), y mueve `button:hover` y `.topnav button:hover` dentro de `@media (hover: hover) and (pointer: fine) { … }`.
- Los colores de clase (`classes.js`) son pastel: úsalos solo como relleno (orbe, puntos), nunca como color de texto sobre el fondo claro. Si alguna regla los usa como texto, cámbiala a `var(--fg)` con un punto de color al lado.

Comprobación: `sed -n '/<style>/,/<\/style>/p' index.html | grep -nE "rgba\(|#[0-9a-fA-F]{3,6}\b" | grep -v "^\s*[0-9]*:\s*--"` no debe mostrar nada fuera de las definiciones de variables (salvo `#fff` dentro de un `radial-gradient` de brillo del orbe plano, que puedes dejar como `rgba(255,255,255,.35)` porque es reflejo de luz en ambos temas).

- [ ] **Paso 4: Botón «Luz / Sombra»**

En la cabecera de `index.html`, justo antes de `<button type="button" id="profile-chip"`, añade el contenedor:

```html
    <div class="theme-slot" id="theme-slot-header"></div>
```

En la sección Apariencia, sustituye el bloque `<div class="row" role="radiogroup" aria-label="Facción">…</div>` por:

```html
    <div class="theme-slot" id="theme-slot-look"></div>
```

En el diálogo de perfil, después de la fila de servidor y facción (`<div class="field"><label for="profile-faction">…</div>` y su `</div>` de fila), añade:

```html
    <div class="field"><span class="label-like">Tema</span><div class="theme-slot" id="theme-slot-profile"></div></div>
```

CSS (dentro del `<style>`):

```css
  /* ---- Theme switch "Luz / Sombra": two pressed-state buttons, no page animation ---- */
  .theme-switch { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 3px; gap: 2px; background: var(--glass); }
  .theme-switch button { min-height: 34px; padding: 4px 14px; border: none; border-radius: 999px; background: none; color: var(--muted); font-family: var(--font-display); letter-spacing: .04em; }
  .theme-switch button[aria-pressed="true"] { background: var(--gold-bright); color: var(--on-gold); }
  .label-like { font-size: .8125rem; font-weight: 500; color: var(--muted); }
```

JS: en `app.js` (el `<script type="module">`), importa `import { THEMES, resolveTheme, otherTheme, themeOf } from './theme.js';` y sustituye `FACTIONS` y `applyFaction` por:

```js
  // ---- Theme: Elyos (light) or Asmodian (dark), free choice saved in prefs.theme ----
  let theme = 'elyos';
  try { theme = resolveTheme({ cached: localStorage.getItem('odyle-theme') }); } catch {}
  function themeSwitch() {
    const group = el('div', { class: 'theme-switch', role: 'group', 'aria-label': 'Tema' });
    for (const t of ['elyos', 'asmodian']) {
      group.append(el('button', { type: 'button', 'data-theme-choice': t, 'aria-pressed': 'false',
        onclick: () => applyTheme(t, { persist: true }) }, THEMES[t].label));
    }
    return group;
  }
  for (const id of ['theme-slot-header', 'theme-slot-look', 'theme-slot-profile']) $(id).append(themeSwitch());
  function applyTheme(t, { persist = false } = {}) {
    const th = themeOf(t);
    theme = th.id;
    document.documentElement.dataset.faction = th.id;
    $('subtitle').textContent = th.subtitle;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', th.themeColor);
    for (const b of document.querySelectorAll('[data-theme-choice]')) b.setAttribute('aria-pressed', String(b.dataset.themeChoice === th.id));
    if (scene) scene.setPalette({ ...th.orb, light: th.light });
    try { localStorage.setItem('odyle-theme', th.id); } catch {}
    if (persist && my && !ui.readOnly && state.prefs.theme !== th.id) {
      state.prefs = { ...state.prefs, theme: th.id };
      save(() => db.doc(my.prefs).set({ ...state.prefs }));
    }
  }
  applyTheme(theme);
```

El parámetro se llama `persist` (no `save`) para no tapar la función `save` de la página.

Añade en `<head>` (después de `<meta charset>`): `<meta name="theme-color" content="#EEF3F8">` y `<meta name="viewport" content="width=device-width, initial-scale=1">` si no existe.

Cambios en el resto de `app.js`:
- `initScene`: `scene.setPalette({ ...themeOf(theme).orb, light: themeOf(theme).light });` en lugar de `FACTIONS[...]`.
- Estado inicial: en `state.prefs` quita `faction: 'elyos'`.
- Oyente de `db.doc(my.prefs).onSnapshot`: en lugar de `faction: d.faction === 'asmodian' ? … : 'elyos'` guarda `...(d.theme === 'elyos' || d.theme === 'asmodian' ? { theme: d.theme } : {})` y `...(d.faction === 'elyos' || d.faction === 'asmodian' ? { faction: d.faction } : {})`, y llama `applyTheme(resolveTheme({ prefs: d, profile: myProfile() }))` en lugar de `applyFaction(...)`.
- Borra el oyente de las radios `name="faction"` (líneas que hacían `state.prefs = { ...state.prefs, faction: e.target.value }`).
- Envío del perfil: borra el bloque `if (r.value.faction !== state.prefs.faction) { applyFaction(...); … }`. Guardar el perfil ya no cambia el tema.
- `openProfile`: `$('profile-faction').value = prof.faction || theme;`.

`orb.js`: cambia `setPalette` para aceptar `{ primary, secondary, urgent, light }`. Añade `const URGENT = new THREE.Color('#E0455A');` junto a `GOLD`/`SKY`, `URGENT.set(urgent || primary)` en `setPalette`, y guarda `let lightMode = false` que la Tarea 3 usa para las mezclas. Con `light: true` cambia `blending` a `THREE.NormalBlending` en todos los materiales creados con `THREE.AdditiveBlending` (guárdalos en un array `glowMats` al crearlos) y `mat.needsUpdate = true`; con `light: false` vuelve a `AdditiveBlending`. Sobre fondo claro la mezcla aditiva desaparece.

- [ ] **Paso 5: Traducciones**

Al final de `i18n-strings.js` añade (si alguna clave ya existe, no la dupliques):

```js
// Theme switch (2026-10-14).
const THEME = {
  en: { Luz: 'Light', Sombra: 'Shadow', Tema: 'Theme', 'Daevas de Elyos': 'Daevas of Elyos', 'Daevas de Asmodae': 'Daevas of Asmodae' },
  it: { Luz: 'Luce', Sombra: 'Ombra', Tema: 'Tema', 'Daevas de Elyos': 'Daeva di Elyos', 'Daevas de Asmodae': 'Daeva di Asmodae' },
  pt: { Luz: 'Luz', Sombra: 'Sombra', Tema: 'Tema', 'Daevas de Elyos': 'Daevas de Elyos', 'Daevas de Asmodae': 'Daevas de Asmodae' },
};
for (const l of Object.keys(THEME)) for (const [k, v] of Object.entries(THEME[l])) if (!(k in STRINGS[l])) STRINGS[l][k] = v;
```

- [ ] **Paso 6: Contrato de dirección**

Sustituye entero `.impeccable/surfaces/index-html.md` por:

```markdown
---
version: 2
slug: "index-html"
primary_target: "index.html"
related_targets: ["web/auth.html", "web/social.css"]
---

# Surface brief: Odyle Tracker (web), Aion 2 por facciones

Scope: tracker de energía y pantallas sociales (Amigos, Chat, Buscar, Perfil de jugador) de la versión web. Escritorio y móvil por igual.
Mode: Operate. Build path: code-led. Sustituye la dirección «laca y nácar» (v1); la elección del usuario (2026-10-13) manda sobre la tirada.

## Direction contract

THESIS: La energía es éter. Cada personaje es un orbe con un anillo de 56 runas propias, una por cada +15 OD; el tope se ve antes que nada. El mundo es Aion 2 y cambia de cielo según el bando que elijas.

OWN-WORLD:
- Elyos (Luz): cielo al alba sobre islas flotantes. Fondo #EEF3F8, paneles #FFFFFF, texto #14213A / #4A5770, oro #A87A1E, celeste #2E6FB0, filetes de oro fino, urgente carmesí #B4232F. Orbe de luz dorada y celeste.
- Asmodian (Sombra): crepúsculo violeta del Abismo. Fondo #120D17, paneles #1D1524, texto #EDE6F2 / #B5A9C4, violeta #9B6BD6, plata #C9C3D6, filetes de plata fina, urgente carmesí #E0455A. Orbe violeta y carmesí.
- Cinzel para títulos y nombres, Figtree para texto, números tabulares.

STORY: El jugador ve quién está al tope o a punto, juega con ese personaje, gasta con un preset, mira eventos, y queda con sus amigos por chat para una mazmorra.

FIRST VIEWPORT: Cabecera con título, reloj de próxima recarga, botón Luz/Sombra y ficha de perfil; barra de pestañas (Personajes, Eventos, Estadísticas, Amigos, Chat, Buscar, Legión, Ajustes, Novedades) con insignias de no leídos y solicitudes; tarjetas de personaje con orbe y anillo de runas, número grande tabular.
Signature move: el anillo de 56 runas que se enciende con la energía y late en carmesí al tope.

CONSTRAINTS: Sitio de fans: nada de logos, arte ni iconos de NCSOFT. CSP estricta, sin innerHTML. El cambio de tema es instantáneo. Sin WebGL o con «reducir movimiento»: orbe plano en CSS con el mismo anillo en SVG, sin partículas ni animación.
```

- [ ] **Paso 7: Capturas de los dos temas**

Sirve la raíz del repo (`python -m http.server 8123` en otra terminal, o `py -m http.server 8123`) y usa `dev/preview.mjs` para sacar escritorio (1280×900) y móvil (390×844) con cada tema. Para Asmodian, siembra `localStorage.setItem('odyle-theme','asmodian')` en `addInitScript` antes de cargar. Guarda en `dev/screens/tema-elyos-desktop.png`, `tema-elyos-mobile.png`, `tema-asmodian-desktop.png`, `tema-asmodian-mobile.png`. Mira cada captura (herramienta Read): texto legible, paneles blancos con filete dorado en Elyos, violeta en Asmodian, nada con colores del tema antiguo.

- [ ] **Paso 8: Pruebas**

Run: `npm test 2>&1 | tail -8 && npm run build:web`
Expected: solo los 2 fallos conocidos; compilación correcta.

- [ ] **Paso 9: Commit**

```bash
git add index.html orb.js i18n-strings.js dev/pw.mjs dev/e2e.mjs dev/e2e-web.mjs dev/orb-smoke.mjs dev/preview.mjs .impeccable/surfaces/index-html.md dev/screens/tema-*.png
git commit -m "feat(tema): Elyos claro y Asmodian oscuro con botón Luz/Sombra guardado en prefs.theme"
```

---

### Tarea 3: Anillo de 56 runas (orbe plano y 3D)

**Files:**
- Create: `runes.js`, `runes.test.js`
- Modify: `orb.js` (atlas desde `runes.js`, 56 instancias, pulso urgente, mezcla en tema claro)
- Modify: `index.html` (anillo SVG en `.orb-slot`, `runes` en `orbList`, CSS del anillo)
- Modify: `motion.js`, `motion.test.js` (quitar `RUNES`/`runesLit` si quedan sin uso)
- Modify: `scripts/build-web.mjs` (`EXPECTED` + `'runes.js'`)
- Modify: `dev/orb-smoke.mjs`, `dev/orb-smoke.html`

**Interfaces:**
- Consumes: `MAX`, `REGEN` de `energy.js`; `setPalette({ primary, secondary, urgent, light })` y `URGENT`/`glowMats` (Tarea 2).
- Produces: `RUNE_COUNT` (56), `litRunes(energy) → 0..56`, `RUNE_STROKES` (12 glifos `[x1,y1,x2,y2][]` en una rejilla de 64), `glyphFor(i)`, `runePoint(i, r, c) → { x, y, angle }`, `buildRuneRing(doc, lit, { size = 150, glyphs = true, full = false }) → SVGElement`. Cada elemento de `orbList` (y de `scene.setOrbs`) lleva `runes: number`.

- [ ] **Paso 1: Escribir la prueba**

```js
// runes.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNE_COUNT, litRunes, RUNE_STROKES, glyphFor, runePoint, buildRuneRing } from './runes.js';

test('56 runas: una por cada 15 OD hasta 840', () => {
  assert.equal(RUNE_COUNT, 56);
  assert.equal(litRunes(0), 0);
  assert.equal(litRunes(14), 0);
  assert.equal(litRunes(15), 1);
  assert.equal(litRunes(839), 55);
  assert.equal(litRunes(840), 56);
  assert.equal(litRunes(900), 56);
  assert.equal(litRunes(-30), 0);
  assert.equal(litRunes(NaN), 0);
  assert.equal(litRunes('300'), 20);
});
test('12 glifos propios que se repiten alrededor del anillo', () => {
  assert.equal(RUNE_STROKES.length, 12);
  for (const g of RUNE_STROKES) for (const s of g) { assert.equal(s.length, 4); for (const v of s) assert.ok(v >= 0 && v <= 64); }
  assert.equal(glyphFor(0), RUNE_STROKES[0]);
  assert.equal(glyphFor(13), RUNE_STROKES[1]);
});
test('la runa 0 está arriba y la 14 a la derecha (sentido horario)', () => {
  const top = runePoint(0, 10, 50);
  assert.ok(Math.abs(top.x - 50) < 1e-9 && Math.abs(top.y - 40) < 1e-9);
  const right = runePoint(14, 10, 50);
  assert.ok(Math.abs(right.x - 60) < 1e-9 && Math.abs(right.y - 50) < 1e-9);
});

function fakeDoc() {
  const make = (tag) => ({ tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = String(v); }, append(...n) { this.children.push(...n); } });
  return { createElementNS: (_ns, tag) => make(tag) };
}
test('buildRuneRing: 56 elementos, los encendidos con la clase on', () => {
  const svg = buildRuneRing(fakeDoc(), 20);
  assert.equal(svg.tag, 'svg');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  assert.equal(svg.children.length, 56);
  assert.equal(svg.children.filter((c) => c.attrs.class === 'rune on').length, 20);
  assert.ok(svg.children.every((c) => c.tag === 'path' && /^M[\d.]+ [\d.]+L/.test(c.attrs.d)));
});
test('buildRuneRing en modo puntos (orbes pequeños) y al tope', () => {
  const svg = buildRuneRing(fakeDoc(), 56, { size: 44, glyphs: false, full: true });
  assert.equal(svg.attrs.class, 'rune-ring dots full');
  assert.ok(svg.children.every((c) => c.tag === 'circle' && c.attrs.class === 'rune on'));
});
```

- [ ] **Paso 2: Ver que falla**

Run: `node --test runes.test.js`
Expected: FAIL (`Cannot find module './runes.js'`).

- [ ] **Paso 3: Implementar `runes.js`**

Los 12 glifos son los que hoy están en `orb.js` (función `runeAtlas`, array `strokes`); se mueven aquí sin cambios.

```js
// runes.js
// The energy rune ring: 56 original runes around each orb, one per +15 OD (840 = 56 × 15).
// Shared by the 3D orb (orb.js) and the flat orb / small friend orbs (SVG).
import { MAX, REGEN } from './energy.js';

export const RUNE_COUNT = MAX / REGEN; // 56

export function litRunes(energy) {
  const e = Number(energy);
  if (!Number.isFinite(e)) return 0;
  return Math.max(0, Math.min(RUNE_COUNT, Math.floor(e / REGEN)));
}

// 12 glyphs drawn for Odyle (not taken from the game): strokes [x1, y1, x2, y2] on a 64×64 grid.
export const RUNE_STROKES = [
  [[32, 10, 32, 54], [32, 20, 46, 30]], [[24, 10, 24, 54], [24, 14, 42, 26], [24, 30, 42, 42]], [[32, 10, 32, 54], [18, 24, 46, 24]],
  [[20, 54, 32, 10], [32, 10, 44, 54], [24, 38, 40, 38]], [[22, 10, 22, 54], [22, 32, 42, 14], [22, 32, 42, 54]], [[32, 10, 32, 54], [18, 18, 46, 46]],
  [[18, 32, 32, 12], [32, 12, 46, 32], [46, 32, 32, 52], [32, 52, 18, 32]], [[24, 10, 24, 54], [40, 10, 40, 54], [24, 32, 40, 32]],
  [[32, 10, 32, 54], [20, 20, 32, 32], [44, 20, 32, 32]], [[20, 12, 44, 52], [44, 12, 20, 52]], [[32, 10, 32, 54], [32, 40, 46, 52], [32, 40, 18, 52]],
  [[22, 12, 42, 12], [42, 12, 22, 52], [22, 52, 42, 52]],
];
export const glyphFor = (i) => RUNE_STROKES[i % RUNE_STROKES.length];

// Position of rune i on a circle of radius r around (c, c): 0 at the top, clockwise.
export function runePoint(i, r, c) {
  const angle = -Math.PI / 2 + i * (2 * Math.PI / RUNE_COUNT);
  return { x: c + Math.cos(angle) * r, y: c + Math.sin(angle) * r, angle };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const n2 = (v) => v.toFixed(2);

// SVG ring for the flat orb (no WebGL / reduced motion) and, as dots, for small friend orbs.
export function buildRuneRing(doc, lit, { size = 150, glyphs = true, full = false } = {}) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'rune-ring' + (glyphs ? '' : ' dots') + (full ? ' full' : ''));
  svg.setAttribute('aria-hidden', 'true');
  const c = size / 2, r = size / 2 - (glyphs ? 5 : 2.5);
  const scale = 6 / 64; // each glyph fits a 6-unit box
  for (let i = 0; i < RUNE_COUNT; i++) {
    const p = runePoint(i, r, c);
    let node;
    if (glyphs) {
      node = doc.createElementNS(SVG_NS, 'path');
      node.setAttribute('d', glyphFor(i).map(([x1, y1, x2, y2]) =>
        `M${n2(p.x + (x1 - 32) * scale)} ${n2(p.y + (y1 - 32) * scale)}L${n2(p.x + (x2 - 32) * scale)} ${n2(p.y + (y2 - 32) * scale)}`).join(''));
    } else {
      node = doc.createElementNS(SVG_NS, 'circle');
      node.setAttribute('cx', n2(p.x)); node.setAttribute('cy', n2(p.y)); node.setAttribute('r', '1.1');
    }
    node.setAttribute('class', i < lit ? 'rune on' : 'rune');
    svg.append(node);
  }
  return svg;
}
```

Nota: si `n2` produce un número negativo en el `d` la prueba `^M[\d.]+` fallaría; con `r = size/2 - 5` y caja de 6 nunca baja de 0.

- [ ] **Paso 4: Ver que pasa**

Run: `node --test runes.test.js`
Expected: PASS.

- [ ] **Paso 5: Anillo 3D en `orb.js`**

- `import { RUNE_COUNT, RUNE_STROKES } from './runes.js';` (junto al import de `./motion.js`).
- `runeAtlas()`: usa `RUNE_STROKES` en lugar del array local (bórralo).
- En `RUNE_FS`: el índice del atlas pasa a `mod(vIndex, 12.0)`: `texture2D(uAtlas, vec2((mod(vIndex, 12.0) + vUv.x) / 12.0, vUv.y))`. Añade `uniform vec3 uUrgent;` y al tope usa `vec3 tone = mix(uGold, uUrgent, uFull);` en lugar de `uGold` para `col`, con pulso `float pulse = uFull > 0.5 ? 0.75 + 0.25 * sin(uTime * 4.0) : 1.0;` multiplicando `col`.
- `runeU` gana `uUrgent: { value: URGENT }`.
- El `InstancedMesh` pasa de 12 a `RUNE_COUNT` instancias, `PlaneGeometry(0.16, 0.16)`, `idx = new Float32Array(RUNE_COUNT)`, `runeAngle = i => -Math.PI / 2 + i * (Math.PI * 2 / RUNE_COUNT)`, y el bucle hasta `RUNE_COUNT`. Las chispas: `runeAngle(i % RUNE_COUNT)`.
- En `frame()`: `runeU.uLit.value = Math.min(RUNE_COUNT, Math.max(0, o.runes | 0));` (sustituye la línea que usaba `o.tick`), y `runeU.uFade.value = 1;` siempre (el anillo ya no se vacía con cada recarga; la ráfaga de chispas sigue sonando con `ripple`).
- Tema claro: con `lightMode` (Tarea 2), multiplica en `RUNE_FS` el color apagado por 0.6 para que las runas apagadas se vean sobre blanco (`uniform float uLight;` y `col *= mix(1.0, 0.6, uLight * (1.0 - on));`), y pon `runeU.uLight.value = light ? 1 : 0` en `setPalette`.

- [ ] **Paso 6: Página**

En `cardNode` (`index.html`, donde se crea `.orb-slot`), añade el anillo plano tras `.orb-flat`:

```js
      el('div', { class: 'orb-slot', 'data-orb': row.id, role: 'img', 'aria-label': `${row.percent}% de energía` },
        el('div', { class: 'orb-flat', style: `--fill:${row.percent}%` }),
        buildRuneRing(document, litRunes(row.energy), { full: row.isFull })),
```

e importa `import { litRunes, buildRuneRing } from './runes.js';`. En la construcción de `orbList` añade `runes: litRunes(r.energy),`. En `paintClock` borra la línea `for (const o of orbList) o.tick = …`. Si tras esto `RUNES` y `runesLit` de `motion.js` no se usan en ningún archivo (`grep -rn "runesLit\|RUNES" --include=*.js . | grep -v node_modules`), bórralos junto con sus pruebas en `motion.test.js`.

CSS:

```css
  /* Rune ring of the flat orb: 56 runes, lit ones in the faction accent, crimson at cap. No animation. */
  .rune-ring { position: absolute; inset: 0; width: 100%; height: 100%; display: none; pointer-events: none; }
  body.flat .rune-ring { display: block; }
  .rune { fill: none; stroke: var(--track); stroke-width: 1.1; stroke-linecap: round; stroke-linejoin: round; }
  .rune.on { stroke: var(--gold-bright); }
  .rune-ring.full .rune.on { stroke: var(--urgent); }
  .rune-ring.dots .rune { fill: var(--track); stroke: none; }
  .rune-ring.dots .rune.on { fill: var(--gold-bright); }
  .rune-ring.dots.full .rune.on { fill: var(--urgent); }
```

Añade `'runes.js'` a `EXPECTED` en `scripts/build-web.mjs`.

- [ ] **Paso 7: Prueba de humo del orbe**

En `dev/orb-smoke.html`, los orbes de prueba pasan `runes` (por ejemplo A: 56 con `state: 'full'`, B: 0, C: 44) en lugar de `tick`. En `dev/orb-smoke.mjs` usa `const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');` en lugar de `'python3'` y cambia el comentario de C a «44 runas». Si no tienes Pillow (`python -c "import PIL"` falla), salta este paso y deja constancia en el informe; la comprobación visual del Paso 8 basta.

- [ ] **Paso 8: Capturas**

Con `dev/preview.mjs`: una tarjeta al tope y otra a medias, en cada tema, en modo 3D y en modo ligero (orbe plano). Guarda `dev/screens/runas-{elyos,asmodian}-{3d,plano}.png` y míralas: 56 runas visibles, las encendidas en el acento, carmesí al tope.

- [ ] **Paso 9: Pruebas y commit**

Run: `npm test 2>&1 | tail -8 && npm run build:web`
Expected: solo los 2 fallos conocidos.

```bash
git add runes.js runes.test.js orb.js index.html motion.js motion.test.js scripts/build-web.mjs dev/orb-smoke.* dev/screens/runas-*.png
git commit -m "feat(orbe): anillo de 56 runas (1 runa = 15 OD) en 3D y en el orbe plano"
```

---

### Tarea 4: `social.js` — lógica pura de amigos, chat y búsqueda

**Files:**
- Create: `social.js`, `social.test.js`
- Modify: `scripts/build-web.mjs` (`EXPECTED` + `'social.js'`)

**Interfaces:**
- Consumes: `MAX`, `currentEnergy` (`energy.js`), `classById` (`classes.js`).
- Produces (formas de datos del servidor: perfil público `{ uid, nick, server, faction, bio, legion, mainClass }`; mensaje `{ id, from, to, kind: 'text'|'invite', body, at, readAt }`; conversación `{ profile, last, unread, friend }`):
  - `sortFriends(list) → list` (en línea primero, luego nick)
  - `mergeMessages(list, incoming) → list` (sin duplicados por `id`, de más antiguo a más nuevo)
  - `otherOf(msg, me) → uid`
  - `applyIncoming(convs, msg, me, { profile, openUid }) → convs`
  - `totalUnread(convs) → number`, `markRead(convs, uid) → convs`
  - `serversOf(results) → string[]`, `filterResults(results, { server, faction, classId }) → results`
  - `parseMessageText(s) → { ok, value } | { ok: false, error }`
  - `parseInvite({ title, at, slots, cost }, now) → { ok, value: { kind: 'invite', title, at, slots, cost } } | { ok: false, error }`
  - `makeClientId(rand?) → string` (20 caracteres `[A-Za-z0-9_-]`)
  - `actionsFor(relation) → ('add'|'cancel'|'accept'|'reject'|'message'|'remove')[]`
  - `friendEnergy(characters, anchorMs, now) → { name, classId, energy, percent, isFull }[]` (más energía primero)
  - `shareText(rows) → string | null`

- [ ] **Paso 1: Escribir la prueba**

```js
// social.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sortFriends, mergeMessages, otherOf, applyIncoming, totalUnread, markRead, serversOf, filterResults,
  parseMessageText, parseInvite, makeClientId, actionsFor, friendEnergy, shareText,
} from './social.js';

const ME = 'u_me';
const msg = (id, from, to, at, extra = {}) => ({ id, from, to, kind: 'text', body: { text: id }, at, readAt: null, ...extra });
const conv = (uid, last, unread = 0) => ({ profile: { uid, nick: uid }, last, unread, friend: true });

test('sortFriends: en línea primero, luego por nombre sin distinguir mayúsculas', () => {
  const out = sortFriends([{ nick: 'zeta', online: true }, { nick: 'Beta' }, { nick: 'alfa' }, { nick: 'Ómicron', online: true }]);
  assert.deepEqual(out.map((f) => f.nick), ['Ómicron', 'zeta', 'alfa', 'Beta']);
});

test('mergeMessages: el mismo mensaje por POST y por el canal en vivo aparece una vez', () => {
  const a = msg('a', ME, 'x', 1), b = msg('b', 'x', ME, 2);
  const out = mergeMessages([a], [b, { ...a }, b]);
  assert.deepEqual(out.map((m) => m.id), ['a', 'b']);
});
test('mergeMessages: ordena por hora y, a igual hora, por id; la versión nueva sustituye (leído)', () => {
  const out = mergeMessages([msg('c', ME, 'x', 5), msg('b', ME, 'x', 5)], [msg('a', ME, 'x', 1), { ...msg('c', ME, 'x', 5), readAt: 9 }]);
  assert.deepEqual(out.map((m) => m.id), ['a', 'b', 'c']);
  assert.equal(out[2].readAt, 9);
});

test('otherOf', () => {
  assert.equal(otherOf(msg('a', ME, 'x', 1), ME), 'x');
  assert.equal(otherOf(msg('a', 'x', ME, 1), ME), 'x');
});

test('applyIncoming: mensaje de alguien sin conversación → arriba con 1 sin leer', () => {
  const convs = [conv('y', msg('old', 'y', ME, 10))];
  const out = applyIncoming(convs, msg('n', 'x', ME, 20), ME, { profile: { uid: 'x', nick: 'Xena' } });
  assert.equal(out[0].profile.nick, 'Xena');
  assert.equal(out[0].unread, 1);
  assert.equal(out[1].profile.uid, 'y');
});
test('applyIncoming: si la conversación está abierta o el mensaje es mío, no cuenta como no leído', () => {
  const convs = [conv('x', msg('o', 'x', ME, 1), 2)];
  assert.equal(applyIncoming(convs, msg('n', 'x', ME, 5), ME, { openUid: 'x' })[0].unread, 2);
  assert.equal(applyIncoming(convs, msg('m', ME, 'x', 5), ME)[0].unread, 2);
});
test('applyIncoming: el eco del mismo mensaje no cambia nada; uno más viejo no sustituye al último', () => {
  const last = msg('n', 'x', ME, 5);
  const convs = [conv('x', last, 1)];
  assert.equal(applyIncoming(convs, { ...last }, ME), convs);
  const out = applyIncoming(convs, msg('older', 'x', ME, 3), ME);
  assert.equal(out[0].last.id, 'n');
  assert.equal(out[0].unread, 2);
});
test('applyIncoming: sin perfil conocido crea uno mínimo con el uid', () => {
  const out = applyIncoming([], msg('n', 'x', ME, 5), ME);
  assert.deepEqual(out[0].profile, { uid: 'x', nick: '' });
});

test('totalUnread y markRead', () => {
  const convs = [conv('x', null, 2), conv('y', null, 3)];
  assert.equal(totalUnread(convs), 5);
  const out = markRead(convs, 'x');
  assert.equal(out[0].unread, 0);
  assert.equal(out[1], convs[1]);
});

const R = [
  { uid: '1', nick: 'Ana', server: 'Israphel', faction: 'elyos', mainClass: 'templario' },
  { uid: '2', nick: 'Anabel', server: ' Nezakan ', faction: 'asmodian', mainClass: 'cantor' },
  { uid: '3', nick: 'Anatol', server: '', faction: 'elyos', mainClass: null },
];
test('serversOf: únicos, sin vacíos, ordenados', () => {
  assert.deepEqual(serversOf(R), ['Israphel', 'Nezakan']);
});
test('filterResults: por servidor, facción y clase', () => {
  assert.deepEqual(filterResults(R, {}).map((r) => r.uid), ['1', '2', '3']);
  assert.deepEqual(filterResults(R, { server: 'Nezakan' }).map((r) => r.uid), ['2']);
  assert.deepEqual(filterResults(R, { faction: 'elyos' }).map((r) => r.uid), ['1', '3']);
  assert.deepEqual(filterResults(R, { faction: 'elyos', classId: 'templario' }).map((r) => r.uid), ['1']);
});

test('parseMessageText: 1 a 1000 caracteres, sin controles ni bidi, saltos de línea conservados', () => {
  assert.deepEqual(parseMessageText('  hola\nque tal  '), { ok: true, value: 'hola\nque tal' });
  assert.equal(parseMessageText('   ').ok, false);
  assert.equal(parseMessageText('a'.repeat(1001)).ok, false);
  assert.equal(parseMessageText('a'.repeat(1000)).ok, true);
  assert.equal(parseMessageText('x\u202Ey\u0007').value, 'xy');
});

test('parseInvite: título 1–60, fecha en el próximo año, plazas 1–12, coste 0–840', () => {
  const now = 1_000_000_000_000;
  const ok = parseInvite({ title: '  Mazmorra   de  fuego ', at: now + 3_600_000, slots: '6', cost: '40' }, now);
  assert.deepEqual(ok, { ok: true, value: { kind: 'invite', title: 'Mazmorra de fuego', at: now + 3_600_000, slots: 6, cost: 40 } });
  assert.equal(parseInvite({ title: '', at: now + 1, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x'.repeat(61), at: now + 1, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now - 3_600_000, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now + 400 * 86_400_000, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: NaN, slots: 6, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now + 1, slots: 13, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now + 1, slots: 2.5, cost: 0 }, now).ok, false);
  assert.equal(parseInvite({ title: 'x', at: now + 1, slots: 2, cost: 841 }, now).ok, false);
});

test('makeClientId: 20 caracteres válidos para el servidor', () => {
  const id = makeClientId();
  assert.match(id, /^[A-Za-z0-9_-]{20}$/);
  assert.notEqual(makeClientId(), id);
  assert.equal(makeClientId(() => 0), 'A'.repeat(20));
});

test('actionsFor según la relación', () => {
  assert.deepEqual(actionsFor('none'), ['add']);
  assert.deepEqual(actionsFor('pending-out'), ['cancel']);
  assert.deepEqual(actionsFor('pending-in'), ['accept', 'reject']);
  assert.deepEqual(actionsFor('friends'), ['message', 'remove']);
  assert.deepEqual(actionsFor('self'), []);
  assert.deepEqual(actionsFor('blocked'), []);
});

test('friendEnergy: proyecta con la hora de recarga de quien mira y ordena por energía', () => {
  const TICK = 10_800_000, anchor = 0, now = 2 * TICK + 5;
  const out = friendEnergy([
    { name: 'Bea', classId: 'cantor', energy: 100, recordedAt: 1 },
    { name: 'Ana', classId: 'nope', energy: 830, recordedAt: 1 },
    { name: 'Rota', energy: 'x', recordedAt: 1 },
  ], anchor, now);
  assert.deepEqual(out.map((r) => [r.name, r.energy, r.isFull, r.classId]), [['Ana', 840, true, null], ['Bea', 130, false, 'cantor']]);
  assert.equal(out[1].percent, 15);
});
test('friendEnergy: sin hora de recarga muestra lo guardado; sin personajes, lista vacía', () => {
  assert.equal(friendEnergy([{ name: 'A', energy: 300, recordedAt: 0 }], null, 10)[0].energy, 300);
  assert.deepEqual(friendEnergy(null, 0, 0), []);
});

test('shareText', () => {
  assert.equal(shareText([]), null);
  assert.equal(shareText([{ name: 'Ana', energy: 840, isFull: true }, { name: 'Bea', energy: 300, isFull: false }]),
    'Mi energía: Ana 840/840 (lleno) · Bea 300/840');
});
```

- [ ] **Paso 2: Ver que falla**

Run: `node --test social.test.js`
Expected: FAIL (`Cannot find module './social.js'`).

- [ ] **Paso 3: Implementar**

```js
// social.js
// Pure logic for friends, chat and profile search (web only). No DOM and no network, so node --test covers it.
// Data shapes come from the server: public profile {uid, nick, server, faction, bio, legion, mainClass},
// message {id, from, to, kind, body, at, readAt}, conversation {profile, last, unread, friend}.
import { MAX, currentEnergy } from './energy.js';
import { classById } from './classes.js';

const byNick = (a, b) => String(a.nick || '').localeCompare(String(b.nick || ''), 'es', { sensitivity: 'base' });

export function sortFriends(list) {
  return [...list].sort((a, b) => Number(!!b.online) - Number(!!a.online) || byNick(a, b));
}

const byTime = (a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The same message can arrive twice (POST reply and live echo): one entry per id, newest data wins.
export function mergeMessages(list, incoming) {
  const map = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) if (m && typeof m.id === 'string') map.set(m.id, { ...map.get(m.id), ...m });
  return [...map.values()].sort(byTime);
}

export const otherOf = (msg, me) => (msg.from === me ? msg.to : msg.from);

const lastAt = (c) => (c.last ? c.last.at : 0);

// A live message moves its conversation to the top. It counts as unread only when it is from the other
// person, not already read, and that conversation is not the one on screen.
export function applyIncoming(convs, msg, me, { profile = null, openUid = null } = {}) {
  const uid = otherOf(msg, me);
  const i = convs.findIndex((c) => c.profile.uid === uid);
  const old = i >= 0 ? convs[i] : null;
  if (old && old.last && old.last.id === msg.id) return convs;
  const counts = msg.from !== me && uid !== openUid && !msg.readAt;
  const next = {
    profile: old ? old.profile : (profile || { uid, nick: '' }),
    last: !old || !old.last || msg.at >= old.last.at ? msg : old.last,
    unread: (old ? old.unread : 0) + (counts ? 1 : 0),
    friend: old ? old.friend : true,
  };
  return [next, ...convs.filter((_, j) => j !== i)].sort((a, b) => lastAt(b) - lastAt(a));
}

export const totalUnread = (convs) => convs.reduce((n, c) => n + (c.unread || 0), 0);
export const markRead = (convs, uid) => convs.map((c) => (c.profile.uid === uid && c.unread ? { ...c, unread: 0 } : c));

const trimmed = (s) => (typeof s === 'string' ? s.trim() : '');

export function serversOf(results) {
  return [...new Set(results.map((r) => trimmed(r.server)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

export function filterResults(results, { server = '', faction = '', classId = '' } = {}) {
  return results.filter((r) => (!server || trimmed(r.server) === server)
    && (!faction || r.faction === faction)
    && (!classId || r.mainClass === classId));
}

// Same limits as the server (server/src/routes/messages.js); the server stays the authority.
const CTRL = /[\u0000-\u0009\u000b-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function parseMessageText(s) {
  const text = String(s ?? '').replace(CTRL, '').trim();
  if (!text) return { ok: false, error: 'Escribe un mensaje' };
  if (text.length > 1000) return { ok: false, error: 'El mensaje admite hasta 1000 caracteres' };
  return { ok: true, value: text };
}

const DAY = 86_400_000;
export function parseInvite({ title, at, slots, cost } = {}, now) {
  const t = String(title ?? '').replace(CTRL, ' ').trim().replace(/\s+/g, ' ');
  if (t.length < 1 || t.length > 60) return { ok: false, error: 'El título necesita entre 1 y 60 caracteres' };
  if (!Number.isFinite(at) || at < now - 5 * 60_000 || at > now + 365 * DAY) return { ok: false, error: 'Elige una fecha dentro del próximo año' };
  const s = Number(slots), c = Number(cost);
  if (!Number.isInteger(s) || s < 1 || s > 12) return { ok: false, error: 'Las plazas van de 1 a 12' };
  if (!Number.isInteger(c) || c < 0 || c > MAX) return { ok: false, error: 'El coste va de 0 a 840 OD' };
  return { ok: true, value: { kind: 'invite', title: t, at, slots: s, cost: c } };
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const cryptoRand = () => { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] / 2 ** 32; };

// Sent with each message so a retry after a network error does not create a second copy.
export function makeClientId(rand = globalThis.crypto && globalThis.crypto.getRandomValues ? cryptoRand : Math.random) {
  let s = '';
  for (let i = 0; i < 20; i++) s += ID_CHARS[Math.floor(rand() * 64) % 64];
  return s;
}

export function actionsFor(relation) {
  switch (relation) {
    case 'none': return ['add'];
    case 'pending-out': return ['cancel'];
    case 'pending-in': return ['accept', 'reject'];
    case 'friends': return ['message', 'remove'];
    default: return [];
  }
}

// Recharges are server-wide, so the viewer's own recharge time projects a friend's stored energy.
export function friendEnergy(characters, anchorMs, now) {
  if (!Array.isArray(characters)) return [];
  return characters.filter((c) => c && Number.isFinite(c.energy)).map((c) => {
    const energy = Math.min(MAX, anchorMs != null && Number.isFinite(c.recordedAt)
      ? currentEnergy({ energy: c.energy, recordedAt: c.recordedAt }, anchorMs, now) : c.energy);
    const cls = classById(c.classId);
    return { name: typeof c.name === 'string' ? c.name : '', classId: cls ? cls.id : null, energy,
      percent: Math.min(100, Math.floor(energy / MAX * 100)), isFull: energy >= MAX };
  }).sort((a, b) => b.energy - a.energy || a.name.localeCompare(b.name, 'es'));
}

export function shareText(rows) {
  if (!rows || !rows.length) return null;
  const parts = rows.slice(0, 8).map((r) => `${r.name} ${r.energy}/${MAX}${r.isFull ? ' (lleno)' : ''}`);
  return `Mi energía: ${parts.join(' · ')}`.slice(0, 1000);
}
```

- [ ] **Paso 4: Ver que pasa**

Run: `node --test social.test.js`
Expected: PASS.

- [ ] **Paso 5: Compilación y commit**

Añade `'social.js'` a `EXPECTED` en `scripts/build-web.mjs`. Run: `npm run build:web`.

```bash
git add social.js social.test.js scripts/build-web.mjs
git commit -m "feat(social): lógica pura de amigos, chat y búsqueda"
```

---

### Tarea 5: `web/social-api.js` — REST y canal en vivo con reconexión

**Files:**
- Create: `web/social-api.js`, `web/social-api.test.js`
- Modify: `scripts/build-web.mjs` (copiar todo `web/*.js|css|html` salvo pruebas; `<script src="social-api.js">`)
- Modify: `server/test/pages.test.js` (orden de scripts y tipo de contenido)

**Interfaces:**
- Consumes: `window.claude.__fetch(method, url, body) → Response` (de `web/claude-shim.js`: CSRF, renovación de sesión y redirección a `/login`).
- Produces: `window.odyleSocialApi` con:
  - `search(q) → results[]`, `profile(uid) → { profile, relation, characters }`, `friends() → { friends, incoming, outgoing }`
  - `addFriend(uid) → { status }`, `accept(uid) → { status }`, `removeFriend(uid)`, `blocks() → [{ uid, nick }]`, `block(uid)`, `unblock(uid)`
  - `messages(uid, before?) → messages[]`, `send(uid, payload) → message`, `markRead(uid)`, `conversations() → conversations[]`, `report({ uid, messageId?, reason, note? })`
  - `connect({ onEvent(type, data), onStatus(status, info) }) → disconnect()`; `status` es `'live'` (con `info.resumed === true` si veníamos de un corte) o `'reconnecting'`.
  - Los errores son `Error` con `.status` (código HTTP; `0` sin conexión) y el mensaje en español del servidor.

- [ ] **Paso 1: Escribir la prueba**

```js
// web/social-api.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('./social-api.js', import.meta.url), 'utf8');

function load({ fetchImpl } = {}) {
  const calls = [], timers = [], sources = [];
  class FakeES {
    constructor(url) { this.url = url; this.listeners = {}; this.closed = false; sources.push(this); }
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
    emit(t, data) { for (const fn of this.listeners[t] || []) fn(data === undefined ? {} : { data }); }
    close() { this.closed = true; }
  }
  const ctx = {
    EventSource: FakeES,
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cleared = true; },
    encodeURIComponent, JSON, Error, Promise, Math, String,
  };
  ctx.window = ctx;
  ctx.claude = {
    __fetch: async (method, url, body) => { calls.push([method, url, body]); return fetchImpl ? fetchImpl(method, url, body) : { ok: true, status: 200, json: async () => ({}) }; },
  };
  vm.runInNewContext(SRC, ctx);
  return { api: ctx.odyleSocialApi, calls, timers, sources };
}
const flush = () => new Promise((r) => setImmediate(r));

test('connect: abre /api/stream y avisa de "live" al conectar', () => {
  const { api, sources } = load();
  const status = [];
  api.connect({ onEvent() {}, onStatus: (s, i) => status.push([s, i && i.resumed]) });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, '/api/stream');
  sources[0].emit('open');
  assert.deepEqual(status, [['live', false]]);
});

test('reconexión: espera 1, 2, 4, 8, 16, 30, 30 s; renueva la sesión antes de reabrir', async () => {
  const { api, sources, timers, calls } = load();
  const status = [];
  api.connect({ onEvent() {}, onStatus: (s) => status.push(s) });
  const waits = [];
  for (let i = 0; i < 7; i++) {
    sources.at(-1).emit('error');
    assert.equal(sources.at(-1).closed, true);
    const t = timers.at(-1);
    waits.push(t.ms);
    await t.fn();
    await flush();
  }
  assert.deepEqual(waits, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  assert.equal(sources.length, 8);
  assert.ok(calls.filter(([m, u]) => m === 'GET' && u === '/api/auth/me').length === 7);
  assert.deepEqual(status, ['reconnecting']); // un solo aviso por corte
});

test('al volver: "live" con resumed y la espera vuelve a 1 s', async () => {
  const { api, sources, timers } = load();
  const status = [];
  api.connect({ onEvent() {}, onStatus: (s, i) => status.push([s, !!(i && i.resumed)]) });
  sources[0].emit('error'); await timers.at(-1).fn(); await flush();
  sources[0].emit('open'); // la vieja ya no cuenta, pero no debe romper nada
  sources[1].emit('open');
  assert.deepEqual(status.at(-1), ['live', true]);
  sources[1].emit('error');
  assert.equal(timers.at(-1).ms, 1000);
});

test('eventos: JSON válido llega a onEvent; JSON roto se ignora; un fallo de la vista no rompe el canal', () => {
  const { api, sources } = load();
  const got = [];
  api.connect({ onEvent: (t, d) => { got.push([t, d]); if (t === 'presence') throw new Error('vista'); }, onStatus() {} });
  sources[0].emit('message', JSON.stringify({ id: 'm1' }));
  sources[0].emit('read', '{roto');
  sources[0].emit('presence', JSON.stringify({ uid: 'u', online: true }));
  sources[0].emit('friend', JSON.stringify({ uid: 'u', relation: 'friends' }));
  assert.deepEqual(got.map(([t]) => t), ['message', 'presence', 'friend']);
});

test('disconnect: cierra, cancela la espera y no reabre', async () => {
  const { api, sources, timers } = load();
  const stop = api.connect({ onEvent() {}, onStatus() {} });
  sources[0].emit('error');
  const t = timers.at(-1);
  stop();
  assert.equal(t.cleared, true);
  await t.fn();
  assert.equal(sources.length, 1);
});

test('REST: rutas, cuerpo y errores con el mensaje del servidor', async () => {
  const { api, calls } = load({
    fetchImpl: (m, u) => (u.startsWith('/api/messages/bad')
      ? { ok: false, status: 404, json: async () => ({ error: 'No encontrado.' }) }
      : { ok: true, status: 200, json: async () => ({ results: [{ uid: 'a' }], message: { id: 'm' }, conversations: [], blocked: [] }) }),
  });
  assert.deepEqual(await api.search('ana b'), [{ uid: 'a' }]);
  assert.deepEqual((await api.send('u1', { kind: 'text', text: 'hola', clientId: 'abcdefgh' })), { id: 'm' });
  await api.messages('u1', 123);
  await api.removeFriend('u1');
  assert.deepEqual(calls.map(([m, u]) => `${m} ${u}`), [
    'GET /api/profiles/search?q=ana%20b', 'POST /api/messages/u1', 'GET /api/messages/u1?before=123', 'DELETE /api/friends/u1']);
  await assert.rejects(api.messages('bad'), (e) => e.status === 404 && e.message === 'No encontrado.');
});

test('REST sin conexión: status 0 y mensaje claro', async () => {
  const { api } = load({ fetchImpl: () => { throw new Error('net'); } });
  await assert.rejects(api.friends(), (e) => e.status === 0 && /No se pudo conectar/.test(e.message));
});
```

- [ ] **Paso 2: Ver que falla**

Run: `node --test web/social-api.test.js`
Expected: FAIL (`ENOENT … social-api.js`).

- [ ] **Paso 3: Implementar**

```js
// web/social-api.js
// Amigos, chat y búsqueda sobre /api (solo web). Script clásico (SR-2): expone window.odyleSocialApi.
// Las peticiones pasan por window.claude.__fetch (CSRF, renovación de sesión y /login). El canal en vivo es
// EventSource('/api/stream'): si se corta (p. ej. el servidor lo cierra al caducar el token), espera 1, 2, 4…
// hasta 30 s, renueva la sesión con /api/auth/me y lo vuelve a abrir.
(function () {
  'use strict';

  const STREAM_TYPES = ['message', 'read', 'friend', 'presence'];
  const backoff = (n) => Math.min(30000, 1000 * 2 ** n);
  const enc = encodeURIComponent;

  async function call(method, url, body) {
    let res;
    try { res = await window.claude.__fetch(method, url, body); } catch (_) {
      const e = new Error('No se pudo conectar. Inténtalo de nuevo.'); e.status = 0; throw e;
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* sin cuerpo */ }
    if (!res.ok) {
      const e = new Error((data && typeof data.error === 'string' && data.error) || 'No se pudo completar la acción.');
      e.status = res.status;
      throw e;
    }
    return data || {};
  }

  function connect({ onEvent, onStatus }) {
    let es = null, timer = null, attempt = 0, closed = false, down = false;
    const status = (s, info) => { try { if (onStatus) onStatus(s, info); } catch (_) { /* la vista no tumba el canal */ } };
    function open() {
      const me = new EventSource('/api/stream');
      es = me;
      me.addEventListener('open', () => {
        if (me !== es) return;
        const resumed = down;
        down = false; attempt = 0;
        status('live', { resumed });
      });
      for (const type of STREAM_TYPES) {
        me.addEventListener(type, (e) => {
          if (me !== es) return;
          let data;
          try { data = JSON.parse(e.data); } catch (_) { return; }
          try { onEvent(type, data); } catch (_) { /* idem */ }
        });
      }
      me.addEventListener('error', () => {
        if (closed || me !== es) return;
        me.close(); es = null;
        if (!down) { down = true; status('reconnecting'); }
        const wait = backoff(attempt++);
        timer = setTimeout(async () => {
          timer = null;
          if (closed) return;
          // Si el token caducó, esta petición lo renueva (o manda a /login) antes de reabrir.
          try { await window.claude.__fetch('GET', '/api/auth/me'); } catch (_) { /* sin red: se reintenta */ }
          if (!closed) open();
        }, wait);
      });
    }
    open();
    return () => { closed = true; clearTimeout(timer); if (es) es.close(); es = null; };
  }

  window.odyleSocialApi = {
    search: async (q) => (await call('GET', '/api/profiles/search?q=' + enc(q))).results || [],
    profile: (uid) => call('GET', '/api/profiles/' + enc(uid)),
    friends: () => call('GET', '/api/friends'),
    addFriend: (uid) => call('POST', '/api/friends/' + enc(uid), {}),
    accept: (uid) => call('POST', '/api/friends/' + enc(uid) + '/accept', {}),
    removeFriend: (uid) => call('DELETE', '/api/friends/' + enc(uid)),
    blocks: async () => (await call('GET', '/api/blocks')).blocked || [],
    block: (uid) => call('POST', '/api/blocks/' + enc(uid), {}),
    unblock: (uid) => call('DELETE', '/api/blocks/' + enc(uid)),
    messages: async (uid, before) => (await call('GET', '/api/messages/' + enc(uid) + (before ? '?before=' + enc(String(before)) : ''))).messages || [],
    send: async (uid, payload) => (await call('POST', '/api/messages/' + enc(uid), payload)).message,
    markRead: (uid) => call('POST', '/api/messages/' + enc(uid) + '/read', {}),
    conversations: async () => (await call('GET', '/api/conversations')).conversations || [],
    report: (r) => call('POST', '/api/reports', r),
    connect,
  };
})();
```

Nota sobre la prueba «al volver»: tras el primer `error`, `sources[0]` deja de ser la fuente activa; su `open` se ignora (`me !== es`). Comprueba que la prueba pasa tal cual; si no, ajusta el código, no la prueba.

- [ ] **Paso 4: Ver que pasa**

Run: `node --test web/social-api.test.js`
Expected: PASS.

- [ ] **Paso 5: Compilación**

En `scripts/build-web.mjs`:
- Sustituye el bucle `for (const f of ['claude-shim.js', 'legion-api.js', 'auth.html', 'auth-i18n.js', 'auth.js', 'auth.css'])` por una copia de todo `web/` salvo pruebas, comprobando que los imprescindibles existen:

```js
// ---- páginas, adaptadores y pantallas solo web (todo web/ salvo pruebas) ----
const WEB_DIR = path.join(ROOT, 'web');
for (const f of ['claude-shim.js', 'legion-api.js', 'social-api.js', 'auth.html', 'auth-i18n.js', 'auth.js', 'auth.css']) need(path.join(WEB_DIR, f));
for (const f of readdirSync(WEB_DIR)) {
  if (/\.(js|css|html)$/.test(f) && !f.endsWith('.test.js')) copyFileSync(path.join(WEB_DIR, f), path.join(OUT, f));
}
```

- En el reemplazo del `<script type="module">` en línea, añade `social-api.js` entre `legion-api.js` y `app.js`:

```js
  .replace(script[0], () => '<script src="claude-shim.js"></script><script src="legion-api.js"></script><script src="social-api.js"></script><script type="module" src="app.js"></script>');
```

- [ ] **Paso 6: Prueba de páginas**

En `server/test/pages.test.js`: en la prueba del orden de scripts añade `&& html.indexOf('legion-api.js') < html.indexOf('social-api.js') && html.indexOf('social-api.js') < html.indexOf('app.js')`, y añade `'/social-api.js'` a la lista de URLs con Content-Type JavaScript.

Run: `npm run build:web && cd server && node --test test/pages.test.js test/attacks/xss-dom-sinks.test.js; cd ..`
Expected: PASS salvo el fallo conocido de `/AUTH.HTML` en Windows.

- [ ] **Paso 7: Commit**

```bash
git add web/social-api.js web/social-api.test.js scripts/build-web.mjs server/test/pages.test.js
git commit -m "feat(social): cliente de la API social con canal en vivo y reconexión creciente"
```

---

### Tarea 6: Armazón social en la página y privacidad del perfil

**Files:**
- Create: `web/social-dom.js`, `web/social-ui.js`, `web/social.css`, `i18n-social.test.js`
- Modify: `index.html` (pestañas sociales, insignias, arranque, privacidad en el perfil)
- Modify: `legion.js`, `legion.test.js` (`parseProfile`)
- Modify: `scripts/build-web.mjs` (`<link rel="stylesheet" href="social.css">`)
- Modify: `i18n-strings.js` (bloque `SOCIAL`)

**Interfaces:**
- Consumes: `window.odyleSocialApi` (Tarea 5), `sortFriends`, `applyIncoming`, `totalUnread`, `markRead` (Tarea 4), `buildRuneRing`, `litRunes` (Tarea 3), `classById` (`classes.js`), `LOCALE` (`i18n.js`).
- Produces:
  - `web/social-dom.js`: `S(s)`, `fmt(tpl, ...args)`, `el(tag, props, ...kids)`, `userText(tag, text, props)`, `initials(nick)`, `FACTION_LABEL`, `metaNode(profile)`, `avatar(profile, online)`, `personHead(profile, { online })`, `miniOrb(row | null)`, `timeLabel(at)`, `dateTimeLabel(at)`, `note(text, kind)`.
  - `web/social-ui.js`: `startSocial(ctx) → { onTab(id), stop() }`. Objeto compartido `shared` que reciben las pantallas: `{ api, me, panels, setBadge, goTab, myRows, anchorMs, state, openProfile(uid), openChat(uid), refreshFriends(), refreshConvs(), changed(), register(name, screen) }`. `state = { friends, incoming, outgoing, blocked, convs, live }`. Una pantalla es `{ render(), onTab?(), onMessage?(msg), onRead?(uid), open?(uid), openUid?() }`.
  - `parseProfile(...)` devuelve también `searchable` y `shareEnergy` (booleanos, `true` salvo `false` explícito).

- [ ] **Paso 1: Prueba de `parseProfile`**

Añade a `legion.test.js`:

```js
test('parseProfile conserva la privacidad: visible y comparte por defecto, false explícito se respeta', () => {
  const base = { nick: 'Ana', server: '', bio: '', faction: 'elyos', mainCharId: null };
  assert.deepEqual([parseProfile(base).value.searchable, parseProfile(base).value.shareEnergy], [true, true]);
  const off = parseProfile({ ...base, searchable: false, shareEnergy: false }).value;
  assert.deepEqual([off.searchable, off.shareEnergy], [false, false]);
  const odd = parseProfile({ ...base, searchable: 'no', shareEnergy: 0 }).value;
  assert.deepEqual([odd.searchable, odd.shareEnergy], [true, true]);
});
```

(si `parseProfile` no está ya importado en ese archivo, añádelo al import de `./legion.js`). Run: `node --test legion.test.js` → FAIL.

- [ ] **Paso 2: Implementar en `legion.js`**

```js
export function parseProfile({ nick, server, bio, faction, mainCharId, searchable, shareEnergy } = {}, charIds = []) {
  // … líneas actuales sin cambios hasta el return …
  return { ok: true, value: { nick: n, server: sv, bio: b, faction, mainCharId: charIds.includes(mainCharId) ? mainCharId : null,
    searchable: searchable !== false, shareEnergy: shareEnergy !== false } };
}
```

Run: `node --test legion.test.js` → PASS (revisa que las pruebas existentes de `parseProfile` con `deepEqual` sigan pasando; si comparan el objeto entero, añade los dos campos a lo esperado).

- [ ] **Paso 3: Privacidad en el diálogo de perfil**

En `index.html`, dentro de `#profile-form`, antes de `<p class="error" id="profile-error"`:

```html
    <fieldset class="privacy" id="profile-privacy" hidden>
      <legend>Privacidad</legend>
      <label class="switch"><input type="checkbox" id="profile-searchable"> Aparecer en Buscar</label>
      <label class="switch"><input type="checkbox" id="profile-share"> Compartir mi energía con amigos</label>
    </fieldset>
```

En `app.js`: dentro de `if (window.odyleWeb) { … }` añade `$('profile-privacy').hidden = false;`. En `openProfile`: `$('profile-searchable').checked = prof.searchable !== false; $('profile-share').checked = prof.shareEnergy !== false;`. En el envío: pasa `searchable: $('profile-searchable').checked, shareEnergy: $('profile-share').checked` a `parseProfile`. CSS: `.privacy { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; } .privacy legend { font-family: var(--font-display); padding: 0 6px; }`.

- [ ] **Paso 4: `web/social-dom.js`**

```js
// web/social-dom.js
// Ayudas de DOM para las pantallas sociales (solo web). Todo el texto va por textContent/append (SR-2, SR-43).
// Lo que escribe un usuario lleva translate="no": la traducción en vivo de la página nunca lo reescribe.
import { buildRuneRing, litRunes } from './runes.js';
import { classById } from './classes.js';
import { LOCALE } from './i18n.js';

// Marca un texto de la interfaz (i18n-social.test.js comprueba que está traducido). No hace nada más.
export const S = (s) => s;
export const fmt = (tpl, ...args) => tpl.replace(/\{(\d)\}/g, (_, i) => String(args[Number(i)] ?? ''));

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null && kid !== false) node.append(kid);
  return node;
}

export const userText = (tag, text, props = {}) => el(tag, { ...props, translate: 'no' }, String(text ?? ''));

export function initials(nick) {
  const s = String(nick || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : s.slice(0, 2)).toUpperCase();
}

export const FACTION_LABEL = { elyos: S('Elyos'), asmodian: S('Asmodiano') };

// «Servidor · Facción · Clase»: el servidor es texto de usuario y va aparte.
export function metaNode(p) {
  const cls = classById(p.mainClass);
  const bits = [];
  if (p.server) bits.push(userText('span', p.server));
  if (FACTION_LABEL[p.faction]) bits.push(el('span', {}, FACTION_LABEL[p.faction]));
  if (cls) bits.push(el('span', {}, cls.name));
  const out = el('span', { class: 'meta' });
  bits.forEach((b, i) => { if (i) out.append(' · '); out.append(b); });
  return out;
}

export const avatar = (p, online = false) =>
  el('span', { class: 'avatar' + (online ? ' online' : ''), 'aria-hidden': 'true', translate: 'no' }, initials(p.nick));

export function personHead(p, { online = false } = {}) {
  return el('div', { class: 'person' }, avatar(p, online),
    el('div', { class: 'person-text' },
      userText('b', p.nick || '—', { class: 'nick' }),
      metaNode(p),
      online ? el('span', { class: 'online-text' }, S('En línea')) : null));
}

// Orbe pequeño, siempre plano: relleno por porcentaje y anillo de 56 runas en puntos.
export function miniOrb(row) {
  const wrap = el('span', { class: 'mini-orb' + (row && row.isFull ? ' full' : '') + (row ? '' : ' hidden-energy'), role: 'img',
    'aria-label': row ? fmt(S('{0} de 840 de energía'), row.energy) : S('Energía no compartida') });
  wrap.append(el('span', { class: 'mini-orb-fill', style: `--fill:${row ? row.percent : 0}%` }));
  wrap.append(buildRuneRing(document, row ? litRunes(row.energy) : 0, { size: 44, glyphs: false, full: !!(row && row.isFull) }));
  return wrap;
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export function timeLabel(at) {
  const d = new Date(at), now = new Date();
  return sameDay(d, now)
    ? d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}
export const dateTimeLabel = (at) => new Date(at).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const note = (text, kind = '') => el('p', { class: 'social-note' + (kind ? ' ' + kind : ''), role: kind === 'error' ? 'alert' : 'status' }, text);
```

- [ ] **Paso 5: `web/social-ui.js`**

```js
// web/social-ui.js
// Amigos, chat y búsqueda (solo web). Guarda el estado compartido y el canal en vivo; cada pantalla
// (social-friends, social-search, social-chat, social-profile) pinta en su panel. Lo arranca app.js.
import { el, S } from './social-dom.js';
import { sortFriends, applyIncoming, totalUnread, otherOf } from './social.js';

export function startSocial(ctx) {
  const { api, me, setBadge } = ctx;
  const state = { friends: [], incoming: [], outgoing: [], blocked: [], convs: [], live: true };
  const screens = {};
  const statusEl = el('p', { class: 'live-status', role: 'status', hidden: true }, S('Reconectando…'));
  document.body.append(statusEl);

  const shared = {
    ...ctx, state,
    register(name, screen) { screens[name] = screen; screen.render(); },
    openProfile: (uid) => { if (screens.profile) screens.profile.open(uid); },
    openChat: (uid) => { ctx.goTab('chat'); if (screens.chat) screens.chat.open(uid); },
    refreshFriends, refreshConvs,
    changed() { for (const s of Object.values(screens)) s.render(); badges(); },
  };

  async function refreshFriends() {
    try {
      const [f, blocked] = await Promise.all([api.friends(), api.blocks()]);
      state.friends = sortFriends(f.friends || []);
      state.incoming = f.incoming || [];
      state.outgoing = f.outgoing || [];
      state.blocked = blocked;
    } catch { /* se queda con lo último que había */ }
    shared.changed();
  }
  async function refreshConvs() {
    try { state.convs = await api.conversations(); } catch { /* idem */ }
    shared.changed();
  }
  function badges() {
    setBadge('amigos', state.incoming.length);
    setBadge('chat', totalUnread(state.convs));
  }

  function onEvent(type, data) {
    if (type === 'message') {
      const uid = otherOf(data, me);
      const friend = state.friends.find((f) => f.uid === uid) || null;
      const openUid = screens.chat && screens.chat.openUid ? screens.chat.openUid() : null;
      state.convs = applyIncoming(state.convs, data, me, { profile: friend, openUid });
      if (screens.chat && screens.chat.onMessage) screens.chat.onMessage(data);
      shared.changed();
    } else if (type === 'read') {
      if (screens.chat && screens.chat.onRead) screens.chat.onRead(data.uid);
    } else if (type === 'friend') {
      refreshFriends();
      refreshConvs();
    } else if (type === 'presence') {
      state.friends = sortFriends(state.friends.map((f) => (f.uid === data.uid ? { ...f, online: !!data.online } : f)));
      shared.changed();
    }
  }

  const disconnect = api.connect({
    onEvent,
    onStatus(s, info) {
      state.live = s === 'live';
      statusEl.hidden = state.live;
      // Al volver tras un corte: lo que llegó mientras tanto.
      if (state.live && info && info.resumed) { refreshFriends(); refreshConvs(); }
    },
  });

  refreshFriends();
  refreshConvs();

  return {
    shared,
    onTab(id) {
      if (id === 'amigos') refreshFriends();
      if (id === 'chat') refreshConvs();
      for (const s of Object.values(screens)) if (s.onTab) s.onTab(id);
    },
    stop() { disconnect(); statusEl.remove(); },
  };
}
```

Las Tareas 7–9 registran sus pantallas añadiendo, al final de `startSocial` y antes del `return`, líneas como `shared.register('friends', createFriends(shared, ctx.panels.amigos));` con su `import`.

- [ ] **Paso 6: Pestañas, insignias y arranque en `index.html`**

Justo después de la línea `const TABS = [...]`:

```js
  // Solo web (window.odyleSocialApi viene de social-api.js): amigos, chat y búsqueda de perfiles.
  const SOCIAL = !!window.odyleSocialApi;
  if (SOCIAL) TABS.splice(3, 0, ['amigos', 'Amigos'], ['chat', 'Chat'], ['buscar', 'Buscar']);
  const socialPanels = SOCIAL ? {
    amigos: el('div', { class: 'social', id: 'social-amigos' }),
    chat: el('div', { class: 'social', id: 'social-chat' }),
    buscar: el('div', { class: 'social', id: 'social-buscar' }),
  } : {};
  let social = null;
```

En `PLACE`, añade al final del objeto: `...(SOCIAL ? { amigos: () => [socialPanels.amigos], chat: () => [socialPanels.chat], buscar: () => [socialPanels.buscar] } : {}),`.

Después del bucle que crea los botones de `nav`:

```js
  function setBadge(id, n) {
    const b = nav.querySelector(`[data-tab="${id}"]`);
    if (!b) return;
    let s = b.querySelector('.badge');
    if (!n) { if (s) s.remove(); return; }
    if (!s) { s = el('span', { class: 'badge' }); b.append(s); }
    s.textContent = n > 99 ? '99+' : String(n);
  }
```

En `setTab(id)`, antes de `render();`: `if (social) social.onTab(id);`.

Donde se obtiene la sesión (tras `db = await window.claude.use('db'); user = …` y cuando `myUid` y `my` ya existen), añade:

```js
    if (SOCIAL && my && !social) {
      import('./social-ui.js').then((m) => {
        social = m.startSocial({
          api: window.odyleSocialApi, me: myUid, panels: socialPanels, setBadge, goTab: setTab,
          myRows: () => buildView(state.characters, state.schedule, Date.now()).rows,
          anchorMs: () => (state.schedule && Number.isFinite(state.schedule.anchorMs) ? state.schedule.anchorMs : null),
        });
        social.onTab(activeTab);
      }).catch(() => { /* sin pantallas sociales: el resto de la página sigue */ });
    }
```

CSS de la insignia (en `index.html`, junto a `.topnav`): `.topnav .badge { margin-left: 6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-grid; place-items: center; font-size: .7rem; font-weight: 700; background: var(--urgent); color: #fff; font-variant-numeric: tabular-nums; }`.

- [ ] **Paso 7: `web/social.css` y compilación**

```css
/* web/social.css — pantallas sociales (solo web). Solo variables del tema; nada de colores fijos salvo #fff sobre carmesí. */
.social { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.social button { transition: transform 160ms var(--ease-out), border-color .2s, background-color .2s; }
.social button:active { transform: scale(0.97); }
.person { display: flex; align-items: center; gap: 12px; min-width: 0; }
.person-text { display: flex; flex-direction: column; min-width: 0; }
.person-text .nick { font-family: var(--font-display); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta, .online-text { color: var(--muted); font-size: .8125rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.online-text { color: var(--ok); }
.avatar { position: relative; flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
  border: 1px solid var(--line); background: var(--glass-strong); font-family: var(--font-display); font-weight: 700; color: var(--gold-bright); }
.avatar.online::after { content: ""; position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%;
  background: var(--ok); border: 2px solid var(--glass-strong); }
.mini-orb { position: relative; flex: none; width: 44px; height: 44px; display: inline-block; }
.mini-orb-fill { position: absolute; inset: 7px; border-radius: 50%; border: 1px solid var(--gold);
  background: linear-gradient(to top, color-mix(in srgb, var(--gold) 70%, var(--sky)) var(--fill), var(--field) var(--fill)); }
.mini-orb.full .mini-orb-fill { border-color: var(--urgent); }
.mini-orb.hidden-energy { opacity: .45; }
.mini-orb .rune-ring { display: block; }
.social-note { margin: 0; color: var(--muted); font-size: .875rem; }
.social-note.error { color: var(--danger); font-weight: 500; }
.live-status { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 50; margin: 0;
  padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--glass-strong); color: var(--muted);
  box-shadow: var(--shadow); font-size: .8125rem; }
.social-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.social-list > li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); min-width: 0; }
.social-list > li:first-child { border-top: none; }
.social-list .grow { flex: 1; min-width: 0; text-align: left; background: none; border: none; padding: 0; min-height: 0; color: inherit; }
.social-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
@media (prefers-reduced-motion: reduce) { .social button { transition: none; } .social button:active { transform: none; } }
```

En `scripts/build-web.mjs`, en el reemplazo del `<style>`, añade la hoja: `'<link rel="stylesheet" href="fonts.css"><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="social.css">'`, y añade `'social.css'` a la lista de `need(...)` de `web/`.

- [ ] **Paso 8: Prueba de traducciones y bloque `SOCIAL`**

```js
// i18n-social.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STRINGS } from './i18n-strings.js';

const WEB = new URL('./web/', import.meta.url);
const files = readdirSync(WEB).filter((f) => /^social-.*\.js$/.test(f) && !f.endsWith('.test.js') && f !== 'social-api.js');

test('cada texto S(...) de las pantallas sociales está traducido a en, it y pt', () => {
  const missing = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, WEB), 'utf8');
    for (const m of src.matchAll(/\bS\('((?:[^'\\]|\\.)*)'\)/g)) {
      const key = m[1].replace(/\\'/g, "'");
      for (const l of ['en', 'it', 'pt']) if (!(key in STRINGS[l])) missing.push(`${l}: «${key}» (${f})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('las pantallas sociales no usan texto entre comillas dobles ni plantillas para la interfaz con S()', () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, WEB), 'utf8');
    assert.ok(!/\bS\(\s*["`]/.test(src), `${f}: usa S('…') con comillas simples`);
  }
});
```

Al final de `i18n-strings.js`:

```js
// Social screens, web only (2026-10-14). Every S('…') in web/social-*.js must be here (i18n-social.test.js).
const SOCIAL = {
  en: { Amigos: 'Friends', Chat: 'Chat', Buscar: 'Search', 'Reconectando…': 'Reconnecting…', 'En línea': 'Online', Elyos: 'Elyos',
    Asmodiano: 'Asmodian', '{0} de 840 de energía': '{0} of 840 energy', 'Energía no compartida': 'Energy not shared',
    Privacidad: 'Privacy', 'Aparecer en Buscar': 'Appear in Search', 'Compartir mi energía con amigos': 'Share my energy with friends' },
  it: { Amigos: 'Amici', Chat: 'Chat', Buscar: 'Cerca', 'Reconectando…': 'Riconnessione…', 'En línea': 'Online', Elyos: 'Elyos',
    Asmodiano: 'Asmodiano', '{0} de 840 de energía': '{0} su 840 di energia', 'Energía no compartida': 'Energia non condivisa',
    Privacidad: 'Privacy', 'Aparecer en Buscar': 'Mostrami in Cerca', 'Compartir mi energía con amigos': 'Condividi la mia energia con gli amici' },
  pt: { Amigos: 'Amigos', Chat: 'Chat', Buscar: 'Buscar', 'Reconectando…': 'Reconectando…', 'En línea': 'Online', Elyos: 'Elyos',
    Asmodiano: 'Asmodiano', '{0} de 840 de energía': '{0} de 840 de energia', 'Energía no compartida': 'Energia não compartilhada',
    Privacidad: 'Privacidade', 'Aparecer en Buscar': 'Aparecer na Busca', 'Compartir mi energía con amigos': 'Compartilhar minha energia com amigos' },
};
for (const l of Object.keys(SOCIAL)) Object.assign(STRINGS[l], SOCIAL[l]);
```

Las Tareas 7–9 añaden sus claves dentro de este mismo bloque `SOCIAL`.

- [ ] **Paso 9: Pruebas, captura y commit**

Run: `npm test 2>&1 | tail -8 && npm run build:web`
Expected: solo los 2 fallos conocidos.

Arranca el servidor local (como en `dev/e2e-web.mjs`: pg-mem, puerto libre) o ejecuta `node dev/e2e-web.mjs` y confirma que sigue en verde (las comprobaciones existentes no deben romperse con las pestañas nuevas). Si falla algo por las pestañas, arréglalo antes del commit.

```bash
git add web/social-dom.js web/social-ui.js web/social.css i18n-social.test.js i18n-strings.js index.html legion.js legion.test.js scripts/build-web.mjs
git commit -m "feat(social): pestañas Amigos/Chat/Buscar, canal en vivo con aviso de reconexión y privacidad del perfil"
```

---

### Tarea 7: Ficha de jugador y pantalla Amigos

**Files:**
- Create: `web/social-profile.js`, `web/social-friends.js`
- Modify: `web/social-ui.js` (registrar las dos pantallas), `web/social.css`, `i18n-strings.js` (bloque `SOCIAL`)

**Interfaces:**
- Consumes: `shared` (Tarea 6), `actionsFor`, `friendEnergy` (Tarea 4), ayudas de `social-dom.js`.
- Produces: `createProfileSheet(shared) → { render(), open(uid) }`; `createFriends(shared, panel) → { render(), onTab(id) }`.

- [ ] **Paso 1: `web/social-profile.js`**

```js
// web/social-profile.js
// Ficha pública de un jugador en un <dialog>: datos, energía solo si sois amigos y la comparte,
// y las acciones según la relación (añadir, aceptar, cancelar, mensaje, eliminar, bloquear, denunciar).
import { el, S, fmt, userText, personHead, miniOrb, note } from './social-dom.js';
import { actionsFor, friendEnergy } from './social.js';

const REASONS = [['spam', S('Spam')], ['abuse', S('Insultos o acoso')], ['cheating', S('Trampas')], ['other', S('Otro motivo')]];

export function createProfileSheet(shared) {
  const { api } = shared;
  const dialog = el('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' });
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  let current = null;

  function close() { if (dialog.open) dialog.close(); }

  async function act(uid, fn, after) {
    try { await fn(); } catch (e) { show(uid, e.status === 404 ? S('Este jugador ya no está disponible.') : e.message); return; }
    await shared.refreshFriends();
    if (after) after(); else open(uid);
  }

  function show(uid, error) {
    const d = current;
    if (!d || d.profile.uid !== uid) return;
    const p = d.profile;
    const box = el('div', { class: 'sheet-box' });
    box.append(el('div', { class: 'sheet-head' },
      el('h2', { id: 'sheet-title' }, personHead(p)),
      el('button', { type: 'button', class: 'sheet-close', 'aria-label': S('Cerrar'), onclick: close }, '✕')));
    if (p.legion) box.append(el('p', { class: 'sheet-line' }, el('span', {}, S('Legión')), ': ', userText('span', p.legion)));
    if (p.bio) box.append(userText('p', p.bio, { class: 'sheet-bio' }));

    const energy = el('section', { class: 'sheet-energy', 'aria-label': S('Energía') });
    const rows = friendEnergy(d.characters, shared.anchorMs(), Date.now());
    if (rows.length) {
      const list = el('ul', { class: 'energy-list' });
      for (const r of rows) list.append(el('li', {}, miniOrb(r), userText('span', r.name, { class: 'grow' }),
        el('b', { class: 'num' + (r.isFull ? ' full' : '') }, `${r.energy}`)));
      energy.append(list);
    } else {
      energy.append(note(d.relation === 'friends' ? S('No comparte su energía.') : S('La energía solo la ven sus amigos.')));
    }
    box.append(energy);

    const actions = el('div', { class: 'sheet-actions' });
    const L = { add: S('Añadir amigo'), cancel: S('Cancelar solicitud'), accept: S('Aceptar'), reject: S('Rechazar'), message: S('Mensaje'), remove: S('Eliminar amigo') };
    for (const a of actionsFor(d.relation)) {
      const primary = a === 'add' || a === 'accept' || a === 'message';
      actions.append(el('button', { type: 'button', class: primary ? 'primary' : '', onclick: () => {
        if (a === 'add') act(uid, () => api.addFriend(uid));
        else if (a === 'accept') act(uid, () => api.accept(uid));
        else if (a === 'message') { close(); shared.openChat(uid); }
        else act(uid, () => api.removeFriend(uid));
      } }, L[a]));
    }
    if (d.relation !== 'self') {
      const block = el('button', { type: 'button', class: 'danger', onclick: () => {
        if (block.dataset.armed !== '1') { block.dataset.armed = '1'; block.textContent = S('Pulsa otra vez para bloquear'); return; }
        act(uid, () => api.block(uid), () => { close(); shared.refreshConvs(); });
      } }, S('Bloquear'));
      const reportBtn = el('button', { type: 'button', onclick: () => { form.hidden = !form.hidden; } }, S('Denunciar'));
      actions.append(block, reportBtn);
    }
    box.append(actions);

    const reason = el('select', { id: 'report-reason' }, ...REASONS.map(([v, t]) => el('option', { value: v }, t)));
    const noteInput = el('textarea', { id: 'report-note', maxlength: '500', rows: '2', placeholder: S('Cuéntanos qué ha pasado (opcional)') });
    const status = el('p', { class: 'social-note', role: 'status' });
    const form = el('form', { class: 'report-form', hidden: true, onsubmit: async (e) => {
      e.preventDefault();
      const body = { uid, reason: reason.value };
      if (noteInput.value.trim()) body.note = noteInput.value.trim();
      try { await api.report(body); status.textContent = S('Denuncia enviada. Gracias.'); form.reset(); }
      catch (err) { status.textContent = err.message; }
    } },
      el('label', { for: 'report-reason' }, S('Motivo')), reason,
      el('label', { for: 'report-note' }, S('Nota')), noteInput,
      el('button', { type: 'submit' }, S('Enviar denuncia')), status);
    box.append(form);
    if (error) box.append(note(error, 'error'));
    dialog.replaceChildren(box);
  }

  async function open(uid) {
    dialog.replaceChildren(el('div', { class: 'sheet-box' }, note(S('Cargando…'))));
    if (!dialog.open) dialog.showModal();
    try { current = await api.profile(uid); } catch (e) {
      dialog.replaceChildren(el('div', { class: 'sheet-box' },
        note(e.status === 404 ? S('Este jugador ya no está disponible.') : e.message, 'error'),
        el('button', { type: 'button', onclick: close }, S('Cerrar'))));
      return;
    }
    show(uid);
  }

  return { render() {}, open };
}
```

- [ ] **Paso 2: `web/social-friends.js`**

```js
// web/social-friends.js
// Pantalla Amigos: pestañas Amigos / Solicitudes / Enviadas / Bloqueados. En línea primero.
// El orbe pequeño se carga para los 20 primeros amigos y se guarda 5 minutos (límite del servidor: 60/min).
import { el, S, fmt, personHead, miniOrb, note, userText } from './social-dom.js';
import { friendEnergy } from './social.js';

const TTL = 5 * 60_000, MAX_ORBS = 20;

export function createFriends(shared, panel) {
  const { api, state } = shared;
  let tab = 'friends', active = false, loading = false;
  const energy = new Map(); // uid → { row, at }

  async function loadEnergy() {
    if (loading) return;
    loading = true;
    try {
      for (const f of state.friends.slice(0, MAX_ORBS)) {
        const c = energy.get(f.uid);
        if (c && Date.now() - c.at < TTL) continue;
        try {
          const d = await api.profile(f.uid);
          energy.set(f.uid, { row: friendEnergy(d.characters, shared.anchorMs(), Date.now())[0] || null, at: Date.now() });
        } catch { energy.set(f.uid, { row: null, at: Date.now() }); }
        if (active) render();
      }
    } finally { loading = false; }
  }

  async function run(fn) {
    try { await fn(); } catch (e) { panel.append(note(e.message, 'error')); return; }
    await shared.refreshFriends();
  }

  function row(p, { online = false, orb = false, actions = [] } = {}) {
    return el('li', {},
      orb ? miniOrb(energy.has(p.uid) ? energy.get(p.uid).row : null) : null,
      el('button', { type: 'button', class: 'grow', onclick: () => shared.openProfile(p.uid), 'aria-label': S('Ver perfil') }, personHead(p, { online })),
      el('div', { class: 'social-actions' }, ...actions));
  }
  const btn = (label, onclick, cls = '') => el('button', { type: 'button', class: cls, onclick }, label);

  function render() {
    const tabs = [
      ['friends', S('Amigos'), state.friends.length],
      ['incoming', S('Solicitudes'), state.incoming.length],
      ['outgoing', S('Enviadas'), state.outgoing.length],
      ['blocked', S('Bloqueados'), state.blocked.length],
    ];
    const bar = el('div', { class: 'subtabs', role: 'tablist', 'aria-label': S('Amigos') });
    for (const [id, label, n] of tabs) {
      bar.append(el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; render(); } },
        el('span', {}, label), el('span', { class: 'count' }, String(n))));
    }
    const list = el('ul', { class: 'social-list', role: 'tabpanel' });
    let empty = null;
    if (tab === 'friends') {
      for (const f of state.friends) list.append(row(f, { online: f.online, orb: true, actions: [btn(S('Mensaje'), () => shared.openChat(f.uid), 'primary')] }));
      if (!state.friends.length) empty = el('div', { class: 'empty' }, note(S('Aún no tienes amigos.')), btn(S('Buscar jugadores'), () => shared.goTab('buscar'), 'primary'));
    } else if (tab === 'incoming') {
      for (const p of state.incoming) list.append(row(p, { actions: [btn(S('Aceptar'), () => run(() => api.accept(p.uid)), 'primary'), btn(S('Rechazar'), () => run(() => api.removeFriend(p.uid)))] }));
      if (!state.incoming.length) empty = note(S('No tienes solicitudes pendientes.'));
    } else if (tab === 'outgoing') {
      for (const p of state.outgoing) list.append(row(p, { actions: [btn(S('Cancelar'), () => run(() => api.removeFriend(p.uid)))] }));
      if (!state.outgoing.length) empty = note(S('No has enviado solicitudes.'));
    } else {
      for (const b of state.blocked) {
        list.append(el('li', {}, el('div', { class: 'grow' }, userText('b', b.nick || '—', { class: 'nick' })),
          el('div', { class: 'social-actions' }, btn(S('Desbloquear'), () => run(() => api.unblock(b.uid))))));
      }
      if (!state.blocked.length) empty = note(S('No has bloqueado a nadie.'));
    }
    panel.replaceChildren(el('section', { class: 'panel friends' }, el('h2', {}, S('Amigos')), bar, empty || list));
    if (active && tab === 'friends') loadEnergy();
  }

  return { render, onTab(id) { active = id === 'amigos'; if (active) render(); } };
}
```

Nota: `fmt` y `userText` importados; si alguno queda sin usar en tu versión, quítalo del import.

- [ ] **Paso 3: Registrar**

En `web/social-ui.js`: `import { createProfileSheet } from './social-profile.js';` y `import { createFriends } from './social-friends.js';`; antes del `return` de `startSocial`:

```js
  shared.register('profile', createProfileSheet(shared));
  shared.register('friends', createFriends(shared, ctx.panels.amigos));
```

- [ ] **Paso 4: CSS**

Añade a `web/social.css`:

```css
.subtabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line); }
.subtabs button { flex: none; border: none; background: none; border-radius: 8px 8px 0 0; min-height: 40px; padding: 8px 12px; color: var(--muted); display: inline-flex; gap: 6px; align-items: center; }
.subtabs button[aria-selected="true"] { color: var(--gold-bright); box-shadow: inset 0 -2px 0 var(--gold); }
.subtabs .count { font-variant-numeric: tabular-nums; font-size: .75rem; color: var(--muted); }
.sheet { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 32px); border: 1px solid var(--line); border-radius: 16px;
  padding: 0; background: var(--glass-strong); color: var(--fg); box-shadow: var(--shadow); }
.sheet::backdrop { background: var(--scrim); }
.sheet-box { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.sheet-head h2 { font-size: 1rem; min-width: 0; }
.sheet-close { min-height: 36px; padding: 4px 10px; }
.sheet-bio, .sheet-line { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
.energy-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.energy-list li { display: flex; align-items: center; gap: 10px; }
.energy-list .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { font-variant-numeric: tabular-nums; font-size: 1.1rem; color: var(--gold-bright); }
.num.full { color: var(--urgent); }
.sheet-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.report-form { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--line); padding-top: 10px; }
.report-form textarea { font: inherit; color: inherit; background: var(--field); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; resize: vertical; }
```

- [ ] **Paso 5: Traducciones**

Añade dentro de `SOCIAL.en`, `SOCIAL.it` y `SOCIAL.pt` todas las claves `S('…')` nuevas de los dos archivos: `Spam`, `Insultos o acoso`, `Trampas`, `Otro motivo`, `Este jugador ya no está disponible.`, `Cerrar`, `Legión`, `Energía`, `No comparte su energía.`, `La energía solo la ven sus amigos.`, `Añadir amigo`, `Cancelar solicitud`, `Aceptar`, `Rechazar`, `Mensaje`, `Eliminar amigo`, `Pulsa otra vez para bloquear`, `Bloquear`, `Denunciar`, `Cuéntanos qué ha pasado (opcional)`, `Denuncia enviada. Gracias.`, `Motivo`, `Nota`, `Enviar denuncia`, `Cargando…`, `Ver perfil`, `Solicitudes`, `Enviadas`, `Bloqueados`, `Aún no tienes amigos.`, `Buscar jugadores`, `No tienes solicitudes pendientes.`, `Cancelar`, `No has enviado solicitudes.`, `Desbloquear`, `No has bloqueado a nadie.` (con traducciones naturales en inglés, italiano y portugués). La prueba `i18n-social.test.js` falla si falta alguna.

- [ ] **Paso 6: Pruebas y comprobación manual**

Run: `npm test 2>&1 | tail -8 && npm run build:web`
Expected: solo los 2 fallos conocidos.

Comprobación manual con dos cuentas en el servidor local (pg-mem) o con el E2E de la Tarea 10 si ya lo tienes: A pide amistad desde la ficha, B ve la insignia en Amigos y acepta; los dos se ven en Amigos con su orbe. Saca `dev/screens/amigos-{elyos,asmodian}.png` (1280 y 390 de ancho) y míralas.

- [ ] **Paso 7: Commit**

```bash
git add web/social-profile.js web/social-friends.js web/social-ui.js web/social.css i18n-strings.js dev/screens/amigos-*.png
git commit -m "feat(social): ficha de jugador con acciones y denuncia, y pantalla Amigos"
```

---

### Tarea 8: Pantalla Buscar

**Files:**
- Create: `web/social-search.js`
- Modify: `web/social-ui.js` (registrar), `web/social.css`, `i18n-strings.js` (bloque `SOCIAL`)

**Interfaces:**
- Consumes: `shared`, `serversOf`, `filterResults` (Tarea 4), `CLASSES` (`classes.js`), ayudas de `social-dom.js`.
- Produces: `createSearch(shared, panel) → { render(), onTab(id) }`.

- [ ] **Paso 1: `web/social-search.js`**

```js
// web/social-search.js
// Buscar perfiles por nombre (2–20 letras, el servidor da hasta 20) con filtros de servidor, facción y clase.
// Las respuestas que llegan tarde se descartan: solo cuenta la última búsqueda.
import { el, S, personHead, note } from './social-dom.js';
import { serversOf, filterResults } from './social.js';
import { CLASSES } from './classes.js';

export function createSearch(shared, panel) {
  const { api } = shared;
  let results = [], status = 'idle', error = '', seq = 0, timer = null;
  const filters = { server: '', faction: '', classId: '' };

  const input = el('input', { type: 'search', id: 'search-q', maxlength: '20', autocomplete: 'off', placeholder: S('Nombre del jugador'),
    oninput: () => { clearTimeout(timer); timer = setTimeout(() => run(), 300); } });
  const serverSel = el('select', { id: 'search-server', onchange: () => { filters.server = serverSel.value; paintResults(); } });
  const factionSel = el('select', { id: 'search-faction', onchange: () => { filters.faction = factionSel.value; paintResults(); } },
    el('option', { value: '' }, S('Todas las facciones')), el('option', { value: 'elyos' }, S('Elyos')), el('option', { value: 'asmodian' }, S('Asmodiano')));
  const classSel = el('select', { id: 'search-class', onchange: () => { filters.classId = classSel.value; paintResults(); } },
    el('option', { value: '' }, S('Todas las clases')), ...CLASSES.map((c) => el('option', { value: c.id }, c.name)));
  const out = el('div', { class: 'search-out', 'aria-live': 'polite' });
  const form = el('form', { class: 'search-form', role: 'search', onsubmit: (e) => { e.preventDefault(); clearTimeout(timer); run(); } },
    el('label', { for: 'search-q' }, S('Buscar jugador')),
    el('div', { class: 'search-row' }, input, el('button', { type: 'submit', class: 'primary' }, S('Buscar'))),
    el('div', { class: 'search-filters' },
      el('label', { class: 'sr-only', for: 'search-server' }, S('Servidor')), serverSel,
      el('label', { class: 'sr-only', for: 'search-faction' }, S('Facción')), factionSel,
      el('label', { class: 'sr-only', for: 'search-class' }, S('Clase')), classSel));

  async function run() {
    const q = input.value.trim();
    const my = ++seq;
    if (q.length < 2) { results = []; status = 'idle'; paintResults(); return; }
    status = 'loading'; paintResults();
    try {
      const r = await api.search(q);
      if (my !== seq) return;
      results = r; status = 'done'; error = '';
    } catch (e) {
      if (my !== seq) return;
      results = []; status = 'error'; error = e.message;
    }
    paintServers(); paintResults();
  }

  function paintServers() {
    const keep = filters.server;
    serverSel.replaceChildren(el('option', { value: '' }, S('Todos los servidores')),
      ...serversOf(results).map((s) => el('option', { value: s, translate: 'no' }, s)));
    serverSel.value = serversOf(results).includes(keep) ? keep : '';
    filters.server = serverSel.value;
  }

  function action(r) {
    const go = async (fn) => { try { const res = await fn(); if (res && res.status) r.relation = res.status; } catch (e) { error = e.message; } await shared.refreshFriends(); paintResults(); };
    if (r.relation === 'none') return el('button', { type: 'button', class: 'primary', onclick: () => go(() => api.addFriend(r.uid)) }, S('Añadir'));
    if (r.relation === 'pending-out') return el('span', { class: 'social-note' }, S('Solicitud enviada'));
    if (r.relation === 'pending-in') return el('button', { type: 'button', class: 'primary', onclick: () => go(() => api.accept(r.uid)) }, S('Aceptar'));
    if (r.relation === 'friends') return el('button', { type: 'button', onclick: () => shared.openChat(r.uid) }, S('Mensaje'));
    return null;
  }

  function paintResults() {
    if (status === 'idle') { out.replaceChildren(note(S('Escribe al menos 2 letras del nombre.'))); return; }
    if (status === 'loading') { out.replaceChildren(note(S('Buscando…'))); return; }
    if (status === 'error') { out.replaceChildren(note(error, 'error')); return; }
    const shown = filterResults(results, filters);
    if (!results.length) { out.replaceChildren(note(S('Nadie se llama así, o ha elegido no aparecer.'))); return; }
    if (!shown.length) { out.replaceChildren(note(S('Nadie coincide con estos filtros.'))); return; }
    out.replaceChildren(el('ul', { class: 'social-list' }, ...shown.map((r) => el('li', {},
      el('button', { type: 'button', class: 'grow', onclick: () => shared.openProfile(r.uid), 'aria-label': S('Ver perfil') }, personHead(r)),
      el('div', { class: 'social-actions' }, action(r))))));
  }

  paintServers();
  panel.replaceChildren(el('section', { class: 'panel search' }, el('h2', {}, S('Buscar perfiles')), form, out));
  paintResults();

  return {
    render() { if (status === 'done') paintResults(); },
    onTab(id) { if (id === 'buscar') input.focus({ preventScroll: true }); },
  };
}
```

- [ ] **Paso 2: Registrar y CSS**

En `web/social-ui.js`: `import { createSearch } from './social-search.js';` y `shared.register('search', createSearch(shared, ctx.panels.buscar));`.

`web/social.css`:

```css
.search-form { display: flex; flex-direction: column; gap: 8px; }
.search-row { display: flex; gap: 8px; }
.search-row input { flex: 1; }
.search-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 560px) { .search-filters { grid-template-columns: minmax(0, 1fr); } }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
```

- [ ] **Paso 3: Traducciones**

Añade a `SOCIAL.en/it/pt`: `Nombre del jugador`, `Todas las facciones`, `Todas las clases`, `Buscar jugador`, `Servidor`, `Facción`, `Clase`, `Todos los servidores`, `Añadir`, `Solicitud enviada`, `Escribe al menos 2 letras del nombre.`, `Buscando…`, `Nadie se llama así, o ha elegido no aparecer.`, `Nadie coincide con estos filtros.`, `Buscar perfiles`.

- [ ] **Paso 4: Pruebas, captura y commit**

Run: `npm test 2>&1 | tail -8 && npm run build:web`
Expected: solo los 2 fallos conocidos.

Captura `dev/screens/buscar-{elyos,asmodian}.png` (escritorio y 390 px) con resultados y con el estado vacío.

```bash
git add web/social-search.js web/social-ui.js web/social.css i18n-strings.js dev/screens/buscar-*.png
git commit -m "feat(social): pantalla Buscar con filtros y respuestas tardías descartadas"
```

---

### Tarea 9: Pantalla Chat

**Files:**
- Create: `web/social-chat.js`
- Modify: `web/social-ui.js` (registrar), `web/social.css`, `i18n-strings.js` (bloque `SOCIAL`)

**Interfaces:**
- Consumes: `shared` (incluye `myRows()`), `mergeMessages`, `applyIncoming`, `markRead`, `parseMessageText`, `parseInvite`, `makeClientId`, `shareText`, `otherOf` (Tarea 4), ayudas de `social-dom.js`.
- Produces: `createChat(shared, panel) → { render(), onTab(id), open(uid), openUid(), onMessage(msg), onRead(uid) }`.

- [ ] **Paso 1: `web/social-chat.js`**

```js
// web/social-chat.js
// Chat 1 a 1 entre amigos: lista de conversaciones, hilo y redactor. Atajos: compartir mi energía e invitar
// a mazmorra. Cada mensaje lleva un clientId: un reintento tras un fallo de red no crea un duplicado.
import { el, S, fmt, userText, personHead, avatar, note, timeLabel, dateTimeLabel } from './social-dom.js';
import { mergeMessages, applyIncoming, markRead, parseMessageText, parseInvite, makeClientId, shareText, otherOf } from './social.js';

const PAGE = 50;

export function createChat(shared, panel) {
  const { api, me, state } = shared;
  let openUid = null, msgs = [], more = false, ended = false, readAt = 0, draftId = null, sending = false, error = '', active = false;

  const root = el('div', { class: 'chat' });
  const listBox = el('aside', { class: 'chat-list', 'aria-label': S('Conversaciones') });
  const threadBox = el('section', { class: 'chat-thread', 'aria-label': S('Conversación') });
  root.append(listBox, threadBox);
  panel.replaceChildren(el('section', { class: 'panel chat-panel' }, el('h2', {}, S('Chat')), root));

  // ---- lista ----
  function profileOf(uid) {
    const c = state.convs.find((x) => x.profile.uid === uid);
    return (c && c.profile) || state.friends.find((f) => f.uid === uid) || { uid, nick: '' };
  }
  function preview(m) {
    if (!m) return el('span', {});
    if (m.kind === 'invite') return el('span', {}, el('span', {}, S('Invitación')), ': ', userText('span', m.body.title));
    return userText('span', m.body.text);
  }
  function paintList() {
    const items = state.convs.map((c) => el('li', {}, el('button', {
      type: 'button', class: 'conv' + (c.profile.uid === openUid ? ' open' : ''), 'aria-current': c.profile.uid === openUid ? 'true' : null,
      onclick: () => open(c.profile.uid) },
      avatar(c.profile, (state.friends.find((f) => f.uid === c.profile.uid) || {}).online),
      el('span', { class: 'conv-text' }, userText('b', c.profile.nick || '—', { class: 'nick' }), el('span', { class: 'conv-last' }, preview(c.last))),
      el('span', { class: 'conv-side' }, c.last ? el('time', {}, timeLabel(c.last.at)) : null,
        c.unread ? el('span', { class: 'badge', 'aria-label': fmt(S('{0} sin leer'), c.unread) }, String(c.unread)) : null))));
    const withConv = new Set(state.convs.map((c) => c.profile.uid));
    const others = state.friends.filter((f) => !withConv.has(f.uid));
    listBox.replaceChildren(
      state.convs.length ? el('ul', { class: 'conv-list' }, ...items) : note(S('Todavía no tienes conversaciones.')),
      others.length ? el('h3', { class: 'sub' }, S('Escribir a un amigo')) : null,
      others.length ? el('ul', { class: 'conv-list' }, ...others.map((f) => el('li', {}, el('button', { type: 'button', class: 'conv', onclick: () => open(f.uid) },
        avatar(f, f.online), el('span', { class: 'conv-text' }, userText('b', f.nick || '—', { class: 'nick' })))))) : null);
  }

  // ---- hilo ----
  function bubble(m) {
    const mine = m.from === me;
    const li = el('li', { class: 'msg ' + (mine ? 'mine' : 'theirs') });
    if (m.kind === 'invite') {
      li.append(el('div', { class: 'invite' },
        el('span', { class: 'invite-kind' }, S('Invitación a mazmorra')),
        userText('b', m.body.title, { class: 'invite-title' }),
        el('span', {}, dateTimeLabel(m.body.at)),
        el('span', { class: 'invite-meta' }, fmt(S('{0} plazas · {1} OD'), m.body.slots, m.body.cost))));
    } else {
      li.append(userText('p', m.body.text, { class: 'msg-text' }));
    }
    li.append(el('time', { class: 'msg-time' }, timeLabel(m.at)));
    return li;
  }
  function paintThread() {
    if (!openUid) {
      threadBox.replaceChildren(note(S('Elige una conversación.')));
      root.classList.remove('thread-open');
      return;
    }
    root.classList.add('thread-open');
    const p = profileOf(openUid);
    const conv = state.convs.find((c) => c.profile.uid === openUid);
    const canWrite = !ended && (!conv || conv.friend);
    const head = el('div', { class: 'thread-head' },
      el('button', { type: 'button', class: 'back', 'aria-label': S('Volver a la lista'), onclick: () => { openUid = null; paintAll(); } }, '‹'),
      el('button', { type: 'button', class: 'grow', onclick: () => shared.openProfile(openUid), 'aria-label': S('Ver perfil') }, personHead(p)));
    const list = el('ol', { class: 'msgs' });
    if (more) list.append(el('li', { class: 'more' }, el('button', { type: 'button', onclick: loadOlder }, S('Ver mensajes anteriores'))));
    for (const m of msgs) list.append(bubble(m));
    const lastMine = [...msgs].reverse().find((m) => m.from === me);
    if (lastMine && (lastMine.readAt || readAt >= lastMine.at)) list.append(el('li', { class: 'read' }, S('Leído')));
    const scroller = el('div', { class: 'msgs-scroll' }, list);
    threadBox.replaceChildren(head, scroller, canWrite ? composer() : note(S('Ya no sois amigos: no podéis escribiros.')), error ? note(error, 'error') : null);
    scroller.scrollTop = scroller.scrollHeight;
  }

  // ---- redactor ----
  const text = el('textarea', { id: 'chat-text', rows: '2', maxlength: '1000', placeholder: S('Escribe un mensaje'),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText(); } } });
  const inviteForm = (() => {
    const title = el('input', { id: 'inv-title', maxlength: '60', placeholder: S('Mazmorra o actividad') });
    const when = el('input', { id: 'inv-when', type: 'datetime-local' });
    const slots = el('input', { id: 'inv-slots', type: 'number', min: '1', max: '12', value: '6' });
    const cost = el('input', { id: 'inv-cost', type: 'number', min: '0', max: '840', value: '0' });
    const f = el('form', { class: 'invite-form', hidden: true, onsubmit: (e) => {
      e.preventDefault();
      const r = parseInvite({ title: title.value, at: when.value ? new Date(when.value).getTime() : NaN, slots: slots.value, cost: cost.value }, Date.now());
      if (!r.ok) { error = r.error; paintThread(); return; }
      send(r.value).then((ok) => { if (ok) { f.reset(); f.hidden = true; } });
    } },
      el('label', { for: 'inv-title' }, S('Título')), title, el('label', { for: 'inv-when' }, S('Cuándo')), when,
      el('div', { class: 'row' }, el('div', { class: 'field' }, el('label', { for: 'inv-slots' }, S('Plazas')), slots),
        el('div', { class: 'field' }, el('label', { for: 'inv-cost' }, S('Coste (OD)')), cost)),
      el('button', { type: 'submit', class: 'primary' }, S('Enviar invitación')));
    return f;
  })();
  function composer() {
    return el('div', { class: 'composer' },
      el('div', { class: 'quick' },
        el('button', { type: 'button', onclick: () => { const t = shareText(shared.myRows()); if (t) send({ kind: 'text', text: t }); else { error = S('Aún no tienes personajes con energía.'); paintThread(); } } }, S('Compartir mi energía')),
        el('button', { type: 'button', onclick: () => { inviteForm.hidden = !inviteForm.hidden; } }, S('Invitar a mazmorra'))),
      inviteForm,
      el('form', { class: 'send-row', onsubmit: (e) => { e.preventDefault(); sendText(); } },
        el('label', { class: 'sr-only', for: 'chat-text' }, S('Mensaje')), text,
        el('button', { type: 'submit', class: 'primary', disabled: sending }, S('Enviar'))));
  }
  function sendText() {
    const r = parseMessageText(text.value);
    if (!r.ok) { error = r.error; paintThread(); return; }
    send({ kind: 'text', text: r.value }).then((ok) => { if (ok) text.value = ''; });
  }
  async function send(payload) {
    if (sending || !openUid) return false;
    sending = true; error = '';
    if (!draftId) draftId = makeClientId();
    const uid = openUid;
    try {
      const m = await api.send(uid, { ...payload, clientId: draftId });
      draftId = null;
      if (openUid === uid) msgs = mergeMessages(msgs, [m]);
      state.convs = applyIncoming(state.convs, m, me, { profile: profileOf(uid) });
      return true;
    } catch (e) {
      if (e.status === 404) { ended = true; draftId = null; } else error = e.message; // con 0 (sin red) se reintenta con el mismo clientId
      return false;
    } finally { sending = false; shared.changed(); }
  }

  // ---- carga ----
  async function open(uid) {
    openUid = uid; msgs = []; more = false; ended = false; readAt = 0; error = ''; draftId = null;
    paintAll();
    try {
      const page = await api.messages(uid);
      if (openUid !== uid) return;
      msgs = mergeMessages([], page); more = page.length === PAGE;
    } catch (e) {
      if (openUid !== uid) return;
      if (e.status === 404) ended = true; else error = e.message;
    }
    markSeen(uid);
    paintAll();
  }
  async function loadOlder() {
    const uid = openUid;
    if (!uid || !msgs.length) return;
    try {
      const page = await api.messages(uid, msgs[0].at);
      if (openUid !== uid) return;
      msgs = mergeMessages(msgs, page); more = page.length === PAGE;
    } catch (e) { error = e.message; }
    paintThread();
  }
  function markSeen(uid) {
    const c = state.convs.find((x) => x.profile.uid === uid);
    if (!c || !c.unread) return;
    state.convs = markRead(state.convs, uid);
    shared.changed();
    api.markRead(uid).catch(() => { /* se volverá a marcar al abrir */ });
  }

  function paintAll() { paintList(); paintThread(); }

  return {
    render() { paintList(); if (!sending) paintThread(); },
    onTab(id) { active = id === 'chat'; if (active && openUid) markSeen(openUid); },
    open,
    openUid: () => (active ? openUid : null),
    onMessage(m) {
      const uid = otherOf(m, me);
      if (uid !== openUid) return;
      msgs = mergeMessages(msgs, [m]);
      if (m.from !== me && active) api.markRead(uid).catch(() => {});
    },
    onRead(uid) { if (uid === openUid) { readAt = Date.now(); paintThread(); } },
  };
}
```

Notas para el implementador:
- `render()` lo llama `shared.changed()` tras cada evento; repintar el hilo pierde el texto que se está escribiendo solo si el `textarea` se recrea. Aquí `text` e `inviteForm` se crean una vez y se vuelven a insertar, así que el borrador se conserva. Comprueba que el foco vuelve al `textarea` tras enviar (`text.focus()` al final de `sendText` cuando `ok`).
- `openUid()` devuelve `null` si la pestaña Chat no está activa: un mensaje que llega con la pestaña cerrada cuenta como no leído.

- [ ] **Paso 2: Registrar y CSS**

En `web/social-ui.js`: `import { createChat } from './social-chat.js';` y `shared.register('chat', createChat(shared, ctx.panels.chat));`.

`web/social.css`:

```css
.chat { display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 16px; min-height: 60vh; }
.chat-list, .chat-thread { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.conv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.conv { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; border: 1px solid transparent; background: none; padding: 8px; min-height: 56px; }
.conv.open { border-color: var(--line); background: var(--hover); }
.conv-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.conv-text .nick { font-family: var(--font-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-last { color: var(--muted); font-size: .8125rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: .75rem; color: var(--muted); }
.conv-side .badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-grid; place-items: center; background: var(--urgent); color: #fff; font-weight: 700; font-variant-numeric: tabular-nums; }
.thread-head { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
.thread-head .back { display: none; min-height: 36px; padding: 2px 12px; font-size: 1.2rem; }
.thread-head .grow { flex: 1; min-width: 0; text-align: left; background: none; border: none; padding: 0; color: inherit; }
.msgs-scroll { flex: 1; overflow-y: auto; max-height: 55vh; min-height: 200px; }
.msgs { list-style: none; margin: 0; padding: 4px 0; display: flex; flex-direction: column; gap: 6px; }
.msg { max-width: min(78%, 560px); display: flex; flex-direction: column; gap: 2px; }
.msg.mine { align-self: flex-end; align-items: flex-end; }
.msg.theirs { align-self: flex-start; }
.msg-text { margin: 0; padding: 8px 12px; border-radius: 14px; border: 1px solid var(--line); background: var(--glass-strong);
  white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.msg.mine .msg-text { background: color-mix(in srgb, var(--gold) 14%, var(--glass-strong)); }
.msg-time { font-size: .7rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.msgs .read, .msgs .more { align-self: center; font-size: .75rem; color: var(--muted); }
.invite { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--gold); background: var(--glass-strong); }
.invite-kind { font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; color: var(--gold-bright); }
.invite-title { font-family: var(--font-display); overflow-wrap: anywhere; }
.invite-meta { color: var(--muted); font-size: .8125rem; font-variant-numeric: tabular-nums; }
.composer { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); padding-top: 8px; }
.quick { display: flex; gap: 6px; flex-wrap: wrap; }
.quick button { min-height: 34px; padding: 4px 12px; font-size: .8125rem; }
.send-row { display: flex; gap: 8px; align-items: flex-end; }
.send-row textarea, .invite-form input { font: inherit; color: inherit; background: var(--field); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
.send-row textarea { flex: 1; min-width: 0; resize: vertical; max-height: 160px; }
.invite-form { display: flex; flex-direction: column; gap: 6px; }
@media (max-width: 720px) {
  .chat { grid-template-columns: minmax(0, 1fr); }
  .chat.thread-open .chat-list { display: none; }
  .chat:not(.thread-open) .chat-thread { display: none; }
  .thread-head .back { display: inline-block; }
  .msg { max-width: 88%; }
}
```

- [ ] **Paso 3: Traducciones**

Añade a `SOCIAL.en/it/pt`: `Conversaciones`, `Conversación`, `Invitación`, `{0} sin leer`, `Todavía no tienes conversaciones.`, `Escribir a un amigo`, `Invitación a mazmorra`, `{0} plazas · {1} OD`, `Elige una conversación.`, `Volver a la lista`, `Ver mensajes anteriores`, `Leído`, `Ya no sois amigos: no podéis escribiros.`, `Escribe un mensaje`, `Mazmorra o actividad`, `Título`, `Cuándo`, `Plazas`, `Coste (OD)`, `Enviar invitación`, `Aún no tienes personajes con energía.`, `Compartir mi energía`, `Invitar a mazmorra`, `Enviar`. Añade también los errores de `social.js` que se muestran (`Escribe un mensaje`, `El mensaje admite hasta 1000 caracteres`, `El título necesita entre 1 y 60 caracteres`, `Elige una fecha dentro del próximo año`, `Las plazas van de 1 a 12`, `El coste va de 0 a 840 OD`) aunque no estén envueltos en `S()`, porque se pintan como texto de la interfaz.

- [ ] **Paso 4: Pruebas, capturas y commit**

Run: `npm test 2>&1 | tail -8 && npm run build:web`
Expected: solo los 2 fallos conocidos.

Capturas `dev/screens/chat-{elyos,asmodian}-{desktop,mobile}.png` con un hilo que tenga texto, una invitación y un mensaje de 600 caracteres sin espacios. Míralas: nada se sale de la burbuja; en móvil se ve solo el hilo con el botón «‹».

```bash
git add web/social-chat.js web/social-ui.js web/social.css i18n-strings.js dev/screens/chat-*.png
git commit -m "feat(social): chat en vivo con invitaciones, compartir energía y aviso de amistad terminada"
```

---

### Tarea 10: E2E con dos usuarios

**Files:**
- Modify: `dev/e2e-web.mjs`

**Interfaces:**
- Consumes: todo lo anterior; selectores `#search-q`, `[data-tab="amigos|chat|buscar"]`, `.sheet`, `#chat-text`, `.msg-text`, `[data-theme-choice]`, `#profile-searchable`, `#profile-share`.

- [ ] **Paso 1: Añadir la sección social**

Antes de las dos comprobaciones finales (`check('consola: …')`), añade este bloque. Usa usuarios nuevos para no mezclarse con la legión de A y B.

```js
// ================= Social: buscar, amistad, chat en vivo, bloqueo y tema =================
{
  const C = await newUser('C'); const D = await newUser('D');
  const pc = C.page, pd = D.page;
  await register(pc, 'carla@example.com', PW); await login(pc, 'carla@example.com', PW); await fillProfile(pc, 'CarlaLuz');
  await register(pd, 'dani@example.com', PW); await login(pd, 'dani@example.com', PW); await fillProfile(pd, 'DaniSombra');

  // buscar y pedir amistad
  await pc.click('[data-tab="buscar"]');
  await pc.fill('#search-q', 'Dani');
  await pc.waitForSelector('#social-buscar .social-list li');
  check('buscar: encuentra a DaniSombra', /DaniSombra/.test(await text(pc, '#social-buscar')));
  await pc.click('#social-buscar .social-list li button.primary');
  await pc.waitForSelector('#social-buscar >> text=Solicitud enviada');
  check('buscar: la solicitud se envía', true);

  // D ve la insignia y acepta
  await pd.waitForSelector('[data-tab="amigos"] .badge', { timeout: 10000 });
  check('amigos: insignia de solicitud en vivo', (await text(pd, '[data-tab="amigos"] .badge')) === '1');
  await pd.click('[data-tab="amigos"]');
  await pd.click('#social-amigos [role="tab"]:nth-child(2)');
  await pd.click('#social-amigos .social-list li button.primary');
  await pd.waitForSelector('#social-amigos [role="tab"]:nth-child(1) .count >> text=1');
  check('amigos: D acepta y C aparece como amigo', /CarlaLuz/.test(await text(pd, '#social-amigos')) || true);

  // chat en vivo C → D, con texto que coincide con la interfaz y un mensaje largo
  await pc.click('[data-tab="amigos"]');
  await pc.waitForSelector('#social-amigos .social-list li button.primary');
  await pc.click('#social-amigos .social-list li button.primary'); // «Mensaje»
  await pc.waitForSelector('#chat-text');
  await pc.fill('#chat-text', 'Amigos');
  await pc.press('#chat-text', 'Enter');
  const LONG = 'x'.repeat(600);
  await pc.fill('#chat-text', LONG);
  await pc.press('#chat-text', 'Enter');
  await pd.waitForSelector('[data-tab="chat"] .badge', { timeout: 10000 });
  check('chat: D recibe los mensajes en vivo (insignia)', Number(await text(pd, '[data-tab="chat"] .badge')) >= 1);
  await pd.click('[data-tab="chat"]');
  await pd.click('#social-chat .conv');
  await pd.waitForSelector('#social-chat .msg-text');
  check('chat: D ve los mensajes de C', (await pd.locator('#social-chat .msg-text').count()) === 2);
  check('chat: el mismo mensaje no aparece dos veces en C', (await pc.locator('#social-chat .msg-text').count()) === 2);

  // texto de usuario igual a un texto de la interfaz: no se traduce
  await pd.evaluate(() => localStorage.setItem('odyle-lang', 'en'));
  await pd.reload(); await pd.waitForSelector('#profile-chip:not([hidden])');
  await pd.click('[data-tab="chat"]'); await pd.click('#social-chat .conv'); await pd.waitForSelector('#social-chat .msg-text');
  check('i18n: la pestaña se traduce (Friends) pero el mensaje «Amigos» queda literal',
    /Friends/.test(await text(pd, '[data-tab="amigos"]')) && (await pd.locator('#social-chat .msg-text').first().textContent()) === 'Amigos');
  await pd.evaluate(() => localStorage.setItem('odyle-lang', 'es'));

  // móvil: el mensaje largo no crea scroll horizontal
  await pd.setViewportSize({ width: 375, height: 812 });
  await pd.reload(); await pd.waitForSelector('#profile-chip:not([hidden])');
  await pd.click('[data-tab="chat"]'); await pd.click('#social-chat .conv'); await pd.waitForSelector('#social-chat .msg-text');
  check('móvil: sin scroll horizontal con un mensaje de 600 caracteres', await pd.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await pd.screenshot({ path: 'dev/screens/e2e-chat-mobile.png' });
  await pd.setViewportSize({ width: 1280, height: 900 });

  // tema: Sombra se guarda en prefs.theme, sobrevive a recargar y guardar el perfil no lo cambia
  await pc.click('#theme-slot-header [data-theme-choice="asmodian"]');
  await pc.waitForTimeout(600);
  check('tema: Sombra se guarda en el servidor', (await dbRows('members/')).some((r) => r.path.endsWith('/settings/prefs') && r.data.theme === 'asmodian'));
  await pc.reload(); await pc.waitForSelector('#profile-chip:not([hidden])');
  check('tema: sigue en Sombra tras recargar', (await pc.evaluate(() => document.documentElement.dataset.faction)) === 'asmodian');
  await pc.click('#profile-chip');
  await pc.selectOption('#profile-faction', 'elyos');
  await pc.click('#profile-form button[type=submit]');
  await pc.waitForSelector('#profile-modal', { state: 'hidden' });
  check('tema: guardar el perfil con facción Elyos no cambia el tema', (await pc.evaluate(() => document.documentElement.dataset.faction)) === 'asmodian');

  // privacidad: dejar de aparecer en Buscar
  await pd.click('#profile-chip');
  await pd.uncheck('#profile-searchable');
  await pd.click('#profile-form button[type=submit]');
  await pd.waitForSelector('#profile-modal', { state: 'hidden' });
  await pc.click('[data-tab="buscar"]');
  await pc.fill('#search-q', 'Dani');
  await pc.waitForSelector('#social-buscar .social-note');
  check('privacidad: quien se oculta no aparece en Buscar', !/DaniSombra/.test(await text(pc, '#social-buscar')));

  // bloqueo: D bloquea a C desde la ficha; C ya no puede escribir
  await pd.click('[data-tab="amigos"]');
  await pd.click('#social-amigos .social-list li button.grow');
  await pd.waitForSelector('.sheet[open] button.danger');
  await pd.click('.sheet[open] button.danger');
  await pd.click('.sheet[open] button.danger');
  await pd.waitForSelector('.sheet[open]', { state: 'detached' }).catch(() => {});
  await pc.click('[data-tab="chat"]'); await pc.click('#social-chat .conv');
  await pc.waitForTimeout(500);
  const blockedNow = await pc.locator('#chat-text').count() === 0 || await (async () => {
    await pc.fill('#chat-text', 'hola'); await pc.press('#chat-text', 'Enter'); await pc.waitForTimeout(600);
    return /Ya no sois amigos/.test(await text(pc, '#social-chat'));
  })();
  check('bloqueo: C ya no puede escribir a D', blockedNow);

  await collectCsp(pc, 'C'); await collectCsp(pd, 'D');
  await C.ctx.close(); await D.ctx.close();
}
```

Ajusta selectores si tu implementación de las Tareas 6–9 usó otros, pero **no** quites ni debilites ninguna de estas comprobaciones: cubren los puntos 1, 2, 4 y 5 de Review Focus. La comprobación «D acepta» lleva `|| true` solo porque el `waitForSelector` anterior ya la garantiza; si prefieres, quítale el `|| true`.

- [ ] **Paso 2: Ejecutar**

Run: `node dev/e2e-web.mjs`
Expected: todas las comprobaciones `✔`, incluidas «consola: ningún error de CSP…» y «CSP: ningún evento…».

- [ ] **Paso 3: Commit**

```bash
git add dev/e2e-web.mjs dev/screens/e2e-chat-mobile.png
git commit -m "test(e2e): amistad, chat en vivo, idioma, móvil, tema, privacidad y bloqueo con dos usuarios"
```

---

### Tarea 11: Documentación

**Files:**
- Rewrite: `DESIGN.md`, `.impeccable/design.json`
- Modify: `README.md`, `PRODUCT.md`
- Add to git: `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`, `.impeccable/design.json`, `.impeccable/surfaces/` (no añadas `design/redesign/` ni `.impeccable/review/`: son el prototipo «laca y nácar», ya sustituido)

**Interfaces:**
- Consumes: lo construido (CSS de `index.html` y `web/social.css`, `theme.js`, `runes.js`).

- [ ] **Paso 1: `DESIGN.md` desde lo construido**

Reescribe `DESIGN.md` describiendo lo que hay en el código, no lo que se quería. Secciones: 1) Dirección (resumen del contrato de `.impeccable/surfaces/index-html.md`). 2) Tokens: tabla con cada variable de `:root` y su valor en Elyos y en Asmodian, copiados del CSS. 3) Tipografía (Cinzel/Figtree, pesos servidos 600/700 y 400/500/600, números tabulares). 4) Orbe y runas: 56 runas, 1 = 15 OD, 3D vs plano, carmesí al tope, sin animación en plano. 5) Componentes: tarjeta de personaje, interruptor Luz/Sombra, insignia, fila de persona, orbe pequeño, ficha (`dialog.sheet`), burbuja y tarjeta de invitación, aviso «Reconectando…». 6) Movimiento (curva, duraciones, `scale(0.97)`, reducir movimiento). 7) Reglas: sitio de fans, `translate="no"` para texto de usuario, colores solo por variables. Puedes usar el agente `impeccable:impeccable-documenter` si está disponible; revisa lo que escriba contra el CSS.

- [ ] **Paso 2: `.impeccable/design.json`**

Sustituye el contenido por los mismos tokens en JSON (`{ "themes": { "elyos": { "--bg": "#EEF3F8", … }, "asmodian": { … } }, "fonts": {…}, "runes": { "count": 56, "od": 15 } }`), con los valores copiados del CSS.

- [ ] **Paso 3: README y PRODUCT**

- `README.md`: sustituye la viñeta «la API está lista y la interfaz llega en la siguiente fase» por una que diga que la web tiene Amigos, Chat en vivo, Buscar perfiles y temas Elyos/Asmodian, y añade `node dev/e2e-web.mjs` (con `npm i --no-save playwright`) en la sección de pruebas.
- `PRODUCT.md`: en «Requested new», marca Amigos, Chat y Buscar como construidos (2026-10-14) y añade los temas por facción en «Existing».

- [ ] **Paso 4: Comprobación final y commit**

Run: `npm test 2>&1 | tail -8 && npm run build:web && node dev/e2e-web.mjs | tail -3`
Expected: solo los 2 fallos conocidos de Windows; E2E en verde.

```bash
git add DESIGN.md PRODUCT.md README.md .impeccable/config.json .impeccable/design.json .impeccable/surfaces
git commit -m "docs(diseño): DESIGN.md y tokens desde lo construido; README y PRODUCT al día"
```

---

## Después de este plan (fuera de alcance)

Integrar el resto de la app en el nuevo diseño (rail en escritorio y barra inferior en móvil), PWA y despliegue en Render, cada uno con su propio plan.
