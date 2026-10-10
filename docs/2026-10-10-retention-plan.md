# Retención y alcance — Plan de implementación

> **Para agentes:** superpowers:executing-plans (inline). Sin tests (petición del usuario): cada tarea termina con comprobación de sintaxis (`node --check`) y commit. Casillas `- [ ]`.

**Objetivo:** Que la página sirva a más jugadores y les dé motivos para volver: facción Elyos/Asmodiana, modo ligero, guía inicial, lista de tareas diaria/semanal, logros y racha, informe semanal descargable, planificador de grupo, novedades, sugerencias, exportar/importar e idiomas (ES/EN/IT/PT).

**Arquitectura:** Igual que hasta ahora: módulos JS puros + `index.html`. Datos nuevos bajo `members/{uid}/…` (lo de cada uno) y `feedback/{id}` (sugerencias que solo lee el dueño). Textos en español primero; la traducción va al final con `i18n.js`.

**Spec:** chat del 10/10/2026: "hazlo todo paso por paso" sobre la lista de ideas de retención, excepto lo que depende del dominio propio (notificaciones push, probar sin cuenta, invitación por enlace, anuncios, PayPal), que queda para la fase de despliegue (decisiones.md).

## Restricciones globales
- Todo lo de los planes anteriores. Sin enlaces a otras páginas.
- Reinicio diario 07:00 UTC; semanal miércoles 07:00 UTC (events.js).
- Capacidades al publicar: `{db:{rules:[{path:'members',read:'view',write:'owner'},{path:'members/{self}',write:'interact'},{path:'feedback',read:'owner',write:'interact'}]}, user:{scopes:['profile']}, downloads:true}`.
- Conveniencias por dispositivo (modo ligero, idioma) en `localStorage` con try/catch; lo que debe seguir al usuario (facción, tareas, disponibilidad) en `db`.

---

### Tarea 1: Facción y modo ligero
- Tokens de color por facción en `:root[data-faction="elyos"|"asmodian"]`: Asmodiano = carmesí `#e2556b` principal, morado `#a67cff` secundario, fondo `#0d0612`→`#1a0b22`, texto `#f1e6ee`.
- `orb.js`: `scene.setPalette({primary, secondary})` cambia oro/azul de partículas, plumas, cristal, runas y haz.
- Menú → sección "Apariencia": facción (Elyos/Asmodiano, guardado en `prefs.faction`) y "Modo ligero (sin 3D)" (localStorage `odyle-lite`; apaga la escena y usa orbes planos). El subtítulo pasa a "Daevas de Asmodae" con Asmodiano.

### Tarea 2: Guía inicial
- Si no hay personajes propios: panel "Empieza en 3 pasos" con pasos marcables automáticamente — 1) Añade tu personaje (abre el menú en "Añadir personaje"), 2) Pon su energía (abre "Actualizar" del primero), 3) Ajusta la recarga (abre el menú en "Ajustar recarga"). Se oculta cuando los tres están hechos.

### Tarea 3: Lista de tareas diaria y semanal
- `tasks.js` (puro): `periodKeys(nowMs) → {daily, weekly}` (enteros desde los reinicios), `DEFAULT_TASKS` = diarias: "Encargos de suministro del Abismo" ×1, "Misiones de deber" ×1, "Mazmorra de emergencia" ×1; semanales: "Mazmorra semanal" ×2, "Asedio del Artefacto" ×1. `progressFor(doc, tasks, nowMs)` devuelve los contadores del periodo actual (0 si el periodo cambió).
- Datos: `members/{uid}/settings/tasks` `{items:[{id,name,kind:'daily'|'weekly',max}]}` (si no existe, `DEFAULT_TASKS`); `members/{uid}/progress/{charId}` `{daily:{key,done:{id:n}}, weekly:{key,done:{id:n}}}`.
- Tarjeta: botón "Tareas 2/5" que despliega casillas/contadores (+/−). Menú → "Lista de tareas" para editar (nombre, diaria/semanal, veces 1–10).
- Aviso en la tarjeta si quedan diarias pendientes a menos de 2 h del reinicio.

### Tarea 4: Logros, racha e informe semanal
- `members/{uid}/settings/stats` `{days:['YYYY-MM-DD'…] (últimos 60 días con actividad), spentTotal, spendCount, tasksDone}` actualizado tras gastar o marcar tareas.
- `achievements.js` (puro): lista de logros (Primer gasto, 10/100/500 gastos, 1.000/10.000 OD gastada, racha 3/7/30 días, primera semana completa de tareas, 100K/500K/1M de PC) y `streak(days, today)`.
- Sección "Tu semana": OD gastada, tareas hechas, subida de PC, racha actual y logros desbloqueados (los bloqueados en gris). Botón "Descargar imagen" → PNG 1080×1080 dibujado en canvas con el tema de la facción (capacidad `downloads`).

### Tarea 5: Planificador de grupo
- `members/{uid}/settings/availability` `{days:{0..6:{from:'HH:MM',to:'HH:MM'}|null}}` editable en el menú ("Mi disponibilidad").
- En la vista de legión: "Disponibles ahora" (miembros dentro de su franja de hoy) y "Listos para mazmorra" (con energía ≥ coste del primer botón de gasto), y una tabla de la semana con las franjas de cada miembro.

### Tarea 6: Novedades, sugerencias y exportar/importar
- Menú → "Novedades": lista fija en el código con las mejoras por fecha.
- Menú → "Sugerencias": textarea (máx. 1000) → `feedback/{autoId}` `{uid, at, text}`; el dueño ve la lista de sugerencias en esa misma sección.
- Menú → "Tus datos": "Exportar" (JSON con personajes, ajustes, tareas, progreso, PC, estadísticas → `downloads.save`) e "Importar" (archivo JSON propio; confirmación en dos clics; escribe en tus rutas).

### Tarea 7: Idiomas
- `i18n.js`: `t(key, vars)`, idioma por `navigator.language` o el elegido en el menú (localStorage `odyle-lang`); diccionarios `es`, `en`, `it`, `pt` con todas las cadenas (también las de `view.js`, `planner.js`, `spend.js`, `events.js`, `classes.js`, `tasks.js`, `achievements.js`). HTML estático con `data-i18n`. Fechas con el `Intl` del idioma.
- Las traducciones EN/IT/PT las prepara un agente a partir del diccionario español.

### Tarea 8: Revisión, publicación y copia
- Revisión de código (lectura, sin tests) por un agente nuevo; arreglos; publicar con las capacidades de Restricciones globales; copiar a `Prova`.
