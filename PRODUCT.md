# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Any Aion 2 player, not only one legion. Typical user plays several characters (alts) and checks the page on PC (second screen / alt-tab while playing) and on phone equally, to decide what to spend Odyle energy on today and to coordinate with friends and legion.

## Product Purpose

Track **Odyle (OD) energy** for several Aion 2 characters in one place: current energy, live regeneration, time to full, daily/weekly resets and server events. Plan spending (presets, planner) and organize socially (legion, friends, chat, profiles). Success: a player opens the page and knows in seconds which character to play and what to do with its energy, without wasting energy at cap.

## Positioning

Fan-made, unofficial tool built around one mechanic: shared server ticks (+15 OD every 3 h, cap 840 per character). Manual entry, then the app counts forward. Combines the energy tracker with legion/social features in one page.

## Operating Context

- Used between game sessions and during play; glanced at quickly, so the most urgent fact (who is full / wasting energy, next tick) must read first.
- Two builds share one codebase: claude.ai artifact version and own web version (Fastify + PostgreSQL on Render, email/password accounts).
- Languages: Spanish, English, Italian, Portuguese.

## Capabilities and Constraints

Existing:
- Characters: name, class (Aion 2 classes), energy, time to full, "+ Extra", update, remove; animated 3D orb per character (three.js); compact and lite modes; keyboard shortcuts.
- Spending presets ("⚡ Gastos") with undo; planner (how many runs today, next goal); custom timers; server event list with countdowns; forecast chart; history; achievements and stats.
- Legion: create/join by invite code, leader tools (renew code, kick, rename, dissolve); calendar, wall, ranking, online presence; "Busco grupo" (artifact only).
- Profile: nickname, main character, server, faction (Elyos/Asmodian), bio.
- Account screens: login, register, verify email, reset password, language switcher with flags.
- Faction themes: Elyos (light) and Asmodian (dark) with a Luz/Sombra switch; 56-rune ring on every orb (1 rune = 15 OD).
- Export/import JSON; AI assistant panel (artifact only).

Built 2026-10-14 (requested 2026-10-13):
- **Friends section**: friend list, requests.
- **Friends chat**: live direct messages between friends.
- **Profile search**: find other players' profiles.

Technical constraints: strict CSP (no inline script, Trusted Types), no innerHTML; JS never sees auth tokens.

## Brand Commitments

- Name: "Odyle Tracker".
- Unofficial fan site: no NCSOFT logos or official art; icons and runes are original drawings; must show a "not official" notice.
- Future: own domain with donations (PayPal) or ads; needs privacy policy and cookie consent (EU).

## Evidence on Hand

- Current screens: `dev/screens/*.png`, `design/desktop.png`, `design/mobile.png`.
- No real user counts, testimonials or reviews exist; do not invent them.

## Product Principles

1. Urgent first: energy at cap or about to cap is the loudest thing on screen.
2. Glanceable on both PC and phone; no feature may require a desktop.
3. Social features serve play: friends, chat and legion exist to organize runs, not to be a social network.
4. Honest fan tool: no official branding, no fabricated proof.
