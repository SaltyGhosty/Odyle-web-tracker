# Design System: Odyle Tracker

Fuente de verdad: el CSS de `index.html` (`:root` y `:root[data-faction="asmodian"]`), `web/social.css`, `theme.js` y `runes.js`. Este documento describe lo construido; los mismos tokens estan en `.impeccable/design.json`. Sustituye a la direccion anterior "laca y nacar".

## 1. Direccion

La energia es eter. Cada personaje es un orbe con un anillo de 56 runas propias, una por cada +15 OD; el tope se ve antes que nada. El mundo es Aion 2 y cambia de cielo segun el bando que elijas (contrato completo en `.impeccable/surfaces/index-html.md`, v2).

- Elyos (Luz): cielo al alba sobre islas flotantes. Tema claro, filetes de oro fino, orbe dorado y celeste.
- Asmodian (Sombra): crepusculo violeta del Abismo. Tema oscuro, filetes de plata fina, orbe violeta y carmesi.
- Movimiento firma: el anillo de 56 runas se enciende con la energia y late en carmesi al tope.
- Primer vistazo: cabecera (titulo, reloj de proxima recarga, interruptor Luz/Sombra, perfil), barra de pestanas con insignias, tarjetas de personaje con numero grande tabular.

## 2. Tokens de color

Todo color de la pagina es una variable; nada mas escribe colores a mano (salvo `#fff` sobre las insignias carmesi). `data-faction` en `<html>` elige el tema; `theme.js` decide cual (preferencia Luz/Sombra, luego `prefs.faction`, luego la faccion del perfil, luego el ultimo tema del dispositivo, si no Elyos).

| Variable | Elyos (Luz) | Asmodian (Sombra) |
|---|---|---|
| `--bg` | `#EEF3F8` | `#120D17` |
| `--bg-2` | `#DCE7F3` | `#241830` |
| `--glass` | `rgba(255, 255, 255, .88)` | `rgba(29, 21, 36, .88)` |
| `--glass-strong` | `#FFFFFF` | `#1D1524` |
| `--fg` | `#14213A` | `#EDE6F2` |
| `--muted` | `#4A5770` | `#B5A9C4` |
| `--line` | `rgba(168, 122, 30, .35)` | `rgba(201, 195, 214, .28)` |
| `--gold` | `#A87A1E` | `#9B6BD6` |
| `--gold-bright` | `#8A6212` | `#C9A8F0` |
| `--sky` | `#2E6FB0` | `#C9C3D6` |
| `--on-gold` | `#FFFFFF` | `#120D17` |
| `--danger` | `#B4232F` | `#E0455A` |
| `--urgent` | `#B4232F` | `#E0455A` |
| `--field` | `#FFFFFF` | `#150F1B` |
| `--hover` | `rgba(20, 33, 58, .05)` | `rgba(237, 230, 242, .05)` |
| `--track` | `rgba(20, 33, 58, .12)` | `rgba(237, 230, 242, .12)` |
| `--glow` | `rgba(168, 122, 30, .22)` | `rgba(155, 107, 214, .35)` |
| `--ok` | `#1E7A4C` | `#7EE2A8` |
| `--warn` | `#A2560B` | `#FFB35C` |
| `--scrim` | `rgba(20, 33, 58, .35)` | `rgba(0, 0, 0, .55)` |
| `--shadow` | `0 1px 2px rgba(20, 33, 58, .08), 0 8px 24px rgba(20, 33, 58, .08)` | `0 8px 24px rgba(0, 0, 0, .35)` |

Compartidas por ambos temas: `--font-display`, `--font-body`, `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. `color-scheme` es `light` en Elyos y `dark` en Asmodian. `theme-color` del navegador: `#EEF3F8` y `#120D17`.

Roles: `--gold` y `--gold-bright` son el acento de marca (oro en Elyos, violeta en Asmodian); `--sky` es el acento secundario (celeste / plata); `--urgent` y `--danger` son carmesi y marcan el tope de energia y los errores.

## 3. Tipografia

- Titulos y nombres: Cinzel, pesos servidos 600 y 700, con respaldo Trajan Pro, Georgia, serif. El `h1` usa 700, `clamp(1.9rem, 6vw, 2.6rem)`, `letter-spacing: .04em`.
- Texto: Figtree, pesos 400, 500 y 600, con respaldo de sistema. Base 15px, interlineado 1.45.
- Numeros siempre tabulares (`font-variant-numeric: tabular-nums`): reloj, energia, contadores, horas de mensaje.
- Etiquetas pequenas en mayusculas con `letter-spacing` de .08em a .12em.

## 4. Orbe y runas

- 56 runas por orbe: 840 de tope / 15 OD por tick. Una runa encendida equivale a +15 OD (`litRunes(energy) = floor(energy / 15)`, entre 0 y 56).
- Los 12 glifos son dibujos originales de Odyle (no del juego), repetidos en orden alrededor del circulo, la runa 0 arriba y en sentido horario.
- Orbe 3D (three.js, `orb.js`): el anillo de runas lleva el color primario/secundario del tema; al tope pasa a carmesi (`--urgent`) y late.
- Orbe plano (sin WebGL o con reducir movimiento): anillo SVG (`.rune-ring`, `buildRuneRing`); runas encendidas con `--gold-bright`, apagadas con `--track`, carmesi (`--urgent`) cuando esta lleno. Sin particulas y sin animacion.
- Orbe pequeno (`.mini-orb`, 44px): anillo de puntos (`.rune-ring.dots`) y relleno por `--fill`; carmesi al tope; atenuado (`opacity .45`) si el amigo no comparte su energia.

## 5. Marco

- Escritorio (>= 900px): rail fijo a la izquierda (`.topnav`, 220px, `--glass-strong`, filete `--line`) con la marca Odyle, las secciones, y al pie el interruptor Luz/Sombra y la ficha de perfil. La columna principal (`.page`) se desplaza 220px (`margin-left`).
- Movil (< 900px): barra inferior fija (`.topnav`, icono sobre etiqueta de .7rem, `aria-current="page"` en lo activo) con cuatro secciones y "Mas". Web: Energia, Eventos, Amigos, Chat, Mas; artifact: Energia, Eventos, Legion, Estadisticas, Mas. La pagina deja `padding-bottom: calc(80px + env(safe-area-inset-bottom))` para que la barra no tape lo ultimo.
- Hoja "Mas" (`dialog.more-sheet`): nace abajo (`translateY(100%)` a 0 en 240ms), alto maximo 80vh, esquinas superiores de 16px; rejilla de 3 columnas con el resto de secciones y Perfil, y el interruptor Luz/Sombra. Al pasar a >= 900px se cierra sola.
- Columna lateral (`.side`, >= 1200px): fija a la derecha, 280px, mismo cristal que el rail; Eventos (1 a 3 filas, con "Ver todos") y "En linea" (amigos en la web, legion en el artifact). Por debajo de 1200px no se muestra; la pagina deja `margin-right: 280px` cuando existe.
- Cabecera compacta: en escritorio es la franja superior de la columna principal con el reloj de proxima recarga; en movil una sola linea con "Odyle", reloj, ficha de perfil y asistente.
- Objetivos tactiles de al menos 44px en rail, barra, hoja y acciones de fila.

## 6. Componentes

- Banda de proxima decision (`.band`, `#summary`): radio 14px, relleno 12px 14px, texto en negrita 600 y boton "Gastar" a la derecha. Tres tonos: `band-urgent` (relleno `--urgent-strong`, texto `#fff`, boton blanco; hay alguien al tope), `band-warn` (filete `--gold` y velo de `--gold` al 12%; alguien a punto) y `band-calm` (cristal `--glass` con filete `--line`; "Nadie al tope - el proximo, X en T").
- Fila de personaje (`article.card.row`): una por personaje, rejilla de cuatro zonas `orb | text | num | act` y una linea `below` para formularios y tareas. Radio 14px, relleno 10px 14px, huecos 4px 16px, filete `--line`; `full` lo pasa a `--urgent` y `near` a `--gold`. Orbe de 72px (columna 88px); 56px (columna 64px) por debajo de 720px, donde `act` pasa a su propia linea bajo el texto; 48px en modo compacto (`body.compact`).
- Menu "..." (`button.more-actions` + `.menu`): acciones secundarias de la fila (Notas, Tareas, +Extra, Quitar). Panel `--glass-strong` anclado al boton, ancho minimo 190px, opciones de 44px, entra con `scale(.96)` y opacidad en 160ms desde su disparador; flechas y Escape; sobrevive a los repintados.
- Interruptor Luz/Sombra (`.theme-switch`): grupo de dos botones en pastilla con filete `--line`; el activo (`aria-pressed="true"`) rellena con `--gold-bright` y texto `--on-gold`. El cambio es instantaneo.
- Insignia (`.badge`): circulo/pastilla `--urgent` con texto blanco tabular; en el rail y la barra inferior (no leidos, solicitudes) y en las conversaciones.
- Fila de persona (`.person`): avatar de 40px (inicial en Cinzel, punto verde `--ok` si esta en linea), nombre, linea meta en `--muted`, orbe pequeno a la derecha y acciones.
- Subpestanas (`.subtabs`): linea inferior `--line`; la activa subraya con `--gold`.
- Ficha (`dialog.sheet`): dialogo nativo de ancho maximo 520px, borde `--line`, radio 16px, fondo `--glass-strong`, telon `--scrim`; contiene bio, lista de energia por personaje (`.energy-list`, `.num`, rojo si lleno), acciones y formulario de reporte.
- Burbuja de mensaje (`.msg`): `theirs` a la izquierda, `mine` a la derecha con tinte de `--gold` al 14%; radio 14px; hora tabular; "Leido" y "Cargar mas" centrados.
- Tarjeta de invitacion (`.invite`): borde `--gold`, rotulo en mayusculas, titulo en Cinzel y metadatos tabulares.
- Aviso "Reconectando..." (`.live-status`): pastilla fija abajo en el centro, `role="status"`, visible solo mientras el stream en vivo esta caido.
- Chat: dos columnas en escritorio (lista 220-300px y hilo); por debajo de 720px una sola, con boton volver.

## 7. Movimiento

- Curva: `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) en botones; `cubic-bezier(.2, .7, .2, 1)` en entradas, cajones y modales.
- Pulsar un boton: `transition: transform 160ms var(--ease-out)` y `button:active { transform: scale(0.97) }`.
- Duraciones: .22s a .28s en modales, telon, cajon y avisos; .35s en el cambio de panel; .6s en la entrada de tarjetas (escalonada 90ms por tarjeta); el anillo del reloj avanza 1s lineal.
- Con `prefers-reduced-motion: reduce`: sin transiciones, sin `scale` al pulsar, orbe plano sin animacion ni particulas.

## 8. Reglas

- Sitio de fans, no oficial: ningun logo, arte ni icono de NCSOFT; runas e iconos son dibujos originales; aviso de "no oficial" visible.
- Todo texto que escribe un usuario (apodos, mensajes, bios) lleva `translate="no"` para que la traduccion en vivo del navegador no lo reescriba.
- Colores solo por variables; un tema nuevo se anade como un bloque `:root[data-faction=...]`.
- CSP estricta y sin `innerHTML`: el DOM se construye con helpers (`web/social-dom.js`).
- Lo urgente es lo mas ruidoso: energia al tope en carmesi, nunca decorativo.
