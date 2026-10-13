# Modelo de amenazas — Etapa 1 (servidor, cuentas JWT, datos y legiones)

_Fecha: 11/10/2026 · Autor: agente de seguridad · Base: `docs/superpowers/specs/2026-10-11-web-auth-design.md`_

**Para el dueño, en una frase:** el diseño ya cubre lo importante (contraseñas lentas de romper, tokens que el JavaScript no puede leer, CSP estricta, reglas en el servidor). Este documento lista qué puede salir mal en cada pieza, cómo lo frena el diseño, lo que aún queda, y la prueba de ataque que lo demostrará. Los puntos marcados **[Añadido por el agente de seguridad]** son huecos del diseño que el plan debe cerrar.

**Estado actual de la página (revisado):** `index.html` y los módulos no usan `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval` ni `Function(`; pinta con `textContent` (52 usos) y un helper `el()` que usa `setAttribute` con claves fijas del código. Los estilos en línea solo reciben constantes (`CHART_COLORS`, colores de clase). No se usa `location` ni `postMessage`. Riesgos detectados: `legion.js#makeCode` usa `Math.random` (no apto en el servidor); la importación acepta `prefs` y `stats` como objetos libres (el servidor debe validarlos).

---

## 1. Activos

| Activo | Por qué importa |
|---|---|
| Cuentas (`users`: correo, `token_version`, bloqueo) | Suplantación, enumeración de quién juega |
| Contraseñas / `password_hash` (argon2id) | Se reutilizan en otras webs |
| Token de acceso (JWT, 15 min) y de renovación (30 días) | Quien los tenga **es** el usuario |
| Tokens de verificación y de restablecer (correo) | Toma de cuenta |
| Datos de jugadores (`members/{uid}/**`: personajes, notas, perfil) | Privacidad e integridad |
| Datos de legión (`legionData/{clave}/**`: muro, calendario) | Solo para miembros vigentes |
| Códigos de legión (`legion_codes`) | Dan entrada a una legión |
| Secretos del servidor: `JWT_SECRET`, `CODE_KEY`, `RESEND_API_KEY`, `DATABASE_URL` | Con `JWT_SECRET` se fabrican sesiones de cualquiera; con `DATABASE_URL`, toda la base; con `RESEND_API_KEY`, correos de phishing desde nuestro remitente; con `CODE_KEY`, los códigos en claro |
| Disponibilidad (instancia Render pequeña, Postgres) | Un abuso tumba la web para todos |

## 2. Atacantes

| Id | Atacante | Capacidad |
|---|---|---|
| A1 | Visitante anónimo | Llama a cualquier endpoint, scripts, muchas IP |
| A2 | Usuario registrado malicioso | Sesión válida; manipula peticiones a mano |
| A3 | Miembro de otra legión | Sesión válida, sin pertenencia a la legión víctima |
| A4 | Ex-miembro expulsado | Conoce el código antiguo, tiene la página abierta |
| A5 | Atacante con XSS | Ejecuta JS en nuestro origen (si la CSP fallara) |
| A6 | Atacante de red / web ajena | Web maliciosa que visita la víctima (CSRF), Wi-Fi hostil |
| A7 | Alguien con una copia de la base | Copia de seguridad filtrada, acceso a Postgres |

## 3. Superficie

- **Auth:** `POST /api/auth/register`, `login`, `refresh`, `logout`, `logout-all`, `verify`, `forgot`, `reset`; `GET /api/auth/me`.
- **Docs:** `GET|PUT|PATCH|DELETE /api/docs/<ruta>` con reglas (`members/{uid}`, `members/{uid}/**`, `members/{uid}/settings/schedule`, `legions/{id}`, `legionData/{clave}/**`, `feedback/{uid}`, resto denegado); `GET` de colección con `where`, `orderBy`, `limit ≤ 200`.
- **Legiones:** `POST /api/legions` (crear), `join`, `GET code`, `new-code`, `rename`, `kick`, `leave`, `dissolve`.
- **Páginas estáticas:** `/`, `/login`, `/registro`, `/verificar`, `/restablecer`, `app.js`, `app.css`, `vendor/three*`, `claude-shim.js`, `auth.js`.
- **Importar:** archivo JSON exportado de claude.ai → escrituras en `/api/docs`.
- **Infra:** Render (proxy TLS, variables de entorno, logs), Postgres, Resend, dependencias npm, Google Fonts.

## 4. Amenazas (STRIDE) por componente

Formato: **amenaza → defensa del diseño → riesgo residual → prueba** (todas en `server/test/attacks/`). S=suplantación, T=manipulación, R=repudio, I=fuga de información, D=denegación de servicio, E=elevación de privilegios.

### 4.1 XSS y cabeceras (página estática, todos los campos de texto)

| STRIDE | Amenaza | Defensa del diseño | Residual | Prueba |
|---|---|---|---|---|
| T/E | XSS almacenado vía nick, bio, notas, nombre de personaje, muro, calendario, nombre de legión, archivo importado (`<img onerror>`, `"><svg onload>`) | Pintado con `textContent`; CSP sin `unsafe-inline`; Trusted Types `'none'`; validación de longitud | Bajo. Un cambio futuro que use un sumidero HTML rompería la página (TT lo bloquea) en vez de ejecutar | `xss-stored.test.js` |
| T | XSS DOM: datos de usuario en `href`/`src` (`javascript:`) o en `style` vía `el()` | CSP bloquea `javascript:`; TT | CSS injection posible si un día se pasa texto de usuario a `style` (`style-src-attr 'unsafe-inline'`) | `xss-dom-sinks.test.js` (análisis estático del `app.js` construido) |
| E | Saltar la CSP con un recurso propio servido como script: `<script src="/api/docs/...">` cuyo JSON sea JS válido (p. ej. un array), o un archivo subido servido desde `'self'` | API solo JSON; `nosniff`; no hay subida de archivos | Si alguna respuesta propia saliera con tipo JS/HTML o sin `nosniff` | `csp-bypass.test.js` |
| I | Clickjacking | `frame-ancestors 'none'` | — | `headers.test.js` |
| T | Fuentes de Google comprometidas (CSS externo) | Solo `style-src`/`font-src` de Google | CSS externo puede filtrar datos por selectores | `headers.test.js` comprueba la CSP exacta |

### 4.2 JWT y sesión

| STRIDE | Amenaza | Defensa | Residual | Prueba |
|---|---|---|---|---|
| S | `alg: none`, `alg: RS256` con la clave como pública (confusión), firma cambiada, `exp` pasado, `iss`/`aud` ajenos, `sub` inexistente | `jose` con `algorithms:['HS256']`, `iss`, `aud` fijos | Bajo | `jwt-tampering.test.js` |
| S | Secreto débil o por defecto | 256 bits aleatorios | Que `config.js` acepte un valor corto | `config-secrets.test.js` |
| S | JWT viejo tras "cerrar todas" o cambio de contraseña | `ver` = `token_version` | La caché de 30 s contradice "al momento" | `jwt-tampering.test.js` (ver antiguo) |
| S/D | Reutilizar un token de renovación robado | Rotación + reutilización ⇒ revocar familia | Ninguno si se detecta | `refresh-rotation.test.js` |
| D | **Dos pestañas renuevan a la vez**: la segunda presenta el token recién usado ⇒ se revoca la familia y el usuario sale sin culpa | Ninguna | **Alto (falso positivo de robo)** | `refresh-race.test.js` |
| T | Dos peticiones simultáneas con el mismo token crean dos sucesores | — | Doble emisión si no es atómico | `refresh-race.test.js` |
| I | Robo de cookie por red o por JS | `HttpOnly; Secure`; `__Host-`/`__Secure-`; HSTS | — | `cookies.test.js` |
| S | Fijación de sesión (cookies plantadas antes del login) | Prefijos `__Host-` impiden plantar desde subdominios | — | `cookies.test.js` |

### 4.3 CSRF y redirecciones

| STRIDE | Amenaza | Defensa | Residual | Prueba |
|---|---|---|---|---|
| T | CSRF en escrituras (formulario o `fetch` desde otra web) | `SameSite`, `Origin == APP_ORIGIN`, cabecera `X-Odyle-CSRF: 1` | Fastify acepta por defecto `text/plain`; si falta `Origin` y se acepta, queda hueco | `csrf.test.js` |
| S | **Login CSRF** (la víctima queda dentro de la cuenta del atacante y guarda allí sus datos) | Mismas comprobaciones en `/login` y `/register` | Bajo si se aplican también sin cookie | `csrf.test.js` |
| D | Logout CSRF / logout-all forzado | Mismas comprobaciones | — | `csrf.test.js` |
| S | **Redirección abierta** en "volver a la ruta tras entrar" (`/login?next=//evil.com`, `/\evil.com`, `https:…`, `javascript:`) | No especificada | **Medio** (phishing con nuestro dominio) | `open-redirect.test.js` |

### 4.4 Cuentas: registro, login, verificación, restablecer

| STRIDE | Amenaza | Defensa | Residual | Prueba |
|---|---|---|---|---|
| I | Enumeración por mensajes en register/forgot/login | Respuesta igual | El mensaje "cuenta bloqueada temporalmente" solo aparece para cuentas reales; un "ya registrado" en modo `owner-only` | `enumeration.test.js` |
| I | Enumeración por tiempo (argon2 solo si existe; enviar correo solo si existe) | argon2 con hash ficticio en login | `register` y `forgot` tardan más si existe (envío síncrono a Resend) | `enumeration.test.js` (mediana de tiempos) |
| S | Fuerza bruta / relleno de credenciales | 5/min IP+correo, 30/h IP, bloqueo tras 10 fallos, lista de 10 000 | Botnets con muchas IP; el bloqueo por cuenta permite **bloquear a la víctima a propósito** (D) | `bruteforce.test.js` |
| S | Falsear la IP con `X-Forwarded-For` para saltar límites | No especificado | **Alto** si `trustProxy: true` | `bruteforce.test.js` (XFF variable) |
| I | Fuga del token de restablecer/verificar por `Referer`, historial o **logs de Render** (la URL completa se registra) | `Referrer-Policy: strict-origin-when-cross-origin` | Token en la query llega a logs | `reset-token.test.js` |
| S | Token de restablecer reutilizado, caducado o de otro tipo (`verify` usado como `reset`) | Hash, 30 min/24 h, un uso, `kind` | — | `reset-token.test.js` |
| S/E | Saltarse la verificación; en `owner-only` cualquiera registra **el correo de otro**, incluido `ADMIN_EMAIL` ⇒ lee todo `feedback` | `EMAIL_MODE` | **Alto** (admin por correo sin verificar) | `verification.test.js` |
| D | Abuso de argon2 (19 MiB por cálculo) con muchas peticiones ⇒ sin memoria | Límites por IP | Concurrencia sin tope | `dos-limits.test.js` |

### 4.5 Almacén de documentos `/api/docs`

| STRIDE | Amenaza | Defensa | Residual | Prueba |
|---|---|---|---|---|
| E | **Asignación masiva**: escribir `legionId`/`legionEpoch` con PUT/PATCH en `members/{yo}`; PUT que borra esos campos | "Solo los endpoints de legión" | Debe aplicarse también a PUT (sustituye) y a importar | `docs-mass-assignment.test.js` |
| E | Escribir en `members/{otro}/**` o en `members/{otro}/settings/schedule` | `rules.js` | — | `docs-idor.test.js` |
| I | IDOR de lectura: `GET members/{otro}` de otra legión; **listar la colección `members`** completa | Reglas por documento | Si la colección se lista y se filtra después del `limit`, o con `where` como oráculo | `docs-idor.test.js` |
| E | Rutas: `..`, `.`, `%2e%2e`, `%2F` dentro de un segmento, doble codificación, `\`, segmentos vacíos `//`, profundidad 1000, segmentos de 10 KB, `\u0000` | Caracteres permitidos y profundidad máxima | Orden de decodificar/validar no especificado | `docs-paths.test.js` |
| T | **Contaminación de prototipo** en el PATCH (fusión profunda) con claves `__proto__`, `constructor`, `prototype` | No especificado | **Alto**: puede alterar objetos de todo el proceso (p. ej. dar `isAdmin` a todos) | `docs-prototype-pollution.test.js` |
| D | JSON enorme, anidamiento profundo, millones de claves; `\u0000` en texto (Postgres `jsonb` lo rechaza ⇒ 500) | 64 KB por documento | Sin tope de profundidad ni de cuota por usuario | `dos-limits.test.js` |
| D | `where`/`orderBy` sobre campos arbitrarios, `limit` enorme | `limit ≤ 200` | Campos y operadores sin lista blanca | `dos-limits.test.js` |
| T | Suplantar al autor en muro/calendario (`author` en el cuerpo); **editar** (PUT/PATCH) el mensaje de otro | Solo borrar el autor | Editar no está cubierto | `legion-authz.test.js` |
| R | Negar haber escrito un mensaje | Autor fijado por el servidor | Sin registro de auditoría (aceptado en etapa 1) | `legion-authz.test.js` |

### 4.6 Legiones `/api/legions`

| STRIDE | Amenaza | Defensa | Residual | Prueba |
|---|---|---|---|---|
| E | No-líder llama a `code`, `new-code`, `rename`, `kick`, `dissolve` | Comprobación en el servidor | — | `legion-authz.test.js` |
| I | **Expulsado sigue leyendo** `legionData` y `members` de la legión (página abierta, sondeo cada 30 s) | Pertenencia comprobada en el servidor | Si la pertenencia se cachea | `legion-authz.test.js` |
| E | Expulsado vuelve a entrar con el código antiguo | No especificado | **Medio** | `legion-codes.test.js` |
| S | Fuerza bruta del código (31⁸ ≈ 8,5·10¹¹) | Comprobación en servidor | Sin límite de `join` definido | `legion-codes.test.js` |
| I | Con una copia de la base, romper `code_hash` (SHA-256 de 8 caracteres se prueba entero en horas con GPU) | AES-GCM con `CODE_KEY` para `code_enc` | **Medio**: el hash simple es reversible por fuerza bruta | `legion-codes.test.js` |
| T | Intercambiar `code_enc` entre legiones; nonce repetido en AES-GCM | — | Sin AAD ni nonce aleatorio especificado | `legion-codes.test.js` |
| T | Códigos predecibles (`Math.random`) | — | `legion.js#makeCode` usa `Math.random` | `legion-codes.test.js` |
| T | Líder hace `leave` dejando la legión sin líder; unirse a dos legiones; carreras join/dissolve | — | Estados incoherentes | `legion-authz.test.js` |
| T | Nombre de legión con caracteres de control o `U+202E` (suplantación visual) | 3–24 caracteres | Bidi/control | `xss-stored.test.js` |

### 4.7 Importar

| STRIDE | Amenaza | Defensa | Residual | Prueba |
|---|---|---|---|---|
| T/E | Archivo con XSS, `legionId`, rutas con `..`, `__proto__`, `prefs`/`stats` gigantes, 100 000 personajes | Mismas reglas y validación | La página solo valida `characters`; `prefs`/`stats` van libres | `import-abuse.test.js` |

### 4.8 Infraestructura, registros y cadena de suministro

| STRIDE | Amenaza | Defensa | Residual | Prueba |
|---|---|---|---|---|
| I | Secretos, cookies, contraseñas o tokens en logs (logger de Fastify registra URL y cabeceras si se configura) | "Sin datos personales ni secretos" | Falta redacción explícita | `logging-secrets.test.js` |
| I | Archivos no previstos servidos (`.env`, `server/src`, `*.map`, `package.json`, listado de carpetas) | `@fastify/static` en `server/public` | Configuración por defecto | `static-files.test.js` |
| I | Errores con traza o SQL | "Errores sin trazas" | — | `error-leak.test.js` |
| T | Dependencia npm comprometida o con fallo conocido | — | Sin política | CI: `npm ci` + `npm audit --omit=dev` |
| I | Secretos en `render.yaml` del repositorio, en entornos de vista previa o compartidos con colaboradores | "Solo en Render" | — | `config-secrets.test.js` + revisión |
| I | Postgres accesible desde Internet; conexión sin TLS | — | Render permite conexión externa por defecto | Revisión manual de Render |
| I/D | Copias de seguridad: la base gratuita caduca y no tiene copias; una copia filtrada expone correos y hashes | — | Alto en plan gratuito (pérdida de datos) | Revisión manual |
| D | HTTP sin TLS | HSTS | Primera visita | `headers.test.js` (redirección por `x-forwarded-proto`) |

### 4.9 Social y tiempo real (`/api/profiles`, `/api/friends`, `/api/blocks`, `/api/messages`, `/api/conversations`, `/api/reports`, `/api/stream`)

| Amenaza (STRIDE) | Ejemplo | Mitigación |
|---|---|---|
| Revelación (I) | Leer la energía o los mensajes de alguien que no es tu amigo cambiando el uid | Reglas en `social-rules.js`; energía solo con amistad + `shareEnergy` (SR-40, SR-41) |
| Revelación (I) | Saber si alguien te bloqueó o si un uid existe por la respuesta | Respuesta 404 idéntica para desconocido, bloqueado y "me bloqueó" (SR-42) |
| Manipulación (T) | Mensaje con HTML, controles o marcas bidi | `cleanText` + pintado con `textContent` + CSP (SR-43) |
| Suplantación (S) | Abrir el stream de otro con un token en la URL o caducado | Solo cookie de sesión; cierre al `exp`; 3 conexiones máx.; la 4.ª cierra la más antigua (SR-44) |
| Revelación (I) | Contenido de mensajes en el canal `NOTIFY` o entregado tras perder la amistad | `NOTIFY` solo con ids; el receptor relee y vuelve a comprobar (SR-45) |
| Denegación (D) | Spam de solicitudes, mensajes, búsquedas o conexiones | Límites por usuario y máximo de 50 solicitudes pendientes (SR-46) |

**Riesgos residuales (4.9)**
- Un stream abierto sigue entregando eventos hasta que caduca su token de acceso (≤ 15 min) tras un restablecimiento de contraseña o un logout; el cierre al `exp` acota la ventana, pero no la elimina.
- Los compañeros de legión conservan su visibilidad actual de miembros y personajes en `/api/docs`, independiente de `shareEnergy` y de los bloqueos sociales: la visibilidad de legión es un mecanismo aparte.

## 5. Requisitos de seguridad

Cada requisito es comprobable; entre corchetes, las amenazas (secciones) que cubre.

**XSS y cabeceras**
- **SR-1** La CSP del diseño se envía en todas las respuestas HTML exactamente como está escrita; además `X-Frame-Options: DENY`. [4.1]
- **SR-2** Ningún archivo de `server/public` contiene `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `setTimeout(string)`, y ningún dato de usuario llega a `style`, `href`, `src` u `on*` (excepto Three.js vendorizado, revisado). [4.1]
- **SR-3** Todas las respuestas llevan `X-Content-Type-Options: nosniff`; la API responde solo `application/json; charset=utf-8` y `Cross-Origin-Resource-Policy: same-origin`; nunca se sirve contenido del usuario como archivo. [4.1]
- **SR-4** Textos del usuario: se eliminan caracteres de control y de dirección bidi (`U+202A–202E`, `U+2066–2069`) y `\u0000`; longitudes según `validate.js`. [4.1, 4.5, 4.6] **[Añadido por el agente de seguridad]**
- **SR-5** Fuentes servidas desde el propio origen; la CSP queda sin orígenes externos. [4.1] **[Añadido por el agente de seguridad — recomendado]**

**JWT y sesión**
- **SR-6** `jwtVerify` con `algorithms:['HS256']`, `issuer`, `audience`, `exp` obligatorio, tolerancia ≤ 5 s, `sub` con formato `u_` + 22. [4.2]
- **SR-7** `config.js` falla al arrancar si `JWT_SECRET` o `CODE_KEY` no tienen ≥ 32 bytes decodificados, si falta cualquier variable o si `EMAIL_MODE` no es `owner-only|full` (sin valor por defecto). [4.2, 4.8]
- **SR-8** Al subir `token_version` la caché de `ver` se invalida en el acto; un JWT con `ver` antiguo recibe 401 en la petición siguiente. [4.2] **[Añadido por el agente de seguridad]**
- **SR-9** El consumo del token de renovación es atómico (`UPDATE … SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL RETURNING`). [4.2] **[Añadido por el agente de seguridad]**
- **SR-10** Carrera de pestañas: (a) el cliente renueva en vuelo único (`navigator.locks.request('odyle-refresh')`; al obtener el candado, primero reintenta con la cookie ya renovada); (b) en el servidor, presentar el token **inmediatamente anterior** dentro de una ventana de gracia de 20 s tras su uso no revoca la familia: emite un nuevo sucesor (o 409 "ya renovado") sin invalidar el vigente. Fuera de la ventana, o un token más antiguo, revoca la familia. [4.2] **[Añadido por el agente de seguridad]**
- **SR-11** Cookies exactamente como en el diseño (`__Host-odyle_at` con `Path=/` sin `Domain`; `__Secure-odyle_rt` con `Path=/api/auth`), ambas `HttpOnly; Secure`; el login crea siempre una familia nueva y descarta la anterior; logout borra ambas. [4.2]

**CSRF y redirecciones**
- **SR-12** Todo método distinto de GET/HEAD/OPTIONS, **con o sin sesión** (incluidos login, register, forgot, reset, refresh, logout): 403 si `Origin` falta o difiere de `APP_ORIGIN`, o si falta `X-Odyle-CSRF: 1`. [4.3]
- **SR-13** Solo se acepta `Content-Type: application/json`; cualquier otro (incluido `text/plain`, formularios) ⇒ 415. Se elimina el parser `text/plain` por defecto de Fastify. [4.3] **[Añadido por el agente de seguridad]**
- **SR-14** El destino tras entrar solo admite `/` más un fragmento `^#[a-z0-9-]{0,32}$`; cualquier otro valor (`//`, `/\`, esquemas, otro origen) se ignora y va a `/`. Se valida en `auth.js` y en el servidor si este redirige. [4.3] **[Añadido por el agente de seguridad]**

**Cuentas**
- **SR-15** register, forgot y login devuelven el mismo código y cuerpo exista o no el correo; register con correo existente calcula igualmente un argon2 y no inicia sesión; el bloqueo por cuenta se cuenta por correo (exista o no) para que el 429 no delate cuentas. [4.4] **[Añadido por el agente de seguridad (parte del bloqueo)]**
- **SR-16** El envío de correos (Resend) se hace fuera de la respuesta (cola en memoria), de modo que la diferencia de mediana de tiempos entre correo existente e inexistente sea < 50 ms en 30 muestras. [4.4] **[Añadido por el agente de seguridad]**
- **SR-17** Límites del diseño aplicados, más `join` de legión: 10/h por usuario y 30/h por IP; escrituras en `/api/docs`: 300/min por usuario. Se registra (sin datos personales) cuando se bloquea una cuenta. [4.4, 4.6] **[Añadido por el agente de seguridad (join y escrituras)]**
- **SR-18** `trustProxy` = número exacto de saltos de Render (1), nunca `true`; las claves de límite usan `request.ip`. Cambiar `X-Forwarded-For` no reinicia los contadores. [4.4, 4.8] **[Añadido por el agente de seguridad]**
- **SR-19** Los enlaces de verificar y restablecer llevan el token en el **fragmento** (`/restablecer#t=…`), que no llega al servidor ni a los logs; `auth.js` lo envía por POST y lo borra con `history.replaceState`. Las páginas de auth envían `Referrer-Policy: no-referrer` y `Cache-Control: no-store`. [4.4] **[Añadido por el agente de seguridad]**
- **SR-20** Tokens de correo: 32 bytes de `crypto.randomBytes`, solo SHA-256 en la base, un uso, caducidad, `kind` comprobado; reset sube `token_version`, revoca familias y marca el correo como verificado. [4.4]
- **SR-21** El administrador se identifica por `ADMIN_USER_ID` (no por correo), o por `ADMIN_EMAIL` **solo** con `email_verified_at` no nulo; en `owner-only` nadie es admin por correo. Al pasar a `full`, las cuentas sin verificar no pueden entrar hasta verificar. [4.4] **[Añadido por el agente de seguridad]**
- **SR-22** Como máximo 4 cálculos argon2 simultáneos (semáforo); el resto espera ≤ 2 s o recibe 503. Parámetros argon2id OWASP (m = 19 MiB, t = 2, p = 1). [4.4]

**Documentos**
- **SR-23** Rutas: se parte la ruta **cruda** por `/`, se decodifica cada segmento una sola vez y se valida con `^[A-Za-z0-9_\-.~:@+]{1,128}$`, rechazando `.`, `..`, segmentos vacíos, `%` tras decodificar, longitud total > 512 y profundidad > 6. Primer segmento en lista blanca. [4.5]
- **SR-24** En `members/{uid}`, PUT y PATCH rechazan con 400 un cuerpo que incluya `legionId`, `legionEpoch` u otro campo reservado, y PUT conserva los valores actuales de esos campos. Esquemas `zod` estrictos (`.strict()`) por colección: campos desconocidos ⇒ 400. [4.5, 4.7]
- **SR-25** La fusión de PATCH rechaza (400) cualquier clave `__proto__`, `constructor` o `prototype` a cualquier profundidad, y trabaja con objetos `Object.create(null)`; se mantienen `onProtoPoisoning`/`onConstructorPoisoning: 'error'` de Fastify. [4.5] **[Añadido por el agente de seguridad]**
- **SR-26** Límites: `bodyLimit` 8 KB en auth, 64 KB en docs, 512 KB en importar; profundidad JSON ≤ 8; ≤ 500 claves por documento; cuota ≤ 2 MB y ≤ 500 documentos por usuario. [4.5, 4.7] **[Añadido por el agente de seguridad (profundidad y cuota)]**
- **SR-27** Consultas: `where`/`orderBy` solo sobre campos en lista blanca por colección, operadores `== < <= > >=`, `limit` 1–200; la regla de lectura se aplica **en SQL antes** del `limit`; listar `members` devuelve solo el propio documento y los de la legión vigente. [4.5] **[Añadido por el agente de seguridad]**
- **SR-28** En `legionData`, el servidor fija `author`/`uid` y `createdAt` desde la sesión, ignorando el cuerpo; editar y borrar solo el autor (borrar también el líder, si se decide). [4.5] **[Añadido por el agente de seguridad (editar)]**

**Legiones**
- **SR-29** `code`, `new-code`, `rename`, `kick`, `dissolve` solo el líder (403 al resto); el líder no puede `kick` a sí mismo ni `leave` sin disolver; un usuario está como mucho en una legión; operaciones en transacción. [4.6]
- **SR-30** La pertenencia (legión + época + no expulsado) se lee de la base en cada petición a `legionData` y a `members/*` ajenos; tras `kick`, la siguiente lectura del expulsado recibe 403. [4.6]
- **SR-31** `kick` añade al usuario a la lista de expulsados de esa época **y** rota el código; el expulsado no puede volver con el código antiguo. [4.6] **[Añadido por el agente de seguridad]**
- **SR-32** Códigos con `crypto.randomInt`; `code_hash` = HMAC-SHA256 con una subclave derivada de `CODE_KEY` (no SHA-256 simple); `code_enc` = AES-256-GCM con nonce aleatorio de 12 bytes y AAD = `legion_id`; la comparación se hace por búsqueda del HMAC. [4.6] **[Añadido por el agente de seguridad]**

**Infraestructura**
- **SR-33** Logger con redacción de `req.headers.cookie`, `authorization`, `set-cookie`, cuerpos y query; nunca se registra el cuerpo de auth. Errores 5xx responden `{error:"Error interno"}` sin traza. [4.8]
- **SR-34** `@fastify/static` sirve solo `server/public`, sin `dotfiles`, sin listado, sin `*.map`. [4.8]
- **SR-35** Redirección 301 a HTTPS si `x-forwarded-proto` ≠ `https` (con `trustProxy` de SR-18); HSTS como en el diseño. [4.8]
- **SR-36** `package-lock.json` versionado, `npm ci` en el despliegue, `npm audit --omit=dev` sin fallos altos en CI, versiones fijadas; Three.js vendorizado con su SHA-256 anotado. [4.8] **[Añadido por el agente de seguridad]**
- **SR-37** Secretos solo en el panel de Render (en `render.yaml` con `sync: false`); vistas previas de PR desactivadas o sin secretos de producción; Postgres sin acceso externo (lista de IP vacía) y con TLS. [4.8] **[Añadido por el agente de seguridad]**
- **SR-38** Antes de datos reales: plan de Postgres con copias diarias; las copias exportadas se cifran y nunca se guardan junto a `CODE_KEY`/`JWT_SECRET`; retención definida. [4.8] **[Añadido por el agente de seguridad]**
- **SR-39** Las rutas sociales solo devuelven campos de una lista blanca (`toPublic`, `toMessage`): nunca correo, hashes ni datos internos de la legión. [4.9]
- **SR-40** La energía y los personajes de otro usuario solo se devuelven con amistad aceptada, sin bloqueo y con `shareEnergy`. [4.9]
- **SR-41** No se pueden enviar mensajes sin amistad aceptada; el bloqueo corta perfil, solicitudes, mensajes e historial en ambos sentidos. [4.9]
- **SR-42** Para un uid desconocido, mal formado, bloqueado o que te bloqueó, la respuesta es la misma: `404 {"error":"No encontrado."}`. [4.9]
- **SR-43** Los textos de mensajes y denuncias pasan por `cleanText` (controles y bidi fuera, máximos 1000/500) y el cliente los pinta con `textContent`. Las invitaciones de grupo (`at`) deben caer a ±366 días de ahora. [4.9]
- **SR-44** `/api/stream` exige la cookie de sesión (nunca token en la URL), es de solo lectura, admite 3 conexiones por usuario, se cierra al caducar el token de acceso y también al cerrar el servidor. [4.9]
- **SR-45** La carga útil de `NOTIFY` lleva solo `{to, type, id}`; el servidor relee el dato y vuelve a comprobar los permisos antes de enviarlo. [4.9]
- **SR-46** Límites por usuario: búsqueda 30/min, perfil 60/min, cambios de amistad 20/min, mensajes 30/min, denuncias 10/h, stream 10/min; máximo 50 solicitudes pendientes y 500 amigos (límite de amigos también al aceptar una solicitud). [4.9]
- **SR-47** Los ids de mensajes y denuncias son aleatorios de 256 bits (`randomToken`). [4.9]
- **SR-48** Borrar un usuario borra en cascada sus amistades, bloqueos, mensajes y denuncias; los mensajes caducan a los 365 días. [4.9]

## 6. Pruebas de ataque a escribir (`server/test/attacks/`)

| Archivo | Qué afirma |
|---|---|
| `xss-stored.test.js` | Cargas XSS en nick, bio, servidor, nombre de personaje, notas, muro, calendario, nombre de legión e importación se guardan como texto literal; en e2e no se ejecuta ningún `alert`/marcador; bidi y control eliminados (SR-2, SR-4) |
| `xss-dom-sinks.test.js` | El `app.js`/`auth.js`/`claude-shim.js` construidos no contienen sumideros prohibidos; con Trusted Types activos la página carga sin violaciones de CSP (SR-2) |
| `csp-bypass.test.js` | Todas las respuestas de la API llevan `nosniff`, `application/json` y CORP; ninguna ruta devuelve contenido de usuario con tipo JS/HTML (SR-3) |
| `headers.test.js` | CSP exacta, HSTS, `X-Frame-Options`, COOP, `Referrer-Policy`; HTTP ⇒ 301 HTTPS (SR-1, SR-35) |
| `jwt-tampering.test.js` | `alg:none`, RS256/confusión, firma cambiada, caducado, `iss`/`aud` ajenos, `sub` raro, `ver` antiguo tras logout-all ⇒ 401 (SR-6, SR-8) |
| `config-secrets.test.js` | Arranque falla con secreto corto, variable ausente o `EMAIL_MODE` inválido (SR-7) |
| `refresh-rotation.test.js` | Reutilizar un token antiguo (fuera de gracia) revoca la familia; tras reset/logout-all los tokens de renovación fallan (SR-9, SR-20) |
| `refresh-race.test.js` | Dos renovaciones simultáneas con el mismo token: el usuario sigue con sesión válida; solo un sucesor vigente; reutilización a los 21 s sí revoca (SR-9, SR-10) |
| `cookies.test.js` | Nombres, prefijos, `HttpOnly`, `Secure`, `SameSite`, `Path`; login emite familia nueva; logout borra (SR-11) |
| `csrf.test.js` | POST/PUT/PATCH/DELETE sin `Origin`, con `Origin` ajeno, sin cabecera CSRF ⇒ 403 en login, register, logout, logout-all, refresh, docs y legiones; `text/plain` y formularios ⇒ 415 (SR-12, SR-13) |
| `open-redirect.test.js` | `next` = `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:…`, `%2F%2Fevil.com` acaba en `/` (SR-14) |
| `enumeration.test.js` | Mismas respuestas y tiempos (umbral SR-16) para correo existente/inexistente en register, login, forgot y tras bloqueo (SR-15, SR-16) |
| `bruteforce.test.js` | Límites de login/registro/forgot/join devuelven 429; variar `X-Forwarded-For` no los evita; bloqueo de 15 min tras 10 fallos (SR-17, SR-18) |
| `reset-token.test.js` | Token en fragmento; reutilizado, caducado, de otro tipo o alterado ⇒ rechazo; páginas de auth con `no-referrer` y `no-store`; ningún token aparece en logs capturados (SR-19, SR-20) |
| `verification.test.js` | En `full` no se entra sin verificar; registrar `ADMIN_EMAIL` sin verificar no da acceso a `feedback` en ningún modo (SR-21) |
| `docs-mass-assignment.test.js` | PUT/PATCH/importar con `legionId`/`legionEpoch`/campos desconocidos ⇒ 400 y valores intactos (SR-24) |
| `docs-paths.test.js` | `..`, `.`, `%2e%2e`, `%252e`, `%2F`, `\`, `//`, profundidad 7, segmento 129, longitud 513, `\u0000` ⇒ 400; nunca 500 (SR-23) |
| `docs-prototype-pollution.test.js` | PATCH con `__proto__`, `constructor.prototype`, anidados ⇒ 400; después `({}).polluted === undefined` en el proceso (SR-25) |
| `docs-idor.test.js` | Leer/escribir `members/{otro}` de otra legión, su `settings/schedule`, `feedback/{otro}`, rutas no listadas ⇒ 403; listar `members` solo devuelve lo permitido; `where` no filtra datos ajenos (SR-27) |
| `legion-authz.test.js` | No-líder ⇒ 403 en acciones de líder; expulsado ⇒ 403 en la siguiente lectura; suplantar `author` ignorado; editar/borrar mensaje ajeno ⇒ 403; líder no puede `leave` (SR-28 a SR-30) |
| `legion-codes.test.js` | Código antiguo no vale tras `kick`/`new-code`; `join` limitado; `code_hash` ≠ SHA-256 simple; `code_enc` de otra legión no descifra (AAD); dos cifrados del mismo código difieren (SR-31, SR-32) |
| `import-abuse.test.js` | Importación con XSS, `__proto__`, rutas raras, `prefs` gigantes, 10 000 personajes ⇒ rechazado o recortado según cuota (SR-24 a SR-26) |
| `dos-limits.test.js` | Cuerpos sobre límite ⇒ 413; profundidad 9 ⇒ 400; `limit=10000` ⇒ 400; campo `where` fuera de lista ⇒ 400; 20 logins simultáneos no superan 4 argon2 en paralelo (SR-22, SR-26, SR-27) |
| `logging-secrets.test.js` | Con el logger capturado, tras register/login/refresh/reset no aparecen contraseñas, cookies, tokens ni valores de las variables secretas (SR-33) |
| `static-files.test.js` | `/.env`, `/server/src/app.js`, `/package.json`, `/app.js.map`, `/vendor/` ⇒ 404 (SR-34) |
| `error-leak.test.js` | JSON roto, tipos erróneos y fallos forzados de la base ⇒ respuesta sin traza ni SQL (SR-33) |
| `social-idor.test.js` | C no lee la conversación de A y B; la energía no sale sin amistad; el perfil no expone correo ni campos internos (SR-39, SR-40, SR-41) |
| `social-enum.test.js` | Desconocido, bloqueado y "me bloqueó" dan respuesta idéntica en perfil, amistad, aceptar y mensajes; la búsqueda los omite (SR-42) |
| `social-xss.test.js` | HTML y bidi en mensajes salen limpios y como JSON con CSP (SR-43) |
| `social-sse.test.js` | Token por URL o alterado ⇒ 401; un evento ajeno se filtra al releer (SR-44, SR-45) |
| `social-cascade.test.js` | Borrar un usuario vacía sus filas sociales (SR-48; solo con Postgres real) |

Revisión manual (no automatizable aquí): SR-36 (CI), SR-37 (panel de Render) y SR-38 (copias de seguridad).
