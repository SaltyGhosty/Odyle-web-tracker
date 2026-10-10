# Aion 2 Stamina Tracker — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguir el progreso.

**Objetivo:** Una página web privada que muestra la energía Odyle (OD) de varios personajes de Aion 2, cuánto falta para la próxima recarga y cuándo se llena cada uno, sincronizada entre PC y móvil.

**Arquitectura:** Página HTML publicada como Artifact (enfoque A). La lógica de energía vive en módulos JS puros y testeados (`energy.js`, `view.js`); `index.html` solo pinta y guarda. Los datos (personajes y hora de recarga) viven en la base de datos `db` del Artifact, así PC y móvil ven lo mismo. La energía se calcula al vuelo desde el último valor introducido; la página nunca escribe valores derivados del reloj.

**Tecnología:** HTML/CSS/JS sin framework, módulos ES; tests con `node --test` (Node ≥ 18, sin dependencias); capacidades Artifact `db` y `user` (contrato 0.2.75).

**Spec:** `docs/2026-10-10-aion2-stamina-tracker-decisions.md` (decisiones 1–8). El diseño por secciones no se presentó aparte: revisar este plan cuenta como aprobación del diseño.

## Restricciones globales

- Recarga: **+15** de energía cada **3 horas** (`TICK_MS = 10_800_000`), igual para todos los personajes y a la misma hora (un único horario compartido).
- Máximo: **840** para todos los personajes.
- Entrada manual: no hay API; el usuario escribe la energía actual de cada personaje.
- Sincronizado entre dispositivos vía `db`; sin alertas ni notificaciones.
- Textos de la interfaz en **español**.
- Tiempos guardados como milisegundos epoch (UTC); se muestran en hora local.
- Sin datos de personajes en el código de la página: se cargan en la `db` después de publicar.
- Proyecto en el workspace `/home/claude/aion2-tracker` (repo git); al terminar se copia a `C:\Users\Salty\Desktop\Prova\aion2-tracker`.

## Foco de revisión

1. **Energía introducida por encima de 840** (p. ej. por objetos): se muestra tal cual, no sube más y nunca se recorta → test en Tarea 1.
2. **Valor guardado justo en el instante de una recarga:** esa recarga no se cuenta dos veces (intervalo semiabierto `(desde, hasta]`) → test en Tarea 1.
3. **Entrada inválida** (vacía, negativa, decimal, texto, minutos fuera de 1–180): se rechaza con un mensaje y no se escribe nada → tests en Tarea 2.
4. **Página abierta días seguidos o móvil que vuelve de suspensión:** la energía se recalcula desde `recordedAt` en cada repintado, nunca se acumula → test en Tarea 1 (`now` varios días después).
5. **Sin acceso a `db` o base vacía** (sesión cerrada, visor sin permiso, primer uso): la página carga sin errores, muestra estado vacío o solo lectura → verificación en Tarea 4.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `package.json` | `{"type":"module","scripts":{"test":"node --test"}}` |
| `energy.js` | Reglas de recarga: constantes, conteo de ticks, energía actual, hora de lleno, formato de duración |
| `energy.test.js` | Tests de `energy.js` |
| `view.js` | Modelo de vista para la página y validación de entradas |
| `view.test.js` | Tests de `view.js` |
| `index.html` | Marcado, estilos, conexión con `db` y eventos |

**Modelo de datos en `db`:**
- `settings/schedule` → `{ anchorMs: number }` (cualquier instante en que ocurrió o ocurrirá una recarga)
- `characters/{id}` → `{ name: string, energy: number, recordedAt: number, order: number }`

---

### Tarea 1: Reglas de energía

**Archivos:** Crear `package.json`, `energy.js`, `energy.test.js` (y `git init`).

**Interfaces — produce:**
- `REGEN = 15`, `TICK_MS = 10_800_000`, `MAX = 840`
- `ticksBetween(anchorMs: number, fromMs: number, toMs: number): number` — ticks `anchorMs + k*TICK_MS` (k entero, también negativo) dentro de `(fromMs, toMs]`
- `nextTickAt(anchorMs: number, nowMs: number): number` — primer tick estrictamente posterior a `nowMs`
- `currentEnergy(char: {energy, recordedAt}, anchorMs: number, nowMs: number): number`
- `fullAt(char, anchorMs, nowMs): number | null` — `null` si ya está lleno
- `anchorFromCountdown(nowMs: number, minutesLeft: number): number` = `nowMs + minutesLeft*60_000`
- `formatDuration(ms: number): string`

- [ ] **Paso 1: Crear el proyecto** — `mkdir -p /home/claude/aion2-tracker && cd` ahí, `git init`, escribir `package.json` como en la tabla.

- [ ] **Paso 2: Escribir los tests que fallan** en `energy.test.js` (`node:test` + `node:assert/strict`). Con `R = Date.UTC(2026,9,10,12,0)`, `A = R + 37*60_000`, `H = 3_600_000`:

```js
test('sin tick antes del primer ancla', () => assert.equal(currentEnergy({energy:225, recordedAt:R}, A, R + 36*60_000), 225));
test('suma 15 justo en el tick', () => assert.equal(currentEnergy({energy:225, recordedAt:R}, A, A), 240));
test('suma 30 tras dos ticks', () => assert.equal(currentEnergy({energy:225, recordedAt:R}, A, A + 3*H), 255));
test('días después recalcula desde recordedAt', () => assert.equal(currentEnergy({energy:90, recordedAt:R}, A, A + 49*3*H), 840));
test('no supera 840', () => assert.equal(currentEnergy({energy:835, recordedAt:R}, A, A), 840));
test('por encima de 840 se queda igual', () => { assert.equal(currentEnergy({energy:900, recordedAt:R}, A, A + 9*H), 900); assert.equal(fullAt({energy:900, recordedAt:R}, A, A), null); });
test('guardado justo en un tick no lo cuenta', () => { assert.equal(ticksBetween(A, A, A), 0); assert.equal(ticksBetween(A, A, A + 3*H), 1); });
test('ancla en el futuro o pasado da igual', () => assert.equal(ticksBetween(A + 30*3*H, R, A + 3*H), 2));
test('nextTickAt', () => { assert.equal(nextTickAt(A, R), A); assert.equal(nextTickAt(A, A), A + 3*H); });
test('fullAt de los tres personajes', () => {
  assert.equal(fullAt({energy:225, recordedAt:R}, A, R), A + 40*3*H); // 41 ticks
  assert.equal(fullAt({energy:180, recordedAt:R}, A, R), A + 43*3*H); // 44 ticks
  assert.equal(fullAt({energy:90,  recordedAt:R}, A, R), A + 49*3*H); // 50 ticks
});
test('anchorFromCountdown', () => assert.equal(anchorFromCountdown(R, 37), A));
test('formatDuration', () => {
  assert.equal(formatDuration(59_999), '<1m');
  assert.equal(formatDuration(37*60_000), '37m');
  assert.equal(formatDuration(2*H + 5*60_000), '2h 5m');
  assert.equal(formatDuration(120*H + 37*60_000), '5d 0h 37m');
});
```

- [ ] **Paso 3: Ejecutar y ver que falla** — `npm test` → FAIL (módulo `energy.js` no encontrado).

- [ ] **Paso 4: Implementar `energy.js`.** Conteo de ticks:

```js
ticksBetween = floor((to - anchor)/TICK_MS) - floor((from - anchor)/TICK_MS)
nextTickAt   = anchor + (floor((now - anchor)/TICK_MS) + 1) * TICK_MS
currentEnergy: energy >= MAX ? energy : min(MAX, energy + REGEN * ticksBetween(anchor, recordedAt, now))
fullAt: c = currentEnergy(...); c >= MAX ? null : nextTickAt(anchor, now) + (ceil((MAX - c)/REGEN) - 1) * TICK_MS
```

`formatDuration`: minutos con `floor`; con días → `"Xd Yh Zm"`, con horas → `"Yh Zm"`, si no → `"Zm"`; menos de 1 minuto → `"<1m"`.

- [ ] **Paso 5: Ejecutar y ver que pasa** — `npm test` → todos PASS.

- [ ] **Paso 6: Commit** — `git add -A && git commit -m "feat: energy regen rules"`

---

### Tarea 2: Modelo de vista y validación

**Archivos:** Crear `view.js`, `view.test.js`.

**Interfaces:**
- Consume: todo lo de `energy.js`.
- Produce:
  - `buildView(characters: Array<{id,name,energy,recordedAt,order}>, schedule: {anchorMs}|null, nowMs: number): { nextTickInMs: number|null, rows: Row[] }`
  - `Row = { id, name, energy: number, max: 840, percent: number (0–100, entero, tope 100), isFull: boolean, fullInText: string, fullAtMs: number|null }`
  - `parseEnergyInput(s: string): {ok:true, value:number} | {ok:false, error:string}` — entero 0–99999
  - `parseMinutesInput(s: string): {ok:true, value:number} | {ok:false, error:string}` — entero 1–180
  - `parseNameInput(s: string): {ok:true, value:string} | {ok:false, error:string}` — recortado, 1–24 caracteres

- [ ] **Paso 1: Escribir los tests que fallan** en `view.test.js` (mismas `R`, `A`, `H`):

```js
test('filas ordenadas por order y con datos calculados', () => {
  const v = buildView([
    {id:'b', name:'shutaruku', energy:180, recordedAt:R, order:2},
    {id:'a', name:'SaltyGhosty', energy:225, recordedAt:R, order:1},
  ], {anchorMs:A}, R);
  assert.deepEqual(v.rows.map(r => r.id), ['a','b']);
  assert.equal(v.nextTickInMs, 37*60_000);
  assert.equal(v.rows[0].energy, 225);
  assert.equal(v.rows[0].percent, 26);              // floor(225/840*100)
  assert.equal(v.rows[0].fullAtMs, A + 40*3*H);
  assert.equal(v.rows[0].fullInText, formatDuration(A + 40*3*H - R));
});
test('lleno', () => { const r = buildView([{id:'a',name:'x',energy:900,recordedAt:R,order:1}], {anchorMs:A}, R).rows[0];
  assert.equal(r.isFull, true); assert.equal(r.percent, 100); assert.equal(r.fullInText, 'Lleno'); assert.equal(r.fullAtMs, null); });
test('sin horario: valor guardado y aviso', () => { const v = buildView([{id:'a',name:'x',energy:90,recordedAt:R,order:1}], null, R + 9*H);
  assert.equal(v.nextTickInMs, null); assert.equal(v.rows[0].energy, 90); assert.equal(v.rows[0].fullInText, 'Falta la hora de recarga'); });
test('lista vacía', () => assert.deepEqual(buildView([], {anchorMs:A}, R).rows, []));
test('parseEnergyInput', () => {
  assert.deepEqual(parseEnergyInput(' 225 '), {ok:true, value:225});
  assert.deepEqual(parseEnergyInput('900'), {ok:true, value:900});
  for (const bad of ['', '-5', '12.5', 'abc', '100000']) assert.equal(parseEnergyInput(bad).ok, false);
});
test('parseMinutesInput', () => {
  assert.deepEqual(parseMinutesInput('37'), {ok:true, value:37});
  for (const bad of ['0', '181', '', '3.5']) assert.equal(parseMinutesInput(bad).ok, false);
});
test('parseNameInput', () => {
  assert.deepEqual(parseNameInput('  PraiseTheSun '), {ok:true, value:'PraiseTheSun'});
  assert.equal(parseNameInput('   ').ok, false);
  assert.equal(parseNameInput('x'.repeat(25)).ok, false);
});
```

- [ ] **Paso 2: Ejecutar y ver que falla** — `npm test` → FAIL (`view.js` no encontrado).

- [ ] **Paso 3: Implementar `view.js`.** Orden por `order`, desempate por `name`. Sin horario: `energy` guardada, `fullAtMs: null`, texto `'Falta la hora de recarga'`. Mensajes de error en español y cortos (p. ej. `'Escribe un número entero entre 0 y 99999'`). Validar con `/^\d+$/` tras `trim()`.

- [ ] **Paso 4: Ejecutar y ver que pasa** — `npm test` → todos PASS.

- [ ] **Paso 5: Commit** — `git commit -am "feat: view model and input validation"` (añadir antes los archivos nuevos).

---

### Tarea 3: Página estática

**Archivos:** Crear `index.html`, `design/mobile.png`, `design/desktop.png`; archivo nuevo en Figma.

**Interfaces — consume:** `buildView`, `parse*Input` de `view.js`; `formatDuration` de `energy.js` (vía `<script type="module">`).

- [ ] **Paso 1: Diseñar en Figma.** Cargar la skill `figma-use` (plugin de Figma; si no está, el recurso MCP `skill://figma/figma-use/SKILL.md`) y, si existe, `figma-generate-design`. Crear un archivo nuevo "Aion 2 — Energía Odyle" con `create_new_file` y dentro, con `use_figma`, dos frames: **Móvil 390px** y **Escritorio 1280px**, cada uno con la cabecera, tres tarjetas de ejemplo (nombres genéricos "Personaje 1/2/3", nunca los reales), el formulario de añadir y el estado vacío (los elementos del Paso 3). Definir los colores y tipografía como variables de Figma (claro y oscuro). Guardar una captura de cada frame con `get_screenshot` en `design/` y anotar la URL del archivo en el informe. Commit: `git add design && git commit -m "design: figma mockups"`.

- [ ] **Paso 2: Cargar la skill `artifact-design`** y seguir su contrato (título de 2–4 palabras, tokens de color en `:root` con modo oscuro, ancho de móvil con margen lateral de 16px, sin scroll horizontal). El diseño de Figma es la referencia visual; si choca con el contrato, gana el contrato.

- [ ] **Paso 3: Construir la página** igual al diseño de Figma, con una función `render(view)` que pinta:
  - Cabecera: "Energía Odyle" + "Próxima recarga en {formatDuration(nextTickInMs)}" (o "Falta la hora de recarga" si es `null`) y botón "Ajustar recarga".
  - Una tarjeta por fila: nombre, `energy / 840`, barra con `percent`, "Lleno en {fullInText}" y la fecha local de `fullAtMs`; botón "Actualizar" (abre un campo numérico en línea) y "Quitar" (confirmación en dos clics dentro de la tarjeta, sin `confirm()`).
  - Formulario "Añadir personaje" (nombre).
  - Estado vacío: "Aún no hay personajes. Añade el primero."
  - Errores de validación junto al campo, en texto.
  - Un `setInterval` de 30 s que solo vuelve a llamar `render(buildView(...))` con el estado en memoria (sin escribir nada).

- [ ] **Paso 4: Probar con datos de ejemplo en memoria** (solo en un archivo de prueba local, nunca en la página publicada): abrir con Playwright/Chromium a 390px y 1280px de ancho, hacer captura y comprobar que no hay scroll horizontal, que ambos temas se leen bien y que se parece a las capturas de `design/`.

- [ ] **Paso 5: Commit** — `git add index.html && git commit -m "feat: static tracker page"`

---

### Tarea 4: Conectar con `db` y publicar

**Archivos:** Modificar `index.html`.

**Interfaces — consume:** `anchorFromCountdown` de `energy.js`; validadores de `view.js`. Rutas `db`: `settings/schedule`, `characters/{id}` (ver Modelo de datos).

- [ ] **Paso 1: Leer los datos.** `const db = await claude.use("db")`; `const user = await claude.use("user")`. Si `db` es `null`: mostrar "No se pueden cargar los datos aquí" y ocultar los controles. Si no, una sola suscripción `onSnapshot` a `characters` y otra a `settings/schedule`; cada snapshot actualiza el estado en memoria y llama a `render`. Si `user?.can("data.write") === false`, modo solo lectura (sin botones de edición).

- [ ] **Paso 2: Escrituras, solo tras una acción del usuario y una a la vez:**
  - Actualizar: `db.doc("characters/"+id).update({energy, recordedAt: Date.now()})`
  - Ajustar recarga: `db.doc("settings/schedule").set({anchorMs: anchorFromCountdown(Date.now(), minutes)})`
  - Añadir: `db.collection("characters").add({name, energy: 0, recordedAt: Date.now(), order: maxOrder + 1})`
  - Quitar: `db.doc("characters/"+id).delete()`
  - En rechazo: `invalid_argument` → pasar a solo lectura; `unavailable` → reintentar una vez tras 0,5–1,5 s; otro código → mensaje "No se pudo guardar".

- [ ] **Paso 3: Publicar** con el Artifact tool: `file_path: index.html`, `files: {"energy.js": "energy.js", "view.js": "view.js"}`, `capabilities: {db: {}, user: {}}`, `icon: "gauge"`.

- [ ] **Paso 4: Verificar** — `ArtifactData` `list` de `characters` → vacío sin errores; abrir la página → estado vacío visible (punto 5 del Foco de revisión).

- [ ] **Paso 5: Commit** — `git commit -am "feat: sync via artifact db"`

---

### Tarea 5: Cargar mis personajes y entregar

**Archivos:** ninguno nuevo en el proyecto; copia a `Prova`.

- [ ] **Paso 1: Pedir al usuario valores frescos** (los del 10/10 ya están viejos): energía actual de SaltyGhosty, shutaruku y PraiseTheSun, y minutos hasta la próxima recarga.

- [ ] **Paso 2: Cargar con un `batch` de `ArtifactData`:** `characters/saltyghosty`, `characters/shutaruku`, `characters/praisethesun` con `{name, energy, recordedAt: <ahora>, order: 1|2|3}` y `settings/schedule` con `{anchorMs: ahora + minutos*60_000}`.

- [ ] **Paso 3: Verificar** — `ArtifactData` `list` de `characters` → 3 documentos con los valores dados; en la página, cada tarjeta muestra la energía y "Lleno en" coincide con `fullAt` calculado a mano para uno de ellos.

- [ ] **Paso 4: Copiar el proyecto** (`package.json`, `energy.js`, `energy.test.js`, `view.js`, `view.test.js`, `index.html`) a `C:\Users\Salty\Desktop\Prova\aion2-tracker\` con `device_commit_files`.

- [ ] **Paso 5: Revisión final** de toda la rama con un revisor nuevo, contra la spec y el Foco de revisión.
