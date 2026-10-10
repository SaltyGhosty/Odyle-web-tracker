# Comunidad, planificación y asistente — Plan

> superpowers:executing-plans (inline). Sin tests (petición del usuario): `node --check` + commit por tarea; revisión de código final por un agente.

**Objetivo:** usuarios en línea + "Busco grupo", calendario de la legión con asistencia, ranking interno, muro de mensajes, "¿cuántas mazmorras puedo hacer hoy?", simulador de ritmo, objetivo de poder de combate, modo compacto, atajos de teclado, temporizadores propios y un asistente tipo chatbot (Claude vía capacidad `sample`).

**Spec:** chat del 11/10/2026 ("hazlo todo y también un llm como asistente tipo chatbot") sobre la lista de ideas propuesta.

## Restricciones globales
- Lo de planes anteriores. Sin enlaces externos.
- Datos nuevos: `calendar/{id}` `{uid, title, at, durationMin, rsvp:{uid:'yes'|'maybe'|'no'}}` y `wall/{id}` `{uid, at, text}` (reglas por defecto de la raíz: leen todos, escriben Contributor+); en `members/{uid}`: `rank:{weekSpent, cpMax, achievements, updatedAt}` y `cpGoal`; temporizadores propios en `members/{uid}/settings/timers` `{items:[{id,name,endsAt}]}`.
- Tiempo real con `room`: presencia `{uid, char, at}` y temas `lfg` / `lfgReply` abiertos a Contributor.
- Asistente: `sample` (memoryless) con el historial del chat + un resumen JSON de los datos del usuario en cada petición; respuestas en el idioma activo.
- Capacidades al publicar: las actuales + `room:{topics:{lfg:'interact', lfgReply:'interact'}}` + `sample:{}`.
- Presupuesto de suscripciones: fijas de la página 13 → máximo 51 miembros más.

### Tarea 1: Planificar energía
- `planner.js`: `runsToday(energy, cost, anchorMs, nowMs, endOfDayMs)` → `{now, byMidnight}`; `simulate(chars, anchorMs, nowMs, runsPerDay, cost, days)` → por personaje `{wasteOD, emptyOn|null}`.
- Tarjeta: "Mazmorras: 6 ahora · 8 antes de medianoche" (coste del primer botón de gasto, o 40).
- Estadísticas → "Simulador de ritmo": mazmorras al día (0–10) → por personaje "desperdicias X de OD esta semana" o "te quedas sin OD el mié".
- Objetivo de PC: en Actualizar, campo "Objetivo de PC"; tarjeta con barra de progreso y fecha estimada por el ritmo de los últimos apuntes.

### Tarea 2: Comodidad
- Temporizadores propios (Eventos): nombre + minutos, cuenta atrás, sonido y aviso al terminar, quitar.
- Modo compacto (Apariencia, localStorage): tarjetas en fila con orbe pequeño, sin gráficos ni paneles extra.
- Atajos (solo PC, fuera de campos de texto): 1–9 gastar con el botón n en el personaje seleccionado (el primero o el último clicado), Z deshacer, ←/→ cambiar de sección, ? ayuda.

### Tarea 3: En línea y "Busco grupo"
- Presencia: lista "En línea" (cabecera/Legión) con nombres de quien tiene la página abierta.
- "Busco grupo": botón → elige actividad (eventos del juego + texto libre) → `emit('lfg')`; quien está conectado ve un aviso con "Voy"; las respuestas llegan como `lfgReply` y se cuentan.

### Tarea 4: Legión
- Calendario: crear cita (título, fecha y hora, duración); lista de próximas citas con Voy/Quizá/No y recuento; aviso 15 min antes (como los favoritos).
- Muro: mensajes de hasta 280 caracteres, últimos 50, el autor puede borrar los suyos.
- Ranking: OD gastada esta semana, PC máximo y logros, a partir de `members/{uid}.rank` (cada uno publica el suyo al cambiar sus estadísticas).

### Tarea 5: Asistente
- Botón flotante "Asistente" → panel de chat (historial en memoria de la página). Contexto: personajes con energía/llenado, tareas pendientes, próximos eventos y favoritos, citas del calendario, objetivos de PC. Botones rápidos: "¿Qué hago hoy?", "¿Con quién juego primero?". Streaming con `onText`; botón detener.

### Tarea 6: Revisión, traducciones, publicación
- Agente traduce las cadenas nuevas; agente revisa el código; arreglos; publicar con las capacidades nuevas; copiar a Prova.
