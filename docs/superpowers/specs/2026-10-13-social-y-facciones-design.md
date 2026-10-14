# Amigos, chat, búsqueda de perfiles y tema por facción — Diseño

_Fecha: 2026-10-13 · Estado: pendiente de revisión del usuario · Rama: `feat/social-y-facciones`_

## 1. Objetivo y alcance

Convertir Odyle en una web y una app (PWA) siempre activa para **cualquier jugador de Aion 2**, con:

1. **Amigos:** pedir, aceptar, rechazar, cancelar, eliminar, bloquear.
2. **Chat en vivo** 1 a 1, **solo entre amigos**, con invitaciones a grupo.
3. **Búsqueda de perfiles** por nombre de jugador.
4. **Estética de Aion 2 con dos temas:** Elyos (claro) y Asmodian (oscuro), que **cada usuario elige libremente**.
5. **La energía como orbe de éter con runas y efectos** (se recupera y amplía `orb.js`).

**Fuera de alcance:** la versión artifact de claude.ai (sigue igual), chats de grupo (la legión ya tiene muro), apps nativas en tiendas, notificaciones push, adjuntos e imágenes en el chat, y el despliegue (va después, en su propio paso).

### Lo que decidió el usuario (2026-10-13)

| Tema | Decisión |
|---|---|
| Chat | En vivo real |
| Búsqueda | Visible por defecto; la energía solo la ven los amigos; cada uno puede ocultarse |
| Quién escribe | Solo amigos aceptados |
| Versión | Solo la web |
| Técnica en vivo | Opción A: SSE + `LISTEN/NOTIFY` de Postgres |
| Facciones | Elyos claro, Asmodian oscuro |
| Elección de tema | Botón libre (no ligado a la facción del perfil) |
| Energía | Orbe de éter con runas y efectos |

### Lo que fijé yo (se puede cambiar en la revisión)

- Los mensajes se guardan **1 año** y luego se borran solos.
- El chat es **solo 1 a 1**.
- Tema por defecto la primera vez: el de la facción del perfil; si no hay, Elyos.

## 2. Arquitectura

```
Navegador ── GET /api/stream (EventSource, cookie de sesión) ◄── eventos en vivo
    │
    ├── POST /api/messages/:uid, /api/friends/... (fetch, CSRF actual)
    ▼
Fastify 5 ──► rutas nuevas: profiles · friends · blocks · messages · reports · stream
    │            │
    │            └─► lib/social-rules.js (¿son amigos? ¿bloqueado? ¿visible?)
    ▼
PostgreSQL ── tablas: friendships · blocks · messages · reports
    │
    └── NOTIFY odyle_events ──► lib/bus.js (LISTEN) ──► conexiones SSE abiertas del destinatario
```

- **`lib/bus.js`**: un bus de eventos con dos implementaciones e interfaz común (`publish(userId, event)`, `subscribe(userId, fn) → unsubscribe`):
  - `PgBus`: usa `LISTEN odyle_events` / `NOTIFY odyle_events, '<json>'` con una conexión dedicada. Sirve con 1 o varios servidores.
  - `MemoryBus`: en memoria, para los tests (`pg-mem` no tiene `NOTIFY`).
  - La carga útil del `NOTIFY` lleva solo `{to, type, id}`. El suscriptor relee el dato de la base antes de enviarlo, así nunca viaja contenido por el canal y se respeta el límite de 8000 bytes de `NOTIFY`.
- **`lib/social-rules.js`**: funciones puras más consultas (`areFriends`, `isBlocked(a,b)`, `canMessage`, `canSeeEnergy`, `publicProfile`). Las rutas no deciden permisos por su cuenta.
- **Presencia ("en línea")**: un usuario está en línea si tiene al menos una conexión SSE abierta. Solo se avisa a sus amigos aceptados. No se guarda en la base.

## 3. Datos (migración `005_social.sql`)

```sql
create table friendships (
  user_a text not null references users (id) on delete cascade,   -- siempre user_a < user_b
  user_b text not null references users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  requested_by text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_b_idx on friendships (user_b);

create table blocks (
  blocker text not null references users (id) on delete cascade,
  blocked text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table messages (
  id text primary key,                       -- id aleatorio, no secuencial
  sender text not null references users (id) on delete cascade,
  recipient text not null references users (id) on delete cascade,
  kind text not null check (kind in ('text', 'invite')),
  body jsonb not null,                       -- {text} o {title, at, slots, cost}
  created_at timestamptz not null default now(),
  read_at timestamptz,
  client_id text                             -- lo pone el cliente para no duplicar en reintentos
);
create unique index messages_client_idx on messages (sender, client_id) where client_id is not null;
create index messages_pair_idx on messages (least(sender, recipient), greatest(sender, recipient), created_at desc);
create index messages_unread_idx on messages (recipient) where read_at is null;

create table reports (
  id text primary key,
  reporter text not null references users (id) on delete cascade,
  reported text not null references users (id) on delete cascade,
  message_id text references messages (id) on delete set null,
  reason text not null check (reason in ('spam', 'abuse', 'cheating', 'other')),
  note text,
  created_at timestamptz not null default now()
);
```

**Perfil (en `docs`, ruta `members/{uid}`)**: el `profile` actual (`nick`, `server`, `bio`, `faction`, `mainCharId`) gana dos campos validados:

- `searchable` (booleano, por defecto `true`): aparece en Buscar.
- `shareEnergy` (booleano, por defecto `true`): los amigos ven la energía.

La búsqueda consulta `docs` con `parent = 'members'` y `data->'profile'->>'nick' ilike $1 || '%'`. Se añade un índice de expresión sobre `lower(data->'profile'->>'nick')`.

**Tema**: `settings/prefs` gana `theme` ∈ `elyos | asmodian`.

**Retención**: al arrancar y cada 6 h, el servidor borra los mensajes de más de 365 días.

## 4. API

Todas exigen sesión (`requireUser`) y las escrituras pasan por el CSRF actual (Origin + `X-Odyle-CSRF` + JSON). Los ids se validan con `UID_RE`. Cada ruta tiene su límite por usuario.

| Método y ruta | Qué hace | Límite |
|---|---|---|
| `GET /api/profiles/search?q=` | Hasta 20 perfiles `searchable`, sin los bloqueados en ningún sentido ni uno mismo. `q`: 2–20 caracteres. | 30/min |
| `GET /api/profiles/:uid` | Perfil público. Si son amigos y `shareEnergy`: también los personajes con su energía. | 60/min |
| `GET /api/friends` | Amigos aceptados (con `online`), solicitudes recibidas y enviadas. | 60/min |
| `POST /api/friends/:uid` | Pedir amistad. Si el otro ya te la pidió, se acepta. | 20/min |
| `POST /api/friends/:uid/accept` | Aceptar una solicitud recibida. | 20/min |
| `DELETE /api/friends/:uid` | Rechazar, cancelar o eliminar. | 20/min |
| `POST /api/blocks/:uid` · `DELETE /api/blocks/:uid` | Bloquear (también elimina la amistad) o desbloquear. | 20/min |
| `GET /api/blocks` | Mis bloqueados. | 60/min |
| `GET /api/messages/:uid?before=` | 50 mensajes de la conversación, del más nuevo hacia atrás. | 120/min |
| `POST /api/messages/:uid` | Enviar `{kind:'text', text}` (1–1000 caracteres) o `{kind:'invite', title, at, slots, cost}`. Solo amigos aceptados sin bloqueo. | 30/min |
| `POST /api/messages/:uid/read` | Marcar como leída la conversación. | 120/min |
| `GET /api/conversations` | Lista de conversaciones con el último mensaje y los no leídos. | 60/min |
| `POST /api/reports` | Denunciar `{uid, messageId?, reason, note?}`. | 10/h |
| `GET /api/stream` | SSE. Eventos `message`, `read`, `friend`, `presence`. Latido cada 25 s. Máximo 3 conexiones por usuario. Se cierra cuando caduca el token de acceso. | 10 conexiones/min |

**Respuestas que no filtran información:** para cualquier `:uid` desconocido, bloqueado o que te bloqueó, las rutas de amistad, perfil y mensajes responden `404 {error:'No encontrado.'}`. Así no se puede saber quién te bloqueó ni qué ids existen.

**Reconexión del SSE:** el token de acceso dura 15 min. Al caducar, el servidor cierra el stream. El cliente (`web/social-api.js`) llama a `/api/auth/refresh` y reabre `EventSource`, con espera creciente (1, 2, 4… hasta 30 s). Al reconectar pide `GET /api/conversations` para recuperar lo que llegó mientras tanto.

## 5. Seguridad (se añade al modelo de amenazas como SR-39…SR-48)

- **SR-39** Las rutas sociales solo devuelven campos de una lista blanca: nunca correo, hashes ni datos de otras tablas.
- **SR-40** La energía y los personajes de otro usuario solo se devuelven si hay amistad aceptada, sin bloqueo y con `shareEnergy`.
- **SR-41** No se pueden enviar mensajes sin amistad aceptada; el bloqueo corta todo en ambos sentidos.
- **SR-42** La respuesta para un desconocido, un bloqueado o alguien que te bloqueó es idéntica (código, cuerpo y tiempo aproximado).
- **SR-43** El texto de los mensajes pasa por el mismo saneado que `validate.js` (controles y bidi fuera, máximo 1000) y se pinta siempre con `textContent`.
- **SR-44** El SSE exige sesión válida y no acepta tokens en la URL. Es de solo lectura, no cambia estado. Máximo 3 conexiones por usuario. Se cierra al caducar el token.
- **SR-45** La carga útil de `NOTIFY` no lleva contenido, solo ids. El receptor relee y vuelve a comprobar los permisos.
- **SR-46** Límites por usuario en búsqueda, solicitudes, mensajes y denuncias (tabla de §4).
- **SR-47** Los ids de mensajes y denuncias son aleatorios (no se pueden enumerar).
- **SR-48** Borrar la cuenta borra en cascada amistades, bloqueos, mensajes y denuncias propias.

**Pruebas de ataque nuevas** (`server/test/attacks/`): `social-idor.test.js` (leer mensajes o energía de no amigos), `social-enum.test.js` (respuestas idénticas para desconocido y bloqueado), `social-xss.test.js` (texto con HTML o bidi), `social-sse.test.js` (sin sesión, token caducado, cuarta conexión, CSRF irrelevante en GET), `social-rate.test.js`.

## 6. Dirección visual: Aion 2, dos facciones

Reemplaza la dirección "laca y nácar". La elección del usuario manda sobre la tirada de Impeccable. Se mantiene: estructura de navegación (rail en escritorio, barra inferior en móvil), banda de próxima decisión, fila por personaje y número tabular grande.

**Restricción de marca:** es un sitio de fans. Nada de logos, arte, iconos ni capturas oficiales de NCSOFT. Runas, iconos de clase, alas y orbes son dibujos propios.

| | **Elyos (claro)** | **Asmodian (oscuro)** |
|---|---|---|
| Escena | Cielo al alba sobre las islas flotantes | Crepúsculo eterno, cielo violeta del Abismo |
| Fondo | Azul cielo muy pálido `#EEF3F8`, paneles blancos `#FFFFFF` | Violeta casi negro `#120D17`, paneles `#1D1524` |
| Texto | Azul noche `#14213A` / `#4A5770` | Lavanda claro `#EDE6F2` / `#B5A9C4` |
| Acento | Oro `#A87A1E` (sobre claro, contraste AA) y azul celeste `#2E6FB0` | Violeta `#9B6BD6` y plata `#C9C3D6` |
| Urgente (al tope) | Carmesí `#B4232F` | Carmesí `#E0455A` |
| Orbe | Líquido de luz dorada y celeste; partículas de plumas de luz | Líquido violeta y carmesí; partículas de brasas oscuras |
| Filetes | Oro fino | Plata fina |

- **Letra:** Cinzel (títulos y nombres) + Figtree (texto), ya en `devDependencies` vía `@fontsource` y servidas desde el propio servidor, compatibles con la CSP. Números tabulares.
- **Botón de tema** "Luz / Sombra" en el rail y en Perfil. Cambia `data-faccion` en `<html>`, todos los colores salen de variables CSS por facción, y se guarda en `settings/prefs.theme`. Cambio inmediato, sin animación de página (lo usará a menudo).
- **Energía = orbe de éter** (recupera `orb.js`):
  - un orbe por personaje, con nivel = energía / 840;
  - un anillo de 56 runas propias alrededor (1 runa = 15 OD) que se encienden según la energía;
  - al recibir +15, onda en el líquido y se enciende la runa siguiente;
  - al tope, las runas laten en el color urgente y el orbe brilla;
  - colores según la facción activa (uniformes del shader).
- **Sin WebGL o con "reducir movimiento":** orbe plano en CSS con el mismo anillo de runas en SVG, sin partículas ni animación.
- La dirección se registra como contrato en `.impeccable/surfaces/index-html.md` (sustituye el anterior), y `DESIGN.md` se reescribe al final a partir de lo construido.

## 7. Interfaz (solo versión web)

Pantallas nuevas con el diseño por facción, siguiendo la estructura ya validada en `design/redesign/`:

- **Amigos**: pestañas Amigos / Solicitudes / Enviadas / Bloqueados; en línea primero; orbe pequeño de energía si la comparten.
- **Chat**: lista de conversaciones, hilo, redactor con atajos (compartir mi energía, invitar a mazmorra), tarjeta de invitación, "escribiendo" fuera de alcance (YAGNI).
- **Buscar perfiles**: campo, filtros (servidor, facción, clase), resultados, estado vacío.
- **Perfil de jugador**: ficha pública; energía solo si sois amigos; botones Añadir/Mensaje/Bloquear/Denunciar.
- **Ajustes de privacidad** en Perfil: "Aparecer en Buscar" y "Compartir mi energía con amigos".

Código del cliente en módulos nuevos: `web/social-api.js` (fetch + SSE + reconexión), `friends.js`, `chat.js`, `search.js` (lógica pura testeable con `node --test`) y sus vistas. Todo con `textContent` y APIs del DOM, sin `innerHTML`.

## 8. Errores y casos límite

- Mensaje a alguien que te elimina mientras escribes → `404`; el hilo muestra "Ya no sois amigos" y desactiva el redactor.
- SSE caído → indicador discreto "Reconectando…"; los mensajes enviados se guardan igualmente por `POST`.
- Mensaje duplicado por reintento → el cliente manda un `clientId` (único por remitente) y el servidor devuelve el mensaje ya guardado en vez de crear otro.
- Base de datos saturada → `503` como ya hace la app; el cliente reintenta.
- Los dos se piden amistad a la vez → la segunda petición acepta la primera.

## 9. Pruebas

- **Servidor:** unitarias de `social-rules`, rutas con `pg-mem` y `MemoryBus`, y la suite de ataques nueva. Además, la batería actual contra PostgreSQL real (`scripts/test-pg.sh`), que también prueba `PgBus`.
- **Cliente:** `node --test` para la lógica pura (orden de conversaciones, reconexión, colores por tema).
- **E2E:** `dev/e2e-web.mjs` ampliado con dos usuarios: buscar, pedir y aceptar amistad, chatear en vivo, bloquear, y cambiar de tema.
- **Diseño:** capturas en escritorio y móvil para cada facción, y el detector y la revisión final de Impeccable.

## 10. Orden de trabajo

1. Datos, `social-rules`, amigos, bloqueos, perfiles y búsqueda (con tests).
2. Bus, SSE, mensajes, conversaciones, denuncias y retención (con tests).
3. Sistema visual por facción, orbe con runas y botón de tema.
4. Pantallas de Amigos, Chat, Buscar, Perfil y privacidad.
5. E2E, revisión de seguridad y revisión final de diseño.

Después: integrar el resto de la app en el nuevo diseño, hacerla PWA y desplegar en Render.
