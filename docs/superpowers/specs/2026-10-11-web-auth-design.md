# Energía Odyle como web propia — Etapa 1: servidor, cuentas (JWT) y seguridad

_Fecha: 11/10/2026 · Estado: diseño aprobado en el chat, pendiente de revisión escrita_

## 1. Objetivo
Convertir el tracker en una página web real, fuera de claude.ai, con cuentas propias (correo + contraseña, sesión con JWT) y protegida contra XSS, CSRF, robo de sesión y fuerza bruta. La versión de claude.ai sigue funcionando en paralelo.

**Éxito:** una persona se registra, verifica su correo, entra, importa sus datos exportados desde claude.ai y usa personajes, energía, tareas, eventos, estadísticas, perfil, legiones, calendario y muro. Las pruebas del servidor, la prueba de la página entera y las pruebas de ataque del agente de seguridad pasan.

## 2. Decisiones tomadas (chat del 11/10/2026)
| Tema | Decisión |
|---|---|
| Alojamiento | Render: servicio web Node.js + base de datos Postgres |
| Cuentas | Correo + contraseña, verificación de correo y "olvidé mi contraseña" (correos con Resend) |
| Transición | Se mantienen las dos versiones; los datos pasan con Exportar → Importar |
| Arquitectura | Un servidor sirve la página y la API desde el mismo origen |
| Seguridad | Un agente de seguridad hace el análisis de amenazas, revisa y ataca la web al final |

## 3. Fuera de alcance (etapas siguientes)
- Etapa 2: "En línea" y "Busco grupo" en tiempo real (WebSocket).
- Etapa 3: asistente con IA desde el servidor.
- Etapa 4: dominio propio, avisos push, aviso de cookies/privacidad, aviso "sitio no oficial", PayPal o publicidad.
- Entrar con Google/Discord.

En la etapa 1 la página funciona sin esas piezas: ya está preparada para su ausencia (las oculta).

## 4. Arquitectura
```
Navegador ──HTTPS──> Render: servidor Node.js (Fastify)
                       ├─ /            página (archivos estáticos)
                       ├─ /login, /registro, /verificar, /restablecer
                       ├─ /api/auth/*  cuentas y sesión
                       ├─ /api/docs/*  datos (almacén de documentos con reglas)
                       └─ /api/legions/* operaciones de legión
                     ──> Postgres (Render)
                     ──> Resend (correos)
```
Mismo origen para todo: cookies `SameSite`, sin CORS, CSP con `'self'`.

### Estructura del repositorio
- `server/src/app.js` — construye la app (para pruebas y producción); `server/src/index.js` — arranque.
- `server/src/lib/` — `jwt.js` (firmar/verificar), `passwords.js` (argon2id y lista de contraseñas comunes), `tokens.js` (tokens aleatorios y su hash), `mail.js` (Resend), `rules.js` (quién lee/escribe cada ruta), `validate.js` (límites de tamaño y forma por colección), `config.js` (variables de entorno, falla al arrancar si falta alguna).
- `server/src/routes/` — `auth.js`, `docs.js`, `legions.js`, `pages.js`.
- `server/migrations/001_init.sql`.
- `server/test/` — pruebas del servidor; `server/test/attacks/` — pruebas de ataque del agente de seguridad.
- `web/claude-shim.js` — implementa `window.claude.use('db' | 'user' | 'downloads')` sobre la API; `room` y `sample` devuelven `null`.
- `web/auth.html` + `web/auth.js` — pantallas de entrar, registrarse, verificar y restablecer.
- `scripts/build-web.mjs` — genera `server/public/` a partir de los archivos de la página: saca el `<script>` y el `<style>` en línea a `app.js` y `app.css`, copia Three.js a `vendor/` y cambia su import. La versión de claude.ai se sigue publicando desde los mismos archivos fuente.

### Librerías
Fastify 5, `@fastify/cookie`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/static`, `pg`, `@node-rs/argon2` (binarios precompilados), `jose` (JWT), `zod` (validación). Node 22.

## 5. Cuentas y sesión
### Registro y verificación
- Correo (normalizado a minúsculas, máx. 254) y contraseña de 10 a 128 caracteres que no esté en la lista de las 10 000 más comunes.
- La contraseña se guarda con argon2id (parámetros recomendados por OWASP). Nunca se registra en logs.
- Se envía un enlace de verificación con un token aleatorio de 32 bytes; en la base solo se guarda su SHA-256. Caduca en 24 h y sirve una vez.
- Responder igual exista o no el correo ("Si el correo es válido, te hemos enviado un enlace"), para no revelar quién está registrado.
- No se puede entrar sin verificar el correo (ver «Periodo sin dominio propio»).

### Entrar
- `POST /api/auth/login` comprueba la contraseña con argon2 (con el mismo tiempo de cálculo aunque el correo no exista).
- Al acertar: crea una **familia de renovación** y pone dos cookies.

### Tokens
| | Token de acceso | Token de renovación |
|---|---|---|
| Forma | JWT HS256 (`sub`, `ver`, `iss`, `aud`, `iat`, `exp`) | 32 bytes aleatorios (opaco) |
| Duración | 15 min | 30 días |
| Cookie | `__Host-odyle_at`; `HttpOnly; Secure; SameSite=Lax; Path=/` | `__Secure-odyle_rt`; `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` |
| En la base | — | solo su SHA-256, con familia, caducidad, usado/revocado |

- La verificación del JWT fija el algoritmo (`HS256`), el emisor y la audiencia; el secreto es de 256 bits aleatorios (`JWT_SECRET`).
- `ver` = `token_version` del usuario: "cerrar todas las sesiones" y cambiar la contraseña lo incrementan, y los JWT antiguos dejan de valer al momento (el servidor compara `ver` en cada petición, con caché de 30 s).
- **Rotación:** `POST /api/auth/refresh` marca el token usado y entrega uno nuevo de la misma familia. **Reutilizar un token ya usado** revoca toda la familia y obliga a entrar de nuevo.
- El JavaScript de la página nunca ve los tokens: no hay nada que un XSS pueda leer.
- `POST /api/auth/logout` revoca la familia y borra las cookies; `POST /api/auth/logout-all` sube `token_version` y revoca todas las familias.

### Contraseña olvidada
- `POST /api/auth/forgot` envía un enlace (token de 32 bytes, solo su hash en la base, 30 min, un uso) con la misma respuesta exista o no la cuenta.
- `POST /api/auth/reset` cambia la contraseña, sube `token_version` y revoca todas las sesiones.

### Periodo sin dominio propio
Sin dominio verificado, Resend solo deja enviar correos a la dirección del dueño de la cuenta de Resend. Mientras no haya dominio (etapa 4):
- Variable `EMAIL_MODE=owner-only`: la verificación se salta para todos y "olvidé mi contraseña" queda desactivado (con un mensaje claro). El registro sigue protegido por los «Límites de intentos».
- Con dominio: `EMAIL_MODE=full` activa la verificación obligatoria y la recuperación.

### Límites de intentos
- Entrar: 5 por minuto por IP + correo, y 30 por hora por IP; tras 10 fallos seguidos en una cuenta, espera de 15 min para esa cuenta.
- Registro: 5 por hora por IP. Olvidé la contraseña: 3 por hora por correo y 10 por IP.
- Respuesta `429` con un mensaje en español; el almacén de contadores está en memoria (un solo servidor; documentado como límite al escalar).

### CSRF
Cookies `SameSite` y, en toda petición que no sea GET/HEAD: la cabecera `Origin` debe ser `APP_ORIGIN` y la cabecera `X-Odyle-CSRF: 1` debe estar presente (otra web no puede añadirla sin permiso CORS, que no se concede). Los GET nunca cambian datos.

## 6. Protección contra XSS y cabeceras
- **CSP** (enviada por el servidor en todas las páginas):
  `default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'`
  - Sin `'unsafe-inline'` ni `'unsafe-eval'` para scripts: el script en línea pasa a `app.js`.
  - `style-src-attr 'unsafe-inline'` solo permite atributos `style` (la página los usa para colores y porcentajes); no permite `<style>` inyectados ni ejecutar código.
  - Trusted Types sin políticas: cualquier `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` con texto queda bloqueado por el navegador. La página ya pinta solo con `textContent` y nodos; una prueba lo vigila.
- **Cabeceras:** `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima, `Cross-Origin-Opener-Policy: same-origin`.
- **API:** solo JSON con `Content-Type: application/json; charset=utf-8`; nunca refleja datos en HTML. Errores sin trazas internas.
- **Entrada:** el servidor valida forma y tamaño por colección (`validate.js`) y recorta textos (nombres ≤ 24–60, notas ≤ 500, muro ≤ 280, documentos ≤ 64 KB, rutas con caracteres permitidos y profundidad máxima). Lo que no cumple se rechaza con `400`.

## 7. Datos
### Tablas
- `users(id text pk 'u_'+22 car. aleatorios, email citext unique, password_hash, email_verified_at, token_version int, created_at, failed_logins int, locked_until)`
- `refresh_tokens(id, user_id, family_id, token_hash unique, expires_at, used_at, revoked_at, created_at, user_agent)`
- `email_tokens(id, user_id, kind 'verify'|'reset', token_hash unique, expires_at, used_at)`
- `docs(path text pk, parent text, data jsonb, updated_at bigint)` con índice por `parent`
- `legion_codes(legion_id pk, code_hash, code_enc)` — el código en claro solo cifrado (AES-256-GCM con `CODE_KEY`) para mostrárselo al líder.

### Almacén de documentos (`/api/docs`)
Las mismas rutas que usa hoy la página (`members/{uid}/characters/...`), para que la página apenas cambie.
- `GET /api/docs/<ruta>`: documento o colección (con `where` de igualdad o comparación sobre un campo, `orderBy` y `limit` ≤ 200).
- `PUT` sustituye, `PATCH` fusiona (igual que hoy: objetos se fusionan, listas se sustituyen), `DELETE` borra.
- **Reglas en el servidor (`rules.js`):**
  - `members/{uid}`: leen los de la misma legión y el propio; escribe solo `{uid}`. Los campos `legionId` y `legionEpoch` solo los cambian los endpoints de legión.
  - `members/{uid}/**`: escribe solo `{uid}`; leen el propio y los compañeros de legión.
  - `settings/schedule` (hora de recarga): se guarda por usuario en `members/{uid}/settings/schedule`; el adaptador traduce la ruta, así nadie cambia la hora de otros.
  - `legions/{id}`: leen todos los usuarios con sesión (nombre y época, sin código); solo el servidor escribe.
  - `legionData/{clave}/**`: solo miembros vigentes de esa legión (comprobado en el servidor); borrar un mensaje o cita solo su autor.
  - `feedback/{uid}`: escribe `{uid}`; lee el administrador (`ADMIN_EMAIL`).
  - Cualquier otra ruta: denegada.

### Legiones (`/api/legions`)
Crear, unirse con código, ver el código (líder), código nuevo, renombrar, expulsar, salir y disolver. El código se comprueba en el servidor y las expulsiones se aplican en el servidor: desaparece el límite de la versión de claude.ai.

### Cambios de otros
`onSnapshot` del adaptador: lectura inicial, nueva lectura justo después de cada escritura propia y cada 30 s (pausado con la pestaña oculta). Tiempo real en la etapa 2.

### Importar desde claude.ai
El botón Importar existente envía el archivo exportado; el servidor lo valida con las mismas reglas y lo escribe en tus rutas. Tu legión de claude.ai no se importa (se vuelve a crear o unirse en la web).

## 8. Cambios en la página
- `web/claude-shim.js` se carga antes que la página y define `window.claude`.
- Las acciones de legión de la página pasan por una pequeña interfaz con dos implementaciones: la actual (claude.ai) y la de la API (web).
- Tarjeta de perfil: añade "Cerrar sesión" y "Cerrar todas mis sesiones".
- Sin sesión, `/` redirige a `/login`.

## 9. Despliegue en Render
- Servicio web: `npm run build:web && npm start` en `server/`; base Postgres; las migraciones se aplican al arrancar.
- Variables: `DATABASE_URL`, `JWT_SECRET`, `CODE_KEY`, `APP_ORIGIN`, `RESEND_API_KEY`, `MAIL_FROM`, `EMAIL_MODE`, `ADMIN_EMAIL`. Los secretos se generan aleatorios y solo se guardan en Render.
- Necesita de ti: confirmar el espacio de trabajo de Render y el plan (el gratuito tiene límites y la base gratuita caduca; para uso estable hay que pasar a uno de pago — se consultan los precios en Render antes de crear nada), y una cuenta de Resend con su clave.

## 10. Agente de seguridad
1. **Antes del plan:** escribe `docs/security/threat-model.md` (activos, atacantes, amenazas por cada endpoint y defensa prevista) — lo revisas tú junto al plan.
2. **Durante:** revisa cada tarea de cuentas, tokens, reglas y legiones al terminarla; sus hallazgos se arreglan con una prueba que falle primero.
3. **Al final:** pruebas de ataque en `server/test/attacks/`: XSS en todos los campos de texto (y que la CSP y Trusted Types bloquean ejecución), JWT manipulado (`alg: none`, firma cambiada, caducado, `ver` antiguo), reutilización del token de renovación, CSRF sin cabecera u origen ajeno, fuerza bruta contra los límites, lectura/escritura de datos de otro usuario o de otra legión, enumeración de correos, rutas con `..` y tamaños excesivos.

## 11. Pruebas
- Servidor: `node --test` contra una Postgres de pruebas (en el entorno de desarrollo, `pg-mem`); cuentas, tokens, rotación, reglas, validación, legiones.
- Página: `dev/e2e.mjs` contra el servidor local con una base de pruebas.
- Ataques: §10.3.
- La versión de claude.ai conserva sus pruebas actuales.

## 12. Errores
- La página muestra mensajes claros en español: credenciales incorrectas, cuenta bloqueada temporalmente, correo sin verificar, demasiados intentos, sesión caducada (renueva sola una vez; si falla, vuelve a `/login` conservando la ruta).
- El servidor registra errores sin datos personales ni secretos.
