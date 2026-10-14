# Cuenta normal o premium por personaje — Diseño

_Fecha: 2026-10-14 · Estado: pendiente de revisión del usuario · Rama: `feat/cuenta-premium` (desde `main`)_

## 1. Objetivo

En Aion 2 la energía Odyle no recarga igual en todas las cuentas. Cada personaje de Odyle Tracker indica si su cuenta es
Normal o Premium, y toda la app calcula con la regla de esa cuenta.

| Cuenta | Recarga | Cada | Por día | Tope |
|---|---|---|---|---|
| Normal | +15 | 3 h | 120 | 560 |
| Premium | +30 | 3 h | 240 | 840 |

La hora de recarga sigue siendo la misma para todos (la ventana común del servidor).

### Lo que decidió el usuario (2026-10-14)

| Tema | Decisión |
|---|---|
| Dónde se elige | Por personaje |
| Caducidad | Sin fecha de fin: interruptor simple |
| Cómo se guarda | Opción A: solo el tipo de cuenta; la app pone las cifras |
| Personajes que ya existen | Pasan a Premium (siguen con tope 840, nada cambia) |

**Fuera:** fecha de fin del premium, cifras editables a mano, premium por perfil.

## 2. Datos

- Campo nuevo del personaje: `account`, con valor `'normal'` o `'premium'`.
- **Sin campo = Premium.** Así los personajes guardados antes de este cambio (web, artifact, exportaciones) siguen igual.
- **Personaje nuevo:** el formulario de añadir empieza en Normal, que es la cuenta más común.
- Servidor (`server/src/lib/validate.js`, `characters`): `account` entra en `allowed` y solo admite `'normal'` o `'premium'`; cualquier
  otro valor se rechaza con el error de validación de siempre.
- Importar datos: un `account` desconocido se trata como ausente (Premium).

## 3. Cálculo (`energy.js`)

Un único sitio con las reglas:

```js
export const ACCOUNTS = { normal: { regen: 15, max: 560 }, premium: { regen: 30, max: 840 } };
export function rulesOf(char) // → ACCOUNTS[char.account] ?? ACCOUNTS.premium
```

- `currentEnergy`, `fullAt` y el resto toman `regen` y `max` de `rulesOf(char)` en vez de las constantes `REGEN` y `MAX`.
- La energía por encima del tope no se pierde al instante: se queda hasta que se gaste, pero no recarga (igual que hoy al tope).
- Lo que hoy usa 840 o 15 fijos pasa a usar las reglas del personaje: `view.js` (número «x / tope», porcentaje, lleno),
  `planner.js` (pérdida, Plan de hoy, simulador de ritmo), `layout.js` (banda de lo urgente), `charts.js` (línea de tope:
  la mayor de los personajes mostrados), `social.js` (energía de amigos y texto para compartir) y el aviso de llenado.

### Al cambiar de cuenta

Antes de guardar el cambio, la app fija la energía de ese momento con la regla vieja (`energy = actual`,
`recordedAt = ahora`). Desde ahí cuenta la regla nueva. La energía ya acumulada no se recalcula hacia atrás.
Si pasa de Premium a Normal con más de 560, se queda con lo que tiene y no recarga hasta bajar de 560.

## 4. Orbe y runas

- El anillo sigue con 56 runas y cada runa vale 1/56 del tope: 10 OD en Normal y 15 OD en Premium.
  `litRunes(energy, max)` = `floor(energy / max × 56)`, entre 0 y 56.
- En Normal, una recarga de +15 enciende 1 o 2 runas según el caso; en Premium, +30 enciende 2.
- Los orbes miden lo mismo y siguen alineados. El líquido sube con `energy / max` del personaje.
- Vale para el orbe 3D (`orb3d.js`), el SVG de respaldo (`starorb.js`) y los mini orbes de amigos.

## 5. Interfaz

- **Formularios de añadir y editar:** un selector de dos botones «Normal · Premium», con una línea de ayuda bajo él:
  «Normal: +15 cada 3 h, tope 560 · Premium: +30 cada 3 h, tope 840».
- **Fila del personaje:** si es Premium, una marca «Premium» pequeña en oro junto a la clase. Normal no lleva marca.
- **Número:** «412 / 560» o «612 / 840», según la cuenta.
- **Cabecera de Energía:** si todos los personajes tienen la misma cuenta, «+15 OD en 02:59:52 · 4 personajes · tope 560»
  (o +30 y 840). Si hay de los dos tipos: «Recarga en 02:59:52 · 4 personajes», sin cifras.
- **Asistente:** el texto de reglas que recibe explica las dos cuentas y dice la de cada personaje.
- **Idiomas:** los textos nuevos se traducen en `i18n-strings.js` (en, it, pt).

## 6. Amigos y legión

`account` se comparte con la energía, como `classId`. Los amigos y la legión ven el tope y el número correctos
(«412 / 560»), y los mini orbes se llenan según el tope de cada uno.

## 7. Errores y casos límite

- Personaje sin `account` o con un valor desconocido → Premium.
- Paso a Normal con energía por encima de 560 → se mantiene, no recarga, se ve como lleno.
- Personajes de amigos guardados antes del cambio → Premium.
- Hora de recarga sin configurar → como hoy: se muestra la energía guardada sin proyectar.

## 8. Pruebas

- **Unitarias (`energy.test.js`, `planner.test.js`, `view.test.js`, `runes.test.js`, `social.test.js`, `layout.test.js`):**
  energía y «Lleno en» con +15/560 y +30/840; personaje sin `account` = Premium; cambio de cuenta a mitad de recarga;
  energía por encima del tope tras pasar a Normal; pérdida y Plan de hoy en las dos cuentas; runas encendidas con
  tope 560; energía de amigos con su cuenta; cabecera con cuentas mezcladas.
- **Servidor:** `account` válido se guarda; otro valor (número, `'gold'`, etc.) da error de validación.
- **E2E (`dev/e2e-web.mjs`):** crear un personaje Normal (tope 560) y otro Premium (840), comprobar el número y el selector,
  cambiar uno de cuenta y comprobar que la energía no salta; sin errores en consola.

## 9. Orden de trabajo

1. `energy.js` con `ACCOUNTS` y `rulesOf`, y sus pruebas.
2. Planner, view, layout, charts, runas y social con las reglas por personaje.
3. Servidor: validación de `account`.
4. Interfaz: selector, marca Premium, cabecera, asistente, traducciones.
5. E2E y `DESIGN.md`.
