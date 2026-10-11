# Legiones y perfil — Plan

> superpowers:executing-plans (inline). TDD para la lógica pura (`legion.js`); la interfaz se comprueba con `dev/e2e.mjs`.

**Objetivo:** legiones de verdad (crear, unirse con código, título bajo el nombre, todo lo de Legión separado por legión), un perfil por persona ("login" dentro de claude.ai) y quitar los reinicios de "Busco grupo para".

**Spec:** diseño aprobado en el chat del 11/10/2026 (respuestas: crear y unirse; con código de invitación; perfil con nombre en el juego, personaje principal, servidor y facción, frase; todo lo de Legión solo para tu legión).

## Restricciones globales
- Sin enlaces externos. Despliegue, cuentas reales y pagos: al final.
- Datos:
  - `members/{uid}`: añade `profile: {nick, mainCharId, server, faction, bio}` y `legionId` (id de la legión = uid del líder).
  - `legions/{leaderUid}`: `{name, codeHash, banned: [uid], createdAt}`. Reglas: `legions` lee view / escribe owner; `legions/{self}` escribe interact (solo el líder escribe la suya).
  - Código en claro solo para el líder: `data/users/{uid}/legion` → `{code}` (privado por defecto).
  - Calendario y muro por legión: `legionData/{legionId}/calendar`, `legionData/{legionId}/wall` (reglas por defecto).
- Tiempo real: `room.join('lg-' + sha256(legionId)[0:16])` para presencia y `lfg` / `lfg-reply`.
- Límite conocido: dentro de claude.ai el código y la expulsión se comprueban en la página; un servidor propio lo hará seguro al desplegar.
- Suscripciones propias: 13 + `legions` = 14 → `MAX_OTHERS = 64 - 14`.

### Task 1: Lógica pura de legiones y perfil
Files: `legion.js` (nuevo), `legion.test.js` (nuevo).
- `makeCode(rand = Math.random)` → 8 caracteres de `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- `normalizeCode(s)` → mayúsculas, sin espacios ni guiones; `null` si no son 8 caracteres válidos.
- `hashCode(code)` → Promise del sha256 hex de `'odyle:' + code`.
- `roomName(legionId)` → Promise de `'lg-' + sha256(legionId).slice(0, 16)`.
- `parseLegionName(s)` → `{ok, value|error}`; 3–24 caracteres tras recortar.
- `parseProfile({nick, server, bio, faction, mainCharId}, charIds)` → `{ok, value|error}`; nick 2–20, server ≤ 20, bio ≤ 80, facción elyos|asmodian, mainCharId en charIds o null.
- `legionOf(memberDoc, legions)` → la legión válida del miembro o null (existe y no está en `banned`).
- `sameLegion(memberData, myUid, legions)` → ids de los otros miembros de mi legión.
- `legionTitle(legion, uid)` → `‹Nombre›` o `Líder · ‹Nombre›`.
Test: `node --test legion.test.js` → todo pasa.

### Task 2: "Busco grupo para" sin reinicios
`fillLfgActivities` excluye `daily` y `weekly`. e2e: comprobar que las opciones no contienen "Reinicio".

### Task 3: Perfil
- Tarjeta de perfil en la cabecera (icono de clase del principal, nombre, título de legión); abre la ventana de perfil.
- Ventana "Tu perfil" (mismo estilo que añadir personaje): campos del perfil; guardar → `members/{uid}.profile` con `update`; la facción del perfil aplica el tema y guarda `prefs.faction`.
- Primera visita (con datos cargados, sin perfil y con permiso de escritura): se abre sola una vez por carga.
- `nameOf(uid)` usa `profile.nick` antes que el nombre de la cuenta.

### Task 4: Legiones
- Sección Legión, panel "Tu legión":
  - Sin legión: "Crear legión" (nombre) y "Unirme con código".
  - Con legión: nombre y título; líder: código (ver, copiar, nuevo), renombrar, expulsar por miembro, disolver; miembro: salir.
- Crear: `legions/{me}.set`, `data/users/{me}/legion.set({code})`, `members/{me}.update({legionId: me})`.
- Unirse: `hashCode` → `where('codeHash','==',h)` → si no estoy en `banned` → `members/{me}.update({legionId})`.
- Suscripción a `legions` (colección entera) y lectura del código privado del líder al mostrarlo.

### Task 5: Todo lo de Legión solo para tu legión
- Personajes de otros, resumen "listos para mazmorra", ranking: solo `sameLegion`.
- Calendario y muro en `legionData/{id}/…`; se re-suscriben al cambiar de legión.
- En línea y Busco grupo en la sala de la legión (`room.join`), sin legión se ocultan con un aviso.
- Sin legión: calendario, muro y ranking ocultos.

### Task 6: Traducciones, revisión, pruebas, publicación
- Cadenas nuevas en en/it/pt; `node --test` y `node dev/e2e.mjs` en verde (e2e ampliado: perfil, crear, unirse con código desde un segundo usuario simulado, título, alcance, expulsión, salir).
- Revisión final por un agente; arreglos.
- Publicar con reglas nuevas (`legions`, `legions/{self}`); copiar a Prova.
