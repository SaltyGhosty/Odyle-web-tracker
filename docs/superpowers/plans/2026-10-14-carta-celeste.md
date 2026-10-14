# Carta celeste de Atreia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Llevar la app al mundo visual elegido por el usuario («Carta celeste de Atreia»): orbes dibujados que se recargan (sin 3D ni partículas), Elyos en crepúsculo dorado (sin blanco) y Asmodian en el Abismo, filas con los orbes alineados, gastos rápidos y Plan de hoy.

**Architecture:** Se parte de la rama `feat/marco-energia` (rail, barra inferior, banda, filas, columna lateral ya existen). Se sustituyen tokens, tipografía y orbes; el orbe pasa a ser un SVG generado por un módulo puro (`starorb.js`) y se retira la escena three.js. El Plan de hoy sale de una función pura nueva en `layout.js`.

**Tech Stack:** HTML/CSS/JS sin framework, SVG, `node --test`, Playwright (`dev/e2e-web.mjs`).

**Spec / dirección:** contrato de dirección en `.impeccable/surfaces/index-html.md` (THESIS, OWN-WORLD, STORY, FIRST VIEWPORT con el pedido del usuario de orbes alineados, FORM, FINISH). Boceto elegido: `.impeccable/mocks/decision2/model-pick.html` (referencia de composición; los orbes van **alineados**, no en zigzag). Spec funcional anterior: `docs/superpowers/specs/2026-10-14-marco-y-energia-design.md`.

## Global Constraints

- Rama: `feat/marco-energia` (sin fusionar). `index.html` lo comparten la web y el artifact (sin `window.odyleSocialApi`).
- Paleta Elyos (Luz, crepúsculo): suelo `#2F3B55`, rail/paneles `#1F2840`, texto `#F4E7C8` / `#B9C2D6`, oro `#E3A853`, cielo `#9CC3E6`, carmesí `#D2453A` (texto carmesí `#FF9A8E`, botón carmesí `#B9372D`). Asmodian (Sombra, Abismo): suelo violeta noche, paneles más hondos, tinta de plata, acento violeta y el mismo carmesí; el implementador fija los valores con contraste AA y los documenta.
- Nada de blanco como fondo ni paneles blancos en ningún tema.
- Tipografía: Marcellus (marca y nombres de personaje) y Gothic A1 (interfaz y números tabulares), servidas desde `server/public/fonts` vía `@fontsource` (como hoy Cinzel/Figtree).
- Filetes de 1px en oro (Elyos) o plata (Asmodian); esquinas rectas; sin cristal (`backdrop-filter`), sin sombras de tarjeta, sin `border-left`/`border-right` de color de más de 1px en listas o tarjetas, sin texto con degradado, sin rótulos tipo «eyebrow» encima de títulos.
- Orbes: dibujados en SVG, **sin three.js ni partículas**. Todos los orbes en la misma columna y el nombre siempre a la misma distancia del orbe (pedido explícito del usuario).
- Movimiento (Emil): `scale(0.97)` al pulsar, `cubic-bezier(0.23,1,0.32,1)`, < 300 ms en la interfaz; la ondulación de recarga y el latido al tope son el único momento de autor; todo apagado con `prefers-reduced-motion: reduce`.
- CSP estricta y Trusted Types: sin `innerHTML` ni sumideros; `setTimeout` solo con flecha; SVG con `createElementNS`.
- Objetivos táctiles ≥ 44 px; contraste ≥ 4.5:1 en texto; temas también en selección de texto, barras de scroll y anillos de foco.
- Sitio de fans: sin arte de NCSOFT; iconos y estrellas dibujados por nosotros.
- Pruebas: `node --test *.test.js web/*.test.js`; `npm run build:web`; `cd server && npm test` (2 fallos conocidos de Windows); `node dev/e2e-web.mjs` (línea base 120/120). Sin `npm test` en la raíz.
- Commits sin `Co-Authored-By`.

## Review Focus

1. **Orbes desalineados** con nombres largos, sin clase, en modo compacto o en móvil: el orbe y el inicio del nombre deben caer en la misma x en todas las filas. Lo fija una comprobación E2E que mide las x (Tarea 3).
2. **Recarga en vivo**: al subir +15 la siguiente estrella se enciende y el líquido ondula una vez; sin bucles ni repintados que reinicien la animación en cada segundo. Lo fija una prueba de `starorb.js` y una comprobación E2E (Tareas 1 y 3).
3. **Tema Asmodian** con la nueva paleta: contraste AA en texto y botones. Lo fija la revisión de capturas y un cálculo de contraste en el informe (Tarea 2).
4. **Plan de hoy sin hora de recarga o sin presets**: estado vacío claro, sin `NaN` ni filas rotas. Lo fijan pruebas de `planRows` (Tarea 3).
5. **Artifact sin social** y modo ligero: todo funciona sin three.js. Lo fija la E2E existente más las capturas (Tareas 1 y 4).

---

### Tarea 1: Orbe dibujado (`starorb.js`) y retirada de three.js

**Files:** Create `starorb.js`, `starorb.test.js`; Modify `index.html` (orb slot, `initScene`, `scene.*`, `#scene`, `body.flat`, «Modo ligero»), `scripts/build-web.mjs` (`EXPECTED`, sin copia de `vendor/three.module.js` ni reemplazo de CDN), `package.json` (quitar `three`), `server/test/pages.test.js` si comprueba `/vendor/three.module.js` u `/orb.js`; Delete `orb.js`, `dev/orb-smoke.*`, y `motion.js` funciones solo usadas por la escena (comprobar con grep).

**Interfaces:** Produces `buildStarOrb(doc, { energy, max = 840, state = 'normal'|'near'|'full', size = 104, id }) → SVGElement` (clase `star-orb`, `role="img"` y `aria-label` lo pone quien llama) y `updateStarOrb(svg, { energy, state })` que cambia nivel y estrellas sin recrear el nodo; `litStars(energy)` reutiliza `litRunes` de `runes.js`; `markGain(svg)` añade la clase de ondulación una vez (se quita en `animationend`).

- [ ] Pruebas (`starorb.test.js`, documento falso como en `runes.test.js`): 56 estrellas; encendidas = floor(energía/15); nivel del líquido proporcional (y 0 y 840 en los extremos); estado `full` → clase `full`; `updateStarOrb` reutiliza el mismo nodo y cambia solo atributos; `markGain` no se acumula si se llama dos veces seguidas.
- [ ] Implementar: SVG 104×104: círculo de cristal con filete de cielo, líquido recortado por `clipPath` con la superficie como trazo ondulado suave (`path`), reflejo de luz pequeño, anillo de 56 estrellas (4 puntas, propias) en el radio exterior. Colores por variables CSS (`--orb-liquid-top`, `--orb-liquid-deep`, `--orb-ring`, `--orb-ring-off`, `--urgent`). Animaciones solo CSS: ondulación al ganar (translate de la superficie, ~900 ms, una vez), la estrella nueva se enciende con escala 0.6→1, latido del anillo al tope (2.4 s); todo dentro de `@media (prefers-reduced-motion: no-preference)`.
- [ ] Integrar en `cardNode` (sustituye `.orb-flat` + `buildRuneRing`), en `render` (ganancias → `markGain`, llenado → latido), y en `miniOrb` de `web/social-dom.js` (tamaño 44, sin animación). Quitar la escena: `#scene`, `initScene`, `scene.*`, `orbList`/`setOrbs`, `body.flat`, el aviso de movimiento iOS (`#motion-btn`) si solo servía al 3D, y el interruptor «Modo ligero» (o renombrarlo a «Reducir animaciones» si sigue teniendo uso; decidir y explicar).
- [ ] Verificar y commit: «feat(orbe): orbe de luz dibujado en SVG con 56 estrellas; fuera three.js».

### Tarea 2: Mundo Atreia — tokens, tipografía y marco

**Files:** Modify `index.html` (CSS de `:root` y `:root[data-faction="asmodian"]`, rail, cabecera, botones, campos, insignias, menús, hoja «Más», banda, columna lateral, selección/scroll/foco), `web/social.css`, `theme.js` (`THEMES.*.themeColor`, `light: false` en ambos, `orb` colores si se usan), `scripts/build-web.mjs` (`FONTS`: Marcellus 400; Gothic A1 400/500/700/800 con los subconjuntos que existan), `package.json` (`@fontsource/marcellus`, `@fontsource/gothic-a1`; quitar Cinzel y Figtree si ya no se usan), `theme.test.js` (valores nuevos).

- [ ] Tokens por facción con los valores de Global Constraints; Asmodian con valores elegidos y contraste comprobado (anotar ratios en el informe).
- [ ] Rail: campo lleno `#1F2840` con filete de oro a la derecha, marca «Odyle» en Marcellus, elemento activo con fondo de oro al 10% y texto oro (sin borde izquierdo de color > 1px), insignias en oro con texto oscuro.
- [ ] Cabecera: regla de ticks bajo el título y **meridiano** (línea vertical de oro con rombo y rótulo «próxima recarga hh:mm:ss») cuya posición horizontal avanza con la cuenta atrás (0 % recién recargado → 100 % al llegar la recarga); se actualiza en el mismo tic que el reloj, sin repintar la página.
- [ ] Botones (primario oro, secundario filete oro, peligro carmesí `#B9372D`), campos, selects, interruptor Luz/Sombra cuadrado, menús y diálogos con esquinas rectas y paneles `#1F2840`; foco con anillo de cielo; selección de texto y scrollbars tintados.
- [ ] Capturas Energía, Amigos y Chat en Luz y Sombra (1440 y 390) vistas a ojo; commit «feat(tema): carta celeste de Atreia: crepúsculo de Elyos, Abismo de Asmodian».

### Tarea 3: Pantalla Energía — filas alineadas, gastos rápidos y Plan de hoy

**Files:** Modify `index.html` (filas, constelación, gastos rápidos, Plan de hoy, banda), `layout.js` + `layout.test.js` (`planRows`), `i18n-strings.js`, `dev/e2e-web.mjs`.

**Interfaces:** `planRows(rows, presets, { anchorMs, now, endOfDayMs }) → [{ id, name, runs: { [presetId]: number }, next: { tone: 'urgent'|'normal'|'empty', text } }]` usando `runsToday` de `planner.js` (mazmorras posibles hoy por preset) y un texto de próxima meta («Gastar ya: está al tope», «Theobomos ×8 en 3 h», «Sin hora de recarga»).

- [ ] Filas: columna fija para el orbe (mismo ancho y margen en todas), el nombre empieza siempre en la misma x; constelación = línea punteada vertical recta de oro que une los centros de los orbes (pseudo-elemento de la lista, por detrás); nombre Marcellus 24px, clase en mayúsculas espaciadas, estado con punto; número 48px tabular; acciones a la derecha. Igual en móvil (orbe más pequeño pero misma columna) y en modo compacto.
- [ ] Gastos rápidos: bajo las filas, chips con los presets del personaje urgente (o el seleccionado si no hay urgente), cada chip llama al `spend` existente; «Deshacer último» usa el deshacer existente.
- [ ] Plan de hoy: tabla con cabecera por preset (nombre y coste), una fila por personaje con «N×» por preset y la próxima meta; estado vacío si no hay presets o no hay personajes.
- [ ] Banda de decisión: se mantiene, en versión fina de la carta (línea carmesí con «Gastar»), para no perder el principio «lo urgente primero».
- [ ] Pruebas de `planRows` (con y sin hora de recarga, sin presets, personaje al tope). E2E: misma x de orbe y nombre en todas las filas (incluido un nombre de 24 caracteres y uno sin clase) a 1280 y 390; un gasto rápido resta energía; el Plan de hoy muestra una fila por personaje.
- [ ] Commit «feat(energia): filas alineadas con constelación, gastos rápidos y Plan de hoy».

### Tarea 4: Revisión final de diseño y documentación

- [ ] Capturas finales en `.impeccable/review/` (`desktop.png` 1440, `mobile.png` 390, en Luz y en Sombra con sufijo), detector `impeccable detect --json` sobre `index.html` y `web/social.css`, arreglar lo mecánico.
- [ ] Revisión con `impeccable-finish-reviewer` (contrato, capturas, boceto `model-pick.html` como referencia de crítica) y una ronda de arreglos si la pide.
- [ ] `impeccable-documenter` reescribe `DESIGN.md` y `.impeccable/design.json` desde lo construido.
- [ ] Commit «docs(diseño): carta celeste de Atreia».
