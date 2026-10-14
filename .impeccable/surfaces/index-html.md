---
version: 2
slug: "index-html"
primary_target: "index.html"
related_targets: ["web/auth.html", "web/social.css"]
---

# Surface brief: Odyle Tracker (web), Aion 2 por facciones

Scope: tracker de energía y pantallas sociales (Amigos, Chat, Buscar, Perfil de jugador) de la versión web. Escritorio y móvil por igual.
Mode: Operate. Build path: code-led. Sustituye la dirección «laca y nácar» (v1); la elección del usuario (2026-10-13) manda sobre la tirada.

## Direction contract

THESIS: La energía es éter. Cada personaje es un orbe con un anillo de 56 runas propias, una por cada +15 OD; el tope se ve antes que nada. El mundo es Aion 2 y cambia de cielo según el bando que elijas.

OWN-WORLD:
- Elyos (Luz): cielo al alba sobre islas flotantes. Fondo #EEF3F8, paneles #FFFFFF, texto #14213A / #4A5770, oro #A87A1E, celeste #2E6FB0, filetes de oro fino, urgente carmesí #B4232F. Orbe de luz dorada y celeste.
- Asmodian (Sombra): crepúsculo violeta del Abismo. Fondo #120D17, paneles #1D1524, texto #EDE6F2 / #B5A9C4, violeta #9B6BD6, plata #C9C3D6, filetes de plata fina, urgente carmesí #E0455A. Orbe violeta y carmesí.
- Cinzel para títulos y nombres, Figtree para texto, números tabulares.

STORY: El jugador ve quién está al tope o a punto, juega con ese personaje, gasta con un preset, mira eventos, y queda con sus amigos por chat para una mazmorra.

FIRST VIEWPORT: Cabecera con título, reloj de próxima recarga, botón Luz/Sombra y ficha de perfil; barra de pestañas (Personajes, Eventos, Estadísticas, Amigos, Chat, Buscar, Legión, Ajustes, Novedades) con insignias de no leídos y solicitudes; tarjetas de personaje con orbe y anillo de runas, número grande tabular.
Signature move: el anillo de 56 runas que se enciende con la energía y late en carmesí al tope.

CONSTRAINTS: Sitio de fans: nada de logos, arte ni iconos de NCSOFT. CSP estricta, sin innerHTML. El cambio de tema es instantáneo. Sin WebGL o con «reducir movimiento»: orbe plano en CSS con el mismo anillo en SVG, sin partículas ni animación.
