# Funcionalidades nuevas + menú hamburguesa — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans. Casillas `- [ ]`.

**Objetivo:** Convertir el tracker en una herramienta de uso diario y de grupo: gastar con botones, deshacer, energía extra, resumen con sugerencia, aviso de desperdicio, previsión semanal, historial, sonido, página de legión, resumen diario programado y un menú hamburguesa que agrupa "Añadir personaje" y los ajustes.

**Arquitectura:** Tres fases que se pueden publicar por separado. La lógica nueva va en módulos puros testeados con `node --test` (`store.js`, `spend.js`, `planner.js`); el dibujo en `charts.js` y `sound.js`; `index.html` solo pinta y conecta. Los datos pasan a ser por miembro (`members/{uid}/…`) para que cada persona de la legión edite solo lo suyo y vea lo de los demás.

**Tecnología:** la misma (HTML/CSS/JS sin framework, Three.js 0.160.0, `db` + `user` del Artifact, `node --test`, Playwright). Gráficos en SVG propio (sin librerías). Sonido con Web Audio sintetizado (sin archivos).

**Spec:** lista aprobada en el chat del 10/10/2026 ("Quiero todos"): botones rápidos de gasto, deshacer, energía extra por objetos, panel de resumen con "juega con…", aviso de desperdicio, línea de tiempo de la semana, resumen diario fuera de la página, sonido opcional, registro de gasto, página de legión/amigos; y "Añadir personaje" dentro de un menú hamburguesa. Reglas de energía de los planes anteriores (+15 cada 3 h, máx. 840).

## Restricciones globales
- Todo lo de los planes anteriores (un contexto WebGL, nunca escribir en `db` desde temporizadores o animaciones, textos en español, sin datos de personajes en el código, iconos propios).
- Datos: `members/{uid}` (doc del miembro `{joinedAt}`), `members/{uid}/characters/{id}`, `members/{uid}/settings/presets` (`{items: [{id, name, cost}]}`), `members/{uid}/settings/prefs` (`{quietStart:'00:00', quietEnd:'08:00'}`), `members/{uid}/events/{id}` (`{at, kind:'spend'|'extra'|'set', amount, presetId|null, characterId}`), `settings/schedule` (compartido, igual que ahora).
- Reglas `db`: `[{path:'members', read:'view', write:'owner'}, {path:'members/{self}', write:'interact'}]`. Capacidades: `{db:{rules:[…]}, user:{scopes:['profile']}}`.
- Eventos con más de 30 días se borran (solo los propios, al cargar) para no acercarse al límite de 25 000 documentos.
- El sonido empieza apagado; su preferencia y el menú abierto/cerrado son conveniencias por navegador (`localStorage` con try/catch).

## Foco de revisión
1. **Personajes existentes** (`characters/*` del dueño): se trasladan a `members/{uid}/characters` sin perder nombre, clase, energía ni `recordedAt`, una sola vez → test de `planMigration` en T1 + preview en T1.
2. **Gastar más energía de la que hay:** se rechaza con "No hay energía suficiente" y no se escribe nada → test en T2.
3. **Deshacer tras recargar la página o tras 8 s:** ya no aparece; deshacer restaura exactamente el documento anterior y borra el evento → preview en T3.
4. **Miembro de la legión sin permiso de escritura (Viewer):** ve todo, sin botones → preview en T7.
5. **Horas de descanso que cruzan medianoche** (23:00–07:00): el aviso de desperdicio funciona → test en T4.

---

## Fase A — Uso diario

### Tarea 1: Datos por miembro y migración
**Archivos:** crear `store.js`, `store.test.js`; modificar `index.html`, `dev/preview.mjs`.
**Produce:**
- `paths(uid: string) → { member: 'members/'+uid, characters: 'members/'+uid+'/characters', presets: 'members/'+uid+'/settings/presets', prefs: 'members/'+uid+'/settings/prefs', events: 'members/'+uid+'/events' }`
- `planMigration(oldDocs: Array<{id, data}>, newIds: Set<string>) → Array<{id, data}>` — devuelve los que hay que copiar (los que no existen ya en el destino, conservando `id` y todos los campos).
- En la página: `state.members: Map<uid, {characters: Array}>`; `myUid` (de `user.id()`); se escribe `members/{myUid}` `{joinedAt}` si no existe; una suscripción a `members` y una por miembro a su `characters` (máx. 60 miembros); si `user.isOwner()` y existe `characters/*`, se copian con `planMigration` y después se borran los originales.
- [ ] Tests que fallan: `paths('u1').events === 'members/u1/events'`; `planMigration([{id:'a',data:{name:'X',energy:1,recordedAt:2,classId:'clerigo',order:1}}], new Set())` → mismo objeto; con `new Set(['a'])` → `[]`.
- [ ] Preview que falla: stub sembrado con `characters/a..c` y dueño `u_me` → tras cargar, existen `members/u_me/characters/a..c` con los mismos datos y `characters/*` está vacío; las 3 tarjetas siguen visibles.
- [ ] Implementar; `npm test` + `node dev/preview.mjs` → PASS; publicar NO todavía; commit `feat: per-member data and migration`.

### Tarea 2: Lógica de gasto
**Archivos:** crear `spend.js`, `spend.test.js`.
**Produce:**
- `applyDelta(current: number, delta: number) → {ok:true, energy} | {ok:false, error}` — error `'No hay energía suficiente'` si `current + delta < 0`; tope 99999.
- `parsePreset(name: string, cost: string) → {ok:true, value:{name, cost}} | {ok:false, error}` — nombre 1–20 caracteres recortado; coste entero 1–840; errores `'Escribe un nombre de 1 a 20 caracteres'`, `'El coste es un número entero entre 1 y 840'`.
- `parseExtraInput(s) → {ok, value|error}` — entero 1–9999, error `'Escribe un número entero entre 1 y 9999'`.
- `dailySpent(events, nowMs, tzOffsetMin, days=7) → Array<{day:'YYYY-MM-DD', spent:number}>` — de más antiguo a hoy; suma `amount` de `kind:'spend'`; día local = fecha UTC de `at − tzOffsetMin·60000` (`tzOffsetMin` = `Date#getTimezoneOffset()`).
- `staleEvents(events, nowMs, days=30) → string[]` — ids con `at < nowMs − days·86 400 000`.
- [ ] Tests que fallan: `applyDelta(100,-40)` → `{ok:true,energy:60}`; `applyDelta(30,-40).ok === false`; `applyDelta(840,15).energy === 855`; `parsePreset(' Mazmorra ', '40')` ok `{name:'Mazmorra',cost:40}`; coste `'0'`, `'841'`, `'4.5'` no ok; nombre de 21 no ok; `parseExtraInput('50')` ok; `'0'` no ok; `dailySpent` con eventos el 9/10 23:30Z y 10/10 00:30Z (offset 0, now 10/10 12:00Z) → últimos dos días `[…, {day:'2026-10-09',spent:a}, {day:'2026-10-10',spent:b}]` y longitud 7; un `kind:'extra'` no suma; `staleEvents` → solo el de hace 31 días.
- [ ] FAIL → implementar → PASS; commit `feat: spend logic`.

### Tarea 3: Menú hamburguesa, botones de gasto, energía extra y deshacer
**Archivos:** modificar `index.html`, `dev/preview.mjs`.
**Consume:** T1 `paths`; T2 todo.
- **Menú hamburguesa:** botón `☰` (aria-label "Menú", `aria-expanded`) en la cabecera; abre un panel lateral derecho (`<aside id="drawer">`, cristal oscuro, ancho `min(360px, 90vw)`, capa oscura detrás, cierra con Esc, con la capa o con `✕`; el foco va al primer campo y vuelve al botón al cerrar). Contiene, en este orden: **Añadir personaje** (el formulario actual, se quita de la página principal), **Botones de gasto** (lista editable: nombre + coste, añadir/quitar; guarda en `presets`), **Ajustar recarga** (el formulario actual, se quita de la cabecera), **Horas de descanso** (dos `<input type="time">`, guarda en `prefs`; lo usa T5), **Sonido** (interruptor; lo usa T8).
- **En cada tarjeta propia:** fila de botones con cada preset `"{name} −{cost}"` → `applyDelta(energíaActual, −cost)`; si falla, error en la tarjeta; si va bien escribe `{energy, recordedAt: now}` y un evento `spend`. Botón `"+ Extra"` abre un campo en línea → `parseExtraInput` → `applyDelta(+x)` + evento `extra`. "Actualizar" escribe evento `set` (amount = nuevo − anterior).
- **Deshacer:** tras cualquiera de esas escrituras aparece un aviso abajo "Gastaste 40 en SaltyGhosty · Deshacer" durante 8 s (solo el último); deshacer restaura `{energy, recordedAt, classId}` anteriores y borra el evento. No se guarda entre recargas.
- [ ] Preview que falla: abrir el menú, añadir un personaje desde el menú; crear el preset "Mazmorra 40"; pulsar "Mazmorra −40" en una tarjeta con 612 → 572 y existe 1 evento; "Deshacer" → 612 y 0 eventos; con 30 de energía → mensaje "No hay energía suficiente"; Esc cierra el menú y el foco vuelve a `☰`; el formulario de añadir ya no está en la página principal.
- [ ] Implementar; `npm test` + preview → PASS; commit `feat: drawer, spend buttons, extra and undo`.
- [ ] **Publicar fase A** (mismo Artifact; `files` + `store.js`, `spend.js`; `capabilities` nuevas de Restricciones globales) y comprobar con `ArtifactData list` que `members/*/characters` contiene los 3 personajes del usuario tras abrir la página. Copiar a `Prova`.

## Fase B — Planificar

### Tarea 4: Planificador
**Archivos:** crear `planner.js`, `planner.test.js`.
**Produce:**
- `summary(rows, nowMs) → {total:number, fullNow:string[], nextFull:{id,name,fullAtMs}|null, tip:string}` — `tip`: si hay llenos → `"{nombre} está lleno: gasta energía para no perder recargas"`; si no y hay `nextFull` → `"Juega con {nombre}: se llena en {formatDuration}"`; si no → `''`.
- `wasteWarning(fullAtMs, nowMs, quiet:{start:'HH:MM', end:'HH:MM'}, tzOffsetMin) → {lossOD, deadlineMs} | null` — toma la próxima ventana de descanso que termina después de `now` (la actual si estás dentro; admite cruzar medianoche); si `fullAtMs` < fin de esa ventana, `lossOD = 15 · floor((fin − fullAtMs) / TICK_MS)`; null si `lossOD === 0`.
- `projectEnergy(char, anchorMs, nowMs, days) → Array<{t, energy}>` — `now` y cada tick hasta `now + days·24h`, con tope 840.
- [ ] Tests que fallan (offset 0, quiet 00:00–08:00, now = 10/10 20:00Z): fullAt 11/10 02:00Z → `{lossOD:30, deadlineMs: fullAt}`; fullAt 11/10 07:00Z → null; fullAt 11/10 09:00Z → null; quiet 23:00–07:00 (cruza medianoche): fullAt 11/10 01:00Z → `lossOD 30`, fullAt 11/10 04:30Z → null; `projectEnergy({energy:225, recordedAt:R}, A, R, 1)` → 9 puntos, primero `{t:R, energy:225}`, último `energy 345`; `summary` con un lleno → tip "X está lleno…"; sin llenos → "Juega con …"; sin horario → `''`.
- [ ] FAIL → implementar → PASS; commit `feat: planner`.

### Tarea 5: Panel de resumen y aviso de desperdicio
**Archivos:** `index.html`, `dev/preview.mjs`. **Consume:** T4.
- Panel bajo la cabecera: "Energía total {total}", línea `tip`, y "Se llena primero: {nombre} · {fecha}". Solo con personajes propios.
- En cada tarjeta propia: si `wasteWarning` → línea ámbar "Perderás {lossOD} de OD si no juegas antes de las {HH:MM}"; si está lleno → "Estás perdiendo 15 de OD cada 3 h".
- [ ] Preview que falla: datos sembrados con un lleno → tip "… está lleno…" y su tarjeta dice "Estás perdiendo 15 de OD cada 3 h"; personaje que se llena dentro del descanso → línea "Perderás". FAIL → implementar → PASS; commit `feat: summary and waste warning`.

### Tarea 6: Semana e historial
**Archivos:** crear `charts.js`; `index.html`, `dev/preview.mjs`. Cargar la skill `dataviz` antes de dibujar.
**Produce:** `renderForecast(svg: SVGElement, series: Array<{name, color, points:[{t, energy}]}>, nowMs)` (líneas por personaje en su color de clase, línea discontinua en 840, eje de días) y `renderHistory(svg, days: Array<{day, spent}>)` (barras de 7 días con el valor encima).
- Dos secciones nuevas al final de la página: "Próximos 7 días" (`projectEnergy` de cada personaje propio) e "Historial de gasto" (`dailySpent` de mis eventos). Al cargar, borrar mis `staleEvents`.
- [ ] Preview que falla: con 3 personajes hay 3 `path.series` en el SVG de previsión; tras gastar 40 la barra de hoy muestra "40". FAIL → implementar → PASS; mirar capturas; commit `feat: forecast and history charts`.
- [ ] **Publicar fase B** y copiar a `Prova`.

## Fase C — Grupo y avisos

### Tarea 7: Página de legión
**Archivos:** `index.html`, `dev/preview.mjs`.
- Tarjetas agrupadas por miembro: primero las mías ("Tus personajes"), después cada miembro con su nombre (`user.profiles`, `name || 'Alguien'`), solo lectura. Los orbes 3D y runas se muestran para todos.
- Resumen de legión en el panel: "Listos para mazmorra: {n} personajes con ≥ {coste del primer preset o 40} de OD".
- [ ] Preview que falla: stub con dos miembros (`u_me`, `u_amigo`) → sección del amigo con su nombre y sin botones; con `can('data.write') → false` no hay botones ni menú de edición. FAIL → implementar → PASS; commit `feat: legion view`.

### Tarea 8: Sonido
**Archivos:** crear `sound.js`; `index.html`.
**Produce:** `createSound() → {enabled(): boolean, setEnabled(on: boolean): void, chime(): void, fanfare(): void}` — Web Audio; `chime` = dos notas cortas (880 Hz y 1320 Hz, 0,15 s), `fanfare` = tres notas ascendentes (660/880/1320 Hz); `setEnabled(true)` crea/reanuda el `AudioContext` (llamado desde el clic del interruptor).
- `chime()` con cada "+N" de recarga y `fanfare()` con cada `beam`, solo si está activado.
- [ ] Preview que falla: activar el interruptor del menú no produce errores y persiste tras recargar (localStorage); con él apagado no se crea `AudioContext` (contar con un stub de `window.AudioContext`). FAIL → implementar → PASS; commit `feat: optional sound`.

### Tarea 9: Resumen diario programado
- [ ] **Preguntar al usuario** la hora y su zona horaria, y si lo quiere por notificación, email o ambos.
- [ ] Crear una tarea programada (`create_trigger`, `initiation: human_request`) con un prompt autónomo: leer con `ArtifactData` `members/*` y `settings/schedule` del Artifact, calcular para cada personaje del dueño la energía actual y la hora en que se llena (+15 cada 3 h, máx. 840) y enviar un mensaje corto ("Hoy se llenan: SaltyGhosty 14:20…").
- [ ] Probarla una vez con `fire_trigger` y comprobar que la ejecución puede leer los datos. Si no puede, borrarla, decírselo al usuario y dejarlo anotado.

### Tarea 10: Revisión final, publicación y copia
- [ ] Revisor final nuevo (modelo más capaz) + una pasada de arreglos con tests.
- [ ] Publicar fase C, copiar a `Prova\aion2-tracker` y este plan a `Prova\docs`.
