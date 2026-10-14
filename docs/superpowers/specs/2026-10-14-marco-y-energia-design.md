# Marco nuevo (rail y barra inferior) y pantalla Energía en filas — Diseño

_Fecha: 2026-10-14 · Estado: pendiente de revisión del usuario · Rama: `feat/marco-energia` (desde `main`)_

## 1. Objetivo y alcance

Terminar de llevar la app al diseño Aion 2 por facciones (spec `2026-10-13-social-y-facciones-design.md`, §6 y «Después»): la estructura de navegación y la pantalla principal. Los colores y el tema por facción ya están en todas las secciones; aquí cambia la **estructura**.

**Dentro:**
1. **Marco:** rail en escritorio, barra inferior en móvil, cabecera compacta, columna lateral en escritorio ancho.
2. **Pantalla Energía:** banda de próxima decisión y un personaje por **fila** (elegido por el usuario frente a tarjetas en rejilla).
3. Encajar Eventos, Estadísticas, Legión, Ajustes, Novedades y las pantallas sociales en el marco nuevo, sin rediseñar su contenido.

**Fuera:** rediseñar por dentro Eventos, Estadísticas o Legión; PWA; despliegue; cambios de servidor.

### Lo que decidió el usuario (2026-10-14)

| Tema | Decisión |
|---|---|
| Alcance | Marco + pantalla Energía; el resto solo se encaja |
| Barra móvil | 4 fijas + «Más» |
| Personajes | Filas (opción A del comparador visual) |

## 2. Enfoque

Se transforma lo que existe, sin rehacer la página. `index.html` ya mueve los nodos de cada sección a su panel (`TABS` y `PLACE` en `app.js`) sin duplicarlos. Ese sistema se mantiene: el elemento de navegación actual (`#topnav`) pasa a ser el **rail** en escritorio y la **barra inferior** en móvil por CSS y un poco de marcado. La versión artifact de claude.ai usa el mismo `index.html` y debe seguir funcionando.

La lógica nueva que se puede probar sin DOM (qué secciones van en la barra y cuáles en «Más», qué dice la banda) va a un módulo puro `layout.js` con `node --test`.

## 3. Marco

### Escritorio (≥ 900 px)

```
┌────────┬──────────────────────────────┬────────────┐
│ Odyle  │ Tus personajes   Recarga 2:59│ Eventos    │  ← columna lateral
│ Energía│ ┌ banda de próxima decisión ┐│  …         │    solo ≥ 1200 px
│ Eventos│ fila · fila · fila           │ En línea   │
│ Amigos2│                              │  …         │
│ …      │                              │            │
│ Luz|Sombra                            │            │
│ [perfil]                              │            │
└────────┴──────────────────────────────┴────────────┘
```

- **Rail** fijo a la izquierda (≈ 220 px): marca «Odyle» en Cinzel, todas las secciones con su icono y su insignia (Amigos: solicitudes; Chat: no leídos), y abajo el interruptor Luz/Sombra y la ficha de perfil (`#profile-chip`). El elemento activo lleva `aria-current="page"`.
- **Columna lateral** (≥ 1200 px, ≈ 280 px): próximos 3 eventos con cuenta atrás y «En línea» (amigos en la web; miembros de la legión en el artifact). Es un resumen de solo lectura, y cada bloque enlaza a su sección.
- **Cabecera compacta:** desaparecen el título grande y su subtítulo. El reloj de la próxima recarga pasa a la cabecera de la pantalla Energía. El resto de botones de cabecera (movimiento, asistente) siguen accesibles donde están hoy o en el rail.

### Móvil (< 900 px)

- **Barra inferior fija** de 5 botones con icono y texto: web: Energía · Eventos · Amigos · Chat · Más; artifact: Energía · Eventos · Legión · Estadísticas · Más.
- **«Más»** abre una hoja inferior (`<dialog>`) con el resto de secciones: Legión o Amigos/Chat (la que no esté fija), Buscar, Estadísticas, Ajustes, Novedades y Perfil, y el interruptor Luz/Sombra. Si la sección activa está dentro de «Más», el botón «Más» lleva `aria-current`.
- La página reserva hueco abajo para la barra: `padding-bottom: calc(64px + env(safe-area-inset-bottom))`.
- Cabecera móvil: una línea con «Odyle», el reloj y la ficha de perfil.

### Iconos

Iconos SVG propios, de trazo, dibujados para Odyle (sin arte de NCSOFT), en un único módulo con los trazos: energía, eventos, amigos, chat, buscar, legión, estadísticas, ajustes, novedades, más y perfil.

## 4. Pantalla Energía

### Banda de próxima decisión

Sustituye al panel `#summary`. Su texto y su tono salen de `layout.js` (`decisionBand(rows, now)`):

- **Urgente (carmesí):** hay personajes al tope. Texto: «{nombre} está al tope · pierde 15 OD cada 3 h» (o «{n} personajes al tope»). Botón **Gastar**, que abre los gastos de ese personaje (o del primero al tope).
- **Aviso (oro):** nadie al tope, pero alguien se llena antes de la próxima ventana de silencio (`wasteWarning`). Texto: «{nombre} se llena {cuándo}».
- **Tranquilo (neutro):** «Nadie se llena hoy · el próximo, {nombre} en {tiempo}».
- **Sin personajes:** no se muestra (sigue la guía de primeros pasos).

### Filas por personaje

Cada personaje es un `article.card` (se conservan la clase y `data-id`, que usan el E2E y el código) con un grid de cuatro zonas:

1. **Orbe** de ~72 px (`.orb-slot`): 3D cuando hay WebGL, plano con el anillo SVG si no. Mantiene `data-orb`.
2. **Texto:** nombre (Cinzel), clase, «Lleno en …» o «Lleno · perdiendo energía» en carmesí, y la vista previa de nota si la hay.
3. **Número grande** tabular «612 / 840»; carmesí al tope.
4. **Acciones:** botones de gasto de los presets (`button.spend`), «Actualizar» (`button.primary`) y un botón «⋯» que despliega lo secundario: +Extra, Tareas, Notas y Quitar.

Los formularios de editar y de notas, y la lista de tareas, se despliegan **debajo** de la fila, ocupando todo el ancho. El «+15» flotante y el haz al llenarse se colocan respecto al orbe nuevo.

En móvil la fila pasa a dos líneas: orbe, texto y número arriba; las acciones debajo.

### Menú «⋯»

Botón con `aria-haspopup="menu"` y `aria-expanded` que abre una lista de botones. Se cierra con Escape, al pulsar fuera o al elegir una opción, y el foco vuelve al botón «⋯». Las flechas recorren las opciones. No es un `<select>`, porque las opciones son acciones.

## 5. Encaje del resto

- Eventos, Estadísticas, Legión, Ajustes, Novedades, Amigos, Chat y Buscar se pintan en la columna principal con un ancho máximo legible (≈ 960 px) y los mismos paneles de hoy.
- Ajustes y Novedades conservan su reparto en columnas cuando cabe.
- Desaparece el cajón «☰» (ya estaba oculto) y su código muerto.

## 6. Movimiento, tema y accesibilidad

- Reglas de Emil Kowalski, igual que en el resto: `scale(0.97)` al pulsar, `cubic-bezier(0.23, 1, 0.32, 1)`, menos de 300 ms, hover solo con `(hover: hover) and (pointer: fine)`, y nada animado con `prefers-reduced-motion: reduce`. La hoja «Más» entra desde abajo (`translateY(100%)` → 0, 240 ms); el menú «⋯» aparece con `scale(0.96)` + opacidad desde su botón (`transform-origin` en el disparador).
- Solo variables CSS del tema. El rail y la barra son paneles del tema (`--glass-strong`, filete `--line`); el elemento activo usa `--gold-bright`.
- Rail y barra son `<nav aria-label="Secciones">`; los objetivos táctiles miden al menos 44 px.
- CSP estricta y Trusted Types sin cambios: sin `innerHTML`, `setTimeout` solo con funciones flecha.

## 7. Errores y casos límite

- **Sección activa guardada que ya no existe** (p. ej. «amigos» en el artifact): se vuelve a Energía.
- **Cambio de ancho en caliente** (girar el móvil, redimensionar): el mismo nodo de navegación cambia de forma por CSS y la hoja «Más» se cierra al pasar a escritorio.
- **Muchos personajes:** las filas no tienen límite. Los orbes 3D fuera de pantalla ya no se dibujan (`orb.js` lo comprueba).
- **Nombres largos:** se cortan con elipsis en la fila y se ven enteros en el editor.
- **375 px:** nada provoca scroll horizontal.

## 8. Pruebas

- **Unitarias (`layout.test.js`):** reparto de secciones entre barra y «Más» en web y en artifact; sección guardada desconocida → Energía; los cuatro estados de `decisionBand`.
- **E2E (`dev/e2e-web.mjs`):** navegar por el rail (1280 px) y por la barra + «Más» (390 px); la banda pasa a carmesí con un personaje al tope; abrir y cerrar «⋯» con el teclado; sin scroll horizontal a 375 px; las comprobaciones actuales siguen pasando, con los selectores adaptados y sin quitar ninguna.
- **Capturas:** Energía, Eventos y Chat en Luz y en Sombra, escritorio y móvil, revisadas a ojo.

## 9. Orden de trabajo

1. `layout.js` (reparto de secciones y banda) con pruebas.
2. Marco: rail, barra inferior, hoja «Más», cabecera compacta, iconos.
3. Pantalla Energía: banda y filas con menú «⋯».
4. Columna lateral y encaje del resto de secciones.
5. E2E, capturas y documentación (`DESIGN.md`).
