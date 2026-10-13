# Odyle Tracker — Aion 2

Un tracker de **Energía Odyle** para Aion 2: llevas la cuenta de la energía de cada personaje, planificas en qué gastarla y te organizas con tu legión. Todo desde una sola página, con tema oscuro y dorado.

> **Proyecto de fans, no oficial.** No está afiliado a NCSOFT ni lo respalda NCSOFT. *Aion* y *Aion 2* son marcas de sus respectivos propietarios.

---

## Índice

- [Funciones](#funciones)
- [Dos versiones, un mismo código](#dos-versiones-un-mismo-código)
- [Seguridad](#seguridad)
- [Requisitos](#requisitos)
- [Puesta en marcha local](#puesta-en-marcha-local)
- [Scripts y tests](#scripts-y-tests)
- [Variables de entorno](#variables-de-entorno)
- [Despliegue en Render](#despliegue-en-render)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Documentación](#documentación)

---

## Funciones

**Personajes y energía**
- Un personaje por fila. Para añadir uno, pulsa el botón **+**, que abre una ventana.
- La energía se regenera en tiempo real. Puedes ver cuándo estará llena y los avisos de reinicio diario y semanal.
- Botón **⚡ Gastos**: abre una ventana con gastos predefinidos (mazmorras, misiones…) que se aplican con un clic. Los gastos se pueden deshacer.
- Planificador: muestra cuántas veces puedes hacer cada actividad hoy y cuánto falta para la siguiente meta.
- Temporizadores personalizados, modo compacto y atajos de teclado.
- Logros, estadísticas y gráficas.
- Exportar e importar datos en JSON.

**Comunidad y legión**
- Puedes crear una legión o unirte a una con un **código de invitación**. El líder puede renovar el código, expulsar miembros, renombrar la legión o disolverla.
- Perfil con nombre, personaje principal, servidor, facción y frase. El título de tu legión aparece debajo de tu nombre.
- Calendario, muro y ranking. Solo ves los de **tu** legión.
- «Busco grupo» para encontrar compañeros (solo en la versión artifact, que tiene salas en tiempo real).
- **Amigos, chat en vivo y búsqueda de perfiles** (solo versión web): busca jugadores por nombre, envía solicitudes, chatea en tiempo real con tus amigos e invítalos a grupo. Cada uno decide si aparece en la búsqueda y si comparte su energía.

**Interfaz**
- Barra de navegación a cualquier ancho de pantalla.
- Idiomas: español, inglés, italiano y portugués. En las pantallas de cuenta (login, registro…) hay un menú hamburguesa con banderas para cambiar de idioma, y la elección se mantiene al entrar.
- Orbe animado en 3D (three.js).

## Dos versiones, un mismo código

| | Versión artifact | Versión web |
|---|---|---|
| Dónde corre | Dentro de claude.ai | Servidor propio (Render) |
| Cuentas | Las de claude.ai | Correo + contraseña |
| Datos | API `window.claude` del artifact | API REST + PostgreSQL |
| Asistente IA y «Busco grupo» | Sí | No (de momento) |

Las dos versiones comparten el mismo `index.html` y los mismos módulos. En la versión web, la compilación (`scripts/build-web.mjs`) hace lo siguiente:

1. Saca el CSS y el JS en línea a `app.css` y `app.js`. Así se puede aplicar una CSP estricta.
2. Sirve las fuentes y three.js desde el propio servidor, sin CDNs.
3. Carga `web/claude-shim.js`, un adaptador que reproduce la API `window.claude` de los artifacts usando `fetch` contra el servidor.
4. Carga `web/legion-api.js`. Las operaciones de legión pasan por endpoints del servidor que comprueban los permisos.

```
Navegador ──► index.html + app.js ──► claude-shim.js ──► /api/docs, /api/auth, /api/legions
                                                            │
                                               Fastify 5 (server/) ──► PostgreSQL
```

## Seguridad

Detrás del diseño hay un modelo de amenazas con 38 requisitos: [`docs/security/threat-model.md`](docs/security/threat-model.md). También hay una suite de ataques automatizada en `server/test/attacks/`. Lo principal:

- **Sesión con JWT en cookies seguras.**
  - El token de acceso es un JWT HS256 que dura 15 minutos y va en `__Host-odyle_at`, una cookie `HttpOnly`, `Secure` y `SameSite`.
  - El token de refresco es opaco, dura 30 días y va en `__Secure-odyle_rt`, con `Path=/api/auth`.
  - El token de refresco rota en cada uso y detecta reutilizaciones. Si alguien reutiliza uno, se revocan todas las sesiones.
  - **El JavaScript de la página nunca ve ningún token.**
- **XSS.**
  - CSP estricta, sin `unsafe-inline` y con `require-trusted-types-for 'script'` y `trusted-types 'none'`.
  - No se usa `innerHTML`: todo se pinta con `textContent` o con APIs del DOM.
  - El servidor valida los esquemas y rechaza caracteres de control y bidi.
- **CSRF.** Cada escritura exige que `Origin` coincida exactamente con `APP_ORIGIN`, la cabecera `X-Odyle-CSRF: 1` y `Content-Type: application/json`.
- **Contraseñas.**
  - Se guardan con Argon2id.
  - Se rechazan las contraseñas comunes.
  - Límite de intentos y bloqueo temporal.
  - El servidor hace como máximo 4 cálculos de Argon2 a la vez. Si se satura, responde 503 en lugar de caerse.
- **Enlaces de correo.**
  - Los tokens de verificación y de restablecimiento van en el fragmento de la URL (`#t=…`), así que nunca llegan a los logs ni al `Referer`.
  - Verificar la cuenta exige la contraseña con la que te registraste.
- **Datos.**
  - Reglas de acceso en el servidor para cada ruta.
  - Cuotas por usuario: 500 documentos y 2 MB.
  - Los códigos de legión se guardan como HMAC y cifrados con AES-GCM.
- **Cabeceras.** HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` y COOP/CORP mediante Helmet.

## Requisitos

- **Node.js 22** o superior
- **PostgreSQL 16** (solo para la versión web en producción; los tests usan `pg-mem` en memoria)
- Una cuenta de [Resend](https://resend.com) para enviar correos de verificación

## Puesta en marcha local

```bash
# 1. Dependencias
npm ci
cd server && npm ci && cd ..

# 2. Compilar la versión web (genera server/public/)
npm run build:web

# 3. Configurar las variables (ver la tabla más abajo) y arrancar
cd server
export APP_ORIGIN=http://localhost:3000
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
export CODE_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
export DATABASE_URL=postgres://usuario:clave@localhost:5432/odyle
export DATABASE_SSL=off
export RESEND_API_KEY=...   # tu clave; nunca la subas al repositorio
export MAIL_FROM=onboarding@resend.dev
export EMAIL_MODE=owner-only
npm start
```

Abre `http://localhost:3000`. El servidor aplica las migraciones al arrancar.

> Para la versión artifact no hace falta servidor: `index.html` se publica tal cual como artifact en claude.ai.

## Scripts y tests

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm test` | raíz | Tests unitarios de los módulos de la página |
| `npm run e2e` | raíz | E2E de la versión artifact con Playwright |
| `npm run build:web` | raíz | Compila la versión web en `server/public/` |
| `node dev/e2e-web.mjs` | raíz | E2E de la web completa: registro, login, legión, XSS, CSP, logout |
| `node --test` | `server/` | Tests del servidor y suite de ataques, con `pg-mem` |
| `bash scripts/test-pg.sh` | `server/` | Los mismos tests contra un PostgreSQL 16 real |

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `APP_ORIGIN` | Sí | Origen público exacto, p. ej. `https://odyle.onrender.com`. Se usa en el CSRF y en los enlaces de los correos. |
| `JWT_SECRET` | Sí | Secreto para firmar los JWT. Base64, 32 bytes como mínimo. |
| `CODE_KEY` | Sí | Clave para el HMAC y el cifrado de los códigos de legión. Base64, 32 bytes como mínimo. |
| `DATABASE_URL` | Sí | Cadena de conexión de PostgreSQL. |
| `RESEND_API_KEY` | Sí | Clave de la API de Resend. **Solo en el panel del proveedor, nunca en el código.** |
| `MAIL_FROM` | Sí | Remitente de los correos, p. ej. `onboarding@resend.dev`. |
| `EMAIL_MODE` | Sí | `owner-only`: sin dominio propio en Resend, solo llegan correos al dueño de la cuenta. `full`: con dominio verificado. |
| `DATABASE_SSL` | No | `verify` (por defecto), `require` u `off`. Usa `off` con la URL interna de Render. |
| `TRUST_PROXY_HOPS` | No | Número de proxies de confianza delante del servidor, de 1 a 10. Por defecto, 1. |
| `ADMIN_USER_ID` | No | Id del usuario administrador. Se rellena después de registrarte. |
| `NODE_ENV` | No | `production` en producción. |
| `PORT` | No | Puerto de escucha. Por defecto, 3000; Render lo asigna solo. |

## Despliegue en Render

1. **Base de datos:** crea un PostgreSQL. El plan gratuito no tiene copias de seguridad; para usuarios reales conviene un plan de pago.
2. **Servicio web** conectado a este repositorio:
   - **Root directory:** la raíz del repositorio
   - **Build command:** `npm ci --include=dev && npm run build:web && cd server && npm ci --include=dev`
   - **Start command:** `node server/src/index.js`
   - **Health check path:** `/api/health`
3. **Variables de entorno** (ver la tabla):
   - Genera `JWT_SECRET` y `CODE_KEY` con 32 bytes aleatorios en base64.
   - `DATABASE_URL`: la URL **interna** de la base de datos, con `DATABASE_SSL=off`.
   - `APP_ORIGIN`: la URL `https://….onrender.com` del servicio.
   - `NODE_ENV=production`, `EMAIL_MODE=owner-only` y `MAIL_FROM=onboarding@resend.dev`.
4. Después del primer despliegue, regístrate, copia tu id de usuario en `ADMIN_USER_ID` y vuelve a desplegar.

## Estructura del proyecto

```
├── index.html            # La página (CSS y JS en línea; se usa tal cual en el artifact)
├── *.js                  # Módulos: energía, planificador, legión, i18n, gráficas, orbe…
├── *.test.js             # Tests unitarios de los módulos
├── web/                  # Solo para la versión web
│   ├── claude-shim.js    #   Adaptador window.claude → API REST
│   ├── legion-api.js     #   Operaciones de legión contra el servidor
│   └── auth.html|js|css  #   Pantallas de login, registro, verificación y restablecimiento
├── scripts/build-web.mjs # Compilación de la versión web
├── dev/                  # Pruebas E2E con Playwright
├── server/
│   ├── src/              # Fastify: app, configuración, base de datos
│   │   ├── routes/       #   auth, docs, legions, pages
│   │   └── lib/          #   JWT, sesiones, contraseñas, CSRF, reglas, validación, correo
│   ├── migrations/       # SQL de PostgreSQL
│   └── test/             # Tests del servidor y suite de ataques (test/attacks/)
└── docs/                 # Planes, decisiones y modelo de amenazas
```

## Documentación

- [Modelo de amenazas](docs/security/threat-model.md)
- [Diseño del login y la web](docs/superpowers/specs/2026-10-11-web-auth-design.md)
- [Plan de la versión web](docs/superpowers/plans/2026-10-11-web-stage1.md)
- [Plan de legión y perfil](docs/2026-10-11-legion-profile-plan.md)
- [Decisiones del tracker](docs/2026-10-10-aion2-stamina-tracker-decisions.md)
