# Rediseño Elyos 3D — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:executing-plans (elegido por el usuario). Casillas `- [ ]`.

**Objetivo:** Dar a la página del tracker identidad Aion/Elyos con una escena 3D (Three.js): fondo del Abismo con partículas de éter, un orbe de Odyle 3D por personaje, aviso de casi lleno, cuenta atrás en vivo, animación +15 y transiciones.

**Arquitectura:** Un único `<canvas>` WebGL fijo detrás del contenido dibuja el fondo y, con scissor/viewport, un orbe dentro del hueco `.orb-slot` de cada tarjeta (técnica "varias escenas, un canvas"; un solo contexto WebGL). La lógica pura nueva (clases, detección de +15, formato de reloj) va en módulos testeados con `node --test`. Si no hay WebGL o el sistema pide "reducir movimiento", se usa un orbe plano en CSS y fondo estático.

**Tecnología:** Three.js `0.160.0` como módulo ES desde `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`; HTML/CSS/JS sin framework; `node --test`; Playwright (Chromium en `/opt/pw-browsers`) para la prueba de humo.

**Spec:** `docs/2026-10-10-aion2-stamina-tracker-decisions.md` + decisiones de diseño de este documento (sección "Diseño"). El usuario aprobó la sección 1 y pidió ejecutar; las secciones 2–5 las fijé yo (ver Rulings en el ledger).

## Diseño

1. **Estética (aprobada):** fondo azul noche casi negro; dorado cálido `#e8b85a` principal (energía, títulos, brillos); azul cielo `#7cc8ff` secundario (éter, cuenta atrás); texto marfil `#f3ecdc`. Títulos y nombres en Cinzel (Google Fonts), cuerpo en Figtree, números con `font-variant-numeric: tabular-nums`. Tarjetas de cristal oscuro (`rgba(14,20,38,.62)` + `backdrop-filter: blur(10px)`) con borde dorado fino. Orbe a la izquierda en escritorio, arriba en móvil. Iconos de clase propios en línea dorada (SVG inline).
2. **Escena 3D:** partículas de éter (dorado y azul cielo, aditivas, suben despacio con vaivén): 500 en ≥720px, 200 en móvil. Orbe: esfera de cristal (shader fresnel, borde dorado) + líquido interior (shader: nivel = `percent`, superficie ondulada con `sin(tiempo)`, color = mezcla del color de clase con dorado) + halo.
3. **Animaciones:** `nearFull` = no lleno y `energy >= 810` (≤ 2 recargas para 840) → el orbe y el borde de la tarjeta laten en dorado. Lleno → brillo fijo intenso y etiqueta "Lleno". Cuenta atrás de la cabecera cada segundo en `hh:mm:ss` con anillo SVG que se cierra. Cuando la energía calculada de un personaje sube sin que el usuario la haya editado → "+15" flotante y onda en el orbe. El número rueda del valor viejo al nuevo en 600 ms. Tarjetas entran con fundido escalonado; inclinación leve al pasar el ratón (solo `pointer: fine`); brillo que recorre los botones principales.
4. **Datos:** cada personaje admite `classId` ∈ `asesino, gladiador, templario, arquero, hechicero, espiritista, clerigo, cantor`. Sin clase o desconocida → sin icono, color dorado neutro. El formulario de añadir y el de actualizar tienen un selector de clase. Color por clase (fijo).
5. **Rendimiento y respaldo:** `pixelRatio = min(devicePixelRatio, 1.5)`; el bucle se pausa con `document.hidden`; sin WebGL o con `prefers-reduced-motion: reduce` → orbe CSS plano, sin partículas, sin rodar números ni "+15" animado (los valores cambian directamente).

## Restricciones globales

- Todo lo del plan anterior sigue vigente (+15 cada 3 h, máx. 840, entrada manual, `db`, textos en español, sin datos de personajes en el código).
- Solo scripts de `cdn.jsdelivr.net/npm/` con versión exacta; fuentes solo de Google Fonts.
- Un único contexto WebGL en la página.
- La página nunca escribe en `db` desde animaciones o temporizadores.
- Los iconos de clase son dibujos propios, no los iconos oficiales del juego.

## Foco de revisión

1. **Dispositivo sin WebGL / "reducir movimiento":** la página funciona igual con orbes planos → prueba de humo en Tarea 4.
2. **Tarjetas que aparecen, desaparecen o se reordenan** (añadir/quitar/snapshot): los orbes siguen a su tarjeta, sin orbes huérfanos → prueba de humo en Tarea 4.
3. **Editar la energía a mano no dispara "+15"** (solo sube por recarga) → test de `detectGains` en Tarea 2.
4. **Pestaña en segundo plano horas:** al volver no se dispara una ráfaga de animaciones ni un "+15" por cada tick perdido (uno solo, con el total) → test en Tarea 2.
5. **Scroll y redimensionado:** el orbe queda alineado con su hueco al hacer scroll o girar el móvil → prueba de humo en Tarea 4.

---

### Tarea 1: Clases y modelo de vista

**Archivos:** Crear `classes.js`, `classes.test.js`; modificar `view.js`, `view.test.js`.

**Produce:**
- `CLASSES: Array<{id, name, color, icon}>` en el orden de Diseño 4; nombres: Asesino, Gladiador, Templario, Arquero, Hechicero, Espiritista, Clérigo, Cantor. Colores: asesino `#b79cff`, gladiador `#e0924a`, templario `#d9c27a`, arquero `#8fd18b`, hechicero `#ff7d7d`, espiritista `#6fd6d0`, clerigo `#fff2c4`, cantor `#ffb3e1`. `icon`: string con el `d` de un `<path>` SVG en viewBox 0 0 24 24 (dibujo propio).
- `NEUTRAL_COLOR = '#e8b85a'`
- `classById(id: string): Class | null`
- En `view.js`: cada `Row` añade `classId: string|null`, `color: string` (de la clase o `NEUTRAL_COLOR`), `nearFull: boolean`; nueva `parseClassInput(s: string): {ok:true, value:string|null} | {ok:false, error:string}` (`''` → `null`; id válido → id; otro → error `'Elige una clase de la lista'`).
- `NEAR_FULL = 810` exportado desde `view.js`.

- [ ] **Paso 1: Tests que fallan.** `classes.test.js`: 8 clases, ids en orden, `classById('clerigo').name === 'Clérigo'`, `classById('x') === null`, cada `icon` no vacío. `view.test.js` añade: fila con `classId:'asesino'` → `color '#b79cff'`; sin `classId` → `classId null`, `color NEUTRAL_COLOR`; `classId:'xx'` → `classId null`; `nearFull` con energía 810 → true, 809 → false, 840 → false; `parseClassInput('')` → `{ok:true,value:null}`, `('gladiador')` ok, `('mago')` no ok.
- [ ] **Paso 2:** `npm test` → FAIL (classes.js no existe).
- [ ] **Paso 3:** Implementar.
- [ ] **Paso 4:** `npm test` → todo PASS.
- [ ] **Paso 5:** Commit `feat: classes and view fields`.

### Tarea 2: Ayudantes de movimiento

**Archivos:** Crear `motion.js`, `motion.test.js`.

**Produce:**
- `formatClock(ms: number): string` → `"hh:mm:ss"` (horas con 2 dígitos, sin días; negativos → `"00:00:00"`).
- `detectGains(prev: Map<id, {energy, recordedAt}>, rows: Array<{id, energy, recordedAt}>): Array<{id, gain}>` — devuelve ganancia solo si el mismo `id` existe en `prev`, `recordedAt` no cambió (no fue edición manual) y `energy` subió; `gain = nueva − vieja` (un solo evento aunque se hayan perdido varios ticks).
- `rollValue(from, to, t): number` — interpolación con ease-out cúbico, redondeada; `t` se recorta a [0,1].

- [ ] **Paso 1: Tests que fallan:** `formatClock(37*60_000) === '00:37:00'`, `formatClock(3*3_600_000 - 1000) === '02:59:59'`, `formatClock(-5) === '00:00:00'`; `detectGains` — sube 225→240 mismo recordedAt → `[{id,gain:15}]`; recordedAt distinto → `[]`; id nuevo → `[]`; 225→255 → gain 30 (un evento); baja → `[]`; `rollValue(0,100,0)===0`, `(0,100,1)===100`, `(0,100,0.5)===88`, `(0,100,2)===100`.
- [ ] **Paso 2:** `npm test` → FAIL.
- [ ] **Paso 3:** Implementar.
- [ ] **Paso 4:** `npm test` → PASS.
- [ ] **Paso 5:** Commit `feat: motion helpers`.

### Tarea 3: Escena 3D

**Archivos:** Crear `orb.js`, `dev/orb-smoke.html`, `dev/orb-smoke.mjs`.

**Produce:** `createScene(canvas: HTMLCanvasElement, opts: {particles: number}): Scene | null` (null si no hay WebGL) con
- `setOrbs(orbs: Array<{id, el: Element, percent: number, color: string, state: 'normal'|'near'|'full'}>)` — reemplaza la lista; cada frame lee `el.getBoundingClientRect()` y dibuja ahí (salta los que están fuera de pantalla);
- `ripple(id)` — onda breve en ese orbe;
- `start()`, `stop()`, `dispose()`.
Importa Three desde la URL exacta de Tecnología. Bucle con `requestAnimationFrame`, se para con `document.hidden` y continúa al volver; `renderer.setScissorTest(true)` para los orbes; fondo de partículas en pantalla completa debajo.

- [ ] **Paso 1:** `dev/orb-smoke.html` monta 3 huecos con porcentajes 26/41/97 y estados normal/normal/near, y `dev/orb-smoke.mjs` lo abre con Playwright (servidor estático local), espera 1 s y comprueba: sin `pageerror`, `createScene` no devolvió null, y el centro de cada hueco en una captura no es del color de fondo. Ejecutar → FAIL (orb.js no existe).
- [ ] **Paso 2:** Implementar `orb.js` (Diseño 2 y 3: fresnel, líquido ondulado con nivel, halo; `near` late; `full` brillo fijo).
- [ ] **Paso 3:** `node dev/orb-smoke.mjs` → PASS; mirar la captura con Read.
- [ ] **Paso 4:** Commit `feat: three.js scene`.

### Tarea 4: Página rediseñada

**Archivos:** Modificar `index.html`, `dev/preview.mjs`.

**Consume:** Tareas 1–3. Escribir `classId` en `addCharacter(name, classId)` y en la actualización (`update({energy, recordedAt, classId})`).

- [ ] **Paso 1:** Rehacer estilos y marcado según Diseño 1 (mantener ids de formularios y toda la lógica de `db`, cola de escritura, permisos y estados vacíos actuales).
- [ ] **Paso 2:** Integrar: canvas fijo + `createScene`; `paint` llama `scene.setOrbs` con las filas; respaldo CSS cuando la escena es null o `matchMedia('(prefers-reduced-motion: reduce)')`; reloj de cabecera con `formatClock` cada 1 s (solo texto y anillo); `detectGains` tras cada render → "+15" flotante + `scene.ripple`; rodar números con `rollValue`; selector de clase en añadir/actualizar con `parseClassInput`.
- [ ] **Paso 3:** Ampliar `dev/preview.mjs`: 390px y 1280px; sin errores de página; sin scroll horizontal; añadir y quitar un personaje (orbes = tarjetas); scroll y el orbe sigue alineado; con `reducedMotion: 'reduce'` hay orbes CSS y ningún canvas activo. Mirar capturas.
- [ ] **Paso 4:** `npm test` y `node dev/preview.mjs` → PASS. Commit `feat: elyos 3d redesign`.

### Tarea 5: Publicar, copiar y revisar

- [ ] **Paso 1:** Republicar el mismo Artifact (`https://claude.ai/artifact/9RLXvaYj6DN5U1P9VXMjiD`) con `files` `energy.js`, `view.js`, `classes.js`, `motion.js`, `orb.js`; sin cambiar capacidades.
- [ ] **Paso 2:** Copiar archivos nuevos/cambiados a `C:\Users\Salty\Desktop\Prova\aion2-tracker\`, y este plan a `Prova\docs`.
- [ ] **Paso 3:** Revisión final de toda la rama con un revisor nuevo (modelo más capaz) y una pasada de arreglos.
- [ ] **Paso 4:** Cargar personajes (SaltyGhosty `asesino`, shutaruku `gladiador`, PraiseTheSun `clerigo`) cuando el usuario dé la energía actual y los minutos a la próxima recarga.
