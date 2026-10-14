# «Acerca de», donaciones, política de privacidad y borrar cuenta — Diseño

_Fecha: 2026-10-15 · Estado: aprobado en conversación, pendiente de revisión escrita · Rama: `feat/acerca-privacidad` (desde `main`)_

## 1. Objetivo

Odyle Tracker tiene cuentas con correo, chat y perfiles, pero no tiene política de privacidad ni forma de borrar una cuenta.
Este cambio añade:
- la sección «Acerca de», con el botón de donaciones por PayPal;
- la página `/privacidad`;
- el botón «Borrar mi cuenta».

### Lo que decidió el usuario (2026-10-14/15)

| Tema | Decisión |
|---|---|
| Política | Solo política de privacidad, sin condiciones de uso |
| Donaciones | PayPal con enlace (sin SDK): `https://www.paypal.com/donate/?hosted_button_id=TDCGD3C8KHRAS` |
| Responsable | Luciano Labbozzetta |
| Contacto | `odyletracker@gmail.com` |
| Dónde | Sección nueva «Acerca de» en el menú; `/privacidad` enlazada también desde el registro |
| Borrar cuenta | Botón en el perfil, con la contraseña como confirmación |
| Mensajes al borrar | Se borran los enviados y los recibidos |
| Legión sin su dueño | Pasa al miembro más antiguo; si no queda nadie, se borra |

**Fuera:**
- condiciones de uso;
- aviso de cookies (no hace falta: solo hay cookies técnicas);
- SDK o botón JavaScript de PayPal;
- donaciones recurrentes;
- ventajas para quien dona.

## 2. Sección «Acerca de»

- **Navegación:** una entrada nueva del rail (`acerca`) con un icono propio de trazo, en `icons.js`. En móvil va dentro de la hoja «Más». El reparto de secciones de `layout.js` se actualiza para la web y para el artifact.
- **Contenido, en este orden:**
  1. **Qué es Odyle Tracker:** dos frases.
  2. **Aviso de fans:** «Sitio de fans no oficial, no afiliado a NCSOFT. Aion 2 es una marca de NCSOFT.»
  3. **Apoyar el proyecto:**
     - un enlace con aspecto de botón, «Donar con PayPal», con `href` al enlace de §1, `target="_blank"` y `rel="noopener noreferrer"`;
     - debajo, «Las donaciones ayudan a pagar el servidor. No dan ventajas ni funciones extra.»
  4. **Privacidad:** enlace a `/privacidad` y el correo de contacto (`mailto:`).
  5. **Créditos:**
     - letras Marcellus y Gothic A1 (SIL Open Font License);
     - three.js (licencia MIT);
     - «Iconos y runas originales de Odyle Tracker».
- **En el artifact de claude.ai:** se muestran 1, 2, 3 y 5. En lugar de 4 aparece «En esta versión los datos los guarda claude.ai.» y un enlace a la política de la web en `https://odyle-tracker.onrender.com/privacidad`.
- **Estilo:** igual que el resto (Carta celeste); los tokens del tema decidirán colores y bordes.
- **Constantes:** la URL de PayPal, el correo y el nombre del responsable viven en un único módulo pequeño (`about.js`) que usan la sección y la página de privacidad.
- **Textos:** se traducen al inglés, italiano y portugués.

## 3. Página `/privacidad`

- **Tipo de página:** página estática nueva, servida como `/login` (cabeceras `no-referrer`, la misma CSP estricta, sin JavaScript en línea). Lleva el diseño neutro de las páginas de cuenta (`auth.css`), se puede leer sin sesión y tiene selector de idioma (es, en, it, pt), con la misma preferencia `odyle-lang`.
- **Enlaces:** desde «Acerca de», desde el pie del formulario de registro («Al crear la cuenta aceptas la política de privacidad») y desde el login.
- **Contenido** (texto completo en los cuatro idiomas):
  1. **Responsable:**
     - Luciano Labbozzetta, `odyletracker@gmail.com`;
     - el sitio es un proyecto de fans sin ánimo de lucro.
  2. **Datos que se guardan:**
     - correo y contraseña (cifrada, nunca en claro);
     - el navegador (user agent) de cada sesión iniciada;
     - personajes, ajustes, tareas y estadísticas;
     - perfil público;
     - amigos, solicitudes y bloqueos;
     - mensajes de chat;
     - sugerencias;
     - reportes;
     - datos de la legión.
  3. **Para qué:** solo para prestar el servicio. Sin anuncios, sin estadísticas de terceros, sin venta ni cesión de datos.
  4. **Base legal:** la ejecución del servicio que la persona pide al crear la cuenta (art. 6.1.b RGPD).
  5. **Encargados del tratamiento:**
     - Render (alojamiento y base de datos, Frankfurt, UE);
     - Resend (envío de correos de verificación y de contraseña; puede implicar transferencias a EE. UU. con las garantías del proveedor).
     - PayPal solo trata datos si alguien dona, bajo su propia política.
     - Las letras se sirven desde el propio sitio.
  6. **Conservación:**
     - los mensajes de chat se borran solos al cumplir 1 año;
     - el resto, hasta que se borra la cuenta.
  7. **Cookies y almacenamiento:**
     - solo cookies técnicas de sesión, imprescindibles para iniciar sesión;
     - preferencias guardadas en el navegador (idioma, tema, sección abierta);
     - no hay cookies de seguimiento.
  8. **Derechos:**
     - acceso y portabilidad (botón «Exportar» en Ajustes, o por correo);
     - rectificación (editando el perfil y los personajes);
     - supresión (botón «Borrar mi cuenta»);
     - oposición y limitación (por correo);
     - reclamación ante la autoridad de protección de datos del país de residencia.
  9. **Menores:** el servicio no está dirigido a menores de 14 años.
  10. **Cambios:** se publica la nueva versión con su fecha.
  11. **Fecha de la última actualización.**

## 4. Borrar mi cuenta

### Interfaz
- **Dónde:** al final del perfil propio hay una zona «Borrar mi cuenta», separada del resto y con el tono de peligro.
- **Ventana de confirmación** (un `<dialog>`):
  - explica qué se borra y que no se puede deshacer;
  - pide la contraseña;
  - tiene los botones «Borrar para siempre» (peligro) y «Cancelar»;
  - mantiene el foco dentro y se cierra con Escape.
- **Errores:**
  - contraseña incorrecta: se queda abierta y muestra «Contraseña incorrecta»;
  - fallo del servidor: se queda abierta y muestra «No se pudo borrar ahora; inténtalo más tarde».
- **Al terminar:** se va a `/login?borrada=1`, donde se muestra «Tu cuenta se ha borrado».
- **En el artifact:** el botón no existe, porque no hay cuentas.

### Servidor: `POST /api/auth/delete-account`
- **Acceso:** requiere sesión y la protección CSRF de siempre. Tiene el mismo límite de intentos que el login.
- **Cuerpo:** `{ password }`. Si la contraseña no coincide, responde 401 con el error de credenciales de siempre y no borra nada.
- **En una sola transacción:**
  1. Si el usuario es dueño de una legión, la legión pasa al miembro más antiguo (el que entró antes, según el dato de alta disponible y, si no hay, el orden de alta del documento). Si no queda ningún otro miembro, se borran la legión, sus datos y sus códigos de invitación.
  2. Se borran todos los documentos del usuario: `members/<uid>` y todo lo que cuelga de él, como personajes, ajustes, eventos, CP, progreso, perfil y sugerencias (`feedback/<uid>`).
  3. Se borra la fila de `users`. Las claves foráneas `on delete cascade` borran sesiones (`refresh_tokens`), tokens de correo, amistades, bloqueos, mensajes enviados y recibidos, y reportes hechos y recibidos.
- **Respuesta:** borra las cookies de sesión (las mismas que el logout) y responde 200 `{ ok: true }`.
- **En vivo:** las conexiones abiertas del usuario se cierran. Sus amigos dejan de verlo en «En línea» con el mecanismo de presencia de siempre.

## 5. Seguridad, accesibilidad y estilo

- CSP estricta y Trusted Types sin cambios: sin `innerHTML`, `setTimeout` solo con funciones flecha.
- `/privacidad` no carga nada externo.
- Los enlaces externos llevan `rel="noopener noreferrer"`.
- El correo del usuario no se envía a ningún servicio nuevo.
- Objetivos táctiles de 44 px.
- El diálogo es accesible: tiene título, descripción y foco gestionado.
- Los textos nuevos están traducidos.

## 6. Pruebas

- **Unitarias:**
  - `layout.js` incluye `acerca` en la web y en el artifact;
  - `about.js` exporta la URL de PayPal (https, `paypal.com`), el correo y el nombre.
- **Servidor:**
  - contraseña incorrecta → 401 y nada borrado;
  - sin sesión → 401;
  - sin CSRF → rechazado;
  - con contraseña correcta, después no queda nada del usuario: users, refresh_tokens, docs `members/<uid>…`, `feedback/<uid>`, amistades, bloqueos, mensajes y reportes;
  - el dueño de una legión con miembros la deja al más antiguo;
  - el dueño solo borra la legión y sus códigos;
  - límite de intentos.
- **Páginas:** `/privacidad` da 200 con la CSP exacta, `no-referrer` y sin scripts en línea, y contiene el nombre del responsable y el correo.
- **E2E:**
  - «Acerca de» se abre desde el rail (1280 px) y desde «Más» (390 px);
  - el enlace de PayPal tiene `target=_blank` y `rel` correctos;
  - `/privacidad` se ve sin sesión y cambia de idioma;
  - el registro enlaza a la política;
  - borrar una cuenta de prueba con contraseña incorrecta no borra; con la correcta se llega a `/login?borrada=1` y ya no se puede iniciar sesión.

## 7. Orden de trabajo

1. `about.js` y la sección «Acerca de» (web y artifact), con su icono y sus traducciones.
2. Página `/privacidad` (HTML, textos en 4 idiomas, ruta del servidor) y enlaces desde el registro y el login.
3. Endpoint `delete-account` con traspaso de legión, y sus pruebas.
4. Botón y diálogo «Borrar mi cuenta» en el perfil, y aviso en `/login`.
5. E2E y `DESIGN.md`.
