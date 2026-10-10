# Runas, profundidad y luz — Plan de implementación

> **Para agentes:** superpowers:executing-plans (inline). Casillas `- [ ]`.

**Objetivo:** Más 3D y animación en el tracker: anillo de 12 runas que es el temporizador del próximo +15 en cada tarjeta (con estallido al completarse), orbes que se inclinan con el ratón o el móvil, fondo en tres capas con parallax y columna de luz al llegar a 840.

**Arquitectura:** Todo dentro de la escena Three.js existente (`orb.js`, un solo contexto). Lógica pura nueva en `motion.js` (tests con `node --test`). `index.html` pasa a la escena el progreso del tick por orbe y avisa de recargas y llenados.

**Spec:** diseño aprobado en el chat (10/10/2026): anillo de 12 runas, una se enciende cada 15 min (3 h / 12); texto "+15 en hh:mm:ss" bajo el orbe; estallido de chispas al completarse + onda + "+15"; lleno → anillo encendido quieto; inclinación por ratón y por orientación del móvil (botón "Activar movimiento" si el navegador pide permiso); reflejos que se desplazan; fondo: nubes de éter lejanas, partículas en medio, plumas doradas cayendo delante, parallax con el scroll; haz dorado unos segundos al llegar a 840 y brillo después. Reducir movimiento → versión plana con la cuenta atrás en texto.

## Restricciones globales
- Las del plan anterior siguen vigentes (un contexto WebGL, nunca escribir en `db` desde animaciones, iconos y runas de dibujo propio, Three.js 0.160.0 de jsdelivr).
- Móvil (< 720px): 200 partículas, 14 plumas, 4 nubes; escritorio: 500 / 30 / 7.

## Foco de revisión
1. **Primera carga con personajes ya llenos:** no se dispara el haz (solo al cruzar a 840) → test `becameFull` en T1 + preview en T4.
2. **Sin hora de recarga:** anillo apagado y texto "Falta la hora de recarga", sin errores → preview en T4.
3. **Permiso de orientación denegado o inexistente:** la página sigue igual (solo ratón o nada) → revisión de código.
4. **Scroll largo:** parallax no deja huecos sin partículas ni nubes → captura en T3.
5. **Cambio de hora de recarga:** las runas se recalculan sin estallido falso → el estallido solo sale de `detectGains`, que ya ignora cambios de horario.

---

### Tarea 1: Ayudantes de runas y llenado
**Archivos:** `motion.js`, `motion.test.js`.
**Produce:** `RUNES = 12`; `runesLit(msLeft: number, tickMs: number): number` = `clamp(floor((tickMs − msLeft) / (tickMs / RUNES)), 0, RUNES)`; `becameFull(prev: Map<id,{energy}>, rows: Array<{id, energy}>, max: number): string[]` — ids que estaban en `prev` con `energy < max` y ahora `>= max`.
- [ ] Tests que fallan: `runesLit(TICK, TICK) === 0`, `runesLit(TICK − 15min, TICK) === 1`, `runesLit(1000, TICK) === 11`, `runesLit(0, TICK) === 12`, `runesLit(TICK*2, TICK) === 0`; `becameFull` — 830→840 → `['a']`; 840→840 → `[]`; id nuevo con 840 → `[]`; 830→835 → `[]`.
- [ ] `npm test` → FAIL; implementar; `npm test` → PASS; commit `feat: rune and full helpers`.

### Tarea 2: Anillo de runas, estallido e inclinación
**Archivos:** `orb.js`, `dev/orb-smoke.html`, `dev/orb-smoke.mjs`.
**Produce (cambios en la API de `createScene`):** cada orbe de `setOrbs` añade `tick: number|null` (fracción 0–1 del tick transcurrido; null sin horario); `ripple(id)` también lanza el estallido de runas; `enableOrientation(): Promise<boolean>` (pide permiso si hace falta, devuelve si quedó activo); inclinación por ratón automática con `pointermove` en `window`.
- Runas: `InstancedMesh` de 12 planos en un anillo inclinado (radio 1.25) con un atlas `CanvasTexture` de 12 glifos propios; atributo de instancia `aIndex`; uniform `uLit` (runas encendidas) y `uFull`; el anillo gira despacio.
- Estallido: `Points` (12×8) que van de las runas al centro en 0.9 s con desvanecimiento.
- Inclinación: rotación del grupo orbe+anillo hacia el puntero relativo al centro del hueco (máx. ±0.35 rad, suavizado); con orientación del móvil usa `beta/gamma`. La dirección de la luz del brillo del cristal (`uLightDir`) se desplaza con la inclinación. El nivel del líquido se calcula en espacio de mundo para seguir horizontal.
- [ ] Ampliar la prueba de humo: el orbe `near` recibe `tick: 0.5` → 6 runas; tras `ripple('c')` la escena no lanza errores; comprobar que un punto del anillo (encima del orbe) está iluminado. Ejecutar → FAIL; implementar; PASS; mirar captura; commit `feat: rune ring, burst and tilt`.

### Tarea 3: Fondo en capas y columna de luz
**Archivos:** `orb.js`, `dev/orb-smoke.*`.
**Produce:** `createScene(canvas, {particles, feathers, clouds})`; `beam(id)` — haz dorado de ~3 s desde el centro del orbe hacia arriba (pase de pantalla completa con cámara ortográfica en píxeles, no recortado por el hueco).
- Nubes: planos grandes lejanos (z −8) con shader de ruido suave azul; plumas: `InstancedMesh` de planos con forma de pluma procedural (shader), doradas, caen girando cerca de la cámara; parallax: la cámara de fondo baja `scrollY * 0.004`; las capas se reciclan verticalmente para no dejar huecos.
- [ ] Prueba de humo: tras `beam('a')`, un píxel 120 px por encima del orbe A está iluminado a los 0.5 s. FAIL → implementar → PASS; captura con scroll; commit `feat: depth layers and light beam`.

### Tarea 4: Página
**Archivos:** `index.html`, `dev/preview.mjs`.
**Consume:** T1–T3.
- Bajo cada orbe: `<p class="tick-left">` con "+15 en hh:mm:ss" (lleno → "Lleno"; sin horario → "Falta la hora de recarga"), actualizado cada segundo en `paintClock`. En modo plano, el texto sigue.
- `setOrbs` pasa `tick` (fracción transcurrida del tick actual; `null` sin horario).
- Tras cada render (no oculto, mismo horario): `becameFull(lastEnergy, now, MAX)` → `scene.beam(id)`.
- Botón "Activar movimiento" en la cabecera solo si existe `DeviceOrientationEvent.requestPermission`; al pulsarlo llama `scene.enableOrientation()` y se oculta si devuelve true.
- [ ] Preview: `.tick-left` muestra `+15 en ` + reloj; sin horario muestra "Falta la hora de recarga"; con datos sembrados llenos no hay haz al cargar (exponer `window.__beams` contador solo en el stub? → no: contar llamadas envolviendo `scene` no es posible desde fuera; en su lugar comprobar con píxel que no hay haz sobre el orbe lleno a 1 s). FAIL → implementar → PASS; commit `feat: per-card rune timer`.

### Tarea 5: Revisión, publicación y copia
- [ ] Revisor final nuevo (modelo más capaz) + una pasada de arreglos con tests.
- [ ] Republicar el mismo Artifact y copiar a `Prova\aion2-tracker` y el plan a `Prova\docs`.
