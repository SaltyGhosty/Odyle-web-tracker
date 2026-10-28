# Rediseño «Engaste de orbes»: app moderna y dinámica — Diseño

_Fecha: 2026-10-27 · Estado: aprobado por el usuario en chat, pendiente de revisión del documento · Rama: `feat/rediseno-engaste`, creada desde `feat/acerca-privacidad` (todavía sin fusionar; ya trae Acerca de y Privacidad)_

## 1. Por qué

El usuario quiere que Odyle se sienta moderna y viva, como su otro proyecto ARCADE (https://capstone-steam-web.onrender.com/): héroe grande, tarjetas que reaccionan, movimiento. Hoy Odyle se lee como una hoja de cálculo: filas, tablas, bordes de 1 px, y solo se mueven los orbes.

Se mantiene todo lo que ya es Odyle: los colores Luz/Sombra, la temática de Aion, los orbes 3D y todas las funciones. Cambia la estructura y el movimiento.

Éxito: el jugador abre la página y en un vistazo ve quién está al tope, cuánto falta para la recarga y para el **reinicio diario**, y la página se siente viva sin estorbar la lectura de los números.

## 2. Qué decidió el usuario (2026-10-27)

| Tema | Decisión |
|---|---|
| Dirección | «Engaste de orbes» (boceto aprobado: `.impeccable/mocks/decision5/assigned-v2.html`) |
| Origen | Tirada de Impeccable «Piedras de Estigma», cambiando gemas por **orbes** |
| Navegación | **Barra superior de una línea**, todo alineado en vertical (sustituye al rail lateral del spec del 14-10) |
| Relojes | Tres relojes iguales en la barra: próxima recarga, **reinicio diario** (destacado en oro) y próximo evento |
| Fondo | **Animado**: «hazlo más dinámico» |
| Orbes | Se mantienen en **3D** (three.js) |
| Alcance | **Toda la app** |
| Colores | Los actuales Luz (pizarra/oro) y Sombra (violeta/abismo), sin cambios |

Descartado por el usuario: el rediseño de `design/redesign/` (13-10), las barras de eventos en píldoras, marcador, astrolabio, línea de tiempo, próximo+lista y marquesina, y las direcciones Torre, Alas, Grieta, Peso, Ruta, Vales, Elenco y Folio.

Este documento **sustituye** la parte de estructura de `2026-10-14-marco-y-energia-design.md` (rail + filas). La lógica pura de `layout.js` (secciones, banda de decisión) se reutiliza.

## 3. Pantalla Energía (escritorio ≥ 900 px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Odyle   Energía Eventos Legión Amigos(2) Chat(5) Estadísticas   [+15 OD 00:42:17][Reinicio diario 08:12:44][Festival Shugo 00:01:05] │
├───────────────────────────┬──────────────────────────────────────────────┤
│                           │ Tus personajes · 3 más                       │
│     ◯ anillo 56 runas     │ [orbe flota] [orbe flota] [orbe flota]       │
│       ( orbe 3D grande )  │  nombre·clase·615/840·lleno en 1d 18h        │
│                           │ Gastos rápidos · en Lleno                    │
│   Lleno                   │ [Mazmorra −40][Incursión −60][Diaria −20]    │
│   Asesino · 840/840 ·     │ Hoy                                          │
│   pierde 15 OD cada 3 h   │ [Grieta 01:01:05][Kaira 02:01:05][Semanal 3d]│
│   [ Gastar ahora ]        │                                              │
└───────────────────────────┴──────────────────────────────────────────────┘
        fondo: cielo de Atreia vivo detrás de todo
```

- **Barra:** rejilla de tres zonas (logo · menú · relojes) con `align-items: center`; todos los elementos interactivos a la misma altura (40 px menú, 48 px relojes). Contadores de avisos como insignias dentro del enlace (Amigos, Chat), no como alturas distintas.
- **Qué va en la barra (decisión del usuario):** en el menú, las secciones principales: Energía, Eventos, Legión, y en la web también Amigos y Chat. Al final del menú hay un «Más ▾» con Buscar, Estadísticas, Ajustes, Novedades y Acerca de; en la versión artifact, sin Amigos ni Chat, Estadísticas va en el menú. A la derecha de los relojes van la ficha de Perfil y el selector Luz/Sombra. El aviso de sitio de fans no oficial va en un pie fino, siempre visible al final de la página. Entre 900 y 1200 px, los relojes de recarga y de evento se pliegan en un solo botón «Relojes ▾» y el reinicio diario queda siempre a la vista.
- **Relojes:** cuentan cada segundo. «Reinicio diario» usa el evento `daily` de `events.js` (hora fija actual, 07:00 UTC; no se añade elección de servidor); el reloj de evento muestra el próximo evento no-reinicio. El reloj destacado es el reinicio diario (fondo oro tenue).
- **Escenario izquierdo (personaje urgente):** el que está al tope o más cerca. Orbe 3D grande con su anillo de 56 runas girando. Debajo: nombre (Marcellus grande), clase, número `840 / 840` y, **pegado al número**, el motivo («pierde 15 OD cada 3 h»). Botón principal «Gastar ahora». Si nadie está cerca del tope, el escenario muestra al que antes se llena, con «Lleno en …» en lugar del aviso.
- **Columna derecha:** el resto de personajes como tarjetas con orbe (3D, tamaño pequeño) que flota despacio; nombre, clase, número, «Lleno en …». Debajo, Gastos rápidos del personaje del escenario (con Deshacer), y «Hoy»: próximos eventos con reloj y reinicio semanal.
- Las acciones actuales por personaje (Actualizar, «…», + Extra, quitar) siguen en cada tarjeta (al pasar el ratón / foco, y siempre visibles en táctil). El plan de hoy y el resto de funciones de Energía siguen debajo, con el mismo estilo de tarjetas.
- Pulsar una tarjeta pone a ese personaje en el escenario (transición suave), sin cambiar el orden guardado. _(Decisión del diseñador)_ La elección no se guarda: al recargar vuelve el más urgente. Si mientras tanto otro llega al tope, el escenario no salta; su tarjeta se marca en rojo y aparece un aviso corto «X está al tope» que lo lleva al escenario.
- _(Decisión del diseñador)_ **Qué pasa con lo que hoy hay en Energía:** la banda de próxima decisión desaparece, porque el escenario es esa banda. `chars-bar` (añadir y reordenar) va en la cabecera «Tus personajes». `guide` y `summary` quedan debajo de «Hoy», como tarjetas. La columna `#side` (quién está en línea) pasa a «Hoy», debajo de los eventos. El botón del Asistente sigue flotando.
- _(Decisión del diseñador)_ **Muchos personajes:** se muestran todas las tarjetas, sin límite. Un orbe 3D solo se dibuja si su tarjeta está en pantalla (IntersectionObserver); fuera de pantalla, el orbe queda en pausa. A partir de 9 personajes, las tarjetas usan orbe 2D y solo el escenario es 3D.

## 4. Fondo vivo y movimiento

Una sola gramática de movimiento, lenta y con propósito:

1. **Cielo de Atreia:** corrientes de éter que derivan muy despacio detrás de todo (Luz: oro y azul cielo sobre pizarra; Sombra: violeta sobre abismo). Lienzo (canvas 2D o el mismo contexto WebGL si sale más barato), a baja resolución y 30 fps como máximo.
2. **Motas de luz** que suben desde abajo, pocas (≤ 40), muy tenues.
3. **Paralaje** ligero, solo con el ratón en escritorio. Máximo unos pocos píxeles.
4. **Pulso de recarga:** en cada +15 OD (ya detectado por `detectGains` en `motion.js`), una onda de luz sale del anillo del escenario y todos los orbes suben con su animación de llenado (`ripple` de `orb3d.js`); los números ruedan (`rollValue`).
5. **Entradas:** al abrir una sección, las tarjetas suben una tras otra (escalonado corto). Sin animación al volver a una sección ya vista en la misma sesión.
6. **Al tope:** el orbe y el anillo del urgente laten despacio en rojo; el botón «Gastar ahora» no tiembla (no es decorativo).

Reglas:
- `prefers-reduced-motion: reduce` → fondo quieto (un solo fotograma), sin motas, sin paralaje, sin entradas; los relojes siguen contando.
- Pestaña oculta → se para todo (ya existe la lógica de visibilidad para los orbes).
- Modo «lite» → se mantiene lo de hoy (sin ondas ni latido) y además el fondo queda quieto. _(Decisión del diseñador: no se crea un cambio de 3D a 2D para lite.)_
- Nada animado tapa ni mueve un número mientras se lee.

## 5. Resto de la app

Mismo marco (barra superior + fondo vivo) y mismo lenguaje de tarjetas en: Eventos, Legión, Amigos, Chat, Buscar, Estadísticas, Perfil, Ajustes, Novedades, Acerca de, y las pantallas de cuenta (`web/auth.html`: entrar, crear cuenta, verificar, restablecer) y `/privacidad`.

- Las secciones cambian de piel y de disposición a tarjetas, no de contenido ni de comportamiento.
- Eventos: cada evento con su reloj grande; los reinicios diario y semanal arriba.
- Legión / Amigos / Chat: listas como tarjetas; el chat mantiene su comportamiento actual.
- Pantallas de cuenta: el mismo cielo vivo detrás del formulario.

## 6. Móvil (< 900 px)

- Barra superior: logo + ficha de perfil + selector Luz/Sombra; debajo, una tira **fija** (sticky) con los tres relojes, el reinicio diario primero, deslizable de lado. Así el reinicio diario siempre está a la vista. _(Decisión del diseñador: un solo juego de relojes, no uno repetido en la barra.)_
- Navegación: la barra inferior actual (4 fijas + «Más») se mantiene.
- Energía: escenario arriba (orbe 3D más pequeño, `orb-phone` 72 px → se permite mayor en el escenario), tarjetas debajo en una columna.
- Fondo vivo a menor coste (menos motas, resolución más baja).

## 7. Restricciones

- Colores: tokens actuales de DESIGN.md, sin colores nuevos salvo transparencias de los existentes.
- Tipos: Marcellus + Gothic A1, como hoy.
- CSP estricta: sin script en línea, Trusted Types, sin `innerHTML`; todo lo nuevo con DOM (`social-dom.js` / patrones existentes).
- Dos versiones: web propia y artifact de claude.ai comparten `index.html`; ambas deben funcionar.
- 4 idiomas: todo texto nuevo pasa por `i18n-strings.js`.
- Aviso de sitio de fans no oficial siempre visible.
- Rendimiento: el fondo no debe bajar de 60 fps la interacción en un portátil medio ni calentar el móvil; si no hay WebGL, todo funciona en 2D.
- Accesibilidad: contraste AA en texto; foco visible; relojes con `aria-live` sólo donde ya exista (no anunciar cada segundo).

## 8. No-objetivos

- Cambiar funciones, datos, servidor o API.
- Nuevas funciones sociales o de juego.
- Arte oficial de NCSOFT.
- Efectos que tapen números o hagan la página lenta.

## 9. Lo que queda para quien construya

- Técnica concreta del fondo (canvas 2D vs. shader), siempre dentro de las reglas del §4.
- Curvas y duraciones exactas de las animaciones.
- Cómo encajar exactamente cada sección secundaria en tarjetas, siguiendo el §5.
- Pruebas: lógica nueva pura (qué personaje va al escenario, qué evento muestra el reloj, presupuesto de motas) en módulos con `node --test`; capturas e2e con `dev/e2e*.mjs` en Luz y Sombra, 1440 y 390.
- Al terminar: revisión final de Impeccable y DESIGN.md actualizado con el mundo nuevo.
